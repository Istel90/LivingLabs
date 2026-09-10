"""Audit saved WBGT coverage for every region; optionally verify served grids."""

import argparse, csv, json, math, urllib.request
from pathlib import Path
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window
from shapely.geometry import shape, mapping, GeometryCollection
from shapely.ops import transform, unary_union
from build_national_spatial_wbgt import ROOT, OUT, TO_XY, MODEL


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--served", action="store_true")
    args = parser.parse_args()
    codes = json.loads(
        (ROOT / "output/national-platform-audit/regions.json").read_text()
    )
    features = json.loads(
        (
            ROOT
            / "shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json"
        ).read_text(encoding="utf8")
    )["featuresByCode"]
    geoms = {
        c: transform(TO_XY.transform, shape(f["geometry"])) for c, f in features.items()
    }
    raster = OUT / "h11_wbgt_spatial_reference_national_100m.tif"
    report = []
    with rasterio.open(raster) as ds:
        assert ds.crs.to_epsg() == 5179 and ds.res == (100, 100)
        for code in codes:
            if code in geoms:
                g = geoms[code]
            else:
                prefix = code[:2] if code.endswith("000") else code[:4]
                children = [g for c, g in geoms.items() if c.startswith(prefix)]
                if not children:
                    raise ValueError(f"No boundary: {code}")
                g = GeometryCollection(children)
            xmin, ymin, xmax, ymax = g.bounds
            col = max(0, math.floor((xmin - ds.transform.c) / 100))
            row = max(0, math.floor((ds.transform.f - ymax) / 100))
            right = min(ds.width, math.ceil((xmax - ds.transform.c) / 100))
            bottom = min(ds.height, math.ceil((ds.transform.f - ymin) / 100))
            win = Window(col, row, right - col, bottom - row)
            affine = ds.window_transform(win)
            values = ds.read(1, window=win)
            parts = list(g.geoms) if g.geom_type == "GeometryCollection" else [g]
            inside = geometry_mask(
                [mapping(part) for part in parts], values.shape, affine, invert=True
            )
            valid = inside & np.isfinite(values) & (values != ds.nodata)
            v = values[valid]
            item = {
                "region_code": code,
                "boundary_cells": int(inside.sum()),
                "valid_cells": int(valid.sum()),
                "coverage_pct": round(100 * valid.sum() / inside.sum(), 3),
                "min_c": float(v.min()) if len(v) else None,
                "max_c": float(v.max()) if len(v) else None,
                "mean_c": float(v.mean()) if len(v) else None,
                "unique_values": int(len(np.unique(v))),
                "rows": values.shape[0],
                "columns": values.shape[1],
            }
            if args.served:
                try:
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:4173/hazard-grid?regionCode={code}&indicator=H11",
                        timeout=120,
                    ) as response:
                        payload = json.load(response)
                    item["served_quality"] = payload.get("qualityStatus")
                    item["served_cells"] = payload["stats"]["validCells"]
                    assert payload["qualityStatus"] == MODEL, payload.get(
                        "qualityStatus"
                    )
                    pt = payload["transform"]
                    served_window = Window(
                        round((pt["originX"] - ds.transform.c) / 100),
                        round((ds.transform.f - pt["originY"]) / 100),
                        payload["columns"],
                        payload["rows"],
                    )
                    source = ds.read(
                        1, window=served_window, boundless=True, fill_value=ds.nodata
                    ).ravel()
                    pairs = np.asarray(payload["sparseValues"]).reshape(-1, 2)
                    selected = source[pairs[:, 0].astype("int64")]
                    assert (
                        np.isfinite(selected).all() and (selected != ds.nodata).all()
                    ), "Served grid contains source nodata"
                    limits = payload["normalizationSourceRange"]
                    expected = np.clip(
                        (selected.astype("float64") - limits["min"])
                        / (limits["max"] - limits["min"]),
                        0,
                        1,
                    )
                    assert (
                        np.max(np.abs(expected - pairs[:, 1])) < 0.000001
                    ), "Served cell values differ from saved raster coordinates"
                    assert (
                        abs(payload["stats"]["rawMin"] - float(selected.min())) < 0.001
                    ), "Raw minimum differs"
                    assert (
                        abs(payload["stats"]["rawMax"] - float(selected.max())) < 0.001
                    ), "Raw maximum differs"
                    item["served_rows"] = payload["rows"]
                    item["served_columns"] = payload["columns"]
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:4173/hazard-grid?regionCode={code}&indicator=H01",
                        timeout=120,
                    ) as response:
                        reference = json.load(response)
                    assert (
                        payload["rows"] == reference["rows"]
                        and payload["columns"] == reference["columns"]
                    )
                    assert (
                        payload["transform"] == reference["transform"]
                    ), "Grid transform differs from H01 common grid"
                    item["served_ok"] = True
                except Exception as exc:
                    item["served_ok"] = False
                    item["served_error"] = str(exc)
            report.append(item)
            if not len(report) % 25:
                print(
                    json.dumps({"checked": len(report), "total": len(codes)}),
                    flush=True,
                )
    target = OUT / (
        "regional_coverage_served.json" if args.served else "regional_coverage.json"
    )
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    with target.with_suffix(".csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=sorted(set(k for r in report for k in r)))
        writer.writeheader()
        writer.writerows(report)
    print(
        json.dumps(
            {
                "regions": len(report),
                "nonempty": sum(r["valid_cells"] > 0 for r in report),
                "served_passed": sum(r.get("served_ok", False) for r in report),
                "lowest_coverage": sorted(report, key=lambda r: r["coverage_pct"])[:10],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
