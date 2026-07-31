"""Append the IC4 2020 comparison baseline without rebuilding future periods."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = ROOT / "scripts/build-ic4-admin-climate-lab.py"
OUTPUT_PATH = ROOT / "public/data/climate/ic4-admin-projections.json"
TARGET_YEAR = 2020

spec = importlib.util.spec_from_file_location("ic4_climate_builder", CORE_PATH)
core = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(core)


def process_target_year(path: Path, frequency: str, labels: np.ndarray, direct_count: int):
    sums = np.zeros(direct_count, dtype=np.float64)
    counts = np.zeros(direct_count, dtype=np.int64)
    valid_cells = labels >= 0
    valid_labels = labels[valid_cells]

    for line_index, line in enumerate(core.source_lines(path)):
        year = 2011 + (line_index // 12 if frequency == "monthly" else line_index)
        if year < TARGET_YEAR:
            continue
        if year > TARGET_YEAR:
            break
        values = np.fromstring(line, sep=" ", dtype=np.float32)
        if values.size != core.CELL_COUNT:
            raise RuntimeError(f"{path.name}: invalid grid row")
        values = values[valid_cells]
        valid = np.isfinite(values) & (values > -90)
        sums += np.bincount(valid_labels[valid], weights=values[valid], minlength=direct_count)
        counts += np.bincount(valid_labels[valid], minlength=direct_count)
    return sums, counts


def main():
    boundary_document = json.loads(core.BOUNDARY_PATH.read_text(encoding="utf-8"))
    direct_codes, labels = core.build_region_grid(boundary_document["featuresByCode"])
    regions = core.read_region_table(direct_codes)
    direct_index = {code: index for index, code in enumerate(direct_codes)}
    region_members = {
        region["code"]: np.asarray([direct_index[code] for code in region["members"]], dtype=np.int32)
        for region in regions
    }
    output = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    output["periods"] = [period for period in output["periods"] if period["targetYear"] != TARGET_YEAR]
    output["periods"].insert(0, {"targetYear": TARGET_YEAR, "from": TARGET_YEAR, "to": TARGET_YEAR})

    completed = 0
    for scenario in core.SCENARIOS:
        for metric, metadata in core.METRICS.items():
            path = core.source_path(scenario, metric, metadata["frequency"])
            sums, counts = process_target_year(path, metadata["frequency"], labels, len(direct_codes))
            for region in regions:
                members = region_members[region["code"]]
                denominator = counts[members].sum()
                value = sums[members].sum() / denominator if denominator else np.nan
                if metadata["aggregation"] == "annual_sum":
                    value *= 12
                output["data"][region["code"]][scenario].setdefault(str(TARGET_YEAR), {})[metric] = core.round_value(value, metadata["unit"])
            completed += 1
            print(f"baseline {completed:02d}/48 {scenario} {metric}", flush=True)

    output["meta"]["periodMethod"] = "2020년 현재 비교 기준 및 각 미래 목표연도의 연평균 또는 연지수"
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"updated {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    main()
