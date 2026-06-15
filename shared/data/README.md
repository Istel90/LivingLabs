# Shared Data

내부 도구가 함께 사용하는 데이터의 기준 위치입니다.

## 데이터 분류

- `administrative-regions/`: 시도·시군구 명칭, 코드, 중심 좌표
- `climate/`: 시군구 코드로 결합하는 일사량 등 공통 기후 데이터
- `grids/`: 분석용 격자 데이터
- `population/`: 인구 및 취약계층 데이터

새 데이터는 먼저 이 폴더에 등록하고, 개별 도구는 가능한 한 이 위치의 데이터를
읽도록 연결합니다. 기존 앱 내부의 데이터 파일은 단계적 이전이 끝날 때까지
호환성을 위해 유지합니다.

중점관리구역 선정 지원도구의 지자체 선택 화면은
`administrative-regions/sido_sgg_codes.csv`를 직접 읽어 시도·시군구 이름과
행정구역 코드를 매칭합니다.

`climate/solar_admin_centroid_mean.csv`는 `SIG_CD`를 기준으로 선택 지자체와
결합할 수 있습니다. 폭염 중점관리구역 도구와 사업소관부서 도구에서 일사·그늘
효과 계산 입력값으로 공동 사용합니다.

`climate/solar_altitude_by_sigungu.csv`는 제공된 날짜별 태양고도 자료를
시군구 코드별 평균으로 집계한 파일입니다. 사업 효과 계산 시 사용자가 입력하지
않고 선택 지역 코드로 자동 조회합니다.

`administrative-regions/region_assessment_defaults.csv`는 행정구역별 자동
평가면적을 관리합니다. 현재 예시 지역부터 등록하며, 향후 행정경계 원본을 공통
데이터로 추가하면 전체 시군구 면적을 일괄 계산해 갱신합니다.
