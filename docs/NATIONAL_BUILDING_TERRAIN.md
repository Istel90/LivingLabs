# 전국 건물·지형 데이터 운영

## 현재 구축 상태

모든 분석 래스터는 EPSG:5179, 100m 전국 기준격자에 맞추고 PostGIS Raster에는 256×256 타일과 GiST 인덱스로 적재한다.

| 자료 | 저장 위치 | 용도 |
| --- | --- | --- |
| GHSL 건축환경 11밴드 | `analysis.building_ghsl_100m` | 건축면적·높이·체적 전국 공백 확인용 보조자료 |
| Earth Engine 지형 8밴드 | `analysis.terrain_gee_validation_100m` | Copernicus·NASADEM·MERIT Hydro 교차검증 |
| Copernicus GLO-30 파생자료 | `analysis.terrain_*_100m` | 고도·경사·D8 유량누적·단위등고선 길이당 기여면적(SCA)·TWI·저지대 깊이 |
| 공식 GIS 건물통합정보 | `raw.gis_building_integrated` | 건물 외곽선·용도·사용승인일 기반 공식 파생값 |

## 공식 GIS 건물통합정보

연속지적도는 토지 필지이므로 건물 외곽선을 추출하는 자료로 사용하지 않는다. 지목이 대인 필지도 빈 필지, 주차장, 한 필지 내 여러 건물을 구분하지 못한다.

브이월드의 GIS 건물통합정보(`dsId=18`)는 로그인이 필요하다. 전국 ZIP을 내려받아 아래 경로에 둔다.

`data/LivingLabs_flood_national/04_vulnerability/gis_building_integrated/raw`

그 뒤 다음 명령을 실행한다.

`pnpm --dir riskmap-core-main flood:load-buildings`

적재기는 ZIP을 풀고 모든 SHP를 EPSG:5179로 통일해 `raw.gis_building_integrated`에 병합하며 GiST 인덱스와 출처 카탈로그를 만든다. 노후주택 비율은 사용승인일과 주용도를 100m 셀별로 집계한 뒤 생성한다.

2026-08-22 기준 최신 행정코드 16개 전국 ZIP, 23개 SHP의 14,391,996개 건물 레코드를 적재했다. 전체 권역 코드 `11, 12, 26, 27, 28, 30, 31, 36, 41, 43, 44, 47, 48, 50, 51, 52`가 확인됐으며, 원자료에 형상이 없는 2개 레코드는 속성을 보존하고 공간 분석에서 제외한다. 테이블은 EPSG:5179로 통일됐고 기본키와 GiST 공간 인덱스를 갖는다.

원본 DBF 일부에는 필드 내부 제어문자가 포함되어 `COPY`를 중단시킬 수 있다. 적재기는 ZIP 원본을 변경하지 않고 추출본의 고정길이 레코드 영역만 블록 단위로 정규화한 뒤 적재한다.

## DEM과 파생지표

먼저 GIS Conda 환경에서 `pip install -r riskmap-core-main/scripts/requirements-terrain.txt`로 래스터 처리 의존성을 준비한다.

`pnpm --dir riskmap-core-main flood:build-terrain`은 공개 Copernicus DEM GLO-30 전국 44개 타일을 내려받아 공통 100m 격자로 평균 재표본화한다. 이후 WhiteboxTools로 다음 자료를 만든다.

- 함몰부 보정 DEM
- 경사도
- D8 유량누적
- 단위등고선 길이당 기여면적(SCA)
- 지형습윤지수(TWI)
- 저지대·함몰 깊이

Earth Engine에서는 Copernicus DEM 2024_1, NASADEM, MERIT Hydro를 동일 격자로 내보낸다. MERIT의 상류면적·상류픽셀·HAND·상시수체는 독립적인 검증·보조 밴드로 유지한다.

## 대체자료 사용 제한

GHSL은 공식 GIS 건물통합정보의 대체물이 아니다. `1990 건축면적 / 2020 건축면적`은 과거 시가지 비중을 보는 대리지표이며, 건축물대장의 사용승인일로 계산한 노후주택 비율로 표시하면 안 된다.

Google Open Buildings V3는 대한민국 피처가 확인되지 않아 사용하지 않는다. Earth Engine 자료와 로컬 파생자료는 동일 격자·좌표계·값 범위를 검사하고, 원본 파일과 체크섬을 Git 제외 데이터 디렉터리에 보존한다.

## 검증과 SQL 안정성

Earth Engine GeoTIFF는 마스킹 영역을 NaN으로 포함할 수 있다. `load-analysis-raster-postgis.py`는 원본 체크섬 파일을 보존하고 별도의 `*.postgis.tif`를 만들면서 모든 비유한값을 `-9999` NoData로 바꾼다. 따라서 `ST_SummaryStatsAgg` 같은 SQL 통계가 NaN으로 오염되지 않는다. 완전한 NoData 타일은 적재에서 빠져 현재 GHSL은 674타일, Earth Engine 지형 검증본은 613타일이다.

## 공식 출처

- GIS 건물통합정보: https://www.data.go.kr/data/15083092/fileData.do
- 브이월드 다운로드: https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18
- Copernicus DEM GLO-30 공개 AWS: https://registry.opendata.aws/copernicus-dem/
- Earth Engine Copernicus DEM: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30_2024_1
- Earth Engine NASADEM: https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001
- Earth Engine MERIT Hydro: https://developers.google.com/earth-engine/datasets/catalog/MERIT_Hydro_v1_0_1
- Earth Engine GHSL: https://developers.google.com/earth-engine/datasets/catalog/JRC_GHSL_P2023A_GHS_BUILT_S
