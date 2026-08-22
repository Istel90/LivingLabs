# 전국 홍수 100m PostGIS

## 현재 적재 범위

공통 기준은 EPSG:5179, 100m 셀입니다. `analysis.grid_cells_100m` 및 `analysis.region_grid_cells_100m`을 재사용합니다.

| 화면 코드 | 내부 API 키 | 구분 | 원자료 | 서비스 값 |
| --- | --- | --- | --- | --- |
| H01 | FH01 | H | 도시침수 30년 위험등급 | 등급별 침수심 중간값(m) |
| H02 | FH02 | H | 국가하천 범람 100년 위험등급 | 등급별 침수심 중간값(m) |
| H03 | FH03 | H | 지방하천 범람 50년 위험등급 | 등급별 침수심 중간값(m) |
| H04 | - | H | 2002~2022 공개 침수이력 | 셀별 관측 기왕최대 침수심(m) |
| E01 | FE01 | E | 2024 전국 총인구 100m | 명/셀 |
| E02 | FE02 | E | 2024 전국 주택 100m | 호/셀 |
| E03 | FE03 | E | 2021 수원시 실제 일평균 유동인구 100m | 명/셀·일평균 |

화면에는 H/E 코드를 표시하고 기존 API 호환을 위해 내부 키 FH/FE를 유지합니다. 침수등급 중간값은 1=0.25m, 2=0.75m, 3=1.5m, 4=3.5m, 5=5.0m입니다.

## PostGIS 테이블

- `analysis.flood_observed_history`: 2002~2022 침수이력 폴리곤 38,003건
- `analysis.flood_observed_max_100m`: 침수이력과 겹치는 100m 셀별 최대 침수심·사건 수·최근 연도

기왕최대 파생값은 2002~2022, 0m 초과 20m 이하만 사용합니다. 원본의 연도 0(257건), 0 이하 수심(15건), 20m 초과 수심(15건)은 원본 테이블에 보존하되 파생 계산에서는 품질 이상치로 제외합니다.
- `analysis.national_facilities`: 전국 민방위 대피시설과 도시철도 역사
- `analysis.national_road_links`: 전국 ITS 도로 링크 2,112,346건(도시부·비도시부·도시고속·고속도로)
- 기존 `analysis.flood_indicator_values_100m`: 도시침수·하천범람·인구·주택 격자 값

대량 입력은 JSONB 배치 적재를 사용하며, 공간 조회에는 GiST 인덱스, 출처·유형 조회에는 복합 B-tree 인덱스를 사용합니다.

## 재구축 명령

1. `python riskmap-core-main/scripts/download-flood-national.py --all`
2. `scripts/prepare-flood-postgis.ps1`
3. `node --max-old-space-size=2048 riskmap-core-main/scripts/load-flood-grid-postgis.mjs --replace`
4. `pnpm --dir riskmap-core-main flood:collect-history`
5. `pnpm --dir riskmap-core-main flood:collect-national-roads`
6. `pnpm --dir riskmap-core-main flood:load-national-roads`
7. `pnpm --dir riskmap-core-main flood:collect-national-facilities`
8. `GET /flood-grid/health`로 상태 확인

원자료 TIFF·GeoJSON 스냅샷은 `data/LivingLabs_flood_national`에 저장하며 Git에는 포함하지 않습니다.

## 건물과 연속지적도

연속지적도는 토지 필지 자료이므로 실제 건물 외곽선을 직접 추출할 수 없습니다. 지목이 `대`인 필지를 건물 후보지로 거르는 것은 가능하지만 빈 필지·주차장·한 필지 내 여러 건물을 구분하지 못하므로 분석용 건물 데이터로 사용하지 않습니다.

건물은 GIS 건물통합정보(수치지형도 건물 레이어와 건축물대장 속성의 결합)를 별도로 수집합니다. 노후주택 비율은 이 자료의 사용승인일과 주용도를 100m 셀로 집계해 파생해야 합니다. 공개 MOIS 건물 FeatureServer에는 사용승인일이 없어 건물 외곽선·층수 보조 자료로만 사용합니다.

## 아직 원자료가 필요한 지표

- 65세 이상 및 유아·유소년 전국 100m: 국토지리정보원 B100 로그인/대용량 원자료 필요
- 장애인 전국 100m: 공개 원자료의 공간 단위가 달라 변환 기준 확정 필요
- 노후주택: GIS 건물통합정보 전국 파일 필요
- DEM/TWI/Flow accumulation/Depression: DEM 원천과 해상도 확정 필요
- 전국 유동인구: 공개 단일 100m 원자료가 없어 지역·통신사 자료별 확장 필요

읍면동 통계나 임의 추정값을 100m 실제값처럼 채우지 않습니다. 원자료가 없는 V/A 지표는 `미확보`로 유지합니다.
