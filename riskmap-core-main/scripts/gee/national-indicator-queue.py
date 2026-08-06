#!/usr/bin/env python3
"""Sequential national 100 m Earth Engine indicator export queue."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import ee
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


PROJECT = "livinglabprojects"
DRIVE_FOLDER = "LivingLabs_GEE"
CRS = "EPSG:5179"
SCALE = 100
ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = ROOT / "riskmap-core-main/data/raw/gee/indicators"
MANIFEST_PATH = ROOT / "riskmap-core-main/static/analysis-data/national/gee-indicator-manifest.json"
RUNTIME_DIR = ROOT / ".runtime-logs"
STATE_PATH = RUNTIME_DIR / "gee-indicator-queue.json"
LOG_PATH = RUNTIME_DIR / "gee-indicator-queue.log"
ERROR_LOG_PATH = RUNTIME_DIR / "gee-indicator-queue-error.log"

ORDER = [
    "lst_annual_summer_p90", "lst_summer_p90_trend", "ndbi_summer_median",
    "ndmi_summer_dry", "ndvi_summer_cover_frequency",
    "mndwi_summer_wet_frequency", "built_surface_probability",
    "bare_surface_probability", "tree_cover_probability",
    "green_cover_probability", "water_wetland_probability", "elevation",
    "slope", "aspect",
]

NAMES = {
    key: f"kor_{key}_2021_2025_100m_epsg5179.tif" for key in ORDER
}
NAMES.update({
    "elevation": "kor_elevation_100m_epsg5179.tif",
    "slope": "kor_slope_100m_epsg5179.tif",
    "aspect": "kor_aspect_100m_epsg5179.tif",
})


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for attempt in range(8):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 7:
                # Some Windows antivirus/indexing tools briefly lock the
                # destination. Preserve progress even when atomic replacement
                # remains unavailable.
                path.write_text(tmp.read_text(encoding="utf-8"), encoding="utf-8")
                tmp.unlink(missing_ok=True)
                return
            time.sleep(0.25 * (attempt + 1))


def setup() -> logging.Logger:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("gee-indicator-queue")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    for path, level in ((LOG_PATH, logging.INFO), (ERROR_LOG_PATH, logging.ERROR)):
        handler = logging.FileHandler(path, encoding="utf-8")
        handler.setLevel(level)
        handler.setFormatter(fmt)
        logger.addHandler(handler)
    logger.addHandler(logging.StreamHandler(sys.stdout))
    return logger


def initial_state() -> dict:
    return {
        "schemaVersion": 1, "project": PROJECT, "driveFolder": DRIVE_FOLDER,
        "crs": CRS, "scaleMeters": SCALE, "order": ORDER,
        "active": None, "items": {key: {"status": "PENDING"} for key in ORDER},
        "excluded": {"local_heat_anomaly": "deferred for redesign"},
        "updatedAt": utcnow(),
    }


def load_state() -> dict:
    if not STATE_PATH.exists():
        state = initial_state()
        atomic_json(STATE_PATH, state)
        return state
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save_state(state: dict) -> None:
    state["updatedAt"] = utcnow()
    atomic_json(STATE_PATH, state)


def init_ee() -> None:
    ee.Initialize(project=PROJECT)


def korea() -> ee.Geometry:
    return (ee.FeatureCollection("FAO/GAUL/2015/level0")
            .filter(ee.Filter.eq("ADM0_NAME", "Republic of Korea")).geometry())


def mask_scale_landsat(image: ee.Image) -> ee.Image:
    qa = image.select("QA_PIXEL")
    clear = (qa.bitwiseAnd(1 << 0).eq(0)
             .And(qa.bitwiseAnd(1 << 1).eq(0))
             .And(qa.bitwiseAnd(1 << 2).eq(0))
             .And(qa.bitwiseAnd(1 << 3).eq(0))
             .And(qa.bitwiseAnd(1 << 4).eq(0)))
    sat = image.select("QA_RADSAT").eq(0)
    optical = image.select(["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"]).multiply(0.0000275).add(-0.2)
    thermal = image.select("ST_B10").multiply(0.00341802).add(149.0).subtract(273.15).rename("lst")
    return (image.addBands(optical, overwrite=True).addBands(thermal)
            .updateMask(clear).updateMask(sat)
            .copyProperties(image, ["system:time_start"]))


def landsat() -> ee.ImageCollection:
    def summer_filter(collection: ee.ImageCollection) -> ee.ImageCollection:
        return (collection.filterBounds(korea())
                .filterDate("2021-01-01", "2026-01-01")
                .filter(ee.Filter.calendarRange(6, 9, "month"))
                .map(mask_scale_landsat))
    return summer_filter(ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")).merge(
        summer_filter(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")))


def annual_p90_collection() -> ee.ImageCollection:
    images = []
    source = landsat()
    for year in range(2021, 2026):
        image = (source.filter(ee.Filter.calendarRange(year, year, "year"))
                 .select("lst").reduce(ee.Reducer.percentile([90])).rename("lst_p90")
                 .set("year", year).set("system:time_start", ee.Date.fromYMD(year, 7, 1).millis()))
        images.append(image)
    return ee.ImageCollection.fromImages(images)


def indicator_image(key: str) -> ee.Image:
    ls = landsat()
    if key == "lst_annual_summer_p90":
        return annual_p90_collection().mean().rename(key)
    if key == "lst_summer_p90_trend":
        def add_year(image: ee.Image) -> ee.Image:
            year = ee.Number(image.get("year"))
            # Constants otherwise retain a different fixed integer range for
            # every year, making the ImageCollection heterogeneous in EE.
            return ee.Image.constant(year).toFloat().rename("year").addBands(
                image.select("lst_p90").toFloat()
            )
        return annual_p90_collection().map(add_year).select(["year", "lst_p90"]).reduce(ee.Reducer.linearFit()).select("scale").rename(key)
    if key in {"ndbi_summer_median", "ndmi_summer_dry", "ndvi_summer_cover_frequency", "mndwi_summer_wet_frequency"}:
        def indices(image: ee.Image) -> ee.Image:
            return ee.Image.cat([
                image.normalizedDifference(["SR_B6", "SR_B5"]).rename("ndbi"),
                image.normalizedDifference(["SR_B5", "SR_B6"]).rename("ndmi"),
                image.normalizedDifference(["SR_B5", "SR_B4"]).rename("ndvi"),
                image.normalizedDifference(["SR_B3", "SR_B6"]).rename("mndwi"),
            ]).copyProperties(image, ["system:time_start"])
        idx = ls.map(indices)
        if key == "ndbi_summer_median": return idx.select("ndbi").median().rename(key)
        if key == "ndmi_summer_dry": return idx.select("ndmi").median().multiply(-1).rename(key)
        if key == "ndvi_summer_cover_frequency": return idx.select("ndvi").map(lambda i: i.gte(0.35)).mean().rename(key)
        return idx.select("mndwi").map(lambda i: i.gte(0.1)).mean().rename(key)
    if key.endswith("_probability"):
        dw = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(korea())
              .filterDate("2021-01-01", "2026-01-01")
              .filter(ee.Filter.calendarRange(6, 9, "month")))
        bands = {
            "built_surface_probability": ["built"], "bare_surface_probability": ["bare"],
            "tree_cover_probability": ["trees"],
            "green_cover_probability": ["trees", "grass", "shrub_and_scrub", "crops"],
            "water_wetland_probability": ["water", "flooded_vegetation"],
        }[key]
        return dw.select(bands).mean().reduce(ee.Reducer.sum()).rename(key)
    dem = ee.Image("NASA/NASADEM_HGT/001").select("elevation")
    if key == "elevation": return dem.rename(key)
    terrain = ee.Terrain.products(dem)
    return terrain.select(key).rename(key)


def export_one(key: str) -> ee.batch.Task:
    stem = Path(NAMES[key]).stem
    task = ee.batch.Export.image.toDrive(
        image=indicator_image(key).clip(korea()).toFloat(), description=stem.upper(),
        folder=DRIVE_FOLDER, fileNamePrefix=stem, region=korea(), scale=SCALE,
        crs=CRS, maxPixels=1e13, fileFormat="GeoTIFF",
        formatOptions={"cloudOptimized": True, "noData": -9999},
    )
    task.start()
    return task


def drive_service():
    args = ee.oauth.get_credentials_arguments()
    return build("drive", "v3", credentials=Credentials(token=None, **args), cache_discovery=False)


def find_drive_file(service, filename: str) -> dict:
    folders = service.files().list(q=f"name='{DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields="files(id)").execute().get("files", [])
    if len(folders) != 1: raise RuntimeError(f"expected one Drive folder, found {len(folders)}")
    escaped = filename.replace("'", "\\'")
    q = f"'{folders[0]['id']}' in parents and name='{escaped}' and trashed=false"
    files = service.files().list(q=q, fields="files(id,name,size,md5Checksum,modifiedTime)").execute().get("files", [])
    if len(files) != 1: raise RuntimeError(f"expected one Drive file {filename}, found {len(files)}")
    return files[0]


def download_verify(service, remote: dict, filename: str) -> tuple[int, str]:
    dest = OUTPUT_DIR / filename
    with dest.open("wb") as fh:
        dl = MediaIoBaseDownload(fh, service.files().get_media(fileId=remote["id"]), chunksize=8 * 1024 * 1024)
        done = False
        while not done: _, done = dl.next_chunk()
    size = dest.stat().st_size
    md5 = hashlib.md5(dest.read_bytes()).hexdigest()
    if str(size) != remote.get("size") or md5 != remote.get("md5Checksum"):
        raise RuntimeError(f"download verification failed for {filename}")
    return size, md5


def update_manifest(key: str, task_id: str, size: int, md5: str) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entry = {"id": key, "file": NAMES[key], "status": "COMPLETED", "taskId": task_id,
             "sizeBytes": size, "md5": md5, "crs": CRS, "scaleMeters": SCALE,
             "completedAt": utcnow()}
    entries = [x for x in manifest.get("indicators", []) if x.get("id") != key]
    entries.append(entry)
    manifest["indicators"] = entries
    manifest["updatedAt"] = utcnow()
    atomic_json(MANIFEST_PATH, manifest)


def run(poll_seconds: int, logger: logging.Logger) -> None:
    init_ee()
    state = load_state()
    service = drive_service()

    def finish_task(key: str, task: ee.batch.Task) -> None:
        item = state["items"][key]
        while True:
            status = task.status()
            item["earthEngineState"] = status.get("state")
            save_state(state)
            if status.get("state") in {"COMPLETED", "SUCCEEDED", "FAILED", "CANCELLED"}: break
            time.sleep(poll_seconds)
        if status.get("state") not in {"COMPLETED", "SUCCEEDED"}:
            item.update({"status": "ERROR", "error": status.get("error_message", status)})
            state["active"] = None
            save_state(state)
            raise RuntimeError(f"Earth Engine task failed: {key}: {status}")
        remote = find_drive_file(service, NAMES[key])
        size, md5 = download_verify(service, remote, NAMES[key])
        update_manifest(key, task.id, size, md5)
        item.update({"status": "COMPLETED", "sizeBytes": size, "md5": md5, "completedAt": utcnow()})
        state["active"] = None
        save_state(state)
        logger.info("completed %s size=%s md5=%s", key, size, md5)

    active_key = state.get("active")
    if active_key:
        task_id = state["items"][active_key].get("taskId")
        task = next((candidate for candidate in ee.batch.Task.list() if candidate.id == task_id), None)
        if task is None:
            raise RuntimeError(f"could not recover active Earth Engine task: {active_key} ({task_id})")
        logger.info("resuming %s task=%s", active_key, task_id)
        finish_task(active_key, task)

    for key in ORDER:
        item = state["items"][key]
        if item.get("status") == "COMPLETED": continue
        active = [t for t in ee.batch.Task.list() if t.status().get("state") in {"READY", "RUNNING", "CANCEL_REQUESTED"}]
        if active: raise RuntimeError(f"refusing submission while EE task active: {[t.id for t in active]}")
        logger.info("submitting %s", key)
        task = export_one(key)
        item.pop("error", None)
        item.update({"status": "SUBMITTED", "taskId": task.id, "submittedAt": utcnow()})
        state["active"] = key
        save_state(state)
        finish_task(key, task)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--poll-seconds", type=int, default=60)
    parser.add_argument("--initialize-only", action="store_true")
    args = parser.parse_args()
    logger = setup()
    try:
        state = load_state()
        if args.initialize_only:
            print(json.dumps(state, ensure_ascii=False, indent=2)); return
        run(args.poll_seconds, logger)
    except Exception:
        logger.exception("queue stopped")
        raise


if __name__ == "__main__":
    main()
