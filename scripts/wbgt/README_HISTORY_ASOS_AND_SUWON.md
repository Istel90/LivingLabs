# 과거 구현 기록 — 현재 플랫폼 연결 설명이 아님

2026-09-07 ASOS 및 수원 시범판 기록입니다. 현재 전국 적용은 README.md와 전국 검증 문서를 참고합니다.

# ASOS WBGT 사전계산과 H11

2026-09-07 구현. 현재(2021–2025) ASOS 시간별 관측으로 야외 WBGT를 추정하여 저장하고, 시험용 H11을 제공한다. 미래 SSP 계산은 포함하지 않는다.

## 재현

프로젝트 루트에서 실행한다. 기상청 API허브 지상관측 조회 권한이 있는 `KMA_API_KEY`를 환경변수 또는 기존 `.env.local`에 설정한다. 인증값은 원본 응답·명세에 저장하지 않는다. HTTPS 인증서 검증은 Windows 신뢰 저장소를 사용한다.

```powershell
python -m venv .venv-wbgt
.venv-wbgt/Scripts/python.exe -m pip install -r scripts/wbgt/requirements-lock.txt
.venv-wbgt/Scripts/python.exe scripts/wbgt/precompute_asos_wbgt.py --station 0 --output output/wbgt_asos_national
.venv-wbgt/Scripts/python.exe scripts/wbgt/build_h11_grid.py
.venv-wbgt/Scripts/python.exe -m unittest discover -s scripts/wbgt/tests -v
node scripts/wbgt/test-h11-grid.mjs
npm.cmd --prefix riskmap-core-main run build
```

기본 수집 범위는 수원(119), 2021–2025년 6–9월 하루 전체 시간이다. `--station 0`은 전체 ASOS, `--years 2025 --months 8`은 한 달 확인이다. 출력 폴더는 실행별로 분리하는 것이 좋다. 이미 받은 원본은 gzip 캐시에서 재사용한다. 실패 시 같은 명령으로 재실행할 수 있다. 원자료 수정분을 다시 받으려면 해당 월 캐시를 별도로 갱신해야 한다.

## 계산과 저장 정의

- ASOS SI는 시간적산 MJ/m²를 1e6/3600으로 변환한다. 직전 1시간의 중앙 태양각과 정시 기상값을 짝지은 시간별 추정이다. 시간적산 복사를 순간 측정값으로 부르지 않는다.
- pvlib 태양위치와 Erbs 분해로 직달 비율을 추정하고 thermofeel 2.3.0 Liljegren 구현으로 계산한다. 직접·산란 관측이 있는 것이 아니다.
- 관측소별 실제 풍속계 높이를 반영한다. z0=0.01m 중립 로그 풍속분포로 10m 등가풍속을 구하고 thermofeel의 brode 옵션으로 2m에 변환한다. 모델의 최소풍속 10m 등가 0.62m/s 가정을 기록한다.
- 일사가 없는 지점 전체를 0으로 채우지 않는다. 해당 지점·월에 낮의 일사 관측이 있으며, 해당 시간구간의 태양이 계속 지평선 아래일 때만 야간 일사 결측을 0으로 가정한다. 박명 산란광을 무시하는 근사이며 원자료는 결측으로 유지하고 별도 표지를 남긴다. 주간 일사 결측은 미계산으로 남긴다.
- 기상청 API 응답에는 이 처리에 필요한 개별 관측 QC가 없으므로 `not_provided`로 보관한다. 수치 범위검사는 공식 QC 통과를 뜻하지 않는다.
- 하루 24개 추정값이 모두 있을 때만 그날의 정시 추정 최대값을 계산한다. 연도별 6–9월 122일 중 90% 이상이 완비된 5개 연도가 모두 있는 지점만 시험용 H11에 사용한다.
- H11 = 연도별 6–9월 일최대 추정 WBGT의 P90을 계산한 뒤 2021–2025년 평균. 연중 극대값·일평균·안전 임계값과 구분한다. 통계 정의는 시험 적용이며 원값 보관으로 변경 가능하다.
- 기존 ASOS H와 같은 IDW(가까운 8개소, 거리 제곱 역수)로 EPSG:5179 100m 기준격자에 맞춘다. 거리 제한 없는 보간이므로 관측소가 드문 지역은 더 불확실하다. 필지별 그늘·건물·국지풍 영향은 해상되지 않는다.
- 모델 기본 상수(예: 흑구 지름 0.0508m, 지표 반사율 0.45)와 수렴조건은 결과 메타데이터에 남긴다. 국내 WBGT 센서와 대조한 검증은 아직 없다.

## 산출물

`output/wbgt_asos_national/`에 원본·해시 명세, 시간별 WBGT gzip CSV, 일별 CSV, 연도별 및 다년 통계 JSON, 관측소 메타데이터, H11 관측소 목록, 공간 교차검증 CSV가 저장된다.

`riskmap-core-main/data/processed/hazard/H11/observed/2021-2025/`에 GeoTIFF와 계산 가정 메타데이터가 저장된다. 두 파일은 H11 조회에 함께 필요하다. 기상위험 실험실과 우선관리지역의 현재 자료 선택 목록에 H11을 추가했다. 사용자가 직접 선택하며 미래 모드에서는 비활성이다. 사용 중인 서버는 변경된 코드를 다시 로드해야 하고 외부 공개 배포는 이번 작업에 포함하지 않았다.

## 수원 100m 상세 시범판

`build_spatial_reference_wbgt.py`는 수원(41110)에 한해 기존 ASOS 관측소 보간 H11을 더 상세한 지역 계산으로 바꾼다. 입력은 KMAP 100m 시간대별 평균 일사량, NGII 90m DEM, GIS건물통합정보 외곽선과 지상층수, 수원 ASOS 119의 폭염 대표조건이다.

```powershell
python scripts/wbgt/build_spatial_reference_wbgt.py
node scripts/wbgt/test-h11-grid.mjs
```

09·12·15시 각각을 계산한 뒤 셀별 최대값을 사용한다. 건물 높이는 지상층수 × 3.3m를 우선하고 층수가 없을 때만 원본 높이를 사용한다. 10m 내부격자에서 건물 그림자 비율을 계산해 직달 성분을 차단하며, 산란 성분은 유지한다. KMAP에 지형 차폐가 이미 반영되어 있으므로 별도의 지형 그림자를 다시 곱하지 않는다. NGII DEM은 기온 감률·기압 보정에 사용한다.

결과는 `output/wbgt_spatial_reference_41110/`의 시간대별 WBGT·그림자·DEM 진단 GeoTIFF와 플랫폼용 `h11_wbgt_spatial_reference_41110_100m.tif`로 저장된다. 수원 이외 지역은 전국 ASOS-IDW 시험판을 계속 사용한다. 세분류 토지피복도가 연결되기 전까지 지표질진 복사환경은 thermofeel 기본 반사율 0.45를 사용하며, 수목과 건물에 의한 국지풍·천공률·장파복사는 아직 계산하지 않는다.

## 검증 근거

1. 기상청 ASOS: https://apihub.kma.go.kr/apiList.do?seqApi=2
2. thermofeel: https://github.com/ecmwf/thermofeel (공개 기준값과 출처·라이선스는 tests/fixtures에 보관)
3. Erbs 분해: https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.erbs.html

표본 2025-08-01 수원 시간별 일사 합계 20.14 MJ/m²와 일자료 SI_DAY=20.14가 일치한다. 시간별 최대 2.88 MJ/m²도 일자료 최대 1시간일사와 일치한다. 일자료 최대 시간은 12시 시작이고 시간자료 SI는 13시 값으로 대응한다. 테스트는 단위·시각 연결, 결측과 0 구분, 관측소 메타데이터, 중복 거부, 공개 Liljegren 기준값 등을 포함한다. 공간 교차검증은 관측소 추정값 간의 보간 성능이며 직접 WBGT 센서 검증이 아니다.
