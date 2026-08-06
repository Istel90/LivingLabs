<script>
    import { base } from '$app/paths';
    import { onMount } from 'svelte';
    import PlanningBaseMap from '$lib/maps/PlanningBaseMap.svelte';
    import SourceBadge from '$lib/ui/SourceBadge.svelte';
    import { SOURCE_CATALOG } from '$lib/data/sourceCatalog.js';
    import BudgetOptimizationControls from '$lib/planning/BudgetOptimizationControls.svelte';
    import BudgetOptimizationResult from '$lib/planning/BudgetOptimizationResult.svelte';
    import SpatialLayerCatalog from '$lib/planning/SpatialLayerCatalog.svelte';
    import AdaptationMetroMap from '$lib/planning/AdaptationMetroMap.svelte';

    const DATA_PATH = `${base}/analysis-data/planning-optimization-lab/rcp-regions.json`;
    const PLAN_PATH = `${base}/analysis-data/planning-optimization-lab/heatwave-adaptation-catalog.json`;
    const HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
    const SPATIAL_LAYER_FILES = {
        lst: { path: '/analysis-data/suwon-lst-100m-epsg5179-grid.json' },
        resident: { path: '/analysis-data/population/E_population_resident_count_100m.json' },
        floating: { path: '/analysis-data/floating-population/E_floating_population_work_count_proxy_100m_z.json' },
        elderly: { path: '/analysis-data/population/V_sensitivity_elderly_ratio_100m.json' },
        shelter: { path: '/analysis-data/cooling-shelter/V_adaptive_cooling_shelter_distance_100m_z.json' },
        green: { path: '/analysis-data/admin-physical/V_adaptive_green_natural_ratio_100m.json', invert: true },
        daytime: { path: '/analysis-data/floating-population/E_daytime_exposure_proxy_100m_z.json' },
        workplace: { path: '/analysis-data/floating-population/E_workplace_employee_count_proxy_100m_z.json' },
        commute: { path: '/analysis-data/floating-population/E_commute_in_centrality_100m_z.json' },
        children: { path: '/analysis-data/population/V_sensitivity_children_ratio_100m.json' },
        single: { path: '/analysis-data/admin-physical/V_sensitivity_single_household_ratio_100m_z.json' },
        health: { path: '/analysis-data/admin-physical/V_sensitivity_chronic_disease_ratio_proxy_100m_z.json' },
        lowincome: { path: '/analysis-data/admin-physical/V_adaptive_low_income_ratio_proxy_100m_z.json' },
        oldhousing: { path: '/analysis-data/admin-physical/V_adaptive_old_housing_area_ratio_100m_z.json' },
        oldbuilding: { path: '/analysis-data/admin-physical/V_adaptive_old_building_area_ratio_100m_z.json' },
        shelterAccess: { path: '/analysis-data/cooling-shelter/V_adaptive_cooling_shelter_accessibility_100m_z.json', invert: true }
    };
    const steps = [
        ['계획 범위', '시군구와 위험유형'],
        ['현재 공간정보', '30~100m 지표'],
        ['미래 시간정보', 'RCP·목표연도'],
        ['최적화 조건', '목적·예산·제약'],
        ['최적화 실행', '공간·시간 결과'],
        ['적응경로', '임계점과 전환대책'],
    ];
    let catalog = null;
    let planCatalog = null;
    let error = '';
    let selectedSido = '경기도';
    let regionCode = '41110';
    let scenario = 'RCP45';
    let year = 2050;
    let metricCode = 'HW33';
    let activeStep = 0;
    let mode = 'spatial';
    let budget = 1000;
    let optimizationResult = null;
    let deploymentSites = [];
    let activeSpatialLayerId = 'lst';
    let spatialGrid = null;
    let spatialLayerStatus = '100m 공간격자를 준비하고 있습니다.';
    let spatialRequestId = 0;
    let candidates = [];
    let handoff = null;
    let analysisMessage = '조건을 설정한 뒤 최적화를 실행하세요.';

    onMount(async () => {
        try {
            const [response, planResponse] = await Promise.all([fetch(DATA_PATH), fetch(PLAN_PATH)]);
            if (!response.ok) throw new Error(`지역 RCP 데이터 응답 오류 (${response.status})`);
            if (!planResponse.ok) throw new Error(`적응사업 카탈로그 응답 오류 (${planResponse.status})`);
            catalog = await response.json();
            planCatalog = await planResponse.json();
            const defaultRegion = catalog.regions.find((item) => item.code === catalog.defaultRegionCode);
            selectedSido = defaultRegion?.sido || catalog.regions[0]?.sido;
            regionCode = defaultRegion?.code || catalog.regions[0]?.code;
            await selectSpatialLayer(activeSpatialLayerId);
        } catch (loadError) {
            error = loadError instanceof Error ? loadError.message : '실험자료를 불러오지 못했습니다.';
        }
        try {
            const raw = window.localStorage.getItem(HANDOFF_KEY) || window.sessionStorage.getItem(HANDOFF_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            handoff = parsed?.schemaVersion === 'priority-management-handoff/v1' ? parsed : null;
        } catch { handoff = null; }
    });

    $: sidos = catalog ? [...new Set(catalog.regions.map((item) => item.sido))] : [];
    $: availableRegions = catalog?.regions.filter((item) => item.sido === selectedSido) || [];
    $: selectedRegion = catalog?.regions.find((item) => item.code === regionCode) || availableRegions[0];
    $: metrics = catalog?.metrics || [];
    $: metric = metrics.find((item) => item.code === metricCode) || metrics[0];
    $: regionData = catalog?.data?.[regionCode] || null;
    $: baseline = regionData?.[scenario]?.['2020']?.[metricCode] ?? null;
    $: future = regionData?.[scenario]?.[String(year)]?.[metricCode] ?? null;
    $: change = baseline != null && future != null ? future - baseline : null;
    $: increaseFactor = baseline > 0 && future != null ? future / baseline : 1;
    $: spatialReady = regionCode === '41110';
    $: inheritedAlternatives = handoff?.regionCode === regionCode ? handoff.alternatives || [] : [];
    $: inheritedCount = inheritedAlternatives.reduce((sum, item) => sum + (item.candidates?.length || 0), 0);
    $: pathway = makePathway(metricCode, baseline, future, year);
    $: projectionSeries = (catalog?.periods || []).map((period) => ({
        year: Number(period.targetYear),
        value: catalog?.data?.[regionCode]?.[scenario]?.[String(period.targetYear)]?.[metricCode] ?? null
    })).filter((item) => item.value != null);
    $: activeSpatialLayer = catalog?.spatialLayers.find((item) => item.id === activeSpatialLayerId);

    function changeSido(event) {
        selectedSido = event.currentTarget.value;
        regionCode = catalog.regions.find((item) => item.sido === selectedSido)?.code || '';
        syncSpatialLayerForRegion();
        resetResults();
    }
    function changeRegion(event) {
        regionCode = event.currentTarget.value;
        syncSpatialLayerForRegion();
        resetResults();
    }
    function resetResults() {
        candidates = [];
        deploymentSites = [];
        optimizationResult = null;
        activeStep = 0;
        analysisMessage = '새 행정구역 조건으로 최적화를 실행하세요.';
    }
    function syncSpatialLayerForRegion() {
        if (regionCode === '41110') {
            void selectSpatialLayer(activeSpatialLayerId || 'lst');
        } else {
            spatialGrid = null;
            spatialLayerStatus = '현재 100m 실증 공간자료는 수원시에만 연결되어 있습니다.';
        }
    }
    async function selectSpatialLayer(id) {
        activeSpatialLayerId = id;
        if (regionCode !== '41110') {
            spatialGrid = null;
            spatialLayerStatus = '현재 100m 실증 공간자료는 수원시에만 연결되어 있습니다.';
            return;
        }
        const config = SPATIAL_LAYER_FILES[id];
        if (!config) return;
        const requestId = ++spatialRequestId;
        const label = catalog?.spatialLayers.find((item) => item.id === id)?.name || id;
        spatialLayerStatus = `${label} 100m 격자를 불러오는 중입니다.`;
        try {
            const response = await fetch(`${base}${config.path}`);
            if (!response.ok) throw new Error(`공간격자 응답 오류 (${response.status})`);
            const payload = await response.json();
            if (requestId !== spatialRequestId) return;
            const values = config.invert
                ? payload.values.map((value) => Number.isFinite(value) ? 1 - value : null)
                : payload.values;
            spatialGrid = { ...payload, values };
            spatialLayerStatus = `${label} · 실제 100m 격자 ${Number(payload.stats?.validCells || 0).toLocaleString()}셀 표시 중`;
        } catch (loadError) {
            if (requestId !== spatialRequestId) return;
            spatialGrid = null;
            spatialLayerStatus = loadError instanceof Error ? loadError.message : '공간격자를 불러오지 못했습니다.';
        }
    }
    function format(value, digits = 1) {
        return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits);
    }
    function buildBudgetOptimization(inputBudget) {
        const safeBudget = Math.max(0, Math.min(100000, Math.floor(Number(inputBudget) || 0)));
        const allocations = planCatalog.projects.map((project) => {
            const target = safeBudget * project.allocationShare;
            const quantity = Math.floor(target / project.unitCost);
            return { ...project, quantity, cost: quantity * project.unitCost };
        });
        let spent = allocations.reduce((sum, item) => sum + item.cost, 0);
        let remaining = safeBudget - spent;
        const refillOrder = [...allocations].sort((a, b) => (b.allocationShare / b.unitCost) - (a.allocationShare / a.unitCost));
        let guard = 0;
        while (remaining > 0 && guard < 100000) {
            const next = refillOrder.find((item) => item.unitCost <= remaining);
            if (!next) break;
            next.quantity += 1;
            next.cost += next.unitCost;
            spent += next.unitCost;
            remaining -= next.unitCost;
            guard += 1;
        }
        const sites = allocations.flatMap((allocation) => {
            if (!allocation.quantity) return [];
            const projectSeeds = planCatalog.candidateSites
                .filter((site) => site.projectId === allocation.id)
                .sort((a, b) => b.priority - a.priority);
            return Array.from({ length: allocation.quantity }, (_, unitIndex) => {
                const seed = projectSeeds[unitIndex % Math.max(1, projectSeeds.length)] || {};
                return {
                    ...seed,
                    id: `${allocation.id}-unit-${unitIndex + 1}`,
                    projectId: allocation.id,
                    projectName: allocation.name,
                    unit: allocation.unit,
                    color: allocation.color,
                    quantity: 1,
                    location: `${seed.location || allocation.name} · ${unitIndex + 1}번 배치점`
                };
            });
        });
        return { budget: safeBudget, spent, remaining, allocations, sites };
    }
    function runOptimization() {
        if (mode === 'pathway') {
            candidates = [];
            deploymentSites = [];
            activeStep = 5;
            analysisMessage = `${planCatalog.decisionIndicator?.label || '폭염일수'} 임계값에 따른 사업 진입·확대·종료·전환경로를 표시했습니다.`;
            return;
        }
        optimizationResult = buildBudgetOptimization(budget);
        deploymentSites = optimizationResult.sites;
        candidates = optimizationResult.sites.map((site, index) => ({ ...site, rank: index + 1, name: site.location }));
        activeStep = 4;
        analysisMessage = `총예산 ${optimizationResult.budget.toLocaleString()}백만원 중 ${optimizationResult.spent.toLocaleString()}백만원을 6개 적응사업에 배정하고 ${deploymentSites.length}개 후보지에 표시했습니다.`;
    }
    function makePathway(code, current, projected, targetYear) {
        const value = projected ?? current ?? 0;
        const thresholds = code === 'TR25' ? [10, 20, 35] : code === 'WSDI' ? [20, 40, 65] : code === 'TA' || code === 'TXx' || code === 'TNx' ? [(current || 0) + .8, (current || 0) + 1.8, (current || 0) + 3] : [15, 25, 40];
        const currentStage = value >= thresholds[2] ? 3 : value >= thresholds[1] ? 2 : value >= thresholds[0] ? 1 : 0;
        return [
            ['기준선 관리', '현재', '100m 위험·노출·취약성 기준선을 확정하고 기존 시설 성과를 점검'],
            ['생활권 대책 확대', `≥ ${format(thresholds[0])}`, '실천권역 후보에 쉼터·그늘·쿨루프 공간 최적화 적용'],
            ['운영·공간 통합', `≥ ${format(thresholds[1])}`, '복지·보건 운영시간과 공간사업의 연차 투자순서 최적화'],
            ['도시구조 전환', `≥ ${format(thresholds[2])}`, `${targetYear}년 전 녹지축·토지이용·공공시설 재배치`],
        ].map((item, index) => ({ title: item[0], trigger: item[1], action: item[2], state: index < currentStage ? 'done' : index === currentStage ? 'active' : 'future' }));
    }
</script>

<svelte:head><title>Climate Risk Lab | 공간·시간 최적화</title></svelte:head>

{#if error}<main class="message">{error}</main>
{:else if !catalog || !planCatalog}<main class="message">지역별 RCP와 폭염 적응사업 카탈로그를 불러오는 중입니다.</main>
{:else}
<div class="tool-shell">
    <header class="topbar">
        <div class="brand"><div class="brand-mark">CR</div><div><strong>Climate Risk Lab</strong><span>기후위험 평가·의사결정 지원</span></div></div>
        <div class="project-meta"><div><span>프로젝트</span><strong>{selectedRegion?.name} 공간·시간 계획</strong></div><a class="ghost-link" href={`${base}/national-indicator-status`}>전국 지표 구축 현황</a><a class="ghost-link" href={`${base}/priority-management-area/heatwave?regionCode=${regionCode}&regionName=${encodeURIComponent(`${selectedRegion?.sido} ${selectedRegion?.name}`)}`}>실천권역 분석으로 돌아가기</a><div class="avatar">실험</div></div>
    </header>

    <div class="workspace">
        <aside class="sidebar">
            <div class="side-title">계획 워크플로우 <span>실험</span></div>
            <nav>{#each steps as step, index}<button class:active={activeStep === index} class:complete={activeStep > index} onclick={() => activeStep = index}><span class="step-num">{activeStep > index ? '✓' : index + 1}</span><span>{step[0]}<small>{step[1]}</small></span></button>{/each}</nav>
            <div class="formula-card"><span>결합 원칙</span><strong>현재 공간위험 × 미래 증폭</strong><p>행정계획 단위는 시군구로 고정하고 공간결정은 30~100m, 시간결정은 RCP 연도·임계점으로 분리합니다.</p></div>
        </aside>

        <main class="main">
            <section class="hero"><div><span class="eyebrow">SPATIAL · TEMPORAL · PATHWAY</span><h1>실천권역을 <em>실행계획</em>으로</h1><p>행정구역별 현재 공간정보와 미래 기후경로를 연결해 위치, 투자시기, 전환조건을 함께 실험합니다.</p></div><div class="hero-actions"><label>시도<select value={selectedSido} onchange={changeSido}>{#each sidos as sido}<option value={sido}>{sido}</option>{/each}</select></label><label>시군구<select value={regionCode} onchange={changeRegion}>{#each availableRegions as region}<option value={region.code}>{region.name}</option>{/each}</select></label></div></section>

            <section class="mode-tabs"><button class:active={mode === 'spatial'} onclick={() => { mode='spatial'; activeStep=3; }}>공간 최적화<small>30~100m 입지·배분</small></button><button class:active={mode === 'temporal'} onclick={() => { mode='temporal'; activeStep=3; }}>시간 최적화<small>연차별 투자순서</small></button><button class:active={mode === 'pathway'} onclick={() => { mode='pathway'; activeStep=5; }}>적응경로<small>임계점·전환대책</small></button></section>

            <section class="map-section">
                <div class="map-wrap"><PlanningBaseMap regionCode={regionCode} regionName={selectedRegion?.name} height="620px" showCadastral={false} locked={true} riskGrid={spatialGrid} layerLabel={spatialGrid ? activeSpatialLayer?.name : ""} adaptationSites={deploymentSites}/><div class="map-banner"><b>{selectedRegion?.name}</b><span>{spatialReady ? '100m 실증 공간자료 연결' : 'RCP 시간정보 연결 · 공간자료 대기'}</span></div></div>
                <aside class="control-panel">
                    <h2>{mode === 'spatial' ? '공간 배치 조건' : mode === 'temporal' ? '시간 투자 조건' : '적응경로 조건'}</h2>
                    <label>RCP 시나리오<select bind:value={scenario}>{#each catalog.scenarios as item}<option value={item}>{item}</option>{/each}</select></label><label>목표연도<select bind:value={year}>{#each catalog.periods as item}<option value={item.targetYear}>{item.targetYear}년</option>{/each}</select></label><label>계획 판단지표(적응목표)<select bind:value={metricCode}>{#each metrics as item}<option value={item.code}>{item.label}</option>{/each}</select></label><p class="decision-help">지자체의 적응목표입니다. 이 목표를 기준으로 사업 물량, 최근 5년 투자순서, 2100년까지의 전환 임계점을 연결합니다.</p>
                    <div class="projection"><span>2020 기준<b>{format(baseline)} {metric?.unit}</b></span><i>→</i><span>{year} 전망<b>{format(future)} {metric?.unit}</b></span><strong>{change >= 0 ? '+' : ''}{format(change)}</strong></div>
                    <BudgetOptimizationControls catalog={planCatalog} {budget} onBudgetChange={(value) => { budget = value; optimizationResult = null; deploymentSites = []; candidates = []; }}/>
                    <button class="run" onclick={runOptimization}>{mode === 'pathway' ? '적응경로 확인' : mode === 'spatial' ? '예산 기반 공간최적화 실행' : '예산 기반 연차배분 실행'}</button><p class="status">{analysisMessage}</p>
                </aside>
            </section>

            {#if mode !== 'spatial'}
                <AdaptationMetroMap projects={planCatalog.projects} {projectionSeries} metricLabel={metric?.label} metricUnit={metric?.unit} {scenario} result={optimizationResult} {mode}/>
            {/if}

            <section class="lower-grid">
                <SpatialLayerCatalog layers={catalog.spatialLayers} activeId={activeSpatialLayerId} ready={spatialReady} status={spatialLayerStatus} onSelect={selectSpatialLayer}/>
                <BudgetOptimizationResult result={optimizationResult} {mode} pathway={planCatalog.pathway}/>
            </section>
        </main>

        <aside class="dashboard">
            <h2>계획 요약</h2>
            <section><h3>선택 행정구역</h3><SourceBadge source={SOURCE_CATALOG.adminBoundary}/><b>{selectedRegion?.name}</b><span>코드 {regionCode} · RCP 격자 {selectedRegion?.cellCount || 0}셀</span></section>
            <section><h3>해상도 판정</h3><SourceBadge source={SOURCE_CATALOG.spatialPilot}/><dl><div><dt>계획단위</dt><dd>시군구</dd></div><div><dt>공간결정</dt><dd>30~100m</dd></div><div><dt>시간결정</dt><dd>연도·임계점</dd></div><div><dt>RCP 원본</dt><dd>약 1km</dd></div></dl></section>
            <section><h3>실천권역 연계</h3><SourceBadge source={SOURCE_CATALOG.priorityHandoff}/><b>{inheritedCount ? `${inheritedCount}개 후보 수신` : '연결 후보 없음'}</b><span>{inheritedCount ? '저장된 실천권역 후보를 최적화 입력에 반영합니다.' : '기존 실천권역에서 후보를 저장하면 이곳에서 이어서 비교합니다.'}</span></section>
            <section><h3>{metric?.label} 미래 변화</h3><SourceBadge source={SOURCE_CATALOG.rcpProjection}/><b>{format(baseline)} → {format(future)} {metric?.unit}</b><span>{scenario} · 모델 기준 2020년 대비 {year}년 · 변화 {change >= 0 ? '+' : ''}{format(change)} {metric?.unit}</span><progress max="3" value={Math.min(3, Math.max(0, increaseFactor))}></progress></section>
        </aside>
    </div>
</div>
{/if}

<style>
    :global(body){margin:0;min-width:1180px;background:#f3f5f1;color:#172727;font-family:Inter,Pretendard,"Noto Sans KR",Arial,sans-serif}.tool-shell{min-height:100vh}.topbar{height:74px;background:#102f2d;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid #31504d}.brand,.project-meta,.brand>div,.project-meta>div{display:flex;align-items:center}.brand{gap:12px}.brand-mark{width:38px;height:38px;border:1px solid #97b6a9;color:#c8e2ce;display:grid;place-items:center;border-radius:5px;font-weight:800}.brand>div,.project-meta>div{flex-direction:column;align-items:flex-start}.brand strong{font-size:15px}.brand span,.project-meta span{font-size:10px;color:#9fb6b2;margin-top:3px}.project-meta{gap:18px}.project-meta strong{font-size:12px}.avatar{width:35px;height:35px;border-radius:50%;background:#dce9dc;color:#173a35;display:grid!important;place-items:center;font-size:10px;font-weight:800}.ghost-link{border:1px solid #55716d;color:white;padding:9px 12px;border-radius:5px;font-size:11px;font-weight:700;text-decoration:none}.workspace{display:grid;grid-template-columns:230px minmax(700px,1fr) 300px}.sidebar{background:#173a37;color:#e9f2ef;padding:26px 16px;min-height:calc(100vh - 74px)}.side-title{font-size:11px;color:#acc1bd;letter-spacing:.08em;padding:0 9px 14px;border-bottom:1px solid #34514e;display:flex;justify-content:space-between}.side-title span{color:#d9d291}.sidebar nav{margin-top:12px;display:grid;gap:4px}.sidebar nav button{border:0;background:transparent;color:#bdd0cd;border-radius:6px;padding:11px 9px;display:flex;gap:10px;text-align:left}.sidebar nav button.active{background:#f2f4ed;color:#173a37}.step-num{width:22px;height:22px;border:1px solid #607b77;border-radius:50%;display:grid;place-items:center;flex:none;font-size:10px}.sidebar nav button.complete .step-num{background:#77956e;color:white}.sidebar nav button span:nth-child(2){font-size:12px;font-weight:700}.sidebar small{display:block;margin-top:4px;color:#79928e;font-size:9px}.formula-card{margin-top:28px;padding:14px;background:#102f2d;border-left:2px solid #d3c772}.formula-card span{font-size:9px;color:#8eaaa5}.formula-card strong{display:block;color:#e0d584;margin:8px 0}.formula-card p{font-size:9px;line-height:1.6;color:#8eaaa5;margin:0}.main{padding:30px;min-width:0}.hero{display:flex;justify-content:space-between;align-items:end;padding-bottom:22px;border-bottom:1px solid #cfd8d0}.eyebrow{font-size:9px;letter-spacing:.18em;color:#758b82;font-weight:700}.hero h1{margin:9px 0;font:700 34px/1.12 Georgia,"Noto Serif KR",serif;color:#173a37}.hero h1 em{color:#c46443;font-style:normal}.hero p{font-size:11px;color:#6d7f79;margin:0}.hero-actions{display:flex;gap:10px}.hero-actions label,.control-panel>label{font-size:9px;color:#71837c;font-weight:700}.hero select,.control-panel select,.control-panel input{display:block;margin-top:5px;border:1px solid #cad4cc;background:white;padding:9px;border-radius:4px;font-size:11px;color:#244a45}.hero select{width:150px}.mode-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.mode-tabs button{display:grid;gap:3px;border:1px solid #cad6d1;background:white;color:#49645f;border-radius:6px;padding:11px;text-align:left;font-size:12px;font-weight:800}.mode-tabs button small{font-size:9px;color:#7b8f8a}.mode-tabs button.active{border-color:#c46443;background:#fff5ef;color:#a94328}.map-section{display:grid;grid-template-columns:minmax(430px,1fr) 310px;gap:12px}.map-wrap{position:relative;height:440px;overflow:hidden;border:1px solid #cdd9d5;border-radius:8px;background:#dcebe6}.map-banner{position:absolute;z-index:600;top:12px;left:50%;transform:translateX(-50%);display:grid;gap:2px;border-radius:6px;background:#102f2de8;color:white;padding:8px 14px;text-align:center}.map-banner b{font-size:12px}.map-banner span{font-size:9px;color:#bdd3ce}.candidate-overlay span{position:absolute;z-index:650;left:var(--x);top:var(--y);display:grid;place-items:center;width:27px;height:27px;border:2px solid white;border-radius:50%;background:#c85d3e;color:white;box-shadow:0 3px 8px #0005;font-size:10px;font-weight:900}.control-panel{border:1px solid #d5dfdb;border-radius:8px;background:white;padding:15px}.control-panel h2{margin:0 0 12px;font-size:16px}.control-panel>label{display:block;margin:9px 0}.control-panel select,.control-panel input{width:100%;box-sizing:border-box}.projection{display:grid;grid-template-columns:1fr 18px 1fr;align-items:center;gap:4px;margin:12px 0;border-radius:6px;background:#edf4f1;padding:9px}.projection span{font-size:9px;color:#687c77}.projection b{display:block;margin-top:3px;color:#173a37;font-size:12px}.projection i{text-align:center}.projection>strong{grid-column:1/-1;color:#bd5437;font-size:11px}.two-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.two-fields label{font-size:9px;color:#71837c}.two-fields small{font-size:8px;color:#71837c}.control-panel fieldset{display:grid;gap:5px;margin:11px 0;border:1px solid #dce5e2;border-radius:6px;font-size:10px}.control-panel fieldset label{display:flex;gap:6px;align-items:center}.control-panel fieldset input{width:auto;margin:0}.run{width:100%;border:0;border-radius:5px;background:#c85d3e;color:white;padding:11px;font-size:11px;font-weight:800}.status{margin:9px 0 0;color:#657a74;font-size:9px;line-height:1.5}.lower-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.data-panel,.result-panel{border:1px solid #d5dfdb;border-radius:8px;background:white;padding:14px}.data-panel header,.result-panel header{display:flex;justify-content:space-between;align-items:start;margin-bottom:10px}.data-panel header span,.result-panel header span{font-size:8px;letter-spacing:.12em;color:#728780;font-weight:800}.data-panel h2,.result-panel h2{margin:3px 0 0;font-size:15px}.data-panel header>strong,.result-panel header>strong{border-radius:999px;background:#edf5f1;color:#18705f;padding:5px 8px;font-size:9px}.layer-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.layer-grid button{display:grid;grid-template-columns:22px 1fr;gap:2px 7px;border:1px solid #dce5e2;border-radius:6px;background:#f8faf9;padding:8px;text-align:left}.layer-grid button.selected{border-color:#6ca997;background:#eaf6f1}.layer-grid button>span{grid-row:1/4;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#dce7e3;color:#2d665d;font-size:9px}.layer-grid b{font-size:10px}.layer-grid small,.layer-grid em{font-size:8px;color:#738680;font-style:normal}.candidate-list{display:grid;gap:5px;max-height:250px;overflow:auto}.candidate-list article{display:grid;grid-template-columns:25px 1fr auto;align-items:center;gap:8px;border-bottom:1px solid #e2e8e5;padding:6px}.candidate-list article>b{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#c85d3e;color:white;font-size:9px}.candidate-list article div{display:grid;gap:2px}.candidate-list strong{font-size:10px}.candidate-list span{font-size:8px;color:#748680}.candidate-list em{font-size:10px;color:#0f766e;font-style:normal;font-weight:900}.empty{display:grid;place-items:center;min-height:160px;color:#71837e;font-size:10px;text-align:center}.pathway{display:grid;gap:5px}.pathway article{display:grid;grid-template-columns:24px 1fr;gap:8px;border:1px solid #dce5e2;border-radius:6px;background:#f8faf9;padding:8px}.pathway article.active{border-color:#d46d4d;background:#fff3ec}.pathway article.done{background:#eaf6f1}.pathway article>span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#cddbd6;font-size:9px}.pathway article.active>span{background:#c85d3e;color:white}.pathway article.done>span{background:#18705f;color:white}.pathway article div{display:grid;gap:2px}.pathway small{color:#a44e35;font-size:8px}.pathway b{font-size:10px}.pathway p{margin:0;color:#6f817c;font-size:8px;line-height:1.4}.dashboard{border-left:1px solid #d8e1de;background:#f8faf9;padding:22px 14px}.dashboard>h2{font-size:16px;margin:0 0 12px}.dashboard section{display:grid;gap:5px;margin-bottom:10px;border:1px solid #dbe4e1;border-radius:7px;background:white;padding:11px}.dashboard h3{margin:0;font-size:9px;color:#70847e}.dashboard section>b{font-size:12px}.dashboard section>span{font-size:9px;color:#6f817c;line-height:1.5}.dashboard dl{display:grid;gap:5px;margin:0}.dashboard dl div{display:flex;justify-content:space-between;font-size:9px}.dashboard dd{margin:0;font-weight:800}.dashboard progress{width:100%}.message{display:grid;place-items:center;min-height:100vh;background:#eef4f1;color:#64748b}@media(max-width:1200px){.workspace{grid-template-columns:210px 1fr}.dashboard{display:none}}
.layer-grid button:disabled{cursor:not-allowed;opacity:.5}.layer-grid button.selected{box-shadow:inset 0 0 0 1px #18705f}.spatial-status{margin:10px 0 0;padding:8px 10px;border-radius:6px;background:#edf5f1;color:#315e56;font-size:9px;font-weight:700;line-height:1.4}.decision-help{margin:6px 0 10px;padding:7px;border-left:2px solid #c85d3e;background:#fff7f2;color:#74645d;font-size:8px;line-height:1.45}</style>
