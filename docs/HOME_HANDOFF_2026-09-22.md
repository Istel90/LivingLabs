# 집 PC 작업 이어가기 — 2026-09-22 운영 반영본

저장소: https://github.com/Istel90/LivingLabs / 최신 전달 브랜치: master.

이 문서가 이전 output/home-handoff-20260922.zip의 상태 설명을 대체합니다. 집에 기존 개발환경과 분석 데이터가 있다는 전제이며, 신규 서버 설치나 전체 데이터 이동은 필요하지 않습니다.

## 반영된 내용

- 저장본 관리: 이름 변경, 휴지통 이동, 복원.
- 저장 번호 서버 발급, 수정 이력 연결, 중복 재시도 방지, 동시 수정 충돌 안내.
- SQL 변경은 공동 Supabase DB에 이미 적용됐습니다. 집에서 docs/PRIORITY_DRAFT_CONCURRENCY.sql을 다시 실행하지 마세요.
- 로컬 4173 운영본에서 홍수 8개 지표·4,857셀 분석 및 저장/다시 불러오기/관리 확인. 홍수·폭염 실제 API 저장 관리 검증 완료.
- 기존 13개 저장본은 삭제하지 않고 보관 상태로 유지합니다. 새 관리 화면의 휴지통에서 볼 수 있습니다. 배포 점검용 자료도 이름을 구분해 휴지통에 남겼습니다.
- scripts/platform-audit에 일일 점검 도구와 수용 기준을 포함합니다. 사무실의 Codex 예약 작업 자체가 Git으로 집에 설치되는 것은 아닙니다.

## 집에서 반영 순서

먼저 집 PC의 현재 브랜치와 수정사항을 확인하고 보존하세요. 변경이 남은 상태에서 reset --hard 또는 파일 일괄 덮어쓰기를 하지 마세요.

깨끗한 master 체크아웃이라면:

```powershell
git fetch origin
git pull --ff-only origin master
```

다른 브랜치이거나 집에서 별도로 수정했다면 기존 변경을 커밋/백업한 뒤 origin/master를 병합합니다. 충돌이 나면 해당 파일만 비교해 해결합니다.

기존 환경파일과 데이터 경로를 유지하고 다음을 실행합니다. 미리보기용 VITE_SUPABASE_URL=http://127.0.0.1:4181 설정이 남아 있으면 운영용 설정으로 되돌려야 합니다.

```powershell
npm run build:unified
npm run platform:start
```

이미 서버가 실행 중이라면 정적 빌드 반영 후 먼저 새로고침합니다. 재시작이 필요할 때만 집의 4173 소유 프로세스를 확인해 기존 절차로 재시작합니다. 공유 외부 터널 시작/배포 명령은 집 로컬 작업을 위해 실행하지 않습니다.

기준 화면: http://127.0.0.1:4173/internal-tools/priority-management-area/flood?regionCode=41110

상단에 '저장본 관리'가 있는지 확인하고 홍수 분석과 저장을 확인하세요. 폭염은 같은 경로의 flood를 heatwave로 바꿔 확인합니다. 모든 PC의 옛 화면은 새로고침합니다. 4181은 운영본이 아닙니다.

## 포함하지 않은 자료

접속 비밀정보, .env, 전국 원자료, 로컬 PostGIS DB, 백업 JSON, 브라우저 임시 작업, 빌드 결과, pgAdmin/DBeaver 설치 파일은 Git에 넣지 않습니다. 기존 집 PC 자료를 사용하세요. 서버에 저장하지 않은 브라우저 작업은 Git으로 이동하지 않습니다.

이번 기능 변경으로 새 분석 원자료를 추가할 필요는 없습니다. 전국 수관높이 수집은 별도 진행 중이며 이 플랫폼 변경의 필수 입력이 아닙니다. 관련 스크립트와 docs/CANOPY_DOWNLOAD_PROGRESS.md는 함께 보관합니다.

## 검증과 복구

읽기/모의 검증: node scripts/test-draft-service.mjs 및 node --test scripts/platform-audit/run.test.mjs.

scripts/test-draft-database.mjs는 로컬 PostgreSQL에 임시 스키마를 생성해 검사한 후 제거합니다. scripts/verify-draft-production.mjs는 실제 공동 DB에 시험 자료를 쓰므로 평소 집 환경 확인에는 실행하지 마세요.

사무실의 최신 백업은 output/draft-production-20260922에 있으며 Git에 포함하지 않았습니다. 복구가 필요하면 반영 이후 자료를 먼저 추가 백업하고 docs/PRIORITY_DRAFT_ROLLBACK.sql과 사무실 백업의 RESTORE.md를 검토하세요. 구버전 소스만 되돌리면 DB 규칙과 맞지 않을 수 있습니다. 복구 SQL은 일상 실행용이 아닙니다.
