# 대안·Risk·실천권역 고유 ID — 2026-09-29

기존 대안 묶음과 저장 형식은 유지하고 식별 필드를 추가했다. DB 테이블 분리나 원본 데이터 변경은 하지 않았다.

| 위치 | 필드 | 의미 |
|---|---|---|
| 대안 | alternativeId | 대안의 고유 ID. 이름·탭·레이어 변경 시 유지 |
| 분석 결과 | riskResultId | 성공한 Risk 계산 1회의 ID |
| 분석 결과 | alternativeId | 소속 대안 연결 |
| 분석 결과 | districtResultId | 해당 Risk에서 실행한 실천권역 도출 결과 묶음 ID |
| 각 권역 | districtId | 개별 권역 고유 ID |
| 각 권역 | districtResultId / sourceRiskResultId | 소속 도출 결과 및 근거 Risk 연결 |
| 각 권역 | pnuList / parcelDatasetVersion | 공통 지적도 연결 |
| 저장 묶음 | resultIndex | 대안별 결과 ID 목록 |

신규 ID는 UUID 기반이다. 기존 UI용 `id`는 필지 강조·선택·검토요청 호환을 위해 유지한다. 계산 결과에는 계산 시각과 지역·부문·격자·가중치 등의 분석 맥락을 기록한다.

## 변경 규칙

- 새 대안: 새 alternativeId. 현재 새 대안 버튼은 설정을 가져오고 계산 결과는 비우는 기존 동작을 유지한다.
- Risk 재계산 성공: 새 riskResultId. 새 결과에는 기존 실천권역이 섞이지 않는다.
- 같은 Risk에서 권역 재도출 성공: Risk ID 유지, 새 districtResultId와 districtId 부여.
- 저장·불러오기·H/E/V 배열 복원·필지 도형 복원: ID 유지.
- 지연된 권역 요청이 다른 Risk에 연결되지 않도록 근거 Risk ID를 검사한다.
- 저장 및 설정 내보내기에 인덱스를 포함한다. 겹침 비교 출처와 검토요청에도 결과 ID를 추가하며 기존 키는 유지한다.

## 과거 저장본

저장 행 ID와 기존 대안 ID를 기반으로 결정적인 legacy ID를 보충한다. 같은 저장본을 반복해서 읽어도 동일하다. 이미 ID가 있는 저장본은 ID를 유지한다. 과거 서로 다른 저장본의 대안이 동일한 작업이었는지 증거가 없으면 임의로 합치지 않는다. 기존 DB 행을 일괄 수정하지 않으며 다음 사용자의 저장 시 추가 필드가 보존된다.

## 현재 범위

ID와 연결 인덱스를 기존 JSON 저장본 내부에 추가한 단계다. ID만으로 서버에서 독립 결과를 조회하는 별도 API·테이블, 결과 파일 중복 제거, 모든 미저장 실행의 이력 보존은 아직 제공하지 않는다. 새 분석은 현재 대안 결과를 갱신하며 과거 결과 보관은 기존 저장본 이력을 따른다.

검증: `scripts/test-result-identity.mjs`, `scripts/test-alternative-overlap.mjs`, `scripts/test-parcel-references.mjs`. 운영 저장본 쓰기 없이 개발 화면에서 계산·내보내기를 확인한다.

## 실제 적용 확인

- 개발 빌드 `1790672935129` 적용.
- 기준 홍수 화면에서 새 대안 생성, 4,857셀 Risk 계산, 실천지구 10개 도출 및 설정 JSON 내보내기 완료.
- 실제 내보낸 자료에서 고유 권역 ID 10개, 모든 권역의 근거 Risk ID 일치, resultIndex 연결 일치, 필지 버전 `vworld-2026-08-08` 확인. 요약 증거: `output/result-identity-20260929/flood-ids.json`.
- 실제 내보낸 자료의 복원 함수 왕복 검증에서 ID 유지, 재도출 함수 검증에서 Risk ID 유지·권역 ID 변경 확인.
- 후속 검증에서 앱 내 브라우저 도구 오류를 확인하고 프로젝트 지침의 별도 Chrome·Playwright 방식으로 검증했다. `scripts/wbgt/verify-result-identity.py` 및 `output/result-identity-browser/report.json` 참조.
- 홍수와 폭염 각각 10개 실천지구: Risk·권역 도출, 내보내기 ID 연결, 초안 복원 모드 새로고침 후 ID 유지, 도형 없는 저장본에서 PNU 직접 조회(bbox 요청 0회), 권역 재도출 시 권역 ID만 변경, Risk 재계산 시 Risk ID 변경 및 권역 초기화 모두 통과. 페이지 오류 0건.
- 현재 기본 URL은 자동 초안 복원을 하지 않는다. 로컬 초안 복원은 기존 `resumeDraft=1` 옵션으로 검증했다. 일반 새로고침 시 자동 복원하는 UX로 바꾸지는 않았다.
- 도형 없는 저장본 검증은 별도 테스트 브라우저의 IndexedDB에만 적용했다. 실제 공동 DB 저장/불러오기 왕복·외부 사이트 배포는 이번 검증에 포함하지 않았다.
