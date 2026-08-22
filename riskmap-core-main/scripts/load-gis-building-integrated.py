#!/usr/bin/env python3
"""Load official VWorld GIS building integrated SHP archives into PostGIS."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DATA_ROOT = WORKSPACE_ROOT / "data" / "LivingLabs_flood_national" / "04_vulnerability" / "gis_building_integrated"
RAW_ROOT = DATA_ROOT / "raw"
EXTRACT_ROOT = DATA_ROOT / "extracted"


def extract_archives(archives: list[Path]) -> None:
    EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
    for archive in archives:
        target = EXTRACT_ROOT / archive.stem
        marker = target / ".complete"
        if marker.exists():
            continue
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(target)
        marker.write_text(archive.name, encoding="utf-8")


def prepare_schema() -> None:
    pg_bin = Path(os.environ.get("VWORLD_PG_BIN", r"D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin"))
    psql = pg_bin / "psql.exe"
    connection = [
        "-h", os.environ.get("VWORLD_POSTGIS_HOST", "127.0.0.1"),
        "-p", os.environ.get("VWORLD_POSTGIS_PORT", "55432"),
        "-U", os.environ.get("VWORLD_POSTGIS_USER", "postgres"),
        "-d", os.environ.get("VWORLD_POSTGIS_DATABASE", "vworld_cadastral"),
        "-v", "ON_ERROR_STOP=1",
    ]
    subprocess.run(
        [str(psql), *connection, "-c", "CREATE SCHEMA IF NOT EXISTS raw; CREATE SCHEMA IF NOT EXISTS analysis;"],
        check=True,
    )

def run_ogr(shapefiles: list[Path], replace: bool, source_crs: str | None) -> None:
    ogr2ogr = shutil.which("ogr2ogr")
    if not ogr2ogr:
        raise RuntimeError("ogr2ogr is required. Run this script in the lh_gis Conda environment.")
    host = os.environ.get("VWORLD_POSTGIS_HOST", "127.0.0.1")
    port = os.environ.get("VWORLD_POSTGIS_PORT", "55432")
    database = os.environ.get("VWORLD_POSTGIS_DATABASE", "vworld_cadastral")
    user = os.environ.get("VWORLD_POSTGIS_USER", "postgres")
    password = os.environ.get("VWORLD_POSTGIS_PASSWORD", "")
    pg = f"PG:host={host} port={port} dbname={database} user={user}"
    if password:
        pg += f" password={password}"
    for index, shapefile in enumerate(shapefiles):
        command = [
            ogr2ogr, "-f", "PostgreSQL", pg, str(shapefile),
            "-nln", "raw.gis_building_integrated",
            "-nlt", "PROMOTE_TO_MULTI",
            "-t_srs", "EPSG:5179",
            "-lco", "GEOMETRY_NAME=geom",
            "-lco", "FID=source_fid",
            "-makevalid",
            "-oo", "ENCODING=CP949",
            "-skipfailures",
            "-progress",
        ]
        if source_crs:
            command.extend(["-s_srs", source_crs])
        if index == 0 and replace:
            command.extend(["-overwrite"])
        else:
            command.extend(["-append", "-addfields"])
        subprocess.run(command, check=True)


def finalize() -> None:
    pg_bin = Path(os.environ.get("VWORLD_PG_BIN", r"D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin"))
    psql = pg_bin / "psql.exe"
    connection = [
        "-h", os.environ.get("VWORLD_POSTGIS_HOST", "127.0.0.1"),
        "-p", os.environ.get("VWORLD_POSTGIS_PORT", "55432"),
        "-U", os.environ.get("VWORLD_POSTGIS_USER", "postgres"),
        "-d", os.environ.get("VWORLD_POSTGIS_DATABASE", "vworld_cadastral"),
        "-v", "ON_ERROR_STOP=1",
    ]
    sql = """
      CREATE INDEX IF NOT EXISTS gis_building_integrated_geom_gix
        ON raw.gis_building_integrated USING gist (geom);
      ANALYZE raw.gis_building_integrated;
      CREATE TABLE IF NOT EXISTS analysis.building_source_catalog (
        source_key text PRIMARY KEY,
        source_table regclass NOT NULL,
        source_name text NOT NULL,
        source_url text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO analysis.building_source_catalog VALUES (
        'gis_building_integrated', 'raw.gis_building_integrated',
        '국토교통부 GIS건물통합정보',
        'https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18', now()
      ) ON CONFLICT (source_key) DO UPDATE SET source_table=EXCLUDED.source_table, updated_at=now();
    """
    subprocess.run([str(psql), *connection, "-c", sql], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", action="append", type=Path)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--source-crs")
    args = parser.parse_args()
    RAW_ROOT.mkdir(parents=True, exist_ok=True)
    archives = args.archive or sorted(RAW_ROOT.glob("*.zip"))
    if not archives:
        raise FileNotFoundError(
            "GIS 건물통합정보 ZIP이 없습니다. 브이월드 dsId=18에서 내려받아 "
            f"{RAW_ROOT} 에 넣으세요."
        )
    extract_archives(archives)
    shapefiles = sorted(EXTRACT_ROOT.rglob("*.shp"))
    if not shapefiles:
        raise FileNotFoundError("No SHP files were found after extraction")
    prepare_schema()
    run_ogr(shapefiles, args.replace, args.source_crs)
    finalize()
    report = {"archives": [str(path) for path in archives], "shapefiles": len(shapefiles)}
    (DATA_ROOT / "load_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, **report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
