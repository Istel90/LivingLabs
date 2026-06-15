<script>
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';

    const steps = ['프로젝트 설정', '입력자료', '가중치 설정', '분석 실행', '결과 지도', '의사결정 지원'];
    const asset = (path) => `${base}${path}`;

    let activeStep = 0;
    let activeLayer = 'Risk';
    let region = '경기도 수원시';
    let regionCode = '41110';
    $: projectName = `${region} 폭염 위험지역 분석`;
    let analysisDone = false;
    let running = false;
    let selectedCandidate = 0;
    let dimensionWeights = { H: 1, E: 1, V: 1 };
    let mapSource = '수원LST.tif 불러오는 중';

    let indicators = [
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
    ];

    const candidates = [
        { name: '후보지 03', area: '팔달구 인계동', risk: 0.82, h: 0.76, e: 0.91, v: 0.81, rank: 1, reason: '고령층·유동인구 집중, 쉼터 접근성 부족' },
        { name: '후보지 07', area: '권선구 세류동', risk: 0.78, h: 0.83, e: 0.74, v: 0.76, rank: 2, reason: '높은 지표면 온도와 녹지 면적 부족' },
        { name: '후보지 11', area: '장안구 영화동', risk: 0.73, h: 0.69, e: 0.77, v: 0.79, rank: 3, reason: '1인 가구 비율과 노후주택 밀집' }
    ];

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

        try {
            const { default: parseGeoraster } = await import('georaster');
            const response = await fetch(asset('/analysis-data/수원LST.tif'));
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
            mapSource = `수원LST.tif 실제 래스터 · ${raster.width}×${raster.height}`;
        } catch (error) {
            mapSource = '수원LST.tif 미리보기 연결 실패 · 예시 격자 표시';
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

    function downloadConfig() {
        const payload = { projectName, region, regionCode, hazard: 'heatwave', formula: 'Weighted geometric mean of H/E/V', dimensionWeights, indicators };
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
    <title>Climate Risk Lab | H/E/V 위험평가</title>
    <meta name="description" content="H/E/V 기반 기후위험 평가 및 의사결정 지원 도구" />
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
            <button class="ghost-button" onclick={downloadConfig}>설정 내보내기</button>
            <div class="avatar">관리</div>
        </div>
    </header>

    <div class="workspace">
        <aside class="sidebar">
            <div class="side-title">분석 워크플로우 <span>{enabledCount}개 지표</span></div>
            <nav>
                {#each steps as step, index}
                    <button class:active={activeStep === index} class:complete={activeStep > index} onclick={() => activeStep = index}>
                        <span class="step-num">{activeStep > index ? '✓' : index + 1}</span>
                        <span>{step}<small>{['범위와 기준 설정', 'H/E/V GeoTIFF 구성', '방향성과 영향 조정', '공간분석 계산', '위험도·핫스팟 확인', '우선관리 후보 검토'][index]}</small></span>
                    </button>
                {/each}
            </nav>
            <div class="formula-card">
                <span>기본 분석식</span>
                <strong>Risk = weighted H · E · V</strong>
                <p>모든 지표와 H/E/V 통합 가중치의 기본값은 1.0입니다.</p>
            </div>
        </aside>

        <main class="main">
            <section class="hero">
                <div>
                    <span class="eyebrow">LOCAL CLIMATE RISK ASSESSMENT</span>
                    <h1>지역의 위험을 읽고,<br /><em>우선 대응지를 찾습니다.</em></h1>
                    <p>기후위험(H), 노출(E), 취약성(V) 지표를 직접 구성하고 공간 분석 결과를 의사결정으로 연결하세요.</p>
                </div>
                <div class="hero-actions">
                    <label>분석 대상 지역<input value={region} readonly /></label>
                    <label>행정구역 코드<input value={regionCode} readonly /></label>
                    <small>현재 폭염 분석 데이터와 후보지는 수원시 샘플입니다.</small>
                    <button class="primary" onclick={runAnalysis} disabled={running}>{running ? '공간 분석 계산 중...' : '분석 실행하기 →'}</button>
                </div>
            </section>

            <section class="score-row">
                <div class="score-card risk"><span>종합 위험도</span><strong>{riskScore.toFixed(2)}</strong><small>상위 8.4% · 매우 높음</small></div>
                <div class="score-card"><span><b class="dot h"></b>기후위험 H</span><strong>{dimensionScores.H.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.H} /></label><div class="bar"><i style={`width:${dimensionScores.H * 100}%`}></i></div></div>
                <div class="score-card"><span><b class="dot e"></b>노출 E</span><strong>{dimensionScores.E.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.E} /></label><div class="bar"><i style={`width:${dimensionScores.E * 100}%`}></i></div></div>
                <div class="score-card"><span><b class="dot v"></b>취약성 V</span><strong>{dimensionScores.V.toFixed(2)}</strong><label class="dimension-weight">통합 가중치<input type="number" min="0" step="0.1" bind:value={dimensionWeights.V} /></label><div class="bar"><i style={`width:${dimensionScores.V * 100}%`}></i></div></div>
            </section>

            <section class="panel selected-region-panel">
                <div class="panel-head">
                    <div>
                        <span class="section-number">00</span>
                        <h2>선택 지역 베이스맵</h2>
                        <p>{region} · 행정구역 코드 {regionCode}</p>
                    </div>
                </div>
                <SelectedRegionMap {regionCode} regionName={region} height="360px" />
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
                    <div class="panel map-panel">
                        <div class="panel-head map-head">
                            <div><span class="section-number">02</span><h2>위험도 공간 분석</h2><p>{analysisDone ? `분석 완료 · ${mapSource}` : mapSource}</p></div>
                            <div class="layer-tabs">
                                {#each ['Risk', 'H', 'E', 'V', 'Hotspot'] as layer}
                                    <button class:active={activeLayer === layer} onclick={() => activeLayer = layer}>{layer}</button>
                                {/each}
                            </div>
                        </div>
                        <div class="map">
                            <div class="map-grid">
                                {#each cells as cell, index}
                                    <button aria-label={`격자 ${index + 1}: 위험도 ${cell.toFixed(2)}`} title={`격자 ${index + 1}: ${cell.toFixed(2)}`} style={`background:${colorFor(cell)}`}></button>
                                {/each}
                            </div>
                            <div class="map-label l1">장안구</div><div class="map-label l2">팔달구</div><div class="map-label l3">권선구</div>
                            <div class="hotspot-ring r1"></div><div class="hotspot-ring r2"></div>
                            <div class="legend"><span>낮음</span><i></i><span>높음</span></div>
                            <div class="map-controls"><button>＋</button><button>−</button></div>
                        </div>
                    </div>

                    <div class="panel candidates">
                        <div class="panel-head">
                            <div><span class="section-number">03</span><h2>우선관리 후보지</h2><p>위험도 상위 20%와 핫스팟을 함께 검토합니다.</p></div>
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
                    </div>
                </div>
            </section>

            <section class="decision-panel">
                <div class="decision-title"><span class="section-number">04</span><div><h2>{candidates[selectedCandidate].name} 의사결정 브리프</h2><p>{candidates[selectedCandidate].area} · {candidates[selectedCandidate].reason}</p></div><button onclick={downloadConfig}>분석 결과 다운로드</button></div>
                <div class="brief-grid">
                    <div class="brief-score"><span>Risk</span><strong>{candidates[selectedCandidate].risk}</strong><small>우선관리 {candidates[selectedCandidate].rank}순위</small></div>
                    <div class="driver"><span>주요 취약 특성</span><strong>65세 이상 고령층</strong><p>지역 평균 대비 <b>1.8배 높음</b></p></div>
                    <div class="driver"><span>부족한 적응 자원</span><strong>무더위쉼터 접근성</strong><p>도보 10분 내 접근 가능 <b>32%</b></p></div>
                    <div class="action"><span>권고 대응</span><strong>이동형 쉼터와 그늘막 우선 배치</strong><p>유동인구 집중 시간대 현장 대응 인력 운영</p></div>
                </div>
            </section>
        </main>
    </div>
</div>
