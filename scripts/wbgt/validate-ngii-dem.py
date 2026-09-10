from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import rasterio


TILE_RE = re.compile(r"_(\d{5})_img_(\d{4})(?: \(\d+\))?\.zip$", re.IGNORECASE)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate an ingested NGII DEM collection.")
    parser.add_argument("root", type=Path)
    parser.add_argument("--year", type=int, default=2025)
    args = parser.parse_args()

    raw = args.root / "raw" / str(args.year)
    rasters = args.root / "rasters" / str(args.year)
    archives = sorted(raw.glob("*.zip"))
    raster_files = sorted(rasters.glob("*.img"))
    errors: list[dict[str, str]] = []
    archive_tiles: list[str] = []

    for archive in archives:
        match = TILE_RE.search(archive.name)
        if not match:
            errors.append({"file": archive.name, "error": "unexpected archive filename"})
            continue
        tile, year = match.groups()
        archive_tiles.append(tile)
        if int(year) != args.year:
            errors.append({"file": archive.name, "error": f"unexpected year {year}"})
        try:
            with zipfile.ZipFile(archive) as zf:
                bad_member = zf.testzip()
                img_members = [name for name in zf.namelist() if name.lower().endswith(".img")]
                if bad_member:
                    errors.append({"file": archive.name, "error": f"CRC failure: {bad_member}"})
                if len(img_members) != 1:
                    errors.append({"file": archive.name, "error": f"expected one IMG, found {len(img_members)}"})
                elif Path(img_members[0]).stem != tile:
                    errors.append({"file": archive.name, "error": f"IMG tile mismatch: {img_members[0]}"})
        except (OSError, zipfile.BadZipFile) as exc:
            errors.append({"file": archive.name, "error": str(exc)})

    raster_tiles: list[str] = []
    crs_counts: Counter[str] = Counter()
    resolution_counts: Counter[str] = Counter()
    driver_counts: Counter[str] = Counter()
    for raster in raster_files:
        raster_tiles.append(raster.stem)
        try:
            with rasterio.open(raster) as dataset:
                crs_counts[str(dataset.crs)] += 1
                resolution_counts[f"{abs(dataset.res[0]):g}x{abs(dataset.res[1]):g}"] += 1
                driver_counts[dataset.driver] += 1
        except (OSError, rasterio.errors.RasterioError) as exc:
            errors.append({"file": raster.name, "error": str(exc)})

    archive_duplicates = sorted(tile for tile, count in Counter(archive_tiles).items() if count > 1)
    raster_duplicates = sorted(tile for tile, count in Counter(raster_tiles).items() if count > 1)
    missing_rasters = sorted(set(archive_tiles) - set(raster_tiles))
    orphan_rasters = sorted(set(raster_tiles) - set(archive_tiles))
    manifest_path = args.root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    empty_tiles = sorted(record["tile"] for record in manifest.get("files", []) if record.get("empty_tile"))

    report = {
        "validated_utc": datetime.now(timezone.utc).isoformat(),
        "root": str(args.root),
        "year": args.year,
        "archive_count": len(archives),
        "raster_count": len(raster_files),
        "unique_archive_tiles": len(set(archive_tiles)),
        "unique_raster_tiles": len(set(raster_tiles)),
        "archive_duplicates": archive_duplicates,
        "raster_duplicates": raster_duplicates,
        "missing_rasters": missing_rasters,
        "orphan_rasters": orphan_rasters,
        "crs_counts": dict(crs_counts),
        "resolution_counts": dict(resolution_counts),
        "driver_counts": dict(driver_counts),
        "empty_tiles": empty_tiles,
        "archive_bytes": sum(path.stat().st_size for path in archives),
        "raster_bytes": sum(path.stat().st_size for path in raster_files),
        "errors": errors,
    }
    report["complete"] = (
        len(archives) == 300
        and len(raster_files) == 300
        and len(set(archive_tiles)) == 300
        and len(set(raster_tiles)) == 300
        and not archive_duplicates
        and not raster_duplicates
        and not missing_rasters
        and not orphan_rasters
        and not errors
    )
    output = args.root / f"validation-{args.year}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
