#!/usr/bin/env python3
"""Interpolate complete 2021-2025 ASOS station indicators to the national 100m analysis grid."""

from __future__ import annotations

import argparse
import hashlib
import json
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as transform_coordinates


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "static/analysis-data/national-observed-heat/kma-asos-aws-indicators-2021-2025.json"
DEFAULT_PERCENTILE_INPUT = PROJECT_ROOT / "static/analysis-data/national-observed-heat/kma-asos-aws-indicators-2021-2025-with-baseline.json"
DEFAULT_REFERENCE = PROJECT_ROOT / "data/processed/hazard/H01/observed/2021-2025/h01_ta_avg_2021_2025_mean_100m_national.tif"

CORE_INDICATORS = {
    "H02": ("h02_mean_daily_max_c", "평균최고기온", "tamax", "℃"),
    "H03": ("h03_mean_daily_min_c", "평균최저기온", "tamin", "℃"),
    "H04": ("h04_heatwave_days", "폭염일수", "hw33", "일"),
    "H05": ("h05_tropical_nights", "열대야일수", "tr25", "일"),
    "H07": ("h07_annual_max_daily_max_c", "일최고기온 연최대 TXx", "txx", "℃"),
}

PERCENTILE_INDICATORS = {
    "H06": ("h06_wsdi_days", "온난일 계속기간 WSDI", "wsdi", "일"),
    "H08": ("h08_tx90p_days", "온난일 TX90P", "tx90p", "일"),
    "H09": ("h09_maximum_warm_spell_days", "최대 온난일 계속기간 WSDIx", "wsdix", "일"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    parser.add_argument("--indicator-set", choices=("core", "percentile"), default="core")
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    parser.add_argument("--neighbors", type=int, default=8)
    parser.add_argument("--block-rows", type=int, default=16)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def complete_station_means(document: dict, indicators: dict, indicator_set: str) -> tuple[list[dict], np.ndarray]:
    groups: dict[int, list[dict]] = {}
    for row in document["station_years"]:
        if row.get("network") != "ASOS":
            continue
        if indicator_set == "core" and row.get("quality_status") != "PASS":
            continue
        if indicator_set == "percentile" and row.get("percentile_baseline_status") != "PASS":
            continue
        groups.setdefault(int(row["station_id"]), []).append(row)

    stations = []
    values = []
    for station_id, rows in sorted(groups.items()):
        by_year = {int(row["year"]): row for row in rows}
        if set(by_year) != set(range(2021, 2026)):
            continue
        ordered = [by_year[year] for year in range(2021, 2026)]
        station_values = []
        for field, *_ in indicators.values():
            samples = [float(row[field]) for row in ordered if row.get(field) is not None]
            if len(samples) != 5:
                break
            station_values.append(float(np.mean(samples)))
        if len(station_values) != len(indicators):
            continue
        stations.append({
            "station_id": station_id,
            "longitude": float(ordered[0]["longitude"]),
            "latitude": float(ordered[0]["latitude"]),
            "elevation_m": ordered[0].get("elevation_m"),
        })
        values.append(station_values)

    return stations, np.asarray(values, dtype=np.float64)


def output_path(indicator_id: str, variable: str) -> Path:
    directory = PROJECT_ROOT / f"data/processed/hazard/{indicator_id}/observed/2021-2025"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{indicator_id.lower()}_{variable}_2021_2025_mean_100m_national.tif"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> None:
    args = parse_args()
    indicators = CORE_INDICATORS if args.indicator_set == "core" else PERCENTILE_INDICATORS
    input_path = args.input or (DEFAULT_INPUT if args.indicator_set == "core" else DEFAULT_PERCENTILE_INPUT)
    document = json.loads(input_path.read_text(encoding="utf-8"))
    stations, station_values = complete_station_means(document, indicators, args.indicator_set)
    minimum_stations = 80 if args.indicator_set == "core" else 30
    if len(stations) < minimum_stations:
        raise RuntimeError(f"Expected at least {minimum_stations} complete ASOS stations, found {len(stations)}")

    longitudes = [station["longitude"] for station in stations]
    latitudes = [station["latitude"] for station in stations]
    station_x, station_y = transform_coordinates("EPSG:4326", "EPSG:5179", longitudes, latitudes)
    station_points = np.column_stack((station_x, station_y)).astype(np.float64)
    station_norm = np.sum(station_points * station_points, axis=1)

    with rasterio.open(args.reference) as reference:
        if reference.crs.to_epsg() != 5179 or abs(reference.transform.a) != 100 or abs(reference.transform.e) != 100:
            raise RuntimeError("Reference raster is not the EPSG:5179 national 100m grid")
        summary = {
            "stations": len(stations),
            "indicator_set": args.indicator_set,
            "indicators": list(indicators),
            "grid": {"width": reference.width, "height": reference.height, "crs": str(reference.crs), "resolution": "100m"},
            "reference": str(args.reference),
        }
        if args.dry_run:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return

        neighbors = max(1, min(int(args.neighbors), len(stations)))
        nodata = -9999.0
        profile = reference.profile.copy()
        profile.update(
            driver="GTiff",
            dtype="float32",
            count=1,
            nodata=nodata,
            compress="deflate",
            predictor=3,
            tiled=True,
            blockxsize=512,
            blockysize=512,
            BIGTIFF="IF_SAFER",
        )

        paths = [output_path(indicator_id, definition[2]) for indicator_id, definition in indicators.items()]
        stats = [{"min": np.inf, "max": -np.inf, "sum": 0.0, "count": 0} for _ in indicators]
        with ExitStack() as stack:
            targets = [stack.enter_context(rasterio.open(path, "w", **profile)) for path in paths]
            for row_start in range(0, reference.height, int(args.block_rows)):
                row_count = min(int(args.block_rows), reference.height - row_start)
                window = rasterio.windows.Window(0, row_start, reference.width, row_count)
                reference_values = reference.read(1, window=window)
                valid = np.isfinite(reference_values) & (reference_values != reference.nodata)
                output_blocks = [np.full((row_count, reference.width), nodata, dtype=np.float32) for _ in indicators]

                valid_rows, valid_columns = np.nonzero(valid)
                if valid_rows.size:
                    global_rows = valid_rows + row_start
                    x = reference.transform.c + (valid_columns + 0.5) * reference.transform.a
                    y = reference.transform.f + (global_rows + 0.5) * reference.transform.e
                    points = np.column_stack((x, y)).astype(np.float64)
                    distance_squared = points @ station_points.T
                    distance_squared *= -2.0
                    distance_squared += np.sum(points * points, axis=1)[:, None]
                    distance_squared += station_norm[None, :]
                    np.maximum(distance_squared, 0.01, out=distance_squared)
                    nearest = np.argpartition(distance_squared, neighbors - 1, axis=1)[:, :neighbors]
                    nearest_distance = np.take_along_axis(distance_squared, nearest, axis=1)
                    weights = 1.0 / nearest_distance
                    weights /= np.sum(weights, axis=1, keepdims=True)
                    selected_values = station_values[nearest]
                    interpolated = np.sum(selected_values * weights[:, :, None], axis=1)

                    for index, block in enumerate(output_blocks):
                        values = interpolated[:, index].astype(np.float32)
                        block[valid_rows, valid_columns] = values
                        item = stats[index]
                        item["min"] = min(item["min"], float(np.min(values)))
                        item["max"] = max(item["max"], float(np.max(values)))
                        item["sum"] += float(np.sum(values, dtype=np.float64))
                        item["count"] += int(values.size)

                for target, block in zip(targets, output_blocks):
                    target.write(block, 1, window=window)
                if row_start % (int(args.block_rows) * 40) == 0:
                    print(f"rows {row_start:,}/{reference.height:,}", flush=True)

    generated_at = datetime.now(timezone.utc).isoformat()
    station_ids = [station["station_id"] for station in stations]
    for (indicator_id, (_, name, variable, unit)), path, item in zip(indicators.items(), paths, stats):
        metadata = {
            "indicator_id": indicator_id,
            "indicator_name": name,
            "observed_or_scenario": "observed",
            "period": "2021-2025",
            "years": [2021, 2022, 2023, 2024, 2025],
            "source_resolution": "Point (ASOS station network)",
            "analysis_resolution": "100m",
            "grid_spec_id": "KOR_100M_EPSG5179_V1",
            "unit": unit,
            "aggregation": "mean_of_complete_station_year_indicators_then_idw",
            "spatial_model": {"method": "IDW", "power": 2, "nearest_stations": neighbors},
            "spatial_detail_note": "Point observations interpolated onto a 100m analysis grid; this does not create 100m source detail.",
            "baseline_period": "1991-2020" if args.indicator_set == "percentile" else None,
            "baseline_quality_rule": "ASOS stations with percentile_baseline_status PASS and all five observed years" if args.indicator_set == "percentile" else None,
            "density_caution": "Only 34 ASOS stations passed the 30-year percentile baseline rule; use as a national screening surface, not urban-block source detail." if args.indicator_set == "percentile" else None,
            "station_count": len(stations),
            "station_ids": station_ids,
            "reference_mask": str(args.reference),
            "width": profile["width"],
            "height": profile["height"],
            "transform": list(profile["transform"])[:6],
            "nodata": nodata,
            "valid_cell_count": item["count"],
            "missing_cell_count": profile["width"] * profile["height"] - item["count"],
            "min": item["min"],
            "max": item["max"],
            "mean": item["sum"] / item["count"],
            "quality_status": "GRID_QA_COMPLETE_ASOS_BASELINE_IDW_V1" if args.indicator_set == "percentile" else "GRID_QA_COMPLETE_ASOS_IDW_V1",
            "output": str(path),
            "output_size_bytes": path.stat().st_size,
            "output_checksum_sha256": sha256(path),
            "generated_at": generated_at,
        }
        path.with_suffix(".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"indicator": indicator_id, "output": str(path), "mean": metadata["mean"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
