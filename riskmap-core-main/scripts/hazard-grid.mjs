import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import proj4 from 'proj4';
import { fromFile } from 'geotiff';

proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs');

const TEMPERATURE_INDICATORS = new Set(['H01', 'H02', 'H03', 'H07']);
const DOWNSCALED_INDICATORS = ['H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09'];

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
  return polygons.some((rings) => rings.length && pointInRing(x, y, rings[0]) && !rings.slice(1).some((ring) => pointInRing(x, y, ring)));
}

function idwValuesAt(x, y, stations, valueField) {
  const nearest = stations.map((station) => {
    const dx = x - station.xy[0];
    const dy = y - station.xy[1];
    return { distance2: (dx * dx) + (dy * dy), value: Number(valueField(station)) };
  }).filter((entry) => Number.isFinite(entry.value)).sort((a, b) => a.distance2 - b.distance2).slice(0, 8);
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

function loadHighresGrid(binaryPath, metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const bytes = gunzipSync(readFileSync(binaryPath));
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return { metadata, values };
}

function createHighresSampler(highres, bounds = null) {
  const bucketSize = 1000;
  const margin = 2000;
  const buckets = new Map();
  const values = highres.values;
  for (let offset = 0; offset < values.length; offset += 3) {
    const x = values[offset];
    const y = values[offset + 1];
    if (bounds && (x < bounds.xmin - margin || x > bounds.xmax + margin || y < bounds.ymin - margin || y > bounds.ymax + margin)) continue;
    const key = `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(offset);
    buckets.set(key, bucket);
  }
  return (x, y) => {
    const bucketX = Math.floor(x / bucketSize);
    const bucketY = Math.floor(y / bucketSize);
    let nearestDistance2 = Infinity;
    let nearestValue = NaN;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const bucket = buckets.get(`${bucketX + dx}:${bucketY + dy}`) || [];
        for (const offset of bucket) {
          const distanceX = x - values[offset];
          const distanceY = y - values[offset + 1];
          const distance2 = (distanceX * distanceX) + (distanceY * distanceY);
          if (distance2 >= nearestDistance2) continue;
          nearestDistance2 = distance2;
          nearestValue = values[offset + 2];
        }
      }
    }
    return nearestDistance2 <= 2_250_000 ? nearestValue : NaN;
  };
}

function fitDownscalingModels(stations, highres) {
  const nationalTemperature = createHighresSampler(highres);
  const withTemperature = stations.map((station) => ({ ...station, highresTemperature: nationalTemperature(...station.xy) }))
    .filter((station) => Number.isFinite(station.highresTemperature));
  return Object.fromEntries(DOWNSCALED_INDICATORS.map((indicator) => {
    const samples = withTemperature.map((station) => ({ station, x: station.highresTemperature, y: Number(station.metrics?.[indicator]) }))
      .filter(({ y }) => Number.isFinite(y));
    const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
    const meanY = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
    const denominator = samples.reduce((sum, sample) => sum + ((sample.x - meanX) ** 2), 0);
    const slope = denominator > 0 ? samples.reduce((sum, sample) => sum + ((sample.x - meanX) * (sample.y - meanY)), 0) / denominator : 0;
    const intercept = meanY - (slope * meanX);
    const residualStations = samples.map(({ station, x, y }) => ({ ...station, downscalingResidual: y - (intercept + (slope * x)) }));
    const observedValues = samples.map(({ y }) => y);
    const observedMin = Math.min(...observedValues);
    const observedMax = Math.max(...observedValues);
    return [indicator, {
      intercept,
      slope,
      residualStations,
      lowerBound: TEMPERATURE_INDICATORS.has(indicator) ? observedMin - 5 : 0,
      upperBound: TEMPERATURE_INDICATORS.has(indicator) ? observedMax + 5 : observedMax * 1.25,
      sampleCount: samples.length,
    }];
  }));
}

function createDownscaledSampler(highresSample, model) {
  return (x, y) => {
    const temperature = highresSample(x, y);
    if (!Number.isFinite(temperature)) return NaN;
    const residual = idwValuesAt(x, y, model.residualStations, (station) => station.downscalingResidual);
    if (!Number.isFinite(residual)) return NaN;
    return Math.min(model.upperBound, Math.max(model.lowerBound, model.intercept + (model.slope * temperature) + residual));
  };
}

async function createLandsatSampler(landsatImagePromise, bounds) {
  const image = await landsatImagePromise;
  const [originX, originY] = image.getOrigin();
  const [resolutionX, resolutionY] = image.getResolution();
  const pixelWidth = Math.abs(resolutionX);
  const pixelHeight = Math.abs(resolutionY);
  const imageWidth = image.getWidth();
  const imageHeight = image.getHeight();
  const fillRadius = 5000;
  const firstColumn = Math.max(0, Math.floor((bounds.xmin - fillRadius - originX) / pixelWidth));
  const lastColumnExclusive = Math.min(imageWidth, Math.ceil((bounds.xmax + fillRadius - originX) / pixelWidth));
  const firstRow = Math.max(0, Math.floor((originY - bounds.ymax - fillRadius) / pixelHeight));
  const lastRowExclusive = Math.min(imageHeight, Math.ceil((originY - bounds.ymin + fillRadius) / pixelHeight));
  if (lastColumnExclusive <= firstColumn || lastRowExclusive <= firstRow) return () => NaN;
  const raster = await image.readRasters({ window: [firstColumn, firstRow, lastColumnExclusive, lastRowExclusive], samples: [0], interleave: true });
  const windowWidth = lastColumnExclusive - firstColumn;
  const windowHeight = lastRowExclusive - firstRow;
  const noData = image.getGDALNoData();
  const validValue = (value) => Number.isFinite(value) && value >= -30 && value <= 70 && (noData === null || value !== noData);
  const bucketSize = 1000;
  const buckets = new Map();
  for (let row = 0; row < windowHeight; row += 1) {
    for (let column = 0; column < windowWidth; column += 1) {
      const value = Number(raster[(row * windowWidth) + column]);
      if (!validValue(value)) continue;
      const x = originX + ((firstColumn + column + 0.5) * pixelWidth);
      const y = originY - ((firstRow + row + 0.5) * pixelHeight);
      const key = `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
      const bucket = buckets.get(key) || [];
      bucket.push({ x, y, value });
      buckets.set(key, bucket);
    }
  }
  return (x, y) => {
    const column = Math.floor((x - originX) / pixelWidth) - firstColumn;
    const row = Math.floor((originY - y) / pixelHeight) - firstRow;
    if (column >= 0 && column < windowWidth && row >= 0 && row < windowHeight) {
      const directValue = Number(raster[(row * windowWidth) + column]);
      if (validValue(directValue)) return directValue;
    }
    const bucketX = Math.floor(x / bucketSize);
    const bucketY = Math.floor(y / bucketSize);
    let nearestDistance2 = fillRadius ** 2;
    let nearestValue = NaN;
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        for (const entry of buckets.get(`${bucketX + dx}:${bucketY + dy}`) || []) {
          const distance2 = ((x - entry.x) ** 2) + ((y - entry.y) ** 2);
          if (distance2 > nearestDistance2) continue;
          nearestDistance2 = distance2;
          nearestValue = entry.value;
        }
      }
    }
    return nearestValue;
  };
}

export function createObservedHazardGridBuilder({ metricsPath, boundariesPath, highresBinaryPath, highresMetadataPath, landsatPath }) {
  let sources = null;
  let landsatImagePromise = null;
  const cache = new Map();
  function loadSources() {
    if (sources) return sources;
    const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
    const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8'));
    const stations = (metrics.stations || []).map((station) => ({
      ...station,
      xy: proj4('EPSG:4326', 'EPSG:5179', [Number(station.longitude), Number(station.latitude)]),
    }));
    const highres = loadHighresGrid(highresBinaryPath, highresMetadataPath);
    const downscalingModels = fitDownscalingModels(stations, highres);
    sources = { metrics, boundaries, highres, downscalingModels };
    return sources;
  }

  return async function buildObservedHazardGrid(searchParams) {
    const regionCode = (searchParams.get('regionCode') || '').trim();
    const indicator = (searchParams.get('indicator') || '').trim().toUpperCase();
    if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be 5 digits');
    if (!/^H(?:0[1-9]|10)$/.test(indicator)) throw new Error('indicator must be H01 through H10');
    const cacheKey = `${regionCode}:${indicator}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const { metrics, boundaries, highres, downscalingModels } = loadSources();
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
    if (!Number.isFinite(cellCount) || cellCount <= 0 || cellCount > 3_000_000) throw new Error(`Region grid is too large (${cellCount} cells)`);

    const bounds = { xmin, ymin, xmax, ymax };
    let sampleValue;
    if (indicator === 'H10') {
      landsatImagePromise ||= fromFile(landsatPath).then((tiff) => tiff.getImage());
      sampleValue = await createLandsatSampler(landsatImagePromise, bounds);
    } else {
      const highresSample = createHighresSampler(highres, bounds);
      sampleValue = indicator === 'H01' ? highresSample : createDownscaledSampler(highresSample, downscalingModels[indicator]);
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
          const value = sampleValue(x, y);
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
    const downscalingModel = downscalingModels[indicator];
    const payload = {
      schemaVersion: 'livinglabs-hazard-grid/v1', indicator, regionCode, gridUnit: '100m', columns, rows,
      extent: bounds,
      transform: { originX: xmin, originY: ymax, pixelWidth: 100, pixelHeight: 100 },
      crs: 'EPSG:5179', valueEncoding: 'sparse-index-value', valueCount: cellCount, sparseValues,
      unit: indicator === 'H10' ? '°C' : metrics.units?.[indicator] || '',
      rawUnit: indicator === 'H10' ? '°C' : metrics.units?.[indicator] || '',
      sourceResolution: indicator === 'H01'
        ? 'KMA 500m 고해상도 관측격자 2021~2025 평균 → EPSG:5179 100m 최근접 정렬'
        : indicator === 'H10'
          ? 'Landsat 2021~2025 여름철 LST P90 전국 EPSG:5179 100m 원격자 · 결측은 5km 이내 최근접 유효 픽셀 보완'
          : 'KMA 500m 평균기온 지형패턴 + ASOS 69개소 지표 잔차보정 → EPSG:5179 100m 정렬',
      observedPeriod: indicator === 'H10' ? '2021-01-01/2025-12-31' : indicator === 'H01' ? highres.metadata.period : metrics.observedPeriod,
      baselinePeriod: indicator === 'H10' ? null : metrics.baselinePeriod,
      ...(downscalingModel ? {
        downscalingMethod: 'OLS temperature-pattern regression plus 8-neighbor IDW station-residual correction',
        downscalingModel: { intercept: Number(downscalingModel.intercept.toFixed(6)), slope: Number(downscalingModel.slope.toFixed(6)), stationCount: downscalingModel.sampleCount },
      } : {}),
      stats: {
        validCells,
        rawMin: Number(rawMin.toFixed(4)), rawMax: Number(rawMax.toFixed(4)), rawMean: Number((rawSum / validCells).toFixed(4)),
        normalizedMean: Number((normalizedSum / validCells).toFixed(6)),
      },
    };
    cache.set(cacheKey, payload);
    return payload;
  };
}