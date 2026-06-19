<script>
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { portalToolsUrl } from '$lib/portalLinks.js';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';

    export let hazard = 'heatwave';

    const steps = ['프로젝트 설정', '입력자료', '가중치 설정', '분석 실행', '결과 지도', '의사결정 지원'];
    const asset = (path) => `${base}${path}`;

    const hazardConfigs = {
        heatwave: {
            label: '폭염',
            projectSuffix: '폭염 위험지역 분석',
            heroEmphasis: '우선 대응지를 찾습니다.',
            heroDescription: '기후위험(H), 노출(E), 취약성(V) 지표를 직접 구성하고 공간 분석 결과를 의사결정으로 연결하세요.',
            sampleNotice: '현재 폭염 분석 데이터와 후보지는 수원시 샘플입니다.',
            mapSource: '수원LST.tif 불러오는 중',
            rasterPath: '/analysis-data/수원LST.tif',
            dataSummaryPath: '/analysis-data/suwon-heatwave-data-summary.json',
            rasterReadyPrefix: '수원LST.tif 실제 래스터',
            rasterError: '수원LST.tif 미리보기 연결 실패 · 예시 격자 표시',
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
                { id: 1, icon: '☀', label: '지표면 온도', description: '수원LST.tif · 지표면 온도 분포', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, color: '#ef6c4d' },
                { id: 2, icon: '🌡', label: '폭염일수', description: 'AR6 HW33 · 최고기온 33℃ 이상 일수', dimension: 'H', group: '기후위험', weight: 1, direction: 'positive', enabled: true, color: '#f08b45' },
                { id: 3, iconPath: asset('/indicator-icons/보행자.png'), label: '보행자·유동인구', description: '시간대별 보행 및 활동 인구', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, color: '#db9d3e' },
                { id: 4, icon: '♟', label: '상주인구', description: 'Pop_Grid_100m · 격자별 거주 인구', dimension: 'E', group: '노출', weight: 1, direction: 'positive', enabled: true, color: '#d4af42' },
                { id: 5, iconPath: asset('/indicator-icons/고령인구비율.png'), label: '고령인구 비율', description: '100m 격자 고령 인구 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#e45662' },
                { id: 6, iconPath: asset('/indicator-icons/유소년인구비율.png'), label: '유소년인구 비율', description: '100m 격자 유소년 인구 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#d96b72' },
                { id: 7, iconPath: asset('/indicator-icons/1인가구.png'), label: '1인 가구', description: '폭염 시 돌봄 공백 가능성이 높은 가구', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#cf6576' },
                { id: 8, iconPath: asset('/indicator-icons/기저질환자.png'), label: '기저질환자', description: '폭염 관련 건강 취약 가능 인구', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#b86c82' },
                { id: 9, iconPath: asset('/indicator-icons/저소득층.png'), label: '저소득층', description: '국민기초생활보장 수급자 현황', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#a56d83' },
                { id: 10, iconPath: asset('/indicator-icons/노후주택비율.png'), label: '노후주택 비율', description: '건축물 연령 기반 노후주택 비율', dimension: 'V', group: '민감도', weight: 1, direction: 'positive', enabled: true, color: '#a77a72' },
                { id: 11, iconPath: asset('/indicator-icons/무더위쉼터접근성.png'), label: '무더위쉼터 접근성', description: '무더위쉼터 도보 접근 가능성', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#3f9b80' },
                { id: 12, iconPath: asset('/indicator-icons/녹지비율.png'), label: '녹지 비율', description: '세분류 토지피복도 기반 녹지 비율', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#57a66c' },
                { id: 13, iconPath: asset('/indicator-icons/그늘면적.png'), label: '그늘 면적', description: '생활권 내 그늘 면적 비율', dimension: 'V', group: '적응역량', weight: 1, direction: 'negative', enabled: true, color: '#61958b' }
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
    let dimensionWeights = { H: 1, E: 1, V: 1 };
    let mapSource = config.mapSource;
    let dataBundle = null;
    let dataBundleStatus = config.dataSummaryPath ? '수원 시연 원자료 불러오는 중' : '시연 원자료 연결 전';

    let alternatives = config.alternatives.map((item) => ({ ...item }));
    $: decidedAlternative = alternatives.find((item) => item.status === '선정');

    let indicators = config.indicators.map((item) => ({ ...item }));
    const candidates = config.candidates;

    let cells = Array.from({ length: 108 }, (_, i) => {
        const x = i % 12;
        const y = Math.floor(i / 12);
        return Math.min(0.98, Math.max(0.08, 0.18 + Math.sin(x * 1.3 + y * 0.7) * 0.18 + (x > 5 && y > 2 && y < 7 ? 0.42 : 0) + ((x + y) % 5) * 0.035));
    });

    $: enabledCount = indicators.filter((item) => item.enabled).length;
    $: dimensionScores = {
        H: scoreFor('H', 0.76),
        E: scoreFor('E', 0.91),
        V: scoreFor('V', 0.81)
    };
    $: dimensionWeightTotal = dimensionWeights.H + dimensionWeights.E + dimensionWeights.V;
    $: riskScore = dimensionWeightTotal === 0 ? 0 : Math.pow(
        Math.pow(dimensionScores.H, dimensionWeights.H) *
        Math.pow(dimensionScores.E, dimensionWeights.E) *
        Math.pow(dimensionScores.V, dimensionWeights.V),
        1 / dimensionWeightTotal
    );

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        region = params.get('regionName') || region;
        regionCode = params.get('regionCode') || regionCode;

        if (config.dataSummaryPath) {
            try {
                const dataResponse = await fetch(asset(config.dataSummaryPath));
                dataBundle = await dataResponse.json();
                dataBundleStatus = `${dataBundle.title} 연결됨`;
            } catch (error) {
                dataBundleStatus = '수원 시연 원자료 요약 연결 실패';
            }
        }

        if (!config.rasterPath) {
            mapSource = config.mapSource;
            return;
        }

        try {
            const { default: parseGeoraster } = await import('georaster');
            const response = await fetch(asset(config.rasterPath));
            const raster = await parseGeoraster(await response.arrayBuffer());
            const values = raster.values[0];
            const sampled = [];
            for (let row = 0; row < 9; row += 1) {
                for (let col = 0; col < 12; col += 1) {
                    const y = Math.min(values.length - 1, Math.floor((row / 8) * (values.length - 1)));
                    const x = Math.min(values[y].length - 1, Math.floor((col / 11) * (values[y].length - 1)));
                    sampled.push(values[y][x]);
                }
            }
            const valid = sampled.filter((value) => Number.isFinite(value) && value !== raster.noDataValue);
            const min = Math.min(...valid);
            const max = Math.max(...valid);
            cells = sampled.map((value) => Number.isFinite(value) && value !== raster.noDataValue ? (value - min) / Math.max(max - min, 0.0001) : 0);
            mapSource = `${config.rasterReadyPrefix} · ${raster.width}×${raster.height}`;
        } catch (error) {
            mapSource = config.rasterError;
        }
    });

    function scoreFor(dimension, base) {
        const items = indicators.filter((item) => item.dimension === dimension && item.enabled);
        if (!items.length) return 0;
        const total = items.reduce((sum, item) => sum + item.weight, 0);
        if (total === 0) return 0;
        return items.reduce((sum, item) => {
            const contribution = Math.min(0.98, Math.max(0.05, base + (((item.id * 7) % 5) - 2) * 0.06));
            return sum + contribution * item.weight;
        }, 0) / total;
    }

    function colorFor(value) {
        const adjusted = activeLayer === 'Hotspot' ? value * 1.12 : activeLayer === 'H' ? value * 0.9 : activeLayer === 'E' ? value * 1.04 : activeLayer === 'V' ? value * 0.96 : value;
        if (adjusted > 0.78) return '#d83b3e';
        if (adjusted > 0.62) return '#eb7042';
        if (adjusted > 0.46) return '#f2ad4b';
        if (adjusted > 0.3) return '#f5d77a';
        return '#dce9bd';
    }

    function runAnalysis() {
        running = true;
        activeStep = 3;
        setTimeout(() => {
            running = false;
            analysisDone = true;
            activeStep = 4;
        }, 900);
    }

    function addIndicator() {
        indicators = [...indicators, {
            id: Date.now(), icon: '◇', label: '새 사용자 지표', description: 'GeoTIFF 경로를 연결할 사용자 정의 지표',
            dimension: 'V', group: '민감도', weight: 1.0, direction: 'positive', enabled: true, color: '#7f8c9b'
        }];
    }

    function addAlternative() {
        alternatives = [
            ...alternatives,
            { name: `대안${alternatives.length + 1}`, status: '검토중', description: '새 중점관리구역 대안' }
        ];
        activeAlternative = alternatives.length - 1;
    }

    function confirmAlternative() {
        alternatives = alternatives.map((alternative, index) => ({
            ...alternative,
            status: index === activeAlternative ? '선정' : alternative.status === '선정' ? '검토완료' : alternative.status
        }));
        activeStep = 5;
    }

    function downloadConfig() {
        const payload = {
            projectName,
            region,
            regionCode,
            hazard,
            formula: 'Weighted geometric mean of H/E/V',
            commonDataItems: config.commonDataItems,
            dataBundle,
            dimensionWeights,
            indicators,
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
                    <button class="primary" onclick={runAnalysis} disabled={running}>{running ? '공간 분석 계산 중...' : '분석 실행하기 →'}</button>
                </div>
            </section>

            <section class="workflow-strip" aria-label="분석 워크플로우">
                <div class="workflow-title">
                    <strong>분석 워크플로우</strong>
                    <span>{enabledCount}개 지표</span>
                </div>
                <nav>
                    {#each steps as step, index}
                        <button class:active={activeStep === index} class:complete={activeStep > index} onclick={() => activeStep = index}>
                            <span class="step-num">{activeStep > index ? '✓' : index + 1}</span>
                            <span>{step}<small>{['범위와 기준 설정', 'H/E/V GeoTIFF 구성', '방향성과 영향 조정', '공간분석 계산', '위험도·핫스팟 확인', '우선관리 후보 검토'][index]}</small></span>
                        </button>
                    {/each}
                </nav>
            </section>

            <section class="score-row">
                <div class="score-card risk"><span>종합 위험도</span><strong>{riskScore.toFixed(2)}</strong><small>상위 8.4% · 매우 높음</small></div>
                <div class="score-card"><span><b class="dot h"></b>기후위험 H</span><strong>{dimensionScores.H.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.H} /></label><div class="bar"><i style={`width:${dimensionScores.H * 100}%`}></i></div></div>
                <div class="score-card"><span><b class="dot e"></b>노출 E</span><strong>{dimensionScores.E.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.E} /></label><div class="bar"><i style={`width:${dimensionScores.E * 100}%`}></i></div></div>
                <div class="score-card"><span><b class="dot v"></b>취약성 V</span><strong>{dimensionScores.V.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.V} /></label><div class="bar"><i style={`width:${dimensionScores.V * 100}%`}></i></div></div>
            </section>

            <section class="data-bundle-panel">
                <div class="data-bundle-head">
                    <div>
                        <span class="eyebrow">SUWON DEMO DATA</span>
                        <h2>수원시 시연 원자료 연결</h2>
                        <p>{dataBundleStatus}</p>
                    </div>
                    <span class="source-badge">{dataBundle ? '실제 원자료 요약 반영' : '연결 대기'}</span>
                </div>
                {#if dataBundle}
                    <div class="data-summary-grid">
                        {#each dataBundle.summaryCards as card}
                            <article>
                                <span>{card.label}</span>
                                <strong>{card.value}</strong>
                                <small>{card.caption}</small>
                            </article>
                        {/each}
                    </div>
                    <div class="data-source-list">
                        {#each [...dataBundle.rasterSources, ...dataBundle.tableSources] as source}
                            <span>{source.label}<small>{source.status}</small></span>
                        {/each}
                    </div>
                {/if}
            </section>

            <section class="content-grid">
                <div class="panel indicator-panel">
                    <div class="panel-head">
                        <div><span class="section-number">01</span><h2>분석 지표 구성</h2><p>체크한 지표만 계산에 반영됩니다.</p></div>
                        <button class="add-button" onclick={addIndicator}>+ 지표 추가</button>
                    </div>
                    {#each ['기후위험', '노출', '민감도', '적응역량'] as group}
                        <div class="indicator-group">
                            <div class="group-label">{group}<span>{indicators.filter((item) => item.group === group && item.enabled).length}/{indicators.filter((item) => item.group === group).length}</span></div>
                            {#each indicators.filter((item) => item.group === group) as item}
                                <div class="indicator-item" class:disabled={!item.enabled}>
                                    <input type="checkbox" bind:checked={item.enabled} />
                                    <div class="indicator-icon" style={`--icon-color:${item.color}`}>
                                        {#if item.iconPath}<img src={item.iconPath} alt="" />{:else}{item.icon}{/if}
                                    </div>
                                    <div class="indicator-copy"><strong>{item.label}</strong><span>{item.description}</span></div>
                                    <div class="dimension-tag">{item.dimension}{item.group === '적응역량' ? '−' : '+'}</div>
                                    <label class="weight">가중치<input type="number" min="0" max="3" step="0.1" bind:value={item.weight} /></label>
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
                                <div class="alternative-tabs" aria-label="중점관리구역 대안">
                                    {#each alternatives as alternative, index}
                                        <button class:active={activeAlternative === index} onclick={() => activeAlternative = index}>{alternative.name}</button>
                                    {/each}
                                    <button class="add-alt" onclick={addAlternative}>+</button>
                                </div>
                                <div class="layer-tabs">
                                    {#each ['Risk', 'H', 'E', 'V', 'Hotspot'] as layer}
                                        <button class:active={activeLayer === layer} onclick={() => activeLayer = layer}>{layer}</button>
                                    {/each}
                                </div>
                                <button class="decision-action" onclick={confirmAlternative}>현재 대안 선정</button>
                            </div>
                        </div>
                        <SelectedRegionMap
                            {regionCode}
                            regionName={region}
                            height="760px"
                            showCadastral={true}
                        />
                    </div>
                </div>
            </section>

            <section class="panel candidates wide-candidates">
                <div class="panel-head">
                    <div><span class="section-number">02</span><h2>우선관리 후보지</h2><p>분석 지도 위에 후보지·격자·취약성 레이어를 순차적으로 올려 검토합니다.</p></div>
                    <span class="count-badge">3개 후보</span>
                </div>
                <div class="candidate-list">
                    {#each candidates as candidate, index}
                        <button class:active={selectedCandidate === index} onclick={() => selectedCandidate = index}>
                            <span class="rank">0{candidate.rank}</span>
                            <span><strong>{candidate.name}</strong><small>{candidate.area}</small></span>
                            <b>{candidate.risk}</b>
                        </button>
                    {/each}
                </div>
            </section>

            <section class="decision-panel">
                <div class="decision-title"><span class="section-number">04</span><div><h2>{decidedAlternative ? `${decidedAlternative.name} 확정 대안` : `${alternatives[activeAlternative].name} 검토 대안`} 의사결정 브리프</h2><p>{candidates[selectedCandidate].area} · {candidates[selectedCandidate].reason}</p></div><button onclick={downloadConfig}>분석 결과 다운로드</button></div>
                <div class="brief-grid">
                    <div class="brief-score"><span>Risk</span><strong>{candidates[selectedCandidate].risk}</strong><small>우선관리 {candidates[selectedCandidate].rank}순위</small></div>
                    <div class="driver"><span>주요 취약 특성</span><strong>{config.brief.driverTitle}</strong><p>{config.brief.driverText} <b>{config.brief.driverValue}</b></p></div>
                    <div class="driver"><span>부족한 적응 자원</span><strong>{config.brief.gapTitle}</strong><p>{config.brief.gapText} <b>{config.brief.gapValue}</b></p></div>
                    <div class="action"><span>권고 대응</span><strong>{config.actionTitle}</strong><p>대안별 공간배치와 효과평가 결과를 다음 플랫폼으로 이관합니다.</p></div>
                </div>
            </section>
        </main>
    </div>
</div>
