<script>
    import { onMount } from 'svelte';
    import Menubar from '../Menubar.svelte';

    let map;
    let data = $state({
        coords: []
    });

    const locations = [
        ['동대문구', [37.574524, 127.03965]],
        ['인천시', [37.4559418, 126.7051505]],
        ['수원시', [37.263476, 127.028646]]
    ];
    onMount(() => {
        map = L.map('map', {
            attributionControl: false,
            minZoom: 10,
            maxZoom: 18,
            doubleClickZoom: false
        });
        map.setView(locations[0][1], 13);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        map.on('click', (e) => {
            console.log(e.latlng);
            data.coords.push([e.latlng.lat, e.latlng.lng]);
        });
    });
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""
    />
    <script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""
    ></script>
</svelte:head>

<div class="bg-my-navy text-my-navy flex h-dvh w-dvw flex-col gap-1 p-1 font-[Noto_Sans_KR]">
    <Menubar bind:data />
    <div class="flex-auto rounded-md" id="map"></div>
</div>
