#!/usr/bin/env python3
"""Build direct-sigungu summaries for all observed H01-H10 national 100m rasters."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from rasterio.windows import from_bounds


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = PROJECT_ROOT.parent
BOUNDARIES = WORKSPACE_ROOT / "shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json"
OUTPUT = PROJECT_ROOT / "static/analysis-data/national/observed-hazard-admin-statistics.json"
PROCESSED_OUTPUT = PROJECT_ROOT / "data/processed/hazard/observed-hazard-admin-statistics.json"

INDICATORS = {
    "H01": ("평균기온", "h01_ta_avg_2021_2025_mean_100m_national.tif", "℃"),
    "H02": ("평균최고기온", "h02_tamax_2021_2025_mean_100m_national.tif", "℃"),
    "H03": ("평균최저기온", "h03_tamin_2021_2025_mean_100m_national.tif", "℃"),
    "H04": ("폭염일수", "h04_hw33_2021_2025_mean_100m_national.tif", "일"),
    "H05": ("열대야일수", "h05_tr25_2021_2025_mean_100m_national.tif", "일"),
    "H06": ("온난일 계속기간 WSDI", "h06_wsdi_2021_2025_mean_100m_national.tif", "일"),
    "H07": ("일최고기온 연최대 TXx", "h07_txx_2021_2025_mean_100m_national.tif", "℃"),
    "H08": ("온난일 TX90P", "h08_tx90p_2021_2025_mean_100m_national.tif", "일"),
    "H09": ("최대 온난일 계속기간 WSDIx", "h09_wsdix_2021_2025_mean_100m_national.tif", "일"),
    "H10": ("여름철 지표면온도 P90", "h10_lst_summer_p90_2021_2025_mean_100m_national.tif", "℃"),
}


def raster_path(indicator_id: str, filename: str) -> Path:
    return PROJECT_ROOT / f"data/processed/hazard/{indicator_id}/observed/2021-2025" / filename


def dataset_summary(source: rasterio.DatasetReader, indicator_id: str) -> dict:
    count = 0
    total = 0.0
    minimum = np.inf
    maximum = -np.inf
    samples = []
    below_zero = 0
    above_seventy = 0
    for _, window in source.block_windows(1):
        array = source.read(1, window=window)
        valid = np.isfinite(array) & (array != source.nodata)
        values = array[valid].astype(np.float64)
        if not values.size:
            continue
        count += int(values.size)
        total += float(values.sum())
        minimum = min(minimum, float(values.min()))
        maximum = max(maximum, float(values.max()))
        samples.append(values[::100])
        if indicator_id == "H10":
            below_zero += int(np.count_nonzero(values < 0))
            above_seventy += int(np.count_nonzero(values > 70))
    sample = np.concatenate(samples) if samples else np.array([], dtype=np.float64)
    result = {
        "valid_cell_count": count,
        "coverage_fraction": count / (source.width * source.height),
        "min": minimum if count else None,
        "max": maximum if count else None,
        "mean": total / count if count else None,
        "sample_quantiles": {
            "p01": float(np.quantile(sample, 0.01)) if sample.size else None,
            "p50": float(np.quantile(sample, 0.50)) if sample.size else None,
            "p99": float(np.quantile(sample, 0.99)) if sample.size else None,
        },
    }
    if indicator_id == "H10":
        result["qa"] = {
            "below_0c_cells": below_zero,
            "above_70c_cells": above_seventy,
            "status": "PASS_WITH_OUTLIER_CAUTION" if below_zero or above_seventy else "PASS",
            "note": "극단값은 구름·수면·잔여 품질마스크 영향을 받을 수 있어 지표면온도 활용 시 행정구역 평균 또는 분위값 사용을 권장",
        }
    return result


def geometry_bounds(geometry: dict) -> tuple[float, float, float, float]:
    points = []

    def collect(value):
        if isinstance(value, list) and len(value) >= 2 and isinstance(value[0], (int, float)):
            points.append(value)
        elif isinstance(value, list):
            for item in value:
                collect(item)

    collect(geometry["coordinates"])
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def zonal_stat(source: rasterio.DatasetReader, geometry_wgs84: dict) -> dict | None:
    geometry = transform_geom("EPSG:4326", source.crs, geometry_wgs84, precision=1)
    left, bottom, right, top = geometry_bounds(geometry)
    window = from_bounds(left, bottom, right, top, source.transform).round_offsets().round_lengths()
    window = window.intersection(rasterio.windows.Window(0, 0, source.width, source.height))
    if window.width <= 0 or window.height <= 0:
        return None
    array = source.read(1, window=window)
    transform = source.window_transform(window)
    inside = geometry_mask([geometry], out_shape=array.shape, transform=transform, invert=True)
    valid = inside & np.isfinite(array) & (array != source.nodata)
    values = array[valid].astype(np.float64)
    if not values.size:
        return None
    return {
        "cellCount": int(values.size),
        "mean": float(values.mean()),
        "min": float(values.min()),
        "max": float(values.max()),
        "p90": float(np.quantile(values, 0.9)),
    }


def main() -> None:
    boundary_document = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
    features = boundary_document["featuresByCode"]
    catalog = {}
    values_by_admin = {code: {"name": feature["properties"].get("sig_kor_nm", code)} for code, feature in features.items()}

    for indicator_id, (name, filename, unit) in INDICATORS.items():
        path = raster_path(indicator_id, filename)
        if not path.exists():
            raise FileNotFoundError(path)
        with rasterio.open(path) as source:
            if source.crs.to_epsg() != 5179 or abs(source.transform.a) != 100 or abs(source.transform.e) != 100:
                raise ValueError(f"{indicator_id} does not match KOR 100m EPSG:5179 grid")
            catalog[indicator_id] = {
                "name": name,
                "unit": unit,
                "path": str(path.resolve()),
                "grid": {"crs": "EPSG:5179", "resolution": "100m", "width": source.width, "height": source.height},
                **dataset_summary(source, indicator_id),
            }
            for index, (code, feature) in enumerate(features.items(), start=1):
                stat = zonal_stat(source, feature["geometry"])
                values_by_admin[code][indicator_id] = stat
            print(f"{indicator_id}: {len(features)}개 시군구 통계 완료", flush=True)

    payload = {
        "metadata": {
            "title": "2021-2025 H01-H10 전국 100m 행정구역 통계",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "period": "2021-2025",
            "gridSpecId": "KOR_100M_EPSG5179_V1",
            "adminUnit": "직접 시군구 경계 255개",
            "aggregation": "100m 격자 중심이 행정경계 내부인 셀의 통계",
        },
        "indicators": catalog,
        "valuesByAdminCode": values_by_admin,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    for output in (OUTPUT, PROCESSED_OUTPUT):
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8")
    print(json.dumps({"outputs": [str(OUTPUT), str(PROCESSED_OUTPUT)], "adminCount": len(values_by_admin)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
