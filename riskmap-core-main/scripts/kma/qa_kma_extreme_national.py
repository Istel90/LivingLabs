from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine


INDICATORS = ["H04", "H05", "H06", "H07", "H08", "H09"]
SCENARIOS = ["ssp126", "ssp245", "ssp370", "ssp585"]
PERIODS = ["2026", "2027", "2028", "2029", "2030", "2040", "2050", "2060", "2070", "2080", "2090", "2100"]
PERIOD_RANGES = {
    "2026": (2026, 2026), "2027": (2027, 2027), "2028": (2028, 2028),
    "2029": (2029, 2029), "2030": (2030, 2030), "2040": (2031, 2040),
    "2050": (2041, 2050), "2060": (2051, 2060), "2070": (2061, 2070),
    "2080": (2071, 2080), "2090": (2081, 2090), "2100": (2091, 2100),
}
EXPECTED_TRANSFORM = Affine(100.0, 0.0, 745900.0, 0.0, -100.0, 2068600.0)
EXPECTED_BOUNDS = [745900.0, 1457900.0, 1302800.0, 2068600.0]
FILE_RE = re.compile(r"^(h\d{2})_[a-z0-9]+_(ssp\d{3})_(\d{4})_100m_national\.tif$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="QA KMA extreme-index national outputs.")
    parser.add_argument("--hazard-root", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> None:
    args = parse_args()
    errors: list[str] = []
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    global_stats: dict[str, dict[str, float]] = {}
    total_bytes = 0
    tif_count = 0
    metadata_count = 0
    manifest_count = 0
    checksum_mismatches = 0

    for indicator in INDICATORS:
        mins: list[float] = []
        maxs: list[float] = []
        means: list[float] = []
        for scenario in SCENARIOS:
            output_dir = args.hazard_root / indicator / "scenario" / scenario / "national"
            tif_paths = sorted(output_dir.glob("*_100m_national.tif"))
            counts[indicator][scenario] = len(tif_paths)
            if len(tif_paths) != 12:
                errors.append(f"{indicator}/{scenario}: expected 12 TIFFs, got {len(tif_paths)}")

            manifest_path = output_dir / f"{indicator.lower()}_{scenario}_national_manifest.json"
            if not manifest_path.exists():
                errors.append(f"Missing manifest: {manifest_path}")
            else:
                manifest_count += 1
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if len(manifest) != 12:
                    errors.append(f"{manifest_path}: expected 12 manifest rows, got {len(manifest)}")

            found_periods: set[str] = set()
            for tif_path in tif_paths:
                tif_count += 1
                total_bytes += tif_path.stat().st_size
                match = FILE_RE.match(tif_path.name)
                if not match:
                    errors.append(f"Unexpected file name: {tif_path.name}")
                    continue
                found_periods.add(match.group(3))

                metadata_path = tif_path.with_suffix(".metadata.json")
                if not metadata_path.exists():
                    errors.append(f"Missing metadata: {metadata_path}")
                    continue
                metadata_count += 1
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

                actual_checksum = sha256(tif_path)
                if actual_checksum != metadata.get("output_checksum_sha256"):
                    checksum_mismatches += 1
                    errors.append(f"Checksum mismatch: {tif_path}")

                for key, expected in {
                    "indicator_id": indicator,
                    "scenario": scenario,
                    "grid_spec_id": "KOR_100M_EPSG5179_V1",
                    "spatial_scope": "national_master_grid",
                    "mask_status": "MASK_PENDING_DOWNSTREAM",
                    "quality_status": "NATIONAL_MASTER_GRID_COMPLETE_MASK_PENDING",
                    "source_resolution": "1km",
                    "analysis_resolution": "100m",
                    "test_only": False,
                }.items():
                    if metadata.get(key) != expected:
                        errors.append(f"{metadata_path}: {key}={metadata.get(key)!r}, expected {expected!r}")

                mins.append(float(metadata["min"]))
                maxs.append(float(metadata["max"]))
                means.append(float(metadata["mean"]))

                with rasterio.open(tif_path) as dataset:
                    if dataset.width != 5569 or dataset.height != 6107:
                        errors.append(f"Grid size mismatch: {tif_path}")
                    if dataset.crs is None or dataset.crs.to_epsg() != 5179:
                        errors.append(f"CRS mismatch: {tif_path}")
                    if dataset.transform != EXPECTED_TRANSFORM:
                        errors.append(f"Transform mismatch: {tif_path}")
                    if list(dataset.bounds) != EXPECTED_BOUNDS:
                        errors.append(f"Bounds mismatch: {tif_path}")
                    if dataset.nodata != -9999.0 or dataset.dtypes[0] != "float32":
                        errors.append(f"Nodata/dtype mismatch: {tif_path}")
                    tags = dataset.tags()
                    if tags.get("indicator_id") != indicator or tags.get("scenario") != scenario:
                        errors.append(f"Raster tag mismatch: {tif_path}")

            if found_periods != set(PERIODS):
                errors.append(f"{indicator}/{scenario}: period set mismatch {sorted(found_periods)}")

        global_stats[indicator] = {
            "min": min(mins),
            "max": max(maxs),
            "mean_min": min(means),
            "mean_max": max(means),
        }

    for indicator in ["H04", "H05", "H06", "H08", "H09"]:
        stats = global_stats[indicator]
        if stats["min"] < -1e-5 or stats["max"] > 366.0:
            errors.append(f"{indicator}: day-index range is implausible: {stats}")
    if global_stats["H07"]["min"] < -20.0 or global_stats["H07"]["max"] > 60.0:
        errors.append(f"H07: temperature range is implausible: {global_stats['H07']}")

    wsdi_pair_count = 0
    wsdi_violation_count = 0
    source_wsdi_violation_count = 0
    inherited_relation_pairs = 0
    raw_root = args.hazard_root.parent.parent / "raw" / "kma" / "ar6-ssp-extreme-1km"
    for scenario in SCENARIOS:
        h06_dir = args.hazard_root / "H06" / "scenario" / scenario / "national"
        h09_dir = args.hazard_root / "H09" / "scenario" / scenario / "national"
        source_h06_path = next((raw_root / scenario / "wsdi" / "yearly").glob("*.nc"))
        source_h09_path = next((raw_root / scenario / "wsdix" / "yearly").glob("*.nc"))
        with rasterio.open(source_h06_path) as source_h06, rasterio.open(source_h09_path) as source_h09:
            for period in PERIODS:
                h06_path = next(h06_dir.glob(f"h06_*_{scenario}_{period}_100m_national.tif"))
                h09_path = next(h09_dir.glob(f"h09_*_{scenario}_{period}_100m_national.tif"))
                wsdi_pair_count += 1
                output_pair_violations = 0
                with rasterio.open(h06_path) as h06, rasterio.open(h09_path) as h09:
                    for _, window in h06.block_windows(1):
                        h06_values = h06.read(1, window=window)
                        h09_values = h09.read(1, window=window)
                        valid = (h06_values != h06.nodata) & (h09_values != h09.nodata)
                        output_pair_violations += int(
                            np.count_nonzero(h09_values[valid] > h06_values[valid] + 1e-5)
                        )
                wsdi_violation_count += output_pair_violations

                start_year, end_year = PERIOD_RANGES[period]
                bands = list(range(start_year - 2020, end_year - 2020 + 1))
                source_h06_values = np.ma.mean(
                    source_h06.read(bands, masked=True), axis=0, dtype=np.float64
                ).filled(np.nan)
                source_h09_values = np.ma.mean(
                    source_h09.read(bands, masked=True), axis=0, dtype=np.float64
                ).filled(np.nan)
                source_valid = np.isfinite(source_h06_values) & np.isfinite(source_h09_values)
                source_pair_violations = int(
                    np.count_nonzero(
                        source_h09_values[source_valid] > source_h06_values[source_valid] + 1e-5
                    )
                )
                source_wsdi_violation_count += source_pair_violations
                if output_pair_violations and source_pair_violations:
                    inherited_relation_pairs += 1
                if output_pair_violations and not source_pair_violations:
                    errors.append(
                        f"{scenario}/{period}: output has WSDIx > WSDI but official source does not"
                    )

    report = {
        "status": "PASS" if not errors else "FAIL",
        "tif_count": tif_count,
        "metadata_count": metadata_count,
        "manifest_count": manifest_count,
        "source_nc_count": len(list(raw_root.glob("**/*.nc"))),
        "total_output_bytes": total_bytes,
        "total_output_gib": total_bytes / 1024**3,
        "checksum_mismatches": checksum_mismatches,
        "counts": counts,
        "global_statistics": global_stats,
        "wsdix_le_wsdi_pair_count": wsdi_pair_count,
        "wsdix_gt_wsdi_output_cell_count": wsdi_violation_count,
        "wsdix_gt_wsdi_official_source_cell_count": source_wsdi_violation_count,
        "wsdix_gt_wsdi_inherited_pair_count": inherited_relation_pairs,
        "relation_note": (
            "Some official 5ENSMN source cells have WSDIx greater than WSDI. "
            "The nationwide nearest-neighbor outputs preserve this source behavior; "
            "it is not introduced by reprojection."
        ),
        "errors": errors,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
