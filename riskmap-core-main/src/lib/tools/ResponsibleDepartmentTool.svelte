<script>
    import { onMount, tick } from 'svelte';
    import Graph from '../../routes/Graph.svelte';
    import { portalToolsUrl } from '$lib/portalLinks.js';
    import {
        getBoundaryFeaturesForRegionCode,
        regionOptions,
        regionZoom as adminRegionZoom,
        sidos as adminSidos
    } from '$lib/data/administrativeRegions.js';
    import SOLAR_CSV from '../../../../shared/data/climate/solar_admin_centroid_mean.csv?raw';
    import ALTITUDE_CSV from '../../../../shared/data/climate/solar_altitude_by_sigungu.csv?raw';
    import AREA_CSV from '../../../../shared/data/administrative-regions/region_assessment_defaults.csv?raw';
    import {
        createVWorldDataUrl,
        createVWorldWmsOptions,
        hasVWorldApiKey,
        VWORLD_DATASETS,
        VWORLD_WMS_LAYERS,
        VWORLD_WMS_URL
    } from '../../../../shared/map/vworld.js';
    import { getLatestPlatformHandoff, savePlatformHandoff } from '../../../../shared/services/platformHandoffs.js';
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
    const DEPARTMENT_HANDOFF_KEY = 'livinglabs.responsibleDepartmentHandoff';
    const RESPONSIBLE_HANDOFF_INBOX_URL = import.meta.env.VITE_RESPONSIBLE_HANDOFF_INBOX_URL || '/responsible-handoff';
    const RESPONSIBLE_REVIEW_INBOX_URL = import.meta.env.VITE_RESPONSIBLE_REVIEW_INBOX_URL || '/responsible-review-response';
    const DEFAULT_REGION_CODE = '41110';
    let { initialHandoff = null, initialWorkspace = false } = $props();
    const DEFAULT_SIDO = '경기도';

    function parseCsv(text) {
        return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1)
            .map((line) => line.split(',').map((value) => value.trim().replace(/^"(.*)"$/, '$1')));
    }

    const regions = regionOptions.map((region) => ({
        sido: region.sido,
        name: region.fullName,
        code: region.code,
        center: region.center,
        childCodes: region.childCodes,
        sigungu: region.sigungu,
        type: region.type
    }));
    const sidos = adminSidos;
    const centers = new Map(regions
        .filter((region) => region.center)
        .map((region) => [region.code, { name: region.name, lat: region.center[0], lng: region.center[1] }]));
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

    let selectedSido = $state(DEFAULT_SIDO);
    let selectedRegionCode = $state(DEFAULT_REGION_CODE);
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
    let incomingHandoff = $state(initialHandoff);
    let incomingHandoffStatus = $state('');
    let reviewResponseStatus = $state('주관부서로 회신할 검토 결과가 준비되지 않았습니다.');
    let activeHandoffAlternativeId = $state(
        initialHandoff?.alternatives?.find((alternative) => alternative.candidates?.length)?.id || ''
    );
    let departmentSelection = $state(null);
    let handoffNoticeOpen = $state(Boolean(initialWorkspace && initialHandoff));
    let placementEditMode = $state(false);
    let workspaceView = $state(Boolean(initialWorkspace));
    let entryLoading = $state(!initialWorkspace);
    let workspaceLoading = $state(Boolean(initialWorkspace));
    let mapReady = $state(false);
    let tempGraph = $state();
    let mapElement = $state();
    let L;
    let map;
    let projectLayers;
    let selectedBoundaryLayer;
    let cadastralLayer;
    let handoffCandidateLayers;
    let handoffCandidateHighlightLayer;
    let candidateGeometryCache = $state({});
    let candidateGeometryStatus = $state('');
    let candidateGeometryRequestKey = '';
    let cadastralVisible = $state(false);
    let drawingVertices = [];
    let drawingLayer;

    let incomingAlternatives = $derived((incomingHandoff?.alternatives || [])
        .filter((alternative) => alternative.candidates?.length));
    let activeIncomingAlternative = $derived(
        incomingAlternatives.find((alternative) => alternative.id === activeHandoffAlternativeId)
            || incomingAlternatives[0]
    );
    let incomingCandidateCount = $derived(incomingAlternatives.reduce((sum, alternative) => (
        sum + (alternative.candidates?.length || 0)
    ), 0));
    let incomingPlacementCount = $derived(Array.isArray(incomingHandoff?.adaptationPlacements)
        ? incomingHandoff.adaptationPlacements.length
        : 0);
    let incomingProjectCount = $derived(Array.isArray(incomingHandoff?.adaptationProjects)
        ? incomingHandoff.adaptationProjects.length
        : 0);
    let activeProject = $derived(projects.find((project) => project.id === activeProjectId));

    $effect(() => {
        if (!mapReady) return;
        if (incomingHandoff && activeIncomingAlternative?.id) {
            hydrateActiveIncomingCandidateGeometries(false);
        } else {
            clearIncomingCandidateLayers();
        }
    });

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

    function formatCount(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number.toLocaleString() : '-';
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
        clearIncomingHandoffState();
        if (workspaceView) loadResponsibleHandoff({ force: true });
        locateRegion();
    }

    function changeRegion(event) {
        selectedRegionCode = event.currentTarget.value;
        clearIncomingHandoffState();
        if (workspaceView) loadResponsibleHandoff({ force: true });
        locateRegion();
    }

    function clearIncomingHandoffState() {
        incomingHandoff = null;
        incomingHandoffStatus = '';
        activeHandoffAlternativeId = '';
        departmentSelection = null;
        handoffNoticeOpen = false;
        clearIncomingCandidateLayers();
    }

    function requestJson(url, options = {}) {
        if (typeof fetch === 'function') {
            return fetch(url, options).then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            });
        }
        if (typeof XMLHttpRequest !== 'function') {
            return Promise.reject(new Error('No browser request API is available.'));
        }
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(options.method || 'GET', url, true);
            xhr.setRequestHeader('Accept', 'application/json');
            if (options.headers) {
                Object.entries(options.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
            }
            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error(`HTTP ${xhr.status}`));
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.responseText || 'null'));
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            };
            xhr.onerror = () => reject(new Error('Request failed'));
            xhr.send(options.body || null);
        });
    }

    function withTimeout(promise, timeoutMs = 1800) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
    }

    async function fetchResponsibleHandoffFromInbox(regionCode) {
        try {
            const supabasePayload = await withTimeout(
                getLatestPlatformHandoff('lead_to_responsible', regionCode, ['requested', 'reviewing', 'risk_done', 'sent', 'completed']),
                1800
            );
            if (supabasePayload?.schemaVersion === 'lead-to-responsible-handoff/v1') return supabasePayload;
        } catch {
            // Local demo inbox remains the reliable fallback during disconnected previews.
        }

        try {
            const urls = [
                new URL(RESPONSIBLE_HANDOFF_INBOX_URL, window.location.origin),
                new URL('/responsible-handoff', window.location.origin),
                new URL('http://127.0.0.1:5176/responsible-handoff')
            ];
            const uniqueUrls = [...new Map(urls.map((url) => {
                url.searchParams.set('regionCode', regionCode);
                return [url.toString(), url.toString()];
            })).values()];
            for (const url of uniqueUrls) {
                try {
                    const result = await requestJson(url, { cache: 'no-store' });
                    const payload = result?.payload;
                    if (payload?.schemaVersion === 'lead-to-responsible-handoff/v1') return payload;
                } catch {
                    // Try the next configured inbox URL.
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    async function loadResponsibleHandoff({ force = false, showLoading = true } = {}) {
        const showEntryLoading = showLoading && !workspaceView;
        const showWorkspaceLoading = showLoading && workspaceView;
        if (showEntryLoading) entryLoading = true;
        if (showWorkspaceLoading) workspaceLoading = true;
        try {
            const params = new URLSearchParams(window.location.search);
            const handoffRequested = params.get('handoff') === 'lead-department';
            const workspaceRequested = params.get('view') === 'workspace';
            const shouldReadInbox = force || handoffRequested || workspaceRequested || Boolean(initialHandoff?.regionCode === selectedRegionCode);
            if (!shouldReadInbox) {
                clearIncomingHandoffState();
                return null;
            }

            let payload = await fetchResponsibleHandoffFromInbox(selectedRegionCode);
            if (!payload && initialHandoff?.regionCode === selectedRegionCode) {
                payload = initialHandoff;
            }
            const raw = !payload && handoffRequested
                ? window.localStorage.getItem(DEPARTMENT_HANDOFF_KEY) || window.sessionStorage.getItem(DEPARTMENT_HANDOFF_KEY)
                : null;
            payload = payload || (raw ? JSON.parse(raw) : null);
            if (!payload && window.name) {
                const namedPayload = JSON.parse(window.name);
                if (namedPayload?.type === DEPARTMENT_HANDOFF_KEY) payload = namedPayload.payload;
            }
            if (!payload) {
                clearIncomingHandoffState();
                return null;
            }
            if (!payload?.alternatives?.some((alternative) => alternative.candidates?.length) && payload?.candidates?.length) {
                payload.alternatives = [{
                    id: 'legacy-alternative',
                    name: '전달 대안',
                    status: '검토요청',
                    description: '이전 전달 형식에서 변환된 후보 묶음',
                    candidates: payload.candidates
                }];
            }

            const alternatives = (payload?.alternatives || []).filter((alternative) => alternative.candidates?.length);
            if (!alternatives.length) {
                clearIncomingHandoffState();
                return null;
            }

            incomingHandoff = payload;
            applyLeadPlacementSuggestions(payload);
            activeHandoffAlternativeId = alternatives[0].id;
            handoffNoticeOpen = handoffRequested || workspaceRequested;
            incomingHandoffStatus = `${payload.region || '중점관리 대상지'} ${alternatives.length}개 대안 · ${alternatives.reduce((sum, alternative) => sum + alternative.candidates.length, 0)}개 후보가 전달되었습니다.`;
            const region = regions.find((row) => row.code === payload.regionCode);
            if (region) {
                selectedSido = region.sido;
                selectedRegionCode = region.code;
            }
            return payload;
        } catch (error) {
            console.error(error);
            incomingHandoffStatus = '전달 대안 패키지를 읽지 못했습니다.';
            return null;
        } finally {
            if (showEntryLoading) entryLoading = false;
            if (showWorkspaceLoading) workspaceLoading = false;
        }
    }

    async function focusIncomingCandidate(candidate) {
        const hydratedCandidate = await ensureIncomingCandidateGeometry(candidate);
        const center = hydratedCandidate?.geometry?.center || hydratedCandidate?.center;
        highlightIncomingCandidate(hydratedCandidate);
        const bounds = resolveCandidateBounds(hydratedCandidate);
        if (map && bounds?.isValid?.()) {
            map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 16, duration: 0.65 });
            return;
        }
        if (!map || !center) return;
        map.flyTo([center.lat, center.lng], 16, { duration: 0.65 });
    }

    function toggleHandoffNotice() {
        handoffNoticeOpen = !handoffNoticeOpen;
        if (handoffNoticeOpen) {
            hydrateActiveIncomingCandidateGeometries(true);
            restoreProjectFeatureLayers();
        } else {
            clearIncomingCandidateLayers();
        }
    }

    function selectIncomingAlternative(id) {
        activeHandoffAlternativeId = id;
        hydrateActiveIncomingCandidateGeometries(true);
    }

    function incomingCandidateKey(candidate) {
        return String(candidate?.id || `${candidate?.alternativeId || activeHandoffAlternativeId || 'alternative'}-${candidate?.rank || candidate?.name || 'candidate'}`);
    }

    function normalizePnuValues(value) {
        if (Array.isArray(value)) return value.flatMap(normalizePnuValues);
        if (typeof value === 'string') return value.split(/[,\s]+/);
        if (value === undefined || value === null) return [];
        return [value];
    }

    function incomingCandidatePnuList(candidate) {
        const rawList = candidate?.attributes?.pnuList?.length ? candidate.attributes.pnuList : candidate?.pnuList;
        return normalizePnuValues(rawList)
            .map((value) => String(value || '').trim())
            .filter(Boolean);
    }

    function hydrateIncomingCandidate(candidate) {
        if (!candidate) return candidate;
        const features = candidateGeometryCache[incomingCandidateKey(candidate)];
        if (!features?.length) return candidate;
        const bounds = featureBounds(features);
        const center = featureCollectionCenter(features);
        return {
            ...candidate,
            features,
            geometry: {
                ...(candidate.geometry || {}),
                features,
                bounds: bounds || candidate.geometry?.bounds || candidate.bounds || null,
                center: center || candidate.geometry?.center || candidate.center || null
            }
        };
    }

    async function ensureIncomingCandidateGeometry(candidate) {
        if (!candidate) return candidate;
        const hydratedCandidate = hydrateIncomingCandidate(candidate);
        if (candidateFeatureCollection(hydratedCandidate)) return hydratedCandidate;
        const key = incomingCandidateKey(candidate);
        if (!incomingCandidatePnuList(candidate).length) return hydratedCandidate;
        const features = await fetchIncomingCandidateFeaturesByPnu(candidate);
        if (!features.length) return hydratedCandidate;
        candidateGeometryCache = {
            ...candidateGeometryCache,
            [key]: features
        };
        return hydrateIncomingCandidate(candidate);
    }

    async function hydrateActiveIncomingCandidateGeometries(fit = false) {
        if (!activeIncomingAlternative?.candidates?.length) {
            clearIncomingCandidateLayers();
            return;
        }

        const candidates = activeIncomingAlternative.candidates;
        const missingCandidates = candidates.filter((candidate) => {
            const hydratedCandidate = hydrateIncomingCandidate(candidate);
            if (candidateFeatureCollection(hydratedCandidate)) return false;
            return incomingCandidatePnuList(candidate).length > 0;
        });

        if (!missingCandidates.length) {
            candidateGeometryStatus = '';
            renderIncomingCandidateLayers(fit);
            return;
        }

        const requestKey = `${incomingHandoff?.packageId || incomingHandoff?.leadReviewedAt || 'handoff'}:${activeIncomingAlternative.id}`;
        candidateGeometryRequestKey = requestKey;
        candidateGeometryStatus = `PNU ${missingCandidates.length}개 후보 필지 geometry 복원 중`;
        renderIncomingCandidateLayers(fit);

        const entries = [];
        for (const candidate of missingCandidates) {
            const features = await fetchIncomingCandidateFeaturesByPnu(candidate);
            if (features.length) entries.push([incomingCandidateKey(candidate), features]);
        }

        if (candidateGeometryRequestKey !== requestKey) return;

        if (entries.length) {
            const nextCache = { ...candidateGeometryCache };
            entries.forEach(([key, features]) => {
                nextCache[key] = features;
            });
            candidateGeometryCache = nextCache;
        }
        candidateGeometryStatus = entries.length
            ? `${entries.length}개 후보 필지 geometry 복원 완료`
            : 'PNU 기반 필지 geometry를 가져오지 못했습니다. 후보 위치 범위로 표시합니다.';
        renderIncomingCandidateLayers(fit);
    }

    async function fetchIncomingCandidateFeaturesByPnu(candidate) {
        const featuresByPnu = new Map();
        const pnuList = incomingCandidatePnuList(candidate);
        const chunkSize = 12;

        async function fetchOne(pnu) {
            try {
                const url = createVWorldDataUrl(VWORLD_DATASETS.cadastral, {
                    attrFilter: `pnu:=:${pnu}`,
                    size: 10,
                    page: 1
                });
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) return;
                const payload = await response.json();
                extractVWorldFeatures(payload).forEach((feature) => {
                    const key = String(feature.properties?.pnu ?? feature.properties?.PNU ?? pnu);
                    featuresByPnu.set(key, feature);
                });
            } catch {
                // Best-effort hydration. Bounds remain available as a fallback.
            }
        }

        for (let index = 0; index < pnuList.length; index += chunkSize) {
            await Promise.all(pnuList.slice(index, index + chunkSize).map(fetchOne));
        }

        return Array.from(featuresByPnu.values());
    }

    function extractVWorldFeatures(payload) {
        return payload?.response?.result?.featureCollection?.features
            || payload?.response?.result?.features
            || payload?.features
            || [];
    }

    function featureBounds(features) {
        const points = features.flatMap((feature) => collectLonLatPoints(feature.geometry?.coordinates));
        if (!points.length) return null;
        const lngs = points.map((point) => point[0]);
        const lats = points.map((point) => point[1]);
        return {
            south: Math.min(...lats),
            west: Math.min(...lngs),
            north: Math.max(...lats),
            east: Math.max(...lngs)
        };
    }

    function featureCollectionCenter(features) {
        const bounds = featureBounds(features);
        if (!bounds) return null;
        return {
            lat: (bounds.south + bounds.north) / 2,
            lng: (bounds.west + bounds.east) / 2
        };
    }

    function collectLonLatPoints(value) {
        if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
            return [[Number(value[0]), Number(value[1])]];
        }
        if (!Array.isArray(value)) return [];
        return value.flatMap((item) => collectLonLatPoints(item));
    }

    function candidateBoundsObject(candidate) {
        return candidate?.geometry?.bounds || candidate?.bounds || candidate?.attributes?.bounds;
    }

    function resolveCandidateBounds(candidate) {
        if (!L) return null;
        const bounds = candidateBoundsObject(candidate);
        if (bounds) {
            const south = Number(bounds.south);
            const west = Number(bounds.west);
            const north = Number(bounds.north);
            const east = Number(bounds.east);
            if ([south, west, north, east].every(Number.isFinite)) {
                return L.latLngBounds([[south, west], [north, east]]);
            }
        }
        const center = candidate?.geometry?.center || candidate?.center;
        if (!center) return null;
        const lat = Number(center.lat);
        const lng = Number(center.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return L.latLngBounds([[lat - 0.001, lng - 0.001], [lat + 0.001, lng + 0.001]]);
    }

    function candidateFeatureCollection(candidate) {
        const features = candidate?.geometry?.features || candidate?.features || [];
        return features.length ? { type: 'FeatureCollection', features } : null;
    }

    function candidatePopup(candidate) {
        const risk = Number(candidate.scores?.risk ?? candidate.risk);
        const parcelCount = candidate.attributes?.parcelCount ?? candidate.parcelCount;
        const hotspotCount = candidate.attributes?.hotspotCount ?? candidate.hotspotCount;
        return `
            <strong>${candidate.name || '중점관리 후보지'}</strong><br>
            Risk ${Number.isFinite(risk) ? risk.toFixed(2) : '-'} · ${formatCount(parcelCount)}필지 · hotspot ${formatCount(hotspotCount)}셀
        `;
    }

    function candidateStyle(index, selected = false) {
        return {
            color: selected ? '#dc2626' : '#f97316',
            weight: selected ? 5 : 3,
            opacity: 1,
            fillColor: selected ? '#ef4444' : '#fb923c',
            fillOpacity: selected ? 0.28 : 0.22,
            dashArray: selected ? null : '6 4'
        };
    }

    function addCandidateLayer(candidate, index, targetLayer, selected = false) {
        if (!L || !targetLayer) return null;
        const featureCollection = candidateFeatureCollection(candidate);
        const pane = selected ? 'handoffCandidateHighlight' : 'handoffCandidate';
        let layer = null;
        if (featureCollection) {
            layer = L.geoJSON(featureCollection, {
                pane,
                style: () => candidateStyle(index, selected)
            }).addTo(targetLayer);
        } else {
            const bounds = resolveCandidateBounds(candidate);
            if (!bounds?.isValid?.()) return null;
            layer = L.rectangle(bounds, { ...candidateStyle(index, selected), pane }).addTo(targetLayer);
        }
        layer.bindPopup(candidatePopup(candidate));
        const center = candidate?.geometry?.center || candidate?.center || layer.getBounds?.()?.getCenter?.();
        if (center) {
            L.marker([center.lat, center.lng], {
                pane,
                interactive: false,
                icon: L.divIcon({
                    className: 'handoff-candidate-rank',
                    html: String(candidate.rank || index + 1).padStart(2, '0'),
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                })
            }).addTo(targetLayer);
        }
        return layer;
    }

    function clearIncomingCandidateLayers() {
        handoffCandidateLayers?.clearLayers();
        handoffCandidateHighlightLayer?.clearLayers();
    }

    function renderIncomingCandidateLayers(fit = false) {
        if (!map || !L || !handoffCandidateLayers) return;
        clearIncomingCandidateLayers();
        if (!handoffNoticeOpen || !activeIncomingAlternative?.candidates?.length) return;
        const boundsList = [];
        activeIncomingAlternative.candidates.forEach((candidate, index) => {
            const hydratedCandidate = hydrateIncomingCandidate(candidate);
            const layer = addCandidateLayer(hydratedCandidate, index, handoffCandidateLayers);
            const bounds = layer?.getBounds?.() || resolveCandidateBounds(hydratedCandidate);
            if (bounds?.isValid?.()) boundsList.push(bounds);
        });
        if (fit && boundsList.length) {
            const merged = boundsList.slice(1).reduce((result, bounds) => result.extend(bounds), boundsList[0]);
            map.flyToBounds(merged, { padding: [55, 55], maxZoom: 13, duration: 0.65 });
        }
    }

    function highlightIncomingCandidate(candidate) {
        if (!map || !L || !handoffCandidateHighlightLayer || !candidate) return;
        handoffCandidateHighlightLayer.clearLayers();
        addCandidateLayer(candidate, 0, handoffCandidateHighlightLayer, true);
    }

    function reviewIncomingCandidate(alternative, candidate) {
        departmentSelection = {
            alternativeId: alternative.id,
            alternativeName: alternative.name,
            candidateName: candidate.name,
            risk: candidate.scores?.risk ?? candidate.risk,
            parcelCount: candidate.attributes?.parcelCount ?? candidate.parcelCount,
            hotspotCount: candidate.attributes?.hotspotCount ?? candidate.hotspotCount,
            leadReviewState: candidate.leadReviewState,
            decidedAt: new Date().toISOString()
        };
        focusIncomingCandidate(candidate);
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
        return adminRegionZoom(region);
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
        const matches = getBoundaryFeaturesForRegionCode(region.code);
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
                pane: 'projectPlacementMarker',
                zIndexOffset: 3000,
                icon: L.divIcon({
                    className: 'tree-marker',
                    html: '<span class="tree-canopy"></span><span class="tree-trunk"></span>',
                    iconSize: [28, 34],
                    iconAnchor: [14, 32]
                })
            }).addTo(projectLayers);
        }
        return L.circleMarker(latlng, { pane: 'projectPlacementMarker', radius: 7, color: '#fff', weight: 2, fillColor: project.color, fillOpacity: 1 }).addTo(projectLayers);
    }

    function addPointFeature(project, latlng, source = {}) {
        const layer = createPointLayer(project, latlng);
        if (source.label || source.address) layer.bindPopup([source.label, source.address].filter(Boolean).join('<br>'));
        addFeature(project, { coordinates: [[latlng.lat, latlng.lng]], measure: 1, layer, source });
    }

    function normalizePlacementPoint(point) {
        if (Array.isArray(point) && point.length >= 2) {
            const lat = Number(point[0]);
            const lng = Number(point[1]);
            return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        }
        const lat = Number(point?.lat);
        const lng = Number(point?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }

    function createRestoredFeatureLayer(project, points) {
        if (!L || !projectLayers || !points.length) return null;
        if (project.geometryType === 'point') return createPointLayer(project, points[0]);
        if (points.length < 2) return createPointLayer(project, points[0]);
        if (project.geometryType === 'line') return L.polyline(points, { pane: 'projectPlacement', color: project.color, weight: 5 }).addTo(projectLayers);
        if (project.geometryType === 'polygon' && points.length >= 3) {
            return L.polygon(points, { pane: 'projectPlacement', color: project.color, fillOpacity: .25 }).addTo(projectLayers);
        }
        return null;
    }

    function restoreProjectFeatureLayers() {
        if (!projectLayers) return;
        projects.forEach((project) => {
            (project.features || []).forEach((feature) => {
                if (feature.layer) return;
                const points = (feature.coordinates || []).map(normalizePlacementPoint).filter(Boolean);
                feature.layer = createRestoredFeatureLayer(project, points);
            });
        });
        projectLayers?.bringToFront?.();
        projects = [...projects];
    }

    function upsertLeadProject(plan, placement) {
        const geometry = GEOMETRIES.find((item) => item.id === (plan?.geometryType || placement?.geometryType)) || GEOMETRIES[0];
        const id = plan?.id || placement?.projectId || `lead-project-${Date.now()}`;
        const existing = projects.find((project) => project.id === id);
        if (existing) return existing;
        const effectSpec = DEFAULT_EFFECT_SPECS[plan?.item || placement?.item] || {};
        const project = {
            ...effectSpec,
            id,
            title: plan?.title || placement?.projectTitle || '주관부서 제안 사업',
            part: plan?.part || '건강(폭염)',
            item: plan?.item || placement?.item || '사업 배치 제안',
            geometryType: geometry.id,
            goal: Number(plan?.goal || 0),
            unit: geometry.unit,
            features: [],
            quantity: 0,
            appliedQuantity: 0,
            color: geometry.id === 'point' ? '#0f9f6e' : geometry.id === 'line' ? '#2563eb' : '#e87922',
            source: 'lead-department-handoff'
        };
        projects = [...projects, project];
        if (!activeProjectId) activeProjectId = id;
        return project;
    }

    function applyLeadPlacementSuggestions(payload) {
        const placements = Array.isArray(payload?.adaptationPlacements) ? payload.adaptationPlacements : [];
        const projectPlans = new Map((payload?.adaptationProjects || []).map((project) => [project.id, project]));
        projectPlans.forEach((plan) => upsertLeadProject(plan, null));
        if (!placements.length) {
            projects = [...projects];
            return;
        }
        placements.forEach((placement) => {
            const project = upsertLeadProject(projectPlans.get(placement.projectId), placement);
            if ((project.features || []).some((feature) => feature.source?.leadPlacementId === placement.id)) return;
            const points = (placement.points || []).map(normalizePlacementPoint).filter(Boolean);
            if (!points.length) return;
            const feature = {
                coordinates: points.map((point) => [point.lat, point.lng]),
                measure: project.geometryType === 'point' || points.length < 2 ? 1 : Number(placement.measure || 0),
                layer: createRestoredFeatureLayer(project, points),
                source: {
                    leadPlacementId: placement.id,
                    projectTitle: placement.projectTitle || project.title
                }
            };
            project.features.push(feature);
            updateQuantity(project);
        });
        restoreProjectFeatureLayers();
        projects = [...projects];
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
            placementEditMode = true;
            await addUploadedPointRows(project);
            showDesigner = false;
        } finally {
            isCompletingDesign = false;
        }
    }

    function selectProject(id, edit = true) {
        activeProjectId = id;
        placementEditMode = edit;
        drawingVertices = [];
        drawingLayer?.remove();
        drawingLayer = null;
    }

    function stopPlacementEdit() {
        placementEditMode = false;
        clearDrawingDraft();
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
            placementEditMode = false;
            effectResult = null;
            effectStatus = '적응 사업을 디자인하고 지도에 배치한 뒤 효과를 계산하세요.';
        }
    }

    function toggleCadastral() {
        if (!map || !cadastralLayer) return;
        cadastralVisible = !cadastralVisible;
        if (cadastralVisible) {
            cadastralLayer.addTo(map);
        } else {
            cadastralLayer.remove();
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
        feature.layer?.bringToFront?.();
        projectLayers?.bringToFront?.();
        updateQuantity(project);
        projects = [...projects];
    }

    function onMapClick(event) {
        const project = activeProject;
        if (!placementEditMode) return;
        if (!project) return;
        if (project.geometryType === 'point') {
            addPointFeature(project, event.latlng);
            return;
        }
        drawingVertices = [...drawingVertices, event.latlng];
        drawingLayer?.remove();
        drawingLayer = project.geometryType === 'line'
            ? L.polyline(drawingVertices, { pane: 'projectPlacement', color: project.color, weight: 5 }).addTo(map)
            : L.polygon(drawingVertices, { pane: 'projectPlacement', color: project.color, fillOpacity: .25 }).addTo(map);
    }

    function finishGeometry() {
        const project = activeProject;
        if (!placementEditMode) return;
        if (!project || project.geometryType === 'point' || drawingVertices.length < (project.geometryType === 'line' ? 2 : 3)) return;
        const vertices = [...drawingVertices];
        const layer = project.geometryType === 'line'
            ? L.polyline(vertices, { pane: 'projectPlacement', color: project.color, weight: 5 }).addTo(projectLayers)
            : L.polygon(vertices, { pane: 'projectPlacement', color: project.color, fillOpacity: .25 }).addTo(projectLayers);
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

    function serializableProjects() {
        return projects.map((project) => ({
            ...project,
            features: (project.features || []).map((feature) => ({
                coordinates: feature.coordinates,
                measure: feature.measure,
                source: feature.source || null
            }))
        }));
    }

    async function sendReviewResponseToLead() {
        if (!incomingHandoff) {
            reviewResponseStatus = '회신할 주관부서 요청이 없습니다.';
            return;
        }
        const payload = {
            schemaVersion: 'responsible-to-lead-review/v1',
            packageId: `responsible-review-${selectedRegionCode}-${Date.now()}`,
            source: 'responsible-department-tool',
            target: 'lead-department-tool',
            regionCode: incomingHandoff.regionCode || selectedRegionCode,
            region: incomingHandoff.region || selectedRegion?.name,
            originalPackageId: incomingHandoff.packageId,
            reviewedAt: new Date().toISOString(),
            departmentSelection,
            alternatives: incomingHandoff.alternatives || [],
            leadAdaptationProjects: incomingHandoff.adaptationProjects || [],
            leadAdaptationPlacements: incomingHandoff.adaptationPlacements || [],
            responsibleProjects: serializableProjects(),
            effectStatus
        };
        try {
            const supabaseOk = await savePlatformHandoff('responsible_to_lead', payload, 'completed');
            const response = await fetch(RESPONSIBLE_REVIEW_INBOX_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            reviewResponseStatus = (supabaseOk || response.ok)
                ? '사업소관부서 수정·검토 결과를 주관부서 인박스로 회신했습니다.'
                : '주관부서 인박스 회신에 실패했습니다. 5176 프록시 상태를 확인하세요.';
        } catch {
            reviewResponseStatus = '주관부서 인박스 회신에 실패했습니다. 5176 프록시 상태를 확인하세요.';
        }
    }

    async function initializeMap() {
        if (mapReady || map) return;
        await tick();
        if (!mapElement) return;
        const leaflet = await import('leaflet');
        L = leaflet.default || leaflet;
        map = L.map(mapElement, { minZoom: 7, maxZoom: 19 }).setView([37.581956547, 127.05484785], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
        if (hasVWorldApiKey()) {
            L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sidoBoundary))
                .addTo(map);
            L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sigunguBoundary))
                .addTo(map);
            cadastralLayer = L.tileLayer.wms(
                VWORLD_WMS_URL,
                createVWorldWmsOptions(VWORLD_WMS_LAYERS.cadastral, { opacity: 0.55 })
            );
        }
        map.createPane('selectedBoundary');
        map.getPane('selectedBoundary').style.zIndex = 450;
        map.createPane('handoffCandidate');
        map.getPane('handoffCandidate').style.zIndex = 430;
        map.createPane('handoffCandidateHighlight');
        map.getPane('handoffCandidateHighlight').style.zIndex = 470;
        map.createPane('projectPlacement');
        map.getPane('projectPlacement').style.zIndex = 760;
        map.createPane('projectPlacementMarker');
        map.getPane('projectPlacementMarker').style.zIndex = 940;
        selectedBoundaryLayer = L.geoJSON(null, {
            pane: 'selectedBoundary',
            interactive: false,
            style: { color: '#2563eb', weight: 4, opacity: 1, fillColor: '#60a5fa', fillOpacity: 0.18 }
        }).addTo(map);
        handoffCandidateLayers = L.layerGroup().addTo(map);
        handoffCandidateHighlightLayer = L.layerGroup().addTo(map);
        projectLayers = L.layerGroup().addTo(map);
        renderIncomingCandidateLayers();
        restoreProjectFeatureLayers();
        map.on('click', onMapClick);
        map.on('dblclick', finishGeometry);
        locateRegion();
        mapReady = true;
    }

    async function enterWorkspace() {
        workspaceView = true;
        const payload = await loadResponsibleHandoff({ force: true, showLoading: false });
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('regionCode', selectedRegionCode);
        nextUrl.searchParams.set('view', 'workspace');
        if (payload || incomingHandoff) {
            nextUrl.searchParams.set('handoff', 'lead-department');
        } else {
            nextUrl.searchParams.delete('handoff');
        }
        window.history.pushState({}, '', nextUrl.toString());
        await tick();
        initializeMap();
    }

    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        const requestedRegionCode = params.get('regionCode');
        if (requestedRegionCode) {
            const region = regions.find((row) => row.code === requestedRegionCode);
            if (region) {
                selectedSido = region.sido;
                selectedRegionCode = region.code;
            }
        }
        const shouldOpenHandoff = params.get('view') === 'workspace' || params.get('handoff') === 'lead-department';
        workspaceView = shouldOpenHandoff;
        if (shouldOpenHandoff) {
            workspaceLoading = true;
            setTimeout(async () => {
                if (!workspaceLoading) return;
                workspaceLoading = false;
                if (workspaceView && !mapReady) {
                    await tick();
                    initializeMap();
                }
            }, 2500);
        }
        (async () => {
            await loadResponsibleHandoff({ force: shouldOpenHandoff, showLoading: !shouldOpenHandoff });
            if (shouldOpenHandoff && incomingHandoff) {
                handoffNoticeOpen = true;
            }
            workspaceLoading = false;
            if (workspaceView) {
                await tick();
                initializeMap();
            }
        })();
        return () => map?.remove();
    });
</script>

{#if !workspaceView}
    <main class="responsible-entry">
        {#if entryLoading}
            <div class="entry-loading-backdrop" aria-live="polite">
                <section class="entry-loading-card">
                    <span>Loading</span>
                    <h2>사업소관부서 지원도구를 준비 중입니다</h2>
                    <p>선택 지역과 주관부서 전달 요청을 확인한 뒤 작업 화면을 엽니다.</p>
                </section>
            </div>
        {/if}
        <header class="entry-header">
            <a class="entry-back" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
            <div>
                <strong>사업소관부서 지원도구</strong>
                <span>지역을 먼저 선택한 뒤 실행 업무로 들어갑니다.</span>
            </div>
        </header>
        <section class="entry-grid">
            <article class="entry-card">
                <p class="entry-eyebrow">REGION SELECT</p>
                <h1>실행 지역 선택</h1>
                <p>사업소관부서가 검토할 지역을 선택합니다. 기본 지역은 경기도 수원시입니다.</p>
                <label>시도<select value={selectedSido} onchange={changeSido} disabled={entryLoading}>{#each sidos as sido}<option>{sido}</option>{/each}</select></label>
                <label>시군구<select value={selectedRegionCode} onchange={changeRegion} disabled={entryLoading}>{#each availableRegions as region}<option value={region.code}>{region.name.replace(`${region.sido} `, '')}</option>{/each}</select></label>
                <div class="entry-region">
                    <span>선택 지역</span>
                    <strong>{selectedRegion?.name}</strong>
                    <small>행정코드 {selectedRegionCode}</small>
                </div>
                <button type="button" class="entry-primary" onclick={enterWorkspace} disabled={entryLoading}>
                    {entryLoading ? '요청 확인 중...' : '사업소관부서 도구 입장'}
                </button>
            </article>
            <article class:hasRequest={incomingCandidateCount || incomingPlacementCount} class="entry-card request-card">
                <p class="entry-eyebrow">LEAD DEPARTMENT REQUEST</p>
                <h2>중점관리구역 및 사업배치 권장사항</h2>
                <p>주관부서 적응대책 지원도구에서 전달한 대안, 후보지, 권장 사업 배치 묶음을 검토합니다.</p>
                <div class="entry-counts">
                    <div><span>대안</span><strong>{incomingAlternatives.length}</strong></div>
                    <div><span>후보지</span><strong>{incomingCandidateCount}</strong></div>
                    <div><span>사업 배치</span><strong>{incomingPlacementCount}</strong></div>
                </div>
                {#if entryLoading}
                    <div class="entry-empty">선택 지역의 전달 요청을 확인하는 중입니다.</div>
                {:else if incomingHandoff}
                    <div class="entry-package">
                        <span>전달 패키지</span>
                        <strong>중점관리구역 및 사업배치 권장사항</strong>
                        <small>{incomingHandoff.projectName || '중점관리구역 후보 검토'} · {incomingHandoff.hazardLabel || '재해'} · {incomingHandoff.region || selectedRegion?.name}</small>
                    </div>
                {:else}
                    <div class="entry-empty">현재 선택 지역에 주관부서에서 전달한 대안이 없습니다.</div>
                {/if}
            </article>
        </section>
    </main>
{:else}
{#if workspaceLoading}
    <div class="entry-loading-backdrop" aria-live="polite">
        <section class="entry-loading-card">
            <span>Loading</span>
            <h2>요청 데이터를 불러오는 중입니다</h2>
            <p>중점관리구역 대안과 사업배치 정보를 작업 화면에 연결하고 있습니다.</p>
        </section>
    </div>
{/if}
<div class="tool-shell">
    <aside class="sidebar">
        <h1>사업소관부서 지원도구</h1>
        <a class="portal-back-link" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
        <section class="selected-region-summary">
            <span>선택 지역</span>
            <strong>{selectedRegion?.name}</strong>
            <small>행정코드 {selectedRegionCode}</small>
        </section>
        <section class="notice-section">
            <div class="notice-head">
                <h2>알림</h2>
                <span>{incomingHandoff ? '1건' : '0건'}</span>
            </div>
            {#if incomingHandoff}
                <button
                    type="button"
                    class="notice-card"
                    class:active={handoffNoticeOpen}
                    onclick={toggleHandoffNotice}
                >
                    <span class="notice-icon">!</span>
                    <span class="notice-body">
                        <strong>중점관리구역 및 사업배치 권장사항</strong>
                        <small>{incomingAlternatives.length}개 대안 · {incomingCandidateCount}개 후보지 · {incomingPlacementCount}개 사업배치</small>
                    </span>
                    <span class="notice-action">{handoffNoticeOpen ? '접기' : '열기'}</span>
                </button>
                {#if handoffNoticeOpen}
                    <section class="handoff-section inline-handoff-section">
                        <h2>중점관리구역 및 사업배치 권장사항</h2>
                        <p>{incomingHandoffStatus}</p>
                        <div class="handoff-counts">
                            <span>대안 <b>{incomingAlternatives.length}</b></span>
                            <span>후보지 <b>{incomingCandidateCount}</b></span>
                            <span>사업배치 <b>{incomingPlacementCount}</b></span>
                        </div>
                        <div class="handoff-alternative-tabs" aria-label="전달 대안">
                            {#each incomingAlternatives as alternative}
                                <button
                                    type="button"
                                    class:active={activeIncomingAlternative?.id === alternative.id}
                                    onclick={() => selectIncomingAlternative(alternative.id)}
                                >
                                    <strong>{alternative.name}</strong>
                                    <span>{alternative.candidates.length}개 후보</span>
                                </button>
                            {/each}
                        </div>
                        {#if activeIncomingAlternative}
                            <div class="handoff-alternative-summary">
                                <strong>{activeIncomingAlternative.name}</strong>
                                <span>{activeIncomingAlternative.description}</span>
                            </div>
                            <div class="handoff-candidate-list">
                                {#each activeIncomingAlternative.candidates as candidate}
                                    <article class:reviewed={departmentSelection?.alternativeId === activeIncomingAlternative.id && departmentSelection?.candidateName === candidate.name}>
                                        <button type="button" onclick={() => focusIncomingCandidate(candidate)}>
                                            <strong>{candidate.name}</strong>
                                            <span>Risk {Number(candidate.scores?.risk ?? candidate.risk).toFixed(2)} · {formatCount(candidate.attributes?.parcelCount ?? candidate.parcelCount)}필지 · hotspot {formatCount(candidate.attributes?.hotspotCount ?? candidate.hotspotCount)}셀</span>
                                        </button>
                                        <button type="button" class="review-button" onclick={() => reviewIncomingCandidate(activeIncomingAlternative, candidate)}>
                                            검토대상 지정
                                        </button>
                                    </article>
                                {/each}
                            </div>
                        {/if}
                        {#if departmentSelection}
                            <div class="department-selection">
                                <b>사업소관부서 검토대상</b>
                                <span>{departmentSelection.alternativeName} · {departmentSelection.candidateName} · Risk {Number(departmentSelection.risk).toFixed(2)}</span>
                            </div>
                        {/if}
                    </section>
                {/if}
            {:else}
                <p class="notice-empty">현재 선택 지역에 주관부서 요청이 없습니다.</p>
            {/if}
        </section>
        {#if false && incomingHandoff && handoffNoticeOpen}
            <section class="handoff-section">
                <h2>중점관리구역 및 사업배치 권장사항</h2>
                <p>{incomingHandoffStatus}</p>
                <div class="handoff-counts">
                    <span>대안 <b>{incomingAlternatives.length}</b></span>
                    <span>후보지 <b>{incomingCandidateCount}</b></span>
                    <span>사업배치 <b>{incomingPlacementCount}</b></span>
                </div>
                <div class="handoff-alternative-tabs" aria-label="전달 대안">
                    {#each incomingAlternatives as alternative}
                        <button
                            type="button"
                            class:active={activeIncomingAlternative?.id === alternative.id}
                            onclick={() => selectIncomingAlternative(alternative.id)}
                        >
                            <strong>{alternative.name}</strong>
                            <span>{alternative.candidates.length}개 후보</span>
                        </button>
                    {/each}
                </div>
                {#if activeIncomingAlternative}
                    <div class="handoff-alternative-summary">
                        <strong>{activeIncomingAlternative.name}</strong>
                        <span>{activeIncomingAlternative.description}</span>
                    </div>
                    <div class="handoff-candidate-list">
                        {#each activeIncomingAlternative.candidates as candidate}
                            <article class:reviewed={departmentSelection?.alternativeId === activeIncomingAlternative.id && departmentSelection?.candidateName === candidate.name}>
                                <button type="button" onclick={() => focusIncomingCandidate(candidate)}>
                                    <strong>{candidate.name}</strong>
                                    <span>Risk {Number(candidate.scores?.risk ?? candidate.risk).toFixed(2)} · {formatCount(candidate.attributes?.parcelCount ?? candidate.parcelCount)}필지 · hotspot {formatCount(candidate.attributes?.hotspotCount ?? candidate.hotspotCount)}셀</span>
                                </button>
                                <button type="button" class="review-button" onclick={() => reviewIncomingCandidate(activeIncomingAlternative, candidate)}>
                                    검토대상 지정
                                </button>
                            </article>
                        {/each}
                    </div>
                {/if}
                {#if departmentSelection}
                    <div class="department-selection">
                        <b>사업소관부서 검토대상</b>
                        <span>{departmentSelection.alternativeName} · {departmentSelection.candidateName} · Risk {Number(departmentSelection.risk).toFixed(2)}</span>
                    </div>
                {/if}
            </section>
        {/if}
        <section class="design-section">
            <div class="section-head"><h2>사업 배치 권장사항 검토·수정</h2><button onclick={openDesigner}>+ 사업 배치 추가</button></div>
            {#if incomingPlacementCount}
                <p class="received-placement-note">주관부서가 제안한 {incomingProjectCount}개 사업, {incomingPlacementCount}개 배치가 지도와 목록에 불러와졌습니다. 기본은 열람 모드이며, 사업을 누르면 배치 수정 모드로 전환됩니다.</p>
            {/if}
            {#if projects.length}
                <div class="project-list">
                    {#each projects as project}
                        <button class:active={activeProjectId === project.id && placementEditMode} onclick={() => selectProject(project.id, true)}>
                            <span class="project-index">{projects.indexOf(project) + 1}</span>
                            <span class="project-summary">
                                <strong>{#if project.item === '가로수'}<i class="tree-list-icon" aria-hidden="true"></i>{/if}{project.title}</strong><span>{project.part} · {project.item} · {GEOMETRIES.find((item) => item.id === project.geometryType)?.label}</span>
                                <small>{project.quantity.toFixed(project.geometryType === 'point' ? 0 : 1)} / {project.goal} {project.unit} · {activeProjectId === project.id && placementEditMode ? '수정 중' : '열람'}</small>
                            </span>
                        </button>
                    {/each}
                </div>
            {:else}<p class="empty">아직 디자인된 사업이 없습니다.</p>{/if}
            {#if placementEditMode && activeProject && activeProject.geometryType !== 'point'}
                <button class="finish" onclick={finishGeometry}>현재 {activeProject.geometryType === 'line' ? '선' : '면'} 완성</button>
            {/if}
            {#if placementEditMode}
                <button class="browse" onclick={stopPlacementEdit}>열람 모드로 돌아가기</button>
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
        <div class="map-guide">{placementEditMode && activeProject ? `${activeProject.title}: 지도에서 ${GEOMETRIES.find((item) => item.id === activeProject.geometryType)?.label} 데이터를 생성하세요.` : '중점관리 후보지와 주관부서 권장 배치를 먼저 검토하세요.'}</div>
        {#if incomingHandoff && activeIncomingAlternative}
            <div class="candidate-map-panel">
                <div class="candidate-map-head">
                    <strong>중점관리 후보지</strong>
                    <span>{activeIncomingAlternative.candidates.length}개</span>
                </div>
                {#if candidateGeometryStatus}
                    <p class="candidate-map-status">{candidateGeometryStatus}</p>
                {/if}
                <div class="candidate-map-list">
                    {#each activeIncomingAlternative.candidates as candidate}
                        <button
                            type="button"
                            class:active={departmentSelection?.alternativeId === activeIncomingAlternative.id && departmentSelection?.candidateName === candidate.name}
                            onclick={() => focusIncomingCandidate(candidate)}
                        >
                            <b>{String(candidate.rank || activeIncomingAlternative.candidates.indexOf(candidate) + 1).padStart(2, '0')}</b>
                            <span>
                                <strong>{candidate.name}</strong>
                                <small>Risk {Number(candidate.scores?.risk ?? candidate.risk).toFixed(2)} · {formatCount(candidate.attributes?.parcelCount ?? candidate.parcelCount)}필지</small>
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
        {#if placementEditMode && activeProject}
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
        <section class="return-review">
            <h3>주관부서 검토 회신</h3>
            <p>{reviewResponseStatus}</p>
            <button type="button" onclick={sendReviewResponseToLead} disabled={!incomingHandoff}>
                주관부서로 수정 검토 요청 보내기
            </button>
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
{/if}

<style>
    .responsible-entry{min-height:100vh;background:#10233f;color:#0f172a;font-family:Pretendard,Arial,sans-serif}.entry-loading-backdrop{position:fixed;z-index:5000;inset:0;display:grid;place-items:center;background:#10233fcc;backdrop-filter:blur(8px)}.entry-loading-card{width:min(380px,calc(100vw - 32px));border:1px solid #ffffff2e;border-radius:22px;background:#fff;padding:26px;text-align:center;box-shadow:0 28px 70px #02061766}.entry-loading-card span{display:block;color:#0f766e;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.entry-loading-card h2{margin:9px 0 0;color:#0f172a;font-size:22px;line-height:1.2}.entry-loading-card p{margin:12px 0 0;color:#475569;font-size:13px;line-height:1.7}.entry-header{display:flex;align-items:center;gap:14px;min-height:56px;padding:0 20px;background:#233447;color:#fff;box-shadow:0 12px 32px #02061733}.entry-header strong{display:block;font-size:15px}.entry-header span{display:block;margin-top:3px;color:#cbd5e1;font-size:12px}.entry-back{display:inline-flex;align-items:center;border:1px solid #ffffff29;border-radius:999px;background:#ffffff14;color:#f8fafc;padding:8px 13px;font-size:12px;font-weight:900;text-decoration:none}.entry-grid{display:grid;grid-template-columns:420px minmax(0,1fr);gap:20px;max-width:1100px;margin:0 auto;padding:32px 24px}.entry-card{border:1px solid #dbe7ee;border-radius:18px;background:#fff;padding:22px;box-shadow:0 20px 48px #0206172e}.entry-card h1,.entry-card h2{margin:8px 0 10px;color:#0f172a;font-size:26px;line-height:1.18}.entry-card h2{font-size:24px}.entry-card p{margin:0 0 18px;color:#475569;font-size:14px;line-height:1.7}.entry-eyebrow{margin:0!important;color:#0f766e!important;font-size:12px!important;font-weight:900!important;letter-spacing:0!important}.entry-card label{display:grid;gap:6px;margin-top:12px;color:#475569;font-size:12px;font-weight:900}.entry-card select{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#10233f;padding:10px 12px;font-size:14px;font-weight:800}.entry-card select:disabled,.entry-primary:disabled{opacity:.58;cursor:wait}.entry-region,.entry-package,.entry-empty{display:grid;gap:5px;margin-top:16px;border-radius:14px;background:#f8fafc;padding:15px}.entry-region span,.entry-package span{color:#64748b;font-size:12px;font-weight:900}.entry-region strong,.entry-package strong{color:#0f172a;font-size:18px}.entry-region small,.entry-package small{color:#64748b;font-size:12px;font-weight:800}.entry-primary{width:100%;margin-top:18px;border:0;border-radius:10px;background:#10233f;color:#fff;padding:13px 16px;font-size:14px;font-weight:900;cursor:pointer}.request-card{background:#ffffff}.request-card.hasRequest{border-color:#fed7aa;background:#fff7ed}.request-card .entry-eyebrow{color:#c2410c!important}.entry-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.entry-counts div{display:grid;gap:6px;border-radius:14px;background:#f8fafc;padding:16px}.request-card.hasRequest .entry-counts div{background:#fff}.entry-counts span{color:#64748b;font-size:12px;font-weight:900}.entry-counts strong{color:#0f172a;font-size:32px;line-height:1}.entry-empty{color:#64748b;font-size:14px;font-weight:800;line-height:1.6}.entry-package{background:#fff}
    @media(max-width:900px){.entry-grid{grid-template-columns:1fr}.entry-header{align-items:flex-start;flex-direction:column;padding:12px 16px}}
    :global(body){margin:0}.tool-shell{display:grid;grid-template-columns:280px minmax(400px,1fr) 340px;gap:8px;height:100vh;padding:8px;background:linear-gradient(135deg,#073b52 0%,#064a55 48%,#0f766e 100%);color:#10233f;font-family:Pretendard,Arial,sans-serif;box-sizing:border-box}.sidebar,.dashboard{overflow:auto;border:1px solid #dbe7ee;border-radius:14px;background:#fff;padding:14px;box-shadow:0 18px 40px #0f172a21}.sidebar h1{font-size:18px;margin:0 0 12px}.sidebar section{padding:12px 0;border-top:1px solid #e2e8f0}.sidebar h2,.dashboard h2{font-size:15px;margin:0 0 9px}label{display:grid;gap:4px;margin:7px 0;font-size:12px;font-weight:700}input,select{padding:7px;border:1px solid #cbd5e1;border-radius:5px;background:white;color:#10233f}.selected-region-summary{display:grid;gap:3px;margin:0 0 10px;padding:10px 12px!important;border:1px solid #cbd5e1!important;border-radius:12px;background:#f8fafc!important}.selected-region-summary span{color:#64748b;font-size:11px;font-weight:900}.selected-region-summary strong{color:#0f172a!important;font-size:15px}.selected-region-summary small{color:#64748b;font-size:11px;font-weight:800}.region-selector{position:sticky;z-index:700;top:-12px;margin:0 -4px 10px;padding:14px 12px!important;border:2px solid #0f9f6e!important;border-radius:12px;background:#ecfdf5;box-shadow:0 3px 10px #10233f1f}.region-selector h2{color:#0f766e}.region-selector select{width:100%;border-color:#99f6e4;font-weight:700;cursor:pointer}.region-selector select:hover,.region-selector select:focus{border-color:#0f766e;outline:2px solid #ccfbf1}.region-selector p{margin:9px 0 0;padding:7px;border-radius:5px;background:#fff;font-size:11px;color:#475569}.section-head{display:grid;gap:7px}.section-head button,.apply,.finish,.browse{padding:9px;border:0;border-radius:8px;background:#0f9f6e;color:white;font-weight:700}.project-list{display:grid;gap:6px;margin:9px 0}.project-list button{display:grid;grid-template-columns:24px 1fr;align-items:start;gap:8px;text-align:left;padding:9px;border:1px solid #dbe4ee;border-radius:9px;background:#fff}.project-list button.active{border-color:#0f9f6e;background:#ecfdf5}.project-index{display:grid!important;place-items:center;width:22px;height:22px;border-radius:999px;background:#dff8ef!important;color:#047857!important;font-size:11px!important;font-weight:900}.project-summary{display:grid;gap:3px}.project-list span,.project-list small,.empty{font-size:11px;color:#64748b}.finish{width:100%;background:#2563eb;margin-bottom:6px}.browse{width:100%;margin-bottom:6px;background:#e0f2fe!important;color:#075985!important}.apply{width:100%;background:#10233f}.apply:disabled{opacity:.4}.conditions{margin-top:auto}.conditions dl{display:grid;gap:5px;margin:0;font-size:11px}.conditions dl div{display:flex;justify-content:space-between;gap:8px}.conditions dd{margin:0;text-align:right;font-weight:700}.map-wrap{position:relative;min-width:0}.map{height:100%;border-radius:14px}.map-guide{position:absolute;z-index:600;top:10px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:20px;background:#fff;box-shadow:0 2px 12px #0003;font-size:12px;font-weight:700}.candidate-map-panel{position:absolute;z-index:640;top:58px;left:12px;display:grid;gap:8px;width:min(300px,calc(100% - 24px));max-height:calc(100% - 128px);padding:12px;border:1px solid #fed7aa;border-radius:14px;background:#fffffff0;box-shadow:0 12px 30px #0f172a2e;backdrop-filter:blur(10px)}.candidate-map-head{display:flex;align-items:center;justify-content:space-between}.candidate-map-head strong{color:#7c2d12;font-size:13px}.candidate-map-head span{border-radius:999px;background:#ffedd5;color:#9a3412;padding:3px 8px;font-size:10px;font-weight:900}.candidate-map-list{display:grid;gap:5px;overflow:auto}.candidate-map-list button{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;gap:7px;border:1px solid #fed7aa;border-radius:9px;background:#fff7ed;padding:7px;text-align:left}.candidate-map-list button.active{border-color:#dc2626;background:#fee2e2}.candidate-map-list b{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#f97316;color:#fff;font-size:10px}.candidate-map-list span{display:grid;gap:2px;min-width:0}.candidate-map-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7c2d12;font-size:11px}.candidate-map-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#92400e;font-size:10px;font-weight:800}.map-edit-panel{position:absolute;z-index:650;left:50%;bottom:18px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 36px);padding:10px 12px;border:1px solid #ffffff99;border-radius:14px;background:#ffffffe6;box-shadow:0 12px 30px #0f172a33;backdrop-filter:blur(10px)}.map-edit-panel div{display:grid;min-width:170px;margin-right:4px}.map-edit-panel b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:12px}.map-edit-panel span{color:#475569;font-size:11px}.map-edit-panel button{padding:8px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#10233f;font-size:11px;font-weight:800;white-space:nowrap}.map-edit-panel .danger{border-color:#fecaca;background:#fff1f2;color:#be123c}.dashboard h3{margin:0;padding:8px;border-radius:8px;background:#10233f;color:#fff;font-size:14px}.dashboard section{margin-bottom:10px;border:1px solid #dbe4ee;border-radius:10px;padding:6px}.dashboard p,.placeholder{font-size:11px;color:#64748b;padding:8px}.dashboard h4{font-size:12px;margin:7px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:5px}.metrics div{display:grid;gap:3px;padding:8px;border-radius:6px;background:#fff7ed;font-size:11px}.implementation article{display:grid;gap:5px;padding:9px;border-bottom:1px solid #e2e8f0;font-size:12px}.implementation article span{color:#64748b;font-size:11px}progress{width:100%}.modal-backdrop{position:fixed;z-index:2000;inset:0;display:grid;place-items:center;background:#0f172a99}.modal{width:min(520px,calc(100vw - 32px));max-height:90vh;overflow:auto;padding:22px;border-radius:12px;background:#fff;box-shadow:0 20px 70px #0005}.modal h2{margin-top:0}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.modal-actions button{padding:9px 16px;border:0;border-radius:6px}.modal-actions button:last-child{background:#0f9f6e;color:#fff;font-weight:700}@media(max-width:1000px){.tool-shell{grid-template-columns:240px 1fr}.dashboard{display:none}}
    .sidebar,.dashboard{color:#0f172a;opacity:1}.sidebar h1,.sidebar h2,.dashboard h2,.sidebar label,.dashboard strong{opacity:1;color:#0f172a}.sidebar section,.dashboard section{background:#fff}.sidebar p,.empty,.project-list span,.project-list small,.implementation article span{color:#334155;opacity:1}.dashboard{background:#f8fafc}.dashboard h2{font-size:17px;font-weight:800}.dashboard h3{background:#10233f;color:#fff!important;font-weight:800}.dashboard section{padding:8px;border-color:#cbd5e1;box-shadow:0 1px 3px #0f172a12}.dashboard p,.dashboard .placeholder{margin:8px 0;padding:10px;border:1px solid #dbe4ee;border-radius:6px;background:#fff;color:#1e293b;font-size:12px;font-weight:600;line-height:1.5;opacity:1}.dashboard h4{color:#0f172a;font-weight:800}.metrics span{color:#334155;font-weight:700}.apply:disabled{opacity:1;background:#94a3b8;color:#fff}.modal-backdrop{background:#0f172a26}
    .point-upload{display:grid;gap:7px;margin:10px 0;padding:12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff}.point-upload legend{padding:0 5px;color:#0f4c9a;font-size:12px;font-weight:800}.point-upload p{margin:0;color:#334155;font-size:11px;line-height:1.5}.point-upload input[type=file]{padding:8px;background:#fff}.inline-check{display:flex;align-items:center;gap:6px;margin:2px 0;color:#334155;font-size:11px;font-weight:700}.inline-check input{width:auto}.upload-status{padding:8px!important;border-radius:6px;background:#fff!important;color:#0f766e!important;font-weight:700}.modal-actions button:disabled{background:#94a3b8!important;color:#fff;cursor:wait}
    .portal-back-link{display:flex;align-items:center;justify-content:center;margin:-4px 0 12px;padding:9px 10px;border:1px solid #bae6fd;border-radius:999px;background:#f0fdfa;color:#03695f;font-size:12px;font-weight:900;text-decoration:none}.portal-back-link:hover{background:#ccfbf1}
    .notice-section{display:grid;gap:8px;margin:0 0 10px;padding:12px!important;border:1px solid #dbe4ee!important;border-radius:12px;background:#fff!important}.notice-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.notice-head h2{margin:0!important;color:#0f172a!important}.notice-head span{border-radius:999px;background:#f1f5f9;padding:3px 8px;color:#475569;font-size:10px;font-weight:900}.notice-card{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;border:1px solid #fed7aa;border-radius:10px;background:#fff7ed;padding:9px;text-align:left;color:#7c2d12;cursor:pointer}.notice-card.active{border-color:#ea580c;background:#ffedd5}.notice-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#f97316;color:#fff;font-weight:900}.notice-body{display:grid;gap:2px;min-width:0}.notice-body strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7c2d12!important;font-size:12px}.notice-body small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#92400e;font-size:10px;font-weight:800}.notice-action{border-radius:999px;background:#fff;padding:4px 8px;color:#c2410c;font-size:10px;font-weight:900}.notice-empty{margin:0!important;border-radius:8px;background:#f8fafc;padding:9px!important;color:#64748b!important;font-size:11px!important;font-weight:800!important;line-height:1.45!important}.handoff-section{display:grid;gap:8px;margin:0 0 10px;padding:12px!important;border:2px solid #fed7aa!important;border-radius:12px;background:#fff7ed!important}.handoff-section h2{color:#9a3412!important}.handoff-section p{margin:0;color:#7c2d12!important;font-size:11px;font-weight:800;line-height:1.45}.handoff-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.handoff-counts span{display:grid;gap:2px;border-radius:8px;background:#fff;padding:7px;color:#92400e;font-size:9px;font-weight:900;text-align:center}.handoff-counts b{color:#7c2d12;font-size:16px;line-height:1}.received-placement-note{margin:8px 0!important;border:1px solid #bfdbfe!important;border-radius:8px!important;background:#eff6ff!important;color:#1e3a8a!important;font-size:11px!important;font-weight:800!important;line-height:1.45!important}.handoff-alternative-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.handoff-alternative-tabs button{display:grid;gap:2px;min-width:0;border:1px solid #fed7aa;border-radius:8px;background:#fff;padding:7px;color:#7c2d12;text-align:center}.handoff-alternative-tabs button.active{border-color:#ea580c;background:#ffedd5}.handoff-alternative-tabs strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7c2d12!important;font-size:10px}.handoff-alternative-tabs span{font-size:9px;color:#92400e!important;font-weight:800}.handoff-alternative-summary{display:grid;gap:3px;padding:8px;border-radius:8px;background:#fff;color:#7c2d12}.handoff-alternative-summary strong{font-size:12px;color:#7c2d12!important}.handoff-alternative-summary span{font-size:10px;color:#92400e!important;font-weight:700;line-height:1.35}.handoff-candidate-list{display:grid;gap:6px}.handoff-candidate-list article{display:grid;grid-template-columns:1fr auto;border:1px solid #fed7aa;border-radius:8px;background:#fff;overflow:hidden}.handoff-candidate-list article.reviewed{border-color:#0f766e;background:#ecfdf5}.handoff-candidate-list article>button:first-child{display:grid;gap:3px;width:100%;border:0;background:transparent;text-align:left;padding:8px;color:#10233f}.handoff-candidate-list article>button:first-child:hover{background:#fffbeb}.handoff-candidate-list strong{font-size:11px;color:#7c2d12!important}.handoff-candidate-list span{font-size:10px;color:#92400e!important;font-weight:700}.review-button{border:0;border-left:1px solid #fed7aa;background:#f97316;color:#fff;font-size:9px;font-weight:900;padding:0 8px;white-space:nowrap}.department-selection{display:grid;gap:3px;padding:8px;border-radius:8px;background:#0f766e;color:#fff}.department-selection b,.department-selection span{color:#fff!important}.department-selection b{font-size:11px}.department-selection span{font-size:10px;font-weight:800}
    .default-spec{display:grid;gap:4px;margin-top:8px;padding:9px;border-radius:6px;background:#ecfdf5;color:#166534;font-size:11px}.default-spec strong{color:#166534!important}.tree-list-icon{display:inline-block;width:12px;height:12px;margin-right:6px;border-radius:50%;background:#16a34a;box-shadow:inset 0 0 0 2px #bbf7d0;vertical-align:-1px}:global(.handoff-candidate-rank){display:grid;place-items:center;border:2px solid #fff;border-radius:999px;background:#f97316;color:#fff;box-shadow:0 2px 8px #0f172a66;font-size:10px;font-weight:900}:global(.tree-marker){position:relative;background:transparent;border:0}:global(.tree-canopy){position:absolute;top:0;left:3px;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:#16a34a;box-shadow:0 1px 5px #0005}:global(.tree-canopy::after){content:'';position:absolute;top:4px;left:5px;width:8px;height:8px;border-radius:50%;background:#4ade80}:global(.tree-trunk){position:absolute;top:20px;left:12px;width:5px;height:12px;border-radius:0 0 2px 2px;background:#854d0e;box-shadow:0 1px 3px #0004}
    .map-edit-panel{transform:translateX(-50%)}
    .candidate-map-status{margin:0!important;border:1px solid #fed7aa!important;border-radius:8px!important;background:#fff7ed!important;color:#9a3412!important;padding:7px!important;font-size:10px!important;font-weight:900!important;line-height:1.4!important}
    .return-review button{width:100%;border:0;border-radius:8px;background:#0f766e;color:#fff;padding:10px 12px;font-size:12px;font-weight:900}.return-review button:disabled{background:#94a3b8;cursor:not-allowed}.return-review p{margin:8px 0!important}
</style>
