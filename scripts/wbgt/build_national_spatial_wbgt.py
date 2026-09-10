"""Resumable nationwide representative WBGT, with real KMAP/DEM/building inputs.

This is a synthetic hot-weather spatial screening indicator, not an observation
or a five-year average of WBGT. Tiles include a shadow buffer and share one grid.
"""

from __future__ import annotations
import argparse, csv, io, json, math, subprocess, time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import pandas as pd
import pvlib
import rasterio
import thermofeel
from netCDF4 import Dataset
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.windows import Window
from scipy.spatial import cKDTree
from shapely import from_wkb
from shapely.geometry import shape
from shapely.ops import transform as project_geometry
from build_spatial_reference_wbgt import (
    ROOT,
    KMAP_ROOT,
    DEM_ROOT,
    DEFAULT_PSQL,
    HOURS,
    NODATA,
    read_dem_to_grid,
    saturation_vapor_pressure_hpa,
    sha256,
)

OUT = Path(
    r"D:\90_Data\LivingLabs\derived\WBGT_SPATIAL_REFERENCE_100M\2026-09-08_national_v2"
)
REF = (
    ROOT
    / "riskmap-core-main/data/processed/hazard/H02/observed/2021-2025/h02_tamax_2021_2025_mean_100m_national.tif"
)
ASOS = ROOT / "output/wbgt_asos_national"
MODEL = "EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V2_NATIONAL"
TILE = 200  # 20 km; output cells are 100 m, shade is sampled at 10 m.
PAD = 80  # 800 m shadow buffer, sufficient for accepted <=600 m buildings at these solar angles.
TO_LONLAT = Transformer.from_crs(5179, 4326, always_xy=True)
TO_XY = Transformer.from_crs(4326, 5179, always_xy=True)


def save_json(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf8",
    )
    temp.replace(path)


def prepare_mask(out):
    path = out / "national_boundary_mask.tif"
    if path.exists():
        return path
    data = json.loads(
        (
            ROOT
            / "shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json"
        ).read_text(encoding="utf8")
    )
    polygons = [
        project_geometry(TO_XY.transform, shape(f["geometry"]))
        for f in data["featuresByCode"].values()
    ]
    with rasterio.open(REF) as ref:
        profile = ref.profile.copy()
        profile.update(dtype="uint8", nodata=0)
        mask = rasterize(
            ((g, 1) for g in polygons),
            out_shape=(ref.height, ref.width),
            transform=ref.transform,
            dtype="uint8",
            all_touched=False,
        )
    with rasterio.open(path, "w", **profile) as ds:
        ds.write(mask, 1)
    return path


def prepare_weather(out):
    cache = out / "representative_weather.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf8"))
    stations = pd.read_csv(ASOS / "h11_station_baseline.csv")
    daily = pd.read_csv(ASOS / "wbgt_daily.csv")
    daily = daily[
        (daily.valid_hours == 24) & daily.station_id.isin(stations.station_id)
    ].copy()
    daily["p90"] = daily.groupby(["station_id", "year"]).wbgt_hourly_max_c.transform(
        lambda x: x.quantile(0.9)
    )
    hot = daily[daily.wbgt_hourly_max_c >= daily.p90][["station_id", "date"]]
    frames = []
    columns = [
        "timestamp_kst",
        "station_id",
        "temperature_c",
        "humidity_pct",
        "station_pressure_hpa",
        "wind_equivalent_10m_ms",
    ]
    for path in sorted((ASOS / "hourly").glob("*.csv.gz")):
        f = pd.read_csv(path, usecols=columns)
        ts = pd.to_datetime(f.timestamp_kst, utc=True).dt.tz_convert("Asia/Seoul")
        f["hour"] = ts.dt.hour
        f["date"] = ts.dt.strftime("%Y-%m-%d")
        f = f[f.hour.isin(HOURS)].merge(hot, on=["station_id", "date"])
        frames.append(f)
    f = pd.concat(frames, ignore_index=True)
    result = []
    for station in stations.to_dict("records"):
        group = f[f.station_id == station["station_id"]]
        conditions = {}
        for hour in HOURS:
            g = group[group.hour == hour]
            c = {key: float(g[key].median()) for key in columns[2:]}
            if len(g) < 25 or not all(math.isfinite(v) for v in c.values()):
                break
            c["samples"] = len(g)
            conditions[str(hour)] = c
        if len(conditions) == 3:
            result.append(
                {
                    key: station[key]
                    for key in [
                        "station_id",
                        "longitude",
                        "latitude",
                        "elevation_m",
                        "name_en",
                    ]
                }
                | {"conditions": conditions}
            )
    if len(result) < 30:
        raise ValueError(f"Insufficient eligible ASOS stations: {len(result)}")
    save_json(cache, result)
    return result


_KMAP = None


def kmap_grid(xs, ys):
    global _KMAP
    if _KMAP is None:
        ds = Dataset(KMAP_ROOT / "metadata/manual/KMAP_latlon.nc")
        lat = np.asarray(ds["latitude"][::25, ::25])
        lon = np.asarray(ds["longitude"][::25, ::25])
        cx, cy = TO_XY.transform(lon, lat)
        sources = {
            h: Dataset(
                next(
                    (KMAP_ROOT / "processed/hourly_kst_09_12_15").glob(
                        f"*_{tag}_mean.nc"
                    )
                )
            )
            for h, tag in HOURS.items()
        }
        _KMAP = (
            ds,
            cKDTree(np.column_stack([cx.ravel(), cy.ravel()])),
            lat.shape,
            sources,
        )
    ds, tree, coarse_shape, sources = _KMAP
    _, ids = tree.query(np.column_stack([xs.ravel(), ys.ravel()]))
    rr, cc = np.unravel_index(ids, coarse_shape)
    r0 = max(0, int(rr.min() * 25 - 50))
    r1 = min(ds["latitude"].shape[0], int(rr.max() * 25 + 75))
    c0 = max(0, int(cc.min() * 25 - 50))
    c1 = min(ds["latitude"].shape[1], int(cc.max() * 25 + 75))
    lat = np.asarray(ds["latitude"][r0:r1, c0:c1])
    lon = np.asarray(ds["longitude"][r0:r1, c0:c1])
    cx, cy = TO_XY.transform(lon, lat)
    distance, ids = cKDTree(np.column_stack([cx.ravel(), cy.ravel()])).query(
        np.column_stack([xs.ravel(), ys.ravel()])
    )
    values = {}
    for h, source in sources.items():
        raw = (
            np.ma.filled(source["SWDN_flat_with_shading"][r0:r1, c0:c1], np.nan)
            .astype("float32")
            .ravel()
        )
        v = raw[ids].reshape(xs.shape)
        v[(distance.reshape(xs.shape) > 150) | (v < 0)] = np.nan
        values[h] = v
    return values


def building_height_grid(transform, width, height):
    high_transform = (
        transform
        * rasterio.Affine.scale(0.1, 0.1)
        * rasterio.Affine.translation(-PAD, -PAD)
    )
    shape = (height * 10 + 2 * PAD, width * 10 + 2 * PAD)
    left, bottom, right, top = rasterio.transform.array_bounds(*shape, high_transform)
    query = f"""COPY (SELECT DISTINCT ON (md5(ST_AsBinary(geom))) encode(ST_AsBinary(geom),'hex') wkb,
      CASE WHEN a26>0 THEN a26*3.3 WHEN a16>0 THEN a16 ELSE NULL END height,
      CASE WHEN a26>0 THEN 'floors' WHEN a16>0 THEN 'height' ELSE 'unknown' END source
      FROM raw.gis_building_integrated WHERE geom && ST_MakeEnvelope({left},{bottom},{right},{top},5179)
      AND geom IS NOT NULL AND NOT ST_IsEmpty(geom)
      ORDER BY md5(ST_AsBinary(geom)), ((a26>0) OR (a16>0)) DESC NULLS LAST,gid DESC
    ) TO STDOUT WITH (FORMAT CSV,HEADER TRUE)"""
    r = subprocess.run(
        [
            str(DEFAULT_PSQL),
            "-w",
            "-h",
            "127.0.0.1",
            "-p",
            "55432",
            "-U",
            "postgres",
            "-d",
            "livinglabs_postgis",
            "-c",
            query,
        ],
        capture_output=True,
        encoding="utf8",
        timeout=180,
    )
    if r.returncode:
        raise RuntimeError(r.stderr)
    known = []
    unknown = []
    counts = {"floors": 0, "height": 0, "unknown": 0, "invalid_height": 0}
    for row in csv.DictReader(io.StringIO(r.stdout)):
        g = from_wkb(bytes.fromhex(row["wkb"]))
        if g.is_empty:
            continue
        h = float(row["height"]) if row["height"] else 0
        if 0 < h <= 600:
            known.append((g, h))
            counts[row["source"]] += 1
        else:
            unknown.append((g, 1))
            counts["unknown" if h == 0 else "invalid_height"] += 1
    known.sort(key=lambda pair: pair[1])  # highest overlapping roof wins.
    heights = (
        rasterize(
            known,
            out_shape=shape,
            transform=high_transform,
            fill=0,
            dtype="float32",
            all_touched=False,
        )
        if known
        else np.zeros(shape, "float32")
    )
    unknown_mask = (
        rasterize(
            unknown,
            out_shape=shape,
            transform=high_transform,
            fill=0,
            dtype="uint8",
            all_touched=False,
        ).astype(bool)
        if unknown
        else np.zeros(shape, bool)
    )
    return heights, unknown_mask, counts


def shade_fraction(heights, unknown, elevation, azimuth, height, width):
    footprint = (heights > 0) | unknown
    shadow = np.zeros_like(footprint)
    tan = math.tan(math.radians(elevation))
    max_distance = float(heights.max()) / tan
    if max_distance > PAD * 10 - 10:
        raise ValueError("Building shadow exceeds tile buffer")
    nrows, ncols = heights.shape
    previous = None
    for step in range(1, math.ceil(max_distance / 10) + 1):
        distance = step * 10
        dx = round(-math.sin(math.radians(azimuth)) * step)
        dy = round(math.cos(math.radians(azimuth)) * step)
        if (dx, dy) == previous:
            continue
        previous = (dx, dy)
        x0 = max(0, -dx)
        x1 = min(ncols, ncols - dx)
        y0 = max(0, -dy)
        y1 = min(nrows, nrows - dy)
        shadow[y0 + dy : y1 + dy, x0 + dx : x1 + dx] |= (
            heights[y0:y1, x0:x1] >= distance * tan
        )
    crop = (slice(PAD, PAD + height * 10), slice(PAD, PAD + width * 10))
    outdoor = ~footprint[crop]
    reshape = (height, 10, width, 10)
    count = outdoor.reshape(reshape).sum(axis=(1, 3))
    shaded = (shadow[crop] & outdoor).reshape(reshape).sum(axis=(1, 3))
    fraction = np.divide(
        shaded, count, out=np.full((height, width), np.nan), where=count > 0
    )
    unknown_fraction = unknown[crop].reshape(reshape).mean(axis=(1, 3))
    return fraction, 1 - count / 100, unknown_fraction


def interpolated_weather(stations, xs, ys, dem, hour):
    sx, sy = TO_XY.transform(
        [s["longitude"] for s in stations], [s["latitude"] for s in stations]
    )
    distance, ix = cKDTree(np.column_stack([sx, sy])).query(
        np.column_stack([xs.ravel(), ys.ravel()]), k=6
    )
    weights = 1 / np.maximum(distance, 100) ** 2
    weights /= weights.sum(axis=1)[:, None]

    def field(key):
        return np.array([s["conditions"][str(hour)][key] for s in stations])[ix]

    z = np.array([s["elevation_m"] for s in stations])[ix]
    station_t = field("temperature_c")
    t = np.sum(weights * (station_t + 0.0065 * z), axis=1) - 0.0065 * dem.ravel()
    vapor = np.sum(
        weights
        * saturation_vapor_pressure_hpa(station_t)
        * field("humidity_pct")
        / 100,
        axis=1,
    )
    rh = np.clip(100 * vapor / saturation_vapor_pressure_hpa(t), 1, 100)
    pressure = np.sum(
        weights
        * field("station_pressure_hpa")
        * np.exp(
            -9.80665 * (dem.ravel()[:, None] - z) / (287.05 * (t[:, None] + 273.15))
        ),
        axis=1,
    )
    wind = np.sum(weights * field("wind_equivalent_10m_ms"), axis=1)
    return t, rh, pressure, wind, distance[:, 0]


def process_tile(task, out, stations):
    row, col, height, width = task
    out = Path(out)
    path = out / "tiles" / f"{row:05d}_{col:05d}.tif"
    meta = path.with_suffix(".json")
    with rasterio.open(out / "national_boundary_mask.tif") as ds:
        inside = ds.read(1, window=Window(col, row, width, height)).astype(bool)
    if path.exists() and meta.exists():
        info = json.loads(meta.read_text(encoding="utf8"))
        if info.get("boundary_mask_applied"):
            return info | {"cached": True}
        with rasterio.open(path, "r+") as ds:
            arrays = ds.read()
            arrays[:, ~inside] = NODATA
            ds.write(arrays)
        valid = arrays[0] != NODATA
        v = arrays[0][valid]
        info.update(
            cells=int(inside.sum()),
            valid=int(valid.sum()),
            min=float(v.min()) if len(v) else None,
            max=float(v.max()) if len(v) else None,
            sum=float(v.sum(dtype="float64")),
            boundary_mask_applied=True,
        )
        info.update(
            missing_dem_cells=int((inside & (arrays[7] == NODATA)).sum()),
            full_building_cells=int((inside & (arrays[5] == 1)).sum()),
        )
        save_json(meta, info)
        return info | {"cached": True}
    start = time.monotonic()
    with rasterio.open(REF) as ref:
        win = Window(col, row, width, height)
        transform = ref.window_transform(win)
    rr, cc = np.indices((height, width))
    xs = transform.c + (cc + 0.5) * 100
    ys = transform.f - (rr + 0.5) * 100
    kmap = kmap_grid(xs, ys)
    try:
        dem, dem_tiles = read_dem_to_grid(transform, width, height)
    except ValueError:
        dem = np.full((height, width), np.nan, "float32")
        dem_tiles = []
    heights, unknown, counts = building_height_grid(transform, width, height)
    lon, lat = TO_LONLAT.transform(float(xs.mean()), float(ys.mean()))
    # A fixed midsummer solar geometry makes adjacent weather interpolation reproducible.
    times = pd.DatetimeIndex([f"2023-08-01 {h:02d}:00:00+09:00" for h in HOURS])
    sun = pvlib.solarposition.get_solarposition(times, lat, lon)
    bands = []
    shades = []
    unknown_fraction = None
    for h, (_, s) in zip(HOURS, sun.iterrows()):
        shade, building_fraction, unknown_fraction = shade_fraction(
            heights,
            unknown,
            float(s.apparent_elevation),
            float(s.azimuth),
            height,
            width,
        )
        t, rh, pressure, wind, station_distance = interpolated_weather(
            stations, xs, ys, dem, h
        )
        # Solar geometry and shadow direction use the 20 km tile centre.
        zenith = float(s.apparent_zenith)
        cosz = math.cos(math.radians(zenith))
        ghi = kmap[h].ravel()
        split = pvlib.irradiance.erbs(ghi, np.full(len(ghi), zenith), 213)
        diffuse = np.asarray(split["dhi"])
        direct = np.maximum(0, ghi - diffuse) * (1 - shade.ravel())
        solar = diffuse + direct
        frac = np.divide(direct, solar, out=np.zeros_like(solar), where=solar > 0)
        valid = (
            inside.ravel()
            & np.isfinite(dem.ravel())
            & np.isfinite(solar)
            & np.isfinite(shade.ravel())
        )
        v = np.full(len(ghi), np.nan, "float32")
        v[valid] = (
            thermofeel.calculate_wbgt_liljegren(
                t[valid] + 273.15,
                rh[valid],
                pressure[valid],
                wind[valid],
                solar[valid],
                np.clip(frac[valid], 0, 0.9),
                np.full(valid.sum(), cosz),
                wind_scaling="brode",
            )
            - 273.15
        )
        bands.append(v.reshape(height, width))
        shades.append(shade)
    stack = np.stack(bands)
    valid = np.isfinite(stack).all(axis=0)
    maximum = np.full((height, width), np.nan, "float32")
    maximum[valid] = stack[:, valid].max(axis=0)
    arrays = [
        maximum,
        *bands,
        np.mean(shades, axis=0),
        building_fraction,
        unknown_fraction,
        dem,
        station_distance.reshape(height, width) / 1000,
    ]
    profile = dict(
        driver="GTiff",
        width=width,
        height=height,
        count=len(arrays),
        crs="EPSG:5179",
        transform=transform,
        dtype="float32",
        nodata=NODATA,
        compress="deflate",
        predictor=3,
        tiled=True,
        blockxsize=256,
        blockysize=256,
    )
    temp = path.with_suffix(".tmp.tif")
    with rasterio.open(temp, "w", **profile) as ds:
        for i, array in enumerate(arrays, 1):
            ds.write(
                np.where(inside & np.isfinite(array), array, NODATA).astype("float32"),
                i,
            )
        ds.descriptions = (
            "wbgt_max_c",
            "wbgt_09_c",
            "wbgt_12_c",
            "wbgt_15_c",
            "building_shade_fraction_mean",
            "building_fraction",
            "unknown_building_height_fraction",
            "dem_m",
            "nearest_eligible_station_km",
        )
        ds.update_tags(model=MODEL)
    temp.replace(path)
    values = maximum[valid]
    info = {
        "tile": path.name,
        "row": row,
        "col": col,
        "width": width,
        "height": height,
        "cells": int(inside.sum()),
        "valid": int(valid.sum()),
        "min": float(values.min()) if len(values) else None,
        "max": float(values.max()) if len(values) else None,
        "sum": float(values.sum(dtype="float64")),
        "buildings_with_buffer": counts,
        "dem_tiles": dem_tiles,
        "elapsed_s": round(time.monotonic() - start, 2),
        "missing_dem_cells": int((inside & ~np.isfinite(dem)).sum()),
        "missing_solar_cells": int(
            (inside & ~np.isfinite(np.stack(list(kmap.values()))).all(axis=0)).sum()
        ),
        "full_building_cells": int((inside & (building_fraction == 1)).sum()),
    }
    info["boundary_mask_applied"] = True
    save_json(meta, info)
    return info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    out = args.out
    (out / "tiles").mkdir(parents=True, exist_ok=True)
    stations = prepare_weather(out)
    tasks = []
    with rasterio.open(REF) as ref:
        profile = ref.profile.copy()
    with rasterio.open(prepare_mask(out)) as ds:
        for row in range(0, ds.height, TILE):
            for col in range(0, ds.width, TILE):
                h = min(TILE, ds.height - row)
                w = min(TILE, ds.width - col)
                if (
                    ~np.ma.getmaskarray(
                        ds.read(1, window=Window(col, row, w, h), masked=True)
                    )
                ).any():
                    tasks.append((row, col, h, w))
    if args.limit:
        tasks = tasks[: args.limit]
    save_json(
        out / "run.json",
        {
            "model": MODEL,
            "tiles": len(tasks),
            "stations": len(stations),
            "status": "running",
        },
    )
    infos = []
    failures = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_tile, task, str(out), stations): task for task in tasks
        }
        for future in as_completed(futures):
            task = futures[future]
            try:
                info = future.result()
                infos.append(info)
                print(
                    json.dumps(
                        {
                            "done": len(infos),
                            "total": len(tasks),
                            "tile": info["tile"],
                            "valid": info["valid"],
                            "seconds": info["elapsed_s"],
                            "cached": info.get("cached", False),
                        }
                    ),
                    flush=True,
                )
            except Exception as exc:
                failures.append({"task": task, "error": str(exc)})
                print(json.dumps({"FAILED": task, "error": str(exc)}), flush=True)
            save_json(
                out / "run.json",
                {
                    "model": MODEL,
                    "tiles": len(tasks),
                    "completed": len(infos),
                    "failures": failures,
                    "stations": len(stations),
                    "status": "running",
                },
            )
    if failures:
        raise RuntimeError(
            f"{len(failures)} tiles failed; see run.json, rerun to resume"
        )
    if args.limit:
        return
    profile.update(
        count=1,
        compress="deflate",
        predictor=3,
        tiled=True,
        blockxsize=512,
        blockysize=512,
    )
    target = out / "h11_wbgt_spatial_reference_national_100m.tif"
    with rasterio.open(target, "w", **profile) as ds:
        # Explicitly initialize absent ocean blocks to nodata; zero is a valid WBGT.
        for _, win in ds.block_windows(1):
            ds.write(
                np.full((int(win.height), int(win.width)), NODATA, "float32"),
                1,
                window=win,
            )
        for info in infos:
            with rasterio.open(out / "tiles" / info["tile"]) as tile:
                ds.write(
                    tile.read(1),
                    1,
                    window=Window(
                        info["col"], info["row"], info["width"], info["height"]
                    ),
                )
        ds.update_tags(indicator="H11", quality=MODEL, unit="degC")
    valid = sum(i["valid"] for i in infos)
    metadata = {
        "indicator_id": "H11",
        "indicator_name": "전국 100m 폭염 대표조건 WBGT (건물·지형 반영 시험)",
        "quality_status": MODEL,
        "unit": "℃",
        "period_start": "2021-06-01",
        "period_end": "2025-09-30",
        "source_resolution": "KMAP solar 100m; NGII DEM 90m; building footprints; ASOS interpolated meteorology",
        "analysis_resolution": "100m",
        "grid_spec_id": "NATIONAL_100M_EPSG5179",
        "aggregation": "maximum of representative 09/12/15 KST estimates; all three hours required",
        "method": {
            "meteorology": "6 nearest ASOS stations, inverse-distance-squared interpolation; eligible five-year complete-day stations; hourly medians of per-year complete-day WBGT P90 hot days",
            "radiation": "KMAP 2016-07 to 2021-06 mean horizontal irradiance with terrain shielding; Erbs direct/diffuse estimate; building shadow attenuates direct only",
            "terrain": "NGII DEM bilinear; temperature 6.5 K/km lapse, constant interpolated vapor pressure, barometric station-pressure adjustment",
            "buildings": "floors x 3.3m, reported height fallback; <=600m; 10m centre sampling; 800m tile buffer; maximum roof height for overlaps",
            "result": "100m outdoor subcell mean shade, then Liljegren WBGT; maximum of three representative hours",
        },
        "assumptions": {
            "time_alignment": "synthetic hot-weather climatological conditions, not actual-date or five-year-mean WBGT",
            "solar_geometry": "August 1, 2023 at 09/12/15 KST; solar position at 20km tile centre",
            "terrain_double_counting": "KMAP terrain shading retained; no additional terrain-shadow multiplier",
            "vegetation": "excluded by user scope",
            "wind": "ASOS interpolation; local building ventilation not modeled",
            "longwave": "Liljegren defaults; explicit urban surface temperature/SVF/longwave exchanges not modeled",
            "surface_albedo": 0.45,
            "unknown_building_height": "footprint excluded from outdoor area; no invented shadow height; diagnostic band retained",
            "no_data": "missing DEM/solar or fully roof-covered cells remain nodata; no ASOS-only fallback",
            "use": "experimental spatial screening; not independently validated local WBGT measurements",
        },
        "input_counts": {
            "stations": len(stations),
            "dem_tiles": len(set(p for i in infos for p in i["dem_tiles"])),
            "tiles": len(infos),
        },
        "width": profile["width"],
        "height": profile["height"],
        "transform": list(profile["transform"])[:6],
        "nodata": NODATA,
        "valid_cell_count": valid,
        "target_cell_count": sum(i["cells"] for i in infos),
        "min": min(i["min"] for i in infos if i["min"] is not None),
        "max": max(i["max"] for i in infos if i["max"] is not None),
        "mean": sum(i["sum"] for i in infos) / valid,
        "output_checksum_sha256": sha256(target),
    }
    save_json(target.with_suffix(".metadata.json"), metadata)
    save_json(
        out / "run.json",
        {
            "model": MODEL,
            "status": "complete",
            "tiles": len(infos),
            "valid": valid,
            "failures": [],
        },
    )
    print(
        json.dumps(
            {
                "complete": str(target),
                "valid": valid,
                "range": [metadata["min"], metadata["max"]],
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
