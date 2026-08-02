<script>
    let { layers = [], activeId = '', ready = false, status = '', onSelect = () => {} } = $props();
    let filter = $state('전체');
    const filters = ['전체', '위험', '노출', '민감도', '적응역량'];
    let visibleLayers = $derived(filter === '전체' ? layers : layers.filter((item) => item.dimension === filter));
</script>

<article class="data-panel">
    <header><div><span>CURRENT SPATIAL DATA</span><h2>현재 공간정보</h2></div><strong>{layers.length}개 · 30~100m</strong></header>
    <nav aria-label="공간정보 분야 필터">
        {#each filters as item}<button class:active={filter === item} onclick={() => filter = item}>{item}</button>{/each}
    </nav>
    <div class="layer-grid">
        {#each visibleLayers as layer}
            <button class:selected={activeId === layer.id} disabled={!ready} onclick={() => onSelect(layer.id)} title={`${layer.source || ''} ${layer.note || ''}`}>
                <span>{activeId === layer.id ? '●' : '+'}</span>
                <b>{layer.name}</b>
                <small>{layer.dimension} · {layer.resolution} · {layer.quality || '가공자료'}</small>
                <em>{ready ? (activeId === layer.id ? '지도에 표시 중' : layer.source) : '지역자료 연결 필요'}</em>
            </button>
        {/each}
    </div>
    <p class="spatial-status">{status}</p>
</article>

<style>
    .data-panel{border:1px solid #d5dfdb;border-radius:8px;background:white;padding:14px}.data-panel header{display:flex;justify-content:space-between;align-items:start;margin-bottom:8px}.data-panel header span{font-size:8px;letter-spacing:.12em;color:#728780;font-weight:800}.data-panel h2{margin:3px 0 0;font-size:15px}.data-panel header>strong{border-radius:999px;background:#edf5f1;color:#18705f;padding:5px 8px;font-size:9px}nav{display:flex;gap:4px;margin-bottom:8px;overflow:auto}nav button{border:1px solid #d5dfdb;border-radius:999px;background:#f8faf9;color:#627771;padding:5px 8px;font-size:8px;font-weight:800;white-space:nowrap}nav button.active{border-color:#18705f;background:#18705f;color:white}.layer-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:330px;overflow:auto;padding-right:2px}.layer-grid>button{display:grid;grid-template-columns:22px 1fr;gap:2px 7px;border:1px solid #dce5e2;border-radius:6px;background:#f8faf9;padding:8px;text-align:left}.layer-grid>button.selected{border-color:#18705f;background:#eaf6f1;box-shadow:inset 0 0 0 1px #18705f}.layer-grid>button:disabled{cursor:not-allowed;opacity:.5}.layer-grid>button>span{grid-row:1/4;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#dce7e3;color:#2d665d;font-size:9px}.layer-grid b{font-size:10px}.layer-grid small,.layer-grid em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#738680;font-size:8px;font-style:normal}.spatial-status{margin:10px 0 0;padding:8px 10px;border-radius:6px;background:#edf5f1;color:#315e56;font-size:9px;font-weight:700;line-height:1.4}
</style>
