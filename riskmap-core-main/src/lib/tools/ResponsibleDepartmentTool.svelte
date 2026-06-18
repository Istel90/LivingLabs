<script>
    import { onMount, tick } from 'svelte';
    import Graph from '../../routes/Graph.svelte';
    import REGION_CSV from '../../../../shared/data/administrative-regions/sido_sgg_codes.csv?raw';
    import CENTER_CSV from '../../../../shared/data/administrative-regions/sigungu_centers.csv?raw';
    import SOLAR_CSV from '../../../../shared/data/climate/solar_admin_centroid_mean.csv?raw';
    import ALTITUDE_CSV from '../../../../shared/data/climate/solar_altitude_by_sigungu.csv?raw';
    import AREA_CSV from '../../../../shared/data/administrative-regions/region_assessment_defaults.csv?raw';
    import BOUNDARY_GEOJSON from '../../../../shared/data/administrative-regions/boundaries/sigungu.geojson?raw';
    import * as XLSX from 'xlsx';
    import { calculateTemperatureEffect } from '$lib/effects/temperatureEffect.js';
    import 'leaflet/dist/leaflet.css';

    const PARTS = [
        ['건강', ['가로수', '그늘막', '무더위쉼터']],
        ['물관리', ['빗물정원', '투수포장', '저류시설']],
        ['산림/생태계', ['도시숲', '생태축']],
        ['재난/재해', ['침수방어시설']]
    ];
    const GEOMETRIES = [
        { id: 'point', label: '점형', unit: '개소' },
        { id: 'line', label: '선형', unit: 'm' },
        { id: 'polygon', label: '면형', unit: '㎡' }
    ];
    const DEFAULT_EFFECT_SPECS = {
        '가로수': { widthM: 4, heightM: 6, transmission: 0.15, shape: 'circle' },
        '그늘막': { widthM: 4, heightM: 3, transmission: 0.05, shape: 'square' },
        '무더위쉼터': { widthM: 6, heightM: 3, transmission: 0.05, shape: 'square' }
    };

    function parseCsv(text) {
        return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1)
            .map((line) => line.split(',').map((value) => value.trim().replace(/^"(.*)"$/, '$1')));
    }

    const regions = parseCsv(REGION_CSV).map(([sido, name, code]) => ({ sido, name, code }))
        .filter((row) => row.sido && row.name && row.code);
    const sidos = [...new Set(regions.map((row) => row.sido))];
    const centers = new Map(parseCsv(CENTER_CSV).map(([code, name, lng, lat]) => [code, { name, lat: Number(lat), lng: Number(lng) }]));
    const solarRows = parseCsv(SOLAR_CSV).map((row) => ({
        code: row[0],
        solar_09_kst: Number(row[6]),
        solar_12_kst: Number(row[7]),
        solar_15_kst: Number(row[8]),
        nCells: Number(row[10]),
        radiusM: Number(row[11]),
        method: row[12],
        status: row[13]
    }));
    const altitudeRows = parseCsv(ALTITUDE_CSV).map((row) => ({ code: row[0], meridianDeg: Number(row[2]) }));
    const areas = new Map(parseCsv(AREA_CSV).map((row) => [row[0], { areaM2: Number(row[2]), source: row[3] }]));
    const boundaryFeatures = JSON.parse(BOUNDARY_GEOJSON).features;

    let selectedSido = $state('서울특별시');
    let selectedRegionCode = $state('11230');
    let availableRegions = $derived(regions.filter((row) => row.sido === selectedSido));
    let selectedRegion = $derived(regions.find((row) => row.code === selectedRegionCode));
    let regionConditions = $derived(resolveRegionConditions(selectedRegion));

    let projects = $state([]);
    let activeProjectId = $state('');
    let appliedProjectIds = $state([]);
    let effectResult = $state(null);
    let effectStatus = $state('적응 사업을 디자인하고 지도에 배치한 뒤 효과를 계산하세요.');
    let showDesigner = $state(false);
    let design = $state(defaultDesign());
    let pointUploadRows = $state([]);
    let pointUploadStatus = $state('');
    let pointUploadFileName = $state('');
    let allowAddressGeocoding = $state(false);
    let isCompletingDesign = $state(false);
    let tempGraph = $state();
    let mapElement;
    let L;
    let map;
    let projectLayers;
    let selectedBoundaryLayer;
    let drawingVertices = [];
    let drawingLayer;

    let activeProject = $derived(projects.find((project) => project.id === activeProjectId));

    function defaultDesign() {
        return { title: '', part: '건강', item: '가로수', geometryType: 'point', goal: 100 };
    }

    function childRowsFor(region, sourceRows) {
        if (!region) return [];
        const prefix = `${region.name} `;
        return sourceRows.filter((row) => {
            const child = regions.find((candidate) => candidate.code === row.code);
            return child?.name.startsWith(prefix);
        });
    }

    function average(rows, key) {
        const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }

    function resolveRegionConditions(region) {
        if (!region) return { altitude: null, solar: null, area: null, altitudeBasis: '', solarBasis: '' };
        const exactAltitude = altitudeRows.find((row) => row.code === region.code);
        const childAltitudes = childRowsFor(region, altitudeRows);
        const exactSolar = solarRows.find((row) => row.code === region.code && row.status === 'ok');
        const childSolars = childRowsFor(region, solarRows).filter((row) => row.status === 'ok');
        return {
            altitude: exactAltitude?.meridianDeg ?? average(childAltitudes, 'meridianDeg'),
            solar: exactSolar || (childSolars.length ? {
                solar_09_kst: average(childSolars, 'solar_09_kst'),
                solar_12_kst: average(childSolars, 'solar_12_kst'),
                solar_15_kst: average(childSolars, 'solar_15_kst'),
                nCells: childSolars.reduce((sum, row) => sum + row.nCells, 0),
                radiusM: average(childSolars, 'radiusM'),
                method: 'child_sigungu_centroid_radius_mean',
                status: 'ok'
            } : null),
            area: areas.get(region.code),
            altitudeBasis: exactAltitude ? '선택 지역 직접값' : childAltitudes.length ? `하위 행정구역 ${childAltitudes.length}개 평균` : '자료 없음',
            solarBasis: exactSolar ? `중심점 반경 ${exactSolar.radiusM.toLocaleString()}m · ${exactSolar.nCells}셀 평균` : childSolars.length ? `하위 행정구역 ${childSolars.length}개 중심점 평균` : '자료 없음'
        };
    }

    function changeSido(event) {
        selectedSido = event.currentTarget.value;
        selectedRegionCode = regions.find((row) => row.sido === selectedSido)?.code || '';
        locateRegion();
    }

    function changeRegion(event) {
        selectedRegionCode = event.currentTarget.value;
        locateRegion();
    }

    function locateRegion() {
        const center = centers.get(selectedRegionCode);
        const region = regions.find((row) => row.code === selectedRegionCode);
        if (map && center && region) {
            const hasBoundary = updateSelectedBoundary(region, center);
            if (!hasBoundary) map.flyTo([center.lat, center.lng], regionZoom(region), { duration: 0.65 });
        }
    }

    function regionZoom(region) {
        const localName = region.name.replace(`${region.sido} `, '');
        const hasChildDistricts = regions.some((candidate) => candidate.name.startsWith(`${region.name} `));
        if (hasChildDistricts) return 11;
        if (localName.endsWith('\uAD6C')) return 13;
        if (localName.endsWith('\uC2DC') || localName.endsWith('\uAD70')) return 11;
        return 10;
    }

    function normalizedName(value) {
        return value.replace(/\s/g, '');
    }

    function featureCenter(feature) {
        const points = [];
        const collect = (value) => {
            if (typeof value?.[0] === 'number') points.push(value);
            else value?.forEach(collect);
        };
        collect(feature.geometry.coordinates);
        return points.reduce((result, point) => ({
            lat: result.lat + point[1] / points.length,
            lng: result.lng + point[0] / points.length
        }), { lat: 0, lng: 0 });
    }

    function updateSelectedBoundary(region, center) {
        if (!selectedBoundaryLayer) return false;
        const localName = normalizedName(region.name.replace(`${region.sido} `, ''));
        const hasChildDistricts = regions.some((candidate) => candidate.name.startsWith(`${region.name} `));
        let matches = boundaryFeatures.filter((feature) => {
            const featureName = normalizedName(feature.properties.name);
            return hasChildDistricts ? featureName.startsWith(localName) : featureName === localName || featureName.endsWith(localName);
        });
        if (!hasChildDistricts && matches.length > 1) {
            matches = [matches.sort((a, b) => {
                const aCenter = featureCenter(a);
                const bCenter = featureCenter(b);
                return Math.hypot(aCenter.lat - center.lat, aCenter.lng - center.lng)
                    - Math.hypot(bCenter.lat - center.lat, bCenter.lng - center.lng);
            })[0]];
        }
        selectedBoundaryLayer.clearLayers();
        if (!matches.length) return false;
        selectedBoundaryLayer.addData({ type: 'FeatureCollection', features: matches });
        map.flyToBounds(selectedBoundaryLayer.getBounds(), { padding: [35, 35], maxZoom: 13, duration: 0.65 });
        return true;
    }

    function openDesigner() {
        design = defaultDesign();
        pointUploadRows = [];
        pointUploadStatus = '';
        pointUploadFileName = '';
        allowAddressGeocoding = false;
        showDesigner = true;
    }

    function changeDesignPart(event) {
        design.part = event.currentTarget.value;
        design.item = PARTS.find((part) => part[0] === design.part)?.[1]?.[0] || '';
    }

    function parseDelimitedLine(line, delimiter) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            const next = line[index + 1];
            if (char === '"' && inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }

    function parseUploadCsv(text) {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
        if (lines.length < 2) return [];
        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseDelimitedLine(lines[0], delimiter);
        return lines.slice(1).map((line) => {
            const values = parseDelimitedLine(line, delimiter);
            return Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? '']));
        });
    }

    function headerValue(row, keys) {
        const entries = Object.entries(row);
        const match = entries.find(([key]) => keys.some((candidate) => key.toLowerCase().replace(/\s/g, '').includes(candidate)));
        return match?.[1] ?? '';
    }

    function numericValue(value) {
        const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizePointRows(rows) {
        return rows.map((row, index) => {
            const lat = numericValue(headerValue(row, ['위도', 'lat', 'latitude', 'y']));
            const lng = numericValue(headerValue(row, ['경도', 'lng', 'lon', 'longitude', 'x']));
            const address = String(headerValue(row, ['주소', 'address', 'addr', '소재지', '위치', '도로명', '지번'])).trim();
            const label = String(headerValue(row, ['명칭', 'name', 'title', '사업명', '시설명'])).trim();
            return { index: index + 1, lat, lng, address, label };
        }).filter((row) => (Number.isFinite(row.lat) && Number.isFinite(row.lng)) || row.address);
    }

    async function handlePointUpload(event) {
        const file = event.currentTarget.files?.[0];
        pointUploadRows = [];
        pointUploadStatus = '';
        pointUploadFileName = file?.name || '';
        if (!file) return;
        try {
            let rawRows = [];
            if (/\.(xlsx|xls)$/i.test(file.name)) {
                const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            } else {
                rawRows = parseUploadCsv(await file.text());
            }
            pointUploadRows = normalizePointRows(rawRows);
            pointUploadStatus = pointUploadRows.length
                ? `${pointUploadRows.length}개 행을 읽었습니다. 위도/경도는 바로 배치하고, 주소만 있는 행은 외부 지오코딩 사용을 체크한 경우에만 좌표를 찾습니다.`
                : '읽을 수 있는 행이 없습니다. 주소 또는 위도/경도 열을 확인해주세요.';
        } catch (error) {
            pointUploadStatus = `파일을 읽지 못했습니다: ${error.message}`;
        }
    }

    async function geocodeAddress(address) {
        const query = selectedRegion?.name ? `${address} ${selectedRegion.name}` : address;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=${encodeURIComponent(query)}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('geocoding failed');
        const [result] = await response.json();
        return result ? { lat: Number(result.lat), lng: Number(result.lon) } : null;
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function createPointLayer(project, latlng) {
        if (project.item === '가로수') {
            return L.marker(latlng, {
                icon: L.divIcon({
                    className: 'tree-marker',
                    html: '<span class="tree-canopy"></span><span class="tree-trunk"></span>',
                    iconSize: [28, 34],
                    iconAnchor: [14, 32]
                })
            }).addTo(projectLayers);
        }
        return L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: project.color, fillOpacity: 1 }).addTo(projectLayers);
    }

    function addPointFeature(project, latlng, source = {}) {
        const layer = createPointLayer(project, latlng);
        if (source.label || source.address) layer.bindPopup([source.label, source.address].filter(Boolean).join('<br>'));
        addFeature(project, { coordinates: [[latlng.lat, latlng.lng]], measure: 1, layer, source });
    }

    async function addUploadedPointRows(project) {
        if (!pointUploadRows.length || project.geometryType !== 'point') return;
        let added = 0;
        let failed = 0;
        for (const row of pointUploadRows) {
            let latlng = Number.isFinite(row.lat) && Number.isFinite(row.lng) ? { lat: row.lat, lng: row.lng } : null;
            if (!latlng && row.address && allowAddressGeocoding) {
                try {
                    latlng = await geocodeAddress(row.address);
                    await wait(250);
                } catch {
                    latlng = null;
                }
            }
            if (latlng) {
                addPointFeature(project, latlng, row);
                added += 1;
            } else {
                failed += 1;
            }
        }
        pointUploadStatus = `${pointUploadFileName}: ${added}개 배치 완료${failed ? `, ${failed}개 미배치` : ''}`;
    }

    async function completeDesign() {
        if (isCompletingDesign) return;
        isCompletingDesign = true;
        try {
            const geometry = GEOMETRIES.find((item) => item.id === design.geometryType);
            const effectSpec = DEFAULT_EFFECT_SPECS[design.item] || {};
            const id = `project-${Date.now()}`;
            const project = {
                ...design,
                ...effectSpec,
                id,
                unit: geometry.unit,
                features: [],
                quantity: 0,
                appliedQuantity: 0,
                color: design.geometryType === 'point' ? '#0f9f6e' : design.geometryType === 'line' ? '#2563eb' : '#e87922'
            };
            projects = [...projects, project];
            activeProjectId = id;
            await addUploadedPointRows(project);
            showDesigner = false;
        } finally {
            isCompletingDesign = false;
        }
    }

    function selectProject(id) {
        activeProjectId = id;
        drawingVertices = [];
        drawingLayer?.remove();
        drawingLayer = null;
    }

    function clearDrawingDraft() {
        drawingVertices = [];
        drawingLayer?.remove();
        drawingLayer = null;
    }

    function removeProjectLayerFeature(feature) {
        feature?.layer?.remove?.();
    }

    function undoLastFeature() {
        const project = activeProject;
        if (!project) return;
        if (drawingVertices.length || drawingLayer) {
            clearDrawingDraft();
            return;
        }
        const feature = project.features.pop();
        removeProjectLayerFeature(feature);
        updateQuantity(project);
        projects = [...projects];
    }

    function clearActiveProjectFeatures() {
        const project = activeProject;
        if (!project) return;
        clearDrawingDraft();
        project.features.forEach(removeProjectLayerFeature);
        project.features = [];
        project.quantity = 0;
        project.appliedQuantity = 0;
        appliedProjectIds = appliedProjectIds.filter((id) => id !== project.id);
        projects = [...projects];
    }

    function deleteActiveProject() {
        const project = activeProject;
        if (!project) return;
        clearDrawingDraft();
        project.features.forEach(removeProjectLayerFeature);
        projects = projects.filter((item) => item.id !== project.id);
        appliedProjectIds = appliedProjectIds.filter((id) => id !== project.id);
        activeProjectId = projects[0]?.id || '';
        if (!projects.length) {
            effectResult = null;
            effectStatus = '적응 사업을 디자인하고 지도에 배치한 뒤 효과를 계산하세요.';
        }
    }

    function measureLine(vertices) {
        return vertices.slice(1).reduce((sum, point, index) => sum + map.distance(vertices[index], point), 0);
    }

    function measurePolygon(vertices) {
        if (vertices.length < 3) return 0;
        const center = vertices.reduce((acc, point) => [acc[0] + point.lat / vertices.length, acc[1] + point.lng / vertices.length], [0, 0]);
        return Math.abs(vertices.reduce((sum, point, index) => {
            const next = vertices[(index + 1) % vertices.length];
            const x1 = map.distance([center[0], center[1]], [center[0], point.lng]) * Math.sign(point.lng - center[1]);
            const y1 = map.distance([center[0], center[1]], [point.lat, center[1]]) * Math.sign(point.lat - center[0]);
            const x2 = map.distance([center[0], center[1]], [center[0], next.lng]) * Math.sign(next.lng - center[1]);
            const y2 = map.distance([center[0], center[1]], [next.lat, center[1]]) * Math.sign(next.lat - center[0]);
            return sum + x1 * y2 - x2 * y1;
        }, 0) / 2);
    }

    function updateQuantity(project) {
        if (project.geometryType === 'point') project.quantity = project.features.length;
        if (project.geometryType === 'line') project.quantity = project.features.reduce((sum, feature) => sum + feature.measure, 0);
        if (project.geometryType === 'polygon') project.quantity = project.features.reduce((sum, feature) => sum + feature.measure, 0);
    }

    function addFeature(project, feature) {
        project.features.push(feature);
        updateQuantity(project);
        projects = [...projects];
    }

    function onMapClick(event) {
        const project = activeProject;
        if (!project) return;
        if (project.geometryType === 'point') {
            addPointFeature(project, event.latlng);
            return;
        }
        drawingVertices = [...drawingVertices, event.latlng];
        drawingLayer?.remove();
        drawingLayer = project.geometryType === 'line'
            ? L.polyline(drawingVertices, { color: project.color, weight: 5 }).addTo(map)
            : L.polygon(drawingVertices, { color: project.color, fillOpacity: .25 }).addTo(map);
    }

    function finishGeometry() {
        const project = activeProject;
        if (!project || project.geometryType === 'point' || drawingVertices.length < (project.geometryType === 'line' ? 2 : 3)) return;
        const vertices = [...drawingVertices];
        const layer = project.geometryType === 'line'
            ? L.polyline(vertices, { color: project.color, weight: 5 }).addTo(projectLayers)
            : L.polygon(vertices, { color: project.color, fillOpacity: .25 }).addTo(projectLayers);
        const measure = project.geometryType === 'line' ? measureLine(vertices) : measurePolygon(vertices);
        drawingLayer?.remove();
        drawingLayer = null;
        drawingVertices = [];
        addFeature(project, { coordinates: vertices.map((point) => [point.lat, point.lng]), measure, layer });
    }

    async function applyAndCalculate() {
        if (!projects.length) return;
        appliedProjectIds = projects.map((project) => project.id);
        projects = projects.map((project) => ({ ...project, appliedQuantity: project.quantity || project.goal }));
        const healthProjects = projects.filter((project) => project.part === '건강');
        if (healthProjects.length && regionConditions.solar) {
            const interventions = healthProjects.map((project) => ({
                id: project.id,
                count: project.geometryType === 'point' ? project.appliedQuantity : Math.max(1, project.appliedQuantity / Math.max(project.widthM, 1)),
                widthM: project.widthM,
                heightM: project.heightM,
                transmission: project.transmission,
                shape: project.shape || (project.geometryType === 'point' ? 'circle' : 'square')
            }));
            effectResult = calculateTemperatureEffect({
                interventions,
                solar: regionConditions.solar,
                solarAltitudeDeg: regionConditions.altitude || 45,
                assessmentAreaM2: regionConditions.area?.areaM2 || 10000
            });
            await tick();
            tempGraph?.update(effectResult.times.map((row) => row.deltaTC));
            const quantityBasis = healthProjects.some((project) => !project.quantity) ? '목표 물량을 시범 적용하여' : '지도 배치 물량을 적용하여';
            effectStatus = `${selectedRegion?.name} 건강 부문 사업의 기온 저감 효과를 ${quantityBasis} 계산했습니다.`;
        } else if (!regionConditions.solar) {
            effectResult = null;
            effectStatus = `${selectedRegion?.name}의 지점별 일사량 자료가 없어 효과 계산을 실행하지 않았습니다.`;
        } else {
            effectResult = null;
            effectStatus = '현재 선택한 부문의 적응효과 계산 모듈은 준비 중입니다.';
        }
    }

    onMount(async () => {
        const leaflet = await import('leaflet');
        L = leaflet.default || leaflet;
        map = L.map(mapElement, { minZoom: 7, maxZoom: 19 }).setView([37.581956547, 127.05484785], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
        map.createPane('selectedBoundary');
        map.getPane('selectedBoundary').style.zIndex = 450;
        selectedBoundaryLayer = L.geoJSON(null, {
            pane: 'selectedBoundary',
            interactive: false,
            style: { color: '#e11d48', weight: 4, opacity: 1, fillColor: '#fb7185', fillOpacity: 0.06 }
        }).addTo(map);
        projectLayers = L.layerGroup().addTo(map);
        map.on('click', onMapClick);
        map.on('dblclick', finishGeometry);
        locateRegion();
        return () => map.remove();
    });
</script>

<div class="tool-shell">
    <aside class="sidebar">
        <h1>사업소관부서 지원도구</h1>
        <section class="region-selector">
            <h2>1. 지역 선택</h2>
            <label>시도<select value={selectedSido} onchange={changeSido}>{#each sidos as sido}<option>{sido}</option>{/each}</select></label>
            <label>시군구<select value={selectedRegionCode} onchange={changeRegion}>{#each availableRegions as region}<option value={region.code}>{region.name.replace(`${region.sido} `, '')}</option>{/each}</select></label>
            <p>현재 대상지역: <strong>{selectedRegion?.name}</strong></p>
        </section>
        <section class="design-section">
            <div class="section-head"><h2>2. 적응 사업 디자인</h2><button onclick={openDesigner}>+ 적응 사업 디자인 하기</button></div>
            {#if projects.length}
                <div class="project-list">
                    {#each projects as project}
                        <button class:active={activeProjectId === project.id} onclick={() => selectProject(project.id)}>
                            <span class="project-index">{projects.indexOf(project) + 1}</span>
                            <span class="project-summary">
                                <strong>{#if project.item === '가로수'}<i class="tree-list-icon" aria-hidden="true"></i>{/if}{project.title}</strong><span>{project.part} · {project.item} · {GEOMETRIES.find((item) => item.id === project.geometryType)?.label}</span>
                                <small>{project.quantity.toFixed(project.geometryType === 'point' ? 0 : 1)} / {project.goal} {project.unit}</small>
                            </span>
                        </button>
                    {/each}
                </div>
            {:else}<p class="empty">아직 디자인된 사업이 없습니다.</p>{/if}
            {#if activeProject && activeProject.geometryType !== 'point'}
                <button class="finish" onclick={finishGeometry}>현재 {activeProject.geometryType === 'line' ? '선' : '면'} 완성</button>
            {/if}
            <button class="apply" onclick={applyAndCalculate} disabled={!projects.length}>사업 적용·효과 계산</button>
        </section>
        <section class="conditions">
            <h2>지역 자동 평가 조건</h2>
            <dl>
                <div><dt>대상지역</dt><dd>{selectedRegion?.name}</dd></div>
                <div><dt>평가면적</dt><dd>{regionConditions.area ? `${regionConditions.area.areaM2.toLocaleString()}㎡` : '자료 등록 필요'}</dd></div>
                <div><dt>대표 태양고도</dt><dd>{regionConditions.altitude ? `${regionConditions.altitude.toFixed(2)}°` : '자료 없음'}</dd></div>
                <div><dt>고도 산정기준</dt><dd>{regionConditions.altitudeBasis}</dd></div>
                <div><dt>09시 일사량</dt><dd>{regionConditions.solar ? `${regionConditions.solar.solar_09_kst.toFixed(1)} W/㎡` : '자료 없음'}</dd></div>
                <div><dt>12시 일사량</dt><dd>{regionConditions.solar ? `${regionConditions.solar.solar_12_kst.toFixed(1)} W/㎡` : '자료 없음'}</dd></div>
                <div><dt>15시 일사량</dt><dd>{regionConditions.solar ? `${regionConditions.solar.solar_15_kst.toFixed(1)} W/㎡` : '자료 없음'}</dd></div>
                <div><dt>일사량 산정기준</dt><dd>{regionConditions.solarBasis}</dd></div>
            </dl>
        </section>
    </aside>

    <main class="map-wrap">
        <div class="map" bind:this={mapElement}></div>
        <div class="map-guide">{activeProject ? `${activeProject.title}: 지도에서 ${GEOMETRIES.find((item) => item.id === activeProject.geometryType)?.label} 데이터를 생성하세요.` : '왼쪽에서 적응 사업을 디자인하고 선택하세요.'}</div>
        {#if activeProject}
            <div class="map-edit-panel">
                <div>
                    <b>{activeProject.title}</b>
                    <span>{GEOMETRIES.find((item) => item.id === activeProject.geometryType)?.label} · {activeProject.quantity.toFixed(activeProject.geometryType === 'point' ? 0 : 1)} {activeProject.unit}</span>
                </div>
                <button type="button" onclick={undoLastFeature}>마지막 입력 취소</button>
                <button type="button" onclick={clearActiveProjectFeatures}>배치 전체 삭제</button>
                <button type="button" class="danger" onclick={deleteActiveProject}>사업 삭제</button>
            </div>
        {/if}
    </main>

    <aside class="dashboard">
        <h2>대시보드</h2>
        <section class="effect">
            <h3>적응효과평가</h3>
            <p>{effectStatus}</p>
            {#if projects.some((project) => project.part === '건강')}
                <h4>건강 부문 · 기온 저감 효과</h4>
                <Graph bind:this={tempGraph} />
                <div class="metrics"><div><span>대상지역 평균 기온 저감</span><strong>{effectResult ? `${effectResult.meanDeltaTC.toFixed(6)}℃` : '-'}</strong></div><div><span>차단 에너지</span><strong>{effectResult ? `${effectResult.blockedEnergyMJ.toFixed(1)}MJ` : '-'}</strong></div></div>
                {#if projects.some((project) => project.item === '가로수')}<div class="default-spec"><strong>가로수 기본 조건</strong><span>수관폭 4m · 높이 6m · 일사 투과율 15% · 원형 수관</span><span>일사량: 선택 시군구 중심점 주변 1km KMAP 셀 평균</span></div>{/if}
            {:else}<div class="placeholder">디자인된 사업의 부문에 따라 적응효과 지표가 표시됩니다.</div>{/if}
        </section>
        <section class="implementation">
            <h3>사업이행평가</h3>
            {#if projects.length}{#each projects as project}<article><strong>{project.title}</strong><span>{project.part} · {project.unit}</span><div><b>{project.appliedQuantity.toFixed(project.geometryType === 'point' ? 0 : 1)}</b> / {project.goal}</div><progress max={project.goal} value={Math.min(project.appliedQuantity, project.goal)}></progress></article>{/each}
            {:else}<div class="placeholder">디자인 완료된 사업이 표시됩니다.</div>{/if}
        </section>
    </aside>
</div>

{#if showDesigner}
    <div class="modal-backdrop">
        <form class="modal" onsubmit={async (event) => { event.preventDefault(); await completeDesign(); }}>
            <h2>적응 사업 디자인</h2>
            <label>사업 제목<input required bind:value={design.title} placeholder="예: 폭염 취약지역 가로수 조성" /></label>
            <label>2-1. 부문<select value={design.part} onchange={changeDesignPart}>{#each PARTS as part}<option value={part[0]}>{part[0]}</option>{/each}</select></label>
            <label>2-2. 세부항목<select bind:value={design.item}>{#each PARTS.find((part) => part[0] === design.part)?.[1] || [] as item}<option>{item}</option>{/each}</select></label>
            <label>사업 공간유형<select bind:value={design.geometryType}>{#each GEOMETRIES as geometry}<option value={geometry.id}>{geometry.label} · 목표 단위 {geometry.unit}</option>{/each}</select></label>
            {#if design.geometryType === 'point'}
                <fieldset class="point-upload">
                    <legend>점형 위치 일괄 입력</legend>
                    <label>주소/좌표 파일<input type="file" accept=".csv,.tsv,.xlsx,.xls" onchange={handlePointUpload} /></label>
                    <p>CSV 또는 엑셀 첫 시트에 <b>주소</b> 열을 넣거나, <b>위도</b>와 <b>경도</b> 열을 넣어주세요. 선택 열: 명칭/사업명/시설명.</p>
                    <label class="inline-check"><input type="checkbox" bind:checked={allowAddressGeocoding} />주소만 있는 행은 공개 지오코딩으로 좌표 변환</label>
                    {#if pointUploadStatus}<p class="upload-status">{pointUploadStatus}</p>{/if}
                </fieldset>
            {/if}
            <label>사업 목표 물량<input required type="number" min="0" step="0.1" bind:value={design.goal} /></label>
            <div class="modal-actions"><button type="button" onclick={() => showDesigner = false}>취소</button><button type="submit" disabled={isCompletingDesign}>{isCompletingDesign ? '배치 중...' : '디자인 완료'}</button></div>
        </form>
    </div>
{/if}

<style>
    :global(body){margin:0}.tool-shell{display:grid;grid-template-columns:280px minmax(400px,1fr) 340px;gap:6px;height:100vh;padding:6px;background:#10233f;color:#10233f;font-family:Pretendard,Arial,sans-serif;box-sizing:border-box}.sidebar,.dashboard{overflow:auto;border-radius:8px;background:#fff;padding:12px}.sidebar h1{font-size:18px;margin:0 0 12px}.sidebar section{padding:12px 0;border-top:1px solid #e2e8f0}.sidebar h2,.dashboard h2{font-size:15px;margin:0 0 9px}label{display:grid;gap:4px;margin:7px 0;font-size:12px;font-weight:700}input,select{padding:7px;border:1px solid #cbd5e1;border-radius:5px;background:white;color:#10233f}.region-selector{position:sticky;z-index:700;top:-12px;margin:0 -4px 10px;padding:14px 12px!important;border:2px solid #2563eb!important;border-radius:8px;background:#eff6ff;box-shadow:0 3px 10px #10233f1f}.region-selector h2{color:#0f4c9a}.region-selector select{width:100%;border-color:#60a5fa;font-weight:700;cursor:pointer}.region-selector select:hover,.region-selector select:focus{border-color:#0f4c9a;outline:2px solid #bfdbfe}.region-selector p{margin:9px 0 0;padding:7px;border-radius:5px;background:#fff;font-size:11px;color:#475569}.section-head{display:grid;gap:7px}.section-head button,.apply,.finish{padding:9px;border:0;border-radius:6px;background:#0f9f6e;color:white;font-weight:700}.project-list{display:grid;gap:6px;margin:9px 0}.project-list button{display:grid;grid-template-columns:24px 1fr;align-items:start;gap:8px;text-align:left;padding:9px;border:1px solid #dbe4ee;border-radius:7px;background:#fff}.project-list button.active{border-color:#0f9f6e;background:#ecfdf5}.project-index{display:grid!important;place-items:center;width:22px;height:22px;border-radius:999px;background:#e0f2fe!important;color:#0369a1!important;font-size:11px!important;font-weight:900}.project-summary{display:grid;gap:3px}.project-list span,.project-list small,.empty{font-size:11px;color:#64748b}.finish{width:100%;background:#2563eb;margin-bottom:6px}.apply{width:100%;background:#10233f}.apply:disabled{opacity:.4}.conditions{margin-top:auto}.conditions dl{display:grid;gap:5px;margin:0;font-size:11px}.conditions dl div{display:flex;justify-content:space-between;gap:8px}.conditions dd{margin:0;text-align:right;font-weight:700}.map-wrap{position:relative;min-width:0}.map{height:100%;border-radius:8px}.map-guide{position:absolute;z-index:600;top:10px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:20px;background:#fff;box-shadow:0 2px 12px #0003;font-size:12px;font-weight:700}.map-edit-panel{position:absolute;z-index:650;left:50%;bottom:18px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 36px);padding:10px 12px;border:1px solid #ffffff99;border-radius:14px;background:#ffffffe6;box-shadow:0 12px 30px #0f172a33;backdrop-filter:blur(10px)}.map-edit-panel div{display:grid;min-width:170px;margin-right:4px}.map-edit-panel b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:12px}.map-edit-panel span{color:#475569;font-size:11px}.map-edit-panel button{padding:8px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#10233f;font-size:11px;font-weight:800;white-space:nowrap}.map-edit-panel .danger{border-color:#fecaca;background:#fff1f2;color:#be123c}.dashboard h3{margin:0;padding:8px;border-radius:5px;background:#10233f;color:#fff;font-size:14px}.dashboard section{margin-bottom:10px;border:1px solid #dbe4ee;border-radius:7px;padding:5px}.dashboard p,.placeholder{font-size:11px;color:#64748b;padding:8px}.dashboard h4{font-size:12px;margin:7px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:5px}.metrics div{display:grid;gap:3px;padding:8px;border-radius:6px;background:#fff7ed;font-size:11px}.implementation article{display:grid;gap:5px;padding:9px;border-bottom:1px solid #e2e8f0;font-size:12px}.implementation article span{color:#64748b;font-size:11px}progress{width:100%}.modal-backdrop{position:fixed;z-index:2000;inset:0;display:grid;place-items:center;background:#0f172a99}.modal{width:min(520px,calc(100vw - 32px));max-height:90vh;overflow:auto;padding:22px;border-radius:12px;background:#fff;box-shadow:0 20px 70px #0005}.modal h2{margin-top:0}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.modal-actions button{padding:9px 16px;border:0;border-radius:6px}.modal-actions button:last-child{background:#0f9f6e;color:#fff;font-weight:700}@media(max-width:1000px){.tool-shell{grid-template-columns:240px 1fr}.dashboard{display:none}}
    .sidebar,.dashboard{color:#0f172a;opacity:1}.sidebar h1,.sidebar h2,.dashboard h2,.sidebar label,.dashboard strong{opacity:1;color:#0f172a}.sidebar section,.dashboard section{background:#fff}.sidebar p,.empty,.project-list span,.project-list small,.implementation article span{color:#334155;opacity:1}.dashboard{background:#f8fafc}.dashboard h2{font-size:17px;font-weight:800}.dashboard h3{background:#10233f;color:#fff!important;font-weight:800}.dashboard section{padding:8px;border-color:#cbd5e1;box-shadow:0 1px 3px #0f172a12}.dashboard p,.dashboard .placeholder{margin:8px 0;padding:10px;border:1px solid #dbe4ee;border-radius:6px;background:#fff;color:#1e293b;font-size:12px;font-weight:600;line-height:1.5;opacity:1}.dashboard h4{color:#0f172a;font-weight:800}.metrics span{color:#334155;font-weight:700}.apply:disabled{opacity:1;background:#94a3b8;color:#fff}.modal-backdrop{background:#0f172a26}
    .point-upload{display:grid;gap:7px;margin:10px 0;padding:12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff}.point-upload legend{padding:0 5px;color:#0f4c9a;font-size:12px;font-weight:800}.point-upload p{margin:0;color:#334155;font-size:11px;line-height:1.5}.point-upload input[type=file]{padding:8px;background:#fff}.inline-check{display:flex;align-items:center;gap:6px;margin:2px 0;color:#334155;font-size:11px;font-weight:700}.inline-check input{width:auto}.upload-status{padding:8px!important;border-radius:6px;background:#fff!important;color:#0f766e!important;font-weight:700}.modal-actions button:disabled{background:#94a3b8!important;color:#fff;cursor:wait}
    .default-spec{display:grid;gap:4px;margin-top:8px;padding:9px;border-radius:6px;background:#ecfdf5;color:#166534;font-size:11px}.default-spec strong{color:#166534!important}.tree-list-icon{display:inline-block;width:12px;height:12px;margin-right:6px;border-radius:50%;background:#16a34a;box-shadow:inset 0 0 0 2px #bbf7d0;vertical-align:-1px}:global(.tree-marker){position:relative;background:transparent;border:0}:global(.tree-canopy){position:absolute;top:0;left:3px;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:#16a34a;box-shadow:0 1px 5px #0005}:global(.tree-canopy::after){content:'';position:absolute;top:4px;left:5px;width:8px;height:8px;border-radius:50%;background:#4ade80}:global(.tree-trunk){position:absolute;top:20px;left:12px;width:5px;height:12px;border-radius:0 0 2px 2px;background:#854d0e;box-shadow:0 1px 3px #0004}
    .map-edit-panel{transform:translateX(-50%)}
</style>
