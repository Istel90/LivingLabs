# VWorld 전국 연속지적도 로컬 PostGIS

## 설치 결과

- 기준 자료: VWorld 연속지적도 SHP, 2026-08-08 배포본
- 원본 ZIP: `D:\90_Data\VWORLD\continuous_cadastral\2026-08-08\raw`
- 압축 해제본: `D:\90_Data\VWORLD\continuous_cadastral\2026-08-08\extracted`
- PostgreSQL: 17.11 (portable)
- PostGIS: 3.6.2
- 접속 주소: `127.0.0.1:55432`
- 데이터베이스: `vworld_cadastral`
- 사용자: `postgres`
- 테이블: `cadastre.parcels`
- 읽기 쉬운 조회 뷰: `cadastre.parcels_readable`
- 좌표계: EPSG:5186
- 적재 건수: 39,870,653건

이 서버는 PC 내부의 `127.0.0.1`에서만 접속할 수 있고, 초기 구성은 로컬 신뢰 인증을 사용한다. 외부에 포트를 공개하면 안 된다.

## 시작·상태 확인·종료

프로젝트 루트에서 PowerShell로 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vworld-postgis.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\status-vworld-postgis.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-vworld-postgis.ps1
```

## 주요 열

원본 보존 테이블은 VWorld SHP의 `A0`~`A7` 필드명을 그대로 사용한다. 일반 조회에는 별칭을 붙인 뷰를 권장한다.

| 조회 뷰 열 | 원본 열 | 내용 |
|---|---|---|
| `pnu` | `a1` | 19자리 필지고유번호 |
| `legal_dong_code` | `a2` | 법정동 코드 |
| `legal_dong_name` | `a3` | 법정동 주소명 |
| `lot_number` | `a4` | 지번 |
| `lot_number_land_category` | `a5` | 지번 및 지목 표시 |
| `reference_date` | `a6` | 기준일 |
| `sigungu_code` | `a7` | 시군구 코드 |
| `geom` | `geom` | 필지 경계, `MULTIPOLYGON`, EPSG:5186 |

## 조회 예시

```sql
-- PNU 한 건 조회
SELECT *
FROM cadastre.parcels_readable
WHERE pnu = '1111010100100150065';

-- WGS84 경위도 지점을 포함하는 필지 조회
SELECT pnu, legal_dong_name, lot_number_land_category
FROM cadastre.parcels_readable
WHERE ST_Intersects(
  geom,
  ST_Transform(ST_SetSRID(ST_Point(126.97, 37.58), 4326), 5186)
);

-- 웹 지도용 GeoJSON으로 변환
SELECT pnu, ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry
FROM cadastre.parcels_readable
WHERE sigungu_code = '11110'
LIMIT 100;
```

PNU, 시군구 코드, 공간 범위 조회에는 각각 B-tree, B-tree, GiST 인덱스가 생성돼 있다. 전국 도형 전체를 한 번에 브라우저로 보내지 말고, 화면 영역이나 시군구 단위로 잘라 API에서 반환해야 한다.

## 다시 가져오기

현재 가져오기 기록은 `cadastre.import_log`에 저장된다. 같은 배포본으로 스크립트를 다시 실행하면 완료된 SHP는 자동으로 건너뛴다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-vworld-cadastre.ps1
```

새 기준일의 전국 전체본은 기존 테이블에 그대로 덧붙이면 중복된다. 새 데이터베이스나 새 스냅샷 테이블에 먼저 적재하고 건수·기준일을 검증한 다음 교체한다. 일변동 자료가 필요할 경우에는 별도 변경분 테이블과 반영 절차를 설계한다.

## 프로젝트 연결값

서버 쪽 환경변수에는 다음 값을 사용한다. 브라우저 프런트엔드가 PostGIS에 직접 접속하게 만들면 안 된다.

```dotenv
VWORLD_POSTGIS_HOST=127.0.0.1
VWORLD_POSTGIS_PORT=55432
VWORLD_POSTGIS_DATABASE=vworld_cadastral
VWORLD_POSTGIS_USER=postgres
VWORLD_POSTGIS_SCHEMA=cadastre
```

현재 `riskmap-core-main`의 로컬 서버 프록시에 다음 API가 연결돼 있다.

- 상태: `GET /api/cadastre/health`
- PNU 조회: `GET /api/cadastre/parcel?pnu=1111010100100150065`
- 지도 범위 조회: `GET /api/cadastre/bbox?bbox=126.968,37.579,126.972,37.583&limit=500&simplifyMeters=0`

범위 조회는 국내 좌표만 허용하고, 요청 면적과 결과 수(최대 1,000건)를 제한한다. 더 넓은 영역은 화면 확대 수준에 맞춘 벡터 타일 또는 시군구별 단순화 레이어를 별도로 만드는 것이 적합하다.
