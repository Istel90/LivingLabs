<script>
    import { onMount } from 'svelte';
    import parse_georaster from 'georaster';
    // import GeoRasterLayer from 'georaster-layer-for-leaflet';
    import Graph from './Graph.svelte';
    import Menubar from './Menubar.svelte';

    import TREE_ICON_PATH from '$lib/img/tree-40.svg';
    import CANOPY_ICON_PATH from '$lib/img/canopy-40.svg';
    import TREE_SELECTED_ICON_PATH from '$lib/img/tree-40-orange.svg';
    import CANOPY_SELECTED_ICON_PATH from '$lib/img/canopy-40-orange.svg';
    import ORIGINAL_TREE_JSON from '$lib/동대문구_가로수.json';
    import ORIGINAL_SUWON_TREE_JSON from '$lib/수원시_가로수.json';
    import ORIGINAL_CANOPY_JSON from '$lib/canopy_coords.json';
    // import GRID_PATH from '$lib/GoverArea_SIG_100m.tif';
    // import GRID_PATH from '$lib/StandardGrid_500m.tif';
    // import TILE_PATH from '$lib/tiles';
    import GRID_PATH from '$lib/800_500_5_x2.png';

    import DONG_CSV from '$lib/dong_4326.csv?raw';
    import IN_CSV from '$lib/in3_4326.csv?raw';
    import SUWON_CSV from '$lib/suwon_4326.csv?raw';
    import SIDO_SGG_CSV from '../../../shared/data/administrative-regions/sido_sgg_codes.csv?raw';
    import SIG_XY_CSV from '../../../shared/data/administrative-regions/sigungu_centers.csv?raw';
    import SOLAR_CSV from '../../../shared/data/climate/solar_admin_centroid_mean.csv?raw';
    import SOLAR_ALTITUDE_CSV from '../../../shared/data/climate/solar_altitude_by_sigungu.csv?raw';
    import REGION_DEFAULTS_CSV from '../../../shared/data/administrative-regions/region_assessment_defaults.csv?raw';
    import { calculateTemperatureEffect } from '$lib/effects/temperatureEffect.js';

    const ICON_SIZE = 40;
    const REGION_ROWS = parseCsv(SIDO_SGG_CSV)
        .map(([sido, name, code]) => ({ sido, name, code }))
        .filter((region) => region.sido && region.name && region.code);
    const REGION_COORDS = new Map(
        parseCsv(SIG_XY_CSV)
            .map(([code, name, x, y]) => [
                code,
                { code, name, lat: Number(y), lng: Number(x) }
            ])
            .filter(([, region]) => Number.isFinite(region.lat) && Number.isFinite(region.lng))
    );
    const SIDOS = Array.from(new Set(REGION_ROWS.map((region) => region.sido)));
    const SOLAR_BY_REGION = new Map(
        parseCsv(SOLAR_CSV).map((row) => [
            row[0],
            {
                solar_09_kst: Number(row[6]),
                solar_12_kst: Number(row[7]),
                solar_15_kst: Number(row[8])
            }
        ])
    );
    const SOLAR_ALTITUDE_BY_REGION = new Map(
        parseCsv(SOLAR_ALTITUDE_CSV).map((row) => [
            row[0],
            {
                regionName: row[1],
                meridianDeg: Number(row[2]),
                altitude09Deg: Number(row[3]),
                altitude12Deg: Number(row[4]),
                altitude15Deg: Number(row[5])
            }
        ])
    );
    const REGION_DEFAULTS = new Map(
        parseCsv(REGION_DEFAULTS_CSV).map((row) => [
            row[0],
            { regionName: row[1], assessmentAreaM2: Number(row[2]), areaSource: row[3] }
        ])
    );
    const PARTS = [
        ['물관리', ['하수관로', '빗물펌프장']],
        ['농수산', []],
        ['산림/생태계', []],
        ['교육/홍보', []],
        ['국토/연안', []],
        ['기후감시예측', []],
        ['건강', ['가로수', '그늘막']],
        ['산업/에너지', []],
        ['재난/재해', []],
        ['해양/수산', []],
        ['적응기반', []],
        ['인프라/국제협력', []]
    ];
    const ENABLED_PARTS = new Set(['물관리', '건강']);

    let db = $state({
        가로수: {
            coords: [],
            goal: 100
        },
        그늘막: {
            coords: [],
            goal: 100
        }
    });
    const counts = $derived({
        가로수: db['가로수'].coords.length,
        그늘막: db['그늘막'].coords.length
    });
    const pointInfos = {
        가로수: {
            iconPath: TREE_ICON_PATH,
            iconPath2: TREE_SELECTED_ICON_PATH,
            icon: null,
            icon2: null,
            group: null
        },
        그늘막: {
            iconPath: CANOPY_ICON_PATH,
            iconPath2: CANOPY_SELECTED_ICON_PATH,
            icon: null,
            icon2: null,
            group: null
        }
    };

    let map;
    let sidoLayer;
    let sggLayer;
    let originalTreeLayer;
    let originalCanopyLayer;
    let gridLayer;

    let currentItem = $state('');
    let selectedPart = $state('');
    let availableItems = $derived(PARTS.find((part) => part[0] === selectedPart)?.[1] || []);
    let zoomLevel = $state(0);
    let selectedSido = $state('서울특별시');
    let selectedSggCode = $state('11230');
    let availableSggs = $derived(REGION_ROWS.filter((region) => region.sido === selectedSido));
    let selectedRegionCode = $derived(selectedSggCode || getSidoCode(selectedSido));
    let selectedAssessmentDefaults = $derived(REGION_DEFAULTS.get(selectedRegionCode));
    let selectedSolarAltitude = $derived(SOLAR_ALTITUDE_BY_REGION.get(selectedRegionCode));
    let assessmentAreaM2 = $derived(selectedAssessmentDefaults?.assessmentAreaM2 || 0);
    let solarAltitudeDeg = $derived(selectedSolarAltitude?.meridianDeg || 45);
    let appliedCounts = $state({ 가로수: 0, 그늘막: 0 });
    let effectResult = $state(null);
    let effectStatus = $state('지도에 사업 위치를 추가한 뒤 적용 버튼을 누르세요.');
    let interventionSettings = $state({
        가로수: { widthM: 4, heightM: 6, transmission: 0.15, shape: 'circle' },
        그늘막: { widthM: 5, heightM: 3, transmission: 0.05, shape: 'square' }
    });

    let tempGraph;
    let canvas = $state();
    let ctx;
    let selection;
    let isSelecting = $state(false);
    let selectionTool = $state();

    let gridCheckbox;

    onMount(() => {
        // (async () => {
        //     const GeoRasterLayer = await import('georaster-layer-for-leaflet').default;
        // })();

        map = L.map('map', {
            attributionControl: false,
            minZoom: 10,
            maxZoom: 18,
            doubleClickZoom: false
        });
        locateByCode(selectedSggCode, 14);
        zoomLevel = map.getZoom();

        gridLayer = L.layerGroup();

        addGrid(DONG_CSV);
        addGrid(IN_CSV);
        addGrid(SUWON_CSV);

        // const indexToCoord = {};
        // let rowCount = 0;
        // let colCount = 0;
        // for (const line of DONG_CSV.split('\n').slice(1)) {
        //     const record = line.split(',');
        //     const x = parseFloat(record[0]);
        //     const y = parseFloat(record[1]);
        //     const rowIndex = parseInt(record.at(-2));
        //     const colIndex = parseInt(record.at(-1));
        //     indexToCoord[[rowIndex, colIndex]] = [y, x];

        //     if (rowIndex + 1 > rowCount) {
        //         rowCount = rowIndex + 1;
        //     }
        //     if (colIndex + 1 > colCount) {
        //         colCount = colIndex + 1;
        //     }
        // }
        // console.log(rowCount, colCount);

        // for (let row = 0; row < rowCount - 1; ++row) {
        //     for (let col = 0; col < colCount - 1; ++col) {
        //         const topLeft = indexToCoord[[row, col]];
        //         const bottomRight = indexToCoord[[row + 1, col + 1]];
        //         L.imageOverlay(GRID_PATH, [topLeft, bottomRight]).addTo(gridLayer);
        //     }
        // }

        // fetch(GRID_PATH)
        //     .then((response) => response.arrayBuffer())
        //     .then((arrayBuffer) => {
        //         parseGeoraster(arrayBuffer).then((georaster) => {
        //             console.log('georaster:', georaster);
        //             gridLayer = new GeoRasterLayer({
        //                 georaster: georaster,
        //                 opacity: 0.6,
        //                 pixelValuesToColorFn: (values) => {
        //                     if (values[0] == 255) {
        //                         return '#00000000';
        //                     } else {
        //                         return rgbToHex(values[0], 255 - values[0], 0);
        //                     }
        //                 }
        //             });
        //             gridLayer.addTo(map);
        //         });
        //     });

        selection = L.rectangle(
            [
                [0, 0],
                [0, 0]
            ],
            { color: '#ff7800', weight: 0 }
        ).addTo(map);

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

        originalTreeLayer = L.geoJSON(ORIGINAL_SUWON_TREE_JSON, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 4,
                    fillColor: '#6aaa7f',
                    color: '#000000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                    interactive: false
                });
            }
        }).addTo(map);
        originalTreeLayer.addData(ORIGINAL_TREE_JSON);

        // gridLayer = L.tileLayer('/tiles/{z}/{x}/{y}.png').addTo(map);

        const canopyMarkers = [];
        originalCanopyLayer = L.layerGroup().addTo(map);
        for (const record of ORIGINAL_CANOPY_JSON) {
            const isSeoul = record['시도명'] === '서울특별시' && record['시군구명'] === '동대문구';
            const isIncheon = record['시도명'] === '인천광역시';
            const isSuwon = record['시군구명'] === '수원시';
            if (isSeoul || isIncheon || isSuwon) {
                let lat = record['위도'];
                let lng = record['경도'];
                if (lat > lng) {
                    [lat, lng] = [lng, lat];
                }
                const marker = L.circleMarker([lat, lng], {
                    radius: 4,
                    fillColor: '#eb7141',
                    color: '#000000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                    interactive: false
                });
                originalCanopyLayer.addLayer(marker);
            }
        }

        for (const [tag, data] of Object.entries(pointInfos)) {
            data.group = L.layerGroup().addTo(map);
            data.icon = L.icon({
                iconUrl: data.iconPath,
                iconSize: [ICON_SIZE, ICON_SIZE],
                iconAnchor: [ICON_SIZE * 0.5, ICON_SIZE]
            });
            data.icon2 = L.icon({
                iconUrl: data.iconPath2,
                iconSize: [ICON_SIZE, ICON_SIZE],
                iconAnchor: [ICON_SIZE * 0.5, ICON_SIZE]
            });
        }
        console.log(1);

        map.on('click', onMapClick);
        map.on('zoomend', onZoom);
        map.on('moveend', onMove);
    });

    $effect(() => {
        console.log(2);

        for (const [tag, data] of Object.entries(db)) {
            pointInfos[tag].group.remove();
            pointInfos[tag].group = L.layerGroup().addTo(map);

            for (const [i, coord] of data.coords.entries()) {
                var marker = L.marker(coord.slice(0, 2), { icon: pointInfos[tag].icon });
                if (coord[2] === 0) {
                    marker.setIcon(pointInfos[tag].icon);
                    marker.isSelected = false;
                } else {
                    marker.setIcon(pointInfos[tag].icon2);
                    marker.isSelected = true;
                }
                pointInfos[tag].group.addLayer(marker);
                marker.on('click', () => {
                    console.log('delete', marker.name);
                    data.coords.splice(i, 1);
                });
            }
        }
    });

    function componentToHex(c) {
        var hex = c.toString(16);
        return hex.length == 1 ? '0' + hex : hex;
    }

    function rgbToHex(r, g, b) {
        return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    function onMapClick(e) {
        switch (currentItem) {
            case '':
                break;
            case '가로수':
                console.log('가로수', e.latlng.lat, e.latlng.lng);
                db[currentItem].coords.push([e.latlng.lat, e.latlng.lng, 0]);
                break;
            case '그늘막':
                console.log('그늘막', e.latlng.lat, e.latlng.lng);
                db[currentItem].coords.push([e.latlng.lat, e.latlng.lng, 0]);
                break;
            case 'line':
                if (latlngs.length === 0) {
                    latlngs.push(e.latlng);
                    var polyline = L.polyline(latlngs, { color: 'green', weight: 5 }).addTo(
                        the_map
                    );
                    polyline.on('click', onItemClick);
                    lines.push(polyline);
                } else {
                    lines[lines.length - 1].addLatLng(e.latlng);
                }
                break;
            case 'polygon':
                if (latlngs.length === 0) {
                    latlngs.push(e.latlng);
                    var polygon = L.polygon(latlngs, { color: 'blue' }).addTo(the_map);
                    polygon.on('click', onItemClick);
                    polygons.push(polygon);
                } else {
                    polygons[polygons.length - 1].addLatLng(e.latlng);
                }
                break;
            case 'selectionTool':
                break;
        }
    }

    function onZoom(e) {
        zoomLevel = e.target.getZoom();

        if (zoomLevel >= 18 && gridCheckbox.checked) {
            gridLayer.addTo(map);
        } else {
            gridLayer.remove();
        }
    }

    function onMove(e) {
        // 향후 현재 지도 범위를 평가면적으로 자동 계산하는 공간 API 연결 지점
    }

    function applyPlan() {
        if (!selectedAssessmentDefaults) {
            effectStatus = '선택 지역의 행정구역 면적 자료를 먼저 등록해야 효과를 계산할 수 있습니다.';
            return;
        }
        const solar = SOLAR_BY_REGION.get(selectedRegionCode);
        const interventions = Object.entries(db).map(([id, item]) => ({
            id,
            count: item.coords.length,
            ...interventionSettings[id]
        }));
        effectResult = calculateTemperatureEffect({
            interventions,
            solar,
            solarAltitudeDeg,
            assessmentAreaM2
        });
        appliedCounts = Object.fromEntries(Object.entries(db).map(([id, item]) => [id, item.coords.length]));
        effectStatus = `${selectedRegionCode} 지역 일사량과 ${Number(assessmentAreaM2).toLocaleString()}㎡ 평가면적을 적용했습니다.`;
        tempGraph?.update(effectResult.times.map((row) => -row.deltaTC));
    }

    function parseCsv(csv) {
        return csv
            .replace(/^\uFEFF/, '')
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .map((line) =>
                line.split(',').map((value) => value.trim().replace(/^"(.*)"$/, '$1'))
            );
    }

    function getSidoCode(sido) {
        return Array.from(REGION_COORDS.values()).find((region) => region.name === sido)?.code || '';
    }

    function locateByCode(code, zoom = 12) {
        const region = REGION_COORDS.get(code);
        if (!map || !region) return;

        map.setView([region.lat, region.lng], zoom);
    }

    function changeSido(event) {
        selectedSido = event.currentTarget.value;
        selectedSggCode = '';
        locateByCode(getSidoCode(selectedSido), 10);
    }

    function changeSgg(event) {
        selectedSggCode = event.currentTarget.value;
        if (selectedSggCode) {
            locateByCode(selectedSggCode, 12);
        } else {
            locateByCode(getSidoCode(selectedSido), 10);
        }
    }

    function changePart(event) {
        selectedPart = event.currentTarget.value;
        currentItem = '';
        isSelecting = false;
    }

    function deselect(e) {
        isSelecting = false;
        if (e.target.value === currentItem) {
            e.target.checked = false;
            currentItem = '';
        }
    }

    function change(e) {
        isSelecting = true;
    }

    function check(e) {
        if (e.target.checked) {
            console.log('checked');
        } else {
            console.log('unchecked');
        }
        switch (e.target.id) {
            case 'sido':
                toggleLayer(sidoLayer, e.target.checked);
                break;
            case 'sgg':
                toggleLayer(sggLayer, e.target.checked);
                break;
            case 'tree':
                toggleLayer(originalTreeLayer, e.target.checked);
                break;
            case 'canopy':
                toggleLayer(originalCanopyLayer, e.target.checked);
                break;
            case 'grid':
                if (zoomLevel >= 18) {
                    toggleLayer(gridLayer, e.target.checked);
                }
        }
    }

    function toggleLayer(layer, isOn) {
        if (isOn) {
            layer.addTo(map);
        } else {
            layer.remove();
        }

        // if (map.hasLayer(layer)) {
        //     layer.remove();
        // } else {
        //     layer.addTo(map);
        // }
    }

    let isDragging = false;
    let startPos = [0, 0];

    function startDrag(e) {
        startPos = [e.layerX, e.layerY];

        console.log('start', startPos);
        isDragging = true;
    }

    function drag(e) {
        if (isDragging) {
            let curPos = [e.layerX, e.layerY];

            let latlng = map.containerPointToLatLng(curPos);
            var bounds = [map.containerPointToLatLng(startPos), map.containerPointToLatLng(curPos)];

            selection.remove();
            selection = L.rectangle(bounds, { color: '#ff7800', weight: 1 }).addTo(map);
        }
    }

    function endDrag(e) {
        let bounds = selection.getBounds();
        for (const [tag, data] of Object.entries(db)) {
            for (const [i, coord] of data.coords.entries()) {
                if (bounds.contains(coord.slice(0, 2))) {
                    coord[2] = 1;
                } else {
                    coord[2] = 0;
                }
            }
        }

        let curPos = [e.layerX, e.layerY];
        console.log('end', curPos);
        selection.remove();
        isDragging = false;
        isSelecting = false;
        selectionTool.checked = false;
        currentItem = '';
    }

    function addGrid(csv) {
        const indexToCoord = {};
        let rowCount = 0;
        let colCount = 0;
        for (const line of csv.split('\n').slice(1)) {
            const record = line.split(',');
            const x = parseFloat(record[0]);
            const y = parseFloat(record[1]);
            const rowIndex = parseInt(record.at(-2));
            const colIndex = parseInt(record.at(-1));
            indexToCoord[[rowIndex, colIndex]] = [y, x];

            if (rowIndex + 1 > rowCount) {
                rowCount = rowIndex + 1;
            }
            if (colIndex + 1 > colCount) {
                colCount = colIndex + 1;
            }
        }
        // console.log(rowCount, colCount);

        for (let row = 0; row < rowCount - 1; ++row) {
            for (let col = 0; col < colCount - 1; ++col) {
                const topLeft = indexToCoord[[row, col]];
                const bottomRight = indexToCoord[[row + 1, col + 1]];
                L.imageOverlay(GRID_PATH, [topLeft, bottomRight]).addTo(gridLayer);
            }
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

<div class="bg-my-navy text-my-navy flex h-dvh w-dvw flex-col gap-1 p-1 font-[Noto_Sans_KR]">
    <Menubar bind:data={db} />

    <div class="flex flex-auto gap-1">
        <div class="flex w-50 min-w-46 flex-col gap-1 rounded-md bg-white p-1">
            <div class="pb-0.5 text-center text-lg font-bold tracking-widest">세부사업리스트</div>
            <div class="pl-1 font-bold">1. 지역선택</div>
            <label class="px-1 text-sm font-semibold" for="sido-select">1-1. 시도</label>
            <select
                id="sido-select"
                class="border-my-navy rounded-md border-2 bg-white px-2 py-1 text-sm"
                value={selectedSido}
                onchange={changeSido}
            >
                {#each SIDOS as sido}
                    <option value={sido}>{sido}</option>
                {/each}
            </select>
            <label class="px-1 text-sm font-semibold" for="sgg-select">1-2. 시군구</label>
            <select
                id="sgg-select"
                class="border-my-navy rounded-md border-2 bg-white px-2 py-1 text-sm"
                value={selectedSggCode}
                onchange={changeSgg}
            >
                <option value="">시군구 전체</option>
                {#each availableSggs as region}
                    <option value={region.code}>{region.name.replace(`${region.sido} `, '')}</option>
                {/each}
            </select>
            <div class="bg-my-navy/10 rounded-md px-2 py-1 text-sm">
                <span class="font-semibold">지역코드:</span>
                <span>{selectedRegionCode || '-'}</span>
            </div>
            <div class="pl-1 font-bold">2. 부문선택</div>
            <label class="px-1 text-sm font-semibold" for="part-select">2-1. 부문</label>
            <select
                id="part-select"
                class="border-my-navy rounded-md border-2 bg-white px-2 py-1 text-sm"
                value={selectedPart}
                onchange={changePart}
            >
                <option value="">부문을 선택하세요</option>
                {#each PARTS as part}
                    <option value={part[0]} disabled={!ENABLED_PARTS.has(part[0])}>
                        {part[0]}{ENABLED_PARTS.has(part[0]) ? '' : ' (준비중)'}
                    </option>
                {/each}
            </select>
            <label class="px-1 text-sm font-semibold" for="item-select">2-2. 세부항목</label>
            <select
                id="item-select"
                class="border-my-navy rounded-md border-2 bg-white px-2 py-1 text-sm disabled:bg-my-gray"
                bind:value={currentItem}
                disabled={!selectedPart || availableItems.length === 0}
            >
                <option value="">
                    {selectedPart && availableItems.length === 0
                        ? '등록된 세부항목이 없습니다'
                        : '세부항목을 선택하세요'}
                </option>
                {#each availableItems as item}
                    <option value={item}>{item}</option>
                {/each}
            </select>
            {#if currentItem && interventionSettings[currentItem]}
                <div class="mt-1 space-y-1 rounded-md bg-slate-100 p-2 text-xs">
                    <div class="font-bold">{currentItem} 효과 계산 조건</div>
                    <label class="flex items-center justify-between gap-1">
                        폭·수관폭(m)
                        <input class="w-16 rounded border px-1" type="number" min="0.1" step="0.1" bind:value={interventionSettings[currentItem].widthM} />
                    </label>
                    <label class="flex items-center justify-between gap-1">
                        높이(m)
                        <input class="w-16 rounded border px-1" type="number" min="0.1" step="0.1" bind:value={interventionSettings[currentItem].heightM} />
                    </label>
                    <label class="flex items-center justify-between gap-1">
                        일사 투과율
                        <input class="w-16 rounded border px-1" type="number" min="0" max="1" step="0.05" bind:value={interventionSettings[currentItem].transmission} />
                    </label>
                </div>
            {/if}
            <div class="mt-1 space-y-1 rounded-md border border-slate-200 p-2 text-xs">
                <div class="font-bold">지역 자동 평가 조건</div>
                <dl class="space-y-1">
                    <div class="flex items-center justify-between gap-1">
                        <dt>대상지역</dt><dd class="font-semibold">{REGION_ROWS.find((region) => region.code === selectedRegionCode)?.name || '-'}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-1">
                        <dt>평가면적</dt><dd class="font-semibold">{selectedAssessmentDefaults ? `${Number(assessmentAreaM2).toLocaleString()}㎡` : '면적 자료 등록 필요'}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-1">
                        <dt>대표 태양고도</dt><dd class="font-semibold">{Number(solarAltitudeDeg).toFixed(2)}°</dd>
                    </div>
                </dl>
                <p class="text-[10px] leading-tight text-slate-500">
                    {selectedAssessmentDefaults?.areaSource || '면적 자료 미등록: 임시 평가면적 적용'} · 제공 태양고도 자료의 시군구별 남중고도 평균
                </p>
            </div>
            <button
                class="mt-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                onclick={applyPlan}
                disabled={!selectedAssessmentDefaults}
            >
                사업 적용·효과 계산
            </button>
        </div>

        <div class="relative flex-auto">
            <div class="h-full rounded-md" id="map"></div>

            {#if isSelecting}
                <canvas
                    bind:this={canvas}
                    class="absolute top-0 left-0 z-1000 h-full w-full bg-cyan-300 opacity-35"
                    onmousedown={startDrag}
                    onmousemove={drag}
                    onmouseup={endDrag}
                ></canvas>
            {/if}

            <label
                class="shadow-b1 has-checked:bg-my-gray absolute top-24 left-2 z-700 flex h-10 w-10 items-center justify-center rounded-sm bg-white text-lg shadow-lg transition-colors duration-100"
            >
                <span>🔲</span>
                <input
                    class="appearance-none"
                    bind:group={currentItem}
                    bind:this={selectionTool}
                    type="radio"
                    name="selectionTool"
                    value="selectionTool"
                    onclick={deselect}
                    onchange={change}
                />
            </label>

            <div
                class="shadow-b1 absolute bottom-2 left-2 z-700 flex h-auto w-auto flex-col gap-1 rounded-sm bg-white p-1.5 text-sm font-medium text-black opacity-80 shadow-lg"
            >
                <div class="flex items-center">
                    <input type="checkbox" id="sido" checked class="mr-1" onchange={check} /><label
                        for="sido">광역시도 경계</label
                    >
                </div>
                <div class="flex items-center">
                    <input type="checkbox" id="sgg" checked class="mr-1" onchange={check} /><label
                        for="sgg">시군구 경계</label
                    >
                </div>
                <div class="flex items-center">
                    <input type="checkbox" id="tree" checked class="mr-1" onchange={check} /><label
                        for="tree">기존 가로수</label
                    >
                </div>
                <div class="flex items-center">
                    <input
                        type="checkbox"
                        id="canopy"
                        checked
                        class="mr-1"
                        onchange={check}
                    /><label for="canopy">기존 그늘막</label>
                </div>
                <div class="flex items-center">
                    <input
                        type="checkbox"
                        id="grid"
                        checked
                        class="mr-1"
                        onchange={check}
                        bind:this={gridCheckbox}
                    /><label for="grid">격자</label>
                </div>
            </div>
        </div>

        <div class="flex w-80 min-w-55 flex-col gap-1 rounded-md bg-white p-1">
            <div class="pb-0.5 text-center text-lg font-bold tracking-widest">대시보드</div>
            <div class="bg-my-navy space-y-1 rounded-md p-0.5">
                <div class="text-w text-center">사업이행평가</div>
                <div class="space-y-1 rounded-md bg-white p-2">
                    <div class="flex flex-row">
                        <div class="flex-2 text-center font-bold">◾ 가로수:</div>
                        <div class="flex flex-3 justify-center">
                            <div class="font-bold">{appliedCounts['가로수']}</div>
                            <div class="px-1.5 font-bold">/</div>
                            <input
                                type="number"
                                class="outline-my-gray w-12 rounded-sm outline-1"
                                bind:value={db['가로수'].goal}
                                min="0"
                            />
                        </div>
                        <div class="flex-1 text-center">
                            {#if appliedCounts['가로수'] >= db['가로수'].goal}완료{:else}진행{/if}
                        </div>
                    </div>
                    <div class="flex flex-row">
                        <div class="flex-2 text-center font-bold">◾ 그늘막:</div>
                        <div class="flex flex-3 justify-center">
                            <div class="font-bold">{appliedCounts['그늘막']}</div>
                            <div class="px-1.5 font-bold">/</div>
                            <input
                                type="number"
                                class="outline-my-gray w-12 rounded-sm outline-1"
                                bind:value={db['그늘막'].goal}
                                min="0"
                            />
                        </div>
                        <div class="flex-1 text-center">
                            {#if appliedCounts['그늘막'] >= db['그늘막'].goal}완료{:else}진행{/if}
                        </div>
                    </div>
                    <div class="border-t pt-1 text-xs text-slate-600">
                        계획 수량: 가로수 {counts['가로수']}주 · 그늘막 {counts['그늘막']}개
                    </div>
                </div>
            </div>
            <div class="bg-my-navy space-y-1 rounded-md p-0.5">
                <div class="text-w text-center">적응효과평가</div>
                <div class="space-y-1 rounded-md bg-white p-2">
                    <div class="rounded bg-slate-50 p-2 text-xs text-slate-600">{effectStatus}</div>
                    <div>
                        <div class="font-bold">◾ 시간대별 예측 기온 저감</div>
                        <Graph bind:this={tempGraph}></Graph>
                    </div>
                    {#if effectResult}
                        <div class="grid grid-cols-2 gap-1 text-xs">
                            <div class="rounded bg-orange-50 p-2"><span class="block text-slate-500">평균 기온 저감</span><strong class="text-base">{effectResult.meanDeltaTC.toFixed(2)}℃</strong></div>
                            <div class="rounded bg-orange-50 p-2"><span class="block text-slate-500">최대 기온 저감</span><strong class="text-base">{effectResult.maxDeltaTC.toFixed(2)}℃</strong></div>
                            <div class="rounded bg-amber-50 p-2"><span class="block text-slate-500">유효 그늘 면적</span><strong class="text-base">{effectResult.shadeAreaM2.toFixed(1)}㎡</strong></div>
                            <div class="rounded bg-amber-50 p-2"><span class="block text-slate-500">차단 에너지</span><strong class="text-base">{effectResult.blockedEnergyMJ.toFixed(1)}MJ</strong></div>
                        </div>
                        <div class="text-xs text-slate-500">
                            평가면적 대비 유효 그늘 {(effectResult.shadeFraction * 100).toFixed(1)}%
                        </div>
                    {/if}
                    <div class="rounded border border-dashed p-2 text-xs text-slate-500">
                        향후 탄소흡수·미세먼지 저감·유출저감 효과 모듈을 같은 대시보드에 추가할 수 있습니다.
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
