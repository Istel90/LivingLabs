from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import h5py
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
    "H01": {
        "name": "평균기온",
        "variable": "TA",
        "slug": "ta_avg",
        "source_label": "mean air temperature",
    },
    "H02": {
        "name": "평균최고기온",
        "variable": "TAMAX",
        "slug": "tamax_avg",
        "source_label": "mean daily maximum air temperature",
    },
    "H03": {
        "name": "평균최저기온",
        "variable": "TAMIN",
        "slug": "tamin_avg",
        "source_label": "mean daily minimum air temperature",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Aggregate KMA AR6 SSP yearly temperature and align it to "
            "Master Grid v1."
        )
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--indicator", choices=sorted(INDICATORS), default="H01")
    parser.add_argument("--scenario", required=True, choices=["ssp126", "ssp245", "ssp370", "ssp585"])
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
        help="Optional EPSG:5179 bounds aligned to Master Grid v1. National scope uses the full grid.",
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


def decode_attribute(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.ndarray) and value.size == 1:
        return decode_attribute(value.reshape(-1)[0])
    return str(value)


def source_transform(longitude: np.ndarray, latitude: np.ndarray) -> Affine:
    if longitude.ndim != 1 or latitude.ndim != 1:
        raise ValueError("Expected one-dimensional longitude and latitude coordinates.")
    if longitude.size < 2 or latitude.size < 2:
        raise ValueError("Coordinate arrays are too short.")

    x_step = float((longitude[-1] - longitude[0]) / (longitude.size - 1))
    y_step = float((latitude[-1] - latitude[0]) / (latitude.size - 1))
    if x_step <= 0 or y_step <= 0:
        raise ValueError("Expected increasing longitude and latitude coordinates.")
    expected_longitude = longitude[0] + np.arange(longitude.size) * x_step
    expected_latitude = latitude[0] + np.arange(latitude.size) * y_step
    if not np.allclose(longitude, expected_longitude, rtol=0.0, atol=1e-5):
        raise ValueError("Longitude coordinates are not regularly spaced.")
    if not np.allclose(latitude, expected_latitude, rtol=0.0, atol=1e-5):
        raise ValueError("Latitude coordinates are not regularly spaced.")

    west = float(longitude[0]) - x_step / 2.0
    north = float(latitude[-1]) + y_step / 2.0
    return Affine(x_step, 0.0, west, 0.0, -y_step, north)


def years_from_time(time_values: np.ndarray, units: str, calendar: str) -> np.ndarray:
    if units != "days since 2021-01-01":
        raise ValueError(f"Unexpected time units: {units}")
    if calendar != "360_day":
        raise ValueError(f"Unexpected calendar: {calendar}")
    year_offsets = np.rint(time_values.astype(np.float64) / 360.0).astype(np.int32)
    years = 2021 + year_offsets
    expected = np.arange(2021, 2101, dtype=np.int32)
    if not np.array_equal(years, expected):
        raise ValueError(f"Unexpected yearly time axis: {years.tolist()}")
    return years


def aggregate_period(
    dataset: h5py.Dataset,
    indices: np.ndarray,
    fill_value: float,
) -> tuple[np.ndarray, dict[str, float | int | None]]:
    shape = dataset.shape[1:]
    total = np.zeros(shape, dtype=np.float64)
    count = np.zeros(shape, dtype=np.uint16)

    for index in indices.tolist():
        values = np.asarray(dataset[index, :, :], dtype=np.float32)
        valid = np.isfinite(values) & (values != fill_value)
        total[valid] += values[valid]
        count[valid] += 1

    aggregated = np.full(shape, np.nan, dtype=np.float32)
    valid_output = count > 0
    aggregated[valid_output] = (total[valid_output] / count[valid_output]).astype(np.float32)
    selected = aggregated[valid_output]
    stats: dict[str, float | int | None] = {
        "valid_cell_count": int(valid_output.sum()),
        "missing_cell_count": int(valid_output.size - valid_output.sum()),
        "missing_rate": float(1.0 - valid_output.mean()),
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
        "Nationwide Master Grid base layer. Preserve this raster and derive study-area products "
        "with a separately versioned mask. 100m alignment does not add spatial detail beyond "
        "the 500m source."
        if scope == "national"
        else "100m analysis-grid alignment does not add spatial detail beyond the 500m source."
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
            source_resolution="500m",
            analysis_resolution="100m",
            resampling_method="bilinear",
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
            "KMA AR6 SSP 5ENSMN South Korea 500m yearly "
            f"{indicator['source_label']}"
        ),
        "source_variable": indicator["variable"],
        "source_file": str(source_path.resolve()),
        "source_checksum_sha256": source_checksum,
        "source_resolution": "500m",
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
        "aggregation_method": "single yearly value" if period_start == period_end else "arithmetic mean of yearly values",
        "spatial_method": "bilinear reprojection and alignment to Master Grid v1",
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
    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(
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
    with h5py.File(args.source, "r") as source_file:
        if indicator["variable"] not in source_file:
            raise ValueError(
                f"Expected variable {indicator['variable']} in {args.source}, "
                f"found {sorted(source_file.keys())}."
            )
        dataset = source_file[indicator["variable"]]
        longitude = np.asarray(source_file["longitude"][...], dtype=np.float64)
        latitude = np.asarray(source_file["latitude"][...], dtype=np.float64)
        time_values = np.asarray(source_file["time"][...], dtype=np.float64)

        if dataset.ndim != 3:
            raise ValueError(f"Unexpected {indicator['variable']} shape: {dataset.shape}")
        if dataset.shape[1:] != (latitude.size, longitude.size):
            raise ValueError(
                f"Grid mismatch: {indicator['variable']}={dataset.shape}, "
                f"latitude={latitude.shape}, longitude={longitude.shape}"
            )

        fill_value = float(np.asarray(dataset.attrs["_FillValue"]).reshape(-1)[0])
        unit = decode_attribute(dataset.attrs["units"])
        time_units = decode_attribute(source_file["time"].attrs["units"])
        calendar = decode_attribute(source_file["time"].attrs["calendar"])
        years = years_from_time(time_values, time_units, calendar)
        src_transform = source_transform(longitude, latitude)

        for period_label, period_start, period_end in PERIODS:
            indices = np.where((years >= period_start) & (years <= period_end))[0]
            expected_count = period_end - period_start + 1
            if indices.size != expected_count:
                raise ValueError(
                    f"Period {period_label} expected {expected_count} yearly values, got {indices.size}."
                )

            aggregated, source_stats = aggregate_period(dataset, indices, fill_value)
            source_values = np.full(aggregated.shape, nodata, dtype=np.float32)
            valid_source = np.isfinite(aggregated)
            source_values[valid_source] = aggregated[valid_source]
            source_values = np.flipud(source_values)
            destination = np.full((height, width), nodata, dtype=np.float32)

            reproject(
                source=source_values,
                destination=destination,
                src_transform=src_transform,
                src_crs=CRS.from_epsg(4326),
                src_nodata=float(nodata),
                dst_transform=target_transform,
                dst_crs=CRS.from_epsg(5179),
                dst_nodata=float(nodata),
                resampling=Resampling.bilinear,
                num_threads=2,
                warp_mem_limit=512,
            )

            scope_suffix = "national" if args.scope == "national" else "test_seoul"
            output_path = args.output_dir / (
                f"{args.indicator.lower()}_{indicator['slug']}_{args.scenario}_"
                f"{period_label}_100m_{scope_suffix}.tif"
            )
            metadata = write_output(
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
            manifest.append(metadata)

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
                "scenario": args.scenario,
                "source": str(args.source.resolve()),
                "output_dir": str(args.output_dir.resolve()),
                "output_count": len(manifest),
                "manifest": str(manifest_path.resolve()),
                "spatial_scope": "national_master_grid" if args.scope == "national" else "test_window",
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
