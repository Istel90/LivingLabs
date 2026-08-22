# 전국 홍수 100m PostGIS

## 현재 적재 범위

공통 기준은 EPSG:5179, 100m 셀입니다. 기존 `analysis.grid_cells_100m` 및 `analysis.region_grid_cells_100m`을 재사용합니다.

| 코드 | 구분 | 원자료 | 서비스 값 |
|---|---|---|---|
| FH01 | H | 도시침수 30년 위험등급 | 등급별 침수심 중간값(m) |
| FH02 | H | 국가하천 범람 100년 위험등급 | 등급별 침수심 중간값(m) |
| FH03 | H | 지방하천 범람 50년 위험등급 | 등급별 침수심 중간값(m) |
| FE01 | E | 2024 전국 총인구 100m | 명/셀 |
| FE02 | E | 2024 전국 주택 100m | 호/셀 |

침수등급 중간값은 1=0.25m, 2=0.75m, 3=1.5m, 4=3.5m, 5=5.0m입니다. 원자료의 0값은 비침수 또는 비집계 셀로 보고 희소 저장에서 생략합니다.

## 재구축 순서

1. `lh_gis` Conda 환경을 활성화합니다. `rasterio`, `requests`, GDAL 명령 도구가 필요합니다.
2. `python riskmap-core-main/scripts/download-flood-national.py --all`을 실행합니다.
3. `scripts/prepare-flood-postgis.ps1`을 실행합니다.
4. `node --max-old-space-size=2048 riskmap-core-main/scripts/load-flood-grid-postgis.mjs --replace`를 실행합니다.
5. `GET /flood-grid/health`로 적재 상태를 확인합니다.

원자료 TIFF와 다운로드 타일은 `data/LivingLabs_flood_national`에 저장되며 Git에는 포함하지 않습니다. 다운로드 스크립트는 중단된 타일을 재사용하고, GDAL VRT/warp로 7,000×7,000 전국 격자를 스트리밍 생성합니다.

## API

- `GET /flood-grid/health`
- `GET /flood-grid?regionCode=41110&indicator=FH01`

응답은 `livinglabs-flood-grid/v1`의 `sparse-index-value` 형식입니다. 지역 내부에서 값이 0인 셀은 희소 배열에 포함하지 않습니다.

## 미확보 지표

첨부 번들에는 고령·유아·장애인, 반지하·노후주택, 취약시설, 빗물받이·배수펌프장·저류시설·대피시설 원자료가 없습니다. 따라서 현재 UI에서는 이 V/A 지표를 `미확보`로 표시하고 가짜 값으로 계산하지 않습니다. V/A가 연결되기 전 분석 결과는 H-only 예비 위험도로 명시합니다.
