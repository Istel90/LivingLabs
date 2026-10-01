// Extracted from SelectedRegionMap at 6142d46; selection rules are unchanged.
import { meridionalArc, epsg5179ToLatLng, pointInRing, pointInPolygon, pointInFeature, pointInBoundary, forEachCoordinate, featureBounds, pointInBounds, boundsIntersect, pointInHotspotCell, featureRings, orientation, onSegment, segmentsIntersect, ringSegments, featureIntersectsHotspotCell, hotspotSpatialKey, buildHotspotSpatialIndex, nearbyHotspotsForBounds, centroidForFeature, ringAreaSquareMeters, polygonAreaSquareMeters, featureAreaSquareMeters, formatAreaSquareMeters, distanceMeters, average } from '../src/lib/data/spatialGeometry.js';
export function createHotspotPoints(grid, boundaryFeatures = []) {
    if (!grid?.values?.length || !Number.isFinite(grid.stats?.topThreshold)) return [];

    const columns = Number(grid.columns);
    const rows = Number(grid.rows);
    const originX = Number(grid.transform?.originX);
    const originY = Number(grid.transform?.originY);
    const cellWidth = Math.abs(Number(grid.transform?.pixelWidth) || 100);
    const cellHeight = Math.abs(Number(grid.transform?.pixelHeight) || 100);
    const threshold = Number(grid.stats.topThreshold);
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
        if (!Array.isArray(grid.validIndices) && !pointInBoundary(point, boundaryFeatures)) continue;

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

export function hotspotRequestBoxes(points) {
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

export function featureId(feature) {
    const properties = feature?.properties || {};
    return properties.pnu || properties.PNU || properties.gid || properties.GID || properties.id || JSON.stringify(featureBounds(feature));
}

export function parcelLabel(feature) {
    const properties = feature?.properties || {};
    const legalDong = properties.legal_dong_name || properties.legalDongName || '';
    const lotNumber = properties.lot_number || properties.lotNumber || '';
    return properties.jibun || properties.JIBUN || properties.addr || properties.ADDR ||
        [legalDong, lotNumber].filter(Boolean).join(' ') || properties.pnu || properties.PNU || '필지';
}

export function parcelScoreRecords(features, hotspots) {
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

export function boundsForParcelRecords(records) {
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

export function clusterParcelRecords(records) {
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
            parcelDatasetVersion: cluster.members[0]?.feature?.properties?.cadastreDatasetVersion || null,
            center: cluster.center,
            bounds: cluster.bounds,
            features: cluster.members.map((item) => item.feature),
            score: Number(cluster.score.toFixed(4))
        }));
}
