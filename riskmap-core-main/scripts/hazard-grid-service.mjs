import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import GeoTIFF from 'geotiff';
import proj4 from 'proj4';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(projectRoot, '..');
const hazardRoot = resolve(projectRoot, 'data', 'processed', 'hazard');
const boundaryPath = resolve(
  workspaceRoot,
  'shared',
  'data',
  'administrative-regions',
  'boundaries',
  'downloads-sigungu-boundaries.json',
);
const boundaryDocument = JSON.parse(readFileSync(boundaryPath, 'utf8'));
const boundaryFeaturesByCode = boundaryDocument.featuresByCode || {};
const cellSize = 100;

proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs',
);

const indicators = {
  H01: { name: '평균기온', variable: 'ta_avg', futureVariable: 'ta_avg', unit: '℃', observedSource: '500m', futureSource: '500m' },
  H02: { name: '평균최고기온', variable: 'tamax', futureVariable: 'tamax_avg', unit: '℃', observedSource: 'Point (ASOS)', futureSource: '500m' },
  H03: { name: '평균최저기온', variable: 'tamin', futureVariable: 'tamin_avg', unit: '℃', observedSource: 'Point (ASOS)', futureSource: '500m' },
  H04: { name: '폭염일수', variable: 'hw33', unit: '일', observedSource: 'Point (ASOS)', futureSource: '500m' },
  H05: { name: '열대야일수', variable: 'tr25', unit: '일', observedSource: 'Point (ASOS)', futureSource: '500m' },
  H06: { name: '온난일 지속기간 지수(WSDI)', variable: 'wsdi', unit: '일', observedSource: 'Point (ASOS, 1991~2020 기준)', futureSource: '500m' },
  H07: { name: '연최고기온(TXx)', variable: 'txx', unit: '℃', observedSource: 'Point (ASOS)', futureSource: '500m' },
  H08: { name: '고온일 비율(TX90p)', variable: 'tx90p', unit: '일', observedSource: 'Point (ASOS, 1991~2020 기준)', futureSource: '500m' },
  H09: { name: '최대 온난일 지속기간(WSDIx)', variable: 'wsdix', unit: '일', observedSource: 'Point (ASOS, 1991~2020 기준)', futureSource: '500m' },
  H10: { name: '여름철 지표면온도 상위 10%(LST P90)', variable: 'lst_summer_p90', unit: '℃', observedSource: '30m' },
};

const observedFiles = {
  H01: 'H01/observed/2021-2025/h01_ta_avg_2021_2025_mean_100m_national.tif',
  H02: 'H02/observed/2021-2025/h02_tamax_2021_2025_mean_100m_national.tif',
  H03: 'H03/observed/2021-2025/h03_tamin_2021_2025_mean_100m_national.tif',
  H04: 'H04/observed/2021-2025/h04_hw33_2021_2025_mean_100m_national.tif',
  H05: 'H05/observed/2021-2025/h05_tr25_2021_2025_mean_100m_national.tif',
  H06: 'H06/observed/2021-2025/h06_wsdi_2021_2025_mean_100m_national.tif',
  H07: 'H07/observed/2021-2025/h07_txx_2021_2025_mean_100m_national.tif',
  H08: 'H08/observed/2021-2025/h08_tx90p_2021_2025_mean_100m_national.tif',
  H09: 'H09/observed/2021-2025/h09_wsdix_2021_2025_mean_100m_national.tif',
  H10: 'H10/observed/2021-2025/h10_lst_summer_p90_2021_2025_mean_100m_national.tif',
};

const futureScenarios = new Set(['ssp126', 'ssp245', 'ssp370', 'ssp585']);
const futurePeriods = new Set(['2026', '2027', '2028', '2029', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100']);

const rasterCache = new Map();
const gridCache = new Map();
const cacheLimit = 32;

function limitedCacheSet(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
}

function featureEntriesForRegion(regionCode) {
  const direct = boundaryFeaturesByCode[regionCode];
  if (direct) return [[regionCode, direct]];

  let prefix = '';
  if (/^\d{2}000$/.test(regionCode)) prefix = regionCode.slice(0, 2);
  else if (/^\d{4}0$/.test(regionCode)) prefix = regionCode.slice(0, 4);
  if (!prefix) return [];

  return Object.entries(boundaryFeaturesByCode).filter(([code]) => code.startsWith(prefix));
}

function projectRing(ring) {
  return ring.map((coordinate) => proj4('EPSG:4326', 'EPSG:5179', coordinate));
}

function projectGeometry(geometry) {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(projectRing) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => polygon.map(projectRing)),
    };
  }
  throw new Error(`지원하지 않는 행정경계 형식입니다: ${geometry.type}`);
}

function walkCoordinates(value, visitor) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    visitor(value);
    return;
  }
  value.forEach((item) => walkCoordinates(item, visitor));
}

function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  walkCoordinates(geometry.coordinates, ([x, y]) => {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  });
  return bounds;
}

function alignedWindow(bounds, raster) {
  const left = Math.max(0, Math.floor((bounds[0] - raster.originX) / cellSize));
  const top = Math.max(0, Math.floor((raster.originY - bounds[3]) / cellSize));
  const right = Math.min(raster.width, Math.ceil((bounds[2] - raster.originX) / cellSize));
  const bottom = Math.min(raster.height, Math.ceil((raster.originY - bounds[1]) / cellSize));
  return [left, top, right, bottom];
}

function ringColumnRanges(ring, y, originX, columns) {
  const intersections = [];
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[previous];
    const [x2, y2] = ring[index];
    if ((y1 > y) === (y2 > y)) continue;
    intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  intersections.sort((left, right) => left - right);

  const ranges = [];
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const start = Math.max(0, Math.ceil((intersections[index] - originX) / cellSize - 0.5));
    const end = Math.min(columns - 1, Math.floor((intersections[index + 1] - originX) / cellSize - 0.5));
    if (start <= end) ranges.push([start, end]);
  }
  return ranges;
}

function rasterizePolygon(mask, polygon, originX, originY, columns, rows) {
  const outerBounds = geometryBounds({ coordinates: polygon[0] });
  const firstRow = Math.max(0, Math.floor((originY - outerBounds[3]) / cellSize));
  const lastRow = Math.min(rows - 1, Math.ceil((originY - outerBounds[1]) / cellSize));

  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = originY - (row + 0.5) * cellSize;
    ringColumnRanges(polygon[0], y, originX, columns).forEach(([start, end]) => {
      for (let column = start; column <= end; column += 1) mask.add(row * columns + column);
    });
    polygon.slice(1).forEach((hole) => {
      ringColumnRanges(hole, y, originX, columns).forEach(([start, end]) => {
        for (let column = start; column <= end; column += 1) mask.delete(row * columns + column);
      });
    });
  }
}

async function openRaster(filePath) {
  if (!rasterCache.has(filePath)) {
    rasterCache.set(filePath, (async () => {
      const tiff = await GeoTIFF.fromFile(filePath);
      const image = await tiff.getImage();
      const [originX, originY] = image.getOrigin();
      const [pixelWidth, pixelHeight] = image.getResolution();
      return {
        tiff,
        image,
        originX: Number(originX),
        originY: Number(originY),
        pixelWidth: Math.abs(Number(pixelWidth)),
        pixelHeight: Math.abs(Number(pixelHeight)),
        width: image.getWidth(),
        height: image.getHeight(),
        noData: Number(image.getGDALNoData()),
      };
    })());
  }
  return rasterCache.get(filePath);
}

function createRegionContext(regionCode, raster) {
  const entries = featureEntriesForRegion(regionCode);
  if (!entries.length) throw new Error(`행정경계를 찾지 못했습니다: ${regionCode}`);

  const features = entries.map(([code, feature]) => {
    const geometry = projectGeometry(feature.geometry);
    return { code, geometry, bounds: geometryBounds(geometry) };
  });
  const bounds = features.reduce(
    (result, feature) => [
      Math.min(result[0], feature.bounds[0]),
      Math.min(result[1], feature.bounds[1]),
      Math.max(result[2], feature.bounds[2]),
      Math.max(result[3], feature.bounds[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const window = alignedWindow(bounds, raster);
  const columns = window[2] - window[0];
  const rows = window[3] - window[1];
  const originX = raster.originX + window[0] * cellSize;
  const originY = raster.originY - window[1] * cellSize;
  const mask = new Set();

  features.forEach((feature) => {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    polygons.forEach((polygon) => rasterizePolygon(mask, polygon, originX, originY, columns, rows));
  });

  return {
    childCodes: features.map((feature) => feature.code),
    window,
    columns,
    rows,
    originX,
    originY,
    validIndices: [...mask].sort((left, right) => left - right),
  };
}

function sourceFileFor(mode, indicatorCode, scenario, period) {
  const indicator = indicators[indicatorCode];
  const relativePath = mode === 'future'
    ? `${indicatorCode}/scenario/${scenario}/national/${indicatorCode.toLowerCase()}_${indicator.futureVariable || indicator.variable}_${scenario}_${period}_100m_national.tif`
    : observedFiles[indicatorCode];
  if (!relativePath) {
    throw new Error(`${indicatorCode}는 ${mode === 'future' ? '미래 SSP245' : '최근 5년 관측'} 자료가 아직 없습니다.`);
  }
  const filePath = resolve(hazardRoot, relativePath);
  if (!existsSync(filePath)) throw new Error(`전국 원본 GeoTIFF를 찾지 못했습니다: ${relativePath}`);
  return filePath;
}

function readMetadata(filePath) {
  const metadataPath = filePath.replace(/\.tif$/i, '.metadata.json');
  if (!existsSync(metadataPath)) return {};
  return JSON.parse(readFileSync(metadataPath, 'utf8'));
}

export async function buildNationalHazardGrid(searchParams) {
  const regionCode = String(searchParams.get('regionCode') || '').trim();
  const indicatorCode = String(searchParams.get('indicator') || '').trim().toUpperCase();
  const mode = searchParams.get('mode') === 'future' ? 'future' : 'observed';
  const scenario = String(searchParams.get('scenario') || 'ssp245').toLowerCase();
  const period = String(searchParams.get('period') || '2050');
  const cacheKey = `${regionCode}:${mode}:${scenario}:${period}:${indicatorCode}`;
  const cached = gridCache.get(cacheKey);
  if (cached) {
    gridCache.delete(cacheKey);
    gridCache.set(cacheKey, cached);
    return cached;
  }

  if (!/^\d{5}$/.test(regionCode)) throw new Error('올바른 5자리 행정구역 코드가 필요합니다.');
  if (!indicators[indicatorCode]) throw new Error(`지원하지 않는 지표입니다: ${indicatorCode}`);
  if (mode === 'future' && !futureScenarios.has(scenario)) throw new Error(`지원하지 않는 SSP 시나리오입니다: ${scenario}`);
  if (mode === 'future' && !futurePeriods.has(period)) throw new Error(`지원하지 않는 미래 기간입니다: ${period}`);

  const filePath = sourceFileFor(mode, indicatorCode, scenario, period);
  const metadata = readMetadata(filePath);
  const raster = await openRaster(filePath);
  if (raster.pixelWidth !== cellSize || raster.pixelHeight !== cellSize) {
    throw new Error(`${indicatorCode} 원본이 표준 100m 분석격자와 일치하지 않습니다.`);
  }

  const context = createRegionContext(regionCode, raster);
  const rasterValues = await raster.image.readRasters({ window: context.window, interleave: true });
  const sourceMin = Number(metadata.min ?? metadata.statistics?.min);
  const sourceMax = Number(metadata.max ?? metadata.statistics?.max);
  if (!Number.isFinite(sourceMin) || !Number.isFinite(sourceMax) || sourceMax <= sourceMin) {
    throw new Error(`${indicatorCode} 전국 정규화 범위를 확인할 수 없습니다.`);
  }

  const sparseValues = [];
  let rawMin = Infinity;
  let rawMax = -Infinity;
  let rawSum = 0;
  let normalizedSum = 0;
  let validCells = 0;

  context.validIndices.forEach((index) => {
    const raw = Number(rasterValues[index]);
    if (!Number.isFinite(raw) || (Number.isFinite(raster.noData) && raw === raster.noData)) return;
    const normalized = Math.min(1, Math.max(0, (raw - sourceMin) / (sourceMax - sourceMin)));
    sparseValues.push(index, Number(normalized.toFixed(6)));
    rawMin = Math.min(rawMin, raw);
    rawMax = Math.max(rawMax, raw);
    rawSum += raw;
    normalizedSum += normalized;
    validCells += 1;
  });

  if (!validCells) throw new Error(`${regionCode} 행정구역에서 ${indicatorCode} 유효 격자를 찾지 못했습니다.`);

  const indicator = indicators[indicatorCode];
  const grid = {
    id: indicatorCode,
    label: indicator.name,
    indicatorCode,
    regionCode,
    childRegionCodes: context.childCodes,
    datasetType: mode === 'future' ? 'scenario' : 'observed',
    scenario: mode === 'future' ? scenario : null,
    period: mode === 'future' ? period : '2021-2025',
    periodStart: mode === 'future' ? `${metadata.period_start || period}-01-01` : '2021-01-01',
    periodEnd: mode === 'future' ? `${metadata.period_end || period}-12-31` : '2025-12-31',
    gridUnit: '100m',
    analysisResolution: '100m',
    sourceResolution: mode === 'future' ? indicator.futureSource : indicator.observedSource,
    crs: 'EPSG:5179',
    columns: context.columns,
    rows: context.rows,
    extent: {
      xmin: context.originX,
      ymin: context.originY - context.rows * cellSize,
      xmax: context.originX + context.columns * cellSize,
      ymax: context.originY,
    },
    transform: {
      originX: context.originX,
      originY: context.originY,
      pixelWidth: cellSize,
      pixelHeight: cellSize,
    },
    rawUnit: indicator.unit,
    valueEncoding: 'sparse-index-value',
    valueCount: context.columns * context.rows,
    sparseValues,
    normalizationMethod: 'national-minmax',
    normalizationSourceRange: { min: sourceMin, max: sourceMax },
    qualityStatus: metadata.quality_status || 'NATIONAL_100M_GRID',
    stats: {
      validCells,
      boundaryCells: context.validIndices.length,
      rawMin: Number(rawMin.toFixed(4)),
      rawMax: Number(rawMax.toFixed(4)),
      rawMean: Number((rawSum / validCells).toFixed(4)),
      normalizedMean: Number((normalizedSum / validCells).toFixed(6)),
    },
  };

  limitedCacheSet(gridCache, cacheKey, grid);
  return grid;
}
