<script>
    import { onMount } from 'svelte';
    import CENTER_CSV from '../../../../shared/data/administrative-regions/sigungu_centers.csv?raw';

    let { regionCode = '41110', regionName = '경기도 수원시', height = '320px' } = $props();

    function parseCsv(text) {
        return text
            .replace(/^\uFEFF/, '')
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .map((line) => line.split(',').map((value) => value.trim()));
    }

    const centers = new Map(
        parseCsv(CENTER_CSV)
            .map(([code, name, lng, lat]) => [code, { code, name, lat: Number(lat), lng: Number(lng) }])
            .filter(([, center]) => Number.isFinite(center.lat) && Number.isFinite(center.lng))
    );

    let mapElement;
    let map;
    let marker;

    function locateRegion() {
        if (!map) return;
        const center = centers.get(regionCode) || centers.get(`${regionCode.slice(0, 2)}000`);
        if (!center) return;

        map.setView([center.lat, center.lng], regionCode.endsWith('000') ? 9 : 12);
        if (marker) marker.remove();
        marker = L.marker([center.lat, center.lng])
            .bindTooltip(regionName || center.name, { permanent: true, direction: 'top' })
            .addTo(map);
    }

    onMount(() => {
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

        const commonWmsOptions = {
            format: 'image/png',
            key: 'FF0B2749-8F4B-3E15-BAD3-DA7CB8790552',
            version: '1.3.0',
            transparent: true
        };
        L.tileLayer.wms('https://api.vworld.kr/req/wms', {
            ...commonWmsOptions,
            layers: 'lt_c_adsido',
            styles: 'lt_c_adsido'
        }).addTo(map);
        L.tileLayer.wms('https://api.vworld.kr/req/wms', {
            ...commonWmsOptions,
            layers: 'lt_c_adsigg',
            styles: 'lt_c_adsigg'
        }).addTo(map);

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
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossorigin=""
    />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</svelte:head>

<div class="region-map" bind:this={mapElement} style={`height:${height}`}></div>

<style>
    .region-map {
        width: 100%;
        overflow: hidden;
        border: 1px solid #d9e2ec;
        border-radius: .85rem;
        background: #e8eef5;
    }
</style>
