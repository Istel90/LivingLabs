#!/usr/bin/env python3
"""Recover verified national Earth Engine GeoTIFF exports from Google Drive."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import ee
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

PROJECT = "livinglabprojects"
DRIVE_FOLDER = "LivingLabs_GEE"
ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = ROOT / "data" / "LivingLabs_national_gee" / "raw"
MANIFEST = OUTPUT_ROOT.parent / "recovery_manifest.json"


def service():
    arguments = ee.oauth.get_credentials_arguments()
    return build("drive", "v3", credentials=Credentials(token=None, **arguments), cache_discovery=False)


def list_exports(drive) -> list[dict]:
    folder_query = f"name='{DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    folders = drive.files().list(q=folder_query, fields="files(id)").execute().get("files", [])
    if len(folders) != 1:
        raise RuntimeError(f"Expected one {DRIVE_FOLDER} folder, found {len(folders)}")
    query = f"'{folders[0]['id']}' in parents and trashed=false"
    return drive.files().list(
        q=query,
        pageSize=1000,
        orderBy="name",
        fields="files(id,name,size,md5Checksum,modifiedTime)",
    ).execute().get("files", [])


def md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def recover(drive, item: dict) -> dict:
    target = OUTPUT_ROOT / item["name"]
    expected_size = int(item.get("size") or 0)
    expected_md5 = item.get("md5Checksum")
    if target.exists() and target.stat().st_size == expected_size and (not expected_md5 or md5(target) == expected_md5):
        return {**item, "localPath": str(target), "status": "verified_cached"}
    partial = target.with_suffix(target.suffix + ".part")
    request = drive.files().get_media(fileId=item["id"])
    with partial.open("wb") as stream:
        downloader = MediaIoBaseDownload(stream, request, chunksize=8 * 1024 * 1024)
        complete = False
        while not complete:
            _, complete = downloader.next_chunk()
    Path(str(target) + ".aux.xml").unlink(missing_ok=True)
    partial.replace(target)
    actual_md5 = md5(target)
    if target.stat().st_size != expected_size or (expected_md5 and actual_md5 != expected_md5):
        raise RuntimeError(f"Drive verification failed: {item['name']}")
    return {**item, "localPath": str(target), "status": "downloaded"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pattern", default=".tif", help="Only recover names containing this text")
    args = parser.parse_args()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    ee.Initialize(project=PROJECT)
    drive = service()
    files = [item for item in list_exports(drive) if args.pattern.lower() in item["name"].lower()]
    recovered = []
    for index, item in enumerate(files, start=1):
        result = recover(drive, item)
        recovered.append(result)
        print(f"GEE recovery {index}/{len(files)}: {item['name']} ({result['status']})", flush=True)
        MANIFEST.write_text(json.dumps({"project": PROJECT, "folder": DRIVE_FOLDER, "files": recovered}, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "files": len(recovered), "bytes": sum(int(item.get('size') or 0) for item in recovered)}))


if __name__ == "__main__":
    main()
