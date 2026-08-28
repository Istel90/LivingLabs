# 집 작업 데이터 이관 기록 (2026-08-25)

## 위치

- 원본: `H:\이동`
- 정리 위치: `D:\90_Data\LivingLabs\imports\2026-08-25_home`
- 방식: 원본을 유지한 복사. 파일 삭제나 이동은 수행하지 않음.

## 분류

| 폴더 | 내용 | 파일 수 | 크기 (GiB) |
| --- | --- | ---: | ---: |
| `database_backups/postgis` | LivingLabs 및 VWorld PostgreSQL 전체 백업 | 3 | 16.419 |
| `climate_archives` | 기후 시나리오 원본 압축 자료 | 158 | 9.340 |
| `flood_admin` | 지방하천·국가하천·도시침수 행정구역 자료 | 2,122 | 20.060 |
| `ngii` | NGII 100m 인구 자료 | 522 | 0.490 |
| `project_generated_data` | 전국 홍수·건물·지형 분석 생성 자료 | 765 | 34.050 |
| `project_runtime_data` | Riskmap 런타임 데이터 | 42 | 0.100 |
| `web_analysis_data_snapshot` | 웹 분석용 정적 데이터 스냅샷 | 112 | 0.040 |
| **합계** |  | **3,724** | **80.486** |

## 검증 결과

- 모든 분류에서 원본과 대상의 파일 수가 일치함.
- 모든 분류에서 원본과 대상의 전체 바이트 합계가 일치함.
- 상세 복사 기록: 정리 위치의 `_copy.log`.

## 코드 처리

집에서 작성한 코드는 `origin/codex/ui-postgis-integration` 브랜치에 보존되어 있다. 현재 로컬 브랜치 `agent/climate-hazard-demo`에는 커밋되지 않은 수정사항이 있으므로 이번 이관에서 코드를 덮어쓰거나 병합하지 않았다.

집 PC 경로를 참조하는 `H:\이동\.worktrees\ui-postgis-integration\.git` 파일, 빌드 산출물, 캐시, 로그는 프로젝트에 복사하지 않았다. 필요한 원본 데이터는 위 분류 폴더에 모두 보존했다.
