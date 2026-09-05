<script>
    import { onDestroy, onMount } from 'svelte';
    import html2canvas from 'html2canvas-pro';
    import {
        getBoundaryFeaturesForRegionCode,
        getRegionByCode,
        getRegionCenter,
        regionZoom
    } from '$lib/data/administrativeRegions.js';
    import {
        enrichPracticeDistricts,
        PRACTICE_DISTRICT_COLOR,
        PRACTICE_DISTRICT_FILL_COLOR
    } from '$lib/data/practiceDistricts.js';
    import {
        createVWorldWmsOptions,
        hasVWorldApiKey,
        VWORLD_WMS_LAYERS,
        VWORLD_WMS_URL
    } from '../../../../shared/map/vworld.js';

    const BASE_TILE_STYLES = {
        default: {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        },
        grayscale: {
            url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        }
    };

    let {
        regionCode = '41110',
        regionName = '경기도 수원시',
        hazard = 'heatwave',
        height = '320px',
        showCadastral = true,
        showSidoBoundary = false,
        showSigunguBoundary = false,
        analysisIndicators = [],
        riskGrid = null,
        activeGridLayer = 'Risk',
        onGridLayerChange = () => {},
        onParcelCandidatesChange = () => {},
        onParcelCandidateFocus = () => {},
        onParcelDerivationComplete = () => {},
        parcelCandidates = [],
        candidateContextKey = '',
        mapResetKey = 0,
        showAnalysisLegend = false,
        focusedCandidate = null,
        adaptationSites = [],
        forceSelectedBoundary = false,
        locked = false
    } = $props();

    const analysisGroups = ['기후위험', '노출', '민감도', '적응역량'];
    const analysisGroupEnglish = {
        '기후위험': 'Hazard',
        '노출': 'Exposure',
        '민감도': 'Sensitivity',
        '적응역량': 'Adaptive Capacity'
    };
    const gridLayers = ['H', 'E', 'V', 'Risk', 'Hotspot'];
    const dimensionTabColors = {
        H: 'var(--color-hazard)',
        E: 'var(--color-exposure)',
        V: 'var(--color-vulnerability)'
    };
    const gridLayerLabels = {
        Risk: '종합 Risk',
        H: '기후위험 H',
        E: '노출 E',
        V: '취약성 V',
        Hotspot: 'Hotspot'
    };

    let mapElement;
    let map;
    let mapLoading = $state(true);
    let baseLayer;
    let baseMapStyle = $state('default');
    let legendInfoOpen = $state(false);
    let locateButtonOffset = $state(72);
    let scaleBottomOffset = $state(28);
    let scaleControlEl;
    let selectedBoundaryLayer;
    let regionViewBounds;
    let sidoLayer;
    let sggLayer;
    let cadastralLayer;
    let analysisLayerGroup;
    let riskGridLayer;
    let parcelCandidateLayer;
    let adaptationSiteLayer;
    let visibleAnalysisLayerIds = $state([]);
    let riskGridVisible = $state(true);
    let selectedGridLayer = $state(activeGridLayer);
    let visibleLayerScopeKey = $state('');
    let selectedBoundaryVisible = $state(true);
    let sidoBoundaryVisible = $state(showSidoBoundary);
    let sigunguBoundaryVisible = $state(showSigunguBoundary);
    let cadastralVisible = $state(false);
    let parcelCandidateRunning = $state(false);
    let parcelCandidateStatus = $state('Risk 분석 후 실행');
    let parcelCandidateLegend = $state([]);
    let focusedParcelCandidateKey = $state('');
    let renderedParcelCandidateScope = $state('');
    let parcelCandidateRunId = 0;
    let parcelCandidateHydrationScope = '';
    let appliedMapResetKey;
    let exportBusy = $state(false);
    let exportStatus = $state('');
    let exportStatusTimer;

    const exportHazardLabels = {
        heatwave: '폭염',
        flood: '홍수',
        ecosystem: '생태계'
    };

    function safeFilenamePart(value, fallback = '지도') {
        const cleaned = String(value || '')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    }

    function exportDateStamp() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function mapExportFilename() {
        const hazardLabel = exportHazardLabels[hazard] || hazard;
        const layerLabel = gridLayerLabels[selectedGridLayer] || selectedGridLayer;
        return [
            safeFilenamePart(regionName, regionCode),
            safeFilenamePart(hazardLabel, '기후위험'),
            safeFilenamePart(layerLabel, '결과'),
            '결과지도',
            exportDateStamp()
        ].join('_') + '.png';
    }

    function setExportStatus(message, clearAfter = 0) {
        exportStatus = message;
        if (exportStatusTimer) window.clearTimeout(exportStatusTimer);
        if (clearAfter > 0) {
            exportStatusTimer = window.setTimeout(() => {
                exportStatus = '';
                exportStatusTimer = null;
            }, clearAfter);
        }
    }

    function waitForVisibleMapTiles(timeout = 7000) {
        const tiles = Array.from(mapElement?.querySelectorAll('.leaflet-tile') || [])
            .filter((tile) => tile instanceof HTMLImageElement && tile.offsetParent !== null);
        if (!tiles.length) return Promise.resolve();

        return Promise.all(tiles.map((tile) => {
            if (tile.complete && tile.naturalWidth > 0) return Promise.resolve();
            return new Promise((resolve) => {
                const finish = () => resolve();
                tile.addEventListener('load', finish, { once: true });
                tile.addEventListener('error', finish, { once: true });
                window.setTimeout(finish, timeout);
            });
        }));
    }

    async function flattenMapOverlaysForExport(captureElement) {
        const sourceCanvases = Array.from(mapElement?.querySelectorAll('.risk-grid-canvas') || []);
        const sourceVectors = Array.from(mapElement?.querySelectorAll('.leaflet-pane svg.leaflet-zoom-animated') || []);
        if (!sourceCanvases.length && !sourceVectors.length) return () => {};

        const rootRect = captureElement.getBoundingClientRect();
        const mapRect = mapElement.getBoundingClientRect();
        const rasterScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const composite = document.createElement('canvas');
        composite.width = Math.max(1, Math.round(mapRect.width * rasterScale));
        composite.height = Math.max(1, Math.round(mapRect.height * rasterScale));
        const context = composite.getContext('2d');
        context.scale(rasterScale, rasterScale);

        const sources = [...sourceCanvases, ...sourceVectors]
            .map((source, order) => {
                const rect = source.getBoundingClientRect();
                const pane = source.closest('.leaflet-pane');
                const zIndex = Number.parseInt(window.getComputedStyle(pane || source).zIndex, 10) || 420;
                return { source, rect, zIndex, order };
            })
            .filter(({ rect }) => rect.width > 0 && rect.height > 0)
            .sort((left, right) => left.zIndex - right.zIndex || left.order - right.order);

        const waitForImage = (image) => (
            typeof image.decode === 'function'
                ? image.decode().catch(() => {})
                : new Promise((resolve) => {
                    image.addEventListener('load', resolve, { once: true });
                    image.addEventListener('error', resolve, { once: true });
                })
        );

        for (const { source, rect } of sources) {
            const left = rect.left - mapRect.left;
            const top = rect.top - mapRect.top;
            if (source instanceof HTMLCanvasElement) {
                context.drawImage(source, left, top, rect.width, rect.height);
                continue;
            }
            if (!(source instanceof SVGElement)) continue;

            const vector = source.cloneNode(true);
            vector.classList.remove('leaflet-zoom-animated');
            vector.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            vector.setAttribute('width', String(rect.width));
            vector.setAttribute('height', String(rect.height));
            Object.assign(vector.style, {
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                margin: '0',
                transform: 'none',
                transformOrigin: '0 0',
                overflow: 'visible'
            });
            const image = new Image();
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(vector))}`;
            await waitForImage(image);
            context.drawImage(image, left, top, rect.width, rect.height);
        }

        const snapshot = document.createElement('img');
        snapshot.className = 'map-export-canvas-snapshot';
        snapshot.alt = '';
        snapshot.setAttribute('aria-hidden', 'true');
        snapshot.src = composite.toDataURL('image/png');
        Object.assign(snapshot.style, {
            position: 'absolute',
            left: `${mapRect.left - rootRect.left}px`,
            top: `${mapRect.top - rootRect.top}px`,
            width: `${mapRect.width}px`,
            height: `${mapRect.height}px`,
            zIndex: '620',
            maxWidth: 'none',
            pointerEvents: 'none',
            imageRendering: 'auto'
        });

        const previousVisibility = sources.map(({ source }) => [source, source.style.visibility]);
        previousVisibility.forEach(([source]) => { source.style.visibility = 'hidden'; });
        captureElement.appendChild(snapshot);
        await waitForImage(snapshot);

        return () => {
            previousVisibility.forEach(([source, visibility]) => { source.style.visibility = visibility; });
            snapshot.remove();
        };
    }

    function canvasToPngBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('PNG 파일을 만들 수 없습니다.'));
            }, 'image/png');
        });
    }

    async function writeMapImage(blob, filename) {
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'PNG 지도 이미지',
                        accept: { 'image/png': ['.png'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return 'selected-location';
            } catch (error) {
                if (error?.name === 'AbortError') return 'cancelled';
                console.warn('선택 위치 저장 실패, 기본 다운로드 방식으로 전환합니다.', error);
            }
        }

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return 'downloads';
    }

    async function exportMapImage() {
        if (exportBusy || mapLoading || !mapElement) return;
        exportBusy = true;
        setExportStatus('배경지도 준비 중...');

        try {
            map?.closePopup();
            map?.invalidateSize({ pan: false });
            await waitForVisibleMapTiles();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const captureElement = mapElement.closest('.region-map-wrap') || mapElement;
            setExportStatus('격자와 경계 위치 맞춤 중...');
            const restoreMapOverlays = await flattenMapOverlaysForExport(captureElement);
            let canvas;
            try {
                setExportStatus('고해상도 PNG 생성 중...');
                canvas = await html2canvas(captureElement, {
                    allowTaint: false,
                    useCORS: true,
                    imageTimeout: 12000,
                    logging: false,
                    backgroundColor: '#e8f3f5',
                    scale: Math.min(2.5, Math.max(2, window.devicePixelRatio || 1)),
                    ignoreElements: (element) =>
                        element.hasAttribute?.('data-map-export-ignore') ||
                        element.classList?.contains('leaflet-control-zoom')
                });
            } finally {
                restoreMapOverlays();
            }
            const blob = await canvasToPngBlob(canvas);
            const result = await writeMapImage(blob, mapExportFilename());

            if (result === 'cancelled') {
                setExportStatus('저장을 취소했습니다.', 3000);
            } else if (result === 'selected-location') {
                setExportStatus('선택한 위치에 PNG를 저장했습니다.', 5000);
            } else {
                setExportStatus('기본 다운로드 폴더에 PNG를 저장했습니다.', 5000);
            }
        } catch (error) {
            console.error('지도 PNG 저장 실패', error);
            setExportStatus(`이미지 저장 실패 · ${error?.message || '잠시 후 다시 시도해 주세요.'}`);
        } finally {
            exportBusy = false;
        }
    }

    onDestroy(() => {
        if (exportStatusTimer) window.clearTimeout(exportStatusTimer);
    });

    function groupsForGridLayer(layer) {
        if (layer === 'H') return ['기후위험'];
        if (layer === 'E') return ['노출'];
        if (layer === 'V') return ['민감도', '적응역량'];
        return [];
    }

    function enabledAnalysisIndicators() {
        const groups = groupsForGridLayer(selectedGridLayer);
        if (!groups.length) return [];
        return analysisIndicators.filter((item) => item.enabled && groups.includes(item.group));
    }

    function sameIdList(left, right) {
        return left.length === right.length && left.every((id, index) => id === right[index]);
    }

    function syncVisibleAnalysisLayers() {
        if (!showAnalysisLegend) {
            if (visibleAnalysisLayerIds.length) visibleAnalysisLayerIds = [];
            if (visibleLayerScopeKey) visibleLayerScopeKey = '';
            return;
        }

        const enabledIds = enabledAnalysisIndicators().map((item) => String(item.id));
        const scopeKey = `${selectedGridLayer}:${enabledIds.join(',')}`;
        if (visibleLayerScopeKey !== scopeKey) {
            visibleLayerScopeKey = scopeKey;
            visibleAnalysisLayerIds = enabledIds;
            return;
        }

        const nextVisibleIds = visibleAnalysisLayerIds.filter((id) => enabledIds.includes(id));

        if (!sameIdList(visibleAnalysisLayerIds, nextVisibleIds)) {
            visibleAnalysisLayerIds = nextVisibleIds;
        }
    }

    function toggleAnalysisLayer(id, visible) {
        let nextVisibleIds = [...visibleAnalysisLayerIds];
        const key = String(id);
        if (visible) {
            if (!nextVisibleIds.includes(key)) nextVisibleIds.push(key);
        } else {
            nextVisibleIds = nextVisibleIds.filter((visibleId) => visibleId !== key);
        }
        visibleAnalysisLayerIds = nextVisibleIds;
        renderAnalysisLayers();
        renderRiskGridLayer();
    }

    function escapeTooltipHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function createAnalysisLayer(L, item) {
        if (!item.geojson) return null;

        const color = item.color || '#64748b';
        const tooltip = `${item.group} · ${item.label}`;
        const hasPointFeatures = item.geojson?.features?.some((feature) => feature?.geometry?.type === 'Point');
        if (hasPointFeatures && map && !map.getPane('analysis-point-pane')) {
            const pane = map.createPane('analysis-point-pane');
            pane.style.zIndex = '640';
            pane.style.pointerEvents = 'auto';
        }

        return L.geoJSON(item.geojson, {
            interactive: true,
            style: {
                color,
                fillColor: color,
                fillOpacity: 0.24,
                opacity: 0.9,
                weight: 2
            },
            pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
                pane: 'analysis-point-pane',
                radius: 5,
                color: '#ffffff',
                fillColor: color,
                fillOpacity: 0.98,
                opacity: 1,
                weight: 1.5
            }),
            onEachFeature: (feature, layer) => {
                if (feature?.geometry?.type !== 'Point') {
                    layer.bindTooltip(tooltip);
                    return;
                }
                const properties = feature.properties || {};
                const name = escapeTooltipHtml(properties.name || item.label);
                const address = escapeTooltipHtml(properties.address || '');
                const capacity = Number(properties.capacity);
                const details = [
                    address,
                    Number.isFinite(capacity) ? `최대수용 ${capacity.toLocaleString()}명` : ''
                ].filter(Boolean);
                layer.bindTooltip(`<b>${name}</b>${details.length ? `<br>${details.join('<br>')}` : ''}`);
            }
        });
    }

    function renderAnalysisLayers() {
        if (!map || !window.L) return;
        const L = window.L;

        analysisLayerGroup?.remove();
        if (!showAnalysisLegend) {
            analysisLayerGroup = null;
            return;
        }

        const layers = enabledAnalysisIndicators()
            .filter((item) => visibleAnalysisLayerIds.includes(String(item.id)))
            .map((item) => createAnalysisLayer(L, item))
            .filter(Boolean);

        analysisLayerGroup = L.layerGroup(layers).addTo(map);
    }

    function optimizedAdaptationSites() {
        const requestedSites = Array.isArray(adaptationSites) ? adaptationSites : [];
        if (!requestedSites.length || !riskGrid?.values?.length || !riskGrid?.transform) return requestedSites;

        const columns = Number(riskGrid.columns);
        const rows = Number(riskGrid.rows);
        const originX = Number(riskGrid.transform.originX);
        const originY = Number(riskGrid.transform.originY);
        const cellWidth = Math.abs(Number(riskGrid.transform.pixelWidth) || 100);
        const cellHeight = Math.abs(Number(riskGrid.transform.pixelHeight) || 100);
        if (![columns, rows, originX, originY, cellWidth, cellHeight].every(Number.isFinite)) return requestedSites;

        const boundaryFeatures = getBoundaryFeaturesForRegionCode(regionCode);
        const rankedCells = riskGrid.values
            .map((rawValue, index) => ({ index, value: Number(rawValue), row: Math.floor(index / columns), column: index % columns }))
            .filter((cell) => Number.isFinite(cell.value))
            .sort((a, b) => b.value - a.value);
        const selectedCells = [];
        const minimumCellDistance = Math.max(1, Math.min(8, Math.floor(Math.sqrt(rankedCells.length / Math.max(1, requestedSites.length)) * 0.45)));

        for (const cell of rankedCells) {
            const x = originX + (cell.column * cellWidth) + (cellWidth / 2);
            const y = originY - (cell.row * cellHeight) - (cellHeight / 2);
            const [lat, lng] = epsg5179ToLatLng(x, y);
            if (boundaryFeatures.length && !pointInBoundary([lng, lat], boundaryFeatures)) continue;
            if (selectedCells.some((chosen) => Math.hypot(chosen.row - cell.row, chosen.column - cell.column) < minimumCellDistance)) continue;
            selectedCells.push({ ...cell, lat, lng });
            if (selectedCells.length >= requestedSites.length) break;
        }

        return requestedSites.map((site, index) => {
            const cell = selectedCells[index];
            return cell ? { ...site, lat: cell.lat, lng: cell.lng, riskValue: cell.value } : site;
        });
    }

    function renderAdaptationSiteLayer() {
        if (!map || !window.L) return;
        adaptationSiteLayer?.remove();
        adaptationSiteLayer = null;
        const sites = optimizedAdaptationSites();
        if (!sites.length) return;
        const markers = sites
            .filter((site) => Number.isFinite(Number(site.lat)) && Number.isFinite(Number(site.lng)))
            .map((site) => window.L.circleMarker([Number(site.lat), Number(site.lng)], {
                radius: 8,
                color: '#ffffff',
                weight: 2,
                fillColor: site.color || '#c85d3e',
                fillOpacity: 0.98
            }).bindTooltip(`<b>${site.projectName || '적응사업'}</b><br>${site.location || '자동 배치 후보'}<br>배정 ${Number(site.quantity || 0).toLocaleString()}${site.unit || ''}${Number.isFinite(site.riskValue) ? `<br>선택지표 위험도 ${site.riskValue.toFixed(2)}` : ''}`));
        adaptationSiteLayer = window.L.layerGroup(markers).addTo(map);
    }

    function meridionalArc(lat, a, e2) {
        const e4 = e2 * e2;
        const e6 = e4 * e2;
        return a * (
            (1 - (e2 / 4) - ((3 * e4) / 64) - ((5 * e6) / 256)) * lat -
            (((3 * e2) / 8) + ((3 * e4) / 32) + ((45 * e6) / 1024)) * Math.sin(2 * lat) +
            (((15 * e4) / 256) + ((45 * e6) / 1024)) * Math.sin(4 * lat) -
            ((35 * e6) / 3072) * Math.sin(6 * lat)
        );
    }

    function epsg5179ToLatLng(x, y) {
        const a = 6378137;
        const f = 1 / 298.257222101;
        const e2 = (2 * f) - (f * f);
        const ep2 = e2 / (1 - e2);
        const k0 = 0.9996;
        const lat0 = 38 * Math.PI / 180;
        const lon0 = 127.5 * Math.PI / 180;
        const x0 = 1000000;
        const y0 = 2000000;
        const m0 = meridionalArc(lat0, a, e2);
        const m = m0 + ((y - y0) / k0);
        const mu = m / (a * (1 - (e2 / 4) - ((3 * e2 * e2) / 64) - ((5 * e2 * e2 * e2) / 256)));
        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        const j1 = (3 * e1 / 2) - (27 * e1 ** 3 / 32);
        const j2 = (21 * e1 ** 2 / 16) - (55 * e1 ** 4 / 32);
        const j3 = 151 * e1 ** 3 / 96;
        const j4 = 1097 * e1 ** 4 / 512;
        const fp = mu + (j1 * Math.sin(2 * mu)) + (j2 * Math.sin(4 * mu)) + (j3 * Math.sin(6 * mu)) + (j4 * Math.sin(8 * mu));
        const sinfp = Math.sin(fp);
        const cosfp = Math.cos(fp);
        const tanfp = Math.tan(fp);
        const c1 = ep2 * cosfp ** 2;
        const t1 = tanfp ** 2;
        const n1 = a / Math.sqrt(1 - e2 * sinfp ** 2);
        const r1 = n1 * (1 - e2) / (1 - e2 * sinfp ** 2);
        const d = (x - x0) / (n1 * k0);
        const lat = fp - ((n1 * tanfp / r1) * (
            (d ** 2 / 2) -
            ((5 + (3 * t1) + (10 * c1) - (4 * c1 ** 2) - (9 * ep2)) * d ** 4 / 24) +
            ((61 + (90 * t1) + (298 * c1) + (45 * t1 ** 2) - (252 * ep2) - (3 * c1 ** 2)) * d ** 6 / 720)
        ));
        const lon = lon0 + (
            d -
            ((1 + (2 * t1) + c1) * d ** 3 / 6) +
            ((5 - (2 * c1) + (28 * t1) - (3 * c1 ** 2) + (8 * ep2) + (24 * t1 ** 2)) * d ** 5 / 120)
        ) / cosfp;

        return [lat * 180 / Math.PI, lon * 180 / Math.PI];
    }

    function pointInRing(point, ring) {
        const [lng, lat] = point;
        let inside = false;

        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            const intersects = ((yi > lat) !== (yj > lat)) &&
                (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
            if (intersects) inside = !inside;
        }

        return inside;
    }

    function pointInPolygon(point, polygon) {
        if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
        return !polygon.slice(1).some((hole) => pointInRing(point, hole));
    }

    function pointInFeature(point, feature) {
        const geometry = feature?.geometry;
        if (!geometry) return false;
        if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
        }
        return false;
    }

    function pointInBoundary(point, features) {
        if (!features?.length) return true;
        return features.some((feature) => pointInFeature(point, feature));
    }

    function forEachCoordinate(geometry, callback) {
        if (!geometry) return;
        const walk = (coordinates) => {
            if (!Array.isArray(coordinates)) return;
            if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
                callback(coordinates);
                return;
            }
            coordinates.forEach(walk);
        };
        walk(geometry.coordinates);
    }

    function featureBounds(feature) {
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        forEachCoordinate(feature?.geometry, ([lng, lat]) => {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
        });

        if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
        return { minLng, minLat, maxLng, maxLat };
    }

    function pointInBounds(point, bounds) {
        if (!bounds) return false;
        const [lng, lat] = point;
        return lng >= bounds.minLng && lng <= bounds.maxLng && lat >= bounds.minLat && lat <= bounds.maxLat;
    }

    function boundsIntersect(left, right) {
        if (!left || !right) return false;
        return !(
            left.maxLng < right.minLng ||
            left.minLng > right.maxLng ||
            left.maxLat < right.minLat ||
            left.minLat > right.maxLat
        );
    }

    function pointInHotspotCell(point, hotspot) {
        return pointInPolygon(point, [hotspot?.corners || []]);
    }

    function featureRings(feature) {
        const geometry = feature?.geometry;
        if (!geometry) return [];
        if (geometry.type === 'Polygon') return geometry.coordinates || [];
        if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flatMap((polygon) => polygon || []);
        return [];
    }

    function orientation(a, b, c) {
        const value = ((b[1] - a[1]) * (c[0] - b[0])) - ((b[0] - a[0]) * (c[1] - b[1]));
        if (Math.abs(value) < 1e-12) return 0;
        return value > 0 ? 1 : 2;
    }

    function onSegment(a, b, c) {
        return (
            b[0] <= Math.max(a[0], c[0]) + 1e-12 &&
            b[0] >= Math.min(a[0], c[0]) - 1e-12 &&
            b[1] <= Math.max(a[1], c[1]) + 1e-12 &&
            b[1] >= Math.min(a[1], c[1]) - 1e-12
        );
    }

    function segmentsIntersect(a, b, c, d) {
        const o1 = orientation(a, b, c);
        const o2 = orientation(a, b, d);
        const o3 = orientation(c, d, a);
        const o4 = orientation(c, d, b);

        if (o1 !== o2 && o3 !== o4) return true;
        if (o1 === 0 && onSegment(a, c, b)) return true;
        if (o2 === 0 && onSegment(a, d, b)) return true;
        if (o3 === 0 && onSegment(c, a, d)) return true;
        if (o4 === 0 && onSegment(c, b, d)) return true;
        return false;
    }

    function ringSegments(ring) {
        const points = (ring || []).filter((point) =>
            Array.isArray(point) &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1]))
        );
        if (points.length < 2) return [];

        return points.map((point, index) => [point, points[(index + 1) % points.length]]);
    }

    function featureIntersectsHotspotCell(feature, hotspot, bounds = featureBounds(feature)) {
        if (!boundsIntersect(bounds, hotspot?.bounds)) return false;
        if (pointInFeature(hotspot.point, feature)) return true;
        if ((hotspot.corners || []).some((corner) => pointInFeature(corner, feature))) return true;

        let vertexInsideHotspot = false;
        forEachCoordinate(feature?.geometry, (coordinate) => {
            if (!vertexInsideHotspot && pointInHotspotCell(coordinate, hotspot)) vertexInsideHotspot = true;
        });
        if (vertexInsideHotspot) return true;

        const hotspotSegments = ringSegments(hotspot.corners || []);
        if (!hotspotSegments.length) return false;

        return featureRings(feature).some((ring) =>
            ringSegments(ring).some(([start, end]) =>
                hotspotSegments.some(([hotspotStart, hotspotEnd]) =>
                    segmentsIntersect(start, end, hotspotStart, hotspotEnd)
                )
            )
        );
    }

    function hotspotSpatialKey(x, y) {
        return `${x}:${y}`;
    }

    function buildHotspotSpatialIndex(hotspots) {
        const tileSize = 0.002;
        const cells = new Map();

        hotspots.forEach((hotspot, index) => {
            const bounds = hotspot?.bounds;
            if (!bounds) return;
            const minX = Math.floor(bounds.minLng / tileSize);
            const maxX = Math.floor(bounds.maxLng / tileSize);
            const minY = Math.floor(bounds.minLat / tileSize);
            const maxY = Math.floor(bounds.maxLat / tileSize);

            for (let x = minX; x <= maxX; x += 1) {
                for (let y = minY; y <= maxY; y += 1) {
                    const key = hotspotSpatialKey(x, y);
                    const bucket = cells.get(key) || [];
                    bucket.push({ hotspot, index });
                    cells.set(key, bucket);
                }
            }
        });

        return { tileSize, cells };
    }

    function nearbyHotspotsForBounds(bounds, index) {
        if (!bounds || !index?.cells?.size) return [];
        const seen = new Set();
        const result = [];
        const pad = 0.0008;
        const minX = Math.floor((bounds.minLng - pad) / index.tileSize);
        const maxX = Math.floor((bounds.maxLng + pad) / index.tileSize);
        const minY = Math.floor((bounds.minLat - pad) / index.tileSize);
        const maxY = Math.floor((bounds.maxLat + pad) / index.tileSize);

        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                const bucket = index.cells.get(hotspotSpatialKey(x, y)) || [];
                bucket.forEach(({ hotspot, index: hotspotIndex }) => {
                    if (seen.has(hotspotIndex)) return;
                    seen.add(hotspotIndex);
                    result.push(hotspot);
                });
            }
        }

        return result;
    }

    function centroidForFeature(feature) {
        const points = [];
        forEachCoordinate(feature?.geometry, ([lng, lat]) => {
            if (Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
        });
        if (!points.length) return null;

        const sum = points.reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
        return [sum[0] / points.length, sum[1] / points.length];
    }

    function ringAreaSquareMeters(ring) {
        const points = (ring || []).filter((point) =>
            Array.isArray(point) &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1]))
        );
        if (points.length < 3) return 0;

        const baseLng = points[0][0];
        const baseLat = points[0][1];
        const metersPerDegreeLng = 111320 * Math.cos(baseLat * Math.PI / 180);
        const projected = points.map(([lng, lat]) => [
            (lng - baseLng) * metersPerDegreeLng,
            (lat - baseLat) * 110540
        ]);

        let area = 0;
        for (let index = 0; index < projected.length; index += 1) {
            const [x1, y1] = projected[index];
            const [x2, y2] = projected[(index + 1) % projected.length];
            area += (x1 * y2) - (x2 * y1);
        }
        return Math.abs(area) / 2;
    }

    function polygonAreaSquareMeters(polygon) {
        if (!polygon?.length) return 0;
        const [outer, ...holes] = polygon;
        return Math.max(0, ringAreaSquareMeters(outer) - holes.reduce((sum, ring) => sum + ringAreaSquareMeters(ring), 0));
    }

    function featureAreaSquareMeters(feature) {
        const geometry = feature?.geometry;
        if (!geometry) return 0;
        if (geometry.type === 'Polygon') return polygonAreaSquareMeters(geometry.coordinates);
        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaSquareMeters(polygon), 0);
        }
        return 0;
    }

    function formatAreaSquareMeters(value) {
        const area = Number(value);
        if (!Number.isFinite(area) || area <= 0) return '면적 산정 전';
        if (area >= 10000) return `${(area / 10000).toFixed(area >= 100000 ? 1 : 2)}ha`;
        return `${Math.round(area).toLocaleString()}㎡`;
    }

    function distanceMeters(left, right) {
        if (!left || !right) return Infinity;
        const lat = ((left[1] + right[1]) / 2) * Math.PI / 180;
        const metersPerDegreeLng = 111320 * Math.cos(lat);
        const dx = (left[0] - right[0]) * metersPerDegreeLng;
        const dy = (left[1] - right[1]) * 110540;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    function average(values) {
        const finiteValues = values.filter(Number.isFinite);
        if (!finiteValues.length) return null;
        return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
    }

    function createHotspotPoints(grid) {
        if (!grid?.values?.length || !Number.isFinite(grid.stats?.topThreshold)) return [];

        const columns = Number(grid.columns);
        const rows = Number(grid.rows);
        const originX = Number(grid.transform?.originX);
        const originY = Number(grid.transform?.originY);
        const cellWidth = Math.abs(Number(grid.transform?.pixelWidth) || 100);
        const cellHeight = Math.abs(Number(grid.transform?.pixelHeight) || 100);
        const threshold = Number(grid.stats.topThreshold);
        const boundaryFeatures = getBoundaryFeaturesForRegionCode(regionCode);
        if (![columns, rows, originX, originY, cellWidth, cellHeight, threshold].every(Number.isFinite)) return [];

        const points = [];
        const toLngLat = (x, y) => {
            const [lat, lng] = epsg5179ToLatLng(x, y);
            return [lng, lat];
        };

        const candidateIndices = Array.isArray(grid.validIndices) && grid.validIndices.length
            ? grid.validIndices
            : Array.from({ length: rows * columns }, (_, index) => index);

        for (const index of candidateIndices) {
            const row = Math.floor(index / columns);
            const column = index % columns;
            const risk = Number(grid.values[index]);
            if (!Number.isFinite(risk) || risk < threshold) continue;

            const leftX = originX + (column * cellWidth);
            const rightX = leftX + cellWidth;
            const topY = originY - (row * cellHeight);
            const bottomY = topY - cellHeight;
            const point = toLngLat(leftX + (cellWidth / 2), topY - (cellHeight / 2));
            if (!pointInBoundary(point, boundaryFeatures)) continue;

            const corners = [
                toLngLat(leftX, topY),
                toLngLat(rightX, topY),
                toLngLat(rightX, bottomY),
                toLngLat(leftX, bottomY)
            ];
            const lngs = corners.map((corner) => corner[0]);
            const lats = corners.map((corner) => corner[1]);

            points.push({
                index,
                row,
                column,
                point,
                corners,
                bounds: {
                    minLng: Math.min(...lngs),
                    minLat: Math.min(...lats),
                    maxLng: Math.max(...lngs),
                    maxLat: Math.max(...lats)
                },
                risk,
                h: Number(grid.hValues?.[index]),
                e: Number(grid.eValues?.[index]),
                v: Number(grid.vValues?.[index])
            });
        }

        return points.sort((left, right) => right.risk - left.risk);
    }

    function hotspotRequestBoxes(points) {
        // Keep each PostGIS query small so dense urban blocks can be paged and
        // rendered without sending one oversized GeoJSON response to the browser.
        const tileSize = 0.0024;
        const boxes = new Map();

        points.forEach((hotspot) => {
            const [lng, lat] = hotspot.point;
            const bounds = hotspot.bounds || { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
            const key = `${Math.floor(lng / tileSize)}:${Math.floor(lat / tileSize)}`;
            const existing = boxes.get(key) || {
                minLng: bounds.minLng,
                minLat: bounds.minLat,
                maxLng: bounds.maxLng,
                maxLat: bounds.maxLat,
                maxRisk: hotspot.risk,
                count: 0
            };

            existing.minLng = Math.min(existing.minLng, bounds.minLng);
            existing.minLat = Math.min(existing.minLat, bounds.minLat);
            existing.maxLng = Math.max(existing.maxLng, bounds.maxLng);
            existing.maxLat = Math.max(existing.maxLat, bounds.maxLat);
            existing.maxRisk = Math.max(existing.maxRisk, hotspot.risk);
            existing.count += 1;
            boxes.set(key, existing);
        });

        return [...boxes.values()]
            .sort((left, right) => (right.maxRisk - left.maxRisk) || (right.count - left.count))
            // Candidate districts are ranked from the highest-risk cells, so the
            // top 20 tiles preserve the decision focus without querying every
            // lower-ranked hotspot across a metropolitan-scale boundary.
            .slice(0, 20)
            .map((box) => ({
                minLng: box.minLng - 0.00035,
                minLat: box.minLat - 0.00035,
                maxLng: box.maxLng + 0.00035,
                maxLat: box.maxLat + 0.00035,
                count: box.count
            }));
    }

    function extractGeoJsonFeatures(payload) {
        return Array.isArray(payload?.features) ? payload.features : [];
    }

    function featureId(feature) {
        const properties = feature?.properties || {};
        return properties.pnu || properties.PNU || properties.gid || properties.GID || properties.id || JSON.stringify(featureBounds(feature));
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    function wait(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    function isTransientApiStatus(status) {
        return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
    }

    async function fetchJsonWithRetry(url, { timeoutMs = 12000, retries = 1 } = {}) {
        let lastError;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' }
                });
                const text = await response.text();

                if (!response.ok) {
                    const error = new Error(`PostGIS ${response.status}`);
                    error.status = response.status;
                    throw error;
                }

                try {
                    return JSON.parse(text);
                } catch {
                    throw new Error('PostGIS invalid-json');
                }
            } catch (error) {
                lastError = error?.name === 'AbortError' ? new Error('request-timeout') : error;
                const retryable = error?.name === 'AbortError' ||
                    error instanceof TypeError ||
                    isTransientApiStatus(error?.status);
                if (!retryable || attempt >= retries) throw lastError;
                await wait(450 * (attempt + 1));
            } finally {
                window.clearTimeout(timer);
            }
        }

        throw lastError || new Error('PostGIS request-failed');
    }

    async function fetchPostgisCadastralFeatures(
        boxes,
        { timeoutMs = 75000, concurrency = 6, onProgress = () => {} } = {}
    ) {
        const featuresById = new Map();
        const pageSize = 1000;
        const maxPagesPerBox = 5;
        const maxFeatures = 12000;
        const deadline = Date.now() + timeoutMs;
        const queue = [...boxes];
        const failures = [];
        let completed = 0;

        async function fetchBox(box) {
            if (Date.now() > deadline) throw new Error('request-timeout');
            const features = [];
            let truncated = false;

            for (let page = 0; page < maxPagesPerBox; page += 1) {
                if (Date.now() > deadline) throw new Error('request-timeout');
                try {
                    const url = new URL('/cadastre/bbox', window.location.origin);
                    url.searchParams.set('bbox', [box.minLng, box.minLat, box.maxLng, box.maxLat].join(','));
                    url.searchParams.set('limit', String(pageSize));
                    url.searchParams.set('offset', String(page * pageSize));
                    url.searchParams.set('simplifyMeters', '0.2');
                    const remainingTime = Math.max(3000, Math.min(12000, deadline - Date.now()));
                    const payload = await fetchJsonWithRetry(url, { timeoutMs: remainingTime });
                    const pageFeatures = extractGeoJsonFeatures(payload);
                    features.push(...pageFeatures);
                    const hasMore = Boolean(payload?.metadata?.hasMore) || pageFeatures.length >= pageSize;
                    if (!hasMore || Date.now() > deadline - 3000) {
                        truncated = hasMore;
                        break;
                    }
                    if (page === maxPagesPerBox - 1) truncated = true;
                } catch (error) {
                    if (page === 0 || !features.length) throw error;
                    return { features, truncated: true };
                }
            }

            return { features, truncated };
        }

        async function worker() {
            while (queue.length && featuresById.size < maxFeatures) {
                const box = queue.shift();
                try {
                    const result = await fetchBox(box);
                    const features = result.features;
                    features.forEach((feature) => {
                        const id = featureId(feature);
                        if (id) featuresById.set(id, feature);
                    });
                    if (result.truncated) failures.push(new Error('PostGIS response-truncated'));
                } catch (error) {
                    failures.push(error);
                } finally {
                    completed += 1;
                    onProgress({ completed, total: boxes.length, failed: failures.length, features: featuresById.size });
                    await yieldToBrowser();
                }
            }
        }

        await Promise.all(
            Array.from({ length: Math.min(concurrency, Math.max(1, boxes.length)) }, () => worker())
        );

        if (!featuresById.size && failures.length) {
            const timeoutFailure = failures.find((error) => error?.message === 'request-timeout');
            throw timeoutFailure || failures[0];
        }

        return {
            features: [...featuresById.values()],
            failureCount: failures.length,
            completedCount: completed,
            requestedCount: boxes.length
        };
    }

    function parcelLabel(feature) {
        const properties = feature?.properties || {};
        const legalDong = properties.legal_dong_name || properties.legalDongName || '';
        const lotNumber = properties.lot_number || properties.lotNumber || '';
        return properties.jibun || properties.JIBUN || properties.addr || properties.ADDR ||
            [legalDong, lotNumber].filter(Boolean).join(' ') || properties.pnu || properties.PNU || '필지';
    }

    function parcelScoreRecords(features, hotspots) {
        const topHotspots = hotspots.slice(0, 600);
        const hotspotIndex = buildHotspotSpatialIndex(topHotspots);

        return features.map((feature) => {
            const bounds = featureBounds(feature);
            const candidateHotspots = nearbyHotspotsForBounds(bounds, hotspotIndex);
            if (!candidateHotspots.length) return null;

            const matchedHotspots = candidateHotspots.filter((hotspot) =>
                featureIntersectsHotspotCell(feature, hotspot, bounds)
            );
            if (!matchedHotspots.length) return null;

            const riskValues = matchedHotspots.map((hotspot) => hotspot.risk);
            const hValues = matchedHotspots.map((hotspot) => hotspot.h);
            const eValues = matchedHotspots.map((hotspot) => hotspot.e);
            const vValues = matchedHotspots.map((hotspot) => hotspot.v);
            const centroid = centroidForFeature(feature);
            const riskMean = average(riskValues);
            const riskMax = riskValues.length ? Math.max(...riskValues) : null;
            if (!Number.isFinite(riskMean) || !centroid) return null;

            return {
                id: featureId(feature),
                feature,
                bounds,
                centroid,
                label: parcelLabel(feature),
                hotspotCount: matchedHotspots.length,
                areaSquareMeters: featureAreaSquareMeters(feature),
                riskMean,
                riskMax,
                hMean: average(hValues),
                eMean: average(eValues),
                vMean: average(vValues)
            };
        }).filter(Boolean);
    }

    function boundsForParcelRecords(records) {
        const bounds = records
            .map((record) => record.bounds)
            .filter((item) =>
                item &&
                [item.minLng, item.minLat, item.maxLng, item.maxLat].every(Number.isFinite)
            );
        if (!bounds.length) return null;

        return {
            south: Math.min(...bounds.map((item) => item.minLat)),
            west: Math.min(...bounds.map((item) => item.minLng)),
            north: Math.max(...bounds.map((item) => item.maxLat)),
            east: Math.max(...bounds.map((item) => item.maxLng))
        };
    }

    function clusterParcelRecords(records) {
        const sortedRecords = [...records]
            .sort((left, right) => right.riskMean - left.riskMean)
            .slice(0, 650);
        const visited = new Set();
        const clusters = [];
        const neighborDistance = 230;

        for (const record of sortedRecords) {
            if (visited.has(record.id)) continue;

            const queue = [record];
            const members = [];
            visited.add(record.id);

            while (queue.length) {
                const current = queue.shift();
                members.push(current);

                sortedRecords.forEach((candidate) => {
                    if (visited.has(candidate.id)) return;
                    if (distanceMeters(current.centroid, candidate.centroid) > neighborDistance) return;
                    visited.add(candidate.id);
                    queue.push(candidate);
                });
            }

            const riskMean = average(members.map((item) => item.riskMean));
            const riskMax = Math.max(...members.map((item) => item.riskMax).filter(Number.isFinite));
            const hotspotCount = members.reduce((sum, item) => sum + item.hotspotCount, 0);
            const totalAreaSqm = members.reduce((sum, item) => sum + (Number(item.areaSquareMeters) || 0), 0);
            const clusterScore = (riskMean * 0.62) + ((riskMax || riskMean) * 0.23) + (Math.min(1, hotspotCount / 30) * 0.15);
            const centers = members.map((item) => item.centroid).filter(Boolean);
            const center = centers.length
                ? {
                    lat: average(centers.map((item) => item[1])),
                    lng: average(centers.map((item) => item[0]))
                }
                : null;
            const bounds = boundsForParcelRecords(members);

            clusters.push({
                members,
                hotspotCount,
                totalAreaSqm,
                riskMean,
                riskMax,
                hMean: average(members.map((item) => item.hMean)),
                eMean: average(members.map((item) => item.eMean)),
                vMean: average(members.map((item) => item.vMean)),
                center,
                bounds,
                score: clusterScore
            });
        }

        return clusters
            .filter((cluster) => cluster.hotspotCount >= 2 || cluster.members.length >= 2)
            .sort((left, right) => right.score - left.score)
            .slice(0, 10)
            .map((cluster, index) => ({
                id: `parcel-candidate-${index + 1}`,
                name: `필지 후보 ${String(index + 1).padStart(2, '0')}`,
                area: `${cluster.members.length.toLocaleString()}필지 · hotspot ${cluster.hotspotCount.toLocaleString()}셀`,
                risk: Number(cluster.riskMean.toFixed(2)),
                h: Number((cluster.hMean || 0).toFixed(2)),
                e: Number((cluster.eMean || 0).toFixed(2)),
                v: Number((cluster.vMean || 0).toFixed(2)),
                rank: index + 1,
                reason: `연속지적도 필지 교차 · 최고 Risk ${Number.isFinite(cluster.riskMax) ? cluster.riskMax.toFixed(2) : '--'} · 대표 ${cluster.members[0]?.label || '필지'}`,
                basis: 'PostGIS cadastre.parcels_readable + 100m hotspot cell-parcel intersection',
                parcelCount: cluster.members.length,
                hotspotCount: cluster.hotspotCount,
                totalAreaSqm: Number(cluster.totalAreaSqm.toFixed(1)),
                totalAreaLabel: formatAreaSquareMeters(cluster.totalAreaSqm),
                pnuList: cluster.members.map((item) => item.id).filter(Boolean),
                center: cluster.center,
                bounds: cluster.bounds,
                features: cluster.members.map((item) => item.feature),
                score: Number(cluster.score.toFixed(4))
            }));
    }

    function renderParcelCandidateLayer(candidates) {
        if (!map || !window.L) return;
        candidates = enrichPracticeDistricts(candidates, hazard);
        parcelCandidateLayer?.remove();
        parcelCandidateLayer = null;
        const legendCandidates = candidates.filter(Boolean);
        const drawableCandidates = legendCandidates.filter((candidate) => (candidate.features || []).length);
        const nextCandidateLegend = legendCandidates.map((candidate) => ({
            id: candidate.id || candidate.name || `parcel-candidate-${candidate.rank}`,
            name: candidate.name,
            rank: candidate.rank,
            riskLabel: Number.isFinite(Number(candidate.risk)) ? Number(candidate.risk).toFixed(2) : '--',
            parcelLabel: Number(candidate.parcelCount || 0).toLocaleString(),
            hotspotLabel: Number(candidate.hotspotCount || 0).toLocaleString(),
            totalAreaLabel: candidate.totalAreaLabel || formatAreaSquareMeters(candidate.totalAreaSqm),
            bounds: candidate.bounds,
            center: candidate.center,
            features: candidate.features || [],
            pnuList: candidate.pnuList || [],
            practiceType: candidate.practiceType,
            practiceTypeLabel: candidate.practiceTypeLabel,
            practiceTypeColor: candidate.practiceTypeColor,
            classificationReason: candidate.classificationReason,
            isPriority: Number(candidate.rank) <= 3
        }));
        const features = drawableCandidates.flatMap((candidate) =>
            (candidate.features || []).map((feature) => ({
                ...feature,
                properties: {
                    ...(feature.properties || {}),
                    candidateId: candidate.id || candidate.name || `parcel-candidate-${candidate.rank}`,
                    candidateName: candidate.name,
                    candidateRisk: candidate.risk,
                    candidateRank: candidate.rank,
                    practiceType: candidate.practiceType,
                    practiceTypeLabel: candidate.practiceTypeLabel,
                    practiceTypeColor: candidate.practiceTypeColor,
                    practiceTypeFillColor: candidate.practiceTypeFillColor,
                    classificationReason: candidate.classificationReason
                }
            }))
        );
        parcelCandidateLegend = nextCandidateLegend;
        if (!features.length) return;

        parcelCandidateLayer = window.L.geoJSON(
            { type: 'FeatureCollection', features },
            {
                pane: 'parcelCandidatePane',
                style: (feature) => ({
                    color: parcelFeatureStyle(feature).color,
                    weight: parcelFeatureStyle(feature).weight,
                    fillColor: parcelFeatureStyle(feature).fillColor,
                    fillOpacity: parcelFeatureStyle(feature).fillOpacity
                }),
                onEachFeature: (feature, layer) => {
                    layer.bindTooltip(
                        `<strong>${feature.properties?.candidateName || '실천권역'}</strong><br>` +
                        `${feature.properties?.practiceTypeLabel || '유형 검토 중'} · Risk ${feature.properties?.candidateRisk || '--'}<br>` +
                        `<span>${feature.properties?.classificationReason || ''}</span>`,
                        { sticky: true }
                    );
                    layer.on('click', () => {
                        const key = feature.properties?.candidateId || feature.properties?.candidateName || '';
                        const candidate = legendCandidates.find((item) =>
                            parcelCandidateKey(item) === String(key) ||
                            Number(item.rank) === Number(feature.properties?.candidateRank) ||
                            item.name === feature.properties?.candidateName
                        );
                        focusParcelCandidate(candidate || {
                            id: feature.properties?.candidateId,
                            rank: feature.properties?.candidateRank,
                            name: feature.properties?.candidateName
                        }, true);
                    });
                }
            }
        ).addTo(map);
        parcelCandidateLayer.bringToFront?.();
    }

    function clearParcelCandidateState() {
        parcelCandidateRunId += 1;
        parcelCandidateRunning = false;
        parcelCandidateLayer?.remove();
        parcelCandidateLayer = null;
        parcelCandidateLegend = [];
        focusedParcelCandidateKey = '';
        renderedParcelCandidateScope = '';
        parcelCandidateHydrationScope = '';
    }

    function candidateRequestBox(candidate) {
        const bounds = boundsLikeToLatLngBounds(candidate?.bounds) || candidateFeatureBounds(candidate);
        if (!bounds?.isValid?.()) return null;
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        return {
            minLng: southWest.lng - 0.00025,
            minLat: southWest.lat - 0.00025,
            maxLng: northEast.lng + 0.00025,
            maxLat: northEast.lat + 0.00025
        };
    }

    async function hydrateStoredParcelCandidates(candidates, scope) {
        const missingGeometry = candidates.filter((candidate) =>
            !(candidate.features || []).length &&
            (candidate.pnuList || []).length &&
            candidate.bounds
        );
        if (!missingGeometry.length) return;

        const requestBoxes = missingGeometry.map(candidateRequestBox).filter(Boolean);
        if (!requestBoxes.length) return;

        const runId = ++parcelCandidateRunId;
        parcelCandidateRunning = true;
        parcelCandidateStatus = `저장된 필지 도형 복원 중 · ${missingGeometry.length}개 후보`;

        try {
            const fetchResult = await fetchPostgisCadastralFeatures(requestBoxes, {
                timeoutMs: 60000,
                onProgress: ({ completed, total, failed }) => {
                    parcelCandidateStatus = `저장된 필지 도형 복원 중 · ${completed}/${total} 구역${failed ? ` · ${failed}개 재조회 실패` : ''}`;
                }
            });
            const fetchedFeatures = fetchResult.features;
            if (parcelCandidateRunId !== runId || parcelCandidateLayerScope(parcelCandidates) !== scope) return;

            const featureById = new Map(fetchedFeatures.map((feature) => [String(featureId(feature)), feature]));
            const hydratedCandidates = candidates.map((candidate) => {
                if ((candidate.features || []).length) return candidate;
                const features = (candidate.pnuList || [])
                    .map((pnu) => featureById.get(String(pnu)))
                    .filter(Boolean);
                return { ...candidate, features };
            });
            const restoredCount = hydratedCandidates.reduce((sum, candidate) => sum + (candidate.features?.length || 0), 0);

            renderedParcelCandidateScope = parcelCandidateLayerScope(hydratedCandidates);
            renderParcelCandidateLayer(hydratedCandidates);
            parcelCandidateStatus = restoredCount
                ? `저장된 필지 도형 ${restoredCount.toLocaleString()}개 복원 완료`
                : '저장된 필지의 PNU는 확인했지만 도형을 찾지 못했습니다.';
            onParcelCandidatesChange(hydratedCandidates, parcelCandidateStatus, candidateContextKey);
        } catch (error) {
            if (parcelCandidateRunId !== runId) return;
            parcelCandidateStatus = error?.message === 'request-timeout'
                ? '필지 도형 복원 시간이 초과되었습니다. 잠시 후 저장본을 다시 불러오세요.'
                : `필지 도형 복원 실패 · ${error?.message || 'PostGIS 조회 오류'}`;
        } finally {
            if (parcelCandidateRunId === runId) parcelCandidateRunning = false;
        }
    }

    function parcelCandidateKey(candidate) {
        if (!candidate) return '';
        return String(candidate.id || candidate.name || `parcel-candidate-${candidate.rank || ''}`);
    }

    function parcelCandidateLayerScope(candidates) {
        const ids = candidates.map((candidate) => [
            parcelCandidateKey(candidate),
            candidate.rank,
            candidate.risk,
            candidate.featureTotal || candidate.featureLimit || candidate.features?.length || 0
        ].join(':')).join('|');
        return `${candidateContextKey || 'default'}::${candidates.length}::${ids}`;
    }

    function syncParcelCandidateLayerFromProps() {
        if (!map || !window.L) return;
        const candidates = Array.isArray(parcelCandidates) ? parcelCandidates : [];
        const nextScope = parcelCandidateLayerScope(candidates);
        if (nextScope === renderedParcelCandidateScope && (!candidates.length || parcelCandidateLegend.length)) return;

        renderedParcelCandidateScope = nextScope;
        focusedParcelCandidateKey = '';
        renderParcelCandidateLayer(candidates);

        const needsHydration = candidates.some((candidate) =>
            !(candidate.features || []).length && (candidate.pnuList || []).length && candidate.bounds
        );
        if (needsHydration && parcelCandidateHydrationScope !== nextScope) {
            parcelCandidateHydrationScope = nextScope;
            void hydrateStoredParcelCandidates(candidates, nextScope);
        }

        if (parcelCandidateRunning) return;
        if (candidates.length) {
            parcelCandidateStatus = `실천권역 내 ${candidates.length}개 유형별 실천지구 표시 중`;
        } else {
            parcelCandidateStatus = riskGrid?.values?.length
                ? 'Risk 분석 완료. 실천권역도출하기를 실행하세요.'
                : 'Risk 분석 후 실행';
        }
    }

    function parcelFeatureStyle(feature) {
        const rank = Number(feature?.properties?.candidateRank);
        const key = String(feature?.properties?.candidateId || feature?.properties?.candidateName || '');
        const selected = focusedParcelCandidateKey && key === focusedParcelCandidateKey;
        const priority = rank <= 3;
        return {
            color: PRACTICE_DISTRICT_COLOR,
            weight: selected ? 4 : priority ? 2.4 : 1.4,
            fillColor: PRACTICE_DISTRICT_FILL_COLOR,
            fillOpacity: selected ? 0.48 : priority ? 0.32 : 0.22
        };
    }

    function boundsLikeToLatLngBounds(boundsLike) {
        if (!window.L || !boundsLike) return null;
        let south;
        let west;
        let north;
        let east;

        if (Array.isArray(boundsLike)) {
            if (Array.isArray(boundsLike[0]) && Array.isArray(boundsLike[1])) {
                south = Number(boundsLike[0][0]);
                west = Number(boundsLike[0][1]);
                north = Number(boundsLike[1][0]);
                east = Number(boundsLike[1][1]);
            } else if (boundsLike.length >= 4) {
                west = Number(boundsLike[0]);
                south = Number(boundsLike[1]);
                east = Number(boundsLike[2]);
                north = Number(boundsLike[3]);
            }
        } else {
            const southWest = boundsLike._southWest || boundsLike.southWest || boundsLike.sw;
            const northEast = boundsLike._northEast || boundsLike.northEast || boundsLike.ne;
            if (southWest && northEast) {
                south = Number(southWest.lat ?? southWest[0]);
                west = Number(southWest.lng ?? southWest.lon ?? southWest[1]);
                north = Number(northEast.lat ?? northEast[0]);
                east = Number(northEast.lng ?? northEast.lon ?? northEast[1]);
            } else {
                south = Number(boundsLike.south ?? boundsLike.minLat ?? boundsLike.ymin ?? boundsLike.minY);
                west = Number(boundsLike.west ?? boundsLike.minLng ?? boundsLike.minLon ?? boundsLike.xmin ?? boundsLike.minX);
                north = Number(boundsLike.north ?? boundsLike.maxLat ?? boundsLike.ymax ?? boundsLike.maxY);
                east = Number(boundsLike.east ?? boundsLike.maxLng ?? boundsLike.maxLon ?? boundsLike.xmax ?? boundsLike.maxX);
            }
        }

        if (![south, west, north, east].every(Number.isFinite)) return false;
        const bounds = window.L.latLngBounds([
            [Math.min(south, north), Math.min(west, east)],
            [Math.max(south, north), Math.max(west, east)]
        ]);
        if (!bounds.isValid()) return false;
        return bounds;
    }

    function candidateFeatureBounds(candidate) {
        const featureBoundsList = (candidate?.features || [])
            .map((feature) => featureBounds(feature))
            .filter((bounds) =>
                bounds &&
                [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].every(Number.isFinite)
            );
        if (!featureBoundsList.length) return null;
        return boundsLikeToLatLngBounds({
            south: Math.min(...featureBoundsList.map((bounds) => bounds.minLat)),
            west: Math.min(...featureBoundsList.map((bounds) => bounds.minLng)),
            north: Math.max(...featureBoundsList.map((bounds) => bounds.maxLat)),
            east: Math.max(...featureBoundsList.map((bounds) => bounds.maxLng))
        });
    }

    function candidateCenterLatLng(candidate) {
        const center = candidate?.center;
        if (!center) return null;
        const lat = Number(center.lat ?? center[0]);
        const lng = Number(center.lng ?? center.lon ?? center[1]);
        if (![lat, lng].every(Number.isFinite)) return null;
        return [lat, lng];
    }

    function moveMapToCandidateBounds(bounds) {
        if (!map || !bounds?.isValid?.()) return false;
        map.invalidateSize?.({ pan: false });
        const center = bounds.getCenter?.();
        if (!center) return false;
        const padding = window.L?.point?.(120, 120) || [120, 120];
        const fitZoom = typeof map.getBoundsZoom === 'function'
            ? map.getBoundsZoom(bounds, false, padding)
            : map.getZoom();
        const targetZoom = Math.min(18, Math.max(15, Number.isFinite(fitZoom) ? fitZoom : 15));
        const options = {
            animate: true,
            duration: 0.65
        };
        if (typeof map.flyTo === 'function') {
            map.flyTo(center, targetZoom, options);
        } else {
            map.setView(center, targetZoom);
        }
        window.setTimeout(() => map.invalidateSize?.({ pan: false }), 80);
        return true;
    }

    function fitCandidateBounds(candidate) {
        if (!map || !window.L || !candidate) return false;
        const bounds = boundsLikeToLatLngBounds(candidate.bounds) || candidateFeatureBounds(candidate);
        if (bounds && moveMapToCandidateBounds(bounds)) return true;

        const center = candidateCenterLatLng(candidate);
        if (!center) return false;
        map.invalidateSize?.({ pan: false });
        if (typeof map.flyTo === 'function') {
            map.flyTo(center, 17, { animate: true, duration: 0.65 });
        } else {
            map.setView(center, 17);
        }
        return true;
    }

    function focusParcelCandidate(candidate, notify = false) {
        if (!map || !window.L || !candidate) return;
        focusedParcelCandidateKey = parcelCandidateKey(candidate);
        if (notify) onParcelCandidateFocus(candidate);

        if (!parcelCandidateLayer) {
            fitCandidateBounds(candidate);
            return;
        }

        const layers = [];
        parcelCandidateLayer.eachLayer((layer) => {
            const properties = layer.feature?.properties || {};
            const idMatches = properties.candidateId && String(properties.candidateId) === focusedParcelCandidateKey;
            const rankMatches = Number(properties.candidateRank) === Number(candidate.rank);
            const nameMatches = properties.candidateName === candidate.name;
            if (idMatches || rankMatches || nameMatches) layers.push(layer);
            layer.setStyle?.(parcelFeatureStyle(layer.feature));
        });
        if (!layers.length) {
            fitCandidateBounds(candidate);
            return;
        }

        const group = window.L.featureGroup(layers);
        const bounds = group.getBounds();
        if (!bounds.isValid()) {
            fitCandidateBounds(candidate);
            return;
        }

        moveMapToCandidateBounds(bounds);
        layers.forEach((layer) => layer.bringToFront?.());
        layers[0]?.openTooltip?.();
    }

    async function deriveParcelCandidates() {
        if (!riskGrid?.values?.length) {
            parcelCandidateStatus = 'Risk 분석 결과가 먼저 필요합니다.';
            return;
        }
        parcelCandidateRunning = true;
        parcelCandidateStatus = 'Hotspot 격자 준비 중';
        const runCandidateContextKey = candidateContextKey;
        const runId = ++parcelCandidateRunId;

        try {
            const hotspots = createHotspotPoints(riskGrid);
            if (!hotspots.length) throw new Error('hotspot-empty');

            const requestBoxes = hotspotRequestBoxes(hotspots);
            parcelCandidateStatus = `PostGIS 연속지적도 요청 중 · ${requestBoxes.length}개 구역`;
            const fetchResult = await fetchPostgisCadastralFeatures(requestBoxes, {
                onProgress: ({ completed, total, failed, features }) => {
                    parcelCandidateStatus = `PostGIS 필지 조회 · ${completed}/${total} 구역 · ${features.toLocaleString()}필지${failed ? ` · ${failed}개 구역 부분 조회` : ''}`;
                }
            });
            const cadastralFeatures = fetchResult.features;
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            if (!cadastralFeatures.length) throw new Error('parcel-empty');

            parcelCandidateStatus = `${cadastralFeatures.length.toLocaleString()}필지 · 100m 셀 교차 분석 중`;
            await yieldToBrowser();
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            const parcelRecords = parcelScoreRecords(cadastralFeatures, hotspots);
            if (!parcelRecords.length) throw new Error('intersection-empty');

            await yieldToBrowser();
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            const candidates = enrichPracticeDistricts(clusterParcelRecords(parcelRecords), hazard);
            renderParcelCandidateLayer(candidates);
            const slimCandidates = candidates.map(({ features, ...candidate }) => ({
                ...candidate,
                features: (features || []).map((feature) => ({
                    type: feature.type,
                    geometry: feature.geometry,
                    properties: {
                        pnu: feature.properties?.pnu || feature.properties?.PNU || feature.properties?.id || '',
                        candidateRank: candidate.rank,
                        candidateName: candidate.name,
                        candidateRisk: candidate.risk
                    }
                })),
                featureLimit: features?.length || 0,
                featureTotal: features?.length || 0
            }));
            const partialLabel = fetchResult.failureCount
                ? ` · ${fetchResult.failureCount}개 구역은 응답 누락으로 부분 분석`
                : '';
            const message = candidates.length
                ? `실천권역 내 ${candidates.length}개 실천지구 도출 · ${parcelRecords.length.toLocaleString()}필지 교차 · 3개 유형 시연 분류${partialLabel}`
                : '교차된 필지가 있으나 실천지구 기준을 충족하지 못했습니다.';
            parcelCandidateStatus = message;
            onParcelCandidatesChange(slimCandidates, message, runCandidateContextKey);
            if (candidates.length) onParcelDerivationComplete(candidates, runCandidateContextKey);
        } catch (error) {
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            console.error(error);
            const message = error?.message === 'parcel-empty'
                ? 'PostGIS 연속지적도에서 필지 geometry를 찾지 못했습니다.'
                : error?.message === 'intersection-empty'
                    ? 'Hotspot과 겹치는 필지를 찾지 못했습니다.'
                    : error?.message === 'hotspot-empty'
                        ? 'Hotspot 격자가 없습니다.'
                        : error?.message === 'request-timeout'
                            ? 'PostGIS 필지 조회 시간이 초과되었습니다. 범위를 줄이거나 잠시 후 다시 실행하세요.'
                        : error?.message?.startsWith('PostGIS ')
                            ? error.message
                            : '실천권역 도출 실패 · PostGIS 필지 서비스 상태를 확인하세요.';
            parcelCandidateStatus = message;
            // A transient API failure must not erase a previously completed
            // analysis. Keep the last valid candidates visible and only report
            // the failed refresh in the status area.
            if (!(parcelCandidates || []).length) {
                onParcelCandidatesChange([], message, runCandidateContextKey);
            }
        } finally {
            if (parcelCandidateRunId === runId) parcelCandidateRunning = false;
        }
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function isGridValueCollection(values) {
        return Array.isArray(values) || ArrayBuffer.isView(values) || values instanceof Map;
    }

    function gridValueAt(values, index) {
        return values instanceof Map ? values.get(index) : values?.[index];
    }

    function gridValueCollectionSize(values) {
        return values instanceof Map ? values.size : Number(values?.length) || 0;
    }

    function visibleGridIndicatorsForLayer(layer) {
        if (!['H', 'E', 'V'].includes(layer)) return [];
        return analysisIndicators.filter((item) =>
            item.enabled &&
            item.dimension === layer &&
            visibleAnalysisLayerIds.includes(String(item.id)) &&
            isGridValueCollection(item.gridValues)
        );
    }

    function hasVisibleIndicatorsForLayer(layer) {
        if (!['H', 'E', 'V'].includes(layer)) return false;
        return analysisIndicators.some((item) =>
            item.enabled &&
            item.dimension === layer &&
            visibleAnalysisLayerIds.includes(String(item.id))
        );
    }

    function gridValuesFromVisibleIndicators(grid, layer) {
        const cellCount = Number(grid?.columns) * Number(grid?.rows);
        if (!Number.isFinite(cellCount) || cellCount <= 0) return [];

        const items = visibleGridIndicatorsForLayer(layer);
        if (!items.length) return hasVisibleIndicatorsForLayer(layer) ? null : [];
        if (items.length === 1 && !(layer === 'V' && items[0].direction === 'negative')) {
            return items[0].gridValues;
        }

        const useSparseMap = cellCount > 500_000;
        const values = useSparseMap ? new Map() : new Float32Array(cellCount);
        if (!useSparseMap) values.fill(Number.NaN);
        const indices = Array.isArray(grid.validIndices) && grid.validIndices.length
            ? grid.validIndices
            : Array.from({ length: cellCount }, (_, index) => index);

        for (const index of indices) {
            let weightedSum = 0;
            let totalWeight = 0;

            items.forEach((item) => {
                const weight = Math.max(0, Number(item.weight) || 0);
                if (weight <= 0) return;

                const rawValue = Number(gridValueAt(item.gridValues, index));
                if (!Number.isFinite(rawValue)) return;

                const value = layer === 'V' && item.direction === 'negative'
                    ? 1 - clamp01(rawValue)
                    : clamp01(rawValue);

                weightedSum += weight * value;
                totalWeight += weight;
            });

            if (totalWeight > 0) {
                const value = weightedSum / totalWeight;
                if (useSparseMap) values.set(index, value);
                else values[index] = value;
            }
        }

        return values;
    }

    function gridValuesForLayer(grid, layer) {
        if (!grid) return [];
        if (grid.preview && ['Risk', 'Hotspot'].includes(layer)) return [];
        if (['H', 'E', 'V'].includes(layer)) {
            const values = gridValuesFromVisibleIndicators(grid, layer);
            if (values) return values;
        }
        if (layer === 'H') return grid.hValues || [];
        if (layer === 'E') return grid.eValues || [];
        if (layer === 'V') return grid.vValues || [];
        return grid.values || [];
    }

    function gridColor(value, layer) {
        if (layer === 'H') {
            if (value >= 0.75) return '#991b1b';
            if (value >= 0.6) return '#dc2626';
            if (value >= 0.45) return '#f97316';
            if (value >= 0.3) return '#facc15';
            return '#fde68a';
        }
        if (layer === 'E') {
            if (value >= 0.75) return '#0f172a';
            if (value >= 0.6) return '#1d4ed8';
            if (value >= 0.45) return '#0284c7';
            if (value >= 0.3) return '#38bdf8';
            return '#bae6fd';
        }
        if (layer === 'V') {
            if (value >= 0.75) return '#581c87';
            if (value >= 0.6) return '#7e22ce';
            if (value >= 0.45) return '#a855f7';
            if (value >= 0.3) return '#c084fc';
            return '#e9d5ff';
        }
        if (layer === 'Hotspot') {
            if (value >= 0.75) return '#7f1d1d';
            if (value >= 0.6) return '#b91c1c';
            return '#ef4444';
        }
        if (value >= 0.75) return '#b91c1c';
        if (value >= 0.6) return '#dc2626';
        if (value >= 0.45) return '#f97316';
        if (value >= 0.3) return '#facc15';
        if (value >= 0.15) return '#84cc16';
        return '#22c55e';
    }

    function createRiskGridLayer(L, grid) {
        if (!grid?.transform || !grid?.columns || !grid?.rows) return null;

        const layer = selectedGridLayer || 'Risk';
        const values = gridValuesForLayer(grid, layer);
        if (!gridValueCollectionSize(values)) return null;
        const columns = Number(grid.columns);
        const rows = Number(grid.rows);
        const originX = Number(grid.transform.originX);
        const originY = Number(grid.transform.originY);
        const cellWidth = Math.abs(Number(grid.transform.pixelWidth) || 100);
        const cellHeight = Math.abs(Number(grid.transform.pixelHeight) || 100);
        const hotspotThreshold = layer === 'Hotspot' ? Number(grid.stats?.topThreshold) : null;
        if (![columns, rows, originX, originY, cellWidth, cellHeight].every(Number.isFinite)) return null;

        const boundaryFeatures = getBoundaryFeaturesForRegionCode(regionCode);
        const drawableCells = [];
        const addDrawableCell = (index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;
            if (row < 0 || row >= rows || column < 0 || column >= columns) return;
            const centerX = originX + (column * cellWidth) + (cellWidth / 2);
            const centerY = originY - (row * cellHeight) - (cellHeight / 2);
            const [centerLat, centerLng] = epsg5179ToLatLng(centerX, centerY);
            if (!pointInBoundary([centerLng, centerLat], boundaryFeatures)) return;

            const left = originX + (column * cellWidth);
            const right = left + cellWidth;
            const top = originY - (row * cellHeight);
            const bottom = top - cellHeight;

            drawableCells.push({
                index,
                northwest: epsg5179ToLatLng(left, top),
                southeast: epsg5179ToLatLng(right, bottom)
            });
        };

        if (Array.isArray(grid.validIndices) && grid.validIndices.length) {
            grid.validIndices.forEach(addDrawableCell);
        } else {
            for (let index = 0; index < rows * columns; index += 1) addDrawableCell(index);
        }

        const RiskCanvasLayer = L.Layer.extend({
            onAdd(mapInstance) {
                this._map = mapInstance;
                this._canvas = L.DomUtil.create('canvas', 'risk-grid-canvas leaflet-zoom-animated');
                this._context = this._canvas.getContext('2d');
                mapInstance.getPanes().overlayPane.appendChild(this._canvas);
                mapInstance.on('moveend zoomend resize viewreset', this._reset, this);
                this._reset();
            },
            onRemove(mapInstance) {
                mapInstance.off('moveend zoomend resize viewreset', this._reset, this);
                this._canvas?.remove();
                this._canvas = null;
                this._context = null;
            },
            _reset() {
                if (!this._map || !this._canvas) return;
                const size = this._map.getSize();
                const topLeft = this._map.containerPointToLayerPoint([0, 0]);
                L.DomUtil.setPosition(this._canvas, topLeft);
                this._canvas.width = size.x;
                this._canvas.height = size.y;
                this._draw();
            },
            _draw() {
                if (!this._map || !this._context) return;
                const context = this._context;
                context.clearRect(0, 0, this._canvas.width, this._canvas.height);
                context.save();
                this._clipToBoundary(context);
                context.globalAlpha = 0.58;

                for (const cell of drawableCells) {
                    const value = Number(gridValueAt(values, cell.index));
                    if (!Number.isFinite(value)) continue;
                    if (Number.isFinite(hotspotThreshold) && value < hotspotThreshold) continue;

                    const topLeft = this._map.latLngToContainerPoint(cell.northwest);
                    const bottomRight = this._map.latLngToContainerPoint(cell.southeast);

                    context.fillStyle = gridColor(value, layer);
                    context.fillRect(
                        Math.floor(topLeft.x),
                        Math.floor(topLeft.y),
                        Math.max(1, Math.ceil(bottomRight.x - topLeft.x)),
                        Math.max(1, Math.ceil(bottomRight.y - topLeft.y))
                    );
                }

                context.restore();
                context.globalAlpha = 1;
            },
            _clipToBoundary(context) {
                if (!boundaryFeatures.length) return;

                context.beginPath();

                const drawRing = (ring) => {
                    ring.forEach(([lng, lat], index) => {
                        const point = this._map.latLngToContainerPoint([lat, lng]);
                        if (index === 0) {
                            context.moveTo(point.x, point.y);
                        } else {
                            context.lineTo(point.x, point.y);
                        }
                    });
                    context.closePath();
                };

                boundaryFeatures.forEach((feature) => {
                    const geometry = feature?.geometry;
                    if (geometry?.type === 'Polygon') {
                        geometry.coordinates.forEach(drawRing);
                    }
                    if (geometry?.type === 'MultiPolygon') {
                        geometry.coordinates.forEach((polygon) => polygon.forEach(drawRing));
                    }
                });

                context.clip('evenodd');
            }
        });

        return new RiskCanvasLayer();
    }

    function removeRiskGridLayer() {
        riskGridLayer?.remove();
        riskGridLayer = null;
    }

    function renderRiskGridLayer() {
        if (!map || !window.L) return;
        removeRiskGridLayer();
        if (!showAnalysisLegend || !riskGridVisible || !riskGrid?.values?.length) return;

        riskGridLayer = createRiskGridLayer(window.L, riskGrid);
        riskGridLayer?.addTo(map);
    }

    function clearSelectedRegion() {
        selectedBoundaryLayer?.remove();
        selectedBoundaryLayer = null;
    }

    function applyRegionMinimumZoom(bounds) {
        if (!map || !bounds?.isValid?.()) return;

        regionViewBounds = bounds;
        map.setMaxBounds(null);
        map.setMinZoom(7);
    }

    function regionReturnLabel() {
        const selectedRegion = getRegionByCode(regionCode);
        const shortName = selectedRegion?.sigungu || regionName?.split(' ').at(-1) || '선택 지역';
        return `${shortName}로 복귀`;
    }

    function returnToSelectedRegion() {
        if (!map) return;

        if (regionViewBounds?.isValid?.()) {
            map.stop();
            map.setMinZoom(7);
            map.invalidateSize?.({ pan: false });
            const padding = locked ? [18, 18] : [28, 28];
            const overviewZoom = map.getBoundsZoom(regionViewBounds, false, padding);
            if (Number.isFinite(overviewZoom)) map.setMinZoom(overviewZoom);
            map.fitBounds(regionViewBounds, {
                padding,
                animate: true,
                duration: 0.55
            });
            return;
        }

        locateRegion();
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
                    pane: 'selectedBoundaryPane',
                    interactive: false,
                    style: {
                        color: '#2563eb',
                        weight: 3,
                        opacity: 1,
                        fillColor: '#60a5fa',
                        fillOpacity: 0.22
                    }
                }
            ).bindTooltip(`${label} 행정경계`, { sticky: true });

            const bounds = selectedBoundaryLayer.getBounds();
            toggleLayer(selectedBoundaryLayer, selectedBoundaryVisible);
            if (bounds.isValid()) {
                applyRegionMinimumZoom(bounds);
                const padding = locked ? [6, 6] : [28, 28];
                const maxOverviewZoom = locked ? regionZoom(region) + 2 : regionZoom(region) + 1;
                const overviewZoom = Math.min(maxOverviewZoom, map.getBoundsZoom(bounds, false, padding));
                if (Number.isFinite(overviewZoom)) map.setMinZoom(overviewZoom);
                map.fitBounds(bounds, {
                    padding,
                    maxZoom: maxOverviewZoom,
                    animate: true,
                    duration: 0.65
                });
                return;
            }
        }

        const center = getRegionCenter(regionCode);
        if (center) {
            map.setMaxBounds(null);
            map.setMinZoom(9);
            regionViewBounds = null;
            map.setView(center, regionZoom(region));
        }
    }

    function toggleLayer(layer, visible) {
        if (!map || !layer) return;
        if (visible) {
            layer.addTo(map);
        } else {
            layer.remove();
        }
    }

    function waitForLeaflet() {
        if (window.L) return Promise.resolve(window.L);

        return new Promise((resolve, reject) => {
            let attempts = 0;
            const timer = window.setInterval(() => {
                attempts += 1;
                if (window.L) {
                    window.clearInterval(timer);
                    resolve(window.L);
                } else if (attempts > 80) {
                    window.clearInterval(timer);
                    reject(new Error('Leaflet failed to load'));
                }
            }, 50);
        });
    }

    function createBaseLayer(L, style) {
        const config = BASE_TILE_STYLES[style] || BASE_TILE_STYLES.default;
        return L.tileLayer(config.url, {
            attribution: config.attribution,
            crossOrigin: true,
            maxZoom: config.maxZoom
        });
    }

    function setBaseMapStyle(style) {
        if (style === baseMapStyle || !BASE_TILE_STYLES[style]) return;
        baseMapStyle = style;
        if (!map || !window.L) return;
        const nextLayer = createBaseLayer(window.L, style).addTo(map);
        if (baseLayer) baseLayer.remove();
        baseLayer = nextLayer;
    }

    function initializeMap(L) {
        mapLoading = true;
        map = L.map(mapElement, {
            attributionControl: true,
            zoomControl: false,
            dragging: !locked,
            scrollWheelZoom: !locked,
            doubleClickZoom: !locked,
            boxZoom: !locked,
            keyboard: !locked,
            touchZoom: !locked,
            minZoom: 7,
            maxZoom: 18,
            zoomSnap: locked ? 0.25 : 1,
            zoomDelta: locked ? 0.25 : 1
        });

        if (!locked) {
            const zoomControl = L.control.zoom({ position: 'bottomright' }).addTo(map);
            const measureZoomOffsets = () => {
                const zoomEl = zoomControl.getContainer();
                if (!zoomEl || !mapElement) return false;
                const mapRect = mapElement.getBoundingClientRect();
                const zoomRect = zoomEl.getBoundingClientRect();
                if (!zoomRect.height || !mapRect.height) return false;
                locateButtonOffset = Math.round(mapRect.bottom - zoomRect.top + 8);
                scaleBottomOffset = Math.round(mapRect.bottom - zoomRect.bottom);
                return true;
            };
            let measureAttempts = 0;
            const retryMeasure = () => {
                if (measureZoomOffsets() || measureAttempts > 10) return;
                measureAttempts += 1;
                window.setTimeout(retryMeasure, 120);
            };
            retryMeasure();
        }

        const scaleControl = L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(map);
        const attachScaleControl = () => {
            const scaleEl = scaleControl.getContainer();
            const target = scaleControlEl || mapElement?.parentElement?.querySelector('.map-scale-control');
            if (!scaleEl || !target) return false;
            if (scaleEl.parentElement !== target) target.appendChild(scaleEl);
            return true;
        };
        if (!attachScaleControl()) {
            window.setTimeout(() => {
                if (!attachScaleControl()) window.setTimeout(attachScaleControl, 200);
            }, 0);
        }

        if (!map.getPane('parcelCandidatePane')) {
            map.createPane('parcelCandidatePane');
            map.getPane('parcelCandidatePane').style.zIndex = 560;
        }
        if (!map.getPane('selectedBoundaryPane')) {
            map.createPane('selectedBoundaryPane');
            map.getPane('selectedBoundaryPane').style.zIndex = 610;
            map.getPane('selectedBoundaryPane').style.pointerEvents = 'none';
        }

        baseLayer = createBaseLayer(L, baseMapStyle).addTo(map);

        if (hasVWorldApiKey()) {
            sidoLayer = L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sidoBoundary, { opacity: 0.35 }));
            sggLayer = L.tileLayer
                .wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sigunguBoundary, { opacity: 0.65 }));
            if (showCadastral) {
                cadastralLayer = L.tileLayer.wms(
                    VWORLD_WMS_URL,
                    createVWorldWmsOptions(VWORLD_WMS_LAYERS.cadastral, { opacity: 0.55 })
                );
            }
            toggleLayer(sidoLayer, sidoBoundaryVisible);
            toggleLayer(sggLayer, sigunguBoundaryVisible);
        }

        locateRegion();
        if (showAnalysisLegend) {
            syncVisibleAnalysisLayers();
            renderAnalysisLayers();
            renderRiskGridLayer();
            syncParcelCandidateLayerFromProps();
        }
        map.invalidateSize?.({ pan: false });
        mapLoading = false;
        if (focusedCandidate) {
            window.setTimeout(() => {
                syncParcelCandidateLayerFromProps();
                focusParcelCandidate(focusedCandidate);
            }, 120);
            window.setTimeout(() => focusParcelCandidate(focusedCandidate), 420);
        }
    }

    onMount(() => {
        let disposed = false;

        waitForLeaflet()
            .then((L) => {
                if (!disposed) initializeMap(L);
            })
            .catch((error) => console.error(error));

        const resizeObserver = new ResizeObserver(() => map?.invalidateSize?.({ pan: false }));
        if (mapElement) resizeObserver.observe(mapElement);

        return () => {
            disposed = true;
            resizeObserver.disconnect();
            removeRiskGridLayer();
            parcelCandidateLayer?.remove();
            adaptationSiteLayer?.remove();
            map?.remove();
        };
    });

    $effect(() => {
        regionCode;
        regionName;
        locateRegion();
        if (showAnalysisLegend) renderAnalysisLayers();
        renderRiskGridLayer();
    });

    $effect(() => {
        if (forceSelectedBoundary && !selectedBoundaryVisible) selectedBoundaryVisible = true;
        selectedBoundaryVisible;
        toggleLayer(selectedBoundaryLayer, forceSelectedBoundary ? true : selectedBoundaryVisible);
        selectedBoundaryLayer?.bringToFront?.();
    });

    $effect(() => {
        analysisIndicators;
        riskGrid;
        riskGridVisible;
        selectedGridLayer;
        showAnalysisLegend;
        syncVisibleAnalysisLayers();
        renderAnalysisLayers();
        renderRiskGridLayer();
        syncParcelCandidateLayerFromProps();
        adaptationSites;
        renderAdaptationSiteLayer();
    });

    $effect(() => {
        parcelCandidates;
        candidateContextKey;
        syncParcelCandidateLayerFromProps();
        map?.invalidateSize?.({ pan: false });
    });

    $effect(() => {
        mapResetKey;
        if (!map || appliedMapResetKey === mapResetKey) return;
        appliedMapResetKey = mapResetKey;
        clearParcelCandidateState();
        renderRiskGridLayer();
        window.setTimeout(() => returnToSelectedRegion(), 0);
    });

    $effect(() => {
        activeGridLayer;
        if (activeGridLayer && gridLayers.includes(activeGridLayer) && activeGridLayer !== selectedGridLayer) {
            selectedGridLayer = activeGridLayer;
        }
    });

    $effect(() => {
        focusedCandidate;
        focusParcelCandidate(focusedCandidate);
        if (focusedCandidate && map) {
            const requestedCandidate = focusedCandidate;
            window.setTimeout(() => {
                if (focusedCandidate?.requestedAt === requestedCandidate?.requestedAt) {
                    syncParcelCandidateLayerFromProps();
                    focusParcelCandidate(requestedCandidate);
                }
            }, 140);
        }
    });
</script>

<svelte:head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</svelte:head>

<div class={`region-map-wrap${exportBusy ? ' map-exporting' : ''}`}>
    <div class:locked-map={locked} class:tabbed-map={showAnalysisLegend} class="region-map" bind:this={mapElement} style={`height:${height}`}></div>
    {#if mapLoading}
        <div class="map-refresh-loading" role="status" aria-live="polite" data-map-export-ignore>
            <span></span>
            <strong>지도 준비 중</strong>
            <small>선택 지역의 배경지도와 분석 레이어를 준비하고 있습니다.</small>
        </div>
    {/if}
    {#if exportStatus}
        <div class="map-export-status" data-map-export-ignore role="status" aria-live="polite">{exportStatus}</div>
    {/if}
    <div class="map-scale-control" data-map-export-ignore style={`bottom:${scaleBottomOffset}px`} bind:this={scaleControlEl}></div>
    {#if showAnalysisLegend}
        <div class="analysis-overlay-stack" data-map-export-ignore>
            <div class="analysis-legend" aria-label="표시 레이어">
                <div class="legend-head">
                    <strong>표시 레이어</strong>
                    <button
                        type="button"
                        class="legend-info-toggle"
                        class:active={legendInfoOpen}
                        aria-expanded={legendInfoOpen}
                        aria-label={`표시 레이어 안내 ${legendInfoOpen ? '닫기' : '보기'}`}
                        onclick={() => (legendInfoOpen = !legendInfoOpen)}
                    >ⓘ</button>
                </div>
                {#if legendInfoOpen}
                    <div class="legend-info-popover" role="dialog" aria-label="표시 레이어 안내">
                        <div class="legend-info-popover-head">
                            <span class="legend-info-chip">안내</span>
                            <button type="button" class="legend-info-close" aria-label="안내 닫기" onclick={() => (legendInfoOpen = false)}>×</button>
                        </div>
                        <p>
                            {riskGrid?.preview
                                ? '분석 전 미리보기 · H·E·V 탭과 체크박스로 01 지표 데이터를 확인합니다.'
                                : 'H·E·V 탭과 체크박스로 지도 시각화를 켜고 끌 수 있습니다.'}
                        </p>
                        <p>표시를 끄면 지도 레이어가 숨겨지고 범례 행도 흐려집니다. Risk 분석 포함 여부는 01 분석 지표 선택에서 설정합니다.</p>
                    </div>
                {/if}
                {#if riskGrid?.stats}
                    <label class="risk-surface-summary">
                        <input
                            type="checkbox"
                            checked={riskGridVisible}
                            onchange={(event) => { riskGridVisible = event.currentTarget.checked; renderRiskGridLayer(); }}
                        />
                        <b>100m {gridLayerLabels[selectedGridLayer] || selectedGridLayer} 격자</b>
                        <span>{riskGridVisible ? `${riskGrid.stats.validCells?.toLocaleString()}셀 표시 중` : '숨김'}</span>
                        <div class="risk-ramp" aria-hidden="true"></div>
                        <small>낮음 → 높음</small>
                    </label>
                {/if}
                <div class="analysis-grid-tabs" aria-label="분석 격자 레이어">
                    {#each gridLayers as layer}
                        <button
                            type="button"
                            class:active={selectedGridLayer === layer}
                            class:dim-tab={dimensionTabColors[layer]}
                            style={dimensionTabColors[layer] ? `--dim-tab-color:${dimensionTabColors[layer]}` : undefined}
                            disabled={riskGrid?.preview && ['Risk', 'Hotspot'].includes(layer)}
                            onclick={() => { selectedGridLayer = layer; onGridLayerChange(layer); renderRiskGridLayer(); }}
                        >
                            {layer}
                        </button>
                    {/each}
                </div>
                {#each analysisGroups.filter((group) => groupsForGridLayer(selectedGridLayer).includes(group)) as group}
                    {@const items = analysisIndicators.filter((item) => item.enabled && item.group === group)}
                    {#if items.length}
                        <section>
                            <h3>{group} ({analysisGroupEnglish[group]})</h3>
                            <div class="legend-items">
                                {#each items as item}
                                    <label class:dimmed={!visibleAnalysisLayerIds.includes(String(item.id))}>
                                        <input
                                            type="checkbox"
                                            checked={visibleAnalysisLayerIds.includes(String(item.id))}
                                            onchange={(event) => toggleAnalysisLayer(item.id, event.currentTarget.checked)}
                                        />
                                        <i style={`--legend-color:${item.color || '#64748b'}`}></i>
                                        <b>{item.label}</b>
                                        <small title={item.group === '적응역량' ? '값이 높을수록 위험도가 낮아집니다' : '값이 높을수록 위험도가 높아집니다'}>{item.dimension}{item.group === '적응역량' ? '-' : '+'}</small>
                                    </label>
                                {/each}
                            </div>
                        </section>
                    {/if}
                {/each}
                {#if ['Risk', 'Hotspot'].includes(selectedGridLayer)}
                    <p>{gridLayerLabels[selectedGridLayer]} 결과 레이어만 표시 중입니다.</p>
                {:else if !enabledAnalysisIndicators().length}
                    <p>선택된 분석 지표가 없습니다.</p>
                {/if}
                {#if enabledAnalysisIndicators().length && !enabledAnalysisIndicators().some((item) => item.geojson) && !riskGrid?.values?.length}
                    <p>실제 공간 결과 레이어는 아직 연결 전입니다.</p>
                {/if}
            </div>
            {#if riskGrid?.stats}
                <div class="parcel-candidate-panel" aria-label="실천권역 도출 패널">
                    <div class="parcel-candidate-tools">
                        <button
                            type="button"
                            disabled={parcelCandidateRunning}
                            onclick={deriveParcelCandidates}
                        >
                            {parcelCandidateRunning ? '실천권역 분석 중...' : '실천권역도출하기'}
                        </button>
                        <span>{parcelCandidateStatus}</span>
                    </div>
                    {#if parcelCandidateLegend.length}
                        <section class="parcel-candidate-legend" aria-label="실천권역 내 유형별 실천지구 범례">
                            <h3>실천권역 내 유형별 실천지구</h3>
                            <div class="candidate-legend-items">
                                {#each parcelCandidateLegend as candidate}
                                    <button
                                        type="button"
                                        style={`--practice-color:${candidate.practiceTypeColor || '#f97316'}`}
                                        class:priority={candidate.isPriority}
                                        class:active={focusedParcelCandidateKey === parcelCandidateKey(candidate)}
                                        onpointerdown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            focusParcelCandidate(candidate, true);
                                        }}
                                        onclick={() => focusParcelCandidate(candidate, true)}
                                    >
                                        <i aria-hidden="true"></i>
                                        <b>{candidate.name}</b>
                                        <small>{candidate.practiceTypeLabel} · Risk {candidate.riskLabel} · {candidate.parcelLabel}필지 · {candidate.totalAreaLabel}</small>
                                    </button>
                                {/each}
                            </div>
                        </section>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
    <div class="display-settings-panel" data-map-export-ignore aria-label="표시 설정">
        <label class="display-toggle-row">
            <span class="display-toggle-label">흑백 지도</span>
            <span class="switch">
                <input
                    type="checkbox"
                    checked={baseMapStyle === 'grayscale'}
                    onchange={(event) => setBaseMapStyle(event.currentTarget.checked ? 'grayscale' : 'default')}
                />
                <span class="switch-track" aria-hidden="true"></span>
            </span>
        </label>
        <label class="display-toggle-row">
            <span class="display-toggle-label">분석지역 경계</span>
            <span class="switch">
                <input
                    type="checkbox"
                    checked={forceSelectedBoundary ? true : selectedBoundaryVisible}
                    disabled={forceSelectedBoundary}
                    onchange={(event) => {
                        if (forceSelectedBoundary) return;
                        selectedBoundaryVisible = event.currentTarget.checked;
                        toggleLayer(selectedBoundaryLayer, selectedBoundaryVisible);
                    }}
                />
                <span class="switch-track" aria-hidden="true"></span>
            </span>
        </label>
    </div>
    <div class="map-control-column" data-map-export-ignore style={`bottom:${locateButtonOffset}px`}>
        <button
            class="map-icon-button"
            type="button"
            aria-label="지도 PNG 다운로드"
            title={exportBusy ? 'PNG 생성 중' : '지도 PNG 다운로드'}
            disabled={mapLoading || exportBusy}
            onclick={exportMapImage}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3.5v10"></path>
                <path d="M7.75 9.75 12 14l4.25-4.25"></path>
                <path d="M4.5 19.5h15"></path>
            </svg>
        </button>
        {#if !locked}
            <button
                class="map-icon-button"
                type="button"
                aria-label={regionReturnLabel()}
                title={`${regionName || '선택 지역'} 전체 보기`}
                onclick={() => returnToSelectedRegion()}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6.25"></circle>
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
                    <circle class="target-dot" cx="12" cy="12" r="1.4"></circle>
                </svg>
            </button>
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

    /* 대안 탭이 위에 얹히는 배치에서는 탭의 오목 곡선과 같은 반경으로 맞춘다 */
    .region-map.tabbed-map {
        border-radius: 9px;
    }


    .map-export-canvas-snapshot {
        position: absolute;
        z-index: 430;
        max-width: none;
        pointer-events: none;
        image-rendering: auto;
    }

    .map-export-status {
        position: absolute;
        right: .85rem;
        bottom: 4.15rem;
        z-index: 900;
        max-width: 18rem;
        border-radius: .55rem;
        background: rgb(15 23 42 / 88%);
        color: #fff;
        padding: .42rem .58rem;
        font-size: .66rem;
        font-weight: 800;
        line-height: 1.35;
        text-align: right;
        pointer-events: none;
    }

    .map-scale-control {
        position: absolute;
        right: 3.4rem;
        z-index: 700;
        pointer-events: none;
    }

    .map-scale-control :global(.leaflet-control-scale) {
        margin: 0;
    }

    .map-scale-control :global(.leaflet-control-scale-line) {
        border: 2px solid #1f2937;
        border-top: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        color: #1f2937;
        padding: 0 .2rem;
        font-size: .66rem;
        font-weight: 800;
        line-height: 1.25;
        text-align: right;
        text-shadow: 0 0 3px #fff, 0 0 3px #fff;
    }

    .map-exporting .analysis-legend,
    .map-exporting .parcel-candidate-panel,
    .map-exporting .display-settings-panel {
        background: #fff;
        backdrop-filter: none;
    }

    .map-refresh-loading {
        position: absolute;
        z-index: 1200;
        inset: 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: .45rem;
        border-radius: 1rem;
        background: rgb(241 250 248 / 86%);
        color: #0f3f3a;
        text-align: center;
        backdrop-filter: blur(3px);
    }

    .map-refresh-loading span {
        width: 1.8rem;
        height: 1.8rem;
        border: 3px solid #99f6e4;
        border-top-color: #0f766e;
        border-radius: 999px;
        animation: map-refresh-spin .7s linear infinite;
    }

    .map-refresh-loading strong { font-size: .85rem; }
    .map-refresh-loading small { color: #64748b; font-size: .7rem; }
    @keyframes map-refresh-spin { to { transform: rotate(360deg); } }

    .locked-map {
        cursor: default;
    }

    .locked-map :global(.leaflet-control-attribution) {
        font-size: .65rem;
    }

    .display-settings-panel {
        position: absolute;
        left: .85rem;
        bottom: .85rem;
        z-index: 640;
        display: grid;
        gap: .625rem;
        width: max-content;
        border: 1px solid rgb(15 23 42 / 10%);
        border-radius: .9rem;
        background: rgb(255 255 255 / 96%);
        padding: .75rem;
        box-shadow: 0 22px 46px rgb(15 23 42 / 18%);
        backdrop-filter: blur(10px);
        pointer-events: auto;
    }

    .display-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.2rem;
        cursor: pointer;
    }

    .display-toggle-label {
        color: #64748b;
        font-size: .75rem;
        font-weight: 700;
        white-space: nowrap;
    }

    .switch {
        position: relative;
        display: inline-flex;
        flex: 0 0 auto;
        width: 2.1rem;
        height: 1.15rem;
    }

    .switch input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }

    .switch-track {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: #cbd5e1;
        transition: background .16s ease;
    }

    .switch-track::before {
        content: '';
        position: absolute;
        top: .13rem;
        left: .13rem;
        width: .9rem;
        height: .9rem;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 1px 3px rgb(15 23 42 / 30%);
        transition: transform .16s ease;
    }

    .switch input:checked + .switch-track {
        background: #0f766e;
    }

    .switch input:checked + .switch-track::before {
        transform: translateX(.95rem);
    }

    .switch input:disabled + .switch-track {
        opacity: .5;
        cursor: not-allowed;
    }

    .switch input:focus-visible + .switch-track {
        outline: 2px solid rgb(45 212 191 / 55%);
        outline-offset: 2px;
    }

    .map-control-column {
        position: absolute;
        right: .625rem;
        z-index: 680;
        display: flex;
        flex-direction: column;
        gap: .5rem;
        pointer-events: auto;
    }

    .map-icon-button {
        display: grid;
        place-items: center;
        width: 2.125rem;
        height: 2.125rem;
        border: 2px solid rgb(0 0 0 / 20%);
        border-radius: 4px;
        background: #fff;
        color: #000;
        padding: 0;
        box-shadow: none;
        cursor: pointer;
        transition: background .16s ease, color .16s ease;
    }

    .map-icon-button:hover:not(:disabled) {
        background: #f4f4f4;
    }

    .map-icon-button:disabled {
        color: #9ca3af;
        cursor: wait;
    }

    .map-icon-button:focus-visible {
        outline: 3px solid rgb(45 212 191 / 38%);
        outline-offset: 2px;
    }

    .map-icon-button svg {
        width: 1.05rem;
        height: 1.05rem;
        overflow: visible;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .map-icon-button .target-dot {
        fill: currentColor;
        stroke: none;
    }

    .analysis-overlay-stack {
        position: absolute;
        left: .85rem;
        top: .85rem;
        z-index: 640;
        display: grid;
        gap: .6rem;
        width: min(16.5rem, calc(100% - 2rem));
        max-height: calc(100% - 1.7rem);
        pointer-events: none;
    }

    .analysis-legend {
        width: 100%;
        max-height: 16rem;
        overflow: auto;
        border: 1px solid rgb(15 23 42 / 10%);
        border-radius: .9rem;
        background: rgb(255 255 255 / 96%);
        padding: .8rem .9rem;
        box-shadow: 0 22px 46px rgb(15 23 42 / 18%);
        color: #0f172a;
        backdrop-filter: blur(10px);
        pointer-events: auto;
    }

    .legend-head {
        display: flex;
        align-items: center;
        gap: .35rem;
    }

    .legend-head strong {
        color: #073b52;
        font-size: .88rem;
        font-weight: 900;
    }

    .legend-info-toggle {
        flex: 0 0 auto;
        border: 0;
        background: transparent;
        color: #9aa8a2;
        padding: 0;
        font-size: .78rem;
        line-height: 1;
        cursor: pointer;
    }

    .legend-info-toggle:hover,
    .legend-info-toggle.active { color: #0f766e; }

    .legend-info-popover {
        margin-top: .45rem;
        border-radius: .6rem;
        background: #102f2d;
        color: #fff;
        padding: .5rem .6rem .6rem;
    }

    .legend-info-popover-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .5rem;
        margin-bottom: .35rem;
    }

    .legend-info-chip {
        border-radius: 999px;
        background: rgb(255 255 255 / 18%);
        padding: .12rem .45rem;
        font-size: .58rem;
        font-weight: 800;
    }

    .legend-info-popover .legend-info-close {
        flex: 0 0 auto;
        border: 0;
        background: transparent;
        color: rgb(255 255 255 / 78%);
        padding: 0 .1rem;
        font-size: .85rem;
        line-height: 1;
        cursor: pointer;
    }

    .legend-info-popover .legend-info-close:hover { color: #fff; }

    .legend-info-popover p {
        margin: 0 0 .3rem;
        font-size: .62rem;
        font-weight: 700;
        line-height: 1.45;
    }

    .legend-info-popover p:last-child { margin-bottom: 0; }

    .risk-surface-summary {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: .28rem;
        align-items: center;
        margin-top: .65rem;
        border: 1px solid rgb(15 118 110 / 18%);
        border-radius: .72rem;
        background: rgb(236 253 245 / 82%);
        padding: .58rem .62rem;
        cursor: pointer;
    }

    .risk-surface-summary input {
        grid-row: 1 / span 4;
        width: .9rem;
        height: .9rem;
        margin: 0;
        accent-color: #0f766e;
    }

    .risk-surface-summary b {
        grid-column: 2;
        color: #0f766e;
        font-size: .72rem;
        font-weight: 900;
    }

    .risk-surface-summary span,
    .risk-surface-summary small {
        grid-column: 2;
        color: #475569;
        font-size: .66rem;
        font-weight: 800;
    }

    .risk-ramp {
        grid-column: 2;
        height: .42rem;
        border-radius: 999px;
        background: linear-gradient(90deg, #22c55e, #84cc16, #facc15, #f97316, #dc2626, #b91c1c);
    }

    .analysis-grid-tabs {
        display: flex;
        align-items: center;
        gap: .28rem;
        margin-top: .5rem;
    }

    .analysis-grid-tabs button {
        flex: 1 1 auto;
        min-width: 0;
        border: 1px solid rgb(15 23 42 / 10%);
        border-radius: .45rem;
        background: #f8fafc;
        color: #475569;
        padding: .34rem .18rem;
        font-size: .62rem;
        font-weight: 900;
        cursor: pointer;
    }

    .analysis-grid-tabs button.dim-tab {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 1.7rem;
        height: 1.7rem;
        border: 1px solid var(--dim-tab-color);
        border-radius: 999px;
        background: #f8fafc;
        color: #475569;
        padding: 0;
    }

    .analysis-grid-tabs button.dim-tab.active {
        border-color: var(--dim-tab-color);
        background: var(--dim-tab-color);
        color: #fff;
        box-shadow: 0 8px 18px rgb(15 23 42 / 18%);
    }

    .analysis-grid-tabs button.active {
        border-color: #0f766e;
        background: #0f766e;
        color: #ffffff;
        box-shadow: 0 8px 18px rgb(15 118 110 / 22%);
    }

    .parcel-candidate-tools {
        display: grid;
        gap: .35rem;
        border: 1px solid rgb(185 28 28 / 16%);
        border-radius: .72rem;
        background: rgb(255 247 237 / 88%);
        padding: .58rem .62rem;
    }

    .parcel-candidate-panel {
        width: 100%;
        max-height: min(24rem, 45vh);
        overflow: auto;
        border: 1px solid rgb(185 28 28 / 14%);
        border-radius: .9rem;
        background: rgb(255 255 255 / 94%);
        padding: .65rem;
        box-shadow: 0 22px 46px rgb(15 23 42 / 16%);
        backdrop-filter: blur(10px);
        pointer-events: auto;
    }

    .parcel-candidate-tools button {
        border: 0;
        border-radius: .5rem;
        background: #b91c1c;
        color: white;
        padding: .46rem .55rem;
        font-size: .7rem;
        font-weight: 900;
        cursor: pointer;
    }

    .parcel-candidate-tools button:disabled {
        opacity: .58;
        cursor: wait;
    }

    .parcel-candidate-tools span {
        color: #7c2d12;
        font-size: .66rem;
        font-weight: 800;
        line-height: 1.35;
    }

    .parcel-candidate-legend {
        margin-top: .65rem;
        border: 1px solid rgb(185 28 28 / 16%);
        border-radius: .75rem;
        background: rgb(255 247 237 / 76%);
        padding: .58rem;
    }

    .parcel-candidate-legend h3 {
        margin: 0 0 .42rem;
        color: #7f1d1d;
        font-size: .72rem;
        font-weight: 900;
    }

    .candidate-legend-items {
        display: grid;
        gap: .35rem;
    }

    .candidate-legend-items button {
        display: grid;
        grid-template-columns: .72rem 1fr;
        gap: .14rem .48rem;
        align-items: center;
        border: 1px solid rgb(249 115 22 / 24%);
        border-radius: .58rem;
        background: rgb(255 255 255 / 90%);
        color: inherit;
        padding: .46rem .52rem;
        text-align: left;
        cursor: pointer;
        box-shadow: 0 8px 16px rgb(124 45 18 / 7%);
    }

    .candidate-legend-items button.priority {
        border-color: rgb(220 38 38 / 30%);
        background: rgb(254 242 242 / 94%);
    }

    .candidate-legend-items button.active {
        border-color: #7f1d1d;
        background: #fff1f2;
        box-shadow: 0 0 0 2px rgb(220 38 38 / 12%);
    }

    .candidate-legend-items i {
        width: .66rem;
        height: .66rem;
        border-radius: 999px;
        background: var(--practice-color, #f97316);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--practice-color, #f97316) 18%, transparent);
    }

    .candidate-legend-items button.priority i,
    .candidate-legend-items button.active i {
        background: var(--practice-color, #dc2626);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--practice-color, #dc2626) 20%, transparent);
    }

    .candidate-legend-items b {
        min-width: 0;
        color: #1e293b;
        font-size: .72rem;
        font-weight: 900;
    }

    .candidate-legend-items small {
        grid-column: 2;
        color: #7c2d12;
        font-size: .64rem;
        font-weight: 800;
        line-height: 1.28;
    }

    :global(.risk-grid-canvas) {
        pointer-events: none;
        mix-blend-mode: multiply;
    }

    .analysis-legend section {
        margin-top: .65rem;
        border-top: 1px solid rgb(15 23 42 / 8%);
        padding-top: .55rem;
    }

    .analysis-legend h3 {
        margin: 0 0 .42rem;
        color: #244a45;
        font-size: .72rem;
        font-weight: 900;
    }

    .legend-items {
        display: grid;
        gap: .35rem;
    }


    .legend-items label {
        display: grid;
        grid-template-columns: .85rem .75rem minmax(0, 1fr) auto;
        gap: .45rem;
        align-items: center;
        min-width: 0;
        color: #475569;
        font-size: .66rem;
        font-weight: 700;
        cursor: pointer;
    }

    .legend-items input {
        width: .82rem;
        height: .82rem;
        margin: 0;
        accent-color: #0f766e;
    }

    .legend-items i {
        width: .62rem;
        height: .62rem;
        border-radius: 999px;
        background: var(--legend-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--legend-color) 18%, transparent);
    }

    .legend-items label.dimmed i {
        opacity: .35;
        box-shadow: none;
    }

    .legend-items label.dimmed b {
        color: #94a3b8;
        font-weight: 600;
    }

    .legend-items label.dimmed small {
        background: #f1f5f9;
        color: #94a3b8;
    }

    .legend-items b {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .legend-items small {
        border-radius: 999px;
        background: #edf7f3;
        color: #0f766e;
        padding: .1rem .38rem;
        font-size: .62rem;
        font-weight: 900;
    }

    .analysis-legend p {
        margin: .7rem 0 0;
        color: #64748b;
        font-size: .72rem;
        font-weight: 700;
    }

</style>
