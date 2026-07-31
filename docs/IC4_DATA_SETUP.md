# IC4 기후전망 실험실 데이터 설정

## 집 PC에서 화면만 실행하는 경우

GitHub 저장소를 복제하고 의존성을 설치하면 됩니다. 웹에서 사용하는 가공 결과는 저장소의 다음 경로에 포함됩니다.

- `public/data/climate/ic4-admin-projections.json`
- `public/data/climate/admin-boundaries.geojson`

따라서 지도, 행정구역별 현재 기준값, 2050~2100년 RCP 전망을 확인하는 데 원본 압축자료는 필요하지 않습니다.

## 원자료를 다시 가공하거나 다운스케일링하는 경우

원본 RCP 자료는 용량이 약 9.3GB이므로 GitHub에 포함하지 않습니다. 외장 저장장치나 별도 파일 저장소를 이용해 집 PC의 저장소 아래 `data/` 폴더에 복사해야 합니다.

현재 IC4 가공 스크립트가 사용하는 파일 형식은 다음과 같습니다.

```text
data/AR5_IC4{RCP26|RCP45|RCP60|RCP85}_HadGEM3RA_skorea_{지표}_gridsub_{주기}_2011_2100_asc.tar.gz
```

사용 지표는 `TA`, `HW33`, `SU25`, `TR25`, `DTR`, `GSL`, `TX90P`, `TN90P`, `WSDI`, `WSDIx`, `TXx`, `TNx`입니다. `TA`는 monthly, 나머지는 yearly 자료를 사용합니다.

## 가공 명령

```powershell
python scripts/build-ic4-admin-climate-lab.py
python scripts/build-climate-lab-boundaries.py
```

기존 미래 전망 결과에 2020년 현재 비교 기준만 빠르게 추가하려면 다음 명령을 사용합니다.

```powershell
python scripts/append-ic4-current-baseline.py
```

## 주의사항

- `data/`는 `.gitignore`에 포함되어 Git 커밋 대상에서 제외됩니다.
- 2020년 값은 IC4 모형의 현재 비교 기준이며 실시간 관측값이 아닙니다.
- 실제 관측 융합 다운스케일링에는 MK-PRISM, AWS·ASOS, LST, DEM, 토지피복 등의 추가 원자료가 필요합니다.
