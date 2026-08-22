#!/usr/bin/env python3
"""Collect Copernicus GLO-30 DEM and build national 100 m terrain derivatives."""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from whitebox.whitebox_tools import WhiteboxTools

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DATA_ROOT = WORKSPACE_ROOT / "data" / "LivingLabs_flood_national"
TEMPLATE = DATA_ROOT / "01_grid" / "KR_100m_template_epsg5179.tif"
TERRAIN_ROOT = DATA_ROOT / "07_terrain" / "copernicus_glo30"
RAW_ROOT = TERRAIN_ROOT / "raw"
OUTPUT_ROOT = TERRAIN_ROOT / "processed"
BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"
NODATA = -9999.0

OUTPUTS = {
    "elevation": OUTPUT_ROOT / "terrain_elevation_100m_epsg5179.tif",
    "filled_dem": OUTPUT_ROOT / "terrain_dem_filled_100m_epsg5179.tif",
    "slope": OUTPUT_ROOT / "terrain_slope_degrees_100m_epsg5179.tif",
    "flow_accumulation": OUTPUT_ROOT / "terrain_flow_accumulation_cells_100m_epsg5179.tif",
    "specific_contributing_area": OUTPUT_ROOT / "terrain_specific_contributing_area_100m_epsg5179.tif",
    "twi": OUTPUT_ROOT / "terrain_twi_100m_epsg5179.tif",
    "depression_depth": OUTPUT_ROOT / "terrain_depression_depth_100m_epsg5179.tif",
}


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def tile_url(name: str) -> str:
    return f"{BASE_URL}/{name}/{name}.tif"


def target_tiles() -> list[tuple[str, str]]:
    with rasterio.open(TEMPLATE) as template:
        left, bottom, right, top = transform_bounds(
            template.crs, "EPSG:4326", *template.bounds, densify_pts=21
        )
    tiles = []
    for lat in range(math.floor(bottom), math.floor(top) + 1):
        for lon in range(math.floor(left), math.floor(right) + 1):
            name = tile_name(lat, lon)
            tiles.append((name, tile_url(name)))
    return tiles


def download_tile(item: tuple[str, str]) -> dict | None:
    name, url = item
    target = RAW_ROOT / f"{name}.tif"
    if target.exists() and target.stat().st_size > 1_024:
        return {"name": name, "url": url, "bytes": target.stat().st_size, "status": "cached"}
    request = Request(url, headers={"User-Agent": "LivingLabs terrain collector/1.0"})
    partial = target.with_suffix(".tif.part")
    for attempt in range(4):
        try:
            with urlopen(request, timeout=180) as response, partial.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
            partial.replace(target)
            return {"name": name, "url": url, "bytes": target.stat().st_size, "status": "downloaded"}
        except HTTPError as error:
            if error.code == 404:
                partial.unlink(missing_ok=True)
                return None
            if attempt == 3:
                raise
        except Exception:
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))
    return None


def download_tiles(workers: int) -> list[dict]:
    RAW_ROOT.mkdir(parents=True, exist_ok=True)
    found = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(download_tile, item): item for item in target_tiles()}
        for future in as_completed(futures):
            result = future.result()
            if result:
                found.append(result)
                print(f"DEM tile {len(found)}: {result['name']} ({result['status']})", flush=True)
    found.sort(key=lambda item: item["name"])
    (TERRAIN_ROOT / "download_manifest.json").write_text(
        json.dumps({"source": BASE_URL, "dataset": "Copernicus DEM GLO-30 2021", "tiles": found}, indent=2),
        encoding="utf-8",
    )
    return found


def aligned_dem(tile_paths: list[Path], replace: bool) -> None:
    output = OUTPUTS["elevation"]
    if output.exists() and not replace:
        print(f"DEM aligned: cached {output}", flush=True)
        return
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with rasterio.open(TEMPLATE) as template:
        profile = template.profile.copy()
        profile.update(
            driver="GTiff",
            dtype="float32",
            count=1,
            nodata=NODATA,
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
            BIGTIFF="YES",
        )
        destination = np.full((template.height, template.width), NODATA, dtype="float32")
        for index, path in enumerate(tile_paths, start=1):
            with rasterio.open(path) as source:
                reproject(
                    source=rasterio.band(source, 1),
                    destination=destination,
                    src_transform=source.transform,
                    src_crs=source.crs,
                    src_nodata=source.nodata,
                    dst_transform=template.transform,
                    dst_crs=template.crs,
                    dst_nodata=NODATA,
                    resampling=Resampling.average,
                    init_dest_nodata=False,
                    num_threads=max(1, min(8, os.cpu_count() or 1)),
                )
            print(f"DEM align {index}/{len(tile_paths)}: {path.name}", flush=True)
        with rasterio.open(output, "w", **profile) as dataset:
            dataset.write(destination, 1)
            dataset.update_tags(
                source="Copernicus DEM GLO-30 Public 2021",
                method="average resampling from approximately 30 m to EPSG:5179 100 m",
            )


def run_derivatives(replace: bool) -> None:
    expected = [path for key, path in OUTPUTS.items() if key != "elevation"]
    if all(path.exists() for path in expected) and not replace:
        print("Terrain derivatives: cached", flush=True)
        return
    whitebox = WhiteboxTools()
    whitebox.set_verbose_mode(True)
    dem = str(OUTPUTS["elevation"])
    calls = [
        (whitebox.fill_depressions, (dem, str(OUTPUTS["filled_dem"])), {"fix_flats": True}),
        (whitebox.slope, (str(OUTPUTS["filled_dem"]), str(OUTPUTS["slope"])), {"units": "degrees"}),
        (
            whitebox.d8_flow_accumulation,
            (str(OUTPUTS["filled_dem"]), str(OUTPUTS["flow_accumulation"])),
            {"out_type": "cells"},
        ),
        (
            whitebox.d8_flow_accumulation,
            (str(OUTPUTS["filled_dem"]), str(OUTPUTS["specific_contributing_area"])),
            {"out_type": "specific contributing area"},
        ),
        (
            whitebox.wetness_index,
            (str(OUTPUTS["specific_contributing_area"]), str(OUTPUTS["slope"]), str(OUTPUTS["twi"])),
            {},
        ),
    ]
    for function, arguments, options in calls:
        output = Path(arguments[-1])
        if output.exists() and replace:
            output.unlink()
        if not output.exists():
            result = function(*arguments, **options)
            if result != 0 or not output.exists():
                raise RuntimeError(f"WhiteboxTools failed: {function.__name__} ({result})")
    build_depression_depth(replace)


def build_depression_depth(replace: bool) -> None:
    output = OUTPUTS["depression_depth"]
    if output.exists() and not replace:
        return
    output.unlink(missing_ok=True)
    with rasterio.open(OUTPUTS["elevation"]) as original, rasterio.open(
        OUTPUTS["filled_dem"]
    ) as filled:
        profile = original.profile.copy()
        profile.update(
            dtype="float32",
            nodata=NODATA,
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
            BIGTIFF="YES",
        )
        with rasterio.open(output, "w", **profile) as destination:
            for _, window in original.block_windows(1):
                source_values = original.read(1, window=window, masked=True)
                filled_values = filled.read(1, window=window, masked=True)
                invalid = np.ma.getmaskarray(source_values) | np.ma.getmaskarray(filled_values)
                depth = np.maximum(
                    filled_values.filled(NODATA) - source_values.filled(NODATA), 0
                ).astype("float32")
                depth[invalid] = NODATA
                destination.write(depth, 1, window=window)
            destination.update_tags(
                source="filled DEM minus original Copernicus DEM",
                method="non-negative blockwise difference",
            )

def raster_stats(path: Path) -> dict:
    with rasterio.open(path) as dataset:
        minimum = math.inf
        maximum = -math.inf
        valid = 0
        for _, window in dataset.block_windows(1):
            values = dataset.read(1, window=window, masked=True)
            compressed = values.compressed()
            if compressed.size:
                valid += int(compressed.size)
                minimum = min(minimum, float(compressed.min()))
                maximum = max(maximum, float(compressed.max()))
        return {
            "path": str(path),
            "bytes": path.stat().st_size,
            "crs": str(dataset.crs),
            "width": dataset.width,
            "height": dataset.height,
            "resolution": list(dataset.res),
            "valid_cells": valid,
            "min": minimum if valid else None,
            "max": maximum if valid else None,
        }


def load_postgis() -> None:
    pg_bin = Path(os.environ.get("VWORLD_PG_BIN", r"D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin"))
    raster2pgsql = pg_bin / "raster2pgsql.exe"
    psql = pg_bin / "psql.exe"
    connection = [
        "-h", os.environ.get("VWORLD_POSTGIS_HOST", "127.0.0.1"),
        "-p", os.environ.get("VWORLD_POSTGIS_PORT", "55432"),
        "-U", os.environ.get("VWORLD_POSTGIS_USER", "postgres"),
        "-d", os.environ.get("VWORLD_POSTGIS_DATABASE", "vworld_cadastral"),
        "-v", "ON_ERROR_STOP=1",
    ]
    table_names = {
        "elevation": "terrain_elevation_100m",
        "filled_dem": "terrain_dem_filled_100m",
        "slope": "terrain_slope_100m",
        "flow_accumulation": "terrain_flow_accumulation_100m",
        "specific_contributing_area": "terrain_sca_100m",
        "twi": "terrain_twi_100m",
        "depression_depth": "terrain_depression_depth_100m",
    }
    subprocess.run([str(psql), *connection, "-c", "CREATE EXTENSION IF NOT EXISTS postgis_raster;"], check=True)
    for indicator, table in table_names.items():
        producer = subprocess.Popen(
            [str(raster2pgsql), "-s", "5179", "-t", "256x256", "-I", "-C", "-M", "-d", str(OUTPUTS[indicator]), f"analysis.{table}"],
            stdout=subprocess.PIPE,
        )
        consumer = subprocess.run([str(psql), *connection], stdin=producer.stdout)
        if producer.stdout:
            producer.stdout.close()
        producer_code = producer.wait()
        if producer_code or consumer.returncode:
            raise RuntimeError(f"PostGIS raster load failed: {indicator}")
    metadata_sql = """
        CREATE TABLE IF NOT EXISTS analysis.terrain_raster_catalog (
          indicator text PRIMARY KEY,
          table_name regclass NOT NULL,
          unit text NOT NULL,
          source text NOT NULL,
          resolution_m integer NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO analysis.terrain_raster_catalog (indicator, table_name, unit, source, resolution_m, updated_at) VALUES
          ('elevation', 'analysis.terrain_elevation_100m', 'm', 'Copernicus DEM GLO-30 2021', 100, now()),
          ('filled_dem', 'analysis.terrain_dem_filled_100m', 'm', 'Copernicus DEM GLO-30 2021 + FillDepressions', 100, now()),
          ('slope', 'analysis.terrain_slope_100m', 'degree', 'WhiteboxTools Slope', 100, now()),
          ('flow_accumulation', 'analysis.terrain_flow_accumulation_100m', 'cells', 'WhiteboxTools D8', 100, now()),
          ('specific_contributing_area', 'analysis.terrain_sca_100m', 'm2/m', 'WhiteboxTools D8', 100, now()),
          ('twi', 'analysis.terrain_twi_100m', 'index', 'WhiteboxTools WetnessIndex', 100, now()),
          ('depression_depth', 'analysis.terrain_depression_depth_100m', 'm', 'WhiteboxTools DepthInSink', 100, now())
        ON CONFLICT (indicator) DO UPDATE SET
          table_name=EXCLUDED.table_name, unit=EXCLUDED.unit, source=EXCLUDED.source,
          resolution_m=EXCLUDED.resolution_m, updated_at=now();
    """
    subprocess.run([str(psql), *connection, "-c", metadata_sql], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--load-postgis", action="store_true")
    args = parser.parse_args()
    manifest = download_tiles(args.workers) if not args.skip_download else []
    tiles = sorted(RAW_ROOT.glob("Copernicus_DSM_COG_10_*_DEM.tif"))
    if not tiles:
        raise FileNotFoundError(f"No DEM tiles found in {RAW_ROOT}")
    aligned_dem(tiles, args.replace)
    run_derivatives(args.replace)
    stats = {key: raster_stats(path) for key, path in OUTPUTS.items()}
    (TERRAIN_ROOT / "validation_report.json").write_text(
        json.dumps({"dataset": "Copernicus DEM GLO-30 2021", "downloaded_tiles": len(manifest) or len(tiles), "outputs": stats}, indent=2),
        encoding="utf-8",
    )
    if args.load_postgis:
        load_postgis()
    print(json.dumps({"ok": True, "tiles": len(tiles), "outputs": stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
