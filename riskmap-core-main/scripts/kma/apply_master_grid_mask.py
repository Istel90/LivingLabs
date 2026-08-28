from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window
from rasterio.warp import transform_geom


MASTER_GRID = {
    "grid_spec_id": "KOR_100M_EPSG5179_V1",
    "crs": "EPSG:5179",
    "transform": (100.0, 0.0, 745900.0, 0.0, -100.0, 2068600.0),
    "width": 5569,
    "height": 6107,
    "nodata": -9999.0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply a versioned AOI mask to a nationwide Master Grid v1 raster."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--mask", required=True, type=Path)
    parser.add_argument("--mask-version", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--mask-crs",
        default="EPSG:4326",
        help="CRS of GeoJSON coordinates. Raster masks must already match Master Grid v1.",
    )
    parser.add_argument("--crop-to-mask", action="store_true")
    parser.add_argument("--all-touched", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def assert_master_grid(source: rasterio.io.DatasetReader) -> None:
    expected_transform = rasterio.Affine(*MASTER_GRID["transform"])
    if source.crs != rasterio.CRS.from_string(MASTER_GRID["crs"]):
        raise ValueError(f"Unexpected CRS: {source.crs}")
    if source.transform != expected_transform:
        raise ValueError(f"Unexpected transform: {source.transform}")
    if source.width != MASTER_GRID["width"] or source.height != MASTER_GRID["height"]:
        raise ValueError(f"Unexpected grid size: {source.width}x{source.height}")
    if source.nodata != MASTER_GRID["nodata"]:
        raise ValueError(f"Unexpected NoData: {source.nodata}")


def geojson_geometries(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    kind = payload.get("type")
    if kind == "FeatureCollection":
        geometries = [feature.get("geometry") for feature in payload.get("features", [])]
    elif kind == "Feature":
        geometries = [payload.get("geometry")]
    else:
        geometries = [payload]
    result = [geometry for geometry in geometries if isinstance(geometry, dict)]
    if not result:
        raise ValueError("GeoJSON contains no usable geometry.")
    return result


def read_mask(
    path: Path,
    *,
    transform: rasterio.Affine,
    shape: tuple[int, int],
    mask_crs: str,
    all_touched: bool,
) -> tuple[np.ndarray, str]:
    if path.suffix.lower() in {".json", ".geojson"}:
        geometries = [
            transform_geom(mask_crs, MASTER_GRID["crs"], geometry, precision=3)
            for geometry in geojson_geometries(path)
        ]
        included = geometry_mask(
            geometries,
            out_shape=shape,
            transform=transform,
            invert=True,
            all_touched=all_touched,
        )
        return included, "vector_geojson"

    with rasterio.open(path) as mask_source:
        assert_master_grid(mask_source)
        values = mask_source.read(1)
        valid = np.isfinite(values)
        if mask_source.nodata is not None:
            valid &= values != mask_source.nodata
        included = valid & (values != 0)
    return included, "aligned_raster"


def main() -> None:
    args = parse_args()
    if not args.input.exists() or not args.mask.exists():
        raise FileNotFoundError("Input raster and mask must both exist.")

    with rasterio.open(args.input) as source:
        assert_master_grid(source)
        source_values = source.read(1)
        source_profile = source.profile.copy()
        source_tags = source.tags()
        included, mask_type = read_mask(
            args.mask,
            transform=source.transform,
            shape=(source.height, source.width),
            mask_crs=args.mask_crs,
            all_touched=args.all_touched,
        )

        if not included.any():
            raise ValueError("Mask selects zero Master Grid cells.")

        output_values = np.full(source_values.shape, source.nodata, dtype=np.float32)
        source_valid = np.isfinite(source_values) & (source_values != source.nodata)
        output_values[included & source_valid] = source_values[included & source_valid]
        output_transform = source.transform
        row_offset = 0
        column_offset = 0

        if args.crop_to_mask:
            rows, columns = np.where(included)
            row_min, row_max = int(rows.min()), int(rows.max()) + 1
            column_min, column_max = int(columns.min()), int(columns.max()) + 1
            window = Window(column_min, row_min, column_max - column_min, row_max - row_min)
            output_values = output_values[row_min:row_max, column_min:column_max]
            output_transform = source.window_transform(window)
            row_offset = row_min
            column_offset = column_min

    args.output.parent.mkdir(parents=True, exist_ok=True)
    source_profile.update(
        width=output_values.shape[1],
        height=output_values.shape[0],
        transform=output_transform,
        dtype="float32",
        nodata=MASTER_GRID["nodata"],
        tiled=True,
        blockxsize=256,
        blockysize=256,
        compress="LZW",
        predictor=3,
        BIGTIFF="IF_SAFER",
    )
    with rasterio.open(args.output, "w", **source_profile) as target:
        target.write(output_values, 1)
        output_tags = dict(source_tags)
        output_tags.update(
            mask_version=args.mask_version,
            mask_source=args.mask.name,
            mask_type=mask_type,
            mask_applied="true",
            crop_to_mask=str(args.crop_to_mask).lower(),
            quality_status="MASK_APPLIED_FROM_NATIONAL_MASTER_GRID",
        )
        target.update_tags(**output_tags)

    valid_output = output_values != MASTER_GRID["nodata"]
    metadata = {
        "source_file": str(args.input.resolve()),
        "source_checksum_sha256": sha256(args.input),
        "mask_file": str(args.mask.resolve()),
        "mask_checksum_sha256": sha256(args.mask),
        "mask_version": args.mask_version,
        "mask_type": mask_type,
        "grid_spec_id": MASTER_GRID["grid_spec_id"],
        "crop_to_mask": args.crop_to_mask,
        "master_grid_row_offset": row_offset,
        "master_grid_column_offset": column_offset,
        "output_file": str(args.output.resolve()),
        "output_checksum_sha256": sha256(args.output),
        "output_crs": MASTER_GRID["crs"],
        "transform": list(output_transform)[:6],
        "width": int(output_values.shape[1]),
        "height": int(output_values.shape[0]),
        "nodata": MASTER_GRID["nodata"],
        "valid_cell_count": int(valid_output.sum()),
        "missing_cell_count": int(valid_output.size - valid_output.sum()),
        "quality_status": "MASK_APPLIED_FROM_NATIONAL_MASTER_GRID",
    }
    metadata_path = args.output.with_suffix(".metadata.json")
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
