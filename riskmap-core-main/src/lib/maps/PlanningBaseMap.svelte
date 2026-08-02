<script>
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';

    let {
        regionCode = '41110',
        regionName = '경기도 수원시',
        height = '620px',
        locked = true,
        showCadastral = false,
        showSidoBoundary = false,
        showSigunguBoundary = false,
        riskGrid = null,
        activeGridLayer = 'Risk',
        layerLabel = '',
        adaptationSites = []
    } = $props();
</script>

<div class="planning-base-map" style={`--planning-map-height:${height}`}>
    <SelectedRegionMap
        {regionCode}
        {regionName}
        {height}
        {locked}
        {showCadastral}
        {showSidoBoundary}
        {showSigunguBoundary}
        {riskGrid}
        {activeGridLayer}
        {adaptationSites}
        forceSelectedBoundary={true}
        showAnalysisLegend={true}
    />
    {#if layerLabel}<div class="active-layer-chip"><b>100m</b><span>{layerLabel}</span></div>{/if}
</div>

<style>
    .planning-base-map {
        position: relative;
        width: 100%;
        height: var(--planning-map-height);
        min-height: var(--planning-map-height);
        overflow: hidden;
    }

    .planning-base-map :global(.analysis-overlay-stack) { display: none !important; }

    .active-layer-chip {
        position: absolute;
        z-index: 680;
        left: 12px;
        bottom: 12px;
        display: flex;
        align-items: center;
        gap: 7px;
        border: 1px solid #ffffffaa;
        border-radius: 999px;
        background: #102f2de8;
        color: white;
        padding: 6px 10px 6px 6px;
        box-shadow: 0 4px 14px #0003;
        font-size: 10px;
        font-weight: 800;
    }

    .active-layer-chip b {
        border-radius: 999px;
        background: #c85d3e;
        padding: 4px 6px;
        font-size: 8px;
    }

    .planning-base-map :global(.region-map-wrap),
    .planning-base-map :global(.region-map),
    .planning-base-map :global(.leaflet-container) {
        width: 100% !important;
        height: var(--planning-map-height) !important;
        min-height: var(--planning-map-height) !important;
    }
</style>