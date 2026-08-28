from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np


API_ENDPOINT = "https://apihub.kma.go.kr/api/typ01/url/sfc_grid_nc_sts_down.php"
DEFAULT_YEARS = (2021, 2022, 2023, 2024, 2025)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download KMA 500 m annual mean air-temperature NetCDF files."
    )
    parser.add_argument("--years", nargs="+", type=int, default=DEFAULT_YEARS)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def validate(path: Path) -> dict[str, object]:
    if path.read_bytes()[:8] != b"\x89HDF\r\n\x1a\n":
        raise ValueError(f"KMA response is not NetCDF4/HDF5: {path}")
    with h5py.File(path, "r") as source:
        if "data" not in source:
            raise ValueError(f"NetCDF does not contain the expected data variable: {path}")
        dataset = source["data"]
        raw = np.asarray(dataset[...])
        fill = int(np.asarray(dataset.attrs["_FillValue"]).reshape(-1)[0])
        scale = float(np.asarray(dataset.attrs["data_scale"]).reshape(-1)[0])
        valid = raw != fill
        values = raw[valid].astype(np.float64) / scale
        return {
            "shape": list(raw.shape),
            "stored_dtype": str(raw.dtype),
            "fill_value_stored": fill,
            "scale_divisor": scale,
            "valid_cell_count": int(valid.sum()),
            "missing_cell_count": int(valid.size - valid.sum()),
            "physical_value_min_C": float(values.min()),
            "physical_value_max_C": float(values.max()),
            "physical_value_mean_C": float(values.mean()),
        }


def download(year: int, api_key: str, root: Path, force: bool) -> Path:
    target_dir = root / "data" / "raw" / "kma" / "high-resolution-grid-500m" / "ta_avg" / str(year)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"kma_500m_ta_avg_{year}.nc"
    metadata_path = target_dir / "metadata.json"
    if target.exists() and metadata_path.exists() and not force:
        validate(target)
        print(f"skip validated {year}: {target}")
        return target

    query = urllib.parse.urlencode({"var": "ta_avg", "tm": str(year), "authKey": api_key})
    request = urllib.request.Request(
        f"{API_ENDPOINT}?{query}",
        headers={"User-Agent": "LivingLab-Hazard-Inventory/1.0"},
    )
    partial = target.with_suffix(".nc.part")
    try:
        with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        partial.replace(target)
        summary = validate(target)
    finally:
        if partial.exists():
            partial.unlink()

    metadata = {
        "indicator_id": "H01",
        "indicator_name": "평균기온",
        "observation_year": year,
        "observed_or_scenario": "observed",
        "source_agency": "Korea Meteorological Administration",
        "dataset_name": "고해상도 격자자료(500m) 연 통계",
        "source_page": "https://apihub.kma.go.kr/apiList.do?seqApi=971",
        "request_endpoint_without_key": f"{API_ENDPOINT}?var=ta_avg&tm={year}",
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "file_name": target.name,
        "file_format": "NetCDF4/HDF5",
        "size_bytes": target.stat().st_size,
        "checksum_sha256": sha256(target),
        "product_type": "SFC_GRID_STS_ta_avg_year",
        "source_resolution": "500m",
        "analysis_resolution": "100m",
        "target_grid_spec_id": "KOR_100M_EPSG5179_V1",
        "quality_status": "RAW_FILE_VALIDATED_REPROJECT_PENDING",
        "test_only": False,
        **summary,
    }
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(metadata, ensure_ascii=False))
    return target


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[2]
    env = {**read_env(root / ".env.local"), **os.environ}
    api_key = env.get("KMA_API_KEY")
    if not api_key:
        raise RuntimeError("KMA_API_KEY is missing from riskmap-core-main/.env.local or the environment.")
    for year in args.years:
        if year < 1997 or year > datetime.now().year:
            raise ValueError(f"Unsupported observation year: {year}")
        download(year, api_key, root, args.force)


if __name__ == "__main__":
    main()
