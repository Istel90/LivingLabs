#!/usr/bin/env python3
"""Load official VWorld GIS building integrated SHP archives into PostGIS."""

from __future__ import annotations

import argparse
import json
import mmap
import os
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


def sanitize_dbf_control_chars(dbf_paths: list[Path]) -> int:
    """Replace DBF record control bytes in one blockwise pass without touching headers."""
    translation = bytes.maketrans(b"\x00\x09\x0a\x0d\x1a", b"     ")
    files_changed = 0
    chunk_size = 16 * 1024 * 1024
    for dbf_path in dbf_paths:
        changed = False
        with dbf_path.open("r+b") as handle:
            with mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_WRITE) as data:
                if len(data) < 33:
                    continue
                header_length = int.from_bytes(data[8:10], "little")
                record_end = len(data) - 1 if data[-1] == 0x1A else len(data)
                for start in range(header_length, record_end, chunk_size):
                    end = min(start + chunk_size, record_end)
                    original = data[start:end]
                    normalized = original.translate(translation)
                    if normalized != original:
                        data[start:end] = normalized
                        changed = True
        files_changed += int(changed)
    print(f"DBF files normalized: {files_changed}/{len(dbf_paths)}", flush=True)
    return files_changed


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

def run_loader(shapefiles: list[Path], replace: bool, source_crs: str | None) -> None:
    pg_bin = Path(os.environ.get("VWORLD_PG_BIN", r"D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin"))
    shp2pgsql = pg_bin / "shp2pgsql.exe"
    psql = pg_bin / "psql.exe"
    if not shp2pgsql.exists():
        raise FileNotFoundError(shp2pgsql)
    connection = [
        "-h", os.environ.get("VWORLD_POSTGIS_HOST", "127.0.0.1"),
        "-p", os.environ.get("VWORLD_POSTGIS_PORT", "55432"),
        "-U", os.environ.get("VWORLD_POSTGIS_USER", "postgres"),
        "-d", os.environ.get("VWORLD_POSTGIS_DATABASE", "vworld_cadastral"),
        "-v", "ON_ERROR_STOP=1",
    ]
    source_srid = (source_crs or "EPSG:5186").split(":")[-1]
    if replace:
        subprocess.run(
            [str(psql), *connection, "-c", "DROP TABLE IF EXISTS raw.gis_building_integrated;"],
            check=True,
        )
    for index, shapefile in enumerate(shapefiles, start=1):
        mode = "-c" if index == 1 else "-a"
        print(f"Building load {index}/{len(shapefiles)}: {shapefile.name}", flush=True)
        producer = subprocess.Popen(
            [
                str(shp2pgsql), mode, "-D", "-s", f"{source_srid}:5179",
                "-W", "CP949", "-g", "geom", str(shapefile),
                "raw.gis_building_integrated",
            ],
            stdout=subprocess.PIPE,
        )
        consumer = subprocess.run([str(psql), *connection], stdin=producer.stdout)
        if producer.stdout:
            producer.stdout.close()
        producer_code = producer.wait()
        if producer_code or consumer.returncode:
            raise RuntimeError(f"PostGIS SHP load failed: {shapefile}")

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
        U&'\AD6D\D1A0\AD50\D1B5\BD80 GIS\AC74\BB3C\D1B5\D569\C815\BCF4',
        'https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18', now()
      ) ON CONFLICT (source_key) DO UPDATE SET source_table=EXCLUDED.source_table, source_name=EXCLUDED.source_name, source_url=EXCLUDED.source_url, updated_at=now();
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
    sanitize_dbf_control_chars(sorted(EXTRACT_ROOT.rglob("*.dbf")))
    shapefiles = sorted(EXTRACT_ROOT.rglob("*.shp"))
    if not shapefiles:
        raise FileNotFoundError("No SHP files were found after extraction")
    prepare_schema()
    run_loader(shapefiles, args.replace, args.source_crs)
    finalize()
    report = {"archives": [str(path) for path in archives], "shapefiles": len(shapefiles)}
    (DATA_ROOT / "load_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, **report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
