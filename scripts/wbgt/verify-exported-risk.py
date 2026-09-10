"""Independently recompute H/E/V and risk from browser-exported input arrays."""

import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/national-platform-audit"
results = []
for path in sorted(
    [
        *(OUT / "workflows").glob("*_settings.json"),
        *(OUT / "weights").glob("*_settings.json"),
    ]
):
    data = json.loads(path.read_text(encoding="utf8"))
    analysis = data["analysisResult"]
    grid = analysis["gridResult"]
    n = grid["rows"] * grid["columns"]

    def arr(value):
        if isinstance(value, dict):
            if value.get("__analysisGrid") in ("sparse-v1", "dense-sparse-v1"):
                result = np.full(n, np.nan)
                for index, score in value["entries"]:
                    result[index] = score
                return result
            return np.array([value.get(str(i)) for i in range(n)], dtype=float)
        return np.array(value, dtype=float)

    def mean(group, invert=False):
        items = [
            x for x in analysis["indicators"] if x["group"] == group and x["weight"] > 0
        ]
        values = np.stack([arr(x["gridValues"]) for x in items])
        if invert:
            values = np.stack(
                [
                    1 - v if x["direction"] == "negative" else v
                    for x, v in zip(items, values)
                ]
            )
        weights = np.array([x["weight"] for x in items])[:, None] * np.isfinite(values)
        return np.divide(
            np.nansum(values * weights, axis=0),
            weights.sum(axis=0),
            out=np.full(n, np.nan),
            where=weights.sum(axis=0) > 0,
        )

    h = mean("기후위험")
    e = mean("노출")
    s = mean("민감도")
    a = mean("적응역량", True)
    valid = np.isfinite(h + e + s + a)
    v = (s + a) * 0.5
    v[~valid] = np.nan
    weights = np.array([analysis["dimensionWeights"][k] for k in ["H", "E", "V"]])
    risk = np.exp(
        (np.log(np.maximum(np.stack([h, e, v]), 0.0001)) * weights[:, None]).sum(axis=0)
        / weights.sum()
    )
    max_error = 0
    for key, expected in [
        ("hValues", h),
        ("eValues", e),
        ("sensitivityValues", s),
        ("adaptiveCapacityValues", a),
        ("vValues", v),
        ("values", risk),
    ]:
        actual = arr(grid[key])
        assert np.array_equal(np.isfinite(actual), np.isfinite(expected)), (
            path.name,
            key,
            "valid mask",
        )
        error = float(np.nanmax(np.abs(actual - expected)))
        max_error = max(max_error, error)
        assert error < 1e-6, (path.name, key, error)
    assert int(valid.sum()) == grid["stats"]["validCells"]
    assert abs(float(np.nanmean(risk)) - analysis["riskScore"]) < 1e-6
    descending = np.sort(risk[valid])[::-1]
    threshold = descending[int(np.ceil(len(descending) * 0.1)) - 1]
    assert abs(threshold - grid["stats"]["topThreshold"]) < 1e-6
    results.append(
        {
            "file": str(path.relative_to(OUT)),
            "valid_cells": int(valid.sum()),
            "max_absolute_error": max_error,
            "ok": True,
        }
    )
(OUT / "calculation-crosscheck.json").write_text(
    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
)
print(
    json.dumps(
        {
            "checked": len(results),
            "passed": sum(r["ok"] for r in results),
            "cells": sum(r["valid_cells"] for r in results),
            "max_error": max(r["max_absolute_error"] for r in results),
        }
    )
)
