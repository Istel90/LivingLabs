# LivingLabs 3개 버전 관리 기준

LivingLabs는 아래 세 버전만 활성 기준으로 사용한다.

| 역할 | 로컬 폴더 | Git 브랜치 | 용도 |
| --- | --- | --- | --- |
| 공개본 | `LivingLabs_PUBLIC` | `master` | GitHub Pages에 공개되는 확정본 확인 |
| 작업본 | `LivingLabs` | `work/main` | 데이터·기능 개발과 통합 점검 |
| UI 작업본 | `LivingLabs_UI` | `codex/ui-postgis-integration` | 다른 작업자의 UI 개편 전용 |

공개 주소는 <https://istel90.github.io/LivingLabs/tools/> 이다. 로컬 작업본은 기본적으로 <http://127.0.0.1:4173/> 에서 실행한다.

## 운영 규칙

1. 평소 작업은 반드시 `LivingLabs` 폴더의 `work/main`에서 한다.
2. `LivingLabs_PUBLIC`의 `master`에서는 파일을 직접 수정하지 않는다.
3. UI 개편은 `LivingLabs_UI`에서만 진행하며 작업본에 자동으로 섞지 않는다.
4. UI 작업이 끝나면 먼저 `work/main`에서 충돌과 기능을 검토한 뒤 공개본에 반영한다.
5. GitHub Pages 배포는 `master`만 사용한다.
6. 그 밖의 기존 브랜치는 과거 작업 보관용이다. 일상 실행 기준으로 사용하지 않는다.
7. 원본 데이터와 PostGIS 백업은 Git 브랜치와 별도로 계속 보관한다.

## 권장 반영 순서

```text
UI 작업본 ──검토──> 작업본 ──기능·데이터 검증──> 공개본 ──자동 배포──> GitHub Pages
```

UI 변경이 필요하지 않은 데이터·기능 작업은 작업본에서 시작해 공개본으로 반영한다.

## 상태 확인

작업본 폴더에서 다음 파일을 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/status-workspaces.ps1
```

세 폴더의 브랜치, 커밋, 수정 여부와 공개 사이트 응답을 한 번에 확인한다. `MISMATCH`가 표시되면 해당 폴더에서 작업하지 말고 브랜치부터 바로잡는다.

