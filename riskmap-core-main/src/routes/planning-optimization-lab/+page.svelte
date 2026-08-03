<script>
    import { base } from '$app/paths';
    import { onMount } from 'svelte';

    const DATA_PATH = `${base}/analysis-data/planning-optimization-lab/rcp-suwon.json`;
    const HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
    const metricOrder = ['HW33', 'TR25', 'WSDI', 'TA', 'TXx', 'TNx'];
    let catalog = null;
    let loadError = '';
    let scenario = 'RCP45';
    let targetYear = 2050;
    let metricCode = 'HW33';
    let mode = 'spatial';
    let handoff = null;

    onMount(async () => {
        try {
            const response = await fetch(DATA_PATH);
            if (!response.ok) throw new Error(`RCP 데이터 응답 오류 (${response.status})`);
            catalog = await response.json();
            scenario = catalog.scenarios.includes('RCP45') ? 'RCP45' : catalog.scenarios[0];
            targetYear = catalog.periods.find((item) => item.targetYear === 2050)?.targetYear ?? catalog.periods[0]?.targetYear;
        } catch (error) {
            loadError = error instanceof Error ? error.message : 'RCP 데이터를 불러오지 못했습니다.';
        }
        try {
            const raw = window.localStorage.getItem(HANDOFF_KEY) || window.sessionStorage.getItem(HANDOFF_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            handoff = parsed?.schemaVersion === 'priority-management-handoff/v1' ? parsed : null;
        } catch { handoff = null; }
    });

    $: metrics = catalog?.metrics ? metricOrder.map((code) => catalog.metrics.find((item) => item.code === code)).filter(Boolean) : [];
    $: metric = metrics.find((item) => item.code === metricCode) || metrics[0];
    $: baseline = catalog?.data?.[scenario]?.['2020']?.[metricCode] ?? null;
    $: future = catalog?.data?.[scenario]?.[String(targetYear)]?.[metricCode] ?? null;
    $: change = baseline != null && future != null ? future - baseline : null;
    $: changeRate = baseline && change != null ? change / baseline * 100 : null;
    $: alternatives = handoff?.alternatives || [];
    $: candidateCount = alternatives.reduce((sum, item) => sum + (item.candidates?.length || 0), 0);
    $: pathway = buildPathway(metricCode, baseline, future, targetYear);

    function number(value, digits = 1) {
        return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);
    }
    function buildPathway(code, current, projected, year) {
        const value = projected ?? current ?? 0;
        const rules = code === 'TR25' ? [10, 20, 35] : code === 'WSDI' ? [20, 40, 65] : ['TA', 'TXx', 'TNx'].includes(code) ? [current + .8, current + 1.8, current + 3] : [15, 25, 40];
        const active = value >= rules[2] ? 3 : value >= rules[1] ? 2 : value >= rules[0] ? 1 : 0;
        return [
            { title: '기존 대책 정비', trigger: '현재 기준', action: '쉼터 운영정보와 100m 취약격자를 정비하고 성과 기준선을 확정합니다.' },
            { title: '생활권 대응 확대', trigger: `1차 임계 ${number(rules[0])}`, action: '실천권역 후보에서 그늘·쉼터·쿨루프의 공간 최적화를 실행합니다.' },
            { title: '연계사업 전환', trigger: `2차 임계 ${number(rules[1])}`, action: '보건·복지·교통 운영시간과 공간사업을 묶어 연차 투자순서를 최적화합니다.' },
            { title: '도시구조 전환', trigger: `3차 임계 ${number(rules[2])}`, action: `${year}년 이전 녹지축·토지이용·공공시설 재배치 대안으로 전환합니다.` },
        ].map((item, index) => ({ ...item, state: index < active ? 'done' : index === active ? 'active' : 'future' }));
    }
</script>

<svelte:head><title>공간·시간 계획 최적화 실험실</title></svelte:head>

<main>
    <header class="lab-header"><div class="header-inner"><div><span class="experiment">EXPERIMENT · 기존 페이지와 분리</span><h1>공간·시간 계획 최적화 실험실</h1><p>시군구 계획 안에서 30~100m 공간결정과 RCP 시간경로를 분리하고 다시 연결합니다.</p></div><nav><a href={`${base}/priority-management-area/heatwave?regionCode=41110&regionName=${encodeURIComponent('경기도 수원시')}`}>기존 실천권역으로 돌아가기</a></nav></div></header>
    <section class="rule-bar">
        <article><b>계획 단위</b><strong>시군구</strong><span>행정계획의 고정 단위</span></article><article><b>공간계획</b><strong>30~100m</strong><span>입지·배분·생활권 최적화</span></article><article><b>시간계획</b><strong>연도·임계점</strong><span>RCP 기반 전환 시점</span></article><article><b>결합 원칙</b><strong>현재 × 미래</strong><span>고해상도 현황에 미래 증폭 적용</span></article>
    </section>

    {#if loadError}<section class="message">{loadError}</section>
    {:else if !catalog}<section class="message">RCP 실험자료를 불러오는 중입니다.</section>
    {:else}
        <section class="controls">
            <label>시나리오<select bind:value={scenario}>{#each catalog.scenarios as item}<option value={item}>{item.replace('RCP', 'RCP ')}</option>{/each}</select></label>
            <label>목표연도<select bind:value={targetYear}>{#each catalog.periods as item}<option value={item.targetYear}>{item.targetYear}년</option>{/each}</select></label>
            <label>시간지표<select bind:value={metricCode}>{#each metrics as item}<option value={item.code}>{item.label}</option>{/each}</select></label>
            <div class="source-note"><b>{catalog.region.name}</b><span>{catalog.provenance.model} · 원본 {catalog.provenance.sourceGrid}</span></div>
        </section>
        <section class="projection-strip">
            <article><span>2020 기준</span><strong>{number(baseline)} <small>{metric?.unit}</small></strong></article><div class="arrow">→</div><article class="future"><span>{targetYear} · {scenario}</span><strong>{number(future)} <small>{metric?.unit}</small></strong></article><article class:increase={change > 0}><span>변화량</span><strong>{change >= 0 ? '+' : ''}{number(change)} <small>{metric?.unit}</small></strong><em>{changeRate == null ? '' : `${changeRate >= 0 ? '+' : ''}${number(changeRate)}%`}</em></article><p>RCP는 시간경로와 미래 증폭계수로만 사용합니다. 약 1km 자료를 30~100m 공간정보로 표시하지 않습니다.</p>
        </section>
        <section class="mode-tabs" aria-label="실험 모드">
            <button class:active={mode === 'spatial'} onclick={() => mode = 'spatial'}><span>01</span><b>공간 최적화</b><small>어디에 무엇을 배치할까?</small></button><button class:active={mode === 'temporal'} onclick={() => mode = 'temporal'}><span>02</span><b>시간 최적화</b><small>언제 투자하고 확대할까?</small></button><button class:active={mode === 'pathway'} onclick={() => mode = 'pathway'}><span>03</span><b>적응경로</b><small>어떤 임계점에서 전환할까?</small></button>
        </section>

        {#if mode === 'spatial'}
            <section class="workspace-grid"><article class="panel map-concept"><div class="panel-head"><div><span>SPATIAL OPTIMIZATION</span><h2>실천권역 안에서 30~100m 배치</h2></div><strong>{candidateCount ? `${candidateCount}개 후보 연결` : '예시 모드'}</strong></div><div class="grid-map" aria-label="공간 최적화 개념도">{#each Array(48) as _, index}<i class:hot={index % 7 === 2 || index % 11 === 5} class:priority={[10,18,27,35].includes(index)}></i>{/each}<span class="pin p1">1</span><span class="pin p2">2</span><span class="pin p3">3</span></div><div class="legend"><span><i class="risk"></i>현재 위험 100m</span><span><i class="selected"></i>최적 배치 후보</span><span><i class="future-risk"></i>RCP 미래 증폭</span></div></article>
            <article class="panel"><div class="panel-head"><div><span>INPUT LAYERS</span><h2>현황은 100m 이하만</h2></div></div><div class="layer-list">{#each catalog.currentSpatialLayers as layer}<div><b>{layer.label}</b><span>{layer.role}</span><strong>{layer.resolution}</strong></div>{/each}</div><div class="formula"><span>목적함수 예시</span><b>위험감소 × 보호인구 × 접근성 ÷ 사업비</b><p>토지 가능 여부, 예산, 행정동 형평성, 시설 수용량을 제약조건으로 둡니다.</p></div></article></section>
        {:else if mode === 'temporal'}
            <section class="workspace-grid"><article class="panel wide"><div class="panel-head"><div><span>TEMPORAL OPTIMIZATION</span><h2>공간후보의 연차별 투자순서</h2></div><strong>{scenario} · {metric?.label}</strong></div><div class="timeline">{#each catalog.periods.filter((item) => item.targetYear >= 2050) as item}<div class:major={catalog.data[scenario][String(item.targetYear)]?.[metricCode] >= future}><span>{item.targetYear}</span><i style={`--height:${Math.max(18, Math.min(100, (catalog.data[scenario][String(item.targetYear)]?.[metricCode] || 0) / Math.max(...catalog.periods.map((p) => catalog.data[scenario][String(p.targetYear)]?.[metricCode] || 1)) * 100))}%`}></i><b>{number(catalog.data[scenario][String(item.targetYear)]?.[metricCode])}</b></div>{/each}</div><div class="schedule-cards"><article><span>단기</span><b>고위험·즉시 실행 후보</b><p>공공부지, 기존 쉼터, 가로수 보완처럼 바로 착수 가능한 사업</p></article><article><span>중기</span><b>연계사업 묶음</b><p>도로·공원·복지시설 정비주기와 맞춰 중복투자를 줄이는 사업</p></article><article><span>장기</span><b>구조 전환 후보</b><p>RCP 임계점 전에 토지이용과 녹지축을 바꾸는 선제 사업</p></article></div></article></section>
        {:else}
            <section class="panel pathway-panel"><div class="panel-head"><div><span>ADAPTATION PATHWAY</span><h2>{metric?.label} 임계점 기반 전환경로</h2></div><strong>{targetYear} 전망 {number(future)} {metric?.unit}</strong></div><div class="pathway">{#each pathway as step, index}<article class:active={step.state === 'active'} class:done={step.state === 'done'}><span>{String(index + 1).padStart(2, '0')}</span><small>{step.trigger}</small><h3>{step.title}</h3><p>{step.action}</p></article>{#if index < pathway.length - 1}<div class="connector">→</div>{/if}{/each}</div><div class="pathway-note"><b>적응경로가 전환 시점을 정하고</b><span>각 단계의 공간 최적화가 대상지와 사업량을 정합니다.</span></div></section>
        {/if}
    {/if}
</main>

<style>
    :global(body){margin:0;min-width:0;background:#f2f5f4;color:#102b2a;font-family:Pretendard,"Noto Sans KR",Arial,sans-serif}.lab-header{background:linear-gradient(125deg,#0d302f,#0d514b 55%,#16665a);color:white;padding:26px 32px}.header-inner{display:flex;justify-content:space-between;gap:32px;align-items:end;max-width:1400px;margin:auto}.experiment{display:inline-flex;border:1px solid #6ee7b7;border-radius:999px;background:#064e3b;padding:7px 11px;color:#a7f3d0;font-size:11px;font-weight:900;letter-spacing:.08em}.lab-header h1{margin:16px 0 6px;font-size:36px;letter-spacing:-.045em}.lab-header p{margin:0;color:#c7ded9}.lab-header a{display:inline-flex;border:1px solid #9ac0b8;border-radius:8px;color:white;text-decoration:none;padding:11px 14px;font-size:12px;font-weight:900}.rule-bar{display:grid;grid-template-columns:repeat(4,1fr);max-width:1400px;margin:-12px auto 22px;border-radius:14px;background:white;box-shadow:0 12px 32px #0f29231a;overflow:hidden}.rule-bar article{display:grid;gap:3px;padding:18px 20px;border-right:1px solid #e1e9e6}.rule-bar b{font-size:10px;color:#718580}.rule-bar strong{font-size:19px;color:#0f4f48}.rule-bar span{font-size:11px;color:#718580}.controls,.projection-strip,.mode-tabs,.workspace-grid,.pathway-panel,.message{max-width:1400px;margin:0 auto 18px}.controls{display:grid;grid-template-columns:180px 180px 220px 1fr;gap:12px;align-items:end}.controls label{font-size:11px;font-weight:900;color:#506a65}.controls select{display:block;width:100%;margin-top:6px;border:1px solid #cbdad6;border-radius:8px;background:white;padding:11px;font:inherit;font-weight:800;color:#173e3a}.source-note{display:grid;gap:3px;padding:8px 0 8px 20px;border-left:3px solid #d97706}.source-note span{font-size:10px;color:#657a75}.projection-strip{display:grid;grid-template-columns:170px 30px 190px 190px 1fr;gap:12px;align-items:center;border:1px solid #dbe5e2;border-radius:14px;background:#fff;padding:16px}.projection-strip article{display:grid;gap:4px;border-radius:10px;background:#edf5f2;padding:12px}.projection-strip article.future{background:#e4f4ed}.projection-strip article.increase{background:#fff0e8}.projection-strip span{font-size:10px;color:#687d78;font-weight:800}.projection-strip strong{font-size:22px}.projection-strip small{font-size:10px}.projection-strip em{font-size:11px;color:#c65c35;font-style:normal;font-weight:900}.projection-strip .arrow{text-align:center;color:#90a6a0;font-size:20px}.projection-strip p{margin:0;color:#61756f;font-size:11px;line-height:1.6}.mode-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mode-tabs button{display:grid;grid-template-columns:32px 1fr;gap:1px 10px;border:1px solid #d7e2df;border-radius:12px;background:#fff;padding:15px;text-align:left;color:#536b66}.mode-tabs button span{grid-row:1/3;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#e9f0ee;font-size:10px;font-weight:900}.mode-tabs b{font-size:14px;color:#183d39}.mode-tabs small{font-size:10px}.mode-tabs button.active{border-color:#0f766e;background:#eaf8f3;box-shadow:inset 0 0 0 1px #0f766e}.mode-tabs button.active span{background:#0f766e;color:white}.workspace-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:16px}.panel{border:1px solid #d9e4e1;border-radius:15px;background:#fff;box-shadow:0 10px 26px #18332b0c;padding:20px}.panel.wide{grid-column:1/-1}.panel-head{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:16px}.panel-head span{font-size:9px;letter-spacing:.12em;color:#668079;font-weight:900}.panel-head h2{margin:5px 0 0;font-size:20px}.panel-head>strong{border-radius:999px;background:#e9f6f1;color:#0f6a5e;padding:7px 10px;font-size:10px}.grid-map{position:relative;display:grid;grid-template-columns:repeat(8,1fr);gap:3px;min-height:350px;border-radius:13px;background:linear-gradient(135deg,#dfece7,#cadfd7);padding:18px;overflow:hidden}.grid-map i{border-radius:4px;background:#8bc8b2aa}.grid-map i:nth-child(3n){background:#b5d7c9}.grid-map i.hot{background:#e69a6a}.grid-map i.priority{background:#d55838;box-shadow:inset 0 0 0 2px #fff}.pin{position:absolute;display:grid;place-items:center;width:30px;height:30px;border:3px solid white;border-radius:50%;background:#083e3a;color:white;box-shadow:0 5px 12px #173b3777;font-size:11px;font-weight:900}.p1{left:27%;top:29%}.p2{left:58%;top:54%}.p3{left:72%;top:23%}.legend{display:flex;gap:18px;margin-top:12px;font-size:10px;color:#5b716b}.legend i{display:inline-block;width:11px;height:11px;margin-right:5px;border-radius:3px;vertical-align:-2px}.legend .risk{background:#e69a6a}.legend .selected{background:#083e3a}.legend .future-risk{border:2px dashed #d55838}.layer-list{display:grid;gap:7px}.layer-list div{display:grid;grid-template-columns:1fr auto;gap:2px 10px;border-radius:9px;background:#f3f7f5;padding:10px}.layer-list b{font-size:11px}.layer-list span{grid-column:1;font-size:9px;color:#70837e}.layer-list strong{grid-column:2;grid-row:1/3;align-self:center;color:#0f766e;font-size:10px}.formula{margin-top:14px;border-left:3px solid #d97706;background:#fff8ed;padding:13px}.formula span{font-size:9px;color:#9a5d16}.formula b{display:block;margin:5px 0;font-size:12px}.formula p{margin:0;color:#7c6a55;font-size:10px;line-height:1.5}.timeline{display:flex;align-items:end;justify-content:space-around;height:260px;border-bottom:1px solid #b7c9c4;padding:20px 20px 0;background:linear-gradient(#f8fbfa,#fff)}.timeline div{display:grid;justify-items:center;align-items:end;gap:6px;height:100%;font-size:10px}.timeline i{width:34px;height:var(--height);min-height:18px;border-radius:6px 6px 0 0;background:#86b9a8}.timeline div.major i{background:#d56b43}.timeline span{align-self:start;color:#6d817c;font-weight:900}.timeline b{font-size:10px}.schedule-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.schedule-cards article{border-radius:10px;background:#f0f6f3;padding:14px}.schedule-cards span{font-size:9px;color:#0f766e;font-weight:900}.schedule-cards b{display:block;margin:5px 0;font-size:12px}.schedule-cards p{margin:0;color:#677b76;font-size:10px;line-height:1.55}.pathway{display:grid;grid-template-columns:1fr 26px 1fr 26px 1fr 26px 1fr;align-items:stretch}.pathway article{border:1px solid #dae4e1;border-radius:12px;background:#f6f9f8;padding:16px}.pathway article.active{border:2px solid #d56b43;background:#fff2eb}.pathway article.done{border-color:#7fb4a4;background:#e9f6f1}.pathway article>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#ccd9d5;font-size:10px;font-weight:900}.pathway article.active>span{background:#d56b43;color:white}.pathway article.done>span{background:#0f766e;color:white}.pathway small{display:block;margin-top:13px;color:#b4532f;font-weight:900}.pathway h3{margin:5px 0 7px;font-size:15px}.pathway p{margin:0;color:#687b76;font-size:10px;line-height:1.55}.connector{display:grid;place-items:center;color:#88a19a;font-weight:900}.pathway-note{display:flex;justify-content:center;gap:8px;margin-top:18px;border-radius:10px;background:#123e3a;color:white;padding:13px;font-size:11px}.pathway-note span{color:#bcd5cf}.message{border-radius:12px;background:white;padding:30px;text-align:center;color:#64748b}@media(max-width:900px){.header-inner,.pathway-note{display:grid}.rule-bar,.controls,.projection-strip,.mode-tabs,.workspace-grid,.schedule-cards{grid-template-columns:1fr;margin-left:14px;margin-right:14px}.pathway{grid-template-columns:1fr}.connector{height:28px;transform:rotate(90deg)}.lab-header h1{font-size:28px}}
</style>
