# HEV PostGIS 운영 저장소

## 저장 구조

- `analysis.grid_cells_100m`: EPSG:5179 100m 셀 중심점. 좌표별로 한 번만 저장한다.
- `analysis.region_grid_cells_100m`: 지역코드와 화면 격자 인덱스를 공통 셀에 연결한다.
- `analysis.hev_values_100m`: 데이터 버전·셀별 H01~H10 원값을 넓은 열 구조로 저장한다.
- `analysis.region_indicator_stats`: 지역별 최소·최대·평균과 API 응답 메타데이터를 저장한다.
- `analysis.hev_dataset_versions`: 기간·출처가 달라지는 데이터셋 버전을 관리한다.

DB에는 지역별 정규화값이 아니라 원값을 저장한다. API가 조회 지역의 통계를 사용해 0~1로 정규화하므로 시군구와 광역단위가 겹쳐도 동일 셀 값이 충돌하지 않는다.

## 초기화와 적재

```powershell
.\scripts\prepare-hev-postgis.ps1
```

```powershell
cd riskmap-core-main
npm run climate:load-hev-postgis -- --region=41110
npm run climate:load-hev-postgis -- --region=11680 --indicator=H10
npm run climate:load-hev-postgis -- --all
```

`--all`은 전국 행정경계의 모든 5자리 지역코드와 H01~H10을 순차 적재한다. 반복 실행해도 UPSERT로 갱신된다.

## API 동작

1. PostGIS에 지역·지표가 있으면 즉시 조회한다.
2. 없으면 원자료 파일에서 생성한다.
3. 생성 결과의 원값을 PostGIS에 저장한다.
4. PostGIS 장애 시 파일 계산 결과를 반환한다.
5. DB 실패 후 30초 동안 회로차단을 적용해 반복 연결 지연을 방지한다.

상태 확인: `GET /hazard-grid/health`