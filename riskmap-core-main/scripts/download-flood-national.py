#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import rasterio
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DEFAULT_DATA_ROOT = WORKSPACE_ROOT / 'data' / 'LivingLabs_flood_national'
TARGET_EXTENT = (700000.0, 1400000.0, 1400000.0, 2100000.0)
TARGET_SIZE = (7000, 7000)

SERVICES = {
    'population_2024': {
        'url': 'https://portal.esrikr.com/arcgis/rest/services/POP_2024/ImageServer',
        'bbox': (746100.0, 1458600.0, 1388000.0, 2068500.0),
        'epsg': 5179,
        'dtype': 'UInt16',
        'nodata': 65535,
        'output': '03_exposure/population/E_population_2024_100m_epsg5179.tif',
    },
    'housing_2024': {
        'url': 'https://portal.esrikr.com/arcgis/rest/services/Housing_2024/ImageServer',
        'bbox': (746100.0, 1458600.0, 1388000.0, 2068500.0),
        'epsg': 5179,
        'dtype': 'UInt16',
        'nodata': 65535,
        'output': '03_exposure/population/E_housing_2024_100m_epsg5179.tif',
    },
    'urban_flood_30y': {
        'url': 'https://portal.esrikr.com/arcgis/rest/services/Urban_Flood_30year/ImageServer',
        'bbox': (121276.708, -29516.968, 422851.708, 551408.032),
        'epsg': 5181,
        'dtype': 'Byte',
        'nodata': 0,
        'output': '02_hazard/floodmap/H_urban_flood_30y_class_100m_epsg5179.tif',
    },
    'national_river_flood_100y': {
        'url': 'https://portal.esrikr.com/arcgis/rest/services/NationalRiver_Flood_100year/ImageServer',
        'bbox': (149862.1823, 122284.5315, 416637.1823, 513494.5315),
        'epsg': 5181,
        'dtype': 'Byte',
        'nodata': 0,
        'output': '02_hazard/floodmap/H_national_river_flood_100y_class_100m_epsg5179.tif',
    },
    'local_river_flood_50y': {
        'url': 'https://portal.esrikr.com/arcgis/rest/services/LocalRiver_Flood_50year/ImageServer',
        'bbox': (123817.4551, -28459.3924, 537257.4551, 551475.6076),
        'epsg': 5181,
        'dtype': 'Byte',
        'nodata': 0,
        'output': '02_hazard/floodmap/H_local_river_flood_50y_class_100m_epsg5179.tif',
    },
}


def tile_bounds(bounds, tile_m=200000.0):
    xmin, ymin, xmax, ymax = bounds
    x = xmin
    column = 0
    while x < xmax:
        next_x = min(x + tile_m, xmax)
        y = ymin
        row = 0
        while y < ymax:
            next_y = min(y + tile_m, ymax)
            yield column, row, (x, y, next_x, next_y)
            y = next_y
            row += 1
        x = next_x
        column += 1


def download_tile(config, bounds, output):
    xmin, ymin, xmax, ymax = bounds
    params = {
        'bbox': ','.join(map(str, bounds)),
        'bboxSR': config['epsg'],
        'size': f'{max(1, math.ceil((xmax - xmin) / 100))},{max(1, math.ceil((ymax - ymin) / 100))}',
        'imageSR': config['epsg'],
        'format': 'tiff',
        'interpolation': 'RSP_NearestNeighbor',
        'adjustAspectRatio': 'false',
        'f': 'image',
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            with requests.get(
                f"{config['url']}/exportImage",
                params=params,
                timeout=180,
                stream=True,
                headers={'User-Agent': 'LivingLabsFloodRisk/1.0'},
            ) as response:
                response.raise_for_status()
                with output.open('wb') as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        if chunk:
                            stream.write(chunk)
            return
        except Exception:
            output.unlink(missing_ok=True)
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def gdal_command(name):
    executable = shutil.which(name)
    if executable:
        return executable
    environment_root = Path(sys.executable).resolve().parent
    candidate = environment_root / 'Library' / 'bin' / f'{name}.exe'
    if candidate.exists():
        return str(candidate)
    raise RuntimeError(f'{name} is required. Activate the lh_gis Conda environment first.')


def validate_raster(path):
    if not path.exists():
        return False
    with rasterio.open(path) as dataset:
        return (
            str(dataset.crs) == 'EPSG:5179'
            and (dataset.width, dataset.height) == TARGET_SIZE
            and abs(dataset.transform.a - 100) < 1e-6
            and abs(dataset.transform.e + 100) < 1e-6
        )


def build_service(name, data_root, force=False, cleanup_tiles=False):
    config = SERVICES[name]
    output = data_root / config['output']
    if not force and validate_raster(output):
        print(f'reuse {name}: {output}')
        return {'service': name, 'output': str(output), 'reused': True}

    scratch = data_root / 'logs' / 'download_tiles' / name
    scratch.mkdir(parents=True, exist_ok=True)
    tile_paths = []
    for column, row, bounds in tile_bounds(config['bbox']):
        tile_path = scratch / f'tile_{column:02d}_{row:02d}.tif'
        tile_paths.append(tile_path)
        if force or not tile_path.exists():
            print(f'download {name} {tile_path.name} {bounds}', flush=True)
            download_tile(config, bounds, tile_path)

    data_root.joinpath('logs').mkdir(parents=True, exist_ok=True)
    vrt_path = data_root / 'logs' / f'{name}.vrt'
    subprocess.run(
        [gdal_command('gdalbuildvrt'), '-overwrite', '-srcnodata', str(config['nodata']),
         '-vrtnodata', str(config['nodata']), str(vrt_path), *map(str, tile_paths)],
        check=True,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [gdal_command('gdalwarp'), '-overwrite', '-multi', '-wo', 'NUM_THREADS=ALL_CPUS',
         '-t_srs', 'EPSG:5179', '-te', *map(str, TARGET_EXTENT), '-tr', '100', '100', '-tap',
         '-r', 'near', '-srcnodata', str(config['nodata']), '-dstnodata', str(config['nodata']),
         '-ot', config['dtype'], '-co', 'TILED=YES', '-co', 'COMPRESS=LZW', '-co', 'BIGTIFF=IF_SAFER',
         str(vrt_path), str(output)],
        check=True,
    )
    if not validate_raster(output):
        raise RuntimeError(f'Output validation failed: {output}')
    if cleanup_tiles:
        shutil.rmtree(scratch, ignore_errors=True)
    return {'service': name, 'output': str(output), 'reused': False, 'bytes': output.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description='Download and align nationwide flood H/E rasters to EPSG:5179 100m.')
    parser.add_argument('services', nargs='*')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--root', type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--cleanup-tiles', action='store_true')
    args = parser.parse_args()
    unknown = [name for name in args.services if name not in SERVICES]
    if unknown:
        parser.error(f"unknown services: {', '.join(unknown)}")
    names = list(SERVICES) if args.all or not args.services else args.services
    results = [build_service(name, args.root, args.force, args.cleanup_tiles) for name in names]
    manifest = args.root / 'manifests' / 'downloaded_rasters.json'
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
