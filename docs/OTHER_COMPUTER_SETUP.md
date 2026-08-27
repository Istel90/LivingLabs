# 다른 컴퓨터에서 LivingLabs 전국 데이터 연결

## 무엇이 GitHub에 있고 무엇이 별도 데이터인가

- GitHub 브랜치에는 UI, PostGIS 조회 API, 분석 코드, 복원 스크립트와 환경설정 예시가 들어간다.
- 전국 연속지적도·홍수·인구·건축물·강우·DEM 데이터베이스는 수십 GB이므로 Git 저장소에 포함하지 않는다.
- 데이터는 `livinglabs_postgis_full_YYYY-MM-DD_HHmmss.dump` 파일로 별도 전달하거나 원격 PostGIS 서버에 복원한다.

### 원본 데이터가 다시 필요한가

- **현재 플랫폼을 그대로 실행하는 목적:** 전체 PostGIS 덤프만 있으면 된다. 원본 파일을 다시 복사할 필요는 없다.
- **새 자료를 갱신하거나 지표를 재구축하는 목적:** 원본 파일이 필요하다.
- 다른 컴퓨터에도 원본이 있다면 중복 백업하지 않고 `D:\90_Data\VWORLD`, `D:\90_Data\LivingLabs` 경로를 유지하는 것이 가장 간단하다.
- 경로가 다르면 각 가져오기 스크립트의 `-Source` 또는 `--source` 인수로 새 위치를 지정한다.
- `.env.local`, API 키, 비밀번호는 GitHub나 덤프 manifest에 저장하지 않는다.
- 브라우저 `localStorage`에만 있는 임시 설문 상태는 DB 덤프에 포함되지 않는다.

## 방법 A: 다른 컴퓨터에 전체 DB 복원

1. GitHub에서 `codex/flood-postgis-performance` 브랜치를 내려받는다.
2. PostgreSQL 17과 PostGIS를 설치한다.
3. 전체 덤프와 함께 생성된 `*.manifest.json`을 복사하고 SHA-256을 확인한다.
4. PowerShell에서 복원한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-livinglabs-postgis.ps1 `
  -DumpFile 'D:\90_Data\LivingLabs\transfer_to_other_pc\livinglabs_postgis_full_2026-08-27_180000.dump'
```

기존 `livinglabs_postgis` DB를 의도적으로 교체해야 할 때만 `-Force`를 추가한다. 같은 폴더의 `*.manifest.json`이 있으면 복원 전에 SHA-256을 자동 검증한다.

5. `riskmap-core-main/.env.example`을 `riskmap-core-main/.env.local`로 복사하고 DB 이름을 `livinglabs_postgis`, 포트를 `55432`로 맞춘다.
6. 저장소 루트에서 의존성을 설치하고 통합 플랫폼을 실행한다.

```powershell
npm.cmd run install:all
npm.cmd run build:unified
npm.cmd run platform:start
npm.cmd run platform:status
```

## 방법 B: 공용 원격 PostGIS 사용

PostGIS가 설치된 서버에 같은 덤프를 한 번만 복원한 뒤 각 컴퓨터의 `.env.local`에 서버 주소를 지정한다.

```text
VWORLD_POSTGIS_HOST=<private-db-host>
VWORLD_POSTGIS_PORT=55432
VWORLD_POSTGIS_DATABASE=livinglabs_postgis
VWORLD_POSTGIS_USER=<readonly-user>
VWORLD_POSTGIS_PASSWORD=<password>
```

DB 포트를 인터넷 전체에 공개하지 말고 VPN 또는 허용 IP 방화벽을 사용한다. 서비스 운영에서는 읽기 전용 계정을 별도로 만든다.

## 필수 데이터 검증

복원 스크립트는 다음 데이터를 확인한다.

- `cadastre.parcels`: 전국 연속지적도
- `analysis.grid_cells_100m`: 전국 공통 100m 격자
- `analysis.flood_values_100m`: 홍수 H/E 지표
- `analysis.hev_values_100m`: 공통 H/E/V 지표
- `analysis.flood_building_sensitivity_100m`: 건물 민감도
- `analysis.kma_extreme_rainfall_grid_100m`: 극한강우
- `analysis.civil_defense_shelter_points`: 민방위 대피시설 실제 위치
- `analysis.national_road_links`: 전국 도로 연결망
- `population.grid_100m`: 고령·유아 인구

## 최신 전체 덤프 생성

원본 컴퓨터에서 다음 명령으로 DB 전체와 무결성 manifest를 만든다.

```powershell
npm.cmd run postgis:backup
```


기본 생성 위치는 `D:\90_Data\LivingLabs\transfer_to_other_pc`이다. 덤프와 같은 이름의 `*.manifest.json`을 반드시 함께 보관한다.

manifest에는 SHA-256, 생성 시각, 원본 DB 크기, PostGIS 버전, Git 브랜치·커밋, 필수 테이블 목록이 기록된다.

백업 파일은 수십 GB가 될 수 있으므로 GitHub에 커밋하지 않는다. 외장 드라이브, NAS 또는 별도 대용량 저장소로 전달한다.

다른 컴퓨터에서는 manifest에 기록된 Git 커밋을 체크아웃하면 백업 생성 시점의 코드와 DB를 정확히 맞출 수 있다.
비밀번호는 스크립트나 Git에 넣지 말고 PostgreSQL `pgpass` 또는 실행 환경에서 관리한다.
