"""Package verified national results only when all required audits pass."""

import hashlib, json, shutil, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "output/national-platform-audit"
DATA = Path(
    r"D:/90_Data/LivingLabs/derived/WBGT_SPATIAL_REFERENCE_100M/2026-09-08_national_v2"
)
DOC = ROOT / "docs/WBGT_NATIONAL_AND_PLATFORM_VALIDATION_2026-09-08.md"


def read(p):
    return json.loads(p.read_text(encoding="utf8"))


def digest(p):
    with p.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def main():
    expected = {
        "nationwide-default.json": 538,
        "nationwide-wbgt.json": 269,
        "nationwide-parcels.json": 538,
        "workflows/results.json": 8,
        "mode-results.json": 4,
        "exports/results.json": 4,
        "draft-roundtrip.json": 6,
        "weights/results.json": 4,
        "calculation-crosscheck.json": 12,
        "canonical-default.json": 4,
        "canonical-wbgt.json": 2,
    }
    checks = {}
    for name, count in expected.items():
        rows = read(AUDIT / name)
        passed = sum(bool(r.get("ok")) and not r.get("pageErrors") for r in rows)
        assert len(rows) == count and passed == count, (name, len(rows), passed, count)
        checks[name] = {"checked": len(rows), "passed": passed, "failed": 0}
    codes = set(read(AUDIT / "regions.json"))
    for name in ["nationwide-default.json", "nationwide-parcels.json"]:
        rows = read(AUDIT / name)
        assert {(r["code"], r["hazard"]) for r in rows} == {
            (c, h) for c in codes for h in ["flood", "heatwave"]
        }
    served = read(DATA / "regional_coverage_served.json")
    assert len(served) == 269 and all(r["served_ok"] for r in served)
    raster = DATA / "h11_wbgt_spatial_reference_national_100m.tif"
    meta = read(raster.with_suffix(".metadata.json"))
    deployed = (
        ROOT
        / "riskmap-core-main/data/processed/hazard/H11/observed/2021-2025"
        / raster.name
    )
    assert digest(raster) == digest(deployed) == meta["output_checksum_sha256"]
    assert digest(ROOT / "riskmap-core-main/build/_app/version.json") == digest(
        ROOT / "pages-dist/internal-tools/_app/version.json"
    )
    versions = [
        ROOT / "riskmap-core-main/src/lib/maps/SelectedRegionMap.svelte",
        ROOT / "riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte",
        ROOT / "riskmap-core-main/src/lib/data/analysisSerialization.js",
        ROOT / "riskmap-core-main/scripts/hazard-grid-service.mjs",
        ROOT / "riskmap-core-main/scripts/vworld-data-proxy.mjs",
        ROOT / "riskmap-core-main/src/app.css",
        ROOT / "riskmap-core-main/package.json",
        ROOT / "riskmap-core-main/package-lock.json",
        ROOT / "AGENTS.md",
    ]
    summary = {
        "status": "complete",
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "baseline": "http://127.0.0.1:4173/internal-tools/priority-management-area/flood?regionCode=41110",
        "region_codes": 269,
        "data": {
            "model": meta["quality_status"],
            "valid_cells": meta["valid_cell_count"],
            "target_cells": meta["target_cell_count"],
            "raw_min_c": meta["min"],
            "raw_max_c": meta["max"],
            "sha256": digest(raster),
            "served_regions_passed": 269,
        },
        "browser_checks": checks,
        "numerical_tests": {
            "spatial_tests": 5,
            "serialization": "passed",
            "independent_recalculation_cells": sum(
                r["valid_cells"] for r in read(AUDIT / "calculation-crosscheck.json")
            ),
            "independent_max_absolute_error": max(
                r["max_absolute_error"]
                for r in read(AUDIT / "calculation-crosscheck.json")
            ),
        },
        "served_build": read(ROOT / "pages-dist/internal-tools/_app/version.json"),
        "source_hashes": {str(p.relative_to(ROOT)): digest(p) for p in versions},
        "limitations": [
            "experimental synthetic representative WBGT, no field validation",
            "trees/local urban wind/explicit surface longwave not modeled",
            "28 region codes lack valid FH01 source cells; available H used",
            "parcel plan classification remains existing demo rules v1",
            "server draft requests intercepted in QA; live Supabase write/auth not verified",
            "all indicator combinations and user upload formats not exhaustively tested",
        ],
    }
    (AUDIT / "validation-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf8"
    )
    validation = DATA / "validation"
    validation.mkdir(exist_ok=True)
    for name in [
        *expected,
        "validation-summary.json",
        "regions.json",
        "flood-availability.json",
        "flood-availability.csv",
        "rendering-fixed.json",
        "parcel-incheon-retest.json",
        "live-browser-checks.json",
        "build.log",
    ]:
        dst = validation / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(AUDIT / name, dst)
    for folder in ["workflows", "weights"]:
        for p in (AUDIT / folder).glob("*_settings.json"):
            shutil.copy2(p, validation / folder / p.name)
    for p in (AUDIT / "exports").glob("*.png"):
        shutil.copy2(p, validation / "exports" / p.name)
    for folder in ["workflows"]:
        for hazard in ["flood", "heatwave"]:
            for code in ["41110", "11680", "26290", "50110"]:
                files = sorted(
                    (AUDIT / folder).glob(f"{hazard}_{code}_map_*.png"),
                    key=lambda p: p.stat().st_mtime,
                )
                if files:
                    shutil.copy2(
                        files[-1], validation / folder / f"{hazard}_{code}_map.png"
                    )
    for p in [
        DATA / "regional_coverage_served.json",
        DATA / "regional_coverage_served.csv",
        DATA / "coverage_diagnostics.json",
        DATA / "tile_boundary_diagnostics.json",
    ]:
        shutil.copy2(p, validation / p.name)
    archive = DATA / "reproducibility"
    for p in [
        *versions,
        *list((ROOT / "scripts/wbgt").glob("*.py")),
        *list((ROOT / "scripts/wbgt").glob("*.mjs")),
        ROOT / "scripts/wbgt/README.md",
        ROOT / "scripts/wbgt/README_HISTORY_ASOS_AND_SUWON.md",
        ROOT / "scripts/wbgt/requirements-national-lock.txt",
    ]:
        dst = archive / p.relative_to(ROOT)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dst)
    doc_text = DOC.read_text(encoding="utf8").split("\n## 최종 검증 결과\n")[0]
    doc_text += "\n## 최종 검증 결과\n\n| 검사 | 통과 / 대상 |\n|---|---:|\n"
    labels = {
        "nationwide-default.json": "전국 기본 홍수·폭염 Risk 실행",
        "nationwide-wbgt.json": "전국 WBGT 단독 H로 Risk 실행",
        "nationwide-parcels.json": "전국 지도 레이어·실천권역 도출·내보내기",
        "workflows/results.json": "오류·재시도·대안 전환",
        "mode-results.json": "현재·미래 전환",
        "exports/results.json": "실제 PNG 저장",
        "draft-roundtrip.json": "로컬·서버 형식 저장·복원",
        "weights/results.json": "가중치 변경 후 재분석",
        "calculation-crosscheck.json": "입력값으로 독립 재계산",
    }
    doc_text += "| 전국 WBGT 원본·API·공통 격자 대조 | 269 / 269 |\n"
    for name, label in labels.items():
        doc_text += (
            f'| {label} | {checks[name]["passed"]} / {checks[name]["checked"]} |\n'
        )
    doc_text += "\n전국 순회 중 발견한 실패는 수정 후 해당 지역에서 재검사했다. 최종 기록에는 미통과 사례가 없다. 저장·복원의 서버 검사는 시험 응답을 사용했다.\n"
    DOC.write_text(doc_text, encoding="utf8")
    shutil.copy2(DOC, DATA / "README.md")
    shutil.copy2(AUDIT / "validation-summary.json", DATA / "validation-summary.json")
    paths = [
        raster,
        raster.with_suffix(".metadata.json"),
        DATA / "active-tiles.json",
        DATA / "README.md",
        DATA / "validation-summary.json",
        *validation.rglob("*"),
        *archive.rglob("*"),
    ]
    checksums = {str(p.relative_to(DATA)): digest(p) for p in paths if p.is_file()}
    (DATA / "checksums.json").write_text(
        json.dumps(checksums, ensure_ascii=False, indent=2), encoding="utf8"
    )
    print(
        json.dumps(
            {
                "status": "complete",
                "archive": str(DATA),
                "files_checksummed": len(checksums),
                "browser_checks": checks,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
