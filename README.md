
# 지방기후위기적응대책 리빙랩 지원 플랫폼

이 저장소에는 서로 연결되는 웹 앱 3개가 들어 있습니다.

| 앱 | 폴더 | 로컬 주소 |
| --- | --- | --- |
| 메인 포털 | 저장소 루트 | `http://127.0.0.1:4173` |
| 설문 협업 플랫폼 | `Survey platform for collaboration` | `http://127.0.0.1:4174` |
| 지도 기반 내부 도구 실행 앱 | `riskmap-core-main` | 개별 도구 경로로만 접근 |

## 현재 PC 개발 환경

- Node.js 20 이상
- npm 10 이상
- 확인 환경: Node.js 22.14.0, npm 10.9.2

PowerShell 실행 정책으로 `npm.ps1`이 차단되는 PC에서는 아래 예시처럼
`npm` 대신 `npm.cmd`를 사용합니다.

## 최초 설치

저장소 루트에서 세 앱의 의존성을 한 번에 설치합니다.

```powershell
npm.cmd run install:all
```

## 로컬 실행

PowerShell 창을 3개 열고 저장소 루트에서 각각 실행합니다.

```powershell
npm.cmd run dev:portal
npm.cmd run dev:survey
npm.cmd run dev:internal-tools
```

내부 도구 경로:

- 지역 리스크 우선순위 설문조사: `http://127.0.0.1:4174/`
- 중점관리구역 선정: `http://127.0.0.1:4175/priority-management-area`
- 사업소관부서 지원도구: `http://127.0.0.1:4175/responsible-department`
- 사업 적응경로 지원도구: `http://127.0.0.1:4175/adaptation-pathway`

`http://127.0.0.1:4175/` 루트는 사용자용 페이지가 아니며, 접속 시 메인
포털의 지원도구 페이지로 이동합니다.

## 전체 빌드 확인

```powershell
npm.cmd run build:all
```

## 선택 환경변수

설문 앱이나 지도 앱을 다른 주소에서 실행할 때 루트에 `.env.local`을 만들고
아래 값을 지정할 수 있습니다.

```dotenv
VITE_SURVEY_PLATFORM_URL=http://127.0.0.1:4174/
VITE_RISKMAP_URL=http://127.0.0.1:4175/
VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL=http://127.0.0.1:4175/responsible-department
VITE_PRIORITY_MANAGEMENT_AREA_TOOL_URL=http://127.0.0.1:4175/priority-management-area
VITE_ADAPTATION_PATHWAY_TOOL_URL=http://127.0.0.1:4175/adaptation-pathway
VITE_VWORLD_API_KEY=발급받은_VWorld_API_KEY
```

주관부서 적응대책 지원도구는 현재 `/lead-department-tool` 내부 정적
프로토타입으로 연결됩니다. VWorld 행정경계와 연속지적도 레이어를 쓰려면
로컬에서는 `.env.local`, GitHub Pages 배포에서는 Actions Secret
`VWORLD_API_KEY`에 발급 키를 등록합니다.

설문 데이터는 서버가 아니라 접속한 브라우저의 `localStorage`에 저장되므로,
다른 컴퓨터에서 사용하던 설문 데이터는 자동으로 옮겨지지 않습니다.

통합 구조와 공통 데이터 관리 기준은 `docs/ARCHITECTURE.md`를 참고합니다.
  
