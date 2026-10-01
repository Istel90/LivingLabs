// Shared geometry helpers for display and server-side practice-area analysis.
export function meridionalArc(lat, a, e2) {
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    return a * (
        (1 - (e2 / 4) - ((3 * e4) / 64) - ((5 * e6) / 256)) * lat -
        (((3 * e2) / 8) + ((3 * e4) / 32) + ((45 * e6) / 1024)) * Math.sin(2 * lat) +
        (((15 * e4) / 256) + ((45 * e6) / 1024)) * Math.sin(4 * lat) -
        ((35 * e6) / 3072) * Math.sin(6 * lat)
    );
}

export function epsg5179ToLatLng(x, y) {
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

export function pointInRing(point, ring) {
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

export function pointInPolygon(point, polygon) {
    if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

export function pointInFeature(point, feature) {
    const geometry = feature?.geometry;
    if (!geometry) return false;
    if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
    }
    return false;
}

export function pointInBoundary(point, features) {
    if (!features?.length) return true;
    return features.some((feature) => pointInFeature(point, feature));
}

export function forEachCoordinate(geometry, callback) {
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

export function featureBounds(feature) {
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

export function pointInBounds(point, bounds) {
    if (!bounds) return false;
    const [lng, lat] = point;
    return lng >= bounds.minLng && lng <= bounds.maxLng && lat >= bounds.minLat && lat <= bounds.maxLat;
}

export function boundsIntersect(left, right) {
    if (!left || !right) return false;
    return !(
        left.maxLng < right.minLng ||
        left.minLng > right.maxLng ||
        left.maxLat < right.minLat ||
        left.minLat > right.maxLat
    );
}

export function pointInHotspotCell(point, hotspot) {
    return pointInPolygon(point, [hotspot?.corners || []]);
}

export function featureRings(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return [];
    if (geometry.type === 'Polygon') return geometry.coordinates || [];
    if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flatMap((polygon) => polygon || []);
    return [];
}

export function orientation(a, b, c) {
    const value = ((b[1] - a[1]) * (c[0] - b[0])) - ((b[0] - a[0]) * (c[1] - b[1]));
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : 2;
}

export function onSegment(a, b, c) {
    return (
        b[0] <= Math.max(a[0], c[0]) + 1e-12 &&
        b[0] >= Math.min(a[0], c[0]) - 1e-12 &&
        b[1] <= Math.max(a[1], c[1]) + 1e-12 &&
        b[1] >= Math.min(a[1], c[1]) - 1e-12
    );
}

export function segmentsIntersect(a, b, c, d) {
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

export function ringSegments(ring) {
    const points = (ring || []).filter((point) =>
        Array.isArray(point) &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    );
    if (points.length < 2) return [];

    return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

export function featureIntersectsHotspotCell(feature, hotspot, bounds = featureBounds(feature)) {
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

export function hotspotSpatialKey(x, y) {
    return `${x}:${y}`;
}

export function buildHotspotSpatialIndex(hotspots) {
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

export function nearbyHotspotsForBounds(bounds, index) {
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

export function centroidForFeature(feature) {
    const points = [];
    forEachCoordinate(feature?.geometry, ([lng, lat]) => {
        if (Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
    });
    if (!points.length) return null;

    const sum = points.reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
}

export function ringAreaSquareMeters(ring) {
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

export function polygonAreaSquareMeters(polygon) {
    if (!polygon?.length) return 0;
    const [outer, ...holes] = polygon;
    return Math.max(0, ringAreaSquareMeters(outer) - holes.reduce((sum, ring) => sum + ringAreaSquareMeters(ring), 0));
}

export function featureAreaSquareMeters(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return 0;
    if (geometry.type === 'Polygon') return polygonAreaSquareMeters(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaSquareMeters(polygon), 0);
    }
    return 0;
}

export function formatAreaSquareMeters(value) {
    const area = Number(value);
    if (!Number.isFinite(area) || area <= 0) return '면적 산정 전';
    if (area >= 10000) return `${(area / 10000).toFixed(area >= 100000 ? 1 : 2)}ha`;
    return `${Math.round(area).toLocaleString()}㎡`;
}

export function distanceMeters(left, right) {
    if (!left || !right) return Infinity;
    const lat = ((left[1] + right[1]) / 2) * Math.PI / 180;
    const metersPerDegreeLng = 111320 * Math.cos(lat);
    const dx = (left[0] - right[0]) * metersPerDegreeLng;
    const dy = (left[1] - right[1]) * 110540;
    return Math.sqrt((dx * dx) + (dy * dy));
}

export function average(values) {
    const finiteValues = values.filter(Number.isFinite);
    if (!finiteValues.length) return null;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

