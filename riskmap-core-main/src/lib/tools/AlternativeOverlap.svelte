<script>
    import { onMount } from 'svelte';
    import proj4 from 'proj4';
    import 'leaflet/dist/leaflet.css';
    import { getRegionBounds } from '$lib/data/administrativeRegions.js';
    import { comparisonAlternatives, latestComparisonRows, compareAlternatives } from '$lib/data/alternativeOverlap.js';

    export let rows = [];
    export let regionCode;
    export let hazard;
    export let initialResult = null;
    export let initialMinimum = 2;
    export let standalone = false;
    export let onOpenResult = null;
    export let onMinimumChange = null;
    let latestOnly = true, selected = [], mode = 'saved', percent = 10;
    let result = initialResult, error = '', busy = false, minimum = initialMinimum, picked = null, parcelPage = 0;
    let container, map, L, cellLayer;
    const colors = ['#ffedb5', '#fdc96a', '#f49343', '#dd592f', '#b42827', '#791b32'];
    $: items = comparisonAlternatives(rows, regionCode, hazard);
    $: visibleItems = latestOnly ? latestComparisonRows(items) : items;
    $: visibleCells = result?.cells.filter(cell => cell.count >= minimum) || [];
    $: visibleParcels = result?.parcels.filter(parcel => parcel.count >= minimum) || [];
    $: if (map && result) draw(result, minimum);

    function reset() { result = null; picked = null; error = ''; parcelPage = 0; cellLayer?.clearLayers(); }
    function toggle(key) { selected = selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]; reset(); }
    async function run() {
        busy = true; error = ''; picked = null;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        try { result = compareAlternatives(items.filter(item => selected.includes(item.key)), mode, Number(percent)); minimum = 2; parcelPage = 0; }
        catch (cause) { reset(); error = cause.message; }
        finally { busy = false; }
    }
    function color(count, total) { return colors[Math.min(colors.length - 1, Math.floor((count - 1) / Math.max(1, total - 1) * (colors.length - 1)))]; }
    function draw(comparison, min) {
        cellLayer.clearLayers();
        const t = comparison.grid.transform;
        const bounds = [];
        for (const cell of comparison.cells) {
            if (cell.count < min) continue;
            const x = t.originX + (cell.index % comparison.grid.columns) * Math.abs(t.pixelWidth);
            const y = t.originY - Math.floor(cell.index / comparison.grid.columns) * Math.abs(t.pixelHeight);
            const coordinates = [[x,y], [x+100,y], [x+100,y-100], [x,y-100]].map(point => proj4('EPSG:5179', 'EPSG:4326', point).reverse());
            bounds.push(...coordinates);
            L.polygon(coordinates, { weight: .25, color: '#7c402b', fillColor: color(cell.count, comparison.total), fillOpacity: .8 })
                .on('click', () => picked = { ...cell, label: `100m 격자 ${cell.index}` }).addTo(cellLayer);
        }
        if (bounds.length) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    }
    function download() {
        const data = { schema: 'alternative-overlap/v1', generatedAt: new Date().toISOString(), regionCode, hazard, minimum, ...result };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `대안-겹침-${regionCode}-${hazard}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    onMount(() => {
        let disposed = false;
        import('leaflet').then(module => {
            if (disposed) return;
            L = module.default;
            proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
            map = L.map(container, { preferCanvas: true }).setView([36.4,127.5], 7);
            const bounds = getRegionBounds(regionCode);
            if (bounds) map.fitBounds([[bounds.south,bounds.west],[bounds.north,bounds.east]], { padding: [20,20] });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
            cellLayer = L.featureGroup().addTo(map);
        }).catch(cause => error = `비교 지도를 준비하지 못했습니다: ${cause.message}`);
        return () => { disposed = true; map?.remove(); };
    });
</script>

<section class="overlap" class:standalone aria-label="대안 겹침 비교">
    {#if !standalone}
    <div class="choices">
        <p>같은 지역·재해의 대안을 2개 이상 선택하세요. 현재 작업은 유지됩니다.</p>
        <label><input type="checkbox" bind:checked={latestOnly} onchange={() => { selected = []; reset(); }} /> 작업자·프로젝트별 최근 저장본만</label>
        <small>선택한 행정구역의 저장본입니다. 작업자와 프로젝트 이름이 같으면 최근 것만 표시합니다. 이전 수정본은 체크를 해제해 선택하세요.</small>
        <div class="alternatives">
            {#each visibleItems as item (item.key)}
                <label class="alternative">
                    <input type="checkbox" checked={selected.includes(item.key)} disabled={!item.available || busy} onchange={() => toggle(item.key)} />
                    <span><strong>{item.name} · {item.version}</strong><small>{item.author} · {new Date(item.date).toLocaleString('ko-KR')}</small><small>{item.available ? (item.alternative.description || '분석 결과 있음') : '분석 결과 없음 · 비교 제외'}</small></span>
                </label>
            {/each}
            {#if !visibleItems.length}<p>비교할 저장본이 없습니다.</p>{/if}
        </div>
        <label class="overlap-field">격자 선정 기준<select bind:value={mode} onchange={reset}><option value="saved">대안별 저장된 Hotspot 기준</option><option value="percent">대안별 Risk 상위 비율</option></select></label>
        {#if mode === 'percent'}<label>상위 비율<select bind:value={percent} onchange={reset}>{#each [5,10,20,30] as value}<option value={value}>{value}%</option>{/each}</select></label>{/if}
        <small>기준값과 같은 점수는 모두 포함합니다. 동점이 많으면 지정 비율보다 넓게 선정됩니다. 필지는 각 대안의 후보 필지 전체를 집계합니다.</small>
        <button type="button" class="primary" disabled={selected.length < 2 || busy} onclick={run}>{busy ? '비교 계산 중…' : `선택한 ${selected.length}개 대안 비교`}</button>
        {#if error}<p role="alert" class="error">{error}</p>{/if}
    </div>
    {/if}
    <div class="results">
        {#if result}
            <div class="summary" aria-live="polite"><strong>{result.total}개 대안 비교</strong><span>{minimum}회 이상 격자 {visibleCells.length.toLocaleString()}개</span><span>후보 필지 {visibleParcels.length.toLocaleString()}개</span><span>모든 대안 공통 선정 {result.cells.filter(c => c.count === result.total).length.toLocaleString()}셀</span></div>
            <div class="toolbar"><label>최소 겹침 <select bind:value={minimum} onchange={() => { picked = null; parcelPage = 0; onMinimumChange?.(minimum); }}>{#each Array.from({ length: result.total }, (_, i) => i+1) as n}<option value={n}>{n}회 이상</option>{/each}</select></label><div class="result-actions">{#if onOpenResult}<button type="button" class="primary" onclick={() => onOpenResult(result, minimum)}>결과 탭으로 열기</button>{/if}<button type="button" onclick={download}>비교 결과 내려받기</button></div></div>
            {#if standalone}<p>비교 기준: {result.mode === 'percent' ? `대안별 Risk 상위 ${result.percent}% (동점 포함)` : '대안별 저장된 Hotspot 기준'} · {result.sources.map(source => `${source.name} (${source.version})`).join(' + ')}</p>{/if}
            <small>공통 유효격자 {result.commonCoverage.toLocaleString()} / 전체 유효격자 {result.unionCoverage.toLocaleString()}개. 자료가 없는 격자는 선정되지 않은 격자와 구분해 상세에 표시합니다.</small>
        {:else}<p>대안을 선택하면 반복 선정된 위험격자를 지도에서 확인할 수 있습니다.</p>{/if}
        <div class="map" bind:this={container} aria-label="대안 겹침 지도"></div>
        {#if result}
            <div class="overlap-legend">선정 횟수 {#each Array.from({ length: result.total }, (_, i) => i+1) as n}<span><i style:background={color(n,result.total)}></i>{n}/{result.total}</span>{/each}</div>
            {#if !visibleCells.length}<p>현재 최소 겹침 조건에 해당하는 격자가 없습니다.</p>{/if}
            {#if picked}<div class="detail"><strong>{picked.label} · {picked.count}/{result.total}개 대안에서 선정</strong>{#if picked.coverage !== undefined}<p>유효자료 {picked.coverage}/{result.total}개 대안 · 나머지 {result.total - picked.coverage}개는 자료 없음</p>{/if}{#each result.sources.filter(s => picked.sourceKeys.includes(s.key)) as source}<p>{source.name} · {source.version} · {source.author}</p>{/each}</div>{/if}
            <details><summary>대안별 분석조건 및 선정 기준</summary>{#each result.sources as source}<div class="detail"><strong>{source.name} · {source.version} · {source.author}</strong><p>Risk ≥ {source.threshold.toFixed(4)} · 선정 {source.selectedCells.toLocaleString()}셀 / 유효 {source.validCells.toLocaleString()}셀 · 후보 {source.parcelCount}필지</p>{#if source.weights}<p>분야 가중치: {Object.entries(source.weights).map(([key,value]) => `${key} ${value}`).join(' · ')}</p>{/if}<p>{source.indicators.map(i => `${i.name}${i.weight !== undefined ? ` (가중치 ${i.weight})` : ''}`).join(' · ') || '지표 상세 미기록'}</p></div>{/each}</details>
            <details open><summary>반복 포함된 후보 필지 · {visibleParcels.length.toLocaleString()}개</summary><small>PNU가 같은 필지를 집계하며, 같은 대안의 여러 후보지에 있어도 1회로 계산합니다. 필지 경계 중첩 면적은 계산하지 않습니다.</small>
                <div class="parcel-list">{#each visibleParcels.slice(parcelPage*50, (parcelPage+1)*50) as parcel}<button type="button" onclick={() => picked = { ...parcel, label: `필지 ${parcel.pnu}` }}>PNU {parcel.pnu}<strong>{parcel.count}/{result.total}개 대안</strong></button>{/each}</div>
                {#if visibleParcels.length > 50}<div class="toolbar"><button type="button" disabled={parcelPage === 0} onclick={() => parcelPage--}>이전</button><span>{parcelPage+1}/{Math.ceil(visibleParcels.length/50)}</span><button type="button" disabled={(parcelPage+1)*50 >= visibleParcels.length} onclick={() => parcelPage++}>다음</button></div>{/if}
            </details>
        {/if}
    </div>
</section>

<style>
    .overlap.standalone { grid-template-columns:minmax(0,1fr);padding:16px 20px; }
    .standalone .map { height:clamp(320px,48vh,620px); }
    .result-actions { display:flex;flex-wrap:wrap;gap:8px; }
    .toolbar { flex-wrap:wrap; }
    .overlap .overlap-field { display:grid; gap:7px; font-weight:600; }
    .overlap .overlap-field select { width:100%; min-height:40px; font-weight:400; }
    .overlap button { min-height:38px; font:inherit; transition:background .15s,border-color .15s; }
    .overlap button:hover:not(:disabled) { background:#edf6f2; border-color:#71a694; }
    .overlap .primary:hover:not(:disabled) { background:#105340; color:white; }
    .overlap button:focus-visible,.overlap select:focus-visible,.overlap input:focus-visible { outline:3px solid #88c9b6; outline-offset:2px; }
    .choices .primary { position:sticky; bottom:0; box-shadow:0 -8px 16px #fff; }
    .overlap{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px;padding:16px 0;color:#273c39;font-size:13px}.choices,.results{min-width:0}.choices{display:flex;flex-direction:column;gap:12px}.overlap p{margin:5px 0;line-height:1.6}.overlap small{display:block;color:#687975;font-size:11px;line-height:1.6}.overlap label{display:flex;align-items:center;gap:8px}.alternatives{max-height:300px;overflow:auto;border:1px solid #dce5e2;border-radius:8px}.alternative{padding:10px;border-bottom:1px solid #e7edea}.alternative span{min-width:0}.overlap input{accent-color:#16715d}.overlap select,.overlap button{border:1px solid #cbd8d2;border-radius:6px;padding:7px 10px;background:white;color:#284a40}.overlap button{cursor:pointer}.overlap button:disabled{opacity:.45;cursor:default}.overlap .primary{background:#156a55;color:white;padding:12px}.map{height:370px;isolation:isolate;border:1px solid #dce5e2;border-radius:8px;margin:10px 0}.summary{display:flex;flex-wrap:wrap;gap:8px;background:#eaf4ef;padding:12px;border-radius:8px}.summary span{padding-left:8px;border-left:1px solid #bccfc4}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}.overlap-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:11px}.overlap-legend span{display:flex;align-items:center;gap:3px}.overlap-legend i{display:inline-block;width:16px;height:12px}.detail{background:#f3f6f4;padding:12px;border-radius:6px;margin:8px 0}.error{color:#b32626}.overlap details{margin:12px 0;border-top:1px solid #dce5e2;padding-top:10px}.overlap summary{cursor:pointer;font-weight:600;padding:4px 0}.parcel-list{max-height:240px;overflow:auto}.parcel-list button{display:flex;width:100%;justify-content:space-between;margin:4px 0;text-align:left}@media(max-width:800px){.overlap{grid-template-columns:1fr}.alternatives{max-height:180px}.map{height:300px}}
</style>
