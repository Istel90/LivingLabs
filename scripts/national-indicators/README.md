# 전국 4개 지표 원자료 구축

2026-09-30 인계 패키지의 **다운로드·변환만 수행, 플랫폼 탑재 없음** 범위를 유지한다. 사용자 확인(2026-10-01)에 따라 전국 토지피복은 우선 **2021년판**으로 구축했다. 이후 공식 사이트에서 **2025년 제작·2024년 기준** 최신 자료를 확인했으며 원본 취득을 준비 중이다. 다운로드 연도를 관측연도로 표시하지 않는다.

최신 원본은 `https://aid.mcee.go.kr/req/write.do`의 로그인 후 자료신청 경로를 사용한다. 공식 Open API 이용약관에서 조회 결과의 저장 제한을 확인했으므로 WFS 전국 수집을 실행하지 않는다. 기존 API 표본은 일부 도형만 받은 접속 확인 기록이며 분석 입력으로 사용할 수 없다. 상세 근거와 다음 단계는 `docs/NATIONAL_INDICATORS_2026-10-01.md` 마지막 절에 기록했다. 원본 확보 전까지 2021년 전국 인덱스가 기존 구축 결과이며 2025년판이 완료됐다고 표시하지 않는다.

## 구축 대상과 상태

| 산출물 | 산식/의미 | 현재 입력 |
|---|---|---|
| `impervious-area-ratio` | 공식 분류에 따른 불투수 토지피복 합집합 면적 ÷ 10,000㎡ × 100 | 2021년 세분류 토지피복 |
| `forest-grass-area-component` | 산림·초지 합집합 면적 ÷ 10,000㎡ × 100 | 같은 토지피복; 수역 제외 |
| `green-area-ratio` | 실제 공원과 산림·초지의 합집합, 수역 제외 | 실제 공원 경계 확보 전 미완료 |
| `pedestrian-area-ratio` | 실제 보행전용도로 면적 ÷ 10,000㎡ × 100 | 시작·종료점만으로 도로 도형을 만들지 않음 |
| `basement-residential-count` | 주거용 지하층을 확인한 고유 건물 수/격자 | 대장 용도 검토 및 신·구 PK 위치 연결 미완료 |

불투수 자료는 **토지피복 분류 기반 추정 면적률**이며 실제 포장면 전수측량 결과가 아니다. 분류는 `landcover-classes.json`에 버전 관리한다. 공식 표에서 철도(153)는 투수, 시설재배지(231)·목장양식장(251)·염전(522)은 불투수이다. 산림·초지 구성분을 완성된 공원 포함 녹지 지표로 서비스하지 않는다.

## 실행

검증한 격리 환경: `D:/90_Data/LivingLabs/work/national-indicators-20261001/.venv/Scripts/python.exe`. 인계 패키지 `company-handoff/requirements.txt`의 고정 버전을 설치했다. 현재 서버의 Python 환경과 DB를 변경하지 않는다.

```powershell
$taskPython = 'D:/90_Data/LivingLabs/work/national-indicators-20261001/.venv/Scripts/python.exe'
$taskRoot = 'D:/90_Data/LivingLabs/work/national-indicators-20261001'
& $taskPython -m unittest discover -s scripts/national-indicators -p test_landcover.py -v
& $taskPython scripts/national-indicators/run_national.py `
  --source 'E:/80_GISDATA/세분류토지피복_2021_일반지역통판_5186.gpkg' `
  --source-year 2021 --reference-dir "$taskRoot/reference-current-national" `
  --output "$taskRoot/landcover-2021-national-v2"
```

위 명령은 이미 실행 중인 작업과 동시에 실행하지 않는다. 진행 여부는 출력 폴더의 `process-status.json` 및 해당 PID를 확인한다. 같은 입력·코드·출력 경로로 재실행하면 완료 지역의 파일 해시를 확인하고 건너뛴다. 입력이나 변환 코드가 바뀌면 새 출력 폴더를 사용한다. `--regions 41110`으로 특정 지역만 실행할 수 있다. 원본·현재 서비스 파일·DB에는 쓰지 않는다.

현재 전국 작업은 숨김 창의 **일회성 Python 프로세스**이며 예약 작업/자동점검을 만들지 않았다. 표준 출력·오류는 작업 루트 `national-build.stdout.log`, `national-build.stderr.log`에 저장된다. PC 종료나 프로세스 종료 후 자동 재시작은 하지 않는다.

## 정확성과 결측 처리

1. 회사 DB에서 읽기 전용으로 내보낸 지역별 현재 `cell_id`, `cell_index`, 중심 좌표와 범위가 기준이다. EPSG:5179, 100m, 중심 좌표 100의 배수+50, 행/열 범위, 중복 및 인덱스를 검사한다.
2. 원본 EPSG:5186 도형을 5179로 변환한다. 1km 타일에 자른 뒤 100m 격자와 교차하고 합집합 면적을 계산한다. 타일 분할 전 도형으로 별도 검산한다.
3. 분모는 행정경계에 걸친 격자도 10,000㎡이다. 원본 도형의 합집합이 격자 전체를 덮지 못하면 두 산출물 모두 NoData이다. 면적 허용오차는 0.000001㎡이다. 아주 작은 원본 틈도 보수적으로 결측이 될 수 있다.
4. 잘못된 도형은 파생 작업에서만 보정하며 도형 ID와 보정 전후 면적을 기록한다. 면적 차이가 `max(0.01㎡, 원면적×0.000001)`를 넘으면 해당 도형과 면적으로 겹치는 격자는 검토 필요 결측이다.
5. 비어 있지 않은 미등록 분류 코드는 지역 변환을 실패시키며 다른 지역을 계속 처리한다. NULL·NaN·빈 분류값은 별도로 식별하고 해당 도형과 0.000001㎡를 초과해 겹치는 격자를 `missing_source_classification` 결측으로 보존한다. 알려진 투수/불투수 코드나 0으로 추정하지 않는다. 영상일 누락도 `(missing)`으로 건수를 기록한다. 개별 실패는 전체 성공으로 표시하지 않는다.
6. 원시 단위는 0–100%다. `rawSparseValues`를 플랫폼의 정규화 점수로 바로 넣지 않는다. JSON의 `readyForPlatform`은 false이며 UI 탑재는 별도 단계다.

## 산출물과 완료 판단

지역별로 두 종류의 GeoTIFF(float32, NoData=-9999), CSV.gz, JSON을 저장한다. 연도·영상일 분포·원본 좌표계·분류 근거·단위·결측 상태를 보존한다. `cell-quality.csv.gz`에는 격자별 실제 피복 면적과 결측 원인이 들어간다. `geometry-repairs.json`은 도형 보정 감사 기록이다.

- `grid-validation.json`: 모든 참조 격자의 정렬 검사.
- `build-manifest.json`: 코드·분류·참조 자료 해시, 원본 경로/크기/수정시각. 대용량 토지피복 전체 SHA-256은 이 파일에 포함하지 않으므로 원본의 완전한 내용 해시 검증으로 오해하지 않는다.
- `<지역>/region-report.json`: 분류별 수치 범위·결측·도형 보정·지역 산출물 SHA-256.
- `verification-<지역>.json`: CSV·JSON·TIF 수치/NoData/격자·연도 일치 확인. 이 검사는 실제 플랫폼 표시 검증이 아니다.
- `build-progress.json`: 완료/실패 지역 수, 결과 목록, 오류 원인. 지역별 격자 합계에는 시와 하위 구의 중복 격자가 포함되므로 고유 전국 격자 수로 표현하지 않는다.
- `process-status.json`: 실제 프로세스의 시작·종료·성공/오류 상태. `complete_with_failures`는 전체 구축 완료가 아니다.

별도 수원 공간 검산:

```powershell
& $taskPython scripts/national-indicators/verify_landcover.py `
  --build "$taskRoot/landcover-2021-tiled-validation" --region 41110 `
  --sample-source "$taskRoot/source-samples/landcover-2021-suwon.gpkg"
```

플랫폼 탑재를 시작할 때만 `scripts/platform-audit/checks.json`에 인계 패키지의 6개 수용 기준을 반영하고, 정확한 홍수 기준 화면부터 실제 응답/빌드/관련 부문을 검증한다. 이번 원자료 구축은 현재 플랫폼 화면 또는 지표를 변경하지 않는다.

## 2026-10-01 해남군 복구와 현재 전국 목록

초기 전국 실행은 268개 지역 완료, 해남군(`46820`) 1개 실패로 종료되었다. 원인은 원본 feature ID `2980412`의 분류·영상일 NULL과 pandas 3의 NaN 문자열 변환 동작이었다. 오류 안내의 문자열 결합에서 TypeError가 발생했다. 빈 분류값을 명시적으로 다루도록 수정하고 해남군만 별도 출력 `landcover-2021-haenam-v3`에서 재처리했다.

2026-10-01 17:50 KST 재처리 종료: 104,268격자 중 유효 104,206개, 원본 피복 부족 60개, 분류 누락 2개. 불투수면과 산림·초지 구성분의 CSV·JSON·GeoTIFF 전수 형식·값 검증 통과. 원본 전체 도형을 이용한 별도 검산은 262격자(정상 200개, 결측 62개 전부)에서 통과했으며 최대 차이는 약 `5.82e-11`%p이다.

현재 전국 자료의 진입점은 작업 루트의 **`landcover-2021-national-current/build-index.json`**이다. 기존 268개 지역은 `landcover-2021-national-v2`를, 해남군은 `landcover-2021-haenam-v3`를 참조한다. 모든 지역 산출물 해시를 다시 검사했고 269개 지역/실패 0개로 연결했다. 초기 전국 실행의 실패 이력은 수정하지 않는다. 지역별 원자료와 격자 기준은 동일하며, 변환 코드 버전은 각 지역의 runKey로 구분한다.

```powershell
& $taskPython scripts/national-indicators/verify_spatial_sample.py `
  --source 'E:/80_GISDATA/세분류토지피복_2021_일반지역통판_5186.gpkg' `
  --build "$taskRoot/landcover-2021-haenam-v3" --region 46820
# 기존 목록을 덮어쓰지 않으므로 재검증 후 새 인덱스를 만들 때에는 새 출력 경로를 지정한다.
& $taskPython scripts/national-indicators/assemble_index.py `
  --base "$taskRoot/landcover-2021-national-v2" `
  --recovery "$taskRoot/landcover-2021-haenam-v3" `
  --output "$taskRoot/landcover-2021-national-current"
```

이 완료는 불투수면과 산림·초지 **구성분**의 파일 구축 완료이다. 공원을 포함한 녹지·보행전용도로·지하층 주거 건물의 미완료 원자료와 플랫폼 연결은 그대로 남아 있다.
