# Living Labs 플랫폼 안전 운영 안내

## 기준 위치

- 실행·수정하는 유일한 프로젝트 폴더: `E:\30_PyCODE\Local_PY\LivingLabs_\LivingLabs`
- 원본 및 대용량 데이터: `D:\90_Data`
- 이동용 전체 데이터 묶음: `D:\90_Data\LivingLabs\PORTABLE_2026-08-28`
- 실행 주소: `http://127.0.0.1:4173`
- PostGIS 주소: `127.0.0.1:55432`

다른 Git 작업폴더나 과거 빌드 폴더에서 플랫폼을 실행하지 않습니다. `pages-dist`는 현재 실행본이고, `pages-dist.previous`는 직전 정상 빌드입니다.

## 평소 사용하는 명령

프로젝트 기준 폴더에서 실행합니다.

```powershell
npm run platform:status
npm run platform:audit
npm run platform:refresh
```

- `platform:status`: 현재 앱과 데이터베이스 실행 여부를 확인합니다.
- `platform:audit`: 소스·서버·페이지·데이터베이스·이동용 백업을 빠르게 점검합니다.
- `platform:refresh`: 새 통합본을 만든 뒤 앱만 안전하게 다시 시작합니다. PostGIS는 계속 유지됩니다.
- `platform:audit:full`: 11.5GB 데이터베이스 백업의 SHA-256까지 다시 계산합니다. 시간이 오래 걸릴 때만 사용합니다.

## 종료 명령

```powershell
npm run platform:stop
npm run platform:stop:all
```

- `platform:stop`: 4173의 Living Labs 앱만 종료합니다.
- `platform:stop:all`: 앱과 PostGIS를 함께 종료합니다.

종료 스크립트는 4173을 쓰는 다른 프로그램을 발견해도 강제 종료하지 않습니다.

## 빌드 복구

통합 빌드는 `pages-dist.next`에서 완성·검사된 뒤 한 번에 `pages-dist`로 교체됩니다. 교체 직전 실행본은 `pages-dist.previous`에 남습니다. 빌드나 복사 중 오류가 나면 현재 실행본을 유지하거나 직전 실행본으로 되돌립니다.

## 데이터 복구

이동용 데이터 묶음의 `README_FIRST.md`를 먼저 읽습니다. 빠른 복구에는 `03_database`의 전체 PostGIS 백업을 사용하고, 원자료 재분석에는 `01_raw_sources`를 사용합니다.

현재 작업 중인 코드의 추적 변경은 `refs/codex-snapshots/` 아래 복구 참조로 남기며, 아직 Git에 들어가지 않은 코드 파일은 `D:\90_Data\LivingLabs\code_safety_snapshots`에 ZIP으로 보관합니다.

## 운영 원칙

1. 소스 수정은 기준 프로젝트 폴더 한 곳에서만 합니다.
2. 화면 확인 전 `platform:refresh`를 사용해 빌드와 실행본을 일치시킵니다.
3. 중요한 데이터 변경 후에는 전체 DB 백업과 매니페스트를 함께 갱신합니다.
4. 원본의 무자료 상태는 보존하고, 분석 계산에서 필요한 경우에만 0으로 처리합니다.
5. 이동 또는 복사 후 `05_inventory\verify-package.ps1`로 원본 묶음의 누락·손상을 확인합니다.
