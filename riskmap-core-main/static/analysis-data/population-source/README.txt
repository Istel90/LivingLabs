수원 100m Exposure(E) 인구 지표 TIF 세트

입력:
- B100 총 인구 수 100M: 총인구/상주인구로 사용
- Pop_Grid_100m: Day_Total을 유동인구 수로 사용

출력:
- E_population_resident_count_100m.tif: 100m 격자별 상주/총인구 원값
- E_population_resident_count_100m_z.tif: 상주/총인구 min-max 정규화
- E_population_floating_count_100m.tif: 100m 격자별 유동인구 원값(Day_Total)
- E_population_floating_count_100m_z.tif: 유동인구 min-max 정규화
- E_exposure_population_mean_100m.tif: resident_z와 floating_z의 동일가중 평균
- E_exposure_population_mean_100m_z.tif: 위와 동일한 0~1 Exposure 결과

공간 기준:
- CRS: EPSG:5179
- Resolution: 100m
- Size: 146 x 142
- Valid B100 cells: 12487

계산:
- E = 0.5 * resident_z + 0.5 * floating_z
- NoData는 -9999
- 격자 내부의 인구 없음은 0으로 처리
