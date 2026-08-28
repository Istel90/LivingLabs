#!/usr/bin/env python3
"""Export and download one nationwide 100 m summer LST P90 layer per year."""

from __future__ import annotations

import argparse
import importlib.util
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import ee


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE_PATH = HERE / "national-indicator-queue.py"
OUTPUT_DIR = ROOT / "riskmap-core-main/data/raw/gee/indicators/lst-yearly"
MANIFEST_PATH = ROOT / "riskmap-core-main/static/analysis-data/national/gee-lst-yearly-manifest.json"
YEARS = range(2021, 2026)


def load_base():
    spec = importlib.util.spec_from_file_location("national_indicator_queue", BASE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {BASE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def filename(year: int) -> str:
    return f"kor_lst_summer_p90_{year}_100m_epsg5179.tif"


def export_task(base, year: int) -> ee.batch.Task:
    image = (base.annual_p90_collection()
             .filter(ee.Filter.eq("year", year))
             .first()
             .rename(f"lst_summer_p90_{year}")
             .clip(base.korea())
             .toFloat())
    stem = Path(filename(year)).stem
    task = ee.batch.Export.image.toDrive(
        image=image,
        description=stem.upper(),
        folder=base.DRIVE_FOLDER,
        fileNamePrefix=stem,
        region=base.korea(),
        scale=base.SCALE,
        crs=base.CRS,
        maxPixels=1e13,
        fileFormat="GeoTIFF",
        formatOptions={"cloudOptimized": True, "noData": -9999},
    )
    task.start()
    return task


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    base = load_base()
    print("Initializing Earth Engine...", flush=True)
    base.init_ee()
    print("Earth Engine initialized. Connecting to Drive...", flush=True)
    drive = base.drive_service()
    print("Drive client ready.", flush=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = []

    for year in YEARS:
        name = filename(year)
        target = OUTPUT_DIR / name
        if target.exists() and not args.force:
            entries.append({"year": year, "file": name, "sizeBytes": target.stat().st_size, "status": "COMPLETED", "reused": True})
            print(f"[{year}] local file reused: {target}", flush=True)
            continue

        try:
            remote = base.find_drive_file(drive, name)
            task_id = None
            print(f"[{year}] existing Drive export found", flush=True)
        except RuntimeError:
            task = export_task(base, year)
            task_id = task.id
            print(f"[{year}] submitted Earth Engine task {task_id}", flush=True)
            while True:
                status = task.status()
                state = status.get("state")
                print(f"[{year}] {state}", flush=True)
                if state == "COMPLETED":
                    break
                if state in {"FAILED", "CANCELLED"}:
                    raise RuntimeError(status.get("error_message") or f"Earth Engine task {state}")
                time.sleep(max(5, args.poll_seconds))
            remote = base.find_drive_file(drive, name)

        size, md5 = base.download_verify(drive, remote, name)
        downloaded = base.OUTPUT_DIR / name
        downloaded.replace(target)
        entries.append({"year": year, "file": name, "sizeBytes": size, "md5": md5, "status": "COMPLETED", "taskId": task_id})
        print(f"[{year}] downloaded {size:,} bytes", flush=True)

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps({
        "title": "Annual nationwide Landsat summer LST P90",
        "source": "Google Earth Engine Landsat 8/9 Collection 2 Level 2 ST_B10",
        "years": list(YEARS),
        "summerMonths": [6, 7, 8, 9],
        "crs": base.CRS,
        "scaleMeters": base.SCALE,
        "generatedAt": utcnow(),
        "layers": entries,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Manifest written: {MANIFEST_PATH}", flush=True)


if __name__ == "__main__":
    main()
