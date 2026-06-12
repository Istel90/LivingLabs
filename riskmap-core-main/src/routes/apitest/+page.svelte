<script>
    import { onMount } from 'svelte';
    import geojson from '$lib/동대문구_가로수.json';

    let map;
    let sidoLayer;
    let sggLayer;
    let treeLayer;

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

        sidoLayer = L.tileLayer
            .wms('https://api.vworld.kr/req/wms', {
                format: 'image/png',
                key: 'FF0B2749-8F4B-3E15-BAD3-DA7CB8790552',
                layers: 'lt_c_adsido',
                styles: 'lt_c_adsido',
                version: '1.3.0',
                transparent: true
            })
            .addTo(map);

        sggLayer = L.tileLayer
            .wms('https://api.vworld.kr/req/wms', {
                format: 'image/png',
                key: 'FF0B2749-8F4B-3E15-BAD3-DA7CB8790552',
                layers: 'lt_c_adsigg',
                styles: 'lt_c_adsigg',
                version: '1.3.0',
                transparent: true
            })
            .addTo(map);

        var geojsonMarkerOptions = {
            radius: 4,
            fillColor: '#6aaa7f',
            color: '#000000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
            interactive: false
        };

        treeLayer = L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, geojsonMarkerOptions);
            }
        }).addTo(map);
    });

    function check(e) {
        switch (e.target.id) {
            case 'sido':
                toggle_layer(sidoLayer);
                break;
            case 'sgg':
                toggle_layer(sggLayer);
                break;
            case 'tree':
                toggle_layer(treeLayer);
                break;
        }
    }

    function toggle_layer(layer) {
        if (map.hasLayer(layer)) {
            layer.remove();
        } else {
            layer.addTo(map);
        }
    }
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

<div class="bg-my-navy text-my-navy flex h-dvh w-dvw gap-1 p-1 font-[Noto_Sans_KR]">
    <div class="flex-auto rounded-md" id="map">
        <div
            class="shadow-b1 absolute bottom-2 left-2 z-700 flex h-auto w-auto flex-col gap-1 rounded-sm bg-white p-1.5 text-sm font-medium text-black opacity-80 shadow-lg"
        >
            <div class="flex items-center">
                <input type="checkbox" id="sido" checked class="mr-1" onchange={check} /><label
                    for="sido">광역시/도 경계</label
                >
            </div>
            <div class="flex items-center">
                <input type="checkbox" id="sgg" checked class="mr-1" onchange={check} /><label
                    for="sgg">시/군/구 경계</label
                >
            </div>
            <div>
                <input type="checkbox" id="tree" checked class="mr-1" onchange={check} /><label
                    for="tree">기존 가로수</label
                >
            </div>
        </div>
    </div>
</div>
