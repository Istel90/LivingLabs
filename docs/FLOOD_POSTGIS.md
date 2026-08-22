# 전국 홍수 100m PostGIS

## 현재 적재 범위

공통 기준은 EPSG:5179, 100m 셀입니다. 기존 `analysis.grid_cells_100m` 및 `analysis.region_grid_cells_100m`을 재사용합니다.

| 화면 코드 | 내부 API 키 | 구분 | 원자료                                | 서비스 값               |
| --------- | ----------- | ---- | ------------------------------------- | ----------------------- |
| H01       | FH01        | H    | 도시침수 30년 위험등급                | 등급별 침수심 중간값(m) |
| H02       | FH02        | H    | 국가하천 범람 100년 위험등급          | 등급별 침수심 중간값(m) |
| H03       | FH03        | H    | 지방하천 범람 50년 위험등급           | 등급별 침수심 중간값(m) |
| E01       | FE01        | E    | 2024 전국 총인구 100m                 | 명/셀                   |
| E02       | FE02        | E    | 2024 전국 주택 100m                   | 호/셀                   |
| E03       | FE03        | E    | 2021 수원시 실제 일평균 유동인구 100m | 명/셀·일평균            |

화면에는 H/E 코드만 표시하고, 내부 API 키는 재해별 충돌을 피하기 위해 FH/FE를 유지합니다.

침수등급 중간값은 1=0.25m, 2=0.75m, 3=1.5m, 4=3.5m, 5=5.0m입니다. 원자료의 0값은 비침수 또는 비집계 셀로 보고 희소 저장에서 생략합니다.

## 재구축 순서

1. `lh_gis` Conda 환경을 활성화합니다. `rasterio`, `requests`, GDAL 명령 도구가 필요합니다.
2. `python riskmap-core-main/scripts/download-flood-national.py --all`을 실행합니다.
3. `scripts/prepare-flood-postgis.ps1`을 실행합니다.
4. `node --max-old-space-size=2048 riskmap-core-main/scripts/load-flood-grid-postgis.mjs --replace`를 실행합니다.
5. 수원시 공식 유동인구 SHP를 받은 뒤 `node riskmap-core-main/scripts/load-floating-population-postgis.mjs --shp=<SHP 경로> --replace`를 실행합니다.
6. `GET /flood-grid/health`로 적재 상태를 확인합니다.

원자료 TIFF와 다운로드 타일은 `data/LivingLabs_flood_national`에 저장되며 Git에는 포함하지 않습니다. 다운로드 스크립트는 중단된 타일을 재사용하고, GDAL VRT/warp로 7,000×7,000 전국 격자를 스트리밍 생성합니다.

## API

- `GET /flood-grid/health`
- `GET /flood-grid?regionCode=41110&indicator=FH01`
- `GET /flood-grid?regionCode=41110&indicator=FE03`

응답은 `livinglabs-flood-grid/v1`의 `sparse-index-value` 형식입니다. 지역 내부에서 값이 0인 셀은 희소 배열에 포함하지 않습니다.

## 유동인구 범위

E03은 수원시정연구원의 2021년 실제 일평균 유동인구 100m GIS 원자료만 사용합니다. PostGIS 공통 셀에는 10,790개가 정렬되며, 서비스 활성 범위는 수원시·4개 구(`4111*`)입니다. 공개 전국 단일 100m 유동인구 자료가 없으므로 다른 지역에는 추정값을 만들지 않습니다. 다른 지자체 또는 통신사 원자료를 확보하면 같은 적재기로 지역별 확장합니다.

## 미확보 지표

첨부 번들에는 고령·유아·장애인, 반지하·노후주택, 취약시설, 빗물받이·배수펌프장·저류시설·대피시설 원자료가 없습니다. 따라서 현재 UI에서는 이 V/A 지표를 `미확보`로 표시하고 가짜 값으로 계산하지 않습니다. V/A가 연결되기 전 분석 결과는 H-only 예비 위험도로 명시합니다.
