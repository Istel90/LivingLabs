from __future__ import annotations

import argparse
import hashlib
import json
import re
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regrid a KMA 500 m NetCDF statistic to Master Grid v1."
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--coordinates", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--year",
        type=int,
        help="Observation year. If omitted, infer the first YYYY token from the source filename.",
    )
    parser.add_argument(
        "--bounds",
        nargs=4,
        type=float,
        metavar=("XMIN", "YMIN", "XMAX", "YMAX"),
        help="Optional EPSG:5179 test bounds aligned to the 100 m master grid.",
    )
    return parser.parse_args()


def observation_year(source: Path, explicit_year: int | None) -> int:
    if explicit_year is not None:
        return explicit_year
    match = re.search(r"(?<!\d)(20\d{2})(?!\d)", source.stem)
    if not match:
        raise ValueError("Could not infer observation year; pass --year explicitly.")
    return int(match.group(1))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def target_grid(bounds: list[float] | None) -> tuple[Affine, int, int, list[float]]:
    if bounds is None:
        selected = [
            MASTER_GRID["xmin"],
            MASTER_GRID["ymin"],
            MASTER_GRID["xmax"],
            MASTER_GRID["ymax"],
        ]
    else:
        selected = list(bounds)

    xmin, ymin, xmax, ymax = selected
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
    return transform, width, height, selected


def main() -> None:
    args = parse_args()
    year = observation_year(args.source, args.year)
    transform, width, height, bounds = target_grid(args.bounds)
    nodata = np.float32(MASTER_GRID["nodata"])

    with h5py.File(args.source, "r") as source_file:
        source_dataset = source_file["data"]
        raw = np.asarray(source_dataset[...])
        fill_value = int(np.asarray(source_dataset.attrs["_FillValue"]).reshape(-1)[0])
        scale_divisor = float(np.asarray(source_dataset.attrs["data_scale"]).reshape(-1)[0])
        unit = source_dataset.attrs["unit"]
        if isinstance(unit, bytes):
            unit = unit.decode("utf-8", errors="replace")

    with h5py.File(args.coordinates, "r") as coordinate_file:
        longitude = np.asarray(coordinate_file["lon"][...], dtype=np.float64)
        latitude = np.asarray(coordinate_file["lat"][...], dtype=np.float64)

    if raw.shape != longitude.shape or raw.shape != latitude.shape:
        raise ValueError(
            f"Grid mismatch: data={raw.shape}, lon={longitude.shape}, lat={latitude.shape}"
        )

    source_values = np.full(raw.shape, nodata, dtype=np.float32)
    valid_source = raw != fill_value
    source_values[valid_source] = raw[valid_source].astype(np.float32) / scale_divisor
    destination = np.full((height, width), nodata, dtype=np.float32)

    reproject(
        source=source_values,
        destination=destination,
        src_crs=CRS.from_epsg(4326),
        src_geoloc_array=(longitude, latitude),
        src_nodata=float(nodata),
        dst_transform=transform,
        dst_crs=CRS.from_epsg(5179),
        dst_nodata=float(nodata),
        resampling=Resampling.bilinear,
        num_threads=2,
        warp_mem_limit=512,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        args.output,
        "w",
        driver="GTiff",
        width=width,
        height=height,
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
    ) as target:
        target.write(destination, 1)
        target.set_band_description(1, f"H01 {year} annual mean air temperature")
        target.update_tags(
            grid_spec_id=MASTER_GRID["grid_spec_id"],
            observation_year=str(year),
            observed_or_scenario="observed",
            source_resolution="500m",
            resampling_method="bilinear",
            unit=str(unit),
            source_file=args.source.name,
            coordinate_file=args.coordinates.name,
            quality_status="TEST_WINDOW_REGRID_COMPLETE" if args.bounds else "FULL_REGRID_COMPLETE",
        )

    valid_output = destination != nodata
    selected = destination[valid_output]
    metadata = {
        "indicator_id": "H01",
        "year": year,
        "source_file": str(args.source.resolve()),
        "source_checksum_sha256": sha256(args.source),
        "coordinate_file": str(args.coordinates.resolve()),
        "coordinate_checksum_sha256": sha256(args.coordinates),
        "output_file": str(args.output.resolve()),
        "output_checksum_sha256": sha256(args.output),
        "grid_spec_id": MASTER_GRID["grid_spec_id"],
        "crs": MASTER_GRID["crs"],
        "transform": list(transform)[:6],
        "bounds": bounds,
        "width": width,
        "height": height,
        "nodata": float(nodata),
        "dtype": "float32",
        "unit": str(unit),
        "resampling_method": "bilinear",
        "valid_cell_count": int(valid_output.sum()),
        "missing_cell_count": int(valid_output.size - valid_output.sum()),
        "missing_rate": float(1.0 - valid_output.mean()),
        "min": float(selected.min()) if selected.size else None,
        "max": float(selected.max()) if selected.size else None,
        "mean": float(selected.mean()) if selected.size else None,
        "quality_status": "TEST_WINDOW_REGRID_COMPLETE" if args.bounds else "FULL_REGRID_COMPLETE",
        "test_only": bool(args.bounds),
    }
    metadata_path = args.output.with_suffix(".metadata.json")
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
