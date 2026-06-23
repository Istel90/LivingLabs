<script>
    import { onMount } from 'svelte';
    import {
        getBoundaryFeaturesForRegionCode,
        getRegionByCode,
        getRegionCenter,
        regionZoom
    } from '$lib/data/administrativeRegions.js';
    import {
        createVWorldDataUrl,
        createVWorldWmsOptions,
        hasVWorldApiKey,
        VWORLD_DATASETS,
        VWORLD_WMS_LAYERS,
        VWORLD_WMS_URL
    } from '../../../../shared/map/vworld.js';

    let {
        regionCode = '41110',
        regionName = '경기도 수원시',
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
        parcelCandidates = [],
        candidateContextKey = '',
        showAnalysisLegend = false,
        focusedCandidate = null,
        locked = false
    } = $props();

    const analysisGroups = ['기후위험', '노출', '민감도', '적응역량'];
    const gridLayers = ['Risk', 'H', 'E', 'V', 'Hotspot'];
    const gridLayerLabels = {
        Risk: '종합 Risk',
        H: '기후위험 H',
        E: '노출 E',
        V: '취약성 V',
        Hotspot: 'Hotspot'
    };

    let mapElement;
    let map;
    let marker;
    let selectedBoundaryLayer;
    let sidoLayer;
    let sggLayer;
    let cadastralLayer;
    let analysisLayerGroup;
    let riskGridLayer;
    let parcelCandidateLayer;
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

    function createAnalysisLayer(L, item) {
        if (!item.geojson) return null;

        const color = item.color || '#64748b';
        const tooltip = `${item.group} · ${item.label}`;
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
                radius: 7,
                color,
                fillColor: color,
                fillOpacity: 0.75,
                weight: 2
            })
        }).bindTooltip(tooltip);
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

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const index = (row * columns) + column;
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
        }

        return points.sort((left, right) => right.risk - left.risk);
    }

    function hotspotRequestBoxes(points) {
        const tileSize = 0.006;
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
            .slice(0, 12)
            .map((box) => ({
                minLng: box.minLng - 0.0012,
                minLat: box.minLat - 0.0012,
                maxLng: box.maxLng + 0.0012,
                maxLat: box.maxLat + 0.0012,
                count: box.count
            }));
    }

    function extractVWorldFeatures(payload) {
        return payload?.response?.result?.featureCollection?.features ||
            payload?.response?.result?.features ||
            payload?.features ||
            [];
    }

    function featureId(feature) {
        const properties = feature?.properties || {};
        return properties.pnu || properties.PNU || properties.gid || properties.GID || properties.id || JSON.stringify(featureBounds(feature));
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    async function fetchJsonWithTimeout(url, timeoutMs = 9000) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`VWorld ${response.status}`);
            return await response.json();
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('request-timeout');
            throw error;
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function fetchVWorldCadastralFeatures(boxes, { timeoutMs = 45000 } = {}) {
        const featuresById = new Map();
        const pageSize = 650;
        const maxPages = 1;
        const maxFeatures = 5000;
        const deadline = Date.now() + timeoutMs;

        for (const box of boxes) {
            if (featuresById.size >= maxFeatures) break;
            if (Date.now() > deadline) throw new Error('request-timeout');
            for (let page = 1; page <= maxPages; page += 1) {
                if (Date.now() > deadline) throw new Error('request-timeout');
                const geomFilter = `BOX(${box.minLng},${box.minLat},${box.maxLng},${box.maxLat})`;
                const url = createVWorldDataUrl(VWORLD_DATASETS.cadastral, {
                    geomFilter,
                    size: pageSize,
                    page
                });
                const payload = await fetchJsonWithTimeout(url);
                if (payload?.response?.status === 'ERROR') {
                    const code = payload.response.error?.code || 'API_ERROR';
                    const text = payload.response.error?.text || 'VWorld 데이터 API 오류';
                    throw new Error(`VWorld ${code}: ${text}`);
                }
                const features = extractVWorldFeatures(payload);
                features.forEach((feature) => {
                    const id = featureId(feature);
                    if (id) featuresById.set(id, feature);
                });

                await yieldToBrowser();
                if (featuresById.size >= maxFeatures) break;
                if (features.length < pageSize) break;
            }
        }

        return [...featuresById.values()];
    }

    function parcelLabel(feature) {
        const properties = feature?.properties || {};
        return properties.jibun || properties.JIBUN || properties.addr || properties.ADDR || properties.pnu || properties.PNU || '필지';
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
                basis: 'VWorld LP_PA_CBND_BUBUN + 100m hotspot cell-parcel intersection',
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
                    candidateRank: candidate.rank
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
                    layer.bindTooltip(`${feature.properties?.candidateName || '필지 후보'} · Risk ${feature.properties?.candidateRisk || '--'}`, { sticky: true });
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

        if (parcelCandidateRunning) return;
        if (candidates.length) {
            parcelCandidateStatus = `${candidates.length}개 필지 후보 표시 중`;
        } else {
            parcelCandidateStatus = riskGrid?.values?.length
                ? 'Risk 분석 완료. 필지 후보 도출을 실행하세요.'
                : 'Risk 분석 후 실행';
        }
    }

    function parcelFeatureStyle(feature) {
        const rank = Number(feature?.properties?.candidateRank);
        const key = String(feature?.properties?.candidateId || feature?.properties?.candidateName || '');
        const selected = focusedParcelCandidateKey && key === focusedParcelCandidateKey;
        const priority = rank <= 3;
        return {
            color: selected ? '#7f1d1d' : priority ? '#dc2626' : '#f97316',
            weight: selected ? 4 : priority ? 2.4 : 1.4,
            fillColor: selected ? '#ef4444' : priority ? '#ef4444' : '#f59e0b',
            fillOpacity: selected ? 0.48 : priority ? 0.32 : 0.22
        };
    }

    function fitCandidateBounds(candidate) {
        if (!map || !window.L || !candidate?.bounds) return false;
        const south = Number(candidate.bounds.south);
        const west = Number(candidate.bounds.west);
        const north = Number(candidate.bounds.north);
        const east = Number(candidate.bounds.east);
        if (![south, west, north, east].every(Number.isFinite)) return false;
        const bounds = window.L.latLngBounds([[south, west], [north, east]]);
        if (!bounds.isValid()) return false;
        map.fitBounds(bounds, {
            paddingTopLeft: [320, 70],
            paddingBottomRight: [70, 150],
            maxZoom: 17,
            animate: true,
            duration: 0.65
        });
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
        if (!bounds.isValid()) return;

        map.fitBounds(bounds, {
            paddingTopLeft: [320, 70],
            paddingBottomRight: [70, 150],
            maxZoom: 17,
            animate: true,
            duration: 0.65
        });
        layers[0]?.openTooltip?.();
    }

    async function deriveParcelCandidates() {
        if (!riskGrid?.values?.length) {
            parcelCandidateStatus = 'Risk 분석 결과가 먼저 필요합니다.';
            return;
        }
        if (!hasVWorldApiKey()) {
            parcelCandidateStatus = 'VWorld API 키가 없어 필지 geometry를 가져올 수 없습니다.';
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
            parcelCandidateStatus = `연속지적도 API 요청 중 · ${requestBoxes.length}개 구역`;
            const cadastralFeatures = await fetchVWorldCadastralFeatures(requestBoxes);
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            if (!cadastralFeatures.length) throw new Error('parcel-empty');

            parcelCandidateStatus = `${cadastralFeatures.length.toLocaleString()}필지 · 100m 셀 교차 분석 중`;
            await yieldToBrowser();
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            const parcelRecords = parcelScoreRecords(cadastralFeatures, hotspots);
            if (!parcelRecords.length) throw new Error('intersection-empty');

            await yieldToBrowser();
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            const candidates = clusterParcelRecords(parcelRecords);
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
            const message = candidates.length
                ? `${candidates.length}개 필지 후보 클러스터 도출 · ${parcelRecords.length.toLocaleString()}필지 교차`
                : '교차된 필지가 있으나 후보 클러스터 기준을 충족하지 못했습니다.';
            parcelCandidateStatus = message;
            onParcelCandidatesChange(slimCandidates, message, runCandidateContextKey);
        } catch (error) {
            if (parcelCandidateRunId !== runId || candidateContextKey !== runCandidateContextKey) return;
            console.error(error);
            parcelCandidateLayer?.remove();
            parcelCandidateLayer = null;
            parcelCandidateLegend = [];
            const message = error?.message === 'parcel-empty'
                ? '연속지적도 API에서 필지 geometry를 받지 못했습니다.'
                : error?.message === 'intersection-empty'
                    ? 'Hotspot과 겹치는 필지를 찾지 못했습니다.'
                    : error?.message === 'hotspot-empty'
                        ? 'Hotspot 격자가 없습니다.'
                        : error?.message === 'request-timeout'
                            ? 'VWorld 필지 API 응답 시간이 초과되었습니다. 범위를 줄이거나 잠시 후 다시 실행하세요.'
                        : error?.message?.startsWith('VWorld ')
                            ? error.message
                            : '필지 후보 도출 실패 · VWorld API 응답을 확인하세요.';
            parcelCandidateStatus = message;
            onParcelCandidatesChange([], message, runCandidateContextKey);
        } finally {
            if (parcelCandidateRunId === runId) parcelCandidateRunning = false;
        }
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function visibleGridIndicatorsForLayer(layer) {
        if (!['H', 'E', 'V'].includes(layer)) return [];
        return analysisIndicators.filter((item) =>
            item.enabled &&
            item.dimension === layer &&
            visibleAnalysisLayerIds.includes(String(item.id)) &&
            Array.isArray(item.gridValues)
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

        const values = new Array(cellCount).fill(null);

        for (let index = 0; index < cellCount; index += 1) {
            let weightedSum = 0;
            let totalWeight = 0;

            items.forEach((item) => {
                const weight = Math.max(0, Number(item.weight) || 0);
                if (weight <= 0) return;

                const rawValue = Number(item.gridValues[index]);
                if (!Number.isFinite(rawValue)) return;

                const value = layer === 'V' && item.direction === 'negative'
                    ? 1 - clamp01(rawValue)
                    : clamp01(rawValue);

                weightedSum += weight * value;
                totalWeight += weight;
            });

            values[index] = totalWeight > 0 ? weightedSum / totalWeight : null;
        }

        return values;
    }

    function gridValuesForLayer(grid, layer) {
        if (!grid) return [];
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
        if (!values.length) return null;
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

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const index = (row * columns) + column;
                const centerX = originX + (column * cellWidth) + (cellWidth / 2);
                const centerY = originY - (row * cellHeight) - (cellHeight / 2);
                const [centerLat, centerLng] = epsg5179ToLatLng(centerX, centerY);
                if (!pointInBoundary([centerLng, centerLat], boundaryFeatures)) continue;

                const left = originX + (column * cellWidth);
                const right = left + cellWidth;
                const top = originY - (row * cellHeight);
                const bottom = top - cellHeight;

                drawableCells.push({
                    index,
                    northwest: epsg5179ToLatLng(left, top),
                    southeast: epsg5179ToLatLng(right, bottom)
                });
            }
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
                    const value = Number(values[cell.index]);
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
            ).bindTooltip(`${label} 행정경계`, { sticky: true });

            const bounds = selectedBoundaryLayer.getBounds();
            toggleLayer(selectedBoundaryLayer, selectedBoundaryVisible);
            if (bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: locked ? [18, 18] : [28, 28],
                    maxZoom: locked ? regionZoom(region) + 2 : regionZoom(region) + 1,
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

    function initializeMap(L) {
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
            maxZoom: 18
        });

        if (!locked) {
            L.control.zoom({ position: 'bottomright' }).addTo(map);
        }

        if (!map.getPane('parcelCandidatePane')) {
            map.createPane('parcelCandidatePane');
            map.getPane('parcelCandidatePane').style.zIndex = 560;
        }

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

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
    }

    onMount(() => {
        let disposed = false;

        waitForLeaflet()
            .then((L) => {
                if (!disposed) initializeMap(L);
            })
            .catch((error) => console.error(error));

        return () => {
            disposed = true;
            removeRiskGridLayer();
            parcelCandidateLayer?.remove();
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
        selectedBoundaryVisible;
        toggleLayer(selectedBoundaryLayer, selectedBoundaryVisible);
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
    });

    $effect(() => {
        parcelCandidates;
        candidateContextKey;
        syncParcelCandidateLayerFromProps();
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
    });
</script>

<svelte:head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</svelte:head>

<div class="region-map-wrap">
    <div class:locked-map={locked} class="region-map" bind:this={mapElement} style={`height:${height}`}></div>
    {#if showAnalysisLegend}
        <div class="analysis-overlay-stack">
            <div class="analysis-legend" aria-label="분석 범례">
                <strong>분석 범례</strong>
                <span class="legend-note">체크된 지표만 표시</span>
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
                    <div class="analysis-grid-tabs" aria-label="분석 격자 레이어">
                        {#each gridLayers as layer}
                            <button
                                type="button"
                                class:active={selectedGridLayer === layer}
                                onclick={() => { selectedGridLayer = layer; onGridLayerChange(layer); renderRiskGridLayer(); }}
                            >
                                {layer}
                            </button>
                        {/each}
                    </div>
                {/if}
                {#each analysisGroups.filter((group) => groupsForGridLayer(selectedGridLayer).includes(group)) as group}
                    {@const items = analysisIndicators.filter((item) => item.enabled && item.group === group)}
                    {#if items.length}
                        <section>
                            <h3>{group}</h3>
                            <div class="legend-items">
                                {#each items as item}
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={visibleAnalysisLayerIds.includes(String(item.id))}
                                            onchange={(event) => toggleAnalysisLayer(item.id, event.currentTarget.checked)}
                                        />
                                        <i style={`--legend-color:${item.color || '#64748b'}`}></i>
                                        <b>{item.label}</b>
                                        <small>{item.dimension}{item.group === '적응역량' ? '-' : '+'}</small>
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
                <div class="parcel-candidate-panel" aria-label="필지 후보 도출 패널">
                    <div class="parcel-candidate-tools">
                        <button
                            type="button"
                            disabled={parcelCandidateRunning || !hasVWorldApiKey()}
                            onclick={deriveParcelCandidates}
                        >
                            {parcelCandidateRunning ? '필지 분석 중...' : '필지 후보 도출'}
                        </button>
                        <span>{parcelCandidateStatus}</span>
                    </div>
                    {#if parcelCandidateLegend.length}
                        <section class="parcel-candidate-legend" aria-label="필지 후보 범례">
                            <h3>후보지 범례</h3>
                            <div class="candidate-legend-items">
                                {#each parcelCandidateLegend as candidate}
                                    <button
                                        type="button"
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
                                        <small>Risk {candidate.riskLabel} · {candidate.parcelLabel}필지 · {candidate.totalAreaLabel}</small>
                                    </button>
                                {/each}
                            </div>
                        </section>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
    <div class="layer-panel">
        <strong>베이스·행정 레이어</strong>
        <span class="local-boundary">{selectedBoundaryVisible ? '선택지역 경계 표시 중' : '선택지역 경계 숨김'}</span>
        <label>
            <input
                type="checkbox"
                checked={selectedBoundaryVisible}
                onchange={(event) => {
                    selectedBoundaryVisible = event.currentTarget.checked;
                    toggleLayer(selectedBoundaryLayer, selectedBoundaryVisible);
                }}
            />
            선택지역 경계
        </label>
        {#if hasVWorldApiKey()}
            <label><input type="checkbox" checked={sidoBoundaryVisible} onchange={(event) => { sidoBoundaryVisible = event.currentTarget.checked; toggleLayer(sidoLayer, sidoBoundaryVisible); }} /> 시도 경계</label>
            <label><input type="checkbox" checked={sigunguBoundaryVisible} onchange={(event) => { sigunguBoundaryVisible = event.currentTarget.checked; toggleLayer(sggLayer, sigunguBoundaryVisible); }} /> 시군구 경계</label>
            {#if showCadastral}
                <label><input type="checkbox" checked={cadastralVisible} onchange={(event) => { cadastralVisible = event.currentTarget.checked; toggleLayer(cadastralLayer, cadastralVisible); }} /> 연속지적도</label>
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

    .locked-map {
        cursor: default;
    }

    .locked-map :global(.leaflet-control-attribution) {
        font-size: .65rem;
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

    .analysis-overlay-stack {
        position: absolute;
        left: .85rem;
        top: .85rem;
        z-index: 640;
        display: grid;
        gap: .6rem;
        width: min(19rem, calc(100% - 2rem));
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

    .analysis-legend > strong {
        display: block;
        color: #073b52;
        font-size: .88rem;
        font-weight: 900;
    }

    .legend-note {
        display: block;
        margin-top: .2rem;
        color: #64748b;
        font-size: .68rem;
        font-weight: 800;
    }

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
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: .28rem;
        margin-top: .5rem;
    }

    .analysis-grid-tabs button {
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
        background: #f97316;
        box-shadow: 0 0 0 3px rgb(249 115 22 / 14%);
    }

    .candidate-legend-items button.priority i,
    .candidate-legend-items button.active i {
        background: #dc2626;
        box-shadow: 0 0 0 3px rgb(220 38 38 / 14%);
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
        color: #334155;
        font-size: .72rem;
        font-weight: 800;
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
