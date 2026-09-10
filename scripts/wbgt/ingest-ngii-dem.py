"""Verify browser-downloaded NGII DEM ZIPs and preserve them on the data drive."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import rasterio

NAME = re.compile(r"^\(B080\).*DEM_(\d+)_img_(\d{4})(?: \(\d+\))?\.zip$", re.I)


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inspect(path: Path, tile: str, year: int) -> dict:
    with zipfile.ZipFile(path) as archive:
        invalid = archive.testzip()
        if invalid:
            raise ValueError(f"ZIP checksum failed: {path.name}: {invalid}")
        members = [i for i in archive.infolist() if i.filename.lower().endswith(".img")]
        if len(members) != 1:
            raise ValueError(f"Expected one DEM raster: {path.name}")
        member = members[0]
    with rasterio.open(f"/vsizip/{path.as_posix()}/{member.filename}") as dataset:
        values = dataset.read(1, masked=True)
        valid = int(values.count())
        return {
            "tile": tile, "year": year, "filename": path.name,
            "bytes": path.stat().st_size, "sha256": sha256(path),
            "member": member.filename, "raster_bytes": member.file_size,
            "driver": dataset.driver, "crs": str(dataset.crs),
            "resolution": list(dataset.res), "shape": [dataset.height, dataset.width],
            "bounds": list(dataset.bounds), "transform": list(dataset.transform),
            "nodata": dataset.nodata, "valid_pixels": valid,
            "minimum": float(values.min()) if valid else None,
            "maximum": float(values.max()) if valid else None,
            "empty_tile": not valid,
            "status": "verified",
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--destination", type=Path,
                        default=Path("D:/90_Data/LivingLabs/sources/NGII_DEM90"))
    args = parser.parse_args()
    root = args.destination.resolve()
    root.mkdir(parents=True, exist_ok=True)
    errors = []
    added = []
    for source in sorted(args.source.glob("*.zip")):
        match = NAME.match(source.name)
        if not match:
            continue
        tile, year_text = match.groups()
        destination = root / "raw" / year_text / re.sub(r" \(\d+\)(?=\.zip$)", "", source.name)
        try:
            if destination.exists():
                if sha256(source) != sha256(destination):
                    raise ValueError(f"Existing archive differs; preserved both: {source.name}")
                continue
            inspect(source, tile, int(year_text))
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            if sha256(source) != sha256(destination):
                raise ValueError(f"Copied archive checksum mismatch: {destination.name}")
            added.append(f"{year_text}/{tile}")
        except (OSError, ValueError, zipfile.BadZipFile, rasterio.errors.RasterioError) as error:
            errors.append({"file": source.name, "error": str(error)})

    records = []
    for archive in sorted((root / "raw").glob("*/*.zip")):
        match = NAME.match(archive.name)
        if not match:
            continue
        tile, year_text = match.groups()
        record = inspect(archive, tile, int(year_text))
        raster = root / "rasters" / year_text / f"{tile}.img"
        if not raster.exists():
            raster.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(archive) as container:
                # Fixed output name avoids trusting archive member paths.
                with container.open(record["member"]) as source, raster.open("xb") as target:
                    shutil.copyfileobj(source, target)
        if raster.stat().st_size != record["raster_bytes"]:
            raise ValueError(f"Extracted raster size mismatch: {raster}")
        record["archive_path"] = str(archive.relative_to(root)).replace("\\", "/")
        record["raster_path"] = str(raster.relative_to(root)).replace("\\", "/")
        records.append(record)

    catalog_path = root / "catalog_2025.json"
    expected = set(json.loads(catalog_path.read_text(encoding="utf-8"))["tiles"]) if catalog_path.exists() else set()
    actual = {record["tile"] for record in records if record["year"] == 2025}
    missing = sorted(expected - actual)
    manifest = {
        "updated_utc": datetime.now(timezone.utc).isoformat(),
        "source": "https://map.ngii.go.kr/ms/map/NlipMap.do",
        "transfer": "NGII browser form and INNORIX download UI",
        "verified_files": len(records),
        "nationwide_complete": bool(expected) and not missing and not errors,
        "catalog_expected": len(expected), "catalog_missing": missing,
        "catalog_complete": bool(expected) and not missing,
        "files": records, "ingestion_errors": errors,
    }
    temporary = root / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(root / "manifest.json")
    print(json.dumps({"destination": str(root), "added": added,
                      "verified_files": len(records), "catalog_missing": len(missing),
                      "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
