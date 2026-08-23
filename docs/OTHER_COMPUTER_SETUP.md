# 다른 컴퓨터에서 LivingLabs 전국 데이터 연결

## 무엇이 GitHub에 있고 무엇이 별도 데이터인가

- GitHub 브랜치에는 UI, PostGIS 조회 API, 분석 코드, 복원 스크립트와 환경설정 예시가 들어간다.
- 전국 연속지적도·홍수·인구·건축물·강우·DEM 데이터베이스는 수십 GB이므로 Git 저장소에 포함하지 않는다.
- 데이터는 `livinglabs_postgis_full_YYYY-MM-DD.dump` 파일로 별도 전달하거나 원격 PostGIS 서버에 복원한다.

## 방법 A: 다른 컴퓨터에 전체 DB 복원

1. GitHub에서 `codex/flood-postgis-performance` 브랜치를 내려받는다.
2. PostgreSQL 17과 PostGIS를 설치한다.
3. 전체 덤프와 함께 생성된 `*.manifest.json`을 복사하고 SHA-256을 확인한다.
4. PowerShell에서 복원한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-livinglabs-postgis.ps1 `
  -PgHome 'C:\Program Files\PostgreSQL\17' `
  -DumpFile 'D:\LivingLabs-data\livinglabs_postgis_full_2026-08-23.dump'
```

기존 `vworld_cadastral` DB를 교체해야 할 때만 `-Force`를 추가한다.

5. `riskmap-core-main/.env.example`을 `riskmap-core-main/.env.local`로 복사하고 접속값을 맞춘다.
6. 의존성을 설치하고 프록시와 웹 앱을 실행한다.

```powershell
pnpm install
node riskmap-core-main/scripts/vworld-data-proxy.mjs --port=5176
pnpm --dir riskmap-core-main dev --host 0.0.0.0 --port 5175
```

## 방법 B: 공용 원격 PostGIS 사용

PostGIS가 설치된 서버에 같은 덤프를 한 번만 복원한 뒤 각 컴퓨터의 `.env.local`에 서버 주소를 지정한다.

```text
VWORLD_POSTGIS_HOST=<private-db-host>
VWORLD_POSTGIS_PORT=5432
VWORLD_POSTGIS_DATABASE=vworld_cadastral
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
- `population.grid_100m`: 고령·유아 인구

## 최신 전체 덤프 생성

원본 컴퓨터에서 다음 명령으로 DB 전체와 무결성 manifest를 만든다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-livinglabs-postgis.ps1
```

비밀번호는 스크립트나 Git에 넣지 말고 PostgreSQL `pgpass` 또는 실행 환경에서 관리한다.
