<script>
    import { onDestroy, onMount } from 'svelte';
    import { base } from '$app/paths';
    import proj4 from 'proj4';
    import { leadDepartmentToolUrl, portalToolsUrl } from '$lib/portalLinks.js';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';
    import {
        enrichPracticeDistricts,
        PRACTICE_TYPE_META,
        PRACTICE_TYPE_ORDER
    } from '$lib/data/practiceDistricts.js';
    import {
        getRegionByCode,
        getRegionBounds,
        getRegionOptionsBySido,
        getSigunguLabel,
        sidos
    } from '$lib/data/administrativeRegions.js';
    import { markPlatformHandoffStatus, savePlatformHandoff } from '../../../../shared/services/platformHandoffs.js';
    import {
        draftPayloadFromRow,
        listPriorityAreaDrafts,
        savePriorityAreaDraft
    } from '../../../../shared/services/priorityAreaDrafts.js';

    export let hazard = 'heatwave';
    export let nationalLab = false;

    proj4.defs(
        'EPSG:5179',
        '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs'
    );

    const steps = ['프로젝트 설정', '입력자료', '가중치 설정', '분석 실행', '결과 지도', '의사결정 지원'];
    const gridOptions = ['100m', '50m', '10m', '5m'];
    const hazardScenarios = ['ssp126', 'ssp245', 'ssp370', 'ssp585'];
    const hazardFuturePeriods = ['2026', '2027', '2028', '2029', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100'];
    const requiredGroups = ['기후위험', '노출', '민감도', '적응역량'];
    const vLambda = 0.5;
    const asset = (path) => `${base}${path}`;
    const DEPARTMENT_HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
    const priorityHandoffInboxUrl = import.meta.env.VITE_PRIORITY_HANDOFF_INBOX_URL || '/priority-handoff';
    const vworldProxyUrl = import.meta.env.VITE_VWORLD_PROXY_URL || '';
    const devResetSignalUrl = vworldProxyUrl
        ? new URL('/dev-reset', vworldProxyUrl).toString()
        : '';
    const PRIORITY_DRAFT_DB_NAME = 'livinglabs-priority-management';
    const PRIORITY_DRAFT_STORE_NAME = 'priority-management-sessions';
    const PRIORITY_DRAFT_SCHEMA_VERSION = 'priority-management-draft/v2';

    const hazardConfigs = {
        heatwave: {
            label: '폭염',
            projectSuffix: '폭염 위험지역 분석',
            heroEmphasis: '우선 대응지를 찾습니다.',
            heroDescription: '기후위험(H), 노출(E), 취약성(V) 지표를 직접 구성하고 공간 분석 결과를 의사결정으로 연결하세요.',
            sampleNotice: '전국 행정구역별 H01~H10 100m 분석격자를 확인할 수 있습니다.',
            mapSource: '전국 최근 5년 H01~H05·H07·H10 / SSP245 H01~H09 100m 격자',
            rasterPath: null,
            dataSummaryPath: '/analysis-data/suwon-heatwave-data-summary.json',
            rasterReadyPrefix: '선택 행정구역 100m Hazard 격자',
            rasterError: '선택 행정구역 Hazard 격자 연결 실패',
            actionTitle: '이동형 쉼터와 그늘막 우선 배치',
            brief: {
                driverTitle: '65세 이상 고령층',
                driverText: '지역 평균 대비',
                driverValue: '1.8배 높음',
                gapTitle: '무더위쉼터 접근성',
                gapText: '도보 10분 내 접근 가능',
                gapValue: '32%'
            },
            commonDataItems: [
                { label: '기온', source: 'LST·폭염일수·태양고도' },
                { label: '그늘막 현황', source: '사업/시설 현황 데이터' },
                { label: '취약계층', source: '고령·유소년·기저질환자' },
                { label: '관련 현황 데이터', source: '인구·녹지·무더위쉼터·표준격자' }
            ],
            alternatives: [
                { name: '대안1', status: '검토중', description: '취약계층 밀집지역 중심 그늘·쉼터 보강안' },
                { name: '대안2', status: '검토중', description: '보행축과 대중교통 결절점 중심 대응안' },
                { name: '대안3', status: '검토중', description: '공공시설·녹지 연계 복합 대응안' }
            ],
            indicators: [
                { id: 101, indicatorCode: 'H01', icon: '🌡', label: 'H01 · 평균기온', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#f59e0b' },
                { id: 102, indicatorCode: 'H02', icon: '↗', label: 'H02 · 평균최고기온', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#ef4444' },
                { id: 103, indicatorCode: 'H03', icon: '↘', label: 'H03 · 평균최저기온', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#3b82f6' },
                { id: 104, indicatorCode: 'H04', icon: '☀', label: 'H04 · 폭염일수', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#dc2626' },
                { id: 105, indicatorCode: 'H05', icon: '🌙', label: 'H05 · 열대야일수', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#be123c' },
                { id: 106, indicatorCode: 'H06', icon: '↗', label: 'H06 · 온난일 계속기간 WSDI', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#ea580c' },
                { id: 107, indicatorCode: 'H07', icon: '🔺', label: 'H07 · 일최고기온 연최대 TXx', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#991b1b' },
                { id: 108, indicatorCode: 'H08', icon: '📈', label: 'H08 · 온난일 TX90P', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#f97316' },
                { id: 109, indicatorCode: 'H09', icon: '⏱', label: 'H09 · 최대 온난일 계속기간 WSDIx', description: 'SSP245 2050(2041~2050 평균) 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'KMA-AR6-region-100m', supportedGridUnits: ['100m'], color: '#c2410c' },
                { id: 110, indicatorCode: 'H10', icon: '🛰', label: 'H10 · 여름철 지표면온도 P90', description: '2021~2025 Landsat 30m 원자료를 집계한 지역 100m 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'Landsat-LST-100m', supportedGridUnits: ['100m'], color: '#b45309' },
                { id: 3, iconPath: asset('/indicator-icons/보행자.png'), label: '유동인구 노출량', description: 'Pop_Grid_100m Day_Total을 EPSG:5179 표준 100m 격자에 연결한 유동인구 노출량', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'population-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/population/E_population_floating_count_100m.json', value: 0.01259, color: '#db9d3e' },
                { id: 4, floodIndicator: 'FE01', icon: '♟', label: '상주인구 노출량', description: '2024 전국 총인구 EPSG:5179 100m 통계격자', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-population-100m', supportedGridUnits: ['100m'], color: '#d4af42' },
                { id: 5, iconPath: asset('/indicator-icons/고령인구비율.png'), label: '고령인구 수', description: '국토정보플랫폼 2024년 10월 고령인구 수를 공통 EPSG:5179 100m 셀에 연결', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-population-100m', supportedGridUnits: ['100m'], dataPath: '/population/grid', populationIndicator: 'elderly', value: 0.06127, color: '#e45662' },
                { id: 6, iconPath: asset('/indicator-icons/유소년인구비율.png'), label: '유아인구 수', description: '국토정보플랫폼 2024년 10월 유아인구 수를 공통 EPSG:5179 100m 셀에 연결', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-population-100m', supportedGridUnits: ['100m'], dataPath: '/population/grid', populationIndicator: 'infant', value: 0.02439, color: '#d96b72' },
                { id: 7, iconPath: asset('/indicator-icons/1인가구.png'), label: '1인 가구', description: '행정동 1인가구 비율을 EPSG:5179 표준 100m 격자에 할당한 정규화 지표', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_sensitivity_single_household_ratio_100m_z.json', value: 0.50044, color: '#cf6576' },
                { id: 8, iconPath: asset('/indicator-icons/기저질환자.png'), label: '건강 취약 참고', description: '2021-2023 순환기·호흡기 진료인원 기반 구 단위 건강취약 proxy', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_sensitivity_chronic_disease_ratio_proxy_100m_z.json', value: 0.50816, color: '#b86c82' },
                { id: 9, iconPath: asset('/indicator-icons/저소득층.png'), label: '저소득층', description: '2026 기초생활보장 수급자 현황 기반 행정동 저소득층 비율 proxy', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_adaptive_low_income_ratio_proxy_100m_z.json', value: 0.26613, color: '#a56d83' },
                { id: 10, iconPath: asset('/indicator-icons/노후주택비율.png'), label: '30년 이상 건축물 비율', description: '전국 GIS 건물통합정보 사용승인일 확인 건축물 기준 100m 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-building-100m', supportedGridUnits: ['100m'], analysisIndicator: 'building-old-30y-ratio', color: '#a77a72' },
                { id: 11, iconPath: asset('/indicator-icons/무더위쉼터접근성.png'), label: '무더위쉼터 접근성', description: '379개 무더위쉼터 최근접 거리 기반 EPSG:5179 100m 접근성 점수', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, dataStatus: 'available', sourceType: 'cooling-shelter-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/cooling-shelter/V_adaptive_cooling_shelter_accessibility_100m_z.json', value: 0.87419, color: '#3f9b80' },
                { id: 12, iconPath: asset('/indicator-icons/녹지비율.png'), label: '녹지 비율', description: '세분류토지피복도 산림·초지·수역 기반 100m 녹지/자연자원 면적 비율', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_adaptive_green_natural_ratio_100m_z.json', value: 0.38105, color: '#57a66c' },
                { id: 13, iconPath: asset('/indicator-icons/그늘면적.png'), label: '그늘 면적', description: '그늘/수목 공간데이터 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'file', value: 0.51, color: '#61958b' },
                { id: 14, icon: '🚏', label: '버스정류장 노출 proxy', description: '전국 버스정류장 100m 셀 밀도 · 실제 이용량이 아닌 정류장 위치 기반 노출 참고지표', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], analysisIndicator: 'facility-bus-stop', color: '#ca8a04' },
                { id: 15, icon: '🚇', label: '도시철도 결절점', description: '전국 도시철도 역사 851개를 100m 셀에 집계한 대중교통 결절점 노출 proxy', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], analysisIndicator: 'facility-rail-station', color: '#a16207' },
                { id: 16, icon: '⌂', label: '주거용 건축물 밀도', description: '전국 GIS 건물통합정보의 주거용 건축물 수를 100m 셀에 집계', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-building-100m', supportedGridUnits: ['100m'], analysisIndicator: 'building-residential-count', color: '#b7791f' },
                { id: 17, icon: '▰', label: '횡단보도 노출 proxy', description: '전국횡단보도 표준자료의 100m 셀 밀도 · 부산·대구·세종 보완 필요', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], analysisIndicator: 'facility-crosswalk', color: '#d97706' },
                { id: 18, icon: '⇄', label: '대중교통 접근성 proxy', description: '전국 버스정류장 100m 셀 밀도를 쉼터·공공시설 이동 접근성 참고지표로 사용 · 실제 이동시간은 아님', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], analysisIndicator: 'facility-bus-stop', color: '#358b78' }
            ],
            candidates: [
                { name: '후보지 03', area: '팔달구 인계동', risk: 0.82, h: 0.76, e: 0.91, v: 0.81, rank: 1, reason: '고령층·유동인구 집중, 쉼터 접근성 부족' },
                { name: '후보지 07', area: '권선구 세류동', risk: 0.78, h: 0.83, e: 0.74, v: 0.76, rank: 2, reason: '높은 지표면 온도와 녹지 면적 부족' },
                { name: '후보지 11', area: '장안구 영화동', risk: 0.73, h: 0.69, e: 0.77, v: 0.79, rank: 3, reason: '1인 가구 비율과 노후주택 밀집' }
            ]
        },
        flood: {
            label: '홍수',
            projectSuffix: '홍수 위험지역 분석',
            heroEmphasis: '우선 대응 침수권역을 찾습니다.',
            heroDescription: '침수위험(H), 노출(E), 취약성(V) 지표를 구성하고 배수·저류·대피 대안을 공간적으로 비교하세요.',
            sampleNotice: '전국 침수위험·강우·DEM·인구·건축물·교통시설 100m PostGIS 격자를 연결했습니다.',
            mapSource: '전국 홍수 H/E/V PostGIS 100m 서비스 격자',
            rasterPath: null,
            dataSummaryPath: null,
            rasterReadyPrefix: '선택 행정구역 홍수 100m 격자',
            rasterError: '선택 행정구역 홍수 격자 연결 실패',
            actionTitle: '배수개선·저류공간·대피동선 우선 정비',
            brief: {
                driverTitle: '반지하·저지대 주거',
                driverText: '침수흔적 중첩 비율',
                driverValue: '높음',
                gapTitle: '배수·저류 인프라',
                gapText: '우수시설 보강 필요 권역',
                gapValue: '우선'
            },
            commonDataItems: [
                { label: '침수구역', source: '침수흔적도·하천범람·저지대' },
                { label: '강우/배수', source: '강우강도·우수관로·빗물받이' },
                { label: '취약시설', source: '반지하·노후건축물·취약시설' },
                { label: '관련 현황 데이터', source: '인구·도로·대피시설·표준격자' }
            ],
            alternatives: [
                { name: '대안1', status: '검토중', description: '상습 침수구역과 저지대 중심 우선 관리안' },
                { name: '대안2', status: '검토중', description: '하천·우수관로 연결축 중심 배수 개선안' },
                { name: '대안3', status: '검토중', description: '반지하·취약시설 보호 중심 대응안' }
            ],
            indicators: [
                { id: 201, floodIndicator: 'FH01', icon: '≈', label: 'H01 · 도시침수 30년', description: '도시침수 30년 위험도 5m 원자료를 전국 100m 셀로 정렬한 침수심', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#2563eb' },
                { id: 209, floodIndicator: 'UF50', icon: '≈', label: '도시침수 50년', description: '50년 빈도 도시침수지도 5m 원자료를 전국 100m 셀로 정렬한 침수심', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#1e40af' },
                { id: 210, floodIndicator: 'UF80', icon: '≈', label: '도시침수 80년', description: '80년 빈도 도시침수지도 5m 원자료 · 전국 묶음 중 2개 지역 원본 누락', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#3730a3' },
                { id: 219, floodIndicator: 'UF100', icon: '≈', label: '도시침수 100년', description: '100년 빈도 도시침수지도 5m 원자료를 전국 100m 셀로 정렬한 침수심', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#312e81' },
                { id: 202, floodIndicator: 'FH02', icon: '≋', label: 'H02 · 국가하천 100년', description: '국가하천 범람 100년 위험도 5m 원자료를 전국 100m 셀로 정렬한 침수심', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#1d4ed8' },
                { id: 203, floodIndicator: 'FH03', icon: '≋', label: 'H03 · 지방하천 50년', description: '지방하천 범람 50년 위험도 5m 원자료를 전국 100m 셀로 정렬한 침수심', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#0369a1' },
                { id: 204, analysisIndicator: 'rain-max-1h', icon: '☔', label: '1시간 최대강우량', description: '2016~2025년 4~10월 ASOS 관측 극값을 최근접 관측소 기준으로 연결', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-KMA-100m', supportedGridUnits: ['100m'], color: '#0284c7' },
                { id: 205, analysisIndicator: 'terrain-low-elevation', icon: '▾', label: '저지대 지형', description: '전국 DEM 100m 표고 · 대상지 내 낮은 표고일수록 위험 점수 증가', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-terrain-100m', supportedGridUnits: ['100m'], color: '#0891b2' },
                { id: 206, analysisIndicator: 'terrain-twi', icon: '◒', label: '지형습윤지수 TWI', description: '전국 DEM 기반 100m 지형습윤지수', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-terrain-100m', supportedGridUnits: ['100m'], color: '#0e7490' },
                { id: 207, analysisIndicator: 'terrain-flow-accumulation', icon: '⇣', label: '유로 누적량', description: '전국 DEM 기반 100m 유로 누적량', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-terrain-100m', supportedGridUnits: ['100m'], color: '#155e75' },
                { id: 208, analysisIndicator: 'terrain-depression-depth', icon: '⌄', label: '지형 함몰 깊이', description: '전국 DEM 기반 100m 함몰 깊이', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-terrain-100m', supportedGridUnits: ['100m'], color: '#164e63' },
                { id: 211, floodIndicator: 'FE01', icon: '♟', label: 'FE01 · 상주인구', description: '2024 전국 총인구 EPSG:5179 100m 통계격자', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#d4af42' },
                { id: 212, floodIndicator: 'FE02', icon: '⌂', label: 'FE02 · 주택 수', description: '2024 전국 주택 EPSG:5179 100m 통계격자', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#c58b2a' },
                { id: 213, floodIndicator: 'FE03', coveragePrefix: '4111', icon: '🚶', label: 'FE03 · 유동인구', description: '2021 수원시 일평균 유동인구 100m · 현재 수원시만 제공', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-flood-100m', supportedGridUnits: ['100m'], color: '#db9d3e' },
                { id: 214, analysisIndicator: 'facility-bus-stop', icon: '🚏', label: '버스정류장 노출 proxy', description: '전국 정류장 위치의 100m 셀 밀도 · 실제 이용량은 아님', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], color: '#b7791f' },
                { id: 215, analysisIndicator: 'facility-rail-station', icon: '🚇', label: '도시철도 결절점', description: '전국 도시철도 역사 851개의 100m 셀 밀도', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], color: '#a16207' },
                { id: 216, analysisIndicator: 'facility-crosswalk', icon: '▰', label: '횡단보도 노출 proxy', description: '전국횡단보도 표준자료 100m 셀 밀도 · 부산·대구·세종 보완 필요', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], color: '#92400e' },
                { id: 221, analysisIndicator: 'building-basement-count', icon: '⌂', label: '지하층 보유 건축물', description: '전국 GIS 건물통합정보의 지하층 보유 건축물 100m 셀 밀도', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-building-100m', supportedGridUnits: ['100m'], color: '#e45662' },
                { id: 222, analysisIndicator: 'building-old-30y-ratio', icon: '🏚', label: '30년 이상 건축물 비율', description: '사용승인일 확인 건축물 중 30년 이상 건축물의 100m 셀 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-building-100m', supportedGridUnits: ['100m'], color: '#cf6576' },
                { id: 223, populationIndicator: 'elderly', iconPath: asset('/indicator-icons/고령인구비율.png'), label: '고령인구 수', description: '국토정보플랫폼 2024년 10월 전국 100m 고령인구', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'PostGIS-population-100m', supportedGridUnits: ['100m'], dataPath: '/population/grid', color: '#b86c82' },
                { id: 224, populationIndicator: 'infant', iconPath: asset('/indicator-icons/유소년인구비율.png'), label: '유아인구 수', description: '국토정보플랫폼 2024년 10월 전국 100m 유아인구', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-population-100m', supportedGridUnits: ['100m'], dataPath: '/population/grid', color: '#a56d83' },
                { id: 225, icon: '🏫', label: '어린이집·복지시설', description: '어린이집은 주소만 적재되어 좌표 원자료 보완 후 연결 예정', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'source-address-only', supportedGridUnits: ['100m'], color: '#9333ea' },
                { id: 231, analysisIndicator: 'facility-bus-stop', icon: '⇄', label: '대중교통 대피 접근성 proxy', description: '전국 버스정류장 100m 셀 밀도를 대피 이동 접근성 참고지표로 사용 · 실제 대피경로·운행정보는 아님', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'partial', sourceType: 'PostGIS-facility-100m', supportedGridUnits: ['100m'], color: '#358b78' },
                { id: 234, analysisIndicator: 'facility-shelter', icon: '↗', label: '민방위 대피시설 접근성 proxy', description: '행정안전부 전국 현행 원본의 사용 중 시설 17,228개 실제 위치를 표시하고 400m 커널밀도를 계산 · 값이 높을수록 대피시설 접근성·적응역량이 높음', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'available', sourceType: 'PostGIS-shelter-points-KDE-400m', supportedGridUnits: ['100m'], color: '#0f766e' },
                { id: 232, icon: '◉', label: '빗물받이 밀도', description: '전국 빗물받이 원자료 보완 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'source-required', color: '#3f9b80' },
                { id: 233, icon: '▤', label: '배수펌프장 접근성', description: '전국 배수펌프장·저류시설 원자료 보완 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'source-required', color: '#57a66c' }
            ],
            candidates: [
                { name: '후보지 02', area: '저지대 주거밀집지', risk: 0.84, h: 0.88, e: 0.79, v: 0.82, rank: 1, reason: '침수흔적과 반지하 주거가 중첩된 구역' },
                { name: '후보지 05', area: '하천변 상업·주거 혼재지', risk: 0.79, h: 0.81, e: 0.83, v: 0.73, rank: 2, reason: '하천 범람 영향권과 유동인구 집중' },
                { name: '후보지 09', area: '노후 배수시설 영향권', risk: 0.74, h: 0.75, e: 0.72, v: 0.78, rank: 3, reason: '배수시설 부족과 노후 건축물 밀집' }
            ]
        },
        ecosystem: {
            label: '생태계',
            projectSuffix: '생태계 위험지역 분석',
            heroEmphasis: '생태 취약 우선 복원지를 찾습니다.',
            heroDescription: '기후위험(H), 노출(E), 취약성(V) 지표를 구성하고 녹지·서식지·생태축 대안을 공간적으로 비교하세요.',
            sampleNotice: '현재 생태계 분석 데이터는 연결 전이며, 폭염·홍수와 같은 구조로 확장 준비 중입니다.',
            mapSource: '생태축·토지피복·서식지 데이터 연결 준비',
            rasterPath: null,
            dataSummaryPath: null,
            rasterReadyPrefix: '생태계 위험 래스터',
            rasterError: '생태계 위험 래스터 연결 전 · 예시 격자 표시',
            actionTitle: '생태축 복원·녹지 연결·서식지 보호 우선 정비',
            brief: {
                driverTitle: '생태 민감지역',
                driverText: '훼손·단절 영향',
                driverValue: '검토 필요',
                gapTitle: '녹지 연결성',
                gapText: '복원 후보지 자료',
                gapValue: '연결 전'
            },
            commonDataItems: [
                { label: '생태축', source: '광역/도시 생태축 및 단절 지점' },
                { label: '토지피복', source: '세분류 토지피복·불투수면·녹지율' },
                { label: '서식지', source: '보호종·습지·하천변 생태 민감도' },
                { label: '관련 현황 데이터', source: '개발압력·인구·공원녹지·표준격자' }
            ],
            alternatives: [
                { name: '대안1', status: '검토중', description: '생태축 단절구간 중심 복원안' },
                { name: '대안2', status: '검토중', description: '도시녹지와 하천변 연결성 강화안' },
                { name: '대안3', status: '검토중', description: '서식지 민감지역 보호 중심 대응안' }
            ],
            indicators: [
                { id: 1, icon: '◇', label: '생태축 단절도', description: '생태축 단절·훼손 구간 데이터 연결 필요', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'ecosystem-grid', value: 0.5, color: '#2f9e44' },
                { id: 2, icon: '☀', label: '건조·열 스트레스', description: '고온·건조 스트레스 지표 연결 필요', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'climate-grid', value: 0.5, color: '#d97706' },
                { id: 3, icon: '▦', label: '개발압력 노출', description: '개발사업·토지이용 변화 압력 자료 연결 필요', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'landuse-grid', value: 0.5, color: '#a16207' },
                { id: 4, icon: '♟', label: '이용인구 노출', description: '공원·하천변 이용 인구 자료 연결 필요', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'population-grid', value: 0.5, color: '#ca8a04' },
                { id: 5, icon: '🌿', label: '녹지 파편화', description: '녹지 패치 크기·연결성 지표 연결 필요', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'green-grid', value: 0.5, color: '#16a34a' },
                { id: 6, icon: '≋', label: '수변 민감도', description: '습지·하천변 생태 민감도 자료 연결 필요', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'habitat-grid', value: 0.5, color: '#0891b2' },
                { id: 7, icon: '◉', label: '보호지역 접근성', description: '보호지역·공원녹지 관리 영향권 연결 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'adaptive-grid', value: 0.5, color: '#15803d' },
                { id: 8, icon: '↗', label: '복원 가능지', description: '유휴지·공공부지·연결녹지 후보 자료 연결 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'adaptive-grid', value: 0.5, color: '#65a30d' }
            ],
            candidates: []
        }
    };

    const config = hazardConfigs[hazard] || hazardConfigs.heatwave;
    function configureIndicatorsForRegion(sourceIndicators, code, datasetMode = hazardDatasetMode) {
        const observedCodes = new Set(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10']);
        return sourceIndicators.map((item) => {
            if (item.indicatorCode) {
                const observed = datasetMode === 'observed';
                const availableForDataset = observed
                    ? observedCodes.has(item.indicatorCode)
                    : item.indicatorCode !== 'H10';
                const available = Boolean(code) && availableForDataset;
                const dataQuery = new URLSearchParams({
                    regionCode: code,
                    mode: observed ? 'observed' : 'future',
                    indicator: item.indicatorCode,
                    scenario: hazardScenario,
                    period: hazardFuturePeriod
                });
                return {
                    ...item,
                    description: observed
                        ? item.indicatorCode === 'H01'
                            ? '2021~2025 평균 · 500m 원자료를 정렬한 지역 100m 분석격자'
                            : item.indicatorCode === 'H10'
                                ? '2021~2025 여름철 P90 평균 · Landsat 30m를 집계한 지역 100m 격자'
                                : observedCodes.has(item.indicatorCode)
                                    ? '2021~2025 ASOS 95개소 지표를 IDW 공간화한 지역 100m 분석격자'
                                    : '1991~2020 기준자료 수집 후 100m 공간모델 구축 예정'
                        : item.indicatorCode === 'H10'
                            ? 'SSP 기반 직접 미래 전망자료 없음'
                            : `${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 지역 100m 분석격자`,
                    sourceType: observed
                        ? item.indicatorCode === 'H10'
                            ? 'Landsat-LST-100m'
                            : item.indicatorCode === 'H01'
                                ? 'KMA-observed-100m'
                                : 'KMA-ASOS-IDW-100m'
                        : 'KMA-AR6-region-100m',
                    dataPath: available ? `/hazard-grid?${dataQuery.toString()}` : null,
                    dataStatus: available ? 'available' : 'missing',
                    enabled: available && item.indicatorCode === (observed ? 'H01' : 'H04')
                };
            }
            const covered = Boolean(code) && (!item.coveragePrefix || code.startsWith(item.coveragePrefix));
            if (item.floodIndicator) {
                const dataQuery = new URLSearchParams({ regionCode: code, indicator: item.floodIndicator });
                return {
                    ...item,
                    dataPath: covered ? `/flood-grid?${dataQuery.toString()}` : null,
                    dataStatus: covered ? (item.dataStatus || 'available') : 'missing',
                    enabled: covered && item.enabled
                };
            }
            if (item.analysisIndicator) {
                const dataQuery = new URLSearchParams({ regionCode: code, indicator: item.analysisIndicator });
                return {
                    ...item,
                    dataPath: covered ? `/analysis-grid?${dataQuery.toString()}` : null,
                    dataStatus: covered ? (item.dataStatus || 'available') : 'missing',
                    enabled: covered && item.enabled
                };
            }
            if (item.populationIndicator) {
                return { ...item, dataStatus: 'available' };
            }
            if (item.dataStatus === 'missing') return item;
            if (!code.startsWith('4111')) {
                return { ...item, enabled: false, dataStatus: 'missing' };
            }
            return { ...item };
        });
    }

    function isGridValueCollection(values) {
        return Array.isArray(values) || ArrayBuffer.isView(values) || values instanceof Map;
    }

    function gridValueCollectionSize(values) {
        if (values instanceof Map) return values.size;
        return Number(values?.length) || 0;
    }

    function decodeGridValues(grid, { preferDense = false } = {}) {
        if (Array.isArray(grid?.values)) {
            return { values: grid.values, validIndices: null };
        }
        if (grid?.valueEncoding !== 'sparse-index-value' || !Array.isArray(grid?.sparseValues)) {
            return { values: null, validIndices: null };
        }

        const valueCount = Number(grid.valueCount) || (Number(grid.columns) * Number(grid.rows));
        const useSparseMap = !preferDense && valueCount > 500_000;
        const values = useSparseMap ? new Map() : new Float32Array(valueCount);
        if (!useSparseMap) values.fill(Number.NaN);
        const validIndices = new Array(Math.floor(grid.sparseValues.length / 2));
        let validIndex = 0;
        for (let offset = 0; offset < grid.sparseValues.length; offset += 2) {
            const index = Number(grid.sparseValues[offset]);
            const value = Number(grid.sparseValues[offset + 1]);
            if (!Number.isInteger(index) || index < 0 || index >= valueCount || !Number.isFinite(value)) continue;
            if (useSparseMap) values.set(index, value);
            else values[index] = value;
            validIndices[validIndex] = index;
            validIndex += 1;
        }
        validIndices.length = validIndex;
        return { values, validIndices };
    }

    let activeStep = 0;
    let activeLayer = 'Risk';
    let region = '경기도 수원시';
    let regionCode = '41110';
    let selectedSido = '경기도';
    $: availableRegions = getRegionOptionsBySido(selectedSido);
    let hazardDatasetMode = 'observed';
    let hazardScenario = 'ssp245';
    let hazardFuturePeriod = '2050';
    let regionChangeRunId = 0;
    $: projectName = `${region} ${config.projectSuffix}`;
    let analysisDone = false;
    let running = false;
    let leftPanelTab = '01';
    let candidatesInfoOpen = false;
    let selectedCandidate = 0;
    let activeAlternative = 0;
    let pendingDeleteIndex = null;
    let gridUnit = '100m';
    let dimensionWeights = { H: 1, E: 1, V: 1 };
    let mapSource = config.mapSource;
    let dataBundle = null;
    let dataBundleStatus = config.dataSummaryPath ? '수원 시연 원자료 불러오는 중' : '시연 원자료 연결 전';
    let analysisMessage = '설정값을 확인한 뒤 Risk 분석을 실행하세요.';
    let analysisResult = null;
    let parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
    let focusedCandidate = null;
    let mapResetKey = 0;
    let detailCandidateKey = null;
    let handoffMessage = '실천권역을 도출하면 주관부서 지원도구로 전달할 수 있습니다.';
    let handoffDialog = null;
    let latestHandoffPackage = null;
    let sentHandoffPackages = [];
    let handoffReviewOpen = false;
    let handoffScope = 'all';
    let handoffNote = '';
    let requestListOpen = false;
    let draftStorageStatus = '임시 저장 준비 중';
    let draftLoadComplete = false;
    let draftSaveTimer = null;
    let operatorName = '관리자';
    let supabaseDrafts = [];
    let supabaseHistoryOpen = false;
    let supabaseBusy = false;
    let supabaseStatus = 'Supabase 저장 준비';
    let supabaseSaveDialog = null;
    let indicatorDialog = null;
    let devResetPollTimer = null;
    let lastDevResetAt = '';

    let alternatives = config.alternatives.map((item, index) => ({
        ...item,
        id: item.id || `alternative-${index + 1}`,
        settings: null,
        analysisResult: null,
        appliedIndicators: [],
        analysisDone: false,
        analysisMessage: null,
        parcelCandidateMessage: null,
        selectedCandidate: 0,
        detailCandidateKey: null,
        activeLayer: 'Risk'
    }));
    $: decidedAlternative = alternatives.find((item) => item.status === '선정');
    $: activeAlternativeId = alternatives[activeAlternative]?.id || `alternative-${activeAlternative + 1}`;

    let indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
        .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
    let appliedIndicators = [];
    let loadedPreviewIndicators = [];
    let indicatorPreviewGrid = null;
    const indicatorGroupMeta = {
        '기후위험': { english: 'Hazard', dimension: 'H', direction: 'positive', color: '#ef6c4d', icon: '☀' },
        '노출': { english: 'Exposure', dimension: 'E', direction: 'positive', color: '#3b82c4', icon: '◎' },
        '민감도': { english: 'Sensitivity', dimension: 'V', direction: 'positive', color: '#a855a8', icon: '◇' },
        '적응역량': { english: 'Adaptive Capacity', dimension: 'V', direction: 'negative', color: '#2f9b73', icon: '✚' }
    };
    const dimensionColorVars = { H: '--color-hazard', E: '--color-exposure', V: '--color-vulnerability' };
    let groupExpanded = Object.fromEntries(Object.keys(indicatorGroupMeta).map((group) => [group, true]));
    let expandedDescriptions = {};
    function groupDimensionColorVar(group) {
        return `var(${dimensionColorVars[indicatorGroupMeta[group].dimension]})`;
    }

    function toggleGroupExpanded(group) {
        groupExpanded = { ...groupExpanded, [group]: !groupExpanded[group] };
    }

    function collapsedGroupSummary(group) {
        const selected = selectedIndicatorsFor(group);
        if (!selected.length) return '';
        const shown = selected.slice(0, 2).map((item) => item.label).join(', ');
        return selected.length > 2 ? `${shown} 외 ${selected.length - 2}개` : shown;
    }

    function toggleIndicatorDescription(id) {
        expandedDescriptions = { ...expandedDescriptions, [id]: !expandedDescriptions[id] };
    }

    function handleParcelDerivationComplete() {
        leftPanelTab = '03';
    }
    $: previewAnalysisIndicators = indicators.map((item) => {
        const loaded = loadedPreviewIndicators.find((previewItem) => previewItem.id === item.id);
        return loaded
            ? { ...loaded, enabled: item.enabled && isIndicatorAvailable(item), weight: item.weight, direction: item.direction }
            : { ...item, enabled: false };
    });
    $: if (indicatorPreviewGrid && !analysisDone && ['Risk', 'Hotspot'].includes(activeLayer)) activeLayer = 'H';
    $: candidateList = analysisResult?.parcelCandidates?.length
        ? enrichPracticeDistricts(analysisResult.parcelCandidates, hazard)
        : [];
    $: practiceDistrictGroups = PRACTICE_TYPE_ORDER.map((type) => ({
        type,
        ...PRACTICE_TYPE_META[type],
        candidates: candidateList.filter((candidate) => candidate.practiceType === type)
    }));
    $: if (candidateList.length && selectedCandidate >= candidateList.length) selectedCandidate = 0;
    $: selectedCandidateItem = candidateList[selectedCandidate] || candidateList[0] || null;
    $: detailCandidateItem = detailCandidateKey
        ? candidateList.find((candidate) => candidateIdentity(candidate) === detailCandidateKey)
        : selectedCandidateItem;
    $: handoffCandidateCount = alternatives.reduce((sum, alternative) => (
        sum + (alternative.analysisResult?.parcelCandidates?.length || 0)
    ), 0);
    $: handoffAlternativeCount = alternatives.filter((alternative) => (
        alternative.analysisResult?.parcelCandidates?.length
    )).length;
    $: handoffStatusText = latestHandoffPackage
        ? `전달됨 · ${latestHandoffPackage.alternativeCount}개 대안 · ${latestHandoffPackage.candidateCount}개 후보 · ${formatHandoffTime(latestHandoffPackage.deliveredAt)}`
        : handoffCandidateCount
            ? `${handoffAlternativeCount}개 대안 · ${handoffCandidateCount}개 후보 전달 가능`
            : handoffMessage;
    $: sentRequestCount = sentHandoffPackages.length;

    let cells = Array.from({ length: 108 }, (_, i) => {
        const x = i % 12;
        const y = Math.floor(i / 12);
        return Math.min(0.98, Math.max(0.08, 0.18 + Math.sin(x * 1.3 + y * 0.7) * 0.18 + (x > 5 && y > 2 && y < 7 ? 0.42 : 0) + ((x + y) % 5) * 0.035));
    });

    $: enabledCount = indicators.filter((item) => item.enabled).length;
    $: dimensionSelectedCounts = {
        H: indicators.filter((item) => item.enabled && item.dimension === 'H').length,
        E: indicators.filter((item) => item.enabled && item.dimension === 'E').length,
        V: indicators.filter((item) => item.enabled && item.dimension === 'V').length
    };
    $: availableCount = indicators.filter(isIndicatorAvailable).length;
    $: resultScores = analysisResult?.dimensionScores || { H: null, E: null, V: null };
    $: resultRiskScore = analysisResult?.riskScore ?? null;

    function clearAllIndicators() {
        if (!enabledCount) return;
        indicators = indicators.map((item) => ({ ...item, enabled: false }));
        loadedPreviewIndicators = loadedPreviewIndicators.map((item) => ({ ...item, enabled: false }));
        markAnalysisDirty();
    }

    let previousActiveAlternativeIndex = activeAlternative;
    let alternativeFlash = false;
    let alternativeFlashTimer;
    $: if (activeAlternative !== previousActiveAlternativeIndex) {
        previousActiveAlternativeIndex = activeAlternative;
        alternativeFlash = true;
        clearTimeout(alternativeFlashTimer);
        alternativeFlashTimer = setTimeout(() => { alternativeFlash = false; }, 700);
    }

    function priorityDraftKey(code = regionCode) {
        return `${PRIORITY_DRAFT_SCHEMA_VERSION}:${hazard}:${code || 'unknown'}`;
    }

    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        });
    }

    function openPriorityDraftDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }

            const request = indexedDB.open(PRIORITY_DRAFT_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PRIORITY_DRAFT_STORE_NAME)) {
                    db.createObjectStore(PRIORITY_DRAFT_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    async function readPriorityDraft() {
        const db = await openPriorityDraftDb();
        try {
            const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readonly');
            const store = transaction.objectStore(PRIORITY_DRAFT_STORE_NAME);
            return await requestToPromise(store.get(priorityDraftKey()));
        } finally {
            db.close();
        }
    }

    async function writePriorityDraft(payload) {
        const db = await openPriorityDraftDb();
        try {
            const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRIORITY_DRAFT_STORE_NAME);
            await requestToPromise(store.put(JSON.parse(JSON.stringify(payload))));
        } finally {
            db.close();
        }
    }

    function buildPriorityDraftPayload() {
        return {
            id: priorityDraftKey(),
            schemaVersion: PRIORITY_DRAFT_SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            hazard,
            hazardLabel: config.label,
            region,
            regionCode,
            projectName,
            activeStep,
            activeAlternative,
            gridUnit,
            dimensionWeights: { ...dimensionWeights },
            mapSource,
            indicators: cloneIndicatorsForAlternative(indicators),
            appliedIndicators: appliedIndicators.map((item) => ({ ...item })),
            analysisResult,
            analysisDone,
            analysisMessage,
            parcelCandidateMessage,
            selectedCandidate,
            detailCandidateKey,
            activeLayer,
            latestHandoffPackage,
            sentHandoffPackages,
            alternatives
        };
    }

    function alternativeStatusLabel(alternative) {
        const currentStatus = alternative?.status || '검토중';
        if (currentStatus === '선정' || currentStatus === '검토완료') return currentStatus;

        const hasAnalysis = Boolean(alternative?.analysisDone && alternative?.analysisResult);
        if (!hasAnalysis) return '검토중';

        const hasParcelCandidates = Array.isArray(alternative?.analysisResult?.parcelCandidates)
            && alternative.analysisResult.parcelCandidates.length > 0;
        return hasParcelCandidates ? '분석완료' : '리스크분석완료';
    }

    function normalizeDraftAlternative(alternative, index) {
        return {
            ...alternative,
            id: alternative?.id || `alternative-${index + 1}`,
            status: alternativeStatusLabel(alternative),
            settings: alternative?.settings || null,
            analysisResult: alternative?.analysisResult || null,
            appliedIndicators: Array.isArray(alternative?.appliedIndicators) ? alternative.appliedIndicators : [],
            analysisDone: Boolean(alternative?.analysisDone && alternative?.analysisResult),
            analysisMessage: alternative?.analysisMessage || null,
            parcelCandidateMessage: alternative?.parcelCandidateMessage || null,
            selectedCandidate: Number.isInteger(alternative?.selectedCandidate) ? alternative.selectedCandidate : 0,
            detailCandidateKey: alternative?.detailCandidateKey || null,
            activeLayer: alternative?.activeLayer || 'Risk'
        };
    }

    function restorePriorityDraftPayload(draft) {
        if (!draft || draft.schemaVersion !== PRIORITY_DRAFT_SCHEMA_VERSION) return false;
        if (draft.hazard !== hazard || draft.regionCode !== regionCode) return false;
        if (!Array.isArray(draft.alternatives) || !draft.alternatives.length) return false;

        region = draft.region || region;
        gridUnit = draft.gridUnit || gridUnit;
        dimensionWeights = { ...(draft.dimensionWeights || dimensionWeights) };
        mapSource = draft.mapSource || mapSource;
        latestHandoffPackage = draft.latestHandoffPackage || null;
        sentHandoffPackages = Array.isArray(draft.sentHandoffPackages) ? draft.sentHandoffPackages : (latestHandoffPackage ? [latestHandoffPackage] : []);
        alternatives = draft.alternatives.map(normalizeDraftAlternative);
        activeAlternative = Math.min(Math.max(0, Number(draft.activeAlternative) || 0), alternatives.length - 1);
        activeStep = Math.max(0, Number(draft.activeStep) || 0);
        loadAlternative(activeAlternative);
        activeStep = Math.max(activeStep, analysisDone ? 4 : activeStep);
        draftStorageStatus = `임시 저장 복원됨 · ${new Date(draft.savedAt || Date.now()).toLocaleString('ko-KR')}`;
        return true;
    }

    async function savePriorityDraft() {
        if (!draftLoadComplete) return;
        persistAlternative(activeAlternative);
        const payload = buildPriorityDraftPayload();

        try {
            await writePriorityDraft(payload);
            draftStorageStatus = `임시 저장됨 · ${new Date(payload.savedAt).toLocaleTimeString('ko-KR')}`;
        } catch (error) {
            console.warn(error);
            draftStorageStatus = '임시 저장 실패 · 브라우저 저장소를 확인하세요';
        }
    }

    function schedulePriorityDraftSave() {
        if (!draftLoadComplete) return;
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = window.setTimeout(savePriorityDraft, 450);
    }

    async function clearPriorityDraftStore() {
        const db = await openPriorityDraftDb();
        try {
            const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readwrite');
            await requestToPromise(transaction.objectStore(PRIORITY_DRAFT_STORE_NAME).clear());
        } finally {
            db.close();
        }
    }

    async function refreshSupabaseDrafts() {
        supabaseBusy = true;
        try {
            supabaseDrafts = await listPriorityAreaDrafts({
                regionCode,
                hazardType: hazard,
                limit: 30
            });
            supabaseStatus = supabaseDrafts.length
                ? `Supabase 저장 이력 ${supabaseDrafts.length}건`
                : 'Supabase 저장 이력이 없습니다.';
        } catch (error) {
            console.warn(error);
            supabaseStatus = error?.message || 'Supabase 이력 조회 실패';
        } finally {
            supabaseBusy = false;
        }
    }

    async function saveCurrentDraftToSupabase() {
        const actorUser = operatorName.trim();
        if (!actorUser) {
            supabaseStatus = '작업자 이름을 먼저 입력하세요.';
            supabaseSaveDialog = {
                state: 'error',
                title: '저장할 수 없습니다',
                message: '작업자 이름 또는 부서를 먼저 입력해 주세요.'
            };
            return;
        }

        supabaseBusy = true;
        supabaseSaveDialog = {
            state: 'saving',
            title: '대안 저장 중',
            message: '분석 결과를 정리해 Supabase에 새 버전으로 저장하고 있습니다.'
        };
        persistAlternative(activeAlternative);
        const payload = buildSupabaseDraftPayload();
        try {
            window.localStorage.setItem('livinglabs.priorityAreaOperator', actorUser);
            const saved = await savePriorityAreaDraft({
                regionCode,
                regionName: region,
                hazardType: hazard,
                projectName,
                actorUser,
                draftPayload: payload
            });
            supabaseStatus = `${saved?.analysis_version || '새 버전'} 저장 완료 · ${actorUser}`;
            supabaseSaveDialog = {
                state: 'success',
                title: '대안 저장 완료',
                message: `${saved?.set_name || saved?.analysis_version || '새 저장본'}을 ${actorUser} 작업 이력으로 저장했습니다.`
            };
            await refreshSupabaseDrafts();
            supabaseHistoryOpen = false;
        } catch (error) {
            console.warn(error);
            const timedOut = String(error?.message || '').includes('57014')
                || String(error?.message || '').toLowerCase().includes('statement timeout');
            supabaseStatus = timedOut
                ? '저장 데이터 처리 시간이 초과되었습니다. 다시 시도해 주세요.'
                : error?.message || 'Supabase 저장 실패';
            supabaseSaveDialog = {
                state: 'error',
                title: '대안 저장 실패',
                message: timedOut
                    ? '저장할 데이터 처리 시간이 초과되었습니다. 데이터 크기를 줄인 저장 방식으로 다시 시도해 주세요.'
                    : supabaseStatus
            };
        } finally {
            supabaseBusy = false;
        }
    }

    function loadSupabaseDraft(row) {
        const payload = draftPayloadFromRow(row);
        if (!restorePriorityDraftPayload(payload)) {
            supabaseStatus = '현재 지역·재해유형과 맞지 않는 저장본입니다.';
            return;
        }
        supabaseStatus = `${row.analysis_version || '저장본'} 불러오기 완료 · ${row.created_by_user || '작업자 미기록'}`;
        supabaseHistoryOpen = false;
        schedulePriorityDraftSave();
    }

    async function toggleSupabaseHistory() {
        supabaseHistoryOpen = !supabaseHistoryOpen;
        if (supabaseHistoryOpen) await refreshSupabaseDrafts();
    }

    async function readDevelopmentResetSignal() {
        if (!devResetSignalUrl) return '';
        try {
            const response = await fetch(devResetSignalUrl, { cache: 'no-store' });
            if (!response.ok) return '';
            const state = await response.json();
            return state?.resetAt || '';
        } catch {
            return '';
        }
    }

    async function applyDevelopmentReset() {
        draftLoadComplete = false;
        window.clearTimeout(draftSaveTimer);
        resetAllAlternatives();
        try {
            await clearPriorityDraftStore();
        } catch (error) {
            console.warn(error);
        }
        supabaseDrafts = [];
        supabaseHistoryOpen = false;
        supabaseStatus = '개발 초기화 완료 · Supabase 저장 이력 삭제됨';
        draftStorageStatus = '개발 초기화 완료 · 새 대안1';
        draftLoadComplete = true;
    }

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        region = params.get('regionName') || region;
        regionCode = params.get('regionCode') || regionCode;
        selectedSido = getRegionByCode(regionCode)?.sido || selectedSido;
        hazardDatasetMode = hazard === 'heatwave' && params.get('hazardPeriod') === 'future' ? 'future' : 'observed';
        hazardScenario = hazardScenarios.includes(params.get('scenario')) ? params.get('scenario') : hazardScenario;
        hazardFuturePeriod = hazardFuturePeriods.includes(params.get('futurePeriod')) ? params.get('futurePeriod') : hazardFuturePeriod;
        indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        operatorName = window.localStorage.getItem('livinglabs.priorityAreaOperator') || operatorName;
        const resumeDraft = params.get('resumeDraft') === '1';

        try {
            draftLoadComplete = true;
            if (resumeDraft) {
                const restored = restorePriorityDraftPayload(await readPriorityDraft());
                if (!restored) draftStorageStatus = '복원할 임시 저장이 없어 새 작업으로 시작합니다.';
            } else {
                draftStorageStatus = '새 작업 세션 · 이전 초안 자동 복원 안 함';
            }
        } catch (error) {
            console.warn(error);
            draftLoadComplete = true;
            draftStorageStatus = '임시 저장소 연결 실패';
        }

        if (config.dataSummaryPath && regionCode === '41110') {
            try {
                const dataResponse = await fetch(asset(config.dataSummaryPath));
                dataBundle = await dataResponse.json();
                dataBundleStatus = `${dataBundle.title} 연결됨`;
            } catch (error) {
                dataBundleStatus = '수원 시연 원자료 요약 연결 실패';
            }
        }

        if (!analysisResult?.gridResult) mapSource = config.mapSource;

        if (!analysisResult?.gridResult) {
            loadedPreviewIndicators = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
            indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        }

        lastDevResetAt = await readDevelopmentResetSignal();
        devResetPollTimer = window.setInterval(async () => {
            const resetAt = await readDevelopmentResetSignal();
            if (resetAt && lastDevResetAt && resetAt !== lastDevResetAt) {
                lastDevResetAt = resetAt;
                await applyDevelopmentReset();
            } else if (resetAt && !lastDevResetAt) {
                lastDevResetAt = resetAt;
            }
        }, 1500);

        return () => {
            window.clearTimeout(draftSaveTimer);
        };
    });

    onDestroy(() => {
        if (typeof window === 'undefined') return;
        window.clearTimeout(draftSaveTimer);
        window.clearInterval(devResetPollTimer);
    });

    function cloneIndicatorsForAlternative(sourceIndicators = indicators) {
        return sourceIndicators.map((item) => ({ ...item }));
    }

    function currentAlternativeState(overrides = {}) {
        return {
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators)
            },
            analysisResult,
            appliedIndicators: appliedIndicators.map((item) => ({ ...item })),
            analysisDone,
            analysisMessage,
            parcelCandidateMessage,
            selectedCandidate,
            detailCandidateKey,
            activeLayer,
            ...overrides
        };
    }

    function persistAlternative(index = activeAlternative, overrides = {}) {
        alternatives = alternatives.map((alternative, alternativeIndex) =>
            alternativeIndex === index
                ? { ...alternative, ...currentAlternativeState(overrides) }
                : alternative
        );
    }

    function loadAlternative(index) {
        const alternative = alternatives[index];
        if (!alternative) return;

        gridUnit = alternative.settings?.gridUnit || '100m';
        dimensionWeights = { ...(alternative.settings?.dimensionWeights || { H: 1, E: 1, V: 1 }) };
        indicators = cloneIndicatorsForAlternative(alternative.settings?.indicators || config.indicators)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        analysisResult = alternative.analysisResult || null;
        appliedIndicators = (alternative.appliedIndicators || []).map((item) => ({ ...item }));
        analysisDone = Boolean(alternative.analysisDone && analysisResult);
        analysisMessage = alternative.analysisMessage || '설정값을 확인한 뒤 Risk 분석을 실행하세요.';
        parcelCandidateMessage = alternative.parcelCandidateMessage ||
            (analysisResult?.parcelCandidates?.length
                ? `${analysisResult.parcelCandidates.length}개 실천권역 도출`
                : analysisDone
                    ? 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.'
                    : 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.');
        selectedCandidate = Number.isInteger(alternative.selectedCandidate) ? alternative.selectedCandidate : 0;
        detailCandidateKey = alternative.detailCandidateKey ||
            (analysisResult?.parcelCandidates?.[0] ? candidateIdentity(analysisResult.parcelCandidates[0]) : null);
        focusedCandidate = null;
        mapResetKey += 1;
        activeLayer = alternative.activeLayer || 'Risk';
        activeStep = analysisDone ? 4 : Math.min(activeStep, 2);
    }

    function switchAlternative(index) {
        if (index === activeAlternative) return;
        persistAlternative(activeAlternative);
        activeAlternative = index;
        loadAlternative(index);
        schedulePriorityDraftSave();
    }

    function publicDemoSeed(item) {
        return `${regionCode}:${item.indicatorCode || item.id}`
            .split('')
            .reduce((sum, character) => sum + character.charCodeAt(0), 0);
    }

    function publicDemoValue(index, columns, rows, seed) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = columns > 1 ? column / (columns - 1) : 0.5;
        const y = rows > 1 ? row / (rows - 1) : 0.5;
        const wave = (Math.sin((x * 8.4) + (seed * 0.07)) + Math.cos((y * 7.1) - (seed * 0.05))) * 0.09;
        const ridge = Math.max(0, 1 - Math.hypot(x - 0.64, y - 0.42) * 2.1) * 0.22;
        const texture = (((index * 1103515245 + seed * 12345) >>> 8) % 101) / 1000;
        return clamp01(0.34 + wave + ridge + texture);
    }

    function createPublicDemoFallbackGrid(item, referenceItem = null) {
        let columns = Number(referenceItem?.gridMeta?.columns);
        let rows = Number(referenceItem?.gridMeta?.rows);
        let extent = referenceItem?.gridMeta?.extent;
        let transform = referenceItem?.gridMeta?.transform;

        if (!(columns > 0 && rows > 0 && transform)) {
            const bounds = getRegionBounds(regionCode);
            if (!bounds) return null;
            const [xmin, ymin] = proj4('EPSG:4326', 'EPSG:5179', [bounds.west, bounds.south]);
            const [xmax, ymax] = proj4('EPSG:4326', 'EPSG:5179', [bounds.east, bounds.north]);
            const originX = Math.floor(Math.min(xmin, xmax) / 100) * 100;
            const originY = Math.ceil(Math.max(ymin, ymax) / 100) * 100;
            columns = Math.max(1, Math.ceil((Math.max(xmin, xmax) - originX) / 100));
            rows = Math.max(1, Math.ceil((originY - Math.min(ymin, ymax)) / 100));
            transform = { originX, originY, pixelWidth: 100, pixelHeight: 100 };
            extent = {
                xmin: originX,
                ymin: originY - (rows * 100),
                xmax: originX + (columns * 100),
                ymax: originY
            };
        }

        const cellCount = columns * rows;
        if (!Number.isFinite(cellCount) || cellCount <= 0 || cellCount > 450000) return null;
        const seed = publicDemoSeed(item);
        const values = new Float32Array(cellCount);
        let sum = 0;
        for (let index = 0; index < cellCount; index += 1) {
            const value = publicDemoValue(index, columns, rows, seed);
            values[index] = value;
            sum += value;
        }
        const mean = sum / cellCount;

        return {
            ...item,
            enabled: item.enabled,
            dataStatus: 'available',
            sourceType: 'PUBLIC-DEMO-FALLBACK',
            demoFallback: true,
            loadedValue: mean,
            gridValues: values,
            gridValidIndices: null,
            gridMeta: {
                gridUnit: '100m',
                rows,
                columns,
                extent,
                transform,
                crs: 'EPSG:5179'
            },
            gridSummary: {
                gridUnit: '100m',
                rows,
                columns,
                validCells: cellCount,
                rawMean: Number(mean.toFixed(4)),
                rawUnit: '정규화 점수',
                normalizedMean: mean,
                sourceResolution: '시연용 대체 패턴'
            },
            loadError: `${item.label} 원자료 서버에 연결하지 못해 공개 시연용 대체 패턴을 사용했습니다.`
        };
    }

    function indicatorDataKey(item) {
        return [
            item.id,
            item.dataPath || '',
            item.populationIndicator || '',
            item.indicatorCode || '',
            item.floodIndicator || '',
            item.analysisIndicator || ''
        ].join('|');
    }

    function initialPreviewTargets(sourceIndicators) {
        return sourceIndicators
            .filter((item) => item.enabled && item.group === '기후위험' && item.dataPath)
            .slice(0, 1)
            .map((item) => ({ ...item }));
    }

    async function loadIndicatorInputs(sourceIndicators, cachedIndicators = [], { preferDense = false } = {}) {
        const cachedByKey = new Map(
            cachedIndicators
                .filter((item) => isGridValueCollection(item.gridValues))
                .map((item) => [indicatorDataKey(item), item])
        );
        const loaded = await Promise.all(sourceIndicators.map(async (item) => {
            if (!usableIndicator(item) || !item.dataPath) return item;

            const cached = cachedByKey.get(indicatorDataKey(item));
            if (cached) {
                return {
                    ...cached,
                    ...item,
                    gridValues: cached.gridValues,
                    gridValidIndices: cached.gridValidIndices,
                    gridMeta: cached.gridMeta,
                    gridSummary: cached.gridSummary,
                    loadedValue: cached.loadedValue
                };
            }

            try {
                const dataUrl = item.populationIndicator
                    ? `${base}/population/grid?regionCode=${encodeURIComponent(regionCode)}&indicator=${encodeURIComponent(item.populationIndicator)}`
                    : ['/hazard-grid', '/flood-grid', '/analysis-grid'].some((prefix) => item.dataPath.startsWith(prefix))
                        ? item.dataPath
                        : asset(item.dataPath);
                const response = await fetch(dataUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const grid = await response.json();
                const decodedGrid = decodeGridValues(grid, { preferDense });
                const loadedValue = Number(grid?.stats?.normalizedMean ?? grid?.stats?.mean);
                if (!Number.isFinite(loadedValue)) throw new Error('normalizedMean is missing');

                return {
                    ...item,
                    loadedValue,
                    geojson: grid.pointFeatureCollection || item.geojson,
                    gridValues: decodedGrid.values,
                    gridValidIndices: decodedGrid.validIndices,
                    gridMeta: {
                        gridUnit: grid.gridUnit,
                        rows: grid.rows,
                        columns: grid.columns,
                        extent: grid.extent,
                        transform: grid.transform,
                        crs: grid.crs
                    },
                    gridSummary: {
                        gridUnit: grid.gridUnit,
                        rows: grid.rows,
                        columns: grid.columns,
                        validCells: grid.stats?.validCells,
                        rawMean: grid.stats?.rawMean,
                        rawUnit: grid.rawUnit || grid.unit || '',
                        normalizedMean: grid.stats?.normalizedMean ?? grid.stats?.mean,
                        sourceResolution: grid.sourceResolution,
                        pointFeatureCount: grid.pointFeatureCount || 0
                    }
                };
            } catch (error) {
                if (nationalLab && item.indicatorCode) {
                    return {
                        ...item,
                        publicFallbackPending: true,
                        loadError: `${item.label} 원자료 서버에 연결하지 못했습니다.`
                    };
                }
                return {
                    ...item,
                    enabled: false,
                    dataStatus: 'missing',
                    loadError: `${item.label} 입력자료를 읽지 못했습니다.`
                };
            }
        }));

        const referenceItem = loaded.find((item) =>
            !item.publicFallbackPending &&
            isGridValueCollection(item.gridValues) &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows
        );
        const resolved = loaded.map((item) => {
            if (!item.publicFallbackPending) return item;
            const fallback = createPublicDemoFallbackGrid(item, referenceItem);
            if (fallback) return fallback;
            return {
                ...item,
                enabled: false,
                dataStatus: 'missing',
                loadError: `${item.label} 입력자료와 시연용 대체 격자를 준비하지 못했습니다.`
            };
        });

        const loadedGrid = resolved.find((item) => item.gridSummary);
        const usesDemoFallback = resolved.some((item) => item.demoFallback && item.enabled);
        mapSource = loadedGrid
            ? usesDemoFallback
                ? `공개 시연용 100m 대체 패턴 · 실제 Hazard 원자료 서버 연결 전 · ${loadedGrid.gridSummary.columns}×${loadedGrid.gridSummary.rows}`
                : `${config.rasterReadyPrefix} · ${loadedGrid.gridSummary.columns}×${loadedGrid.gridSummary.rows} · 평균 ${loadedGrid.gridSummary.rawMean}${loadedGrid.gridSummary.rawUnit}`
            : config.mapSource;

        return resolved;
    }

    function createIndicatorPreviewGrid(sourceIndicators) {
        const previewItems = sourceIndicators.filter((item) =>
            item.enabled &&
            isGridValueCollection(item.gridValues) &&
            gridValueCollectionSize(item.gridValues) &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows &&
            item.gridMeta?.transform
        );
        const reference = previewItems[0];
        if (!reference) return null;
        const hasSparseIndices = previewItems.every((item) =>
            Array.isArray(item.gridValidIndices) && item.gridValidIndices.length
        );
        const validIndices = hasSparseIndices
            ? [...new Set(previewItems.flatMap((item) => item.gridValidIndices))]
            : null;

        return {
            preview: true,
            gridUnit: reference.gridMeta.gridUnit || gridUnit,
            columns: Number(reference.gridMeta.columns),
            rows: Number(reference.gridMeta.rows),
            extent: reference.gridMeta.extent,
            transform: reference.gridMeta.transform,
            crs: reference.gridMeta.crs,
            values: reference.gridValues,
            validIndices
        };
    }

    function isIndicatorAvailable(item) {
        return ['available', 'partial'].includes(item.dataStatus) && (!item.supportedGridUnits || item.supportedGridUnits.includes(gridUnit));
    }

    function indicatorStatusText(item) {
        if (!['available', 'partial'].includes(item.dataStatus)) return '연결대기';
        if (item.supportedGridUnits && !item.supportedGridUnits.includes(gridUnit)) return '격자미지원';
        return item.dataStatus === 'partial' ? `${item.sourceType} · 일부 보완 필요` : item.sourceType;
    }

    function usableIndicator(item) {
        return item.enabled && isIndicatorAvailable(item);
    }

    function selectedIndicatorsFor(group, source = indicators) {
        return source.filter((item) => item.group === group && usableIndicator(item));
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function indicatorValue(item) {
        if (Number.isFinite(item.loadedValue)) return clamp01(item.loadedValue);
        const value = Number(item.value);
        if (Number.isFinite(value)) return clamp01(value);
        return clamp01(0.45 + ((item.id * 17) % 40) / 100);
    }

    function weightedMean(items, valueGetter = indicatorValue) {
        const totalWeight = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
        if (!items.length || totalWeight <= 0) return null;
        return items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0) * valueGetter(item), 0) / totalWeight;
    }

    function weightedGeometricMean(scores, weights) {
        const safeWeights = {
            H: Math.max(0, Number(weights.H) || 0),
            E: Math.max(0, Number(weights.E) || 0),
            V: Math.max(0, Number(weights.V) || 0)
        };
        const totalWeight = safeWeights.H + safeWeights.E + safeWeights.V;
        if (totalWeight <= 0) return 0;

        return Math.pow(
            Math.pow(Math.max(scores.H, 0.0001), safeWeights.H) *
            Math.pow(Math.max(scores.E, 0.0001), safeWeights.E) *
            Math.pow(Math.max(scores.V, 0.0001), safeWeights.V),
            1 / totalWeight
        );
    }

    function finiteGridValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? clamp01(number) : null;
    }

    function gridValue(item, index) {
        if (!isGridValueCollection(item.gridValues)) return null;
        return finiteGridValue(item.gridValues instanceof Map ? item.gridValues.get(index) : item.gridValues[index]);
    }

    function weightedCellMean(items, index, valueGetter = gridValue) {
        let weightedSum = 0;
        let totalWeight = 0;

        items.forEach((item) => {
            const weight = Math.max(0, Number(item.weight) || 0);
            if (weight <= 0) return;

            const value = valueGetter(item, index);
            if (value === null) return;

            weightedSum += weight * value;
            totalWeight += weight;
        });

        return totalWeight > 0 ? weightedSum / totalWeight : null;
    }

    function summarizeGridValues(values) {
        const validValues = [];
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (const value of values) {
            if (!Number.isFinite(value)) continue;
            validValues.push(value);
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
        }
        if (!validValues.length) {
            return {
                validCells: 0,
                min: null,
                max: null,
                mean: null,
                topCount: 0,
                topThreshold: null
            };
        }

        const sorted = [...validValues].sort((left, right) => right - left);
        const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));

        return {
            validCells: validValues.length,
            min,
            max,
            mean: sum / validValues.length,
            topCount,
            topThreshold: sorted[topCount - 1]
        };
    }

    function stripIndicatorForResult(item) {
        const { gridValues, ...resultItem } = item;
        return {
            ...resultItem,
            gridValues: isGridValueCollection(gridValues) ? gridValues : null
        };
    }

    function computeGridAnalysis(sourceIndicators) {
        const availableIndicators = sourceIndicators.filter(usableIndicator);
        const reference = availableIndicators.find((item) =>
            isGridValueCollection(item.gridValues) &&
            gridValueCollectionSize(item.gridValues) &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows
        );

        if (!reference) return null;

        const columns = Number(reference.gridMeta.columns);
        const rows = Number(reference.gridMeta.rows);
        const cellCount = columns * rows;
        const gridIndicators = availableIndicators.filter((item) =>
            isGridValueCollection(item.gridValues) &&
            (item.gridValues instanceof Map || item.gridValues.length >= cellCount) &&
            Number(item.gridMeta?.columns) === columns &&
            Number(item.gridMeta?.rows) === rows
        );
        const byGroup = (group) => gridIndicators.filter((item) => item.group === group);
        const hItems = byGroup('기후위험');
        const eItems = byGroup('노출');
        const sensitivityItems = byGroup('민감도');
        const adaptiveItems = byGroup('적응역량');

        if (!hItems.length) return null;
        const hazardOnly = nationalLab && (!eItems.length || !sensitivityItems.length || !adaptiveItems.length);
        if (!hazardOnly && (!eItems.length || !sensitivityItems.length || !adaptiveItems.length)) return null;

        const createEmptyValues = () => {
            const values = new Float32Array(cellCount);
            values.fill(Number.NaN);
            return values;
        };
        const hValues = createEmptyValues();
        const eValues = createEmptyValues();
        const sensitivityValues = createEmptyValues();
        const adaptiveCapacityValues = createEmptyValues();
        const vValues = createEmptyValues();
        const riskValues = createEmptyValues();
        const canUseSparseIndices = gridIndicators.every((item) =>
            Array.isArray(item.gridValidIndices) && item.gridValidIndices.length
        );
        const analysisIndices = canUseSparseIndices
            ? [...new Set(gridIndicators.flatMap((item) => item.gridValidIndices))]
            : Array.from({ length: cellCount }, (_, index) => index);
        const riskValidIndices = [];

        for (const index of analysisIndices) {
            const hScore = weightedCellMean(hItems, index);
            const eScore = weightedCellMean(eItems, index);
            const sensitivityScore = weightedCellMean(sensitivityItems, index);
            const adaptiveCapacityForV = weightedCellMean(
                adaptiveItems,
                index,
                (item, cellIndex) => {
                    const value = gridValue(item, cellIndex);
                    if (value === null) return null;
                    return item.direction === 'negative' ? 1 - value : value;
                }
            );

            hValues[index] = hScore;
            eValues[index] = eScore;
            sensitivityValues[index] = sensitivityScore;
            adaptiveCapacityValues[index] = adaptiveCapacityForV;

            if (hazardOnly && Number.isFinite(hScore)) {
                riskValues[index] = hScore;
                riskValidIndices.push(index);
            } else if (
                Number.isFinite(hScore) &&
                Number.isFinite(eScore) &&
                Number.isFinite(sensitivityScore) &&
                Number.isFinite(adaptiveCapacityForV)
            ) {
                const vScore = clamp01((vLambda * sensitivityScore) + ((1 - vLambda) * adaptiveCapacityForV));
                const riskScore = weightedGeometricMean({ H: hScore, E: eScore, V: vScore }, dimensionWeights);
                vValues[index] = vScore;
                riskValues[index] = riskScore;
                riskValidIndices.push(index);
            }
        }

        const hStats = summarizeGridValues(hValues);
        const eStats = summarizeGridValues(eValues);
        const sensitivityStats = summarizeGridValues(sensitivityValues);
        const adaptiveStats = summarizeGridValues(adaptiveCapacityValues);
        const vStats = summarizeGridValues(vValues);
        const riskStats = summarizeGridValues(riskValues);

        if (!riskStats.validCells) return null;

        return {
            dimensionScores: {
                H: hStats.mean,
                E: eStats.mean,
                V: vStats.mean
            },
            sensitivityScore: sensitivityStats.mean,
            adaptiveCapacityForV: adaptiveStats.mean,
            riskScore: riskStats.mean,
            hazardOnly,
            gridResult: {
                hazardOnly,
                gridUnit,
                columns,
                rows,
                extent: reference.gridMeta.extent,
                transform: reference.gridMeta.transform,
                crs: reference.gridMeta.crs,
                validIndices: riskValidIndices,
                valueEncoding: hazardOnly
                    ? 'row-major 100m cells; preliminary Risk equals normalized Hazard score'
                    : 'row-major 100m cells aligned to the regional analysis grid',
                values: riskValues,
                hValues,
                eValues,
                sensitivityValues,
                adaptiveCapacityValues,
                vValues,
                stats: {
                    ...riskStats,
                    hMean: hStats.mean,
                    eMean: eStats.mean,
                    sensitivityMean: sensitivityStats.mean,
                    adaptiveCapacityMean: adaptiveStats.mean,
                    vMean: vStats.mean
                }
            }
        };
    }

    function validateAnalysis() {
        const activeRequiredGroups = analysisRequiredGroups();
        const missingGroup = activeRequiredGroups.find((group) => selectedIndicatorsFor(group).length === 0);
        if (missingGroup) {
            return `분석을 실행할 수 없습니다. ${missingGroup} 영역에 선택된 사용 가능 지표가 없습니다.`;
        }
        const zeroWeightGroup = activeRequiredGroups.find((group) => {
            const items = selectedIndicatorsFor(group);
            return items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0) <= 0;
        });
        if (zeroWeightGroup) {
            return `분석을 실행할 수 없습니다. ${zeroWeightGroup} 영역의 가중치 합이 0입니다.`;
        }
        const activeDimensionWeight = activeRequiredGroups.length === 1
            ? dimensionWeights.H
            : dimensionWeights.H + dimensionWeights.E + dimensionWeights.V;
        if (activeDimensionWeight <= 0) {
            return '분석을 실행할 수 없습니다. H/E/V 통합 가중치 합이 0입니다.';
        }
        return '';
    }

    function computeAnalysis(sourceIndicators) {
        const gridAnalysis = computeGridAnalysis(sourceIndicators);

        if (gridAnalysis) {
            return {
                gridUnit,
                formula: gridAnalysis.hazardOnly
                    ? 'Preliminary Risk = normalized Hazard score (H-only until nationwide E/V is connected)'
                    : 'Weighted geometric mean: (H^wH × E^wE × V^wV)^(1/Σw)',
                hazardOnly: gridAnalysis.hazardOnly,
                dimensionScores: gridAnalysis.dimensionScores,
                sensitivityScore: gridAnalysis.sensitivityScore,
                adaptiveCapacityForV: gridAnalysis.adaptiveCapacityForV,
                dimensionWeights: { ...dimensionWeights },
                riskScore: gridAnalysis.riskScore,
                gridResult: gridAnalysis.gridResult,
                parcelCandidates: [],
                indicators: sourceIndicators.filter(usableIndicator).map(stripIndicatorForResult)
            };
        }

        const hScore = weightedMean(selectedIndicatorsFor('기후위험', sourceIndicators));
        const eScore = weightedMean(selectedIndicatorsFor('노출', sourceIndicators));
        const sensitivityScore = weightedMean(selectedIndicatorsFor('민감도', sourceIndicators));
        const adaptiveCapacityForV = weightedMean(
            selectedIndicatorsFor('적응역량', sourceIndicators),
            (item) => item.direction === 'negative' ? 1 - indicatorValue(item) : indicatorValue(item)
        );
        const vScore = (vLambda * sensitivityScore) + ((1 - vLambda) * adaptiveCapacityForV);
        const dimensionScores = { H: hScore, E: eScore, V: vScore };

        return {
            gridUnit,
            formula: 'Weighted geometric mean: (H^wH × E^wE × V^wV)^(1/Σw)',
            dimensionScores,
            sensitivityScore,
            adaptiveCapacityForV,
            dimensionWeights: { ...dimensionWeights },
            riskScore: weightedGeometricMean(dimensionScores, dimensionWeights),
            gridResult: null,
            parcelCandidates: [],
            indicators: sourceIndicators.filter(usableIndicator).map(stripIndicatorForResult)
        };
    }

    function formatScore(value) {
        return Number.isFinite(value) ? value.toFixed(2) : '--';
    }

    function formatInteger(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number).toLocaleString() : '--';
    }

    function formatHandoffTime(value) {
        if (!value) return '전달 시각 기록 없음';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '전달 시각 기록 없음';
        return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function rememberHandoffPackage(packageRecord) {
        if (!packageRecord?.packageId) return;
        latestHandoffPackage = packageRecord;
        sentHandoffPackages = [
            packageRecord,
            ...sentHandoffPackages.filter((item) => item.packageId !== packageRecord.packageId)
        ].slice(0, 20);
    }

    function candidateTotalAreaLabel(candidate) {
        if (candidate?.totalAreaLabel) return candidate.totalAreaLabel;
        const area = Number(candidate?.totalAreaSqm);
        if (!Number.isFinite(area) || area <= 0) return '면적 산정 전';
        if (area >= 10000) return `${(area / 10000).toFixed(area >= 100000 ? 1 : 2)}ha`;
        return `${Math.round(area).toLocaleString()}㎡`;
    }

    function markAnalysisDirty(message = '설정이 변경되었습니다. Risk 분석을 다시 실행하세요.') {
        analysisDone = false;
        analysisResult = null;
        appliedIndicators = [];
        parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
        selectedCandidate = 0;
        detailCandidateKey = null;
        focusedCandidate = null;
        analysisMessage = message;
        schedulePriorityDraftSave();
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function setDimensionWeight(dimension, value) {
        dimensionWeights = {
            ...dimensionWeights,
            [dimension]: Math.max(0, toNumber(value, 0))
        };
        markAnalysisDirty();
    }

    function setGridUnit(value) {
        gridUnit = value;
        indicators = indicators.map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        markAnalysisDirty('분석 단위 격자가 변경되었습니다. Risk 분석을 다시 실행하세요.');
    }

    async function setHazardDatasetMode(value) {
        hazardDatasetMode = hazard === 'heatwave' && value === 'future' ? 'future' : 'observed';
        await refreshHazardDataset(
            hazardDatasetMode === 'observed'
                ? '최근 5년(2021~2025) 100m 자료로 전환했습니다. H01~H05·H07·H10을 사용할 수 있습니다.'
                : `미래 ${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 100m 자료로 전환했습니다. H01~H09를 사용할 수 있습니다.`
        );
    }

    function analysisRequiredGroups(source = indicators) {
        const hasCompleteHev = requiredGroups.every((group) => selectedIndicatorsFor(group, source).length > 0);
        if (hasCompleteHev || !nationalLab) return requiredGroups;
        return selectedIndicatorsFor('기후위험', source).length ? ['기후위험'] : requiredGroups;
    }

    async function refreshHazardDataset(message) {
        indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        loadedPreviewIndicators = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        const url = new URL(window.location.href);
        url.searchParams.set('hazardPeriod', hazardDatasetMode);
        url.searchParams.set('scenario', hazardScenario);
        url.searchParams.set('futurePeriod', hazardFuturePeriod);
        window.history.replaceState({}, '', url);
        markAnalysisDirty(message);
    }

    async function setHazardScenario(value) {
        hazardScenario = hazardScenarios.includes(value) ? value : 'ssp245';
        await refreshHazardDataset(`${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 전국 100m 미래지표로 전환했습니다.`);
    }

    async function setHazardFuturePeriod(value) {
        hazardFuturePeriod = hazardFuturePeriods.includes(value) ? value : '2050';
        await refreshHazardDataset(`${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 전국 100m 미래지표로 전환했습니다.`);
    }

    async function setNationalRegion(nextCode) {
        const nextRegion = getRegionByCode(nextCode);
        if (!nextRegion || nextRegion.code === regionCode) return;

        const runId = ++regionChangeRunId;
        regionCode = nextRegion.code;
        region = nextRegion.fullName;
        selectedSido = nextRegion.sido;
        indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        loadedPreviewIndicators = [];
        indicatorPreviewGrid = null;
        mapSource = `${region} 전국 100m 원본 연결 중`;
        markAnalysisDirty(`${region}의 100m Hazard 자료를 불러오는 중입니다.`);

        const loaded = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
        if (runId !== regionChangeRunId) return;
        loadedPreviewIndicators = loaded;
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        mapResetKey += 1;

        const url = new URL(window.location.href);
        url.searchParams.set('regionCode', regionCode);
        url.searchParams.set('regionName', region);
        url.searchParams.set('hazardPeriod', hazardDatasetMode);
        url.searchParams.set('scenario', hazardScenario);
        url.searchParams.set('futurePeriod', hazardFuturePeriod);
        window.history.replaceState({}, '', url);
        markAnalysisDirty(`${region} 행정경계에 맞춘 100m 지표를 연결했습니다.`);
    }

    function setNationalSido(value) {
        selectedSido = value;
        const firstRegion = getRegionOptionsBySido(selectedSido)[0];
        if (firstRegion) setNationalRegion(firstRegion.code);
    }

    async function setIndicatorEnabled(id, enabled) {
        indicators = indicators.map((item) => item.id === id ? { ...item, enabled } : item);
        markAnalysisDirty();

        const target = indicators.find((item) => item.id === id);
        const cached = loadedPreviewIndicators.some((item) => item.id === id && isGridValueCollection(item.gridValues));
        if (enabled && target?.dataPath && !cached) {
            const [loaded] = await loadIndicatorInputs([{ ...target }], loadedPreviewIndicators, { preferDense: true });
            loadedPreviewIndicators = [
                ...loadedPreviewIndicators.filter((item) => item.id !== id),
                loaded
            ];
        }

        const currentById = new Map(indicators.map((item) => [item.id, item]));
        loadedPreviewIndicators = loadedPreviewIndicators.map((item) => ({
            ...item,
            enabled: Boolean(currentById.get(item.id)?.enabled),
            weight: currentById.get(item.id)?.weight ?? item.weight,
            direction: currentById.get(item.id)?.direction ?? item.direction
        }));
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
    }

    function setIndicatorWeight(id, value) {
        indicators = indicators.map((item) => item.id === id
            ? { ...item, weight: Math.max(0, toNumber(value, item.weight)) }
            : item
        );
        markAnalysisDirty();
    }

    function adjustIndicatorWeight(id, delta) {
        const item = indicators.find((entry) => entry.id === id);
        if (!item) return;
        const next = Math.min(3, Math.max(0, Math.round((Number(item.weight) + delta) * 10) / 10));
        setIndicatorWeight(id, next);
    }

    function colorFor(value) {
        const adjusted = activeLayer === 'Hotspot' ? value * 1.12 : activeLayer === 'H' ? value * 0.9 : activeLayer === 'E' ? value * 1.04 : activeLayer === 'V' ? value * 0.96 : value;
        if (adjusted > 0.78) return '#d83b3e';
        if (adjusted > 0.62) return '#eb7042';
        if (adjusted > 0.46) return '#f2ad4b';
        if (adjusted > 0.3) return '#f5d77a';
        return '#dce9bd';
    }

    async function runAnalysis() {
        const validationMessage = validateAnalysis();
        if (validationMessage) {
            analysisMessage = validationMessage;
            activeStep = 2;
            return;
        }

        running = true;
        activeStep = 3;
        const analysisAlternativeIndex = activeAlternative;
        const runGridUnit = gridUnit;
        const runDimensionWeights = { ...dimensionWeights };
        const snapshot = indicators.map((item) => ({ ...item }));
        const enrichedSnapshot = await loadIndicatorInputs(snapshot, loadedPreviewIndicators);
        loadedPreviewIndicators = enrichedSnapshot.filter((item) => isGridValueCollection(item.gridValues));
        const missingAfterLoad = analysisRequiredGroups(enrichedSnapshot)
            .find((group) => selectedIndicatorsFor(group, enrichedSnapshot).length === 0);
        if (missingAfterLoad) {
            analysisMessage = `분석을 실행할 수 없습니다. ${missingAfterLoad} 영역의 입력자료를 읽지 못했습니다.`;
            running = false;
            activeStep = 2;
            return;
        }

        const result = computeAnalysis(enrichedSnapshot);
        setTimeout(() => {
            const validCells = result.gridResult?.stats?.validCells;
            const riskModeLabel = result.hazardOnly ? 'H 기반 예비 Risk' : 'H/E/V 종합 Risk';
            const usesDemoFallback = result.indicators.some((item) => item.demoFallback);
            const completedMessage = Number.isFinite(validCells)
                ? `${runGridUnit} 기준 격자 ${validCells.toLocaleString()}셀 · ${result.indicators.length}개 지표로 ${riskModeLabel} 분석 완료`
                : `${runGridUnit} 기준 격자 · ${result.indicators.length}개 지표로 ${riskModeLabel} 분석 완료`;
            const nextAnalysisMessage = usesDemoFallback
                ? `${completedMessage} · 공개 시연용 대체 패턴 포함(실제 Hazard 원자료 아님)`
                : completedMessage;

            alternatives = alternatives.map((alternative, index) => index === analysisAlternativeIndex
                ? {
                    ...alternative,
                    settings: {
                        gridUnit: runGridUnit,
                        dimensionWeights: { ...runDimensionWeights },
                        indicators: cloneIndicatorsForAlternative(snapshot)
                    },
                    analysisResult: result,
                    appliedIndicators: result.indicators.map((item) => ({ ...item })),
                    analysisDone: true,
                    analysisMessage: nextAnalysisMessage,
                    parcelCandidateMessage: 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.',
                    selectedCandidate: 0,
                    detailCandidateKey: null,
                    activeLayer,
                    status: alternative.status === '선정' ? alternative.status : '리스크분석완료'
                }
                : alternative
            );

            if (activeAlternative === analysisAlternativeIndex) {
                appliedIndicators = result.indicators;
                analysisResult = result;
                selectedCandidate = 0;
                detailCandidateKey = null;
                focusedCandidate = null;
                parcelCandidateMessage = 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.';
                analysisMessage = nextAnalysisMessage;
                analysisDone = true;
                activeStep = 4;
            }

            running = false;
            schedulePriorityDraftSave();
        }, 600);
    }

    function handleParcelCandidates(candidates, message, sourceAlternativeId = activeAlternativeId) {
        const nextCandidates = enrichPracticeDistricts(Array.isArray(candidates) ? candidates : [], hazard);
        const nextMessage = message || (nextCandidates.length
            ? `실천권역 내 ${nextCandidates.length}개 유형별 실천지구 도출`
            : '실천권역이 아직 없습니다.');
        const targetIndex = alternatives.findIndex((alternative) => alternative.id === sourceAlternativeId);
        if (targetIndex < 0) return;
        const safeTargetIndex = targetIndex;
        const targetAlternative = alternatives[safeTargetIndex];
        const targetAnalysisResult = safeTargetIndex === activeAlternative
            ? analysisResult
            : targetAlternative?.analysisResult;
        if (!targetAnalysisResult) return;

        const nextAnalysisResult = {
            ...targetAnalysisResult,
            parcelCandidates: nextCandidates
        };
        const nextDetailKey = nextCandidates[0] ? candidateIdentity(nextCandidates[0]) : null;

        alternatives = alternatives.map((alternative, index) => index === safeTargetIndex
            ? {
                ...alternative,
                analysisResult: nextAnalysisResult,
                parcelCandidateMessage: nextMessage,
                selectedCandidate: 0,
                detailCandidateKey: nextDetailKey,
                status: alternative.status === '선정'
                    ? alternative.status
                    : nextCandidates.length
                        ? '분석완료'
                        : '리스크분석완료'
            }
            : alternative
        );

        if (safeTargetIndex === activeAlternative) {
            parcelCandidateMessage = nextMessage;
            selectedCandidate = 0;
            detailCandidateKey = nextDetailKey;
            analysisResult = nextAnalysisResult;
        }
        schedulePriorityDraftSave();
    }

    function focusCandidateOnMap(candidate, index) {
        selectedCandidate = index;
        focusedCandidate = {
            ...candidate,
            id: candidate.id,
            rank: candidate.rank,
            name: candidate.name,
            bounds: candidate.bounds,
            center: candidate.center,
            features: candidate.features || [],
            pnuList: candidate.pnuList || [],
            requestedAt: Date.now()
        };
    }

    function compactCandidateForSupabase(candidate) {
        if (!candidate) return candidate;
        const { features, ...compactCandidate } = candidate;
        return compactCandidate;
    }

    function compactAnalysisResultForSupabase(result) {
        if (!result) return null;
        const grid = result.gridResult;
        return {
            ...result,
            gridResult: grid ? {
                ...grid,
                hValues: undefined,
                eValues: undefined,
                sensitivityValues: undefined,
                adaptiveCapacityValues: undefined,
                vValues: undefined
            } : null,
            parcelCandidates: (result.parcelCandidates || []).map(compactCandidateForSupabase)
        };
    }

    function buildSupabaseDraftPayload() {
        const fullPayload = buildPriorityDraftPayload();
        return {
            ...fullPayload,
            analysisResult: undefined,
            indicators: undefined,
            appliedIndicators: undefined,
            alternatives: fullPayload.alternatives.map((alternative) => ({
                ...alternative,
                analysisResult: compactAnalysisResultForSupabase(alternative.analysisResult),
                appliedIndicators: (alternative.appliedIndicators || []).map(stripIndicatorForResult),
                settings: alternative.settings ? {
                    ...alternative.settings,
                    indicators: (alternative.settings.indicators || []).map(stripIndicatorForResult)
                } : null
            }))
        };
    }

    function createDefaultAlternative(index = 0) {
        const configured = config.alternatives[index] || {
            name: `대안${index + 1}`,
            status: '검토중',
            description: '새 기후적응실천권역 대안'
        };
        return {
            ...configured,
            id: `alternative-${Date.now()}-${index}`,
            settings: null,
            analysisResult: null,
            appliedIndicators: [],
            analysisDone: false,
            analysisMessage: null,
            parcelCandidateMessage: null,
            selectedCandidate: 0,
            detailCandidateKey: null,
            activeLayer: 'Risk'
        };
    }

    function candidateIdentity(candidate) {
        return String(candidate?.id || candidate?.name || `candidate-${candidate?.rank ?? ''}`);
    }

    function selectCandidate(candidate, index) {
        focusCandidateOnMap(candidate, index);
        if (detailCandidateKey) detailCandidateKey = candidateIdentity(candidate);
        schedulePriorityDraftSave();
    }

    function showCandidateDetail(candidate, index) {
        selectCandidate(candidate, index);
        detailCandidateKey = candidateIdentity(candidate);
    }

    function handleMapParcelCandidateFocus(candidate) {
        const index = candidateList.findIndex((item) =>
            candidateIdentity(item) === candidateIdentity(candidate) ||
            Number(item.rank) === Number(candidate.rank) ||
            item.name === candidate.name
        );
        if (index < 0) return;
        const matchedCandidate = candidateList[index];
        focusCandidateOnMap(matchedCandidate, index);
        detailCandidateKey = candidateIdentity(matchedCandidate);
        schedulePriorityDraftSave();
    }

    function summarizeCandidateForHandoff(candidate, alternative, alternativeIndex) {
        const pnuList = Array.from(new Set((candidate.pnuList || []).map((value) => String(value || '').trim()).filter(Boolean)));
        const parcelCount = Math.max(Number(candidate.parcelCount) || 0, pnuList.length);
        const featureTotal = candidate.featureTotal || candidate.featureLimit || candidate.features?.length || 0;
        const scores = {
            risk: candidate.risk,
            h: candidate.h,
            e: candidate.e,
            v: candidate.v,
            score: candidate.score
        };
        const attributes = {
            area: candidate.area,
            reason: candidate.reason,
            basis: candidate.basis,
            practiceType: candidate.practiceType,
            practiceTypeLabel: candidate.practiceTypeLabel,
            classificationVersion: candidate.classificationVersion,
            classificationRule: candidate.classificationRule,
            classificationReason: candidate.classificationReason,
            parcelCount,
            hotspotCount: candidate.hotspotCount,
            totalAreaSqm: candidate.totalAreaSqm,
            totalAreaLabel: candidateTotalAreaLabel(candidate),
            pnuList,
            pnuTotal: pnuList.length,
            featureLimit: candidate.featureLimit || 0,
            featureTotal,
            geometryMode: 'compact'
        };
        const geometry = {
            center: candidate.center || null,
            bounds: candidate.bounds || null,
            features: []
        };

        return {
            id: candidate.id || `${alternative.id}-candidate-${candidate.rank}`,
            alternativeId: alternative.id,
            alternativeName: alternative.name,
            alternativeStatus: alternative.status,
            alternativeIndex: alternativeIndex + 1,
            rank: candidate.rank,
            name: candidate.name,
            area: candidate.area,
            risk: candidate.risk,
            h: candidate.h,
            e: candidate.e,
            v: candidate.v,
            reason: candidate.reason,
            basis: candidate.basis,
            practiceType: candidate.practiceType,
            practiceTypeLabel: candidate.practiceTypeLabel,
            classificationVersion: candidate.classificationVersion,
            classificationRule: candidate.classificationRule,
            classificationReason: candidate.classificationReason,
            parcelCount,
            hotspotCount: candidate.hotspotCount,
            totalAreaSqm: candidate.totalAreaSqm,
            totalAreaLabel: candidateTotalAreaLabel(candidate),
            pnuList,
            pnuTotal: pnuList.length,
            center: candidate.center || null,
            bounds: candidate.bounds || null,
            features: [],
            scores,
            attributes,
            geometry,
            geometryMode: 'compact',
            score: candidate.score
        };
    }

    function buildDepartmentHandoffPayload(sourceAlternatives = alternatives) {
        const alternativePayloads = sourceAlternatives.map((alternative, index) => {
            const candidates = alternative.analysisResult?.parcelCandidates || [];
            const candidateBundles = candidates.map((candidate) => summarizeCandidateForHandoff(candidate, alternative, index));
            const riskValues = candidateBundles.map((candidate) => Number(candidate.scores?.risk ?? candidate.risk)).filter(Number.isFinite);
            return {
                id: alternative.id,
                name: alternative.name,
                status: alternative.status,
                description: alternative.description,
                analysisDone: alternative.analysisDone,
                analysisMessage: alternative.analysisMessage,
                gridUnit: alternative.settings?.gridUnit || gridUnit,
                summary: {
                    candidateCount: candidateBundles.length,
                    averageRisk: riskValues.length ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length : null,
                    maxRisk: riskValues.length ? Math.max(...riskValues) : null
                },
                candidates: candidateBundles
            };
        });
        const candidates = alternativePayloads.flatMap((alternative) => alternative.candidates);
        return {
            packageId: `priority-management-${regionCode}-${Date.now()}`,
            schemaVersion: 'priority-management-handoff/v1',
            source: 'priority-management-area',
            target: 'lead-department-tool',
            createdAt: new Date().toISOString(),
            deliveryStatus: 'draft',
            projectName,
            hazard,
            hazardLabel: config.label,
            region,
            regionCode,
            formula: 'Weighted geometric mean of H/E/V',
            dimensionWeights,
            commonDataItems: config.commonDataItems,
            alternatives: alternativePayloads,
            candidates,
            candidateBundle: {
                model: 'alternative > candidates > candidate.scores/attributes/geometry',
                alternativeCount: alternativePayloads.filter((alternative) => alternative.candidates.length).length,
                candidateCount: candidates.length
            },
            finalSelections: alternativePayloads
                .filter((alternative) => alternative.status === '선정')
                .flatMap((alternative) => alternative.candidates)
        };
    }

    function relayHandoffToLeadDepartment(deliveredPayload) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);

        return new Promise((resolve) => {
            let settled = false;
            let resendTimer = null;
            const targetUrl = new URL(leadDepartmentToolUrl, window.location.href);
            targetUrl.searchParams.set('handoffRelay', 'priority-management');
            targetUrl.searchParams.set('regionCode', deliveredPayload.regionCode || regionCode);

            const iframe = document.createElement('iframe');
            iframe.title = 'priority-management-handoff-relay';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.left = '-10000px';
            iframe.style.top = '-10000px';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const cleanup = () => {
                window.removeEventListener('message', handleAck);
                if (resendTimer) window.clearInterval(resendTimer);
                window.setTimeout(() => iframe.remove(), 250);
            };
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(ok);
            };
            const send = () => {
                try {
                    iframe.contentWindow?.postMessage({
                        type: DEPARTMENT_HANDOFF_KEY,
                        payload: deliveredPayload
                    }, targetUrl.origin);
                } catch {
                    // The timeout below will report a relay miss.
                }
            };
            function handleAck(event) {
                if (event.origin !== targetUrl.origin) return;
                if (event.data?.type !== `${DEPARTMENT_HANDOFF_KEY}:ack`) return;
                if (event.data?.packageId !== deliveredPayload.packageId) return;
                finish(true);
            }

            window.addEventListener('message', handleAck);
            iframe.addEventListener('load', () => {
                send();
                resendTimer = window.setInterval(send, 250);
            });
            iframe.src = targetUrl.toString();
            document.body.appendChild(iframe);
            window.setTimeout(() => finish(false), 3500);
        });
    }

    async function saveHandoffToLocalInbox(deliveredPayload) {
        const supabaseOk = await savePlatformHandoff('priority_to_lead', deliveredPayload, 'requested');
        try {
            const response = await fetch(priorityHandoffInboxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveredPayload)
            });
            if (!response.ok) return supabaseOk;
            const result = await response.json().catch(() => null);
            return supabaseOk || Boolean(result?.ok);
        } catch {
            return supabaseOk;
        }
    }

    function relayRecallToLeadDepartment(packageId) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);

        return new Promise((resolve) => {
            let settled = false;
            let resendTimer = null;
            const targetUrl = new URL(leadDepartmentToolUrl, window.location.href);
            targetUrl.searchParams.set('handoffRelay', 'priority-management');
            targetUrl.searchParams.set('handoffRecall', 'priority-management');
            targetUrl.searchParams.set('regionCode', regionCode);
            if (packageId) targetUrl.searchParams.set('packageId', packageId);

            const iframe = document.createElement('iframe');
            iframe.title = 'priority-management-handoff-recall';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.left = '-10000px';
            iframe.style.top = '-10000px';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const cleanup = () => {
                window.removeEventListener('message', handleAck);
                if (resendTimer) window.clearInterval(resendTimer);
                window.setTimeout(() => iframe.remove(), 250);
            };
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(ok);
            };
            const send = () => {
                try {
                    iframe.contentWindow?.postMessage({
                        type: `${DEPARTMENT_HANDOFF_KEY}:recall`,
                        packageId,
                        regionCode
                    }, targetUrl.origin);
                } catch {
                    // The timeout below will report a relay miss.
                }
            };
            function handleAck(event) {
                if (event.origin !== targetUrl.origin) return;
                if (event.data?.type !== `${DEPARTMENT_HANDOFF_KEY}:recall:ack`) return;
                if (packageId && event.data?.packageId !== packageId) return;
                finish(true);
            }

            window.addEventListener('message', handleAck);
            iframe.addEventListener('load', () => {
                send();
                resendTimer = window.setInterval(send, 250);
            });
            iframe.src = targetUrl.toString();
            document.body.appendChild(iframe);
            window.setTimeout(() => finish(false), 2500);
        });
    }

    function clearStoredDepartmentHandoff(packageId = latestHandoffPackage?.packageId) {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.removeItem(DEPARTMENT_HANDOFF_KEY);
            window.localStorage.setItem(`${DEPARTMENT_HANDOFF_KEY}:recall`, JSON.stringify({
                packageId,
                regionCode,
                recalledAt: new Date().toISOString()
            }));
        } catch {
            // Ignore storage permission issues in demo environments.
        }
        try {
            window.sessionStorage.removeItem(DEPARTMENT_HANDOFF_KEY);
        } catch {
            // Ignore storage permission issues in demo environments.
        }
        try {
            const namedPayload = JSON.parse(window.name || '{}');
            if (namedPayload?.type === DEPARTMENT_HANDOFF_KEY || namedPayload?.schemaVersion === 'priority-management-handoff/v1') window.name = '';
        } catch {
            // Window name may contain non-JSON data from another page.
        }
    }

    async function recallDepartmentHandoff(packageRecord = latestHandoffPackage) {
        const recalledPackageId = packageRecord?.packageId;
        clearStoredDepartmentHandoff(recalledPackageId);
        const [relayOk, supabaseOk] = await Promise.all([
            relayRecallToLeadDepartment(recalledPackageId),
            markPlatformHandoffStatus('priority_to_lead', {
                regionCode,
                packageId: recalledPackageId,
                status: 'recalled'
            })
        ]);
        sentHandoffPackages = recalledPackageId
            ? sentHandoffPackages.filter((item) => item.packageId !== recalledPackageId)
            : [];
        latestHandoffPackage = sentHandoffPackages[0] || null;
        requestListOpen = Boolean(sentHandoffPackages.length && requestListOpen);
        handoffDialog = null;
        handoffMessage = recalledPackageId
            ? (relayOk || supabaseOk)
                ? `검토 요청 ${recalledPackageId}을 회수했습니다. 주관부서 화면에서도 요청이 비워집니다.`
                : `검토 요청 ${recalledPackageId}을 회수했습니다. 주관부서 화면이 열려 있으면 새로고침해 주세요.`
            : '저장된 검토 요청을 비웠습니다. 필요하면 다시 전달하세요.';
        schedulePriorityDraftSave();
    }

    async function recallAllDepartmentHandoffs() {
        clearStoredDepartmentHandoff(null);
        const [relayOk, supabaseOk] = await Promise.all([
            relayRecallToLeadDepartment(null),
            markPlatformHandoffStatus('priority_to_lead', {
                regionCode,
                status: 'recalled'
            })
        ]);
        sentHandoffPackages = [];
        latestHandoffPackage = null;
        requestListOpen = false;
        handoffDialog = null;
        handoffMessage = (relayOk || supabaseOk)
            ? '주관부서 지원도구에 남아 있는 검토 요청을 모두 비웠습니다.'
            : '로컬 요청 이력을 비웠습니다. 주관부서 화면이 열려 있으면 새로고침해 주세요.';
        schedulePriorityDraftSave();
    }

    function resetActiveAlternative() {
        const nextMessage = '현재 대안의 Risk 분석 결과와 실천권역을 초기화했습니다. 지표 설정을 확인한 뒤 다시 실행하세요.';

        analysisResult = null;
        appliedIndicators = [];
        analysisDone = false;
        analysisMessage = nextMessage;
        parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
        selectedCandidate = 0;
        detailCandidateKey = null;
        focusedCandidate = null;
        mapResetKey += 1;
        activeLayer = 'Risk';
        activeStep = Math.min(activeStep, 2);

        persistAlternative(activeAlternative, {
            id: `alternative-${Date.now()}-${activeAlternative}`,
            status: '검토중'
        });
        handoffMessage = latestHandoffPackage
            ? '현재 대안을 초기화했습니다. 이미 전달한 요청은 필요하면 별도로 회수하세요.'
            : '현재 대안을 초기화했습니다. Risk 분석 후 다시 전달할 수 있습니다.';
        schedulePriorityDraftSave();
    }

    function resetAllAlternatives() {
        handoffDialog = null;
        activeAlternative = 0;
        const baseAlternative = {
            ...createDefaultAlternative(0),
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators)
            },
            analysisMessage: '전체 대안을 초기화했습니다. 지표 설정을 확인한 뒤 Risk 분석을 다시 실행하세요.'
        };
        alternatives = [baseAlternative];
        loadAlternative(0);
        if (sentHandoffPackages.length || latestHandoffPackage) {
            void recallAllDepartmentHandoffs();
        } else {
            clearStoredDepartmentHandoff(null);
        }
        sentHandoffPackages = [];
        latestHandoffPackage = null;
        requestListOpen = false;
        handoffMessage = '전체 대안과 로컬 검토 요청 상태를 초기화했습니다. 새 대안을 구성한 뒤 다시 전달할 수 있습니다.';
        schedulePriorityDraftSave();
    }

    async function handoffToDepartmentPlatform(scope = 'all') {
        const activeSnapshot = {
            ...alternatives[activeAlternative],
            ...currentAlternativeState()
        };
        const sourceAlternatives = alternatives.map((alternative, index) => (
            index === activeAlternative ? activeSnapshot : alternative
        ));
        alternatives = sourceAlternatives;
        const scopedAlternatives = scope === 'current' ? [activeSnapshot] : sourceAlternatives;
        const payload = buildDepartmentHandoffPayload(scopedAlternatives);
        if (!payload.candidates.length) {
            handoffMessage = '전달할 실천권역이 없습니다. Risk 분석 후 실천권역도출하기를 먼저 실행하세요.';
            return;
        }

        const deliveredAt = new Date().toISOString();
        const deliveredPayload = {
            ...payload,
            deliveredToLeadAt: deliveredAt,
            deliveryStatus: 'sent-to-lead',
            reviewNote: handoffNote.trim()
        };
        const handoffJson = JSON.stringify(deliveredPayload);
        try {
            window.localStorage.setItem(DEPARTMENT_HANDOFF_KEY, handoffJson);
        } catch {
            window.sessionStorage.setItem(DEPARTMENT_HANDOFF_KEY, handoffJson);
        }
        window.name = JSON.stringify({
            type: DEPARTMENT_HANDOFF_KEY,
            payload: deliveredPayload
        });
        const [relayOk, inboxOk] = await Promise.all([
            relayHandoffToLeadDepartment(deliveredPayload),
            saveHandoffToLocalInbox(deliveredPayload)
        ]);
        const deliveryOk = relayOk || inboxOk;
        const deliveredAlternativeCount = deliveredPayload.alternatives.filter((alternative) => alternative.candidates?.length).length;
        const packageRecord = {
            packageId: deliveredPayload.packageId,
            deliveredAt,
            alternativeCount: deliveredAlternativeCount,
            candidateCount: deliveredPayload.candidates.length,
            region: deliveredPayload.region,
            hazardLabel: deliveredPayload.hazardLabel,
            relayOk: deliveryOk
        };
        rememberHandoffPackage(packageRecord);
        handoffMessage = deliveryOk
            ? `${deliveredAlternativeCount}개 대안 · ${deliveredPayload.candidates.length}개 후보를 주관부서 지원도구 검토 요청으로 전달했습니다.`
            : `${deliveredAlternativeCount}개 대안 · ${deliveredPayload.candidates.length}개 후보를 로컬에 저장했습니다. 주관부서 페이지가 열려 있지 않으면 새로고침 후 확인하세요.`;
        handoffDialog = {
            alternativeCount: deliveredAlternativeCount,
            candidateCount: deliveredPayload.candidates.length,
            region: deliveredPayload.region,
            hazardLabel: deliveredPayload.hazardLabel,
            deliveredAt,
            packageId: deliveredPayload.packageId,
            relayOk: deliveryOk
        };
        schedulePriorityDraftSave();
    }

    function openHandoffReview() {
        handoffScope = 'all';
        handoffReviewOpen = true;
    }

    function closeHandoffReview() {
        handoffReviewOpen = false;
    }

    function confirmHandoffReview() {
        handoffReviewOpen = false;
        void handoffToDepartmentPlatform(handoffScope);
        handoffNote = '';
    }

    function openIndicatorDialog() {
        indicatorDialog = {
            label: '시연용 생활인구 밀도',
            description: `${region} 행정구역에 맞춘 사용자 정의 100m 격자`,
            group: '노출',
            weight: 1,
            color: indicatorGroupMeta['노출'].color,
            dataMode: 'geotiff',
            pattern: 'urban-core',
            fileName: '',
            uploadedValues: null,
            uploadedMeta: null,
            processing: false,
            error: ''
        };
    }

    function closeIndicatorDialog() {
        indicatorDialog = null;
    }

    function updateIndicatorDialogGroup(group) {
        indicatorDialog = {
            ...indicatorDialog,
            group,
            color: indicatorGroupMeta[group].color,
            error: ''
        };
    }

    function demoNoise(column, row) {
        const value = Math.sin((column + 3) * 12.9898 + (row + 7) * 78.233) * 43758.5453;
        return value - Math.floor(value);
    }

    function createDemoIndicatorValues(pattern) {
        if (!indicatorPreviewGrid?.values?.length) return null;
        const { columns, rows } = indicatorPreviewGrid;
        return indicatorPreviewGrid.values.map((referenceValue, index) => {
            if (!Number.isFinite(Number(referenceValue))) return null;
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = columns > 1 ? column / (columns - 1) : 0.5;
            const y = rows > 1 ? row / (rows - 1) : 0.5;
            const noise = demoNoise(column, row);
            let score;
            if (pattern === 'southwest') {
                score = Math.exp(-(((x - 0.3) ** 2) / 0.055 + ((y - 0.72) ** 2) / 0.08));
            } else if (pattern === 'corridor') {
                score = Math.exp(-((y - (0.78 - x * 0.52)) ** 2) / 0.018) * (0.55 + 0.45 * Math.sin(x * Math.PI));
            } else if (pattern === 'distributed') {
                score = 0.22 + (0.48 * noise) + (0.22 * Math.sin(x * Math.PI * 3) * Math.cos(y * Math.PI * 2));
            } else {
                score = Math.exp(-(((x - 0.52) ** 2) / 0.07 + ((y - 0.47) ** 2) / 0.06));
            }
            return clamp01((score * 0.84) + (noise * 0.16));
        });
    }

    function normalizeUploadedValues(rawValues) {
        if (!indicatorPreviewGrid?.values?.length) throw new Error('기준 100m 격자가 아직 준비되지 않았습니다.');
        if (!Array.isArray(rawValues) || rawValues.length !== indicatorPreviewGrid.values.length) {
            throw new Error(`JSON 값 개수는 현재 격자 ${indicatorPreviewGrid.values.length.toLocaleString()}개와 같아야 합니다.`);
        }
        const numericValues = rawValues.map((value) => value === null ? null : Number(value));
        const finiteValues = numericValues.filter(Number.isFinite);
        if (!finiteValues.length) throw new Error('JSON에서 사용할 수 있는 숫자를 찾지 못했습니다.');
        const minimum = finiteValues.reduce((result, value) => Math.min(result, value), Infinity);
        const maximum = finiteValues.reduce((result, value) => Math.max(result, value), -Infinity);
        const needsNormalization = minimum < 0 || maximum > 1;
        const range = maximum - minimum;
        return numericValues.map((value, index) => {
            if (!Number.isFinite(value) || !Number.isFinite(Number(indicatorPreviewGrid.values[index]))) return null;
            return needsNormalization ? clamp01(range ? (value - minimum) / range : 0.5) : clamp01(value);
        });
    }

    async function readIndicatorGridFile(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            const payload = JSON.parse(await file.text());
            const values = normalizeUploadedValues(Array.isArray(payload) ? payload : payload?.values);
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: values, error: '' };
        } catch (error) {
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, error: error.message || 'JSON 파일을 읽지 못했습니다.' };
        }
    }

    function normalizeProjection(projection) {
        if (typeof projection === 'number') return `EPSG:${projection}`;
        const text = String(projection || '').trim();
        if (!text) return '';
        if (/^\d+$/.test(text)) return `EPSG:${text}`;
        return text.toUpperCase().startsWith('EPSG:') ? text.toUpperCase() : text;
    }

    async function readIndicatorGeoTiff(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (file.size > 250 * 1024 * 1024) {
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, uploadedMeta: null, error: '현재 브라우저 업로드는 250MB 이하 GeoTIFF를 지원합니다.' };
            return;
        }
        indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, uploadedMeta: null, processing: true, error: '' };
        try {
            const { default: parseGeoraster } = await import('georaster');
            proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
            proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
            const raster = await parseGeoraster(await file.arrayBuffer());
            const sourceProjection = normalizeProjection(raster.projection);
            if (!sourceProjection) throw new Error('GeoTIFF 좌표계 정보를 찾지 못했습니다. EPSG 코드가 포함된 파일을 사용해 주세요.');
            const sourceBand = raster.values?.[0];
            if (!sourceBand?.length || !raster.width || !raster.height) throw new Error('첫 번째 밴드의 래스터 값을 읽지 못했습니다.');
            const targetProjection = indicatorPreviewGrid.crs || 'EPSG:5179';
            const sameProjection = normalizeProjection(targetProjection) === sourceProjection;
            const noDataValue = raster.noDataValue;
            const rawValues = indicatorPreviewGrid.values.map((maskValue, index) => {
                if (!Number.isFinite(Number(maskValue))) return null;
                const column = index % indicatorPreviewGrid.columns;
                const row = Math.floor(index / indicatorPreviewGrid.columns);
                const targetX = indicatorPreviewGrid.transform.originX + ((column + 0.5) * indicatorPreviewGrid.transform.pixelWidth);
                const targetY = indicatorPreviewGrid.transform.originY - ((row + 0.5) * indicatorPreviewGrid.transform.pixelHeight);
                const [sourceX, sourceY] = sameProjection
                    ? [targetX, targetY]
                    : proj4(targetProjection, sourceProjection, [targetX, targetY]);
                const sourceColumn = Math.floor((sourceX - raster.xmin) / raster.pixelWidth);
                const sourceRow = Math.floor((raster.ymax - sourceY) / raster.pixelHeight);
                if (sourceColumn < 0 || sourceRow < 0 || sourceColumn >= raster.width || sourceRow >= raster.height) return null;
                const value = Number(sourceBand[sourceRow]?.[sourceColumn]);
                if (!Number.isFinite(value) || (noDataValue !== undefined && noDataValue !== null && value === Number(noDataValue))) return null;
                return value;
            });
            const validCount = rawValues.filter(Number.isFinite).length;
            if (!validCount) throw new Error(`업로드 파일이 ${region} 기준 격자와 겹치지 않습니다. 좌표계와 위치를 확인해 주세요.`);
            const values = normalizeUploadedValues(rawValues);
            indicatorDialog = {
                ...indicatorDialog,
                fileName: file.name,
                uploadedValues: values,
                uploadedMeta: {
                    sourceProjection,
                    targetProjection,
                    sourceSize: `${raster.width.toLocaleString()} × ${raster.height.toLocaleString()}`,
                    validCount,
                    bandCount: raster.numberOfRasters || raster.values.length
                },
                processing: false,
                error: ''
            };
        } catch (error) {
            indicatorDialog = { ...indicatorDialog, uploadedValues: null, uploadedMeta: null, processing: false, error: error.message || 'GeoTIFF 파일을 읽지 못했습니다.' };
        }
    }

    function summarizeCustomValues(values) {
        const finiteValues = values.filter(Number.isFinite);
        if (!finiteValues.length) return 0.5;
        return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
    }

    function addIndicator() {
        if (!indicatorDialog || !indicatorPreviewGrid) return;
        const meta = indicatorGroupMeta[indicatorDialog.group];
        const gridValues = ['json', 'geotiff'].includes(indicatorDialog.dataMode)
            ? indicatorDialog.uploadedValues
            : createDemoIndicatorValues(indicatorDialog.pattern);
        if (!gridValues) {
            indicatorDialog = { ...indicatorDialog, error: '먼저 사용할 격자 데이터를 준비해 주세요.' };
            return;
        }
        const item = {
            id: `custom-${Date.now()}`,
            icon: meta.icon,
            label: indicatorDialog.label.trim(),
            description: indicatorDialog.description.trim() || `${region} 사용자 정의 지표`,
            dimension: meta.dimension,
            group: indicatorDialog.group,
            weight: Math.max(0.1, Number(indicatorDialog.weight) || 1),
            direction: meta.direction,
            enabled: true,
            dataStatus: 'available',
            sourceType: indicatorDialog.dataMode === 'geotiff' ? 'user-geotiff-100m' : indicatorDialog.dataMode === 'json' ? 'user-json-100m' : 'demo-grid-100m',
            sourceLabel: ['json', 'geotiff'].includes(indicatorDialog.dataMode) ? indicatorDialog.fileName : '임시 시연 데이터',
            sourceMeta: indicatorDialog.uploadedMeta,
            supportedGridUnits: ['100m'],
            value: summarizeCustomValues(gridValues),
            color: indicatorDialog.color,
            gridValues,
            gridMeta: {
                gridUnit: indicatorPreviewGrid.gridUnit,
                columns: indicatorPreviewGrid.columns,
                rows: indicatorPreviewGrid.rows,
                extent: indicatorPreviewGrid.extent,
                transform: indicatorPreviewGrid.transform,
                crs: indicatorPreviewGrid.crs
            },
            regionCode,
            custom: true
        };
        indicators = [...indicators, item];
        loadedPreviewIndicators = [...loadedPreviewIndicators, item];
        activeLayer = meta.dimension;
        markAnalysisDirty(`${item.label} 지표가 ${item.group}에 추가되었습니다. 지도에서 확인한 뒤 Risk 분석을 실행하세요.`);
        closeIndicatorDialog();
    }

    function addAlternative() {
        persistAlternative(activeAlternative);
        const nextIndex = alternatives.length;
        const nextOptionNumber = alternatives.reduce((largestNumber, alternative) => {
            const matchedNumber = String(alternative?.name || '').match(/대안\s*(\d+)/);
            const optionNumber = matchedNumber ? Number(matchedNumber[1]) : 0;
            return Math.max(largestNumber, optionNumber);
        }, 0) + 1;
        const nextAlternative = {
            name: `대안${nextOptionNumber}`,
            status: '검토중',
            description: '새 기후적응실천권역 대안',
            id: `alternative-${Date.now()}`,
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators)
            },
            analysisResult: null,
            appliedIndicators: [],
            analysisDone: false,
            analysisMessage: '새 대안이 추가되었습니다. 설정을 확인한 뒤 Risk 분석을 실행하세요.',
            parcelCandidateMessage: 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.',
            selectedCandidate: 0,
            detailCandidateKey: null,
            activeLayer: 'Risk'
        };
        alternatives = [
            ...alternatives,
            nextAlternative
        ];
        activeAlternative = nextIndex;
        loadAlternative(nextIndex);
        schedulePriorityDraftSave();
    }

    function deleteAlternativeAt(index) {
        if (alternatives.length <= 1) {
            const replacementAlternative = {
                ...createDefaultAlternative(0),
                settings: {
                    gridUnit,
                    dimensionWeights: { ...dimensionWeights },
                    indicators: cloneIndicatorsForAlternative(indicators)
                },
                analysisMessage: '마지막 대안을 삭제하고 새로운 대안1을 만들었습니다.'
            };
            alternatives = [replacementAlternative];
            activeAlternative = 0;
            loadAlternative(0);
            handoffMessage = '마지막 대안을 삭제하고 새로운 대안1을 만들었습니다.';
            schedulePriorityDraftSave();
            return;
        }

        const deletedAlternative = alternatives[index];
        const wasActive = index === activeAlternative;
        const nextAlternatives = alternatives.filter((_, alternativeIndex) => alternativeIndex !== index);
        const nextIndex = wasActive
            ? Math.min(index, nextAlternatives.length - 1)
            : index < activeAlternative
                ? activeAlternative - 1
                : activeAlternative;
        alternatives = nextAlternatives;
        activeAlternative = nextIndex;
        if (wasActive) loadAlternative(nextIndex);
        handoffMessage = latestHandoffPackage
            ? `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다. 이미 전달한 요청은 필요하면 별도로 회수하세요.`
            : `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다.`;
        schedulePriorityDraftSave();
    }

    function requestDeleteAlternative(index) {
        if (alternatives.length <= 1) return;
        pendingDeleteIndex = index;
    }

    function cancelDeleteAlternative() {
        pendingDeleteIndex = null;
    }

    function confirmDeleteAlternative() {
        if (pendingDeleteIndex === null) return;
        deleteAlternativeAt(pendingDeleteIndex);
        pendingDeleteIndex = null;
    }

    function confirmAlternative() {
        persistAlternative(activeAlternative);
        alternatives = alternatives.map((alternative, index) => ({
            ...alternative,
            status: index === activeAlternative ? '선정' : alternative.status === '선정' ? '검토완료' : alternative.status
        }));
        activeStep = 5;
        schedulePriorityDraftSave();
    }

    async function setActiveGridLayer(layer) {
        activeLayer = layer;
        persistAlternative(activeAlternative, { activeLayer: layer });
        schedulePriorityDraftSave();

        if (analysisDone || !['H', 'E', 'V'].includes(layer)) return;
        const groups = layer === 'H'
            ? ['기후위험']
            : layer === 'E'
                ? ['노출']
                : ['민감도', '적응역량'];
        const targets = indicators.filter((item) => item.enabled && groups.includes(item.group));
        const loaded = await loadIndicatorInputs(
            targets.map((item) => ({ ...item })),
            loadedPreviewIndicators,
            { preferDense: true }
        );
        const loadedById = new Map(loadedPreviewIndicators.map((item) => [item.id, item]));
        loaded.forEach((item) => loadedById.set(item.id, item));
        loadedPreviewIndicators = [...loadedById.values()];
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
    }

    function downloadConfig() {
        const payload = {
            projectName,
            region,
            regionCode,
            hazard,
            gridUnit,
            formula: 'Weighted geometric mean of H/E/V',
            commonDataItems: config.commonDataItems,
            dataBundle,
            dimensionWeights,
            indicators,
            analysisResult,
            alternatives,
            decidedAlternative
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'indicator_config.json';
        link.click();
        URL.revokeObjectURL(url);
    }
</script>

<svelte:head>
    <title>Climate Risk Lab | {config.label} H/E/V 위험평가</title>
    <meta name="description" content={config.label + ' H/E/V 기반 기후위험 평가 및 의사결정 지원 도구'} />
</svelte:head>

<div class="app-shell">
    <header class="topbar">
        <div class="brand">
            <div class="brand-mark">CR</div>
            <div>
                <strong>Climate Risk Lab</strong>
                <span>기후위험(H)·노출(E)·취약성(V) 기반 우선 대응지 선정</span>
            </div>
        </div>
        <div class="project-meta">
            <div><span>프로젝트</span><strong>{projectName}</strong></div>
            <a class="ghost-link" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
            <button class="ghost-button" onclick={downloadConfig}>설정 내보내기</button>
            <div class="request-manager">
                <button type="button" class="request-manager-toggle ghost-button" onclick={() => requestListOpen = !requestListOpen}>보낸 요청 <span class="request-manager-count">{sentRequestCount}</span></button>
                {#if requestListOpen}
                    <div class="request-manager-panel">
                        <div><strong>보낸 검토 요청</strong><small>초기화 후에도 이 목록에서 요청을 취소할 수 있습니다.</small></div>
                        {#if sentHandoffPackages.length}
                            <ul>{#each sentHandoffPackages as request}<li><div><b>{request.hazardLabel || config.label} · {request.region || region}</b><span>{request.alternativeCount || 0}개 대안 · {request.candidateCount || 0}개 후보 · {formatHandoffTime(request.deliveredAt)}</span><small>{request.packageId}</small></div><button type="button" onclick={() => recallDepartmentHandoff(request)}>취소</button></li>{/each}</ul>
                            <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>전체 요청 취소</button>
                        {:else}
                            <p>현재 도구에 기록된 요청은 없습니다.</p>
                            <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>주관부서 요청 비우기</button>
                        {/if}
                    </div>
                {/if}
            </div>
            <div class="avatar">관리</div>
        </div>
    </header>

    <div class="workspace">
        <main class="main">
            <section class="hero">
                <div class="hero-actions">
                    {#if nationalLab}
                        <label>시·도
                            <select value={selectedSido} onchange={(event) => setNationalSido(event.currentTarget.value)}>
                                {#each sidos as sido}
                                    <option value={sido}>{sido}</option>
                                {/each}
                            </select>
                        </label>
                        <label>시·군·구
                            <select value={regionCode} onchange={(event) => setNationalRegion(event.currentTarget.value)}>
                                {#each availableRegions as regionOption}
                                    <option value={regionOption.code}>{getSigunguLabel(regionOption)}</option>
                                {/each}
                            </select>
                        </label>
                        <label>선택 행정구역<input value={`${region} · ${regionCode}`} readonly /></label>
                        <small>{config.sampleNotice}</small>
                    {/if}
                </div>
            </section>

            {#if nationalLab}
                <section class="lab-analysis-runner" class:complete={analysisDone} aria-label="기후위험 실험실 분석 실행">
                    <div class="lab-analysis-runner-copy">
                        <span>기존 실천권역 분석 기능</span>
                        <strong>{region} · {hazardDatasetMode === 'observed' ? '2021~2025 최근 5년' : `${hazardScenario.toUpperCase()} ${hazardFuturePeriod}`}</strong>
                        <small>{analysisDone ? analysisMessage : 'H01~H10 기후위험 지표와 기존 노출·취약성·적응역량 지표를 결합해 Risk를 계산합니다.'}</small>
                    </div>
                    <div class="lab-analysis-flow" aria-label="분석 흐름">
                        <span class:active={!analysisDone}><b>1</b> Risk 분석</span>
                        <i aria-hidden="true">→</i>
                        <span class:active={analysisDone}><b>2</b> 실천권역 도출</span>
                        <i aria-hidden="true">→</i>
                        <span><b>3</b> 유형별 실천지구</span>
                    </div>
                    <button type="button" onclick={runAnalysis} disabled={running}>
                        {running ? 'Risk 계산 중...' : analysisDone ? 'Risk 다시 분석하기' : 'Risk 분석 실행'}
                    </button>
                </section>
            {/if}

            <section class="workspace-split">
                <div class="left-panel">
                    <div class="left-panel-tabs" role="tablist" aria-label="좌측 패널 탭">
                        <button type="button" role="tab" class:active={leftPanelTab === '01'} aria-selected={leftPanelTab === '01'} onclick={() => (leftPanelTab = '01')}>01 분석 지표 선택</button>
                        <button type="button" role="tab" class:active={leftPanelTab === '03'} aria-selected={leftPanelTab === '03'} onclick={() => (leftPanelTab = '03')}>03 실천권역 구성</button>
                    </div>
                    {#if leftPanelTab === '01'}
                    <div class="analysis-fixed-bar">
                        <div class="fixed-block fixed-block-options">
                            <span class="fixed-block-title">분석 옵션</span>
                            <div class="analysis-fixed-selects">
                            <label>기후위험 기준기간
                                <select value={hazardDatasetMode} onchange={(event) => setHazardDatasetMode(event.currentTarget.value)}>
                                    <option value="observed">최근 5년 · 2021~2025</option>
                                    <option value="future" disabled={hazard !== 'heatwave'}>미래 시나리오 · 2026~2100</option>
                                </select>
                            </label>
                            {#if hazardDatasetMode === 'future'}
                                <label>SSP 시나리오
                                    <select value={hazardScenario} onchange={(event) => setHazardScenario(event.currentTarget.value)}>
                                        {#each hazardScenarios as scenario}
                                            <option value={scenario}>{scenario.toUpperCase()}</option>
                                        {/each}
                                    </select>
                                </label>
                                <label>미래 기간
                                    <select value={hazardFuturePeriod} onchange={(event) => setHazardFuturePeriod(event.currentTarget.value)}>
                                        {#each hazardFuturePeriods as period}
                                            <option value={period}>{period}</option>
                                        {/each}
                                    </select>
                                </label>
                            {/if}
                            <label>격자 크기
                                <select value={gridUnit} onchange={(event) => setGridUnit(event.currentTarget.value)}>
                                    {#each gridOptions as option}
                                        <option value={option}>{option}</option>
                                    {/each}
                                </select>
                            </label>
                            </div>
                        </div>

                        <div class="fixed-block fixed-block-alternative">
                            <div class="fixed-row-alt">
                                <span class="fixed-row-alt-name" class:flash={alternativeFlash}>
                                    <svg class="fixed-row-alt-icon" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.443a1.125 1.125 0 0 0-1.006 0L3.622 5.88C3.24 6.07 3 6.462 3 6.887V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                    {alternatives[activeAlternative]?.name || '대안'}
                                </span>
                                <button class="outline-button" onclick={openIndicatorDialog}>+ 사용자 지표</button>
                            </div>
                            <div class="fixed-row-divider"></div>
                            <div class="analysis-fixed-summary">
                                <div class="fixed-summary-left">
                                    <div class="fixed-row-clear">
                                        <span class="fixed-row-label">현재 선택된 지표</span>
                                        <button type="button" class="clear-all-link" onclick={clearAllIndicators} disabled={!enabledCount}>모두 지우기</button>
                                    </div>
                                    <div class="hev-pills" aria-label="H E V 선택 지표 수">
                                        <span class="hev-pill hev-pill-h"><span class="hev-pill-label">H</span><span class="hev-pill-count">{dimensionSelectedCounts.H}</span></span>
                                        <span class="hev-pill hev-pill-e"><span class="hev-pill-label">E</span><span class="hev-pill-count">{dimensionSelectedCounts.E}</span></span>
                                        <span class="hev-pill hev-pill-v"><span class="hev-pill-label">V</span><span class="hev-pill-count">{dimensionSelectedCounts.V}</span></span>
                                    </div>
                                </div>
                                <button class="primary run-analysis-button" onclick={runAnalysis} disabled={running}>
                                    <svg class="run-analysis-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5v15l13-7.5Z" fill="#fff" /></svg>
                                    {running ? '계산 중...' : 'Risk 분석 실행'}
                                </button>
                            </div>
                        </div>
                        <span class="sr-only" aria-live="polite" data-analysis-message>{analysisMessage}</span>
                    </div>
                    {/if}
                    <div class="left-panel-body">
                    {#if leftPanelTab === '01'}
                    <div class="panel indicator-panel">
                    {#each ['기후위험', '노출', '민감도', '적응역량'] as group}
                        <div class="indicator-group" class:collapsed={!groupExpanded[group]}>
                            <button type="button" class="group-label" style={`--group-dim-color:${groupDimensionColorVar(group)}`} aria-expanded={groupExpanded[group]} onclick={() => toggleGroupExpanded(group)}>
                                <span class="group-chevron" aria-hidden="true">▾</span><span class="group-name">{group} ({indicatorGroupMeta[group].english})</span>
                                {#if !groupExpanded[group] && collapsedGroupSummary(group)}<span class="group-collapsed-summary">{collapsedGroupSummary(group)}</span>{/if}
                                <span class="group-count">{selectedIndicatorsFor(group).length}/{indicators.filter((item) => item.group === group && isIndicatorAvailable(item)).length} 사용</span>
                            </button>
                            {#if groupExpanded[group]}
                            {#each indicators.filter((item) => item.group === group) as item}
                                <div class="indicator-item" class:disabled={!item.enabled} class:unavailable={!isIndicatorAvailable(item)}>
                                    <input
                                        type="checkbox"
                                        checked={item.enabled}
                                        disabled={!isIndicatorAvailable(item)}
                                        onchange={(event) => setIndicatorEnabled(item.id, event.currentTarget.checked)}
                                    />
                                    <div class="indicator-icon" style={`--icon-color:${item.color}`}>
                                        {#if item.iconPath}<img src={item.iconPath} alt="" />{:else}{item.icon}{/if}
                                    </div>
                                    <div class="indicator-copy">
                                        <span class="indicator-name-row"><strong>{item.label}</strong><button type="button" class="info-toggle" class:active={expandedDescriptions[item.id]} aria-expanded={!!expandedDescriptions[item.id]} aria-label={`${item.label} 설명 ${expandedDescriptions[item.id] ? '닫기' : '보기'}`} onclick={() => toggleIndicatorDescription(item.id)}>ⓘ</button></span>
                                        <span class="indicator-description-wrap" class:open={expandedDescriptions[item.id]}><span>{indicatorStatusText(item)} · {item.description}</span></span>
                                    </div>
                                    <div class="dimension-tag" title={item.group === '적응역량' ? '값이 높을수록 위험도가 낮아집니다' : '값이 높을수록 위험도가 높아집니다'}>{item.dimension}{item.group === '적응역량' ? '-' : '+'}</div>
                                    <div class="weight">가중치<div class="weight-stepper"><button type="button" class="weight-stepper-btn" aria-label={`${item.label} 가중치 감소`} disabled={item.weight <= 0} onclick={() => adjustIndicatorWeight(item.id, -0.1)}>−</button><span class="weight-stepper-value">{Number(item.weight).toFixed(1)}</span><button type="button" class="weight-stepper-btn" aria-label={`${item.label} 가중치 증가`} disabled={item.weight >= 3} onclick={() => adjustIndicatorWeight(item.id, 0.1)}>+</button></div></div>
                                </div>
                            {/each}
                            {/if}
                        </div>
                    {/each}
                    </div>
                    {:else}
                    <section class="panel candidates wide-candidates">
                        <div class="panel-head">
                            <div>
                                <span class="section-number">03</span>
                                <span class="indicator-name-row">
                                    <h2>실천권역 구성</h2>
                                    <button
                                        type="button"
                                        class="info-toggle"
                                        class:active={candidatesInfoOpen}
                                        aria-expanded={candidatesInfoOpen}
                                        aria-label={`실천권역 구성 설명 ${candidatesInfoOpen ? '닫기' : '보기'}`}
                                        onclick={() => candidatesInfoOpen = !candidatesInfoOpen}
                                    >ⓘ</button>
                                </span>
                                <div class="indicator-description-wrap" class:open={candidatesInfoOpen}>
                                    <span>{analysisDone ? parcelCandidateMessage : 'Risk 분석 후 지도에서 실천권역도출하기를 실행하면 실천권역을 구성하는 유형별 실천지구가 표시됩니다.'}</span>
                                </div>
                            </div>
                            <span class="count-badge">실천지구 {candidateList.length}개</span>
                        </div>
                        {#if candidateList.length}
                            <div class="practice-type-note">
                                <strong>시연용 분류 v1</strong>
                                <span>공간 규모가 큰 권역은 계획행정수단, Risk 집중 권역은 시설지원사업, 소규모 생활권은 시민실천으로 임시 분류했습니다.</span>
                            </div>
                            <div class="practice-district-groups">
                                {#each practiceDistrictGroups as group}
                                    <section class="practice-district-group" style={`--practice-color:${group.color};--practice-fill:${group.fillColor}`}>
                                        <header>
                                            <i aria-hidden="true"></i>
                                            <span><strong>{group.label}</strong><small>{group.shortDescription}</small></span>
                                            <b>{group.candidates.length}개</b>
                                        </header>
                                        <div class="candidate-list">
                                            {#each group.candidates as candidate}
                                                {@const index = candidateList.findIndex((item) => candidateIdentity(item) === candidateIdentity(candidate))}
                                                <article class="candidate-card" class:active={selectedCandidate === index}>
                                                    <button class="candidate-main" type="button" onclick={() => selectCandidate(candidate, index)}>
                                                        <span class="rank">{String(candidate.districtNumber || candidate.rank).padStart(2, '0')}</span>
                                                        <span class="candidate-name-row"><strong>{candidate.name}</strong><small>{candidate.area}</small></span>
                                                        <b>{formatScore(candidate.risk)}</b>
                                                    </button>
                                                    <button class="candidate-detail-toggle" type="button" title="분류 사유 보기" aria-label={`${candidate.name} 분류 사유 보기`} onclick={() => showCandidateDetail(candidate, index)}>!</button>
                                                </article>
                                            {/each}
                                        </div>
                                    </section>
                                {/each}
                            </div>
                            {#if detailCandidateItem}
                                <aside class="candidate-detail-panel" aria-label="실천지구 분류 상세보기" style={`--practice-color:${detailCandidateItem.practiceTypeColor}`}>
                                    <div>
                                        <span>실천지구 분류 사유 · 시연용</span>
                                        <strong>{detailCandidateItem.name}</strong>
                                        <em>{detailCandidateItem.practiceTypeLabel}</em>
                                        <small>{detailCandidateItem.classificationReason}</small>
                                        <small class="classification-rule">적용 규칙: {detailCandidateItem.classificationRule}</small>
                                    </div>
                                    <dl>
                                        <div><dt>총 필지 면적</dt><dd>{candidateTotalAreaLabel(detailCandidateItem)}</dd></div>
                                        <div><dt>필지 수</dt><dd>{formatInteger(detailCandidateItem.parcelCount)}필지</dd></div>
                                        <div><dt>Risk</dt><dd>{formatScore(detailCandidateItem.risk)}</dd></div>
                                        <div><dt>H</dt><dd>{formatScore(detailCandidateItem.h)}</dd></div>
                                        <div><dt>E</dt><dd>{formatScore(detailCandidateItem.e)}</dd></div>
                                        <div><dt>V</dt><dd>{formatScore(detailCandidateItem.v)}</dd></div>
                                    </dl>
                                </aside>
                            {/if}
                        {:else}
                            <div class="empty-candidate-state">
                                <strong>실천권역 도출 대기</strong>
                                <span>Risk 분석과 실천권역 도출이 끝나면 실천권역을 구성하는 실제 핫스팟-필지 교차 실천지구가 3개 시연 유형으로 표시됩니다.</span>
                            </div>
                        {/if}
                    </section>
                    {/if}
                    </div>
                </div>

                <div class="right-map-column">
                    <div class="panel analysis-map-panel">
                        <div class="panel-head map-head">
                            <div><span class="section-number">02</span><h2>분석 지도</h2></div>
                            <div class="panel-head-actions">
                                <span class="handoff-request-wrap">
                                    <button class="add-button handoff-request-button" onclick={openHandoffReview} disabled={!handoffCandidateCount}>주관부서 지원도구로 검토 요청</button>
                                    <span class="handoff-request-tooltip" role="tooltip">{latestHandoffPackage ? '전달 완료' : handoffCandidateCount ? '전달 가능' : '실천권역 도출 후 요청 가능'}</span>
                                </span>
                            </div>
                        </div>
                        <div class="map-actions-band">
                                <div class="database-actions">
                                    <label>
                                        <span>작업자</span>
                                        <input bind:value={operatorName} placeholder="이름 또는 부서" aria-label="Supabase 저장 작업자" />
                                    </label>
                                    <button class="db-save-action" onclick={saveCurrentDraftToSupabase} disabled={supabaseBusy}>
                                        {supabaseBusy ? '처리 중' : '저장'}
                                    </button>
                                    <button class="db-load-action" onclick={toggleSupabaseHistory} disabled={supabaseBusy}>
                                        {supabaseHistoryOpen ? '목록닫기' : '불러오기'}
                                    </button>
                                    <span>{supabaseStatus}</span>
                                </div>
                                <div class="handoff-actions">
                                    <div class="handoff-button-row">
                                        <button class="secondary-action" onclick={recallDepartmentHandoff} disabled={!latestHandoffPackage}>요청 취소</button>
                                        <button class="secondary-action muted" onclick={resetAllAlternatives}>모든 대안 삭제</button>
                                    </div>
                                </div>
                        </div>
                        <div class="map-tabs-row">
                            <div class="alternative-tabs browser-tabs" aria-label="기후적응실천권역 대안">
                                {#each alternatives as alternative, index}
                                    <div class="browser-tab" class:active={activeAlternative === index}>
                                        <button class="browser-tab-select" onclick={() => switchAlternative(index)}>
                                            <span class="browser-tab-label">
                                                <span class="browser-tab-name">{alternative.name}</span>
                                                {#if alternative.description}<span class="browser-tab-desc">{alternative.description}</span>{/if}
                                            </span>
                                            <small>{alternativeStatusLabel(alternative)}</small>
                                        </button>
                                        <button
                                            class="browser-tab-close"
                                            onclick={(event) => { event.stopPropagation(); requestDeleteAlternative(index); }}
                                            disabled={alternatives.length <= 1}
                                            title="{alternative.name} 삭제"
                                            aria-label="{alternative.name} 삭제"
                                        >×</button>
                                    </div>
                                {/each}
                                <button class="browser-tab-add" onclick={addAlternative} title="대안 추가" aria-label="대안 추가">+</button>
                            </div>
                        </div>
                        {#if pendingDeleteIndex !== null}
                            <div class="alt-delete-confirm-backdrop" onclick={cancelDeleteAlternative}>
                                <div class="alt-delete-confirm" role="dialog" aria-modal="true" aria-label="대안 삭제 확인" onclick={(event) => event.stopPropagation()}>
                                    <p>'{alternatives[pendingDeleteIndex]?.name}'을(를) 삭제하시겠습니까?<br />대안 데이터가 사라지며 되돌릴 수 없습니다.</p>
                                    <div class="alt-delete-confirm-actions">
                                        <button class="secondary-action" onclick={cancelDeleteAlternative}>취소</button>
                                        <button class="secondary-action danger" onclick={confirmDeleteAlternative}>삭제</button>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        <div class="map-result-wrap">
                            <SelectedRegionMap
                                {regionCode}
                                regionName={region}
                                {hazard}
                                height="100%"
                                showCadastral={false}
                                analysisIndicators={analysisDone ? appliedIndicators : previewAnalysisIndicators}
                                riskGrid={analysisResult?.gridResult || indicatorPreviewGrid}
                                activeGridLayer={activeLayer}
                                onGridLayerChange={setActiveGridLayer}
                                showAnalysisLegend={true}
                                parcelCandidates={analysisResult?.parcelCandidates || []}
                                candidateContextKey={activeAlternativeId}
                                {mapResetKey}
                                {focusedCandidate}
                                onParcelCandidatesChange={handleParcelCandidates}
                                onParcelCandidateFocus={handleMapParcelCandidateFocus}
                                onParcelDerivationComplete={handleParcelDerivationComplete}
                            />
                        </div>
                    </div>
                </div>
            </section>

        </main>
    </div>
</div>

{#if indicatorDialog}
    <div class="indicator-modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeIndicatorDialog()}>
        <section class="indicator-modal" role="dialog" aria-modal="true" aria-labelledby="indicator-modal-title">
            <header>
                <div>
                    <span>CUSTOM INDICATOR</span>
                    <h2 id="indicator-modal-title">새 분석 지표 추가</h2>
                    <p>{region} · 행정구역 코드 {regionCode} · 현재 100m 기준 격자</p>
                </div>
                <button type="button" class="indicator-modal-close" aria-label="닫기" onclick={closeIndicatorDialog}>×</button>
            </header>

            <div class="indicator-modal-grid">
                <label class="indicator-wide-field">지표 이름
                    <input bind:value={indicatorDialog.label} placeholder="예: 취약계층 이용시설 밀도" />
                </label>
                <label class="indicator-wide-field">설명
                    <textarea bind:value={indicatorDialog.description} rows="2" placeholder="지표의 의미와 출처를 적어주세요."></textarea>
                </label>
                <label>리스크 구성요소
                    <select value={indicatorDialog.group} onchange={(event) => updateIndicatorDialogGroup(event.currentTarget.value)}>
                        {#each Object.keys(indicatorGroupMeta) as group}
                            <option value={group}>{group} ({indicatorGroupMeta[group].english})</option>
                        {/each}
                    </select>
                </label>
                <label>분석 가중치
                    <input type="number" min="0.1" max="10" step="0.1" bind:value={indicatorDialog.weight} />
                </label>
                <label>범례 색상
                    <input class="indicator-color-input" type="color" bind:value={indicatorDialog.color} />
                </label>
                <label>데이터 입력 방식
                    <select bind:value={indicatorDialog.dataMode} onchange={() => indicatorDialog = { ...indicatorDialog, error: '' }}>
                        <option value="geotiff">GeoTIFF 실제 레이어</option>
                        <option value="demo">임시 데이터로 시연</option>
                        <option value="json">100m 격자 JSON</option>
                    </select>
                </label>
            </div>

            <div class="indicator-data-box">
                {#if indicatorDialog.dataMode === 'demo'}
                    <div class="indicator-data-heading">
                        <div><strong>임시 공간 패턴</strong><span>현재 수원시 경계 안에서 바로 시각화됩니다.</span></div>
                        <span class="indicator-demo-badge">DEMO</span>
                    </div>
                    <div class="indicator-pattern-grid">
                        {#each [
                            ['urban-core', '도심 집중', '중심부가 높고 외곽으로 감소'],
                            ['southwest', '남서부 집중', '남서 생활권에 높은 값 배치'],
                            ['corridor', '축·회랑형', '대각선 교통축을 따라 분포'],
                            ['distributed', '분산형', '여러 생활권에 불규칙 분포']
                        ] as pattern}
                            <button type="button" class:active={indicatorDialog.pattern === pattern[0]} onclick={() => indicatorDialog = { ...indicatorDialog, pattern: pattern[0] }}>
                                <strong>{pattern[1]}</strong><span>{pattern[2]}</span>
                            </button>
                        {/each}
                    </div>
                {:else if indicatorDialog.dataMode === 'geotiff'}
                    <div class="indicator-data-heading">
                        <div><strong>GeoTIFF 실제 레이어 업로드</strong><span>첫 번째 밴드를 읽어 현재 {region} 100m 격자로 자동 변환합니다.</span></div>
                        <span class:ready={Boolean(indicatorDialog.uploadedValues)} class="indicator-demo-badge">{indicatorDialog.processing ? 'READING' : indicatorDialog.uploadedValues ? 'READY' : 'TIF'}</span>
                    </div>
                    <label class="indicator-file-drop">
                        <input type="file" accept=".tif,.tiff,image/tiff,image/geotiff" onchange={readIndicatorGeoTiff} disabled={indicatorDialog.processing} />
                        <strong>{indicatorDialog.processing ? 'GeoTIFF를 읽고 격자를 변환하는 중…' : indicatorDialog.fileName || 'TIF / TIFF 파일 선택'}</strong>
                        <span>EPSG:5179·5186·4326 및 좌표계 정의가 포함된 GeoTIFF · 최대 250MB</span>
                    </label>
                    {#if indicatorDialog.uploadedMeta}
                        <div class="indicator-file-meta">
                            <span>원본 {indicatorDialog.uploadedMeta.sourceProjection}</span>
                            <span>{indicatorDialog.uploadedMeta.sourceSize}px</span>
                            <span>밴드 {indicatorDialog.uploadedMeta.bandCount}개</span>
                            <span>수원시 유효 셀 {indicatorDialog.uploadedMeta.validCount.toLocaleString()}개</span>
                        </div>
                    {/if}
                {:else}
                    <div class="indicator-data-heading">
                        <div><strong>100m 격자 JSON 업로드</strong><span>숫자 배열 또는 <code>{`{ "values": [...] }`}</code> 형식을 지원합니다.</span></div>
                        <span class:ready={Boolean(indicatorDialog.uploadedValues)} class="indicator-demo-badge">{indicatorDialog.uploadedValues ? 'READY' : 'JSON'}</span>
                    </div>
                    <label class="indicator-file-drop">
                        <input type="file" accept=".json,application/json" onchange={readIndicatorGridFile} />
                        <strong>{indicatorDialog.fileName || 'JSON 파일 선택'}</strong>
                        <span>현재 기준 격자와 같은 {indicatorPreviewGrid?.values?.length?.toLocaleString() || 0}개 값이 필요합니다.</span>
                    </label>
                {/if}
                {#if indicatorDialog.error}<p class="indicator-modal-error">{indicatorDialog.error}</p>{/if}
            </div>

            <div class="indicator-effect-summary">
                <span style={`--indicator-color:${indicatorDialog.color}`}></span>
                <div>
                    <strong>{indicatorDialog.group} ({indicatorGroupMeta[indicatorDialog.group].english}) · {indicatorGroupMeta[indicatorDialog.group].dimension}</strong>
                    <p>{indicatorDialog.group === '적응역량' ? '값이 높을수록 취약성(V)을 낮추는 방향으로 계산합니다.' : '값이 높을수록 해당 구성요소의 위험 점수를 높이는 방향으로 계산합니다.'}</p>
                </div>
            </div>

            <footer>
                <button type="button" class="indicator-cancel-button" onclick={closeIndicatorDialog}>취소</button>
                <button type="button" class="indicator-submit-button" onclick={addIndicator} disabled={!indicatorPreviewGrid || !indicatorDialog.label.trim() || indicatorDialog.processing || (['json', 'geotiff'].includes(indicatorDialog.dataMode) && !indicatorDialog.uploadedValues)}>
                    지도에 추가
                </button>
            </footer>
        </section>
    </div>
{/if}

{#if supabaseSaveDialog}
    <div class="save-progress-modal-backdrop" role="presentation">
        <div class="save-progress-modal" role="dialog" aria-modal="true" aria-labelledby="save-progress-title">
            <span class:running={supabaseSaveDialog.state === 'saving'} class:success={supabaseSaveDialog.state === 'success'} class:error={supabaseSaveDialog.state === 'error'} class="save-progress-mark">
                {supabaseSaveDialog.state === 'saving' ? '' : supabaseSaveDialog.state === 'success' ? '✓' : '!'}
            </span>
            <h2 id="save-progress-title">{supabaseSaveDialog.title}</h2>
            <p>{supabaseSaveDialog.message}</p>
            {#if supabaseSaveDialog.state === 'saving'}
                <div class="save-progress-bar"><i></i></div>
                <small>창을 닫지 말고 잠시 기다려 주세요.</small>
            {:else}
                <button type="button" onclick={() => supabaseSaveDialog = null}>확인</button>
            {/if}
        </div>
    </div>
{/if}

{#if supabaseHistoryOpen}
    <div class="saved-draft-modal-backdrop" role="presentation" onclick={(event) => {
        if (event.currentTarget === event.target) supabaseHistoryOpen = false;
    }}>
        <div class="saved-draft-modal" role="dialog" aria-modal="true" aria-labelledby="saved-draft-modal-title">
            <header>
                <div>
                    <span>SUPABASE HISTORY</span>
                    <h2 id="saved-draft-modal-title">저장본 불러오기</h2>
                    <p>{region} · {config.label} 작업 이력</p>
                </div>
                <button type="button" class="saved-draft-close" aria-label="저장 이력 닫기" onclick={() => supabaseHistoryOpen = false}>×</button>
            </header>
            <div class="saved-draft-table-head" aria-hidden="true">
                <span>제목</span>
                <span>작성자</span>
                <span>날짜</span>
            </div>
            <div class="saved-draft-rows" aria-label="Supabase 저장 이력">
                {#if supabaseBusy}
                    <p class="saved-draft-empty">저장 이력을 불러오는 중입니다.</p>
                {:else if supabaseDrafts.length}
                    {#each supabaseDrafts as savedDraft}
                        <button type="button" class="saved-draft-row" onclick={() => loadSupabaseDraft(savedDraft)}>
                            <span>
                                <strong>{savedDraft.set_name || savedDraft.analysis_version || '제목 없는 저장본'}</strong>
                                <small>{savedDraft.analysis_version || '버전 미기록'}</small>
                            </span>
                            <span>{savedDraft.created_by_user || '작업자 미기록'}</span>
                            <time>{new Date(savedDraft.created_at).toLocaleString('ko-KR')}</time>
                        </button>
                    {/each}
                {:else}
                    <p class="saved-draft-empty">불러올 Supabase 저장본이 없습니다.</p>
                {/if}
            </div>
            <footer>
                <span>{supabaseStatus}</span>
                <button type="button" onclick={refreshSupabaseDrafts} disabled={supabaseBusy}>
                    {supabaseBusy ? '조회 중' : '새로고침'}
                </button>
            </footer>
        </div>
    </div>
{/if}

{#if handoffReviewOpen}
    <div class="handoff-review-modal-backdrop" onclick={(event) => event.target === event.currentTarget && closeHandoffReview()}>
        <section class="handoff-review-modal" role="dialog" aria-modal="true" aria-labelledby="handoff-review-title">
            <header>
                <h2 id="handoff-review-title">주관부서 지원도구로 검토 요청</h2>
                <button type="button" class="handoff-review-close" onclick={closeHandoffReview} aria-label="닫기">×</button>
            </header>
            <div class="handoff-review-body">
                <div class="handoff-review-row">
                    <span>대상 지역·재해</span>
                    <strong>{region} · {config.label}</strong>
                    <small>행정구역 코드 {regionCode}</small>
                </div>
                <div class="handoff-review-row">
                    <span>분석 조건</span>
                    <strong>{hazardDatasetMode === 'observed' ? '최근 5년 · 2021~2025' : `${hazardScenario.toUpperCase()} · ${hazardFuturePeriod}`}</strong>
                    <small>{gridUnit} 격자 · 지표 {enabledCount}개 사용</small>
                </div>
                <fieldset class="handoff-review-scope">
                    <legend>전달 범위</legend>
                    <label>
                        <input type="radio" name="handoff-scope" value="current" checked={handoffScope === 'current'} onchange={() => (handoffScope = 'current')} />
                        현재 대안만 <small>({alternatives[activeAlternative]?.name} · 후보 {candidateList.length}개)</small>
                    </label>
                    <label>
                        <input type="radio" name="handoff-scope" value="all" checked={handoffScope === 'all'} onchange={() => (handoffScope = 'all')} />
                        전체 대안 <small>({handoffAlternativeCount}개 대안 · {handoffCandidateCount}개 후보)</small>
                    </label>
                </fieldset>
                <label class="handoff-review-note">
                    전달 메모 <span class="handoff-review-optional">(선택 사항)</span>
                    <textarea rows="2" placeholder="검토 담당자에게 전달할 메모를 입력하세요" value={handoffNote} oninput={(event) => (handoffNote = event.currentTarget.value)}></textarea>
                </label>
                <p class="handoff-review-note-text">선정 대안, 필지 후보와 분석 조건이 함께 기록됩니다.</p>
            </div>
            <footer>
                <button type="button" class="secondary-action" onclick={closeHandoffReview}>취소</button>
                <button type="button" class="decision-action" onclick={confirmHandoffReview} disabled={handoffScope === 'current' ? !candidateList.length : !handoffCandidateCount}>검토 요청</button>
            </footer>
        </section>
    </div>
{/if}

{#if handoffDialog}
    <div class="handoff-modal-backdrop" role="dialog" aria-modal="true" aria-label="주관부서 전달 완료">
        <section class="handoff-modal">
            <span class="handoff-modal-mark">완료</span>
            <h2>{handoffDialog.relayOk ? '주관부서 지원도구로 전달했습니다' : '전달 패키지를 저장했습니다'}</h2>
            <p>
                {#if handoffDialog.relayOk}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 기후적응실천권역 검토 요청이 주관부서 인박스에 등록되었습니다.
                {:else}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 기후적응실천권역 검토 요청을 현재 도구에 저장했습니다. 주관부서 페이지를 새로고침한 뒤 다시 전달해 주세요.
                {/if}
                이 화면은 그대로 유지됩니다.
            </p>
            <dl>
                <div><dt>대안</dt><dd>{handoffDialog.alternativeCount}개</dd></div>
                <div><dt>후보지</dt><dd>{handoffDialog.candidateCount}개</dd></div>
                <div><dt>패키지</dt><dd>{handoffDialog.packageId}</dd></div>
            </dl>
            <div class="handoff-modal-actions">
                <button type="button" class="secondary-modal-button" onclick={recallDepartmentHandoff}>요청 회수</button>
                <button type="button" onclick={() => handoffDialog = null}>확인</button>
            </div>
        </section>
    </div>
{/if}
