# LivingLabs 다른 컴퓨터 작업 인수인계

작성일: 2026-08-28

## 새 채팅에서 시작

새 컴퓨터의 Codex에서 이 파일을 첨부하고 다음 문장으로 시작한다.

> 이 인수인계 파일을 기준으로 LivingLabs work/main 작업을 이어서 진행해줘. 먼저 저장소, 데이터, PostGIS 상태를 읽기 전용으로 점검하고 다른 사람의 UI 작업본은 건드리지 마.

## 세 가지 활성 기준

| 역할 | 브랜치 | 용도 |
| --- | --- | --- |
| 공개본 | master | GitHub Pages 배포 전용 |
| 일반 작업본 | work/main | 데이터, 기능, 통합 작업 |
| 다른 사람 UI 작업본 | codex/ui-postgis-integration | UI 개편 전용 |

- GitHub: https://github.com/Istel90/LivingLabs
- 공개 사이트: https://istel90.github.io/LivingLabs/tools/
- 로컬 통합 주소: http://127.0.0.1:4173/
- PostGIS: 127.0.0.1:55432

평소 작업은 work/main에서만 한다. master와 UI 작업본에 일반 작업을 직접 섞지 않는다.

## 현재 구현 상태

- 포털, 설문, 내부 지원도구를 4173 단일 주소로 통합 실행한다.
- 홍수 화면에서 30년, 50년, 80년, 100년, 기왕최대 도시침수와 강우, 지형, 인구, 건물 자료를 사용한다.
- 홍수 분석 API, LivingLabs PostGIS, VWorld 전국 연속지적도 연결이 구현되어 있다.
- 공간 최적화 UI는 삭제하지 않고 복구하고 보호했다.
- 포털, 홍수, 공간 최적화 핵심 페이지와 전체 빌드 검사를 통과했다.

## 최근 분석체계 결정

지표는 다음 흐름으로 다시 분류한다.

    기후위험 → 피해 대상 → 대상의 노출 → 대상의 민감도 → 적응역량 → 실행 후보 공간

- 노출은 위험지역 안에 존재하는 대상이다. 예: 주민, 주택, 도로, 공공시설, 생태계.
- 민감도는 그 대상이 가진 피해 취약 특성이다. 예: 고령자 비율, 반지하, 노후건물.
- 최종 결과를 모두 지적 필지로 강제하지 않는다.
  - 주민, 주택, 건축물: 주거 또는 건축물 필지
  - 도로, 교통: 도로 구간, 교차로, 지하차도
  - 하천, 배수: 선형 구간
  - 녹지, 생태: 공원, 유휴지, 공공용지
- 최종 결과 명칭은 후보 필지보다 실행 후보 공간이 적합하다.
- 원본의 무자료와 실제 0은 구분해 보존한다. 계산용 파생자료에서 검증된 무자료만 0으로 처리한다.
- 다음 주요 작업은 지표 카탈로그와 선택 UI를 대상 → 노출, 민감도, 적응역량 구조로 재분류하는 것이다.

## 새 컴퓨터 준비

### 1. 코드 받기

    git clone https://github.com/Istel90/LivingLabs.git
    cd LivingLabs
    git switch --track origin/work/main
    npm run install:all

Node.js 20 이상, npm 10 이상을 사용한다.

### 2. 로컬 데이터 별도 복사

GitHub에는 대용량 원본, 가공 데이터, DB 덤프, 비밀키가 없다. 다음 두 묶음을 외장 디스크 등으로 복사한다.

1. D:\90_Data\LivingLabs\PORTABLE_2026-08-28
   - 전체 약 74.93GB
   - 원본, 가공 결과, livinglabs_postgis 전체 백업, 검증 인벤토리 포함
2. D:\90_Data\VWORLD\transfer_to_other_pc\vworld_cadastral_2026-08-08.dump
   - 약 7.51GB
   - 전국 연속지적도 39,870,653필지
   - SHA-256: 9E99B5E708799B26710A277943D3BC3A61AA32B7FD9D5EE1426A8B1EFB70E42D

복사 후 LivingLabs 묶음을 검증한다.

    powershell -NoProfile -ExecutionPolicy Bypass -File D:\90_Data\LivingLabs\PORTABLE_2026-08-28\05_inventory\verify-package.ps1

### 3. PostgreSQL과 PostGIS 복원

현재 기준은 PostgreSQL 17.11, PostGIS 3.6.2, 포트 55432이다. 설치 위치가 다르면 PgHome 값을 대상 PC 위치로 지정한다.

LivingLabs 분석 DB:

    powershell -NoProfile -ExecutionPolicy Bypass -File D:\90_Data\LivingLabs\PORTABLE_2026-08-28\04_restore_tools\restore-livinglabs-postgis.ps1 -DumpFile D:\90_Data\LivingLabs\PORTABLE_2026-08-28\03_database\livinglabs_postgis_full_2026-08-28_113200.dump

VWorld 필지 DB:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore-vworld-postgis.ps1 -DumpFile D:\90_Data\VWORLD\transfer_to_other_pc\vworld_cadastral_2026-08-08.dump -ExpectedSha256 9E99B5E708799B26710A277943D3BC3A61AA32B7FD9D5EE1426A8B1EFB70E42D

기존 DB가 있으면 복원 도구가 중단한다. 실제로 교체해야 할 때만 Force 옵션을 사용한다.

### 4. 비밀값 준비

API 키와 인증파일은 GitHub와 데이터 묶음에 포함하지 않는다. 기존 PC에서 안전하게 별도 전달해 새 PC의 .env.local에 설정한다.

- KMA_API_KEY
- VITE_VWORLD_API_KEY
- 필요한 경우 VITE_ANALYSIS_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Google Earth Engine 재처리 시 해당 PC의 별도 인증

### 5. 실행과 검증

    npm run platform:refresh
    npm run platform:status
    npm run platform:audit

다음 주소와 상태가 정상인지 확인한다.

- /tools/
- /internal-tools/priority-management-area
- /internal-tools/priority-management-area/flood
- /internal-tools/planning-optimization-workspace
- /health
- /cadastre/health
- /flood-grid/health

## 먼저 읽을 문서

- docs/WORKSPACE_VERSIONS.md
- docs/PLATFORM_SAFETY_GUIDE.md
- docs/URBAN_FLOOD_PLATFORM.md
- docs/VWORLD_CADASTRE_POSTGIS.md
- riskmap-core-main/HAZARD_STATUS.md
- riskmap-core-main/SOURCE_PLAN.md

## 안전 원칙

1. codex/ui-postgis-integration은 요청 없이 수정하거나 병합하지 않는다.
2. 대용량 데이터, DB 덤프, API 키, 인증파일을 GitHub에 올리지 않는다.
3. 데이터가 없다는 이유만으로 원본을 0으로 덮어쓰지 않는다.
4. 서버 실행 전 현재 폴더와 브랜치가 LivingLabs와 work/main인지 확인한다.
5. 기존 DB 교체, 브랜치 삭제, 대용량 파일 삭제는 정확한 대상을 먼저 검증한다.
