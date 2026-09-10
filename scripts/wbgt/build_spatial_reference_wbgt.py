"""Build a 100 m representative hot-weather WBGT grid with KMAP radiation and building shade.

This first implementation is deliberately regional.  It produces a Suwon (41110)
pilot that can be expanded with the same inputs and assumptions after review.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pvlib
import rasterio
import thermofeel
from netCDF4 import Dataset
from pyproj import Transformer
from rasterio.features import geometry_mask, rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy.spatial import cKDTree
from shapely import from_wkb
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
KMAP_ROOT = Path(r"D:\90_Data\LivingLabs\sources\KMA_KMAP_SOLAR_100M")
DEM_ROOT = Path(r"D:\90_Data\LivingLabs\sources\NGII_DEM90\rasters\2025")
BOUNDARY_FILE = ROOT / "shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json"
ASOS_ROOT = ROOT / "output/wbgt_asos_pilot"
DEFAULT_OUTPUT = ROOT / "output/wbgt_spatial_reference_41110"
DEFAULT_TIF = ROOT / "riskmap-core-main/data/processed/hazard/H11/observed/2021-2025/h11_wbgt_spatial_reference_41110_100m.tif"
DEFAULT_PSQL = Path(r"D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin\psql.exe")
HOURS = {9: "00H", 12: "03H", 15: "06H"}
CELL = 100
SHADOW_CELL = 10
NODATA = -9999.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_suwon_boundary():
    document = json.loads(BOUNDARY_FILE.read_text(encoding="utf-8"))
    features = document["featuresByCode"]
    children = [features[code] for code in ("41111", "41113", "41115", "41117")]
    transform = Transformer.from_crs(4326, 5179, always_xy=True)

    def project_coordinates(value):
        if isinstance(value[0], (int, float)):
            return transform.transform(value[0], value[1])
        return [project_coordinates(part) for part in value]

    return unary_union([shape({"type": feature["geometry"]["type"], "coordinates": project_coordinates(feature["geometry"]["coordinates"])}) for feature in children])


def aligned_grid(boundary):
    xmin, ymin, xmax, ymax = boundary.bounds
    xmin = math.floor(xmin / CELL) * CELL
    ymin = math.floor(ymin / CELL) * CELL
    xmax = math.ceil(xmax / CELL) * CELL
    ymax = math.ceil(ymax / CELL) * CELL
    width = int((xmax - xmin) / CELL)
    height = int((ymax - ymin) / CELL)
    transform = from_origin(xmin, ymax, CELL, CELL)
    inside = geometry_mask([mapping(boundary)], (height, width), transform, invert=True, all_touched=False)
    return transform, width, height, inside


def representative_hot_weather():
    frames = []
    for path in sorted((ASOS_ROOT / "hourly").glob("wbgt_119_*.csv.gz")):
        frame = pd.read_csv(path, parse_dates=["timestamp_kst"])
        frame["timestamp_kst"] = pd.to_datetime(frame["timestamp_kst"], utc=True).dt.tz_convert("Asia/Seoul")
        frames.append(frame)
    if not frames:
        raise FileNotFoundError("Suwon ASOS hourly WBGT cache is missing")
    data = pd.concat(frames, ignore_index=True)
    data["date"] = data.timestamp_kst.dt.date
    data["year"] = data.timestamp_kst.dt.year
    daily = data.groupby(["year", "date"], as_index=False).wbgt_c.max()
    daily["threshold"] = daily.groupby("year").wbgt_c.transform(lambda values: values.quantile(0.9))
    hot_dates = set(map(tuple, daily.loc[daily.wbgt_c >= daily.threshold, ["year", "date"]].itertuples(index=False, name=None)))
    selected = data[[((year, day) in hot_dates) for year, day in zip(data.year, data.date)]]
    selected = selected[selected.timestamp_kst.dt.hour.isin(HOURS)]
    result = {}
    for hour, group in selected.groupby(selected.timestamp_kst.dt.hour):
        result[int(hour)] = {
            "temperature_c": float(group.temperature_c.median()),
            "humidity_pct": float(group.humidity_pct.median()),
            "station_pressure_hpa": float(group.station_pressure_hpa.median()),
            "wind_equivalent_10m_ms": float(group.wind_equivalent_10m_ms.median()),
            "sample_count": int(len(group)),
            "timestamps": group.timestamp_kst.tolist(),
        }
    if set(result) != set(HOURS):
        raise ValueError("Representative ASOS conditions are incomplete")
    metadata = json.loads((ASOS_ROOT / "station_metadata.json").read_text(encoding="utf-8"))
    station = next(item for item in metadata if item["station_id"] == 119)
    return result, station, len(hot_dates)


def solar_geometry(weather, station):
    for hour, values in weather.items():
        timestamps = pd.DatetimeIndex(values.pop("timestamps"))
        solar = pvlib.solarposition.get_solarposition(timestamps, station["latitude"], station["longitude"], altitude=station["elevation_m"])
        values["solar_elevation_deg"] = float(solar.apparent_elevation.median())
        radians = np.deg2rad(solar.azimuth.to_numpy())
        values["solar_azimuth_deg"] = float(np.rad2deg(np.arctan2(np.sin(radians).mean(), np.cos(radians).mean())) % 360)
        values["solar_zenith_deg"] = 90.0 - values["solar_elevation_deg"]


def read_kmap_to_grid(transform, width, height):
    transformer = Transformer.from_crs(5179, 4326, always_xy=True)
    rows, cols = np.indices((height, width))
    xs, ys = rasterio.transform.xy(transform, rows, cols, offset="center")
    lons, lats = transformer.transform(np.asarray(xs), np.asarray(ys))
    latlon_path = KMAP_ROOT / "metadata/manual/KMAP_latlon.nc"
    with Dataset(latlon_path) as ds:
        coarse_lat = ds["latitude"][::25, ::25]
        coarse_lon = ds["longitude"][::25, ::25]
        mask = (coarse_lat >= lats.min() - 0.15) & (coarse_lat <= lats.max() + 0.15) & (coarse_lon >= lons.min() - 0.15) & (coarse_lon <= lons.max() + 0.15)
        rr, cc = np.nonzero(mask)
        if not len(rr):
            raise ValueError("Suwon does not overlap the KMAP grid")
        r0 = max(0, int(rr.min() * 25 - 50)); r1 = min(ds["latitude"].shape[0], int((rr.max() + 1) * 25 + 50))
        c0 = max(0, int(cc.min() * 25 - 50)); c1 = min(ds["latitude"].shape[1], int((cc.max() + 1) * 25 + 50))
        source_lat = np.asarray(ds["latitude"][r0:r1, c0:c1])
        source_lon = np.asarray(ds["longitude"][r0:r1, c0:c1])
    tree = cKDTree(np.column_stack([source_lon.ravel(), source_lat.ravel()]))
    distance, index = tree.query(np.column_stack([lons.ravel(), lats.ravel()]), k=1)
    if float(distance.max()) > 0.003:
        raise ValueError(f"KMAP nearest-cell distance is unexpectedly large: {distance.max()}")
    result = {}
    source_dir = KMAP_ROOT / "processed/hourly_kst_09_12_15"
    for hour, utc_tag in HOURS.items():
        path = next(source_dir.glob(f"*_{utc_tag}_mean.nc"))
        with Dataset(path) as ds:
            source = np.ma.filled(ds["SWDN_flat_with_shading"][r0:r1, c0:c1], np.nan).astype(float).ravel()
        result[hour] = source[index].reshape(height, width)
    return result, {"row_window": [r0, r1], "column_window": [c0, c1], "maximum_nearest_distance_degrees": float(distance.max())}


def read_dem_to_grid(transform, width, height):
    destination = np.full((height, width), np.nan, dtype=np.float32)
    left, bottom, right, top = rasterio.transform.array_bounds(height, width, transform)
    used = []
    for path in sorted(DEM_ROOT.glob("*.img")):
        with rasterio.open(path) as source:
            if source.crs.to_epsg() != 5179:
                continue
            bounds = source.bounds
            if bounds.right <= left or bounds.left >= right or bounds.top <= bottom or bounds.bottom >= top:
                continue
            temp = np.full_like(destination, np.nan)
            reproject(
                rasterio.band(source, 1), temp,
                src_transform=source.transform, src_crs=source.crs, src_nodata=source.nodata,
                dst_transform=transform, dst_crs="EPSG:5179", dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
            fill = np.isfinite(temp) & ~np.isfinite(destination)
            destination[fill] = temp[fill]
            used.append(path.name)
    if not used or not np.isfinite(destination).any():
        raise ValueError("No NGII DEM tile overlaps Suwon")
    return destination, used


def export_buildings(cache: Path, psql: Path):
    if cache.exists() and cache.stat().st_size > 100:
        return
    query = r"""COPY (
      SELECT DISTINCT ON (md5(ST_AsBinary(geom)))
        encode(ST_AsBinary(geom), 'hex') AS wkb_hex,
        CASE WHEN a26 > 0 THEN a26 * 3.3 WHEN a16 > 0 THEN a16 ELSE NULL END AS height_m,
        CASE WHEN a26 > 0 THEN 'floors_x_3.3' ELSE 'reported_height_fallback' END AS height_source
      FROM raw.gis_building_integrated
      WHERE a2 LIKE '4111%' AND geom IS NOT NULL AND NOT ST_IsEmpty(geom)
        AND ((a26 > 0) OR (a16 > 0))
      ORDER BY md5(ST_AsBinary(geom)), gid DESC
    ) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)"""
    command = [str(psql), "-w", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "livinglabs_postgis", "-c", query]
    cache.parent.mkdir(parents=True, exist_ok=True)
    with cache.open("w", encoding="utf-8", newline="") as stream:
        completed = subprocess.run(command, stdout=stream, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    if completed.returncode:
        cache.unlink(missing_ok=True)
        raise RuntimeError(completed.stderr.strip())


def read_buildings(cache: Path, boundary):
    geometries, heights, sources = [], [], {"floors_x_3.3": 0, "reported_height_fallback": 0}
    padded = boundary.buffer(600)
    with cache.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            geometry = from_wkb(bytes.fromhex(row["wkb_hex"]))
            if geometry.is_empty or not geometry.intersects(padded):
                continue
            height = min(250.0, max(3.3, float(row["height_m"])))
            geometries.append(geometry)
            heights.append(height)
            sources[row["height_source"]] += 1
    return geometries, np.asarray(heights), sources


def shift_or(source, target, dx, dy):
    rows, cols = source.shape
    sx0 = max(0, -dx); sx1 = min(cols, cols - dx)
    sy0 = max(0, -dy); sy1 = min(rows, rows - dy)
    if sx0 >= sx1 or sy0 >= sy1:
        return
    target[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] |= source[sy0:sy1, sx0:sx1]


def building_shade(geometries, heights, base_transform, width, height, elevation_deg, azimuth_deg):
    factor = CELL // SHADOW_CELL
    high_transform = from_origin(base_transform.c, base_transform.f, SHADOW_CELL, SHADOW_CELL)
    high_shape = (height * factor, width * factor)
    footprint = rasterize(((mapping(g), 1) for g in geometries), out_shape=high_shape, transform=high_transform, fill=0, dtype="uint8", all_touched=True).astype(bool)
    shadow = footprint.copy()
    bins = np.ceil(heights / 5.0).astype(int) * 5
    direction_x = -math.sin(math.radians(azimuth_deg))
    direction_y = math.cos(math.radians(azimuth_deg))  # array rows grow southward
    for height_bin in np.unique(bins):
        selected = [geometries[index] for index in np.flatnonzero(bins == height_bin)]
        layer = rasterize(((mapping(g), 1) for g in selected), out_shape=high_shape, transform=high_transform, fill=0, dtype="uint8", all_touched=True).astype(bool)
        length = height_bin / max(math.tan(math.radians(elevation_deg)), 0.05)
        steps = max(1, int(math.ceil(length / SHADOW_CELL)))
        for step in range(1, steps + 1):
            distance = min(length, step * SHADOW_CELL)
            dx = int(round(direction_x * distance / SHADOW_CELL))
            dy = int(round(direction_y * distance / SHADOW_CELL))
            shift_or(layer, shadow, dx, dy)
    outdoor_shadow = shadow & ~footprint
    open_count = (~footprint).reshape(height, factor, width, factor).sum(axis=(1, 3))
    shade_count = outdoor_shadow.reshape(height, factor, width, factor).sum(axis=(1, 3))
    fraction = np.divide(shade_count, open_count, out=np.full((height, width), np.nan), where=open_count > 0)
    building_fraction = 1.0 - open_count / float(factor * factor)
    return fraction.astype(np.float32), building_fraction.astype(np.float32)


def saturation_vapor_pressure_hpa(temperature_c):
    return 6.112 * np.exp((17.67 * temperature_c) / (temperature_c + 243.5))


def calculate_wbgt(weather, kmap, shade, dem, station, inside):
    results = {}
    for hour in HOURS:
        condition = weather[hour]
        elevation_delta = dem - float(station["elevation_m"])
        temperature = condition["temperature_c"] - 0.0065 * elevation_delta
        vapor_pressure = saturation_vapor_pressure_hpa(condition["temperature_c"]) * condition["humidity_pct"] / 100.0
        humidity = np.clip(100.0 * vapor_pressure / saturation_vapor_pressure_hpa(temperature), 1.0, 100.0)
        pressure = condition["station_pressure_hpa"] * np.exp(-9.80665 * elevation_delta / (287.05 * (temperature + 273.15)))
        ghi = np.maximum(kmap[hour], 0.0)
        zenith = np.full(ghi.shape, condition["solar_zenith_deg"])
        split = pvlib.irradiance.erbs(ghi.ravel(), zenith.ravel(), 213)
        dhi = np.asarray(split["dhi"]).reshape(ghi.shape)
        direct_horizontal = np.maximum(0.0, ghi - dhi)
        shaded_ghi = dhi + direct_horizontal * (1.0 - np.nan_to_num(shade[hour], nan=0.0))
        direct_after = direct_horizontal * (1.0 - np.nan_to_num(shade[hour], nan=0.0))
        fraction = np.divide(direct_after, shaded_ghi, out=np.zeros_like(shaded_ghi), where=shaded_ghi > 0)
        valid = inside & np.isfinite(dem) & np.isfinite(shaded_ghi) & np.isfinite(shade[hour])
        output = np.full(ghi.shape, np.nan)
        index = np.flatnonzero(valid.ravel())
        output.ravel()[index] = thermofeel.calculate_wbgt_liljegren(
            temperature.ravel()[index] + 273.15,
            humidity.ravel()[index],
            pressure.ravel()[index],
            np.full(len(index), condition["wind_equivalent_10m_ms"]),
            shaded_ghi.ravel()[index],
            np.clip(fraction.ravel()[index], 0.0, 0.9),
            np.full(len(index), math.cos(math.radians(condition["solar_zenith_deg"]))),
            wind_scaling="brode",
        ) - 273.15
        results[hour] = {"wbgt": output, "ghi_after_buildings": shaded_ghi, "direct_fraction": fraction}
    stacked = np.stack([results[hour]["wbgt"] for hour in HOURS])
    maximum = np.full(stacked.shape[1:], np.nan)
    any_valid = np.isfinite(stacked).any(axis=0)
    maximum[any_valid] = np.nanmax(stacked[:, any_valid], axis=0)
    maximum[~inside] = np.nan
    return results, maximum


def write_raster(path, values, transform, tags):
    path.parent.mkdir(parents=True, exist_ok=True)
    profile = dict(driver="GTiff", height=values.shape[0], width=values.shape[1], count=1, dtype="float32", crs="EPSG:5179", transform=transform, nodata=NODATA, compress="deflate", predictor=3, tiled=True, blockxsize=256, blockysize=256)
    with rasterio.open(path, "w", **profile) as dataset:
        dataset.write(np.where(np.isfinite(values), values, NODATA).astype("float32"), 1)
        dataset.update_tags(**tags)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--platform-tif", type=Path, default=DEFAULT_TIF)
    parser.add_argument("--psql", type=Path, default=DEFAULT_PSQL)
    args = parser.parse_args()
    output = args.output.resolve(); output.mkdir(parents=True, exist_ok=True)

    boundary = load_suwon_boundary()
    transform, width, height, inside = aligned_grid(boundary)
    weather, station, hot_day_count = representative_hot_weather()
    solar_geometry(weather, station)
    kmap, kmap_mapping = read_kmap_to_grid(transform, width, height)
    dem, dem_tiles = read_dem_to_grid(transform, width, height)
    building_cache = output / "suwon_buildings_wkb.csv"
    export_buildings(building_cache, args.psql)
    buildings, building_heights, height_sources = read_buildings(building_cache, boundary)
    if not buildings:
        raise ValueError("No usable Suwon buildings")

    shades, building_fraction = {}, None
    for hour, condition in weather.items():
        shades[hour], current_building_fraction = building_shade(buildings, building_heights, transform, width, height, condition["solar_elevation_deg"], condition["solar_azimuth_deg"])
        if building_fraction is None:
            building_fraction = current_building_fraction
        write_raster(output / f"building_shade_fraction_{hour:02d}kst.tif", np.where(inside, shades[hour], np.nan), transform, {"unit": "fraction", "hour_kst": hour})

    hourly, maximum = calculate_wbgt(weather, kmap, shades, dem, station, inside)
    no_building_shade = {hour: np.zeros_like(values) for hour, values in shades.items()}
    _, unshaded_maximum = calculate_wbgt(weather, kmap, no_building_shade, dem, station, inside)
    building_shade_reduction = unshaded_maximum - maximum
    for hour in HOURS:
        write_raster(output / f"wbgt_{hour:02d}kst.tif", hourly[hour]["wbgt"], transform, {"unit": "degC", "model": "spatial-reference-wbgt-v1"})
    write_raster(output / "ngii_dem_100m.tif", np.where(inside, dem, np.nan), transform, {"unit": "m", "source": "NGII public DEM 90m"})
    write_raster(output / "building_fraction_100m.tif", np.where(inside, building_fraction, np.nan), transform, {"unit": "fraction"})
    write_raster(output / "building_shade_wbgt_reduction_c.tif", building_shade_reduction, transform, {"unit": "degC", "meaning": "unshaded minus building-shaded representative WBGT"})
    write_raster(args.platform_tif, maximum, transform, {"indicator": "H11", "unit": "degC", "quality": "EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V1", "region_code": "41110"})

    valid = maximum[np.isfinite(maximum)]
    metadata = {
        "indicator_id": "H11",
        "indicator_name": "100m 폭염 대표조건 WBGT (건물·지형 반영 시험)",
        "region_code": "41110",
        "period": "representative hot conditions from 2021-2025; KMAP solar climatology 2016-07 to 2021-06",
        "period_start": "2021-06-01",
        "period_end": "2025-09-30",
        "season_months": [6, 7, 8, 9],
        "unit": "℃",
        "aggregation": "maximum of 09, 12 and 15 KST representative-hot-day estimates",
        "source_resolution": "KMAP solar 100m; NGII DEM 90m; building footprints",
        "analysis_resolution": "100m",
        "grid_spec_id": "REGIONAL_100M_EPSG5179",
        "quality_status": "EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V1",
        "method": {
            "meteorology": "median 09/12/15 KST conditions on days at or above each year's daily-max estimated-WBGT P90 at Suwon ASOS 119",
            "radiation": "KMAP 100m five-year mean horizontal irradiance with its terrain correction retained; Erbs direct/diffuse estimate",
            "terrain": "NGII 90m DEM bilinear to 100m; 6.5 K/km lapse-rate temperature adjustment, constant vapor pressure, barometric pressure adjustment",
            "buildings": "GIS building footprints; floor count x 3.3m, reported height only when floors unavailable; 5m height bins; 10m shadow subgrid",
            "shade_radiation": "building shade removes estimated direct horizontal irradiance; diffuse irradiance is retained",
            "result": "cellwise maximum of representative 09/12/15 KST WBGT",
        },
        "assumptions": {
            "surface_albedo": "thermofeel 2.3.0 Liljegren default 0.45 pending detailed land-cover map",
            "vegetation": "tree shade excluded by user scope",
            "terrain_double_counting": "no extra terrain-shadow multiplier because KMAP already includes terrain shielding",
            "wind": "uniform representative Suwon ASOS wind; building-induced local wind is not modeled",
            "time_alignment": "current building/DEM environment combined with historical ASOS and earlier KMAP climatology",
            "use": "spatial comparison and screening; not a measured WBGT or parcel-level safety value",
        },
        "input_counts": {"hot_days": hot_day_count, "buildings": len(buildings), "height_sources": height_sources, "dem_tiles": len(dem_tiles)},
        "building_shade_effect_c": {
            "mean": float(np.nanmean(building_shade_reduction[inside])),
            "p95": float(np.nanpercentile(building_shade_reduction[inside], 95)),
            "maximum": float(np.nanmax(building_shade_reduction[inside])),
        },
        "representative_conditions": {str(hour): values for hour, values in weather.items()},
        "kmap_mapping": kmap_mapping,
        "dem_tile_names": dem_tiles,
        "width": width, "height": height, "transform": list(transform)[:6], "nodata": NODATA,
        "valid_cell_count": int(len(valid)), "min": float(valid.min()), "max": float(valid.max()), "mean": float(valid.mean()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    metadata["output_checksum_sha256"] = sha256(args.platform_tif)
    args.platform_tif.with_suffix(".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    (output / "summary.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"output": str(args.platform_tif), "cells": len(valid), "range_c": [float(valid.min()), float(valid.max())], "buildings": len(buildings), "dem_tiles": dem_tiles}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
