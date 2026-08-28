# 도시침수 실제자료 플랫폼 연결

## 현재 사용 자료

- 원본: `D:\90_Data\LivingLabs\imports\2026-08-25_home\flood_admin\urban`
- 도시침수 시나리오: 30년·50년·80년·100년 빈도 ZIP 원본, 행정구역별 기왕최대 ZIP 85건
- 기왕최대 원본: `D:\90_Data\LivingLabs\imports\2026-08-25_home\flood_admin\urban\max`
- 현재 서비스 지표: 30년·50년·80년·100년 빈도와 기왕최대 5m 원본을 EPSG:5179 전국 100m 셀로 정렬한 침수심
- 가공 래스터: `project_generated_data\LivingLabs_flood_national\02_hazard\floodmap\H_urban_flood_30y_class_100m_epsg5179.tif`
- 운영 DB: `127.0.0.1:55432/livinglabs_postgis`
- 전체 백업: `database_backups\postgis\livinglabs_postgis_full_2026-08-23.dump`

## 화면에서 사용하는 실제 지표

| 영역 | 지표 | 원자료 |
| --- | --- | --- |
| 위험 | 도시침수 30년 | 환경부 생활안전지도 도시침수지도 |
| 위험 | 도시침수 50년·80년·100년 | 환경부 생활안전지도 빈도별 도시침수지도 |
| 위험 | 도시침수 기왕최대 | 홍수위험지도 정보제공포털 행정구역별 기왕최대 도시침수지도(공개 85건) |
| 위험 | 1시간 최대강우량 | 기상청 ASOS 2016~2025 극값 |
| 위험 | 저지대 지형 | 전국 DEM 100m |
| 노출 | 상주인구·주택 | 국토정보플랫폼 2024년 100m 통계격자 |
| 민감도 | 지하층 건축물·30년 이상 건축물 | VWorld GIS 건물통합정보 |
| 적응역량 | 대중교통 대피 접근성 proxy | 전국 버스정류장 위치정보 |

원자료가 없는 빗물받이·배수펌프장 항목은 비활성 상태로 표시하며 분석에 포함하지 않는다. 기존 고정 후보지 샘플도 제거하고 실제 격자 분석 결과로 후보지를 생성한다.

## API

- `GET /flood-grid/health`
- `GET /flood-grid?regionCode=41110&indicator=FH01`
- `GET /flood-grid?regionCode=41110&indicator=UF50`
- `GET /flood-grid?regionCode=41110&indicator=UF80`
- `GET /flood-grid?regionCode=41110&indicator=UF100`
- `GET /flood-grid?regionCode=41110&indicator=UFMAX`
- `GET /analysis-grid?regionCode=41110&indicator=rain-max-1h`
- `GET /analysis-grid?regionCode=41110&indicator=terrain-low-elevation`
- `GET /analysis-grid?regionCode=41110&indicator=building-basement-count`

응답은 `sparse-index-value` 형식의 지역별 100m 희소 격자이며 브라우저에서 전체 셀 배열로 복원한다.

## 복원

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore-livinglabs-postgis.ps1 `
  -DumpFile 'D:\90_Data\LivingLabs\imports\2026-08-25_home\database_backups\postgis\livinglabs_postgis_full_2026-08-23.dump'
```

기본 복원 대상은 기존 `vworld_cadastral`을 건드리지 않는 `livinglabs_postgis`이다. 같은 이름의 DB가 이미 있으면 중단하며, 명시적으로 `-Force`를 준 경우에만 교체한다.

## 남은 범위

80년 빈도 원본은 전국 묶음 기준 222개 지역으로, 30년·50년·100년보다 2개 지역이 적다. 화면에서는 이 커버리지 차이를 ‘부분 확보’로 표시한다.

기왕최대 데이터셋은 2026-08-28 조회 기준 포털에서 85개 시군구 ZIP만 공개되어 있다. 공개된 전체를 적재하되, 전국 모든 시군구를 포괄하지 않으므로 화면에서 ‘부분 구축’으로 표시한다.

100m 격자 변환 결과는 38,264셀이고 API에서 값이 제공되는 플랫폼 행정격자는 85개다. 다만 이것은 원본 ZIP의 85개 시군구 코드와 같은 집합은 아니다. 매우 작은 침수 폴리곤은 100m 셀 중심을 포함하지 않아 빠질 수 있고, 행정경계를 넘는 폴리곤은 인접 행정격자에 값이 생길 수 있다. 원본 보존 범위와 100m 서비스 범위를 구분해 관리한다.
