수원 100m 통계격자 기준 무더위쉼터 접근성/거리 TIF

입력: 재난안전데이터공유플랫폼_무더위쉼터현황.csv
필터: ARCD가 4111로 시작하는 수원시 무더위쉼터, LO/LA 유효 좌표
방법: 100m 통계격자 중심점에서 최근접 무더위쉼터까지 유클리디언 거리 계산
좌표계: EPSG:5179

파일 설명:
- V_adaptive_cooling_shelter_distance_100m.tif: 최근접 무더위쉼터까지 거리(m)
- V_adaptive_cooling_shelter_distance_100m_z.tif: 거리 정규화값. 값이 클수록 접근성 낮음/취약성 증가
- V_adaptive_cooling_shelter_accessibility_100m_z.tif: 접근성 점수. 값이 클수록 적응역량 증가

주의:
- 이 결과는 네트워크 보행거리 또는 이동시간이 아닌 직선거리 기반입니다.
- PDF 기준 지표명은 '무더위쉼터 접근성'이므로 웹도구 기본 지표로는 accessibility_100m_z를 추천합니다.
