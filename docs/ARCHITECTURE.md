# Living Labs 통합 구조

## 목표 구조

```text
LivingLabs/
├─ src/                                  메인 포털
├─ Survey platform for collaboration/    지역 리스크 우선순위 설문조사 도구
├─ riskmap-core-main/                    지도 기반 내부 도구 실행 앱
│  └─ src/routes/
│     ├─ priority-management-area/       중점관리구역 선정 지원도구 메인
│     │  ├─ heatwave/                    폭염 분석
│     │  └─ flood/                       홍수 분석
│     ├─ responsible-department/         사업소관부서 지원도구
│     └─ adaptation-pathway/             사업 적응경로 지원도구
├─ shared/
│  ├─ data/                              공통 행정구역·격자·인구 데이터
│  └─ map/                               공통 베이스맵·레이어 설정
└─ docs/                                 구조 및 이전 기준
```

## 도구 구분

| 도구 | 구분 | 현재 경로 |
| --- | --- | --- |
| 메인 페이지 | 내부 | `http://127.0.0.1:4173/` |
| 지역 리스크 우선순위 설문조사 | 내부 | `http://127.0.0.1:4174/` |
| 중점관리구역 선정 지원도구 | 내부 | `http://127.0.0.1:4175/priority-management-area` |
| 폭염 중점관리구역 선정 | 내부, 수원 샘플 | `http://127.0.0.1:4175/priority-management-area/heatwave` |
| 홍수 중점관리구역 선정 | 내부, 준비 중 | `http://127.0.0.1:4175/priority-management-area/flood` |
| 사업소관부서 지원도구 | 내부 | `http://127.0.0.1:4175/responsible-department` |
| 사업 적응경로 지원도구 | 내부, 준비 중 | `http://127.0.0.1:4175/adaptation-pathway` |
| 주관부서 적응대책 지원도구 | 내부 정적 프로토타입 | `http://127.0.0.1:4173/lead-department-tool` |

`4175`의 루트 페이지는 사용자에게 노출하지 않습니다. 사용자는 메인 포털에서
각 도구의 전용 경로로 직접 이동하며, `4175/`에 직접 접속하면 메인 포털의
지원도구 페이지로 돌아갑니다.

## 공통 지도·데이터 원칙

1. 베이스맵과 행정경계 공급자 설정은 `shared/map/map-sources.json`을 기준으로 관리합니다.
2. 시도·시군구 코드와 중심 좌표는 `shared/data/administrative-regions/`를 기준으로 관리합니다.
3. 인구와 격자 데이터는 공통 ID를 사용하여 여러 도구가 같은 데이터를 재사용합니다.
4. 도구별 화면과 계산 로직은 분리하되, 지도와 원천 데이터는 복제하지 않습니다.
5. 중점관리구역 도구의 메인·폭염·홍수 지도는 `SelectedRegionMap.svelte`를 함께 사용합니다.
   베이스맵은 OpenStreetMap 공개 타일, 행정경계는 VWorld WMS, 초기 위치는 공통 시군구 중심 좌표를 사용합니다.

## 일사·그늘 계산 연계

- `shared/data/climate/solar_admin_centroid_mean.csv`: `SIG_CD` 기준 시군구 일사량 공통 입력자료
- `shadow.py`, `shadow_frac.py`: 수목 위치·수고·수관폭과 태양 고도/방위각을 이용한 그늘 면적·격자 비율 계산 엔진
- `canopy_geometry.py`: 수관폭과 수관 면적을 정규화하는 공통 전처리 엔진

위 Python 계산 엔진은 브라우저에서 직접 실행하지 않고 향후 공통 계산 API로
분리합니다. 중점관리구역 선정 도구와 사업소관부서 도구는 같은 API에 `SIG_CD`,
재해 유형, 분석 입력자료를 전달하고 결과 지도만 각 화면 목적에 맞게 표시합니다.

사업소관부서 지원도구의 현재 웹 미리보기 계산식과 정밀 계산 API 연결 기준은
`docs/EFFECT_EVALUATION.md`에서 관리합니다.

## 단계적 이전

현재 앱들은 React와 Svelte로 프레임워크가 달라 한 번에 합치면 회귀 위험이 큽니다.
따라서 먼저 하나의 포털과 명확한 내부 URL로 통합하고, 이후 앱 내부에 남은 중복
데이터를 `shared/`로 옮기는 방식으로 진행합니다.
