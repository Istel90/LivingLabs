# 남한 전국 100m 기후위험 Hazard Source Plan

작성일: 2026-08-07
상태: Source Inventory v1 — Raster 대량생산 전 승인 기준

## 1. 목적과 작업 경계

이 문서는 남한 전역 기후위험 Hazard 지표 H01~H10을 동일한 100m 분석격자에 정합하기 위한 자료원, 지표 정의, 처리방법, 품질검사 및 인증 상태를 확정한다.

현재 단계에서는 Hazard 원천자료와 처리계획만 다룬다. Exposure, Vulnerability, Risk, Hotspot, UI, Supabase 변경은 범위에 포함하지 않는다.

핵심 표현은 `100m 해상도 기후자료`가 아니라 **`100m 분석격자에 정합된 기후정보`**이다. 원자료의 고유 해상도는 모든 메타데이터에 별도로 기록한다.

## 2. 확정된 결정사항

1. 미래 전망은 SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5 네 시나리오를 모두 구축·보관한다.
2. TX90P는 비율이 아니라 기상청 정의에 따른 **연중 일수(days/year)** 로 사용한다.
3. H09는 기상청 공식 `WSDIx(최대온난일 계속기간)`를 사용한다. 공식 파일을 확보하지 못하면 동일 정의로 일 최고기온에서 산출하고 대체산출임을 표시한다.
4. 기존 2021~2025 자체 기준 WSDI/WSDIx 결과는 공식 결과가 아닌 **시험자료**로만 유지한다.
5. 열대야 TR25는 **일 최저기온이 25℃ 이상인 날의 연중 일수**로 통일한다.
6. LST는 2021~2025만 구축하며 미래 LST는 생성하지 않는다.
7. 장기 전망은 연도 라벨별 10년 평균을 사용한다: 2040=2031~2040, 2050=2041~2050, ..., 2100=2091~2100.

## 3. 기간별 우선 자료원

### 3.1 최근 관측 2021~2025

#### 1순위: 기상청 고해상도 격자자료 500m

- 기관: 기상청 API허브
- 자료: 고해상도 격자자료(500m)
- 범위: 남한 지상 및 연해
- 보유기간: 1997-01-01 이후
- 생산주기: 5분
- 주요 변수: 기온 `ta`
- 직접 제공되는 연 통계: 연평균기온 `ta_avg`
- 형식: ASCII, binary, NetCDF4
- 공식 안내: https://apihub.kma.go.kr/apiList.do?seqApi=971

H01은 연평균 NetCDF를 직접 사용한다. H02~H09는 5분 기온을 일 평균·일 최고·일 최저로 집계한 뒤 연 지표를 산출할 수 있으나, 전국 5년 자료량과 API 호출제한을 먼저 시험해야 한다.

2026-08-07 고해상도 격자자료 API 활용신청 반영 후 같은 `KMA_API_KEY`로 H01 2023 연평균 NetCDF를 요청해 HTTP 200을 확인했다. 시험파일은 NetCDF4/HDF5이며, 2049×2049 격자, Lambert Conformal Conic, 격자크기 0.5km, 단위 ℃, 저장배율 10, 결측값 -9990으로 검증했다. 서버의 응답 Content-Type은 ZIP으로 표시됐지만 실제 파일 시그니처와 내부 구조는 NetCDF4였다.

#### 대체: 기상청 ASOS + AWS 관측자료

- ASOS: 약 100개 내외 지점, 장기 관측
- AWS: 약 500개 내외 지점, 1997년 이후
- 접근: 기상청 API허브 또는 기상자료개방포털 파일셋
- ASOS 공식 안내: https://apihub.kma.go.kr/apiList.do?apiSeq=2
- AWS 공식 안내: https://apihub.kma.go.kr/apiList.do?seqApi=2&seqApiSub=239

ASOS/AWS는 관측망의 품질검사를 거쳐 지형·고도·해양도 등을 고려한 공간모형으로 분석격자에 변환한다. 단순 IDW를 기본방법으로 확정하지 않는다. 500m 공식 격자자료를 사용할 수 있으면 ASOS/AWS 공간화보다 우선한다.

#### H10 LST

- 자료: Landsat 8/9 Collection 2 Level-2 Surface Temperature
- 플랫폼: Google Earth Engine
- 변수: `ST_B10`, `QA_PIXEL`, `QA_RADSAT`
- 기간: 2021~2025, 6~9월
- 연 대표값: 구름·그림자 제거 후 관측별 LST의 연도별 P90
- Landsat 8: https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2
- Landsat 9: https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC09_C02_T1_L2
- USGS ST 설명: https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature

현재 2021~2025 전국 파일 5개가 존재하며 동일한 EPSG:5179 100m 격자 정렬을 확인했다. 다만 Earth Engine 30m 제품격자에서 100m로 내보낼 때 사용된 리샘플링/집계방법과 유효 관측수 QA를 확인한 뒤 최종 승인한다.

### 3.2 근미래 2026~2030

#### 1순위: 기상청 AR6 SSP 남한상세 500m 기후요소와 1km 공식 극한기후지수

- 모델: 5ENSMN 앙상블
- 시나리오: SSP126, SSP245, SSP370, SSP585
- 범위: 남한상세 `skorea`
- 공간해상도: H01~H03 기후요소 500m, H04~H09 공식 극한기후지수 1km(0.01도, 751×601)
- 제공기간: 미래전망 2021~2100
- 시간해상도: H01~H03 일·월·연, H04~H09 공식 연 지수
- 형식: NetCDF
- 공식 다운로드: https://climate.go.kr/atlas/ana/cdd
- 1km 격자자료 매뉴얼: https://www.climate.go.kr/home/CCS/_image/web_manual/grid_manual.pdf

2026-08-07 다운로드 화면에서 SSP126·SSP245·SSP370·SSP585 모두에 대해 남한상세 500m, 5ENSMN, 2021~2100, 일·월·연 NetCDF 목록을 확인했다. 2026-08-10에는 네 SSP의 `TA`·`TAMAX`·`TAMIN` 500m 연자료 원파일을 확보하고 H01~H03을 전국 Master Grid v1으로 정합했다. 이어 공식 1km 연 극한기후지수 `HW33`·`TR25`·`WSDI`·`TXx`·`TX90P`·`WSDIx` 24개 NetCDF를 확보해 시간축·좌표·단위·결측값을 검증하고 H04~H09를 시나리오별 12개 기간, 전국 Master Grid v1으로 정합했다. H04~H09는 일자료에서 재산출하지 않고 기상청 공식 연 지수값을 직접 사용한다. 모든 결과는 예보가 아니라 시나리오 기반 전망값이며 `observed_or_scenario=scenario`로 기록한다.

### 3.3 장기 2040~2100

근미래와 동일하게 H01~H03은 기상청 남한상세 500m 기후요소, H04~H09는 1km 공식 극한기후지수를 사용한다. 각 지표의 공식 연 자료를 먼저 확보한 후 연도 라벨별 10년 평균을 계산한다. 시간집계를 공간 리샘플링보다 먼저 수행한다.

## 4. 지표 정의

| ID | 지표 | 정의 | 단위 | 미래 공식 변수 |
|---|---|---|---|---|
| H01 | 평균기온 | 대상기간 일평균기온의 평균 | ℃ | TA |
| H02 | 평균최고기온 | 일 최고기온의 대상기간 평균 | ℃ | TAMAX |
| H03 | 평균최저기온 | 일 최저기온의 대상기간 평균 | ℃ | TAMIN |
| H04 | 폭염일수 | 일 최고기온 33℃ 이상인 날의 연중 일수 | days/year | HW33 |
| H05 | 열대야일수 | 일 최저기온 25℃ 이상인 날의 연중 일수 | days/year | TR25 |
| H06 | 온난일 계속기간 | 기준기간의 일별 90퍼센타일 초과가 6일 이상 지속된 구간에 포함된 연중 일수 | days/year | WSDI |
| H07 | 일최고기온 연최대 | 일 최고기온의 연중 최대값 | ℃ | TXx |
| H08 | 온난일 | 기준기간의 일별 90퍼센타일을 초과한 날의 연중 일수 | days/year | TX90P |
| H09 | 최대온난일 계속기간 | 기준기간의 일별 90퍼센타일을 초과한 날의 연중 최대 지속일수 | days/year | WSDIx |
| H10 | 여름철 지표면온도 P90 | 6~9월 구름 제거 Landsat LST 관측값의 연도별 90퍼센타일 | ℃ | ST_B10 |

기상청 공식 극한기후지수 정의: https://www.climate.go.kr/home/CCS/_image/web_manual/data_information.pdf

## 5. Master 100m Grid v1

현재 완료된 전국 연도별 LST 파일과의 정렬을 유지하는 Master Grid v1을 다음과 같이 고정한다.

| 항목 | 값 |
|---|---|
| grid_spec_id | KOR_100M_EPSG5179_V1 |
| CRS | EPSG:5179 |
| pixel_size | 100m × 100m |
| width | 5,569 columns |
| height | 6,107 rows |
| total_cells | 34,009,883 |
| upper_left_x | 745,900 |
| upper_left_y | 2,068,600 |
| bounds | xmin=745,900; ymin=1,457,900; xmax=1,302,800; ymax=2,068,600 |
| affine_transform | [100, 0, 745900, 0, -100, 2068600] |
| NoData | -9999 |
| GRID_ID | `row * 5569 + col + 1` (row/col은 0부터 시작) |

육지·연해 마스크는 대한민국 공식 행정경계와 도서 포함 여부를 검증한 뒤 별도 버전으로 고정한다. 기존 FAO GAUL 경계는 시험용으로만 인정하며 최종 마스크의 기준자료로 자동 승계하지 않는다.

마스크 적용은 전국 기반층을 수정하지 않고 `scripts/kma/apply_master_grid_mask.py`로 별도 파생본을 만든다. 정합된 래스터 마스크 또는 CRS가 명시된 GeoJSON을 입력하며, `mask_version`·원본/마스크/결과 체크섬·Master Grid 행/열 오프셋을 메타데이터에 기록한다.

## 6. 100m 정합 규칙

- 연속형 기온(℃): 원격자에서 EPSG:5179로 변환 후 bilinear 리샘플링.
- 일수·지속기간: 공식 또는 공식 정의로 산출한 원자료 값을 보존하도록 nearest-neighbor 리샘플링.
- LST: 30m 제품격자에서 100m로 면적평균 집계하는 방법을 권장한다. 기존 결과는 실제 Earth Engine 처리방식을 QA한다.
- 모든 출력은 Master Grid의 transform, extent, width, height, NoData를 강제로 사용한다.
- 500m 또는 1km 원자료를 100m로 정합해도 원자료 해상도는 각각 500m 또는 1km로 기록한다.
- 시나리오별·연도별 원자료는 가공 전 상태로 보존하고 checksum을 기록한다.

## 7. 처리 순서

1. 자료 접근권한과 실제 파일명 검증
2. 원자료 다운로드 및 checksum 생성
3. 변수·단위·달력·결측값 확인
4. 시간 집계 또는 공식 연 지표 추출
5. 작은 시험지역 처리
6. Master Grid 정합
7. GeoTIFF/COG 생성
8. 메타데이터 작성
9. QA 통과 후 전국 처리

## 8. QA 승인 기준

### 구조 QA

- CRS, transform, width, height, bounds가 Master Grid v1과 완전 일치
- NoData=-9999
- 예상 dtype와 band count 확인
- 파일 checksum 기록

### 값 QA

- H01~H03·H07·H10은 물리적으로 가능한 ℃ 범위 확인
- H04~H06·H08~H09는 0~366일 범위 확인
- 육지 유효셀 비율과 결측률 기록
- 연도·시나리오 간 비정상적인 상수 Raster 또는 전체 결측 탐지

### 정의 QA

- TX90P 단위는 days/year
- WSDI와 WSDIx를 혼용하지 않음
- TR25는 일 최저기온 기준
- percentile 지표는 기준기간과 계산방식을 메타데이터에 기록
- 기존 자체 기준 WSDI/WSDIx에는 `test_only=true` 표시
- 공식 5ENSMN 원자료 일부 셀의 `WSDIx > WSDI` 관계는 원자료 직접 대조로 확인하고 그대로 보존하며, 재격자화로 새 관계 이상이 생기지 않았는지 별도 기록

## 9. 메타데이터 필수 필드

기존 인계 필드에 다음을 추가한다.

- grid_spec_id
- statistic
- baseline_period
- model
- ensemble
- resampling_method
- mask_version
- valid_cell_count
- missing_rate
- dtype
- checksum_sha256
- license_or_terms
- quality_status
- test_only

## 10. 기존 자산 판정

| 자산 | 상태 | 처리 |
|---|---|---|
| 전국 LST 2021~2025 연도별 5개와 5년 평균층 | NATIONAL_MASTER_GRID_COMPLETE_QA_PENDING | 격자 정렬·5년 평균 생성 완료; 30m→100m 집계·유효관측수 QA 후 승인 |
| H01 최근 관측 2021~2025 연도별 5개와 5년 평균층 | NATIONAL_MASTER_GRID_COMPLETE_MASK_PENDING | 기상청 500m 연평균 원자료와 전국 100m 산출물 검증 완료; 버전화된 마스크를 파생단계에서 적용 |
| ASOS 2021~2025 지점별 폭염·열대야·WSDI 시험자료 | TEST_ONLY | 공식 Raster로 사용하지 않음 |
| H04~H09 공식 1km SSP 연 지수 24개와 전국 GeoTIFF 288개 | NATIONAL_MASTER_GRID_COMPLETE_MASK_PENDING | 체크섬·격자·범위 QA 통과; 버전화된 마스크를 파생단계에서 적용 |
| 수원 SSP126/245/370 자료 | LEGACY_EXCLUDED | 전국 원자료로 사용하지 않음 |
| 기존 수원 100m 격자 | LEGACY_EXCLUDED | Master Grid 원천으로 사용하지 않음 |

## 11. 인증과 접근 상태

| 서비스 | 상태 | 다음 조치 |
|---|---|---|
| KMA API Key | 저장됨 | 코드에 하드코딩하지 않고 `.env.local`에서 읽음 |
| KMA 기존 ASOS API | 기존 수집자료 존재 | 필요 시 작은 요청으로 재검증 |
| KMA 500m 격자 API | 활용승인·HTTP 200 확인; H01 2021~2025 원자료·전국 100m 변환 완료 | H02~H09에는 5분 전국 격자 대신 ASOS·AWS 공간모형 적용 |
| KMA 기후정보포털 SSP | H01~H03 500m 기후요소와 H04~H09 1km 공식 연 지수, 4개 SSP 다운로드·내부 QA·전국 변환 완료 | 공식 마스크 확정 후 지역 추출 |
| Google Earth Engine | OAuth 인증파일 존재 | 기존 LST QA 또는 재생성 시 사용 |
| VWorld | 키 존재 | Hazard 1차 구축에는 원칙적으로 미사용 |

## 12. 다음 실행 순서

1. 완료(2026-08-07): 기상청 500m 고해상도 격자자료 API 활용권한 확보
2. 완료(2026-08-07): H01 2023 연평균 500m NetCDF 시험 다운로드
3. 완료(2026-08-07): 파일의 투영·shape·단위·배율·결측·용량 검증
4. 완료(2026-08-07): 서울권 30×30km에서 H01을 Master Grid v1에 정합(300×300, 결측 0%)
5. 완료(2026-08-10): H01~H03 네 SSP 연자료 `TA`·`TAMAX`·`TAMIN` 확보 및 시간축·좌표·단위 검증
6. 완료(2026-08-10): 서울권 H01~H03 시험 변환 및 온도관계 검증
7. 완료(2026-08-10): H01~H03 전국 Master Grid 기반층 144개 GeoTIFF 생성 및 체크섬 검증
8. 완료(2026-08-10): 전국 원본 보존형 래스터/GeoJSON 마스킹 도구 구현 및 임시 정합 마스크 검증
9. 완료(2026-08-10): H04~H09 네 SSP 공식 1km 연 지수 NetCDF 24개 확보 및 시간축·좌표·단위·결측값 검증
10. 완료(2026-08-10): 서울권 H04~H09 시험 변환 및 값 범위 검증
11. 완료(2026-08-10): H04~H09 전국 Master Grid 기반층 288개 GeoTIFF 생성 및 전체 체크섬·격자·원자료 관계 QA
12. 완료(2026-08-10): H01 최근 관측 2021~2025 기상청 500m 연평균 원자료 확보 및 연도별 전국 100m 5개·5년 평균층 생성
13. 완료(2026-08-10): LST 2021~2025 연도별 전국 100m 5개 격자검증 및 5년 평균층 생성
14. H02~H05·H07 최근 관측 ASOS·AWS 공간모형 구축
15. H06·H08·H09의 1991~2020 기준기간과 공간모형 확정
16. 전국 공식 마스크 버전 확정 후 최근 관측·미래 시나리오 행정경계·사업대상지 지역 추출
17. LST 2021~2025 면적집계·유효관측수 QA

상세 진행현황은 `HAZARD_STATUS.md`에서 관리한다.

자료 접근 실패 시 `FAILED`, 원인, 시도한 방법, 대체 자료원, 재시도 조건만 기록하고 임의 자료를 생성하지 않는다.
