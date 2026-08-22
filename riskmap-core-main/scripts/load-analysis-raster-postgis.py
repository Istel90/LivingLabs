#!/usr/bin/env python3
"""Load a tiled analysis GeoTIFF into a named PostGIS Raster table."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path

import numpy as np
import rasterio


NODATA = -9999.0


def normalized_raster(source: Path) -> tuple[Path, int]:
    target = source.with_name(f"{source.stem}.postgis{source.suffix}")
    if target.exists() and target.stat().st_mtime_ns >= source.stat().st_mtime_ns:
        return target, 0
    partial = target.with_suffix(target.suffix + ".part")
    partial.unlink(missing_ok=True)
    replaced = 0
    with rasterio.open(source) as dataset:
        profile = dataset.profile.copy()
        profile.update(
            driver="GTiff",
            nodata=NODATA,
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
            BIGTIFF="YES",
        )
        with rasterio.open(partial, "w", **profile) as output:
            windows = [window for _, window in dataset.block_windows(1)]
            for band in range(1, dataset.count + 1):
                for window in windows:
                    values = dataset.read(band, window=window)
                    invalid = ~np.isfinite(values)
                    replaced += int(np.count_nonzero(invalid))
                    if invalid.any():
                        values[invalid] = NODATA
                    output.write(values, band, window=window)
                if dataset.descriptions[band - 1]:
                    output.set_band_description(band, dataset.descriptions[band - 1])
                output.update_tags(band, **dataset.tags(band))
            output.update_tags(**dataset.tags())
    Path(str(target) + ".aux.xml").unlink(missing_ok=True)
    partial.replace(target)
    return target, replaced

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raster", type=Path, required=True)
    parser.add_argument("--table", required=True, help="Unqualified table name in the analysis schema")
    parser.add_argument("--dataset-key", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    if not args.raster.exists():
        raise FileNotFoundError(args.raster)
    raster_path, replaced_nan = normalized_raster(args.raster)
    if not re.fullmatch(r"[a-z][a-z0-9_]*", args.table):
        raise ValueError("table must contain lowercase letters, digits, and underscores only")

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
    subprocess.run(
        [str(psql), *connection, "-c", "CREATE EXTENSION IF NOT EXISTS postgis_raster; CREATE SCHEMA IF NOT EXISTS analysis;"],
        check=True,
    )
    producer = subprocess.Popen(
        [
            str(raster2pgsql), "-s", "5179", "-t", "256x256", "-I", "-C", "-M", "-d",
            str(raster_path), f"analysis.{args.table}",
        ],
        stdout=subprocess.PIPE,
    )
    consumer = subprocess.run([str(psql), *connection], stdin=producer.stdout)
    if producer.stdout:
        producer.stdout.close()
    producer_code = producer.wait()
    if producer_code or consumer.returncode:
        raise RuntimeError("raster2pgsql load failed")
    safe_key = args.dataset_key.replace("'", "''")
    safe_source = args.source.replace("'", "''")
    sql = f"""
      CREATE TABLE IF NOT EXISTS analysis.analysis_raster_catalog (
        dataset_key text PRIMARY KEY,
        table_name regclass NOT NULL,
        source text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO analysis.analysis_raster_catalog (dataset_key, table_name, source, updated_at)
      VALUES ('{safe_key}', 'analysis.{args.table}', '{safe_source}', now())
      ON CONFLICT (dataset_key) DO UPDATE SET
        table_name=EXCLUDED.table_name, source=EXCLUDED.source, updated_at=now();
    """
    subprocess.run([str(psql), *connection, "-c", sql], check=True)
    print(f"loaded {args.dataset_key} -> analysis.{args.table}; normalized_nan={replaced_nan}")


if __name__ == "__main__":
    main()
