from __future__ import annotations

import hashlib
import json
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio


YEARS = tuple(range(2021, 2026))
NODATA = -9999.0
MASTER_GRID = {
    "grid_spec_id": "KOR_100M_EPSG5179_V1",
    "crs": "EPSG:5179",
    "width": 5569,
    "height": 6107,
    "transform": [100.0, 0.0, 745900.0, 0.0, -100.0, 2068600.0],
    "analysis_resolution": "100m",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def validate_grid(dataset: rasterio.DatasetReader, path: Path) -> None:
    transform = list(dataset.transform)[:6]
    expected = MASTER_GRID["transform"]
    if dataset.width != MASTER_GRID["width"] or dataset.height != MASTER_GRID["height"]:
        raise ValueError(f"Grid size mismatch: {path}")
    if str(dataset.crs) != MASTER_GRID["crs"]:
        raise ValueError(f"CRS mismatch: {path}")
    if any(abs(actual - target) > 1e-6 for actual, target in zip(transform, expected)):
        raise ValueError(f"Transform mismatch: {path}")
    if dataset.nodata != NODATA:
        raise ValueError(f"NoData mismatch: {path}")


def input_entry(year: int, path: Path) -> dict[str, object]:
    with rasterio.open(path) as source:
        validate_grid(source, path)
    return {
        "year": year,
        "path": str(path.resolve()),
        "size_bytes": path.stat().st_size,
        "checksum_sha256": sha256(path),
    }


def aggregate_mean(
    indicator_id: str,
    name: str,
    unit: str,
    source_resolution: str,
    inputs: list[tuple[int, Path]],
    output: Path,
    extra_tags: dict[str, str],
) -> dict[str, object]:
    if [year for year, _ in inputs] != list(YEARS):
        raise ValueError(f"{indicator_id} requires one input for every year in 2021-2025.")
    for _, path in inputs:
        if not path.exists():
            raise FileNotFoundError(path)

    output.parent.mkdir(parents=True, exist_ok=True)
    valid_cells = 0
    total = 0.0
    minimum = float("inf")
    maximum = float("-inf")

    with ExitStack() as stack:
        sources = [stack.enter_context(rasterio.open(path)) for _, path in inputs]
        for source, (_, path) in zip(sources, inputs):
            validate_grid(source, path)
        profile = sources[0].profile.copy()
        profile.update(
            driver="GTiff",
            dtype="float32",
            count=1,
            nodata=NODATA,
            tiled=True,
            blockxsize=256,
            blockysize=256,
            compress="LZW",
            predictor=3,
        )
        with rasterio.open(output, "w", **profile) as target:
            target.set_band_description(1, f"{indicator_id} {name} 2021-2025 mean")
            target.update_tags(
                indicator_id=indicator_id,
                indicator_name=name,
                observed_or_scenario="observed",
                observation_period="2021-2025",
                temporal_aggregation="mean_of_annual_layers",
                grid_spec_id=MASTER_GRID["grid_spec_id"],
                source_resolution=source_resolution,
                analysis_resolution=MASTER_GRID["analysis_resolution"],
                unit=unit,
                **extra_tags,
            )
            for _, window in sources[0].block_windows(1):
                arrays = [source.read(1, window=window).astype(np.float64) for source in sources]
                stack_values = np.stack(arrays)
                valid = np.isfinite(stack_values) & (stack_values != NODATA)
                counts = valid.sum(axis=0)
                sums = np.where(valid, stack_values, 0.0).sum(axis=0)
                result = np.full(counts.shape, NODATA, dtype=np.float32)
                available = counts > 0
                result[available] = (sums[available] / counts[available]).astype(np.float32)
                target.write(result, 1, window=window)

                values = result[available]
                if values.size:
                    valid_cells += int(values.size)
                    total += float(values.sum(dtype=np.float64))
                    minimum = min(minimum, float(values.min()))
                    maximum = max(maximum, float(values.max()))

    metadata = {
        "indicator_id": indicator_id,
        "indicator_name": name,
        "observed_or_scenario": "observed",
        "period": "2021-2025",
        "years": list(YEARS),
        "source_resolution": source_resolution,
        "analysis_resolution": MASTER_GRID["analysis_resolution"],
        "grid_spec_id": MASTER_GRID["grid_spec_id"],
        "unit": unit,
        "aggregation": "mean_of_annual_layers",
        "inputs": [input_entry(year, path) for year, path in inputs],
        "output": str(output.resolve()),
        "output_size_bytes": output.stat().st_size,
        "output_checksum_sha256": sha256(output),
        "valid_cell_count": valid_cells,
        "missing_cell_count": MASTER_GRID["width"] * MASTER_GRID["height"] - valid_cells,
        "min": minimum if valid_cells else None,
        "max": maximum if valid_cells else None,
        "mean": total / valid_cells if valid_cells else None,
        "quality_status": "GRID_QA_COMPLETE",
    }
    output.with_suffix(".metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def scenario_summary(root: Path) -> dict[str, object]:
    scenarios = ("ssp126", "ssp245", "ssp370", "ssp585")
    indicators: dict[str, object] = {}
    total = 0
    for number in range(1, 10):
        indicator = f"H{number:02d}"
        counts: dict[str, int] = {}
        for scenario in scenarios:
            directory = root / "data" / "processed" / "hazard" / indicator / "scenario" / scenario / "national"
            count = len(list(directory.glob("*.tif"))) if directory.exists() else 0
            counts[scenario] = count
            total += count
        indicators[indicator] = {
            "scenarios": counts,
            "status": "COMPLETE" if all(value == 12 for value in counts.values()) else "INCOMPLETE",
        }
    return {
        "indicators": indicators,
        "national_geotiff_count": total,
        "expected_geotiff_count": 432,
        "status": "COMPLETE" if total == 432 else "INCOMPLETE",
    }


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    h01_inputs = [
        (
            year,
            root
            / "data"
            / "processed"
            / "hazard"
            / "H01"
            / "observed"
            / str(year)
            / f"h01_ta_avg_{year}_100m_national.tif",
        )
        for year in YEARS
    ]
    h10_inputs = [
        (
            year,
            root
            / "data"
            / "raw"
            / "gee"
            / "indicators"
            / "lst-yearly"
            / f"kor_lst_summer_p90_{year}_100m_epsg5179.tif",
        )
        for year in YEARS
    ]

    h01 = aggregate_mean(
        "H01",
        "평균기온",
        "℃",
        "500m",
        h01_inputs,
        root
        / "data"
        / "processed"
        / "hazard"
        / "H01"
        / "observed"
        / "2021-2025"
        / "h01_ta_avg_2021_2025_mean_100m_national.tif",
        {"source_agency": "KMA", "resampling_method": "bilinear"},
    )
    h10 = aggregate_mean(
        "H10",
        "여름철 지표면온도 P90",
        "℃",
        "30m Landsat product grid",
        h10_inputs,
        root
        / "data"
        / "processed"
        / "hazard"
        / "H10"
        / "observed"
        / "2021-2025"
        / "h10_lst_summer_p90_2021_2025_mean_100m_national.tif",
        {
            "source_agency": "USGS via Google Earth Engine",
            "source_collection": "Landsat 8/9 Collection 2 Level-2 Surface Temperature",
            "qa_note": "Annual source files align to the master grid; source export aggregation and valid-observation-count QA remain required.",
        },
    )

    observed_names = {
        "H01": "평균기온",
        "H02": "평균최고기온",
        "H03": "평균최저기온",
        "H04": "폭염일수",
        "H05": "열대야일수",
        "H06": "온난일 계속기간 WSDI",
        "H07": "일최고기온 연최대 TXx",
        "H08": "온난일 TX90P",
        "H09": "최대 온난일 계속기간 WSDIx",
        "H10": "여름철 지표면온도 P90",
    }
    observed_status = {}
    for indicator_id, name in observed_names.items():
        directory = root / "data" / "processed" / "hazard" / indicator_id / "observed" / "2021-2025"
        metadata_files = list(directory.glob("*_2021_2025_mean_100m_national.metadata.json"))
        if not metadata_files:
            observed_status[indicator_id] = {"name": name, "status": "GRID_PENDING"}
            continue
        product = json.loads(metadata_files[0].read_text(encoding="utf-8"))
        observed_status[indicator_id] = {
            "name": name,
            "status": "ANNUAL_AND_5YEAR_GRID_COMPLETE" if indicator_id in {"H01", "H10"} else "5YEAR_ASOS_IDW_GRID_COMPLETE",
            "product": product,
            "admin_statistics": "static/analysis-data/national/observed-hazard-admin-statistics.json",
        }
    observed_status["H01"]["product"] = h01
    observed_status["H10"]["product"] = h10
    observed_status["H10"]["qa_status"] = "COMPLETE_WITH_OUTLIER_CAUTION"
    catalog = {
        "title": "LivingLab Hazard DB build catalog",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "grid": MASTER_GRID,
        "observed_period": "2021-2025",
        "observed": observed_status,
        "scenario": scenario_summary(root),
        "future_lst": {
            "indicator_id": "H10",
            "status": "NOT_DIRECTLY_AVAILABLE_FROM_SSP",
            "note": "SSP provides near-surface climate variables, not satellite-observed land surface temperature. A separately validated statistical or physical projection model is required before publishing future LST.",
        },
    }
    processed_catalog = root / "data" / "processed" / "hazard" / "hazard-db-catalog.json"
    static_catalog = root / "static" / "analysis-data" / "national" / "hazard-db-catalog.json"
    for path in (processed_catalog, static_catalog):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"processed_catalog": str(processed_catalog), "static_catalog": str(static_catalog), "scenario": catalog["scenario"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
