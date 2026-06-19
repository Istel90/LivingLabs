# 데이터 백엔드 전환 전략

이 문서는 현재 GitHub Pages 중심의 정적 프론트엔드 프로토타입을 나중에 Supabase 또는 Java API로 바꿔 붙일 수 있게 유지하기 위한 기준입니다.

## 핵심 원칙

화면 컴포넌트가 저장 위치를 직접 알지 않게 합니다.

```text
화면 컴포넌트
  -> lib/api.ts 또는 tool gateway
  -> localStorage / JSON 파일 / Supabase / Java API
```

이 구조를 지키면 지금은 정적 페이지로 시연하고, 나중에 DB가 붙어도 화면 전체를 다시 만들 필요가 줄어듭니다.

## 현재 적용 상태

### 포털 앱

- 경로: `src/`
- 주관부서 적응대책 지원도구 프로토타입 페이지 추가:
  - `/lead-department-tool`
  - 데이터 게이트웨이: `src/app/lib/adapters/leadDepartmentData.ts`
- 기본값은 내부 mock 데이터입니다.
- 현재 포털의 주관부서 도구 진입점은 내부 정적 프로토타입으로 고정합니다.
- 원본 Java/Tomcat 도구는 향후 전문 구축 단계에서 동일 게이트웨이 계약으로 다시 연결합니다.
- 행정경계와 연속지적도는 `shared/map/vworld.js`의 VWorld 설정을 사용하며,
  키는 `VITE_VWORLD_API_KEY` 환경변수 또는 GitHub Actions Secret `VWORLD_API_KEY`로 주입합니다.

### 설문 플랫폼

- 경로: `Survey platform for collaboration/`
- 기존 화면 import 경로는 유지:
  - `src/app/lib/api.ts`
- 내부 구현을 어댑터 방식으로 분리:
  - `src/app/lib/data/localProvider.ts`
  - `src/app/lib/data/supabaseProvider.ts`
  - `src/app/lib/data/javaProvider.ts`
  - `src/app/lib/data/provider.ts`
- 기본 backend는 `local`입니다.

### 내부 지도 도구

- 경로: `riskmap-core-main/`
- 현재는 시군구, 태양고도, 일사량, 행정경계 데이터를 `shared/data/`에서 직접 읽습니다.
- 계산/지도 기능이 컴포넌트 내부 상태에 많이 묶여 있으므로, 안정성을 위해 이번 단계에서는 대수술하지 않았습니다.
- 다음 단계에서 사업 설계 결과 저장/불러오기부터 별도 저장소 계층으로 분리하는 것이 좋습니다.

## 백엔드 선택

### 1. local

정적 페이지 기본값입니다.

```env
VITE_DATA_BACKEND=local
```

- 브라우저 `localStorage`에 저장
- 같은 PC/같은 브라우저에서만 유지
- 파일 내보내기/불러오기와 함께 쓰면 오프라인 시연 가능

### 2. Supabase

```env
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_RECORDS_TABLE=platform_records
```

설문 플랫폼의 Supabase 어댑터는 모든 컬렉션을 하나의 JSONB 레코드 테이블에 저장하는 방식으로 설계했습니다. 초기 시연 단계에서는 테이블을 많이 나누지 않아도 되므로 전환이 쉽습니다.

권장 테이블:

```sql
create table if not exists platform_records (
  collection text not null,
  id text not null,
  project_id text,
  risk_id text,
  department_id text,
  payload jsonb not null,
  updated_at timestamptz default now(),
  primary key (collection, id)
);
```

### 3. Java API

```env
VITE_DATA_BACKEND=java
VITE_JAVA_API_BASE_URL=https://example.com/api
```

현재 Java 어댑터가 기대하는 최소 API 계약은 아래와 같습니다.

```text
GET    /platform-records/{collection}
GET    /platform-records/{collection}/{id}
PUT    /platform-records/{collection}/{id}
DELETE /platform-records/{collection}/{id}
DELETE /platform-records
```

전문업체 단계에서는 원본 `living-lab-main`의 Java/eGovFrame API, PostgreSQL/PostGIS, GeoServer 구조에 맞춰 이 어댑터만 교체하면 됩니다.

## 오늘 받은 원본 주관부서 도구 반영 방향

원본 구조:

- Java 11
- Tomcat 8.5
- PostgreSQL/PostGIS
- GeoServer WMS/WFS
- React/Vite/OpenLayers 클라이언트

GitHub Pages에는 Java 서버, DB, GeoServer를 그대로 올릴 수 없습니다. 그래서 현재는 `/lead-department-tool`에 정적 프로토타입을 만들고, 원본의 핵심 흐름을 다음처럼 옮겼습니다.

- 좌측: 대상지역/부문 선택
- 중앙: 행정경계, 리스크, 사업 후보지 지도 시연 영역
- 우측: 의사결정 지표, 시나리오 사업 목록
- 데이터 호출: `leadDepartmentData.ts` 게이트웨이로 격리

## 다음 작업 권장 순서

1. 설문 플랫폼에 `데이터 내보내기 / 불러오기 / 초기화` UI를 붙입니다.
2. 주관부서 프로토타입에 시군구 선택과 실제 `shared/data` 행정경계 연결을 붙입니다.
3. 사업소관부서 도구의 사업 설계 결과를 저장소 계층으로 분리합니다.
4. Supabase 프로젝트를 만들면 `platform_records` 테이블로 원격 저장을 먼저 테스트합니다.
5. 전문업체 단계에서 Java API 계약을 확정하고 어댑터를 교체합니다.

## 보안 주의

원본 소스에 DB 접속정보가 들어 있는 설정 파일이 있습니다. 공개 저장소에는 절대 올리지 말고, 운영 단계에서는 환경변수 또는 서버 비밀값으로 분리해야 합니다.
