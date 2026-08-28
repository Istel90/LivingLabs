# UI 작업본 통합 기준

## 왜 분리하는가

`work/main`과 `codex/ui-postgis-integration`은 같은 화면 파일뿐 아니라 서버와 데이터
파일도 함께 수정한 이력이 있다. 따라서 UI 작업본을 바로 병합하면 지도 표출, 지표
주소, PostGIS 연결이 이전 상태로 되돌아갈 수 있다.

앞으로 UI는 화면 표현을 담당하고, 분석 데이터 주소와 응답 해석은 아래 계약 모듈을
통해서만 사용한다.

- 계약 모듈: `riskmap-core-main/src/lib/domain/priority-management/analysisGridContract.js`
- 화면 연결부: `PriorityManagementArea.svelte`, `SelectedRegionMap.svelte`
- 서버 구현: `riskmap-core-main/scripts/`
- 실행·DB 관리: 저장소 루트의 `scripts/`, `supabase/`

## 파일 책임

| 구분 | 주로 수정하는 위치 | 통합 원칙 |
| --- | --- | --- |
| UI | `riskmap-core-main/src/routes/`, `src/lib/ui/`, `src/app.css` | UI 작업본의 변경을 우선 검토 |
| 화면 연결부 | `PriorityManagementArea.svelte`, `SelectedRegionMap.svelte` | 자동 병합하지 않고 기능별로 수동 반영 |
| 분석 계약 | `src/lib/domain/priority-management/` | 작업본 기준을 유지하고 UI가 가져다 사용 |
| 서버·데이터 | `riskmap-core-main/scripts/`, 루트 `scripts/`, `supabase/`, 분석 데이터 | UI 작업본에서 수정하지 않음 |
| 실행 설정 | `package.json`, `vite.config.js`, 시작·종료 스크립트 | 작업본에서 최종 결정 |

## 분석 데이터 계약

화면은 VWorld 프록시 주소로 분석 데이터를 요청하지 않는다. 분석 데이터는 플랫폼
API의 다음 경로를 사용한다.

| 경로 | 역할 |
| --- | --- |
| `/flood-grid` | 도시침수·하천범람·홍수 노출 지표 |
| `/analysis-grid` | 지형·시설·인구 등 공통 분석 지표 |
| `/hazard-grid` | 관측·기후 위험 지표 |
| `/cadastre` | 필지 경계와 후보 필지 |

격자 응답은 전체 배열 또는 희소 배열 형식을 허용한다. 원자료의 빈 셀은 응답에서
`null`로 유지해 원자료 지도에서는 투명하게 보이게 한다. Risk 결합 계산에서는 현재
정책대로 해당 값을 0으로 처리한다. 실제 0은 빈 셀과 달리 값이 있는 0으로 보존한다.

## UI 반영 순서

1. UI 작업자는 UI 전용 폴더와 스타일을 우선 수정한다.
2. 작업본에서 `npm.cmd run ui:check`를 실행해 변경 범위를 확인한다.
3. `INTEGRATION`으로 표시되는 두 화면 파일은 통째로 덮어쓰지 않고 화면 변경만 반영한다.
4. `SERVER_DATA`가 나오면 해당 변경은 UI 반영에서 제외하고 별도 기능 변경으로 검토한다.
5. `npm.cmd run build:all`과 `npm.cmd run platform:audit`를 통과한 뒤 작업본에 커밋한다.
6. 검증된 작업본만 공개본 `master`에 반영한다.

현재 로컬 페이지에 반영할 때는 `npm.cmd run platform:refresh`를 사용한다. 이 명령은
현재 서버를 유지한 채 새 결과를 먼저 준비하고, 짧은 교체 구간에만 서버를 중단한다.

`npm.cmd run ui:audit:strict`는 서버·데이터 변경이나 수동 병합 구간이 남아 있으면 실패한다.
UI 작업이 완료되어 정리된 브랜치를 최종 확인할 때 사용한다.
