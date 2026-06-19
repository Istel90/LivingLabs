<script>
    import { onMount } from 'svelte';
    import {
        getBoundaryFeaturesForRegionCode,
        getRegionByCode,
        getRegionCenter,
        regionZoom
    } from '$lib/data/administrativeRegions.js';
    import {
        createVWorldWmsOptions,
        hasVWorldApiKey,
        VWORLD_WMS_LAYERS,
        VWORLD_WMS_URL
    } from '../../../../shared/map/vworld.js';

    let {
        regionCode = '41110',
        regionName = '경기도 수원시',
        height = '320px',
        showCadastral = true
    } = $props();

    let mapElement;
    let map;
    let marker;
    let selectedBoundaryLayer;
    let sidoLayer;
    let sggLayer;
    let cadastralLayer;

    function clearSelectedRegion() {
        marker?.remove();
        marker = null;
        selectedBoundaryLayer?.remove();
        selectedBoundaryLayer = null;
    }

    function locateRegion() {
        if (!map || !window.L || !regionCode) return;

        const L = window.L;
        const region = getRegionByCode(regionCode);
        const label = regionName || region?.fullName || region?.sigungu || regionCode;
        const features = getBoundaryFeaturesForRegionCode(regionCode);

        clearSelectedRegion();

        if (features.length) {
            selectedBoundaryLayer = L.geoJSON(
                { type: 'FeatureCollection', features },
                {
                    interactive: false,
                    style: {
                        color: '#2563eb',
                        weight: 3,
                        opacity: 1,
                        fillColor: '#60a5fa',
                        fillOpacity: 0.22
                    }
                }
            )
                .bindTooltip(`${label} 행정경계`, { sticky: true })
                .addTo(map);

            const bounds = selectedBoundaryLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: [28, 28],
                    maxZoom: regionZoom(region) + 1,
                    animate: true,
                    duration: 0.65
                });
                marker = L.marker(bounds.getCenter()).bindTooltip(label, { permanent: true, direction: 'top' }).addTo(map);
                return;
            }
        }

        const center = getRegionCenter(regionCode);
        if (center) {
            map.setView(center, regionZoom(region));
            marker = L.marker(center).bindTooltip(label, { permanent: true, direction: 'top' }).addTo(map);
        }
    }

    function toggleLayer(layer) {
        if (!map || !layer) return;
        if (map.hasLayer(layer)) {
            layer.remove();
        } else {
            layer.addTo(map);
        }
    }

    onMount(() => {
        const L = window.L;

        map = L.map(mapElement, {
            attributionControl: true,
            zoomControl: true,
            minZoom: 7,
            maxZoom: 18
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        if (hasVWorldApiKey()) {
            sidoLayer = L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sidoBoundary, { opacity: 0.35 }))
                .addTo(map);
            sggLayer = L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sigunguBoundary, { opacity: 0.65 }))
                .addTo(map);
            if (showCadastral) {
                cadastralLayer = L.tileLayer.wms(
                    VWORLD_WMS_URL,
                    createVWorldWmsOptions(VWORLD_WMS_LAYERS.cadastral, { opacity: 0.55 })
                );
            }
        }

        locateRegion();
        return () => map?.remove();
    });

    $effect(() => {
        regionCode;
        regionName;
        locateRegion();
    });
</script>

<svelte:head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</svelte:head>

<div class="region-map-wrap">
    <div class="region-map" bind:this={mapElement} style={`height:${height}`}></div>
    <div class="layer-panel">
        <strong>지도 레이어</strong>
        <span class="local-boundary">선택지역 경계 표시 중</span>
        {#if hasVWorldApiKey()}
            <label><input type="checkbox" checked onchange={() => toggleLayer(sidoLayer)} /> 시도 경계</label>
            <label><input type="checkbox" checked onchange={() => toggleLayer(sggLayer)} /> 시군구 경계</label>
            {#if showCadastral}
                <label><input type="checkbox" onchange={() => toggleLayer(cadastralLayer)} /> 연속지적도</label>
            {/if}
        {:else}
            <span>VWorld API 키가 없으면 공식 WMS 레이어만 비활성화됩니다.</span>
        {/if}
    </div>
</div>

<style>
    .region-map-wrap {
        position: relative;
    }

    .region-map {
        width: 100%;
        overflow: hidden;
        border: 1px solid #d9e7ee;
        border-radius: 1rem;
        background: #e8f3f5;
    }

    .layer-panel {
        position: absolute;
        right: .85rem;
        top: .85rem;
        z-index: 500;
        display: grid;
        gap: .38rem;
        border: 1px solid rgb(15 23 42 / 10%);
        border-radius: .9rem;
        background: rgb(255 255 255 / 92%);
        padding: .75rem .85rem;
        box-shadow: 0 18px 36px rgb(15 23 42 / 14%);
        color: #0f172a;
        font-size: .78rem;
        font-weight: 800;
        backdrop-filter: blur(10px);
    }

    .layer-panel strong {
        color: #073b52;
        font-size: .85rem;
    }

    .layer-panel label {
        display: flex;
        align-items: center;
        gap: .35rem;
        white-space: nowrap;
    }

    .layer-panel span {
        max-width: 14rem;
        color: #64748b;
        line-height: 1.45;
    }

    .local-boundary {
        color: #047857 !important;
    }
</style>
