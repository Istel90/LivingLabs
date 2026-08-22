#!/usr/bin/env python3
"""Export national GHSL built-environment indicators from Earth Engine."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import ee
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

PROJECT = "livinglabprojects"
DRIVE_FOLDER = "LivingLabs_GEE"
FILE_STEM = "kor_gee_built_environment_100m_epsg5179"
FILE_NAME = f"{FILE_STEM}.tif"
ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = ROOT / "data" / "LivingLabs_flood_national" / "04_vulnerability" / "earth_engine_ghsl"
OUTPUT = OUTPUT_ROOT / FILE_NAME
STATE = OUTPUT_ROOT / "export_state.json"
CRS = "EPSG:5179"
CRS_TRANSFORM = [100, 0, 700000, 0, -100, 2100000]


def region() -> ee.Geometry:
    return ee.Geometry.Rectangle([700000, 1400000, 1400000, 2100000], CRS, False)


def drive_service():
    arguments = ee.oauth.get_credentials_arguments()
    return build("drive", "v3", credentials=Credentials(token=None, **arguments), cache_discovery=False)


def drive_folder(service) -> dict:
    query = f"name='{DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    folders = service.files().list(q=query, fields="files(id,name)").execute().get("files", [])
    if len(folders) != 1:
        raise RuntimeError(f"Expected one {DRIVE_FOLDER} folder, found {len(folders)}")
    return folders[0]


def list_files(service, folder_id: str) -> list[dict]:
    query = f"'{folder_id}' in parents and trashed=false"
    return service.files().list(
        q=query,
        pageSize=1000,
        orderBy="modifiedTime desc",
        fields="files(id,name,size,md5Checksum,modifiedTime)",
    ).execute().get("files", [])


def built_image() -> ee.Image:
    epochs = {}
    for year in [1975, 1990, 2000, 2010, 2020]:
        epochs[year] = ee.Image(f"JRC/GHSL/P2023A/GHS_BUILT_S/{year}").select(
            "built_surface"
        ).rename(f"ghsl_built_surface_{year}_m2")
    built_2020 = ee.Image("JRC/GHSL/P2023A/GHS_BUILT_S/2020")
    nonresidential_surface = built_2020.select("built_surface_nres").rename(
        "ghsl_built_surface_nres_2020_m2"
    )
    nonresidential_fraction = nonresidential_surface.divide(
        epochs[2020].max(1)
    ).clamp(0, 1).rename("ghsl_nonresidential_fraction_2020")
    old_share = epochs[1990].divide(epochs[2020].max(1)).clamp(0, 1).rename(
        "ghsl_pre1990_built_share_proxy_2020"
    )
    height = ee.Image("JRC/GHSL/P2023A/GHS_BUILT_H/2018").select("built_height").rename(
        "ghsl_built_height_2018_m"
    )
    volume = ee.Image("JRC/GHSL/P2023A/GHS_BUILT_V/2020").select(
        ["built_volume_total", "built_volume_nres"],
        ["ghsl_built_volume_total_2020_m3", "ghsl_built_volume_nres_2020_m3"],
    )
    return ee.Image.cat(
        [
            *epochs.values(),
            nonresidential_surface,
            nonresidential_fraction,
            old_share,
            height,
            volume,
        ]
    ).toFloat()

def find_remote(files: list[dict]) -> dict | None:
    return next((item for item in files if item["name"] == FILE_NAME), None)


def start_export() -> ee.batch.Task:
    task = ee.batch.Export.image.toDrive(
        image=built_image(),
        description=FILE_STEM.upper(),
        folder=DRIVE_FOLDER,
        fileNamePrefix=FILE_STEM,
        region=region(),
        crs=CRS,
        crsTransform=CRS_TRANSFORM,
        maxPixels=1e13,
        fileFormat="GeoTIFF",
        formatOptions={"cloudOptimized": True, "noData": -9999},
    )
    task.start()
    return task


def wait(task: ee.batch.Task, poll_seconds: int) -> None:
    while True:
        status = task.status()
        STATE.write_text(json.dumps(status, indent=2), encoding="utf-8")
        print(json.dumps({"task": task.id, "state": status.get("state")}), flush=True)
        if status.get("state") in {"COMPLETED", "SUCCEEDED"}:
            return
        if status.get("state") in {"FAILED", "CANCELLED", "CANCEL_REQUESTED"}:
            raise RuntimeError(status)
        time.sleep(poll_seconds)


def download(service, remote: dict) -> dict:
    partial = OUTPUT.with_suffix(".tif.part")
    request = service.files().get_media(fileId=remote["id"])
    with partial.open("wb") as stream:
        downloader = MediaIoBaseDownload(stream, request, chunksize=8 * 1024 * 1024)
        complete = False
        while not complete:
            _, complete = downloader.next_chunk()
    Path(str(OUTPUT) + ".aux.xml").unlink(missing_ok=True)
    partial.replace(OUTPUT)
    digest = hashlib.md5(OUTPUT.read_bytes()).hexdigest()
    if remote.get("md5Checksum") and digest != remote["md5Checksum"]:
        raise RuntimeError("Google Drive checksum mismatch")
    report = {
        "file": str(OUTPUT),
        "bytes": OUTPUT.stat().st_size,
        "md5": digest,
        "remoteModifiedTime": remote.get("modifiedTime"),
        "proxyWarning": "GHSL pre-1990 built share is not an official building approval-date ratio.",
    }
    (OUTPUT_ROOT / "download_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--poll-seconds", type=int, default=30)
    parser.add_argument("--force-export", action="store_true")
    args = parser.parse_args()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    ee.Initialize(project=PROJECT)
    service = drive_service()
    folder = drive_folder(service)
    files = list_files(service, folder["id"])
    remote = None if args.force_export else find_remote(files)
    if remote is None:
        description = FILE_STEM.upper()
        task = next(
            (
                candidate
                for candidate in ee.batch.Task.list()
                if candidate.status().get("description") == description
                and candidate.status().get("state") in {"READY", "RUNNING"}
            ),
            None,
        )
        if task is None:
            task = start_export()
        wait(task, args.poll_seconds)
        remote = find_remote(list_files(service, folder["id"]))
    if remote is None:
        raise FileNotFoundError(FILE_NAME)
    print(json.dumps({"ok": True, **download(service, remote)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
