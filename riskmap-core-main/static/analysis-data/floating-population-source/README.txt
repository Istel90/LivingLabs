수원시 유동/주간노출 proxy 100m TIF 세트

입력자료:
- 2024년 국토모니터링 국토공간거점지도 전국 SHP
- 메타데이터 기준: pop_w=근무인구 밀도(명/km²), pc_in=통근유입 중심성 지수, pc_out=통근유출 중심성 지수, wk_cnt=사업체 종사자 밀도(명/km²)

중요:
- 이 자료는 실제 시간대별 유동인구 관측값이 아님.
- 1km 격자 자료를 수원 100m 통계격자에 할당한 proxy임.
- pop_w와 wk_cnt는 밀도(명/km²)이므로 100m 격자당 추정 인원은 값 × 0.01, 즉 /100으로 환산함.
- 정규화(_z)는 수원 100m 유효 격자 내부 min-max 기준임.

웹도구 추천 사용:
- 기본 E 유동/주간노출 proxy: E_floating_population_work_count_proxy_100m_z.tif
- 보조 지표: E_commute_in_centrality_100m_z.tif
- 단일 대체지표가 필요하면: E_daytime_exposure_proxy_100m_z.tif

생성일: 2026-06-20
