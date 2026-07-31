from __future__ import annotations

import csv
import io
import json
import sys
import tarfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BOUNDARY_PATH = (
    ROOT
    / "shared"
    / "data"
    / "administrative-regions"
    / "boundaries"
    / "downloads-sigungu-boundaries.json"
)
REGION_TABLE_PATH = ROOT / "riskmap-core-main" / "src" / "lib" / "sido_sgg_Table.csv"
OUTPUT_PATH = ROOT / "public" / "data" / "climate" / "ic4-admin-projections.json"

SCENARIOS = ("RCP26", "RCP45", "RCP60", "RCP85")
PERIODS = (
    (2020, 2020, 2020),
    (2050, 2050, 2050),
    (2060, 2060, 2060),
    (2070, 2070, 2070),
    (2080, 2080, 2080),
    (2090, 2090, 2090),
    (2100, 2100, 2100),
)
METRICS = {
    "TA": {"label": "평균기온", "unit": "°C", "frequency": "monthly", "aggregation": "mean"},
    "HW33": {"label": "폭염일수", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "SU25": {"label": "여름일수", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "TR25": {"label": "열대야일수", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "DTR": {"label": "일교차", "unit": "°C", "frequency": "yearly", "aggregation": "mean"},
    "GSL": {"label": "식물성장기간", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "TX90P": {"label": "온난일", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "TN90P": {"label": "온난야", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "WSDI": {"label": "온난일계속기간", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "WSDIx": {"label": "최대온난일계속기간", "unit": "일/년", "frequency": "yearly", "aggregation": "mean"},
    "TXx": {"label": "일최고기온 연최대", "unit": "°C", "frequency": "yearly", "aggregation": "mean"},
    "TNx": {"label": "일최저기온 연최대", "unit": "°C", "frequency": "yearly", "aggregation": "mean"},
}

NCOLS = 751
NROWS = 601
LON0 = 124.5
LAT0 = 33.0
CELL_SIZE = 0.01
CELL_COUNT = NCOLS * NROWS


def build_region_grid(features_by_code: dict[str, dict]):
    direct_codes = sorted(features_by_code)
    labels = np.full(CELL_COUNT, -1, dtype=np.int16)

    for region_index, code in enumerate(direct_codes):
        geometry = features_by_code[code]["geometry"]
        mask_image = Image.new("1", (NCOLS, NROWS), 0)
        draw = ImageDraw.Draw(mask_image)
        polygons = (
            [geometry["coordinates"]]
            if geometry["type"] == "Polygon"
            else geometry["coordinates"]
        )
        for polygon in polygons:
            if not polygon:
                continue

            def pixel_ring(ring):
                return [
                    (
                        round((float(longitude) - LON0) / CELL_SIZE),
                        round((float(latitude) - LAT0) / CELL_SIZE),
                    )
                    for longitude, latitude in ring
                ]

            draw.polygon(pixel_ring(polygon[0]), fill=1)
            for hole in polygon[1:]:
                draw.polygon(pixel_ring(hole), fill=0)
        mask = np.asarray(mask_image, dtype=bool).ravel()
        labels[mask] = region_index
        print(f"mask {region_index + 1:03d}/{len(direct_codes)} {code}", flush=True)

    for region_index, code in enumerate(direct_codes):
        if np.any(labels == region_index):
            continue
        geometry = features_by_code[code]["geometry"]
        polygons = (
            [geometry["coordinates"]]
            if geometry["type"] == "Polygon"
            else geometry["coordinates"]
        )
        outer_ring = max(
            (polygon[0] for polygon in polygons if polygon),
            key=lambda ring: len(ring),
        )
        longitude = sum(float(point[0]) for point in outer_ring) / len(outer_ring)
        latitude = sum(float(point[1]) for point in outer_ring) / len(outer_ring)
        col = min(NCOLS - 1, max(0, round((longitude - LON0) / CELL_SIZE)))
        row = min(NROWS - 1, max(0, round((latitude - LAT0) / CELL_SIZE)))
        labels[row * NCOLS + col] = region_index
        print(f"representative cell {code} -> ({longitude:.4f}, {latitude:.4f})", flush=True)

    return direct_codes, labels


def read_region_table(direct_codes: list[str]):
    direct_set = set(direct_codes)
    rows = []
    seen = set()
    with REGION_TABLE_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = row["SIG_CD"].strip()
            if code in seen:
                continue
            seen.add(code)
            members = [code] if code in direct_set else []
            if not members and code.endswith("0"):
                members = [candidate for candidate in direct_codes if candidate.startswith(code[:4])]
            if not members:
                continue
            rows.append(
                {
                    "code": code,
                    "name": row["SIG_KOR_NM"].strip(),
                    "sido": row["Sido"].strip(),
                    "members": members,
                }
            )
    return rows


def source_path(scenario: str, metric: str, frequency: str) -> Path:
    name = (
        f"AR5_IC4{scenario}_HadGEM3RA_skorea_{metric}_gridsub_"
        f"{frequency}_2011_2100_asc.tar.gz"
    )
    return DATA_DIR / name


def source_lines(path: Path):
    with tarfile.open(path, "r:gz") as archive:
        members = [member for member in archive.getmembers() if member.isfile()]
        if len(members) != 1:
            raise RuntimeError(f"{path.name}: expected one data member, found {len(members)}")
        extracted = archive.extractfile(members[0])
        if extracted is None:
            raise RuntimeError(f"{path.name}: cannot read member")
        with io.TextIOWrapper(extracted, encoding="ascii", errors="strict") as text:
            yield from text


def process_file(path: Path, frequency: str, labels: np.ndarray, direct_count: int):
    period_sums = np.zeros((len(PERIODS), direct_count), dtype=np.float64)
    period_counts = np.zeros((len(PERIODS), direct_count), dtype=np.int64)
    period_lookup = {
        year: period_index
        for period_index, (_, start_year, end_year) in enumerate(PERIODS)
        for year in range(start_year, end_year + 1)
    }
    valid_cells = labels >= 0
    valid_labels = labels[valid_cells]

    for line_index, line in enumerate(source_lines(path)):
        if frequency == "monthly":
            year = 2011 + line_index // 12
        else:
            year = 2011 + line_index
        period_index = period_lookup.get(year)
        if period_index is None:
            continue

        values = np.fromstring(line, sep=" ", dtype=np.float32)
        if values.size != CELL_COUNT:
            raise RuntimeError(
                f"{path.name}: row {line_index + 1} has {values.size} cells, expected {CELL_COUNT}"
            )
        values = values[valid_cells]
        valid = np.isfinite(values) & (values > -90)
        row_labels = valid_labels[valid]
        row_values = values[valid]
        sums = np.bincount(row_labels, weights=row_values, minlength=direct_count)
        counts = np.bincount(row_labels, minlength=direct_count)
        period_sums[period_index] += sums
        period_counts[period_index] += counts

    return period_sums, period_counts


def round_value(value: float, unit: str):
    if not np.isfinite(value):
        return None
    return round(float(value), 2 if unit == "°C" else 1)


def main():
    print("loading boundaries", flush=True)
    boundary_document = json.loads(BOUNDARY_PATH.read_text(encoding="utf-8"))
    direct_codes, labels = build_region_grid(boundary_document["featuresByCode"])
    regions = read_region_table(direct_codes)
    direct_index = {code: index for index, code in enumerate(direct_codes)}
    region_members = {
        region["code"]: np.asarray([direct_index[code] for code in region["members"]], dtype=np.int32)
        for region in regions
    }

    region_cell_counts = np.bincount(
        labels[labels >= 0], minlength=len(direct_codes)
    )
    output_data = {
        region["code"]: {
            scenario: {str(target): {} for target, _, _ in PERIODS}
            for scenario in SCENARIOS
        }
        for region in regions
    }

    tasks = []
    for scenario in SCENARIOS:
        for metric, metadata in METRICS.items():
            path = source_path(scenario, metric, metadata["frequency"])
            if not path.exists():
                raise FileNotFoundError(path)
            tasks.append((scenario, metric, metadata, path))

    completed = 0
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(
                process_file,
                path,
                metadata["frequency"],
                labels,
                len(direct_codes),
            ): (scenario, metric, metadata, path)
            for scenario, metric, metadata, path in tasks
        }
        for future in as_completed(futures):
            scenario, metric, metadata, path = futures[future]
            sums, counts = future.result()
            completed += 1
            print(f"data {completed:02d}/{len(tasks)} {path.name}", flush=True)

            for region in regions:
                members = region_members[region["code"]]
                for period_index, (target, _, _) in enumerate(PERIODS):
                    denominator = counts[period_index, members].sum()
                    value = (
                        sums[period_index, members].sum() / denominator
                        if denominator
                        else np.nan
                    )
                    if metadata["aggregation"] == "annual_sum":
                        value *= 12
                    output_data[region["code"]][scenario][str(target)][metric] = round_value(
                        value, metadata["unit"]
                    )

    output_regions = []
    for region in regions:
        members = region_members[region["code"]]
        output_regions.append(
            {
                "code": region["code"],
                "name": region["name"],
                "sido": region["sido"],
                "cellCount": int(region_cell_counts[members].sum()),
            }
        )

    output = {
        "meta": {
            "title": "AR5 IC4 남한상세 행정구역 기후전망 실험자료",
            "source": "기상청 기후정보포털 AR5 IC4 HadGEM3-RA skorea gridsub",
            "generatedAt": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
            "grid": {
                "columns": NCOLS,
                "rows": NROWS,
                "cellSizeDegrees": CELL_SIZE,
                "nominalResolutionKm": 1,
            },
            "periodMethod": "각 목표연도의 연평균 또는 연지수",
            "experimental": True,
        },
        "scenarios": list(SCENARIOS),
        "periods": [
            {"targetYear": target, "from": start, "to": end}
            for target, start, end in PERIODS
        ],
        "metrics": [
            {"code": code, **metadata} for code, metadata in METRICS.items()
        ],
        "regions": output_regions,
        "data": output_data,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"written {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        raise
