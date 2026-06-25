<script>
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { leadDepartmentToolUrl, portalToolsUrl } from '$lib/portalLinks.js';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';
    import { markPlatformHandoffStatus, savePlatformHandoff } from '../../../../shared/services/platformHandoffs.js';
    import { recallPriorityAreaReviewRequests, savePriorityAreaHandoffPayload } from '../../../../shared/services/livinglabWorkflowData.js';

    export let hazard = 'heatwave';

    const steps = ['프로젝트 설정', '입력자료', '가중치 설정', '분석 실행', '결과 지도', '의사결정 지원'];
    const gridOptions = ['100m', '50m', '10m', '5m'];
    const requiredGroups = ['기후위험', '노출', '민감도', '적응역량'];
    const vLambda = 0.5;
    const asset = (path) => `${base}${path}`;
    const DEPARTMENT_HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
    const priorityHandoffInboxUrl = import.meta.env.VITE_PRIORITY_HANDOFF_INBOX_URL || '/priority-handoff';
    const PRIORITY_DRAFT_DB_NAME = 'livinglabs-priority-management';
    const PRIORITY_DRAFT_STORE_NAME = 'priority-management-sessions';
    const PRIORITY_DRAFT_SCHEMA_VERSION = 'priority-management-draft/v1';

    const hazardConfigs = {
        heatwave: {
            label: '폭염',
            projectSuffix: '폭염 위험지역 분석',
            heroEmphasis: '우선 대응지를 찾습니다.',
            heroDescription: '기후위험(H), 노출(E), 취약성(V) 지표를 직접 구성하고 공간 분석 결과를 의사결정으로 연결하세요.',
            sampleNotice: '현재 폭염 분석 데이터와 후보지는 수원시 샘플입니다.',
            mapSource: '수원 LST 100m 격자 연결 대기',
            rasterPath: null,
            dataSummaryPath: '/analysis-data/suwon-heatwave-data-summary.json',
            rasterReadyPrefix: '수원 LST 100m 격자',
            rasterError: '수원 LST 100m 격자 연결 실패',
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
                { id: 1, icon: '☀', label: '지표면 온도', description: '수원LST.tif 30m 원본을 EPSG:5179 100m 격자에 평균 집계', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: '100m-grid', supportedGridUnits: ['100m'], dataPath: '/analysis-data/suwon-lst-100m-epsg5179-grid.json', value: 0.38262, color: '#ef6c4d' },
                { id: 2, icon: '🌡', label: '폭염일수', description: 'AR6 SSP245 중기 100m 정규화 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'AR6-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/ar6-hazard/H_climate_HW33_SSP245_MT_100m_z.json', value: 0.55852, color: '#f08b45' },
                { id: 14, icon: '🌙', label: '열대야일수', description: 'AR6 SSP245 중기 100m 정규화 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'AR6-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/ar6-hazard/H_climate_TR25_SSP245_MT_100m_z.json', value: 0.69113, color: '#d96545' },
                { id: 15, icon: '↗', label: '온난일 계속기간', description: 'AR6 SSP245 중기 100m 정규화 격자', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'AR6-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/ar6-hazard/H_climate_WSDI_SSP245_MT_100m_z.json', value: 0.61478, color: '#c96a36' },
                { id: 3, iconPath: asset('/indicator-icons/보행자.png'), label: '유동인구 노출량', description: 'Pop_Grid_100m Day_Total을 EPSG:5179 표준 100m 격자에 연결한 유동인구 노출량', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'population-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/population/E_population_floating_count_100m.json', value: 0.01259, color: '#db9d3e' },
                { id: 4, icon: '♟', label: '상주인구 노출량', description: '국토통계 100m 격자 총인구 수를 EPSG:5179 표준 통계격자에 연결', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'population-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/population/E_population_resident_count_100m.json', value: 0.03308, color: '#d4af42' },
                { id: 5, iconPath: asset('/indicator-icons/고령인구비율.png'), label: '고령인구 비율', description: '국토통계 100m 격자 고령인구 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'population-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/population/V_sensitivity_elderly_ratio_100m.json', value: 0.06127, color: '#e45662' },
                { id: 6, iconPath: asset('/indicator-icons/유소년인구비율.png'), label: '유소년인구 비율', description: '국토통계 100m 격자 유소년인구 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'population-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/population/V_sensitivity_children_ratio_100m.json', value: 0.02439, color: '#d96b72' },
                { id: 7, iconPath: asset('/indicator-icons/1인가구.png'), label: '1인 가구', description: '행정동 1인가구 비율을 EPSG:5179 표준 100m 격자에 할당한 정규화 지표', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_sensitivity_single_household_ratio_100m_z.json', value: 0.50044, color: '#cf6576' },
                { id: 8, iconPath: asset('/indicator-icons/기저질환자.png'), label: '건강 취약 참고', description: '2021-2023 순환기·호흡기 진료인원 기반 구 단위 건강취약 proxy', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_sensitivity_chronic_disease_ratio_proxy_100m_z.json', value: 0.50816, color: '#b86c82' },
                { id: 9, iconPath: asset('/indicator-icons/저소득층.png'), label: '저소득층', description: '2026 기초생활보장 수급자 현황 기반 행정동 저소득층 비율 proxy', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_adaptive_low_income_ratio_proxy_100m_z.json', value: 0.26613, color: '#a56d83' },
                { id: 10, iconPath: asset('/indicator-icons/노후주택비율.png'), label: '노후주택 비율', description: '건축물 주거용도 proxy 중 30년 이상 footprint 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_adaptive_old_housing_ratio_100m_z.json', value: 0.17228, color: '#a77a72' },
                { id: 11, iconPath: asset('/indicator-icons/무더위쉼터접근성.png'), label: '무더위쉼터 접근성', description: '379개 무더위쉼터 최근접 거리 기반 EPSG:5179 100m 접근성 점수', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, dataStatus: 'available', sourceType: 'cooling-shelter-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/cooling-shelter/V_adaptive_cooling_shelter_accessibility_100m_z.json', value: 0.87419, color: '#3f9b80' },
                { id: 12, iconPath: asset('/indicator-icons/녹지비율.png'), label: '녹지 비율', description: '세분류토지피복도 산림·초지·수역 기반 100m 녹지/자연자원 면적 비율', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, dataStatus: 'available', sourceType: 'admin-physical-100m', supportedGridUnits: ['100m'], dataPath: '/analysis-data/admin-physical/V_adaptive_green_natural_ratio_100m_z.json', value: 0.38105, color: '#57a66c' },
                { id: 13, iconPath: asset('/indicator-icons/그늘면적.png'), label: '그늘 면적', description: '그늘/수목 공간데이터 필요', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: false, dataStatus: 'missing', sourceType: 'file', value: 0.51, color: '#61958b' }
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
            sampleNotice: '현재 홍수 분석 데이터와 후보지는 구조 시연용 샘플입니다.',
            mapSource: '침수흔적도·DEM·배수시설 데이터 연결 준비',
            rasterPath: null,
            dataSummaryPath: null,
            rasterReadyPrefix: '홍수 위험 래스터',
            rasterError: '홍수 위험 래스터 연결 전 · 예시 격자 표시',
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
                { id: 1, icon: '≈', label: '침수흔적도', description: '과거 침수 이력 및 침수심 분포', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, color: '#2563eb' },
                { id: 2, icon: '☔', label: '강우강도', description: '집중호우 강도 및 빈도', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, color: '#0284c7' },
                { id: 3, icon: '▾', label: '저지대 지형', description: 'DEM 기반 저지대·경사 취약 구간', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, color: '#0891b2' },
                { id: 4, icon: '♟', label: '상주인구', description: '침수권역 내 거주 인구', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, color: '#d4af42' },
                { id: 5, icon: '🚶', label: '유동인구', description: '시간대별 보행·상권 유동 인구', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, color: '#db9d3e' },
                { id: 6, icon: '🛣', label: '주요 도로', description: '침수 시 통행 영향 도로망', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, color: '#b7791f' },
                { id: 7, icon: '⌂', label: '반지하 주거', description: '반지하·지하층 주거 밀집도', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#e45662' },
                { id: 8, icon: '🏚', label: '노후건축물', description: '노후 건축물 및 취약 주택 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#cf6576' },
                { id: 9, icon: '🏥', label: '취약시설', description: '복지시설·의료시설·학교 등 보호대상', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#a56d83' },
                { id: 10, icon: '◉', label: '빗물받이 밀도', description: '빗물받이 및 우수 유입시설 분포', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#3f9b80' },
                { id: 11, icon: '▤', label: '배수펌프장 접근성', description: '배수펌프장·저류시설 영향권', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#57a66c' },
                { id: 12, icon: '↗', label: '대피시설 접근성', description: '대피소와 안전 이동경로 접근성', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#61958b' }
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

    let activeStep = 0;
    let activeLayer = 'Risk';
    let region = '경기도 수원시';
    let regionCode = '41110';
    $: projectName = `${region} ${config.projectSuffix}`;
    let analysisDone = false;
    let running = false;
    let selectedCandidate = 0;
    let activeAlternative = 0;
    let gridUnit = '100m';
    let dimensionWeights = { H: 1, E: 1, V: 1 };
    let mapSource = config.mapSource;
    let dataBundle = null;
    let dataBundleStatus = config.dataSummaryPath ? '수원 시연 원자료 불러오는 중' : '시연 원자료 연결 전';
    let analysisMessage = '설정값을 확인한 뒤 Risk 분석을 실행하세요.';
    let analysisResult = null;
    let parcelCandidateMessage = 'Risk 분석 후 지도에서 필지 후보를 도출하세요.';
    let focusedCandidate = null;
    let detailCandidateKey = null;
    let handoffMessage = '필지 후보를 도출하면 주관부서 지원도구로 전달할 수 있습니다.';
    let handoffDialog = null;
    let latestHandoffPackage = null;
    let sentHandoffPackages = [];
    let requestListOpen = false;
    let draftStorageStatus = '임시 저장 준비 중';
    let draftLoadComplete = false;
    let draftSaveTimer = null;

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

    let indicators = config.indicators.map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
    let appliedIndicators = [];
    $: candidateList = analysisResult?.parcelCandidates?.length
        ? analysisResult.parcelCandidates
        : [];
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
    $: availableCount = indicators.filter(isIndicatorAvailable).length;
    $: resultScores = analysisResult?.dimensionScores || { H: null, E: null, V: null };
    $: resultRiskScore = analysisResult?.riskScore ?? null;

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

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        region = params.get('regionName') || region;
        regionCode = params.get('regionCode') || regionCode;

        try {
            const restored = restorePriorityDraftPayload(await readPriorityDraft());
            draftLoadComplete = true;
            if (!restored) draftStorageStatus = '임시 저장 준비됨';
        } catch (error) {
            console.warn(error);
            draftLoadComplete = true;
            draftStorageStatus = '임시 저장소 연결 실패';
        }

        if (config.dataSummaryPath) {
            try {
                const dataResponse = await fetch(asset(config.dataSummaryPath));
                dataBundle = await dataResponse.json();
                dataBundleStatus = `${dataBundle.title} 연결됨`;
            } catch (error) {
                dataBundleStatus = '수원 시연 원자료 요약 연결 실패';
            }
        }

        if (!analysisResult?.gridResult) mapSource = config.mapSource;

        return () => {
            window.clearTimeout(draftSaveTimer);
        };
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
                ? `${analysisResult.parcelCandidates.length}개 필지 후보 클러스터 도출`
                : analysisDone
                    ? 'Risk 분석 완료. 지도에서 필지 후보 도출을 실행하세요.'
                    : 'Risk 분석 후 지도에서 필지 후보를 도출하세요.');
        selectedCandidate = Number.isInteger(alternative.selectedCandidate) ? alternative.selectedCandidate : 0;
        detailCandidateKey = alternative.detailCandidateKey ||
            (analysisResult?.parcelCandidates?.[0] ? candidateIdentity(analysisResult.parcelCandidates[0]) : null);
        focusedCandidate = null;
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

    async function loadIndicatorInputs(sourceIndicators) {
        const loaded = await Promise.all(sourceIndicators.map(async (item) => {
            if (!usableIndicator(item) || !item.dataPath) return item;

            try {
                const response = await fetch(asset(item.dataPath));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const grid = await response.json();
                const loadedValue = Number(grid?.stats?.normalizedMean ?? grid?.stats?.mean);
                if (!Number.isFinite(loadedValue)) throw new Error('normalizedMean is missing');

                return {
                    ...item,
                    loadedValue,
                    gridValues: Array.isArray(grid.values) ? grid.values : null,
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
                        normalizedMean: grid.stats?.normalizedMean ?? grid.stats?.mean,
                        sourceResolution: grid.sourceResolution
                    }
                };
            } catch (error) {
                return {
                    ...item,
                    enabled: false,
                    dataStatus: 'missing',
                    loadError: `${item.label} 입력자료를 읽지 못했습니다.`
                };
            }
        }));

        const loadedGrid = loaded.find((item) => item.gridSummary);
        mapSource = loadedGrid
            ? `${config.rasterReadyPrefix} · ${loadedGrid.gridSummary.columns}×${loadedGrid.gridSummary.rows} · 평균 ${loadedGrid.gridSummary.rawMean}℃`
            : config.mapSource;

        return loaded;
    }

    function isIndicatorAvailable(item) {
        return item.dataStatus === 'available' && (!item.supportedGridUnits || item.supportedGridUnits.includes(gridUnit));
    }

    function indicatorStatusText(item) {
        if (item.dataStatus !== 'available') return '연결대기';
        if (item.supportedGridUnits && !item.supportedGridUnits.includes(gridUnit)) return '격자미지원';
        return item.sourceType;
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
        if (!Array.isArray(item.gridValues)) return null;
        return finiteGridValue(item.gridValues[index]);
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
        const validValues = values.filter((value) => Number.isFinite(value));
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

        const sum = validValues.reduce((total, value) => total + value, 0);
        const sorted = [...validValues].sort((left, right) => right - left);
        const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));

        return {
            validCells: validValues.length,
            min: Math.min(...validValues),
            max: Math.max(...validValues),
            mean: sum / validValues.length,
            topCount,
            topThreshold: sorted[topCount - 1]
        };
    }

    function stripIndicatorForResult(item) {
        const { gridValues, ...resultItem } = item;
        return {
            ...resultItem,
            gridValues: Array.isArray(gridValues) ? gridValues : null
        };
    }

    function computeGridAnalysis(sourceIndicators) {
        const availableIndicators = sourceIndicators.filter(usableIndicator);
        const reference = availableIndicators.find((item) =>
            Array.isArray(item.gridValues) &&
            item.gridValues.length &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows
        );

        if (!reference) return null;

        const columns = Number(reference.gridMeta.columns);
        const rows = Number(reference.gridMeta.rows);
        const cellCount = columns * rows;
        const gridIndicators = availableIndicators.filter((item) =>
            Array.isArray(item.gridValues) &&
            item.gridValues.length >= cellCount &&
            Number(item.gridMeta?.columns) === columns &&
            Number(item.gridMeta?.rows) === rows
        );
        const byGroup = (group) => gridIndicators.filter((item) => item.group === group);
        const hItems = byGroup('기후위험');
        const eItems = byGroup('노출');
        const sensitivityItems = byGroup('민감도');
        const adaptiveItems = byGroup('적응역량');

        if (!hItems.length || !eItems.length || !sensitivityItems.length || !adaptiveItems.length) return null;

        const hValues = new Array(cellCount).fill(null);
        const eValues = new Array(cellCount).fill(null);
        const sensitivityValues = new Array(cellCount).fill(null);
        const adaptiveCapacityValues = new Array(cellCount).fill(null);
        const vValues = new Array(cellCount).fill(null);
        const riskValues = new Array(cellCount).fill(null);

        for (let index = 0; index < cellCount; index += 1) {
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

            if (
                Number.isFinite(hScore) &&
                Number.isFinite(eScore) &&
                Number.isFinite(sensitivityScore) &&
                Number.isFinite(adaptiveCapacityForV)
            ) {
                const vScore = clamp01((vLambda * sensitivityScore) + ((1 - vLambda) * adaptiveCapacityForV));
                const riskScore = weightedGeometricMean({ H: hScore, E: eScore, V: vScore }, dimensionWeights);
                vValues[index] = vScore;
                riskValues[index] = riskScore;
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
            gridResult: {
                gridUnit,
                columns,
                rows,
                extent: reference.gridMeta.extent,
                transform: reference.gridMeta.transform,
                crs: reference.gridMeta.crs,
                valueEncoding: 'row-major 100m cells aligned to the Suwon stat grid',
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
        const missingGroup = requiredGroups.find((group) => selectedIndicatorsFor(group).length === 0);
        if (missingGroup) {
            return `분석을 실행할 수 없습니다. ${missingGroup} 영역에 선택된 사용 가능 지표가 없습니다.`;
        }
        const zeroWeightGroup = requiredGroups.find((group) => {
            const items = selectedIndicatorsFor(group);
            return items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0) <= 0;
        });
        if (zeroWeightGroup) {
            return `분석을 실행할 수 없습니다. ${zeroWeightGroup} 영역의 가중치 합이 0입니다.`;
        }
        if (dimensionWeights.H + dimensionWeights.E + dimensionWeights.V <= 0) {
            return '분석을 실행할 수 없습니다. H/E/V 통합 가중치 합이 0입니다.';
        }
        return '';
    }

    function computeAnalysis(sourceIndicators) {
        const gridAnalysis = computeGridAnalysis(sourceIndicators);

        if (gridAnalysis) {
            return {
                gridUnit,
                formula: 'Weighted geometric mean: (H^wH × E^wE × V^wV)^(1/Σw)',
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
        parcelCandidateMessage = 'Risk 분석 후 지도에서 필지 후보를 도출하세요.';
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

    function setIndicatorEnabled(id, enabled) {
        indicators = indicators.map((item) => item.id === id ? { ...item, enabled } : item);
        markAnalysisDirty();
    }

    function setIndicatorWeight(id, value) {
        indicators = indicators.map((item) => item.id === id
            ? { ...item, weight: Math.max(0, toNumber(value, item.weight)) }
            : item
        );
        markAnalysisDirty();
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
        const enrichedSnapshot = await loadIndicatorInputs(snapshot);
        const missingAfterLoad = requiredGroups.find((group) => selectedIndicatorsFor(group, enrichedSnapshot).length === 0);
        if (missingAfterLoad) {
            analysisMessage = `분석을 실행할 수 없습니다. ${missingAfterLoad} 영역의 입력자료를 읽지 못했습니다.`;
            running = false;
            activeStep = 2;
            return;
        }

        const result = computeAnalysis(enrichedSnapshot);
        setTimeout(() => {
            const validCells = result.gridResult?.stats?.validCells;
            const nextAnalysisMessage = Number.isFinite(validCells)
                ? `${runGridUnit} 기준 격자 ${validCells.toLocaleString()}셀 · ${result.indicators.length}개 지표로 Risk 분석 완료`
                : `${runGridUnit} 기준 격자 · ${result.indicators.length}개 지표로 Risk 분석 완료`;

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
                    parcelCandidateMessage: 'Risk 분석 완료. 지도에서 필지 후보 도출을 실행하세요.',
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
                parcelCandidateMessage = 'Risk 분석 완료. 지도에서 필지 후보 도출을 실행하세요.';
                analysisMessage = nextAnalysisMessage;
                analysisDone = true;
                activeStep = 4;
            }

            running = false;
            schedulePriorityDraftSave();
        }, 600);
    }

    function handleParcelCandidates(candidates, message, sourceAlternativeId = activeAlternativeId) {
        const nextCandidates = Array.isArray(candidates) ? candidates : [];
        const nextMessage = message || (nextCandidates.length
            ? `${nextCandidates.length}개 필지 후보 클러스터 도출`
            : '필지 후보가 아직 없습니다.');
        const targetIndex = alternatives.findIndex((alternative) => alternative.id === sourceAlternativeId);
        const safeTargetIndex = targetIndex >= 0 ? targetIndex : activeAlternative;
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
        let workflowOk = false;
        try {
            const workflowResult = await savePriorityAreaHandoffPayload(deliveredPayload);
            if (workflowResult?.request?.id) {
                deliveredPayload.workflowRequestId = workflowResult.request.id;
                deliveredPayload.areaSetId = workflowResult.areaSet?.id;
                workflowOk = true;
            }
        } catch (error) {
            console.warn('[PriorityManagementArea] workflow handoff save failed', error);
        }
        const supabaseOk = await savePlatformHandoff('priority_to_lead', deliveredPayload, 'requested');
        try {
            const response = await fetch(priorityHandoffInboxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveredPayload)
            });
            if (!response.ok) return workflowOk || supabaseOk;
            const result = await response.json().catch(() => null);
            return workflowOk || supabaseOk || Boolean(result?.ok);
        } catch {
            return workflowOk || supabaseOk;
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
            Promise.all([
                markPlatformHandoffStatus('priority_to_lead', {
                    regionCode,
                    packageId: recalledPackageId,
                    status: 'recalled'
                }),
                recallPriorityAreaReviewRequests({
                    regionCode,
                    packageId: recalledPackageId
                }).then((count) => count > 0).catch(() => false)
            ]).then((results) => results.some(Boolean))
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
            Promise.all([
                markPlatformHandoffStatus('priority_to_lead', {
                    regionCode,
                    status: 'recalled'
                }),
                recallPriorityAreaReviewRequests({ regionCode }).then((count) => count > 0).catch(() => false)
            ]).then((results) => results.some(Boolean))
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
        const nextMessage = '현재 대안의 Risk 분석 결과와 필지 후보를 초기화했습니다. 지표 설정을 확인한 뒤 다시 실행하세요.';

        analysisResult = null;
        appliedIndicators = [];
        analysisDone = false;
        analysisMessage = nextMessage;
        parcelCandidateMessage = 'Risk 분석 후 지도에서 필지 후보를 도출하세요.';
        selectedCandidate = 0;
        detailCandidateKey = null;
        focusedCandidate = null;
        activeLayer = 'Risk';
        activeStep = Math.min(activeStep, 2);

        persistAlternative(activeAlternative, {
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
        handoffMessage = sentHandoffPackages.length
            ? '전체 대안을 초기화했습니다. 기존 검토 요청은 보낸 요청 관리에서 회수할 수 있습니다.'
            : '전체 대안을 초기화했습니다. 새 대안을 구성한 뒤 다시 전달할 수 있습니다.';
        schedulePriorityDraftSave();
    }

    async function handoffToDepartmentPlatform() {
        const activeSnapshot = {
            ...alternatives[activeAlternative],
            ...currentAlternativeState()
        };
        const sourceAlternatives = alternatives.map((alternative, index) => (
            index === activeAlternative ? activeSnapshot : alternative
        ));
        alternatives = sourceAlternatives;
        const payload = buildDepartmentHandoffPayload(sourceAlternatives);
        if (!payload.candidates.length) {
            handoffMessage = '전달할 필지 후보가 없습니다. Risk 분석 후 필지 후보 도출을 먼저 실행하세요.';
            return;
        }

        const deliveredAt = new Date().toISOString();
        const deliveredPayload = {
            ...payload,
            deliveredToLeadAt: deliveredAt,
            deliveryStatus: 'sent-to-lead'
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

    function addIndicator() {
        indicators = [...indicators, {
            id: Date.now(), icon: '◇', label: '새 사용자 지표', description: 'GeoTIFF 경로를 연결할 사용자 정의 지표',
            dimension: 'V', group: '민감도', weight: 1.0, direction: 'positive', enabled: false, dataStatus: 'missing', sourceType: 'user-geotiff', value: 0.5, color: '#7f8c9b'
        }];
        markAnalysisDirty('사용자 지표가 추가되었습니다. 메타정보와 파일 연결 후 분석하세요.');
    }

    function addAlternative() {
        persistAlternative(activeAlternative);
        const nextIndex = alternatives.length;
        const nextAlternative = {
            name: `대안${nextIndex + 1}`,
            status: '검토중',
            description: '새 중점관리구역 대안',
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
            parcelCandidateMessage: 'Risk 분석 후 지도에서 필지 후보를 도출하세요.',
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

    function deleteActiveAlternative() {
        if (alternatives.length <= 1) {
            resetActiveAlternative();
            handoffMessage = '마지막 대안은 삭제하지 않고 내용만 초기화했습니다.';
            return;
        }

        const deletedAlternative = alternatives[activeAlternative];
        const nextAlternatives = alternatives.filter((_, index) => index !== activeAlternative);
        const nextIndex = Math.min(activeAlternative, nextAlternatives.length - 1);
        alternatives = nextAlternatives;
        activeAlternative = nextIndex;
        loadAlternative(nextIndex);
        handoffMessage = latestHandoffPackage
            ? `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다. 이미 전달한 요청은 필요하면 별도로 회수하세요.`
            : `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다.`;
        schedulePriorityDraftSave();
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

    function setActiveGridLayer(layer) {
        activeLayer = layer;
        persistAlternative(activeAlternative, { activeLayer: layer });
        schedulePriorityDraftSave();
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
                <span>기후위험 평가·의사결정 지원</span>
            </div>
        </div>
        <div class="project-meta">
            <div><span>프로젝트</span><strong>{projectName}</strong></div>
            <a class="ghost-link" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
            <button class="ghost-button" onclick={downloadConfig}>설정 내보내기</button>
            <div class="avatar">관리</div>
        </div>
    </header>

    <div class="workspace">
        <main class="main">
            <section class="hero">
                <div>
                    <span class="eyebrow">LOCAL CLIMATE RISK ASSESSMENT</span>
                    <h1>지역의 위험을 읽고,<br /><em>{config.heroEmphasis}</em></h1>
                    <p>{config.heroDescription}</p>
                </div>
                <div class="hero-actions">
                    <label>분석 대상 지역<input value={region} readonly /></label>
                    <label>행정구역 코드<input value={regionCode} readonly /></label>
                    <small>{config.sampleNotice}</small>
                    <div class="request-manager">
                        <button type="button" class="request-manager-toggle" onclick={() => requestListOpen = !requestListOpen}>
                            보낸 요청 관리
                            <span>{sentRequestCount}</span>
                        </button>
                        {#if requestListOpen}
                            <div class="request-manager-panel">
                                <div>
                                    <strong>보낸 검토 요청</strong>
                                    <small>초기화 후에도 이 목록에서 요청을 회수할 수 있습니다.</small>
                                </div>
                                {#if sentHandoffPackages.length}
                                    <ul>
                                        {#each sentHandoffPackages as request}
                                            <li>
                                                <div>
                                                    <b>{request.hazardLabel || config.label} · {request.region || region}</b>
                                                    <span>{request.alternativeCount || 0}개 대안 · {request.candidateCount || 0}개 후보 · {formatHandoffTime(request.deliveredAt)}</span>
                                                    <small>{request.packageId}</small>
                                                </div>
                                                <button type="button" onclick={() => recallDepartmentHandoff(request)}>회수</button>
                                            </li>
                                        {/each}
                                    </ul>
                                    <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>전체 요청 회수</button>
                                {:else}
                                    <p>현재 도구에 기록된 요청은 없습니다. 주관부서 화면에 이전 요청이 남아 있으면 아래 버튼으로 비울 수 있습니다.</p>
                                    <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>주관부서 요청 비우기</button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </section>

            <aside class="workflow-guide" aria-label="분석 워크플로우 안내">
                <div class="workflow-title">
                    <strong>분석 워크플로우</strong>
                    <span>{enabledCount}개 선택 · {availableCount}개 사용 가능</span>
                </div>
                <ol>
                    {#each steps as step, index}
                        <li class:active={activeStep === index} class:complete={activeStep > index}>
                            <span class="step-num">{activeStep > index ? '✓' : index + 1}</span>
                            <span>{step}<small>{['범위와 기준 설정', 'H/E/V GeoTIFF 구성', '방향성과 영향 조정', '공간분석 계산', '위험도·핫스팟 확인', '우선관리 후보 검토'][index]}</small></span>
                        </li>
                    {/each}
                </ol>
            </aside>

            <section class="content-grid">
                <div class="panel indicator-panel">
                    <div class="panel-head">
                        <div><span class="section-number">01</span><h2>분석 지표 구성</h2><p>사용 가능 지표만 Risk 분석에 반영됩니다.</p></div>
                        <button class="add-button" onclick={addIndicator}>+ 지표 추가</button>
                    </div>
                    <div class="analysis-control-card">
                        <div class="analysis-control-copy">
                            <span>ANALYSIS SETUP</span>
                            <strong>단위격자 기준으로 지표를 요약해 Risk를 계산합니다.</strong>
                            <p>{analysisMessage}</p>
                        </div>
                        <label>분석 단위 격자
                            <select value={gridUnit} onchange={(event) => setGridUnit(event.currentTarget.value)}>
                                {#each gridOptions as option}
                                    <option value={option}>{option}</option>
                                {/each}
                            </select>
                        </label>
                        <div class="control-stats">
                            <span>{enabledCount}개 선택</span>
                            <span>{availableCount}개 사용 가능</span>
                            <span>{draftStorageStatus}</span>
                        </div>
                        <button class="primary" onclick={runAnalysis} disabled={running}>{running ? '계산 중...' : 'Risk 분석 실행'}</button>
                    </div>
                    {#each ['기후위험', '노출', '민감도', '적응역량'] as group}
                        <div class="indicator-group">
                            <div class="group-label">{group}<span>{selectedIndicatorsFor(group).length}/{indicators.filter((item) => item.group === group && isIndicatorAvailable(item)).length} 사용</span></div>
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
                                    <div class="indicator-copy"><strong>{item.label}</strong><span>{indicatorStatusText(item)} · {item.description}</span></div>
                                    <div class="dimension-tag">{item.dimension}{item.group === '적응역량' ? '-' : '+'}</div>
                                    <label class="weight">가중치<input type="number" min="0" max="3" step="0.1" value={item.weight} oninput={(event) => setIndicatorWeight(item.id, event.currentTarget.value)} /></label>
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>

                <div class="right-column">
                    <div class="panel analysis-map-panel">
                        <div class="panel-head map-head">
                            <div><h2>{alternatives[activeAlternative]?.name} 분석 지도</h2><p>{alternatives[activeAlternative]?.description} · {region} · 행정구역 코드 {regionCode}</p></div>
                            <div class="map-toolbar">
                                <div class="handoff-actions">
                                    <div class="handoff-button-row">
                                        <button class="decision-action" onclick={handoffToDepartmentPlatform} disabled={!handoffCandidateCount}>주관부서 지원도구로 전달</button>
                                        <button class="secondary-action" onclick={recallDepartmentHandoff} disabled={!latestHandoffPackage}>요청 회수</button>
                                        <button class="secondary-action muted" onclick={resetAllAlternatives}>전체 대안 초기화</button>
                                    </div>
                                    <span class="handoff-note">{handoffStatusText}</span>
                                </div>
                                <div class="alternative-tabs" aria-label="중점관리구역 대안">
                                    {#each alternatives as alternative, index}
                                        <button class:active={activeAlternative === index} onclick={() => switchAlternative(index)}>
                                            <span>{alternative.name}</span>
                                            <small>{alternativeStatusLabel(alternative)}</small>
                                        </button>
                                    {/each}
                                    <button class="add-alt" onclick={addAlternative}>+</button>
                                    <button class="reset-alt" onclick={resetActiveAlternative} title="현재 대안 초기화">초기화</button>
                                    <button class="delete-alt" onclick={deleteActiveAlternative} title="현재 대안 삭제">삭제</button>
                                </div>
                            </div>
                        </div>
                        <div class="map-result-wrap">
                            <SelectedRegionMap
                                {regionCode}
                                regionName={region}
                                height="760px"
                                showCadastral={false}
                                analysisIndicators={appliedIndicators}
                                riskGrid={analysisResult?.gridResult}
                                activeGridLayer={activeLayer}
                                onGridLayerChange={setActiveGridLayer}
                                showAnalysisLegend={analysisDone}
                                parcelCandidates={analysisResult?.parcelCandidates || []}
                                candidateContextKey={activeAlternativeId}
                                {focusedCandidate}
                                onParcelCandidatesChange={handleParcelCandidates}
                                onParcelCandidateFocus={handleMapParcelCandidateFocus}
                            />
                            <section class="score-row map-score-overlay" aria-label="리스크 평가 결과">
                                <div class="score-card risk"><span>종합 위험도</span><strong>{formatScore(resultRiskScore)}</strong><small>{analysisDone ? `${analysisResult.gridUnit} 분석 결과` : '분석 실행 대기'}</small></div>
                                <div class="score-card"><span><b class="dot h"></b>기후위험 H</span><strong>{formatScore(resultScores.H)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" value={dimensionWeights.H} oninput={(event) => setDimensionWeight('H', event.currentTarget.value)} /></label><div class="bar"><i style={`width:${(resultScores.H || 0) * 100}%`}></i></div></div>
                                <div class="score-card"><span><b class="dot e"></b>노출 E</span><strong>{formatScore(resultScores.E)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" value={dimensionWeights.E} oninput={(event) => setDimensionWeight('E', event.currentTarget.value)} /></label><div class="bar"><i style={`width:${(resultScores.E || 0) * 100}%`}></i></div></div>
                                <div class="score-card"><span><b class="dot v"></b>취약성 V</span><strong>{formatScore(resultScores.V)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" value={dimensionWeights.V} oninput={(event) => setDimensionWeight('V', event.currentTarget.value)} /></label><div class="bar"><i style={`width:${(resultScores.V || 0) * 100}%`}></i></div></div>
                            </section>
                        </div>
                    </div>
                </div>
            </section>

            <section class="panel candidates wide-candidates">
                <div class="panel-head">
                    <div><span class="section-number">02</span><h2>우선관리 후보지</h2><p>{analysisDone ? parcelCandidateMessage : 'Risk 분석 후 지도에서 필지 후보 도출을 실행하면 실제 후보지가 표시됩니다.'}</p></div>
                    <span class="count-badge">{candidateList.length}개 후보</span>
                </div>
                {#if candidateList.length}
                    <div class="candidate-list">
                        {#each candidateList.slice(0, 10) as candidate, index}
                            <article class="candidate-card" class:active={selectedCandidate === index}>
                                <button class="candidate-main" type="button" onclick={() => selectCandidate(candidate, index)}>
                                    <span class="rank">{String(candidate.rank).padStart(2, '0')}</span>
                                    <span><strong>{candidate.name}</strong><small>{candidate.area}</small></span>
                                    <b>{formatScore(candidate.risk)}</b>
                                </button>
                                <button class="candidate-detail-toggle" type="button" title="후보지 상세보기" aria-label={`${candidate.name} 상세보기`} onclick={() => showCandidateDetail(candidate, index)}>!</button>
                            </article>
                        {/each}
                    </div>
                    {#if detailCandidateItem}
                        <aside class="candidate-detail-panel" aria-label="후보지 상세보기">
                            <div>
                                <span>후보지 상세</span>
                                <strong>{detailCandidateItem.name}</strong>
                                <small>{detailCandidateItem.reason || detailCandidateItem.area}</small>
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
                        <strong>필지 후보 도출 대기</strong>
                        <span>Risk 분석과 필지 후보 도출이 끝나면 실제 핫스팟-필지 교차 후보가 여기에 표시됩니다.</span>
                    </div>
                {/if}
            </section>

            <section class="decision-panel">
                <div class="decision-title pending-title">
                    <span class="section-number">04</span>
                    <div>
                        <h2>후보 전달 브리프 · 미구현</h2>
                        <p>04 단계는 아직 설계/구현 전입니다. 현재 후보 검토는 02 우선관리 후보지와 지도 범례를 기준으로 진행하세요.</p>
                    </div>
                    <span class="pending-badge">미구현</span>
                </div>
                <div class="pending-brief">
                    <strong>04 단계 준비 중</strong>
                    <span>후보지별 전달 브리프, 평가 항목, 다운로드 양식은 추후 구현 예정입니다.</span>
                </div>
            </section>
        </main>
    </div>
</div>

{#if handoffDialog}
    <div class="handoff-modal-backdrop" role="dialog" aria-modal="true" aria-label="주관부서 전달 완료">
        <section class="handoff-modal">
            <span class="handoff-modal-mark">완료</span>
            <h2>{handoffDialog.relayOk ? '주관부서 지원도구로 전달했습니다' : '전달 패키지를 저장했습니다'}</h2>
            <p>
                {#if handoffDialog.relayOk}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 중점관리구역 검토 요청이 주관부서 인박스에 등록되었습니다.
                {:else}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 중점관리구역 검토 요청을 현재 도구에 저장했습니다. 주관부서 페이지를 새로고침한 뒤 다시 전달해 주세요.
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
