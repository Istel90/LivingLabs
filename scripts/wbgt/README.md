# 현재 플랫폼의 전국 상세 WBGT

2026-09-08부터 모든 지역의 H11은 `EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V2_NATIONAL` 결과를 사용한다. 수원만 별도 처리하거나 다른 지역을 ASOS 보간판으로 대체하지 않는다.

기준 화면: `/internal-tools/priority-management-area/flood?regionCode=41110`. WBGT는 같은 구현의 `/heatwave`에서 사용자가 선택한다. 현재 결과는 미래 H11 자료를 포함하지 않는다.

## 결과와 설명

- 전국 결과: `D:/90_Data/LivingLabs/derived/WBGT_SPATIAL_REFERENCE_100M/2026-09-08_national_v2`
- 상세 방법·한계·검증: `docs/WBGT_NATIONAL_AND_PLATFORM_VALIDATION_2026-09-08.md`
- 과거 ASOS·수원 기록: `scripts/wbgt/README_HISTORY_ASOS_AND_SUWON.md`

100m 출력, 건물 그림자 내부 계산 10m. KMAP 장기 평균 일사량, NGII 90m DEM, 전국 건물 외곽선·층수, ASOS 폭염 대표 기상조건을 결합한다. 실제 시간별 관측 WBGT나 5년 평균 WBGT가 아닌 공간 비교용 시험 결과다. 수목·국지풍·도시 장파복사를 모두 해석하는 모형은 아니다.

## 실행 환경

Python 3.12와 `requirements-national-lock.txt`를 사용한다. 현재 설치 경로는 `.tools/python312-wbgt`이며, 예전 Python 3.13 `.venv-wbgt`와 섞지 않는다. 계산은 로컬 건물 PostGIS와 보관된 KMAP·DEM·ASOS 자료가 필요하다. 원본 위치는 전국 설명 문서와 계산 스크립트에 기록한다.

```powershell
$env:PYTHONPATH=(Resolve-Path '.tools/python312-wbgt').Path
$env:PYTHONIOENCODING='utf-8'
$wbgtPython='C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $wbgtPython scripts/wbgt/build_national_spatial_wbgt.py --out D:/90_Data/LivingLabs/derived/WBGT_SPATIAL_REFERENCE_100M/2026-09-08_national_v2 --workers 2
& $wbgtPython scripts/wbgt/test_spatial_wbgt.py
& $wbgtPython scripts/wbgt/verify_national_wbgt_data.py --served
& $wbgtPython scripts/wbgt/verify-platform-browser.py
& $wbgtPython scripts/wbgt/verify-national-platform.py --regions all --hazards flood,heatwave --name nationwide-default --resume
& $wbgtPython scripts/wbgt/verify-national-platform.py --regions all --hazards heatwave --wbgt --name nationwide-wbgt --resume
& $wbgtPython scripts/wbgt/verify-platform-parcels.py --regions all --resume
node scripts/wbgt/test-h11-grid.mjs
node scripts/wbgt/test-analysis-serialization.mjs
```

`--resume`는 같은 구현에 대한 중단된 검사를 이어받거나 실패 사례를 재검사하는 옵션이다. 새로운 구현을 전국 재검사할 때는 새 결과 이름을 사용하거나 `--resume` 없이 실행한다. 계산 자료·방법 변경 시에는 반드시 새 계산 버전·출력 폴더를 사용한다.

브라우저 검사에는 로컬 Chrome과 Playwright가 필요하다. `verify-platform-workflows.py`는 오류·재시도와 대안 전환을, `verify-platform-modes.py`는 현재/미래 전환을, `verify-platform-exports.py`는 실제 PNG 저장을, `verify-platform-drafts.py`는 임시 저장과 서버 형식의 저장·복원을 검사한다. 서버 저장 검사는 외부 쓰기 없이 요청을 테스트 응답으로 처리한다. `verify-exported-risk.py`는 설정 내보내기로 받은 실제 입력 배열에서 계산을 독립 대조한다.

플랫폼 배치는 기존 절차대로 `PAGES_BASE_PATH=/internal-tools`로 빌드한 뒤 `pages-dist/internal-tools`에 반영한다. 계산 파일만 저장하거나 다른 데모 화면에서 확인한 것을 플랫폼 적용 완료로 취급하지 않는다.
