from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.warp import reproject


MASTER_GRID = {
    "grid_spec_id": "KOR_100M_EPSG5179_V1",
    "crs": "EPSG:5179",
    "pixel_size": 100.0,
    "xmin": 745900.0,
    "ymin": 1457900.0,
    "xmax": 1302800.0,
    "ymax": 2068600.0,
    "width": 5569,
    "height": 6107,
    "nodata": -9999.0,
}

PERIODS = [
    ("2026", 2026, 2026),
    ("2027", 2027, 2027),
    ("2028", 2028, 2028),
    ("2029", 2029, 2029),
    ("2030", 2030, 2030),
    ("2040", 2031, 2040),
    ("2050", 2041, 2050),
    ("2060", 2051, 2060),
    ("2070", 2061, 2070),
    ("2080", 2071, 2080),
    ("2090", 2081, 2090),
    ("2100", 2091, 2100),
]

INDICATORS = {
    "H04": {
        "name": "폭염일수",
        "variable": "HW33",
        "slug": "hw33",
        "source_label": "number of heat wave days",
        "resampling": "nearest",
    },
    "H05": {
        "name": "열대야일수",
        "variable": "TR25",
        "slug": "tr25",
        "source_label": "number of tropical nights",
        "resampling": "nearest",
    },
    "H06": {
        "name": "온난일 계속기간",
        "variable": "WSDI",
        "slug": "wsdi",
        "source_label": "warm spell duration index",
        "resampling": "nearest",
    },
    "H07": {
        "name": "일최고기온 연최대",
        "variable": "TXx",
        "slug": "txx",
        "source_label": "annual maximum value of daily maximum temperature",
        "resampling": "bilinear",
    },
    "H08": {
        "name": "온난일",
        "variable": "TX90P",
        "slug": "tx90p",
        "source_label": "number of warm days above the 90th percentile",
        "resampling": "nearest",
    },
    "H09": {
        "name": "최대온난일 계속기간",
        "variable": "WSDIx",
        "slug": "wsdix",
        "source_label": "maximum consecutive warm days above the 90th percentile",
        "resampling": "nearest",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Aggregate official KMA AR6 SSP yearly extreme-climate indices and "
            "align them to Master Grid v1."
        )
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--indicator", required=True, choices=sorted(INDICATORS))
    parser.add_argument(
        "--scenario",
        required=True,
        choices=["ssp126", "ssp245", "ssp370", "ssp585"],
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--scope",
        choices=["test", "national"],
        default="test",
        help="Use 'national' for the complete Master Grid v1 base layer.",
    )
    parser.add_argument(
        "--bounds",
        nargs=4,
        type=float,
        metavar=("XMIN", "YMIN", "XMAX", "YMAX"),
        help="Optional EPSG:5179 bounds aligned to Master Grid v1.",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def target_grid(bounds: list[float]) -> tuple[Affine, int, int]:
    xmin, ymin, xmax, ymax = bounds
    if not (
        MASTER_GRID["xmin"] <= xmin < xmax <= MASTER_GRID["xmax"]
        and MASTER_GRID["ymin"] <= ymin < ymax <= MASTER_GRID["ymax"]
    ):
        raise ValueError("Target bounds must stay inside Master Grid v1.")

    pixel = MASTER_GRID["pixel_size"]
    offsets = (
        (xmin - MASTER_GRID["xmin"]) / pixel,
        (MASTER_GRID["ymax"] - ymax) / pixel,
        (xmax - xmin) / pixel,
        (ymax - ymin) / pixel,
    )
    if any(abs(value - round(value)) > 1e-9 for value in offsets):
        raise ValueError("Target bounds must align exactly to the 100 m master grid.")

    width = int(round((xmax - xmin) / pixel))
    height = int(round((ymax - ymin) / pixel))
    transform = Affine(pixel, 0.0, xmin, 0.0, -pixel, ymax)
    return transform, width, height


def parse_years(source: rasterio.io.DatasetReader, variable: str) -> np.ndarray:
    tags = source.tags()
    if source.count != 80:
        raise ValueError(f"Expected 80 yearly bands, got {source.count}.")
    if tags.get("time#units") != "yearly since 2021-01-01":
        raise ValueError(f"Unexpected time units: {tags.get('time#units')}")
    if tags.get("time#calendar") != "gregorian":
        raise ValueError(f"Unexpected calendar: {tags.get('time#calendar')}")

    years = np.arange(2021, 2101, dtype=np.int32)
    for band_index, expected_offset in enumerate(range(80), start=1):
        band_tags = source.tags(band_index)
        if band_tags.get("NETCDF_VARNAME") != variable:
            raise ValueError(
                f"Band {band_index} variable is {band_tags.get('NETCDF_VARNAME')}, "
                f"expected {variable}."
            )
        if int(band_tags.get("NETCDF_DIM_time", "-1")) != expected_offset:
            raise ValueError(f"Unexpected time offset in band {band_index}.")
    return years


def aggregate_period(
    source: rasterio.io.DatasetReader,
    band_indices: list[int],
) -> tuple[np.ndarray, dict[str, float | int | None]]:
    data = source.read(band_indices, masked=True).astype(np.float32)
    aggregated = np.ma.mean(data, axis=0, dtype=np.float64).filled(np.nan).astype(np.float32)
    valid = np.isfinite(aggregated)
    selected = aggregated[valid]
    stats: dict[str, float | int | None] = {
        "valid_cell_count": int(valid.sum()),
        "missing_cell_count": int(valid.size - valid.sum()),
        "missing_rate": float(1.0 - valid.mean()),
        "min": float(selected.min()) if selected.size else None,
        "max": float(selected.max()) if selected.size else None,
        "mean": float(selected.mean()) if selected.size else None,
    }
    return aggregated, stats


def write_output(
    *,
    destination: np.ndarray,
    output_path: Path,
    transform: Affine,
    source_path: Path,
    source_checksum: str,
    scenario: str,
    period_label: str,
    period_start: int,
    period_end: int,
    bounds: list[float],
    unit: str,
    source_stats: dict[str, float | int | None],
    scope: str,
    indicator: dict[str, str],
    indicator_id: str,
) -> dict[str, object]:
    nodata = np.float32(MASTER_GRID["nodata"])
    valid_output = destination != nodata
    selected = destination[valid_output]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    quality_status = (
        "NATIONAL_MASTER_GRID_COMPLETE_MASK_PENDING"
        if scope == "national"
        else "TEST_WINDOW_REGRID_COMPLETE"
    )
    spatial_scope = "national_master_grid" if scope == "national" else "test_window"
    notes = (
        "Nationwide Master Grid base layer. Preserve this raster and derive study-area "
        "products with a separately versioned mask. 100m alignment does not add spatial "
        "detail beyond the official 1km source."
        if scope == "national"
        else "100m analysis-grid alignment does not add spatial detail beyond the official 1km source."
    )

    with rasterio.open(
        output_path,
        "w",
        driver="GTiff",
        width=destination.shape[1],
        height=destination.shape[0],
        count=1,
        dtype="float32",
        crs=MASTER_GRID["crs"],
        transform=transform,
        nodata=float(nodata),
        tiled=True,
        blockxsize=256,
        blockysize=256,
        compress="LZW",
        predictor=3,
        BIGTIFF="IF_SAFER",
    ) as target:
        target.write(destination, 1)
        target.set_band_description(1, f"{indicator_id} scenario {indicator['source_label']}")
        target.update_tags(
            indicator_id=indicator_id,
            indicator_name=indicator["name"],
            source_variable=indicator["variable"],
            grid_spec_id=MASTER_GRID["grid_spec_id"],
            observed_or_scenario="scenario",
            scenario=scenario,
            period_label=period_label,
            period_start=str(period_start),
            period_end=str(period_end),
            source_resolution="1km",
            analysis_resolution="100m",
            resampling_method=indicator["resampling"],
            unit=unit,
            source_file=source_path.name,
            spatial_scope=spatial_scope,
            mask_status="MASK_PENDING_DOWNSTREAM",
            quality_status=quality_status,
        )

    metadata: dict[str, object] = {
        "indicator_id": indicator_id,
        "indicator_name": indicator["name"],
        "period_label": period_label,
        "period_start": period_start,
        "period_end": period_end,
        "observed_or_scenario": "scenario",
        "scenario": scenario,
        "source_agency": "Korea Meteorological Administration / National Institute of Meteorological Sciences",
        "source_dataset": (
            "KMA AR6 SSP 5ENSMN South Korea 1km yearly extreme-climate index: "
            f"{indicator['source_label']}"
        ),
        "source_variable": indicator["variable"],
        "source_file": str(source_path.resolve()),
        "source_checksum_sha256": source_checksum,
        "source_resolution": "1km",
        "analysis_resolution": "100m",
        "spatial_scope": spatial_scope,
        "mask_status": "MASK_PENDING_DOWNSTREAM",
        "output_file": str(output_path.resolve()),
        "output_checksum_sha256": sha256(output_path),
        "grid_spec_id": MASTER_GRID["grid_spec_id"],
        "source_crs": "EPSG:4326",
        "output_crs": MASTER_GRID["crs"],
        "transform": list(transform)[:6],
        "bounds": bounds,
        "width": int(destination.shape[1]),
        "height": int(destination.shape[0]),
        "nodata": float(nodata),
        "dtype": "float32",
        "unit": unit,
        "temporal_resolution": "yearly source; single-year or decadal mean output",
        "aggregation_method": (
            "single yearly value"
            if period_start == period_end
            else "arithmetic mean of yearly values"
        ),
        "spatial_method": (
            f"{indicator['resampling']} reprojection and alignment to Master Grid v1"
        ),
        "source_statistics": source_stats,
        "valid_cell_count": int(valid_output.sum()),
        "missing_cell_count": int(valid_output.size - valid_output.sum()),
        "missing_rate": float(1.0 - valid_output.mean()),
        "min": float(selected.min()) if selected.size else None,
        "max": float(selected.max()) if selected.size else None,
        "mean": float(selected.mean()) if selected.size else None,
        "quality_status": quality_status,
        "test_only": scope != "national",
        "notes": notes,
    }
    output_path.with_suffix(".metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metadata


def main() -> None:
    args = parse_args()
    indicator = INDICATORS[args.indicator]
    master_bounds = [
        MASTER_GRID["xmin"],
        MASTER_GRID["ymin"],
        MASTER_GRID["xmax"],
        MASTER_GRID["ymax"],
    ]
    if args.scope == "national":
        if args.bounds is not None and [float(value) for value in args.bounds] != master_bounds:
            raise ValueError("National scope must use the complete Master Grid v1 bounds.")
        bounds = master_bounds
    else:
        if args.bounds is None:
            raise ValueError("Test scope requires --bounds.")
        bounds = [float(value) for value in args.bounds]

    target_transform, width, height = target_grid(bounds)
    nodata = np.float32(MASTER_GRID["nodata"])
    source_checksum = sha256(args.source)
    manifest: list[dict[str, object]] = []

    with rasterio.open(args.source) as source:
        if source.width != 751 or source.height != 601:
            raise ValueError(f"Unexpected source grid: {source.width}x{source.height}.")
        if source.transform != Affine(0.01, 0.0, 124.495, 0.0, -0.01, 39.005):
            raise ValueError(f"Unexpected source transform: {source.transform}.")
        years = parse_years(source, indicator["variable"])
        unit = source.tags(1).get("units", "")
        if unit not in {"day", "degC"}:
            raise ValueError(f"Unexpected source unit: {unit}")
        expected_unit = "degC" if args.indicator == "H07" else "day"
        if unit != expected_unit:
            raise ValueError(f"{args.indicator} expected {expected_unit}, got {unit}.")

        resampling = (
            Resampling.bilinear
            if indicator["resampling"] == "bilinear"
            else Resampling.nearest
        )
        for period_label, period_start, period_end in PERIODS:
            year_indices = np.where((years >= period_start) & (years <= period_end))[0]
            expected_count = period_end - period_start + 1
            if year_indices.size != expected_count:
                raise ValueError(
                    f"Period {period_label} expected {expected_count} yearly values, "
                    f"got {year_indices.size}."
                )
            band_indices = (year_indices + 1).tolist()
            aggregated, source_stats = aggregate_period(source, band_indices)
            source_values = np.full(aggregated.shape, nodata, dtype=np.float32)
            valid_source = np.isfinite(aggregated)
            source_values[valid_source] = aggregated[valid_source]
            destination = np.full((height, width), nodata, dtype=np.float32)

            reproject(
                source=source_values,
                destination=destination,
                src_transform=source.transform,
                src_crs=CRS.from_epsg(4326),
                src_nodata=float(nodata),
                dst_transform=target_transform,
                dst_crs=CRS.from_epsg(5179),
                dst_nodata=float(nodata),
                resampling=resampling,
                num_threads=2,
                warp_mem_limit=512,
            )

            scope_suffix = "national" if args.scope == "national" else "test_seoul"
            output_path = args.output_dir / (
                f"{args.indicator.lower()}_{indicator['slug']}_{args.scenario}_"
                f"{period_label}_100m_{scope_suffix}.tif"
            )
            manifest.append(
                write_output(
                    destination=destination,
                    output_path=output_path,
                    transform=target_transform,
                    source_path=args.source,
                    source_checksum=source_checksum,
                    scenario=args.scenario,
                    period_label=period_label,
                    period_start=period_start,
                    period_end=period_end,
                    bounds=bounds,
                    unit=unit,
                    source_stats=source_stats,
                    scope=args.scope,
                    indicator=indicator,
                    indicator_id=args.indicator,
                )
            )

    manifest_scope = "national" if args.scope == "national" else "test"
    manifest_path = args.output_dir / (
        f"{args.indicator.lower()}_{args.scenario}_{manifest_scope}_manifest.json"
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "indicator": args.indicator,
                "scenario": args.scenario,
                "source": str(args.source.resolve()),
                "output_dir": str(args.output_dir.resolve()),
                "output_count": len(manifest),
                "manifest": str(manifest_path.resolve()),
                "spatial_scope": (
                    "national_master_grid" if args.scope == "national" else "test_window"
                ),
                "mask_status": "MASK_PENDING_DOWNSTREAM",
                "quality_status": (
                    "NATIONAL_MASTER_GRID_COMPLETE_MASK_PENDING"
                    if args.scope == "national"
                    else "TEST_WINDOW_REGRID_COMPLETE"
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
