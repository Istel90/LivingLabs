import { readFileSync } from 'node:fs';
import proj4 from 'proj4';

proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs',
);

function boundaryFeaturesForRegion(boundaries, regionCode) {
  const features = boundaries.features || [];
  const exact = features.filter((feature) => String(feature.properties?.code || '') === regionCode);
  if (exact.length) return exact;
  if (/^\d{4}0$/.test(regionCode)) {
    const children = features.filter((feature) => String(feature.properties?.code || '').startsWith(regionCode.slice(0, 4)));
    if (children.length) return children;
  }
  if (/^\d{2}000$/.test(regionCode)) {
    const children = features.filter((feature) => String(feature.properties?.code || '').startsWith(regionCode.slice(0, 2)));
    if (children.length) return children;
  }
  return [];
}

function projectPolygon(polygon) {
  return polygon.map((ring) => ring.map((point) => proj4('EPSG:4326', 'EPSG:5179', point)));
}

function projectGeometry(geometry) {
  if (geometry?.type === 'Polygon') return [projectPolygon(geometry.coordinates)];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map(projectPolygon);
  return [];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi) / (yj - yi)) + xi)) inside = !inside;
  }
  return inside;
}

function pointInPolygons(x, y, polygons) {
  return polygons.some((rings) =>
    rings.length && pointInRing(x, y, rings[0]) && !rings.slice(1).some((ring) => pointInRing(x, y, ring))
  );
}

function idwAt(x, y, stations, indicator) {
  const nearest = stations
    .map((station) => {
      const dx = x - station.xy[0];
      const dy = y - station.xy[1];
      return { distance2: (dx * dx) + (dy * dy), value: Number(station.metrics?.[indicator]) };
    })
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => left.distance2 - right.distance2)
    .slice(0, 8);
  if (!nearest.length) return NaN;
  if (nearest[0].distance2 < 1) return nearest[0].value;
  let weighted = 0;
  let weightSum = 0;
  nearest.forEach((entry) => {
    const weight = 1 / entry.distance2;
    weighted += entry.value * weight;
    weightSum += weight;
  });
  return weighted / weightSum;
}

export function createObservedHazardGridBuilder({ metricsPath, boundariesPath }) {
  let sources = null;
  const cache = new Map();

  function loadSources() {
    if (sources) return sources;
    const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
    const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8'));
    const stations = (metrics.stations || []).map((station) => ({
      ...station,
      xy: proj4('EPSG:4326', 'EPSG:5179', [Number(station.longitude), Number(station.latitude)]),
    }));
    sources = { metrics, boundaries, stations };
    return sources;
  }

  return function buildObservedHazardGrid(searchParams) {
    const regionCode = (searchParams.get('regionCode') || '').trim();
    const indicator = (searchParams.get('indicator') || '').trim().toUpperCase();
    if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be 5 digits');
    if (!/^H0[1-9]$/.test(indicator)) throw new Error('indicator must be H01 through H09');
    const cacheKey = `${regionCode}:${indicator}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const { metrics, boundaries, stations } = loadSources();
    const features = boundaryFeaturesForRegion(boundaries, regionCode);
    if (!features.length) throw new Error(`No boundary found for region ${regionCode}`);
    const polygons = features.flatMap((feature) => projectGeometry(feature.geometry));
    const projectedPoints = polygons.flat(2);
    if (!projectedPoints.length) throw new Error(`Invalid boundary for region ${regionCode}`);

    const xs = projectedPoints.map((point) => point[0]);
    const ys = projectedPoints.map((point) => point[1]);
    const xmin = Math.floor(Math.min(...xs) / 100) * 100;
    const ymin = Math.floor(Math.min(...ys) / 100) * 100;
    const xmax = Math.ceil(Math.max(...xs) / 100) * 100;
    const ymax = Math.ceil(Math.max(...ys) / 100) * 100;
    const columns = Math.round((xmax - xmin) / 100);
    const rows = Math.round((ymax - ymin) / 100);
    const cellCount = columns * rows;
    if (!Number.isFinite(cellCount) || cellCount <= 0 || cellCount > 3_000_000) {
      throw new Error(`Region grid is too large (${cellCount} cells)`);
    }

    const rawValues = new Float64Array(cellCount);
    rawValues.fill(Number.NaN);
    let rawMin = Infinity;
    let rawMax = -Infinity;
    let rawSum = 0;
    let validCells = 0;
    for (const polygon of polygons) {
      const polygonPoints = polygon.flat();
      const polygonXs = polygonPoints.map((point) => point[0]);
      const polygonYs = polygonPoints.map((point) => point[1]);
      const firstColumn = Math.max(0, Math.floor((Math.min(...polygonXs) - xmin) / 100));
      const lastColumn = Math.min(columns - 1, Math.ceil((Math.max(...polygonXs) - xmin) / 100) - 1);
      const firstRow = Math.max(0, Math.floor((ymax - Math.max(...polygonYs)) / 100));
      const lastRow = Math.min(rows - 1, Math.ceil((ymax - Math.min(...polygonYs)) / 100) - 1);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const y = ymax - ((row + 0.5) * 100);
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const index = (row * columns) + column;
          if (Number.isFinite(rawValues[index])) continue;
          const x = xmin + ((column + 0.5) * 100);
          if (!pointInPolygons(x, y, [polygon])) continue;
          const value = idwAt(x, y, stations, indicator);
          if (!Number.isFinite(value)) continue;
          rawValues[index] = value;
          rawMin = Math.min(rawMin, value);
          rawMax = Math.max(rawMax, value);
          rawSum += value;
          validCells += 1;
        }
      }
    }
    if (!validCells) throw new Error(`No valid cells generated for ${regionCode}`);

    const range = rawMax - rawMin;
    let normalizedSum = 0;
    const sparseValues = [];
    rawValues.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const normalized = range > 0 ? (value - rawMin) / range : 0.5;
      normalizedSum += normalized;
      sparseValues.push(index, Number(normalized.toFixed(6)));
    });
    const payload = {
      schemaVersion: 'livinglabs-hazard-grid/v1',
      indicator,
      regionCode,
      gridUnit: '100m',
      columns,
      rows,
      extent: { xmin, ymin, xmax, ymax },
      transform: { originX: xmin, originY: ymax, pixelWidth: 100, pixelHeight: 100 },
      crs: 'EPSG:5179',
      valueEncoding: 'sparse-index-value',
      valueCount: cellCount,
      sparseValues,
      unit: metrics.units?.[indicator] || '',
      rawUnit: metrics.units?.[indicator] || '',
      sourceResolution: 'ASOS 69개 관측소 IDW 공간보간(최근접 8개, power 2) → EPSG:5179 100m 셀 중심',
      observedPeriod: metrics.observedPeriod,
      baselinePeriod: metrics.baselinePeriod,
      stats: {
        validCells,
        rawMin: Number(rawMin.toFixed(4)),
        rawMax: Number(rawMax.toFixed(4)),
        rawMean: Number((rawSum / validCells).toFixed(4)),
        normalizedMean: Number((normalizedSum / validCells).toFixed(6)),
      },
    };
    cache.set(cacheKey, payload);
    return payload;
  };
}