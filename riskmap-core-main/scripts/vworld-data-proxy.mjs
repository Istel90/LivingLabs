import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as h5wasm from 'h5wasm/node';
import proj4 from 'proj4';
import pg from 'pg';

const { Pool } = pg;

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(root, '..');
const handoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'priority-handoffs.json');
const responsibleHandoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-handoffs.json');
const responsibleReviewStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-review-responses.json');
const devResetStatePath = resolve(workspaceRoot, '.runtime-logs', 'dev-reset-state.json');
const envPath = resolve(root, '.env.local');
const env = {};

try {
  const content = readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const cleanLine = line.replace(/^\uFEFF/, '');
    const match = cleanLine.match(/^([^#=\s]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });
} catch {
  // The proxy can still start, but VWorld requests will return a clear error.
}

const apiKey = env.VITE_VWORLD_API_KEY || '';
const kmaApiKey = env.KMA_API_KEY || '';
const domain = env.VITE_VWORLD_DOMAIN || 'http://127.0.0.1:5175/';
const allowInsecureTls = env.VWORLD_ALLOW_INSECURE_TLS === 'true' || process.env.VWORLD_ALLOW_INSECURE_TLS === 'true';
const httpsAgent = allowInsecureTls ? new HttpsAgent({ rejectUnauthorized: false }) : undefined;
const port = Number(process.env.VWORLD_PROXY_PORT || process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 5176);
const staticRootArgument = process.argv.find((arg) => arg.startsWith('--static-root='))?.slice('--static-root='.length);
const staticRoot = staticRootArgument ? resolve(workspaceRoot, staticRootArgument) : '';
const cadastrePool = new Pool({
  host: process.argv.find((arg) => arg.startsWith('--postgis-host='))?.split('=')[1] || process.env.VWORLD_POSTGIS_HOST || env.VWORLD_POSTGIS_HOST || '127.0.0.1',
  port: Number(process.argv.find((arg) => arg.startsWith('--postgis-port='))?.split('=')[1] || process.env.VWORLD_POSTGIS_PORT || env.VWORLD_POSTGIS_PORT || 55432),
  database: process.argv.find((arg) => arg.startsWith('--postgis-database='))?.split('=')[1] || process.env.VWORLD_POSTGIS_DATABASE || env.VWORLD_POSTGIS_DATABASE || 'vworld_cadastral',
  user: process.argv.find((arg) => arg.startsWith('--postgis-user='))?.split('=')[1] || process.env.VWORLD_POSTGIS_USER || env.VWORLD_POSTGIS_USER || 'postgres',
  password: process.env.VWORLD_POSTGIS_PASSWORD || env.VWORLD_POSTGIS_PASSWORD || undefined,
  max: 4,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
});

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.nc': 'application/x-netcdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(response, status, body, contentType = 'application/json; charset=utf-8', cacheControl = 'no-store') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
  });
  response.end(body);
}

function featureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(({ geometry, ...properties }) => ({
      type: 'Feature',
      id: properties.pnu,
      geometry: typeof geometry === 'string' ? JSON.parse(geometry) : geometry,
      properties,
    })),
  };
}

async function fetchCadastreParcel(searchParams) {
  const pnu = (searchParams.get('pnu') || '').trim();
  if (!/^\d{19}$/.test(pnu)) throw new Error('pnu must be exactly 19 digits');

  const result = await cadastrePool.query({
    text: `
      SELECT pnu, legal_dong_code, legal_dong_name, lot_number,
             lot_number_land_category, reference_date, sigungu_code,
             ST_AsGeoJSON(ST_Transform(geom, 4326), 7) AS geometry
      FROM cadastre.parcels_readable
      WHERE pnu = $1
      LIMIT 10
    `,
    values: [pnu],
  });
  return featureCollection(result.rows);
}

async function fetchCadastreBbox(searchParams) {
  const bbox = (searchParams.get('bbox') || '').split(',').map(Number);
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    throw new Error('bbox must be minLng,minLat,maxLng,maxLat');
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (minLng >= maxLng || minLat >= maxLat || minLng < 124 || maxLng > 132 || minLat < 32 || maxLat > 39.5) {
    throw new Error('bbox must be a valid extent within Korea');
  }
  if ((maxLng - minLng) * (maxLat - minLat) > 0.04) {
    throw new Error('bbox is too large; zoom in before requesting parcels');
  }

  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 1000);
  const offset = Math.min(Math.max(Number.parseInt(searchParams.get('offset') || '0', 10) || 0, 0), 100000);
  const simplifyMeters = Math.min(Math.max(Number(searchParams.get('simplifyMeters') || 0) || 0, 0), 20);
  const result = await cadastrePool.query({
    text: `
      WITH bounds AS (
        SELECT ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 5186) AS geom
      )
      SELECT p.pnu, p.legal_dong_code, p.legal_dong_name, p.lot_number,
             p.lot_number_land_category, p.reference_date, p.sigungu_code,
             ST_AsGeoJSON(
               ST_Transform(
                  CASE WHEN $6::double precision > 0 THEN ST_SimplifyPreserveTopology(p.geom, $6::double precision) ELSE p.geom END,
                 4326
               ), 7
             ) AS geometry
      FROM cadastre.parcels_readable p
      CROSS JOIN bounds b
      -- The browser performs the final parcel-to-hotspot geometry intersection.
      -- Keep this lookup index-only so nationwide candidate retrieval stays fast.
      WHERE p.geom && b.geom
      ORDER BY p.pnu
      LIMIT $5 OFFSET $7
    `,
    values: [minLng, minLat, maxLng, maxLat, limit + 1, simplifyMeters, offset],
  });
  const hasMore = result.rows.length > limit;
  return {
    ...featureCollection(result.rows.slice(0, limit)),
    metadata: { limit, offset, hasMore },
  };
}

const populationGridCache = new Map();

function rememberPopulationGrid(key, payload) {
  if (populationGridCache.has(key)) populationGridCache.delete(key);
  populationGridCache.set(key, payload);
  while (populationGridCache.size > 40) {
    populationGridCache.delete(populationGridCache.keys().next().value);
  }
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return sortedValues[lowerIndex] + ((sortedValues[upperIndex] - sortedValues[lowerIndex]) * weight);
}

async function fetchPopulationGrid(searchParams) {
  const regionCode = (searchParams.get('regionCode') || '').trim();
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');

  const indicator = (searchParams.get('indicator') || '').trim().toLowerCase();
  const indicatorConfig = {
    elderly: { column: 'elderly_count', label: '고령인구 수' },
    infant: { column: 'infant_count', label: '유아인구 수' },
  }[indicator];
  if (!indicatorConfig) throw new Error('indicator must be elderly or infant');

  const monthParameter = (searchParams.get('month') || '').trim();
  let referenceMonth = null;
  if (monthParameter) {
    const normalizedMonth = /^\d{4}-\d{2}$/.test(monthParameter) ? `${monthParameter}-01` : monthParameter;
    if (!/^\d{4}-\d{2}-01$/.test(normalizedMonth)) throw new Error('month must be yyyy-MM or yyyy-MM-01');
    referenceMonth = normalizedMonth;
  }

  const cacheKey = `${regionCode}:${indicator}:${referenceMonth || 'latest'}`;
  const cached = populationGridCache.get(cacheKey);
  if (cached) return cached;

  const targetMonthSql = `
    SELECT COALESCE($2::date, max(reference_month)) AS reference_month
    FROM population.grid_100m
  `;
  const metaSql = `
    WITH target_month AS (${targetMonthSql}), regional_meta AS (
      SELECT payload
      FROM analysis.region_indicator_stats
      WHERE region_code = $1
      ORDER BY (indicator_code = 'H01') DESC, updated_at DESC
      LIMIT 1
    )
    SELECT to_char(t.reference_month, 'YYYY-MM-DD') AS reference_month,
           (SELECT count(*) FROM analysis.region_grid_cells_100m WHERE region_code = $1)::integer AS region_cells,
           m.payload AS grid_meta
    FROM target_month t
    LEFT JOIN regional_meta m ON true
  `;
  const valueSql = `
    WITH target_month AS (${targetMonthSql})
    SELECT r.cell_index, p.${indicatorConfig.column} AS value
    FROM target_month t
    JOIN population.grid_100m p
      ON p.reference_month = t.reference_month
     AND p.${indicatorConfig.column} IS NOT NULL
    JOIN analysis.region_grid_cells_100m r
      ON r.region_code = $1
     AND r.cell_id = p.cell_id
    ORDER BY r.cell_index
  `;
  const queryValues = [regionCode, referenceMonth];
  const [metaResult, valueResult] = await Promise.all([
    cadastrePool.query({ text: metaSql, values: queryValues }),
    cadastrePool.query({ text: valueSql, values: queryValues }),
  ]);

  const meta = metaResult.rows[0];
  if (!meta?.reference_month) throw new Error('population grid is not loaded');
  if (!Number(meta.region_cells)) throw new Error(`regionCode is not available: ${regionCode}`);

  const gridMeta = typeof meta.grid_meta === 'string' ? JSON.parse(meta.grid_meta) : meta.grid_meta;
  if (!gridMeta?.extent || !gridMeta?.transform) throw new Error(`region grid metadata is not available: ${regionCode}`);
  const xmin = Number(gridMeta.extent.xmin);
  const ymin = Number(gridMeta.extent.ymin);
  const xmax = Number(gridMeta.extent.xmax);
  const ymax = Number(gridMeta.extent.ymax);
  const columns = Number(gridMeta.columns);
  const rows = Number(gridMeta.rows);
  const cellCount = columns * rows;
  if (!Number.isSafeInteger(cellCount) || cellCount <= 0 || cellCount > 2_500_000) {
    throw new Error(`region grid is too large: ${cellCount} cells`);
  }

  const rawValues = valueResult.rows.map((row) => Number(row.value)).filter(Number.isFinite);
  const logValues = rawValues.map((value) => Math.log1p(Math.max(0, value))).sort((a, b) => a - b);
  const lower = percentile(logValues, 0.02) ?? 0;
  const upper = percentile(logValues, 0.98) ?? lower;
  const range = Math.max(upper - lower, Number.EPSILON);
  const sparseValues = [];
  let rawSum = 0;
  let normalizedSum = 0;
  let rawMin = Infinity;
  let rawMax = -Infinity;

  valueResult.rows.forEach((row) => {
    const value = Number(row.value);
    if (!Number.isFinite(value)) return;
    const index = Number(row.cell_index);
    if (!Number.isInteger(index) || index < 0 || index >= cellCount) return;
    const normalized = Math.min(1, Math.max(0, (Math.log1p(Math.max(0, value)) - lower) / range));
    sparseValues.push(index, Number(normalized.toFixed(6)));
    rawSum += value;
    normalizedSum += normalized;
    rawMin = Math.min(rawMin, value);
    rawMax = Math.max(rawMax, value);
  });

  const validCells = sparseValues.length / 2;
  const payload = {
    schemaVersion: 'population-grid/v1',
    indicator,
    label: indicatorConfig.label,
    regionCode,
    referenceMonth: String(meta.reference_month).slice(0, 10),
    gridUnit: '100m',
    crs: 'EPSG:5179',
    rows,
    columns,
    valueCount: cellCount,
    valueEncoding: 'sparse-index-value',
    extent: { xmin, ymin, xmax, ymax },
    transform: { originX: xmin, originY: ymax, pixelWidth: 100, pixelHeight: 100 },
    sparseValues,
    rawUnit: '명/100m 셀',
    unit: '정규화 점수',
    sourceResolution: '국토정보플랫폼 국토통계 100m 격자',
    normalization: {
      method: 'local-log1p-p02-p98',
      lowerRaw: Number(Math.expm1(lower).toFixed(3)),
      upperRaw: Number(Math.expm1(upper).toFixed(3)),
    },
    stats: {
      regionCells: Number(meta.region_cells),
      validCells,
      rawMin: validCells ? rawMin : null,
      rawMax: validCells ? rawMax : null,
      rawMean: validCells ? Number((rawSum / validCells).toFixed(4)) : null,
      normalizedMean: validCells ? Number((normalizedSum / validCells).toFixed(6)) : null,
      mean: validCells ? Number((normalizedSum / validCells).toFixed(6)) : null,
    },
  };

  rememberPopulationGrid(cacheKey, payload);
  return payload;
}

async function fetchHazardGrid(searchParams) {
  const regionCode = (searchParams.get('regionCode') || '').trim();
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');

  const indicator = (searchParams.get('indicator') || '').trim().toUpperCase();
  if (!/^H(0[1-9]|10)$/.test(indicator)) throw new Error('indicator must be H01 through H10');
  const mode = (searchParams.get('mode') || 'observed').trim().toLowerCase();
  if (mode !== 'observed') throw new Error('future hazard grid is not loaded in this endpoint');

  const column = indicator.toLowerCase();
  const metaResult = await cadastrePool.query({
    text: `
      SELECT s.payload, s.version_id
      FROM analysis.region_indicator_stats s
      JOIN analysis.hev_dataset_versions v
        ON v.version_id = s.version_id
       AND v.active
      WHERE s.region_code = $1 AND s.indicator_code = $2
      ORDER BY s.updated_at DESC
      LIMIT 1
    `,
    values: [regionCode, indicator],
  });
  const metaRow = metaResult.rows[0];
  if (!metaRow) throw new Error(`hazard grid is not available: ${regionCode} ${indicator}`);

  const gridMeta = typeof metaRow.payload === 'string' ? JSON.parse(metaRow.payload) : metaRow.payload;
  const valueResult = await cadastrePool.query({
    text: `
      SELECT r.cell_index, v.${column} AS value
      FROM analysis.region_grid_cells_100m r
      JOIN analysis.hev_values_100m v
        ON v.version_id = $2
       AND v.cell_id = r.cell_id
      WHERE r.region_code = $1 AND v.${column} IS NOT NULL
      ORDER BY r.cell_index
    `,
    values: [regionCode, metaRow.version_id],
  });

  const lower = Number(gridMeta?.stats?.rawMin);
  const upper = Number(gridMeta?.stats?.rawMax);
  const range = Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ? upper - lower : 1;
  const valueCount = Number(gridMeta.valueCount) || (Number(gridMeta.rows) * Number(gridMeta.columns));
  const sparseValues = [];
  valueResult.rows.forEach((row) => {
    const index = Number(row.cell_index);
    const value = Number(row.value);
    if (!Number.isInteger(index) || index < 0 || index >= valueCount || !Number.isFinite(value)) return;
    sparseValues.push(index, Number(Math.min(1, Math.max(0, (value - lower) / range)).toFixed(6)));
  });

  return {
    ...gridMeta,
    schemaVersion: 'livinglabs-hazard-grid/v1',
    valueEncoding: 'sparse-index-value',
    valueCount,
    sparseValues,
  };
}

const regionalAnalysisGridCache = new Map();

const regionalAnalysisIndicators = {
  'terrain-low-elevation': {
    rasterTable: 'analysis.terrain_elevation_100m', label: '저지대 지형', rawUnit: 'm',
    sourceResolution: '전국 DEM 표고를 EPSG:5179 100m로 정렬 · 낮은 표고일수록 위험 점수 증가', normalization: 'linear', invert: true,
  },
  'terrain-low-slope': {
    rasterTable: 'analysis.terrain_slope_100m', label: '저경사 지형', rawUnit: '도',
    sourceResolution: '전국 DEM 경사를 EPSG:5179 100m로 파생 · 낮은 경사일수록 위험 점수 증가', normalization: 'linear', invert: true,
  },
  'terrain-twi': {
    rasterTable: 'analysis.terrain_twi_100m', label: '지형습윤지수 TWI', rawUnit: '지수',
    sourceResolution: '전국 DEM 기반 지형습윤지수 · EPSG:5179 100m', normalization: 'linear',
  },
  'terrain-flow-accumulation': {
    rasterTable: 'analysis.terrain_flow_accumulation_100m', label: '유로 누적량', rawUnit: '셀',
    sourceResolution: '전국 DEM 기반 유로 누적량 · EPSG:5179 100m', normalization: 'log1p',
  },
  'terrain-depression-depth': {
    rasterTable: 'analysis.terrain_depression_depth_100m', label: '지형 함몰 깊이', rawUnit: 'm',
    sourceResolution: '전국 DEM 기반 함몰 깊이 · EPSG:5179 100m', normalization: 'linear',
  },
  'rain-max-1h': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'max_1h_mm', label: '1시간 최대강우량',
    rawUnit: 'mm', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 극값 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'rain-max-3h': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'max_3h_mm', label: '3시간 최대강우량',
    rawUnit: 'mm', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 극값 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'rain-max-6h': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'max_6h_mm', label: '6시간 최대강우량',
    rawUnit: 'mm', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 극값 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'rain-max-daily': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'max_daily_mm', label: '일 최대강우량',
    rawUnit: 'mm', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 극값 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'rain-days-50mm': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'rain_days_50mm', label: '50mm 이상 강우일수',
    rawUnit: '일', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 통계 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'rain-days-80mm': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'heavy_rain_days_80mm', label: '80mm 이상 호우일수',
    rawUnit: '일', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측소 통계 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'building-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'building_count', label: '건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 전국 원자료 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-residential-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'residential_building_count', label: '주거용 건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 전국 원자료 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-one-story-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'one_story_building_count', label: '1층 건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 전국 원자료 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-basement-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'basement_building_count', label: '지하층 보유 건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 전국 원자료 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-old-30y-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'old_30y_building_count', label: '30년 이상 건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 사용승인일 기준 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-old-30y-ratio': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'old_30y_ratio_known', label: '30년 이상 건축물 비율',
    rawUnit: '비율', sourceResolution: 'VWorld GIS 건물통합정보 중 사용승인일 확인 건축물 기준 · EPSG:5179 100m 셀 집계', normalization: 'linear', zeroFill: true,
  },
  'facility-bus-stop': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'national_bus_stop_20251031', label: '버스정류장 수',
    rawUnit: '개/100m 셀', sourceResolution: '국토교통부 전국 버스정류장 위치정보 2025-10-31 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'facility-crosswalk': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'national_crosswalk_standard', label: '횡단보도 수',
    rawUnit: '개/100m 셀', sourceResolution: '공공데이터포털 전국횡단보도표준데이터 · 부산·대구·세종 보완 필요 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'facility-shelter': {
    pointTable: 'analysis.civil_defense_shelter_points', sourceKey: 'civil_defense_shelter',
    kernelBandwidthMeters: 400, kernelMethod: 'quartic', label: '민방위 대피시설 400m 커널밀도',
    rawUnit: '개/km²', sourceResolution: '행정안전부 전국 민방위 대피시설 현행 원본 · 사용 중 시설 17,228개 · EPSG:5179 100m 격자 · quartic kernel 400m', normalization: 'linear', zeroFill: true,
  },
  'facility-rail-station': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'urban_rail_station', label: '도시철도 역사 수',
    rawUnit: '개/100m 셀', sourceResolution: '전국 도시철도 역사 851개 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
};

function rememberRegionalAnalysisGrid(key, payload) {
  if (regionalAnalysisGridCache.has(key)) regionalAnalysisGridCache.delete(key);
  regionalAnalysisGridCache.set(key, payload);
  while (regionalAnalysisGridCache.size > 80) {
    regionalAnalysisGridCache.delete(regionalAnalysisGridCache.keys().next().value);
  }
}

async function fetchRegionalGridMeta(regionCode) {
  const result = await cadastrePool.query({
    text: `
      SELECT payload
      FROM (
        SELECT payload, 1 AS priority, updated_at
        FROM analysis.region_indicator_stats
        WHERE region_code = $1 AND indicator_code = 'H01'
        UNION ALL
        SELECT payload, 2 AS priority, updated_at
        FROM analysis.flood_region_indicator_stats
        WHERE region_code = $1 AND indicator_code = 'FH01'
      ) available
      ORDER BY priority, updated_at DESC
      LIMIT 1
    `,
    values: [regionCode],
  });
  const payload = result.rows[0]?.payload;
  return typeof payload === 'string' ? JSON.parse(payload) : payload;
}

async function fetchRegionalAnalysisGrid(searchParams) {
  const regionCode = (searchParams.get('regionCode') || '').trim();
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');
  const indicator = (searchParams.get('indicator') || '').trim().toLowerCase();
  const config = regionalAnalysisIndicators[indicator];
  if (!config) throw new Error('analysis indicator is not available');

  const cacheKey = `${regionCode}:${indicator}`;
  const cached = regionalAnalysisGridCache.get(cacheKey);
  if (cached) return cached;

  const gridMeta = await fetchRegionalGridMeta(regionCode);
  const columns = Number(gridMeta?.columns);
  const rows = Number(gridMeta?.rows);
  const valueCount = Number(gridMeta?.valueCount) || columns * rows;
  if (!gridMeta?.extent || !gridMeta?.transform || !Number.isSafeInteger(valueCount) || valueCount <= 0) {
    throw new Error(`region grid metadata is not available: ${regionCode}`);
  }

  let result;
  if (config.pointTable && config.kernelBandwidthMeters) {
    result = await cadastrePool.query({
      text: `
        WITH regional_centers AS (
          SELECT regional.cell_index,
                 ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179) AS center
          FROM analysis.region_grid_cells_100m regional
          JOIN analysis.grid_cells_100m cells ON cells.cell_id = regional.cell_id
          WHERE regional.region_code = $1
        )
        SELECT regional.cell_index,
               COALESCE(
                 SUM(
                   (3.0 / (pi() * $2 * $2))
                   * power(1 - power(ST_Distance(regional.center, source.geom) / $2, 2), 2)
                   * 1000000.0
                 ),
                 0
               ) AS value
        FROM regional_centers regional
        LEFT JOIN ${config.pointTable} source
          ON source.source_key = $3
         AND source.open_yn = 'Y'
         AND source.geom && ST_Expand(regional.center, $2)
         AND ST_DWithin(regional.center, source.geom, $2)
        GROUP BY regional.cell_index
        ORDER BY regional.cell_index
      `,
      values: [regionCode, config.kernelBandwidthMeters, config.sourceKey],
    });
  } else if (config.rasterTable) {
    result = await cadastrePool.query({
      text: `
        SELECT regional.cell_index,
               ST_Value(source.rast, 1, ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179)) AS value
        FROM analysis.region_grid_cells_100m regional
        JOIN analysis.grid_cells_100m cells ON cells.cell_id = regional.cell_id
        JOIN ${config.rasterTable} source
          ON ST_ConvexHull(source.rast) && ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179)
         AND ST_Intersects(source.rast, ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179))
        WHERE regional.region_code = $1
        ORDER BY regional.cell_index
      `,
      values: [regionCode],
    });
  } else {
    const sourceFilter = config.sourceKey ? 'AND source.source_key = $2' : '';
    const zeroExpression = config.zeroFill ? `COALESCE(source.${config.column}, 0)` : `source.${config.column}`;
    const values = config.sourceKey ? [regionCode, config.sourceKey] : [regionCode];
    result = await cadastrePool.query({
      text: `
        SELECT regional.cell_index, ${zeroExpression} AS value
        FROM analysis.region_grid_cells_100m regional
        LEFT JOIN ${config.table} source
          ON source.cell_id = regional.cell_id
         ${sourceFilter}
        WHERE regional.region_code = $1
        ORDER BY regional.cell_index
      `,
      values,
    });
  }

  let pointFeatureCollection = null;
  if (config.pointTable) {
    const pointResult = await cadastrePool.query({
      text: `
        WITH region_centers AS (
          SELECT cells.geom
          FROM analysis.region_grid_cells_100m regional
          JOIN analysis.grid_cells_100m cells ON cells.cell_id = regional.cell_id
          WHERE regional.region_code = $1
        ),
        regional_points AS (
          SELECT DISTINCT ON (source.shelter_id)
                 source.shelter_id, source.name, source.road_address,
                 source.parcel_address, source.capacity, source.geom
          FROM region_centers cells
          JOIN ${config.pointTable} source
            ON source.geom && ST_Expand(cells.geom, 71)
           AND ST_DWithin(cells.geom, source.geom, 71)
          WHERE source.source_key = $2
            AND source.open_yn = 'Y'
          ORDER BY source.shelter_id
        )
        SELECT jsonb_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(jsonb_agg(jsonb_build_object(
            'type', 'Feature',
            'id', shelter_id,
            'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326), 7)::jsonb,
            'properties', jsonb_build_object(
              'shelterId', shelter_id,
              'name', name,
              'address', COALESCE(road_address, parcel_address),
              'capacity', capacity
            )
          )), '[]'::jsonb)
        ) AS collection
        FROM regional_points
      `,
      values: [regionCode, config.sourceKey],
    });
    pointFeatureCollection = pointResult.rows[0]?.collection || null;
  }

  const rowsWithValues = result.rows
    .map((row) => ({ index: Number(row.cell_index), value: Number(row.value) }))
    .filter((row) => Number.isInteger(row.index) && row.index >= 0 && row.index < valueCount && Number.isFinite(row.value));
  if (!rowsWithValues.length) throw new Error(`analysis grid is not available: ${regionCode} ${indicator}`);

  const transformedValues = rowsWithValues.map((row) => (
    config.normalization === 'log1p' ? Math.log1p(Math.max(0, row.value)) : row.value
  )).sort((left, right) => left - right);
  const positiveTransformedValues = config.zeroFill
    ? transformedValues.filter((value) => value > 0)
    : transformedValues;
  const lower = config.zeroFill ? 0 : (percentile(transformedValues, 0.02) ?? 0);
  const upper = percentile(positiveTransformedValues, 0.98) ?? lower;
  const range = Math.max(upper - lower, Number.EPSILON);
  const sparseValues = [];
  let rawSum = 0;
  let normalizedSum = 0;
  let rawMin = Infinity;
  let rawMax = -Infinity;
  rowsWithValues.forEach((row) => {
    const transformed = config.normalization === 'log1p' ? Math.log1p(Math.max(0, row.value)) : row.value;
    const scaled = upper > lower ? Math.min(1, Math.max(0, (transformed - lower) / range)) : 0;
    const normalized = config.invert ? 1 - scaled : scaled;
    sparseValues.push(row.index, Number(normalized.toFixed(6)));
    rawSum += row.value;
    normalizedSum += normalized;
    rawMin = Math.min(rawMin, row.value);
    rawMax = Math.max(rawMax, row.value);
  });

  const validCells = rowsWithValues.length;
  const rawLower = config.normalization === 'log1p' ? Math.expm1(lower) : lower;
  const rawUpper = config.normalization === 'log1p' ? Math.expm1(upper) : upper;
  const payload = {
    schemaVersion: 'livinglabs-analysis-grid/v1',
    indicator,
    label: config.label,
    regionCode,
    gridUnit: '100m',
    crs: 'EPSG:5179',
    rows,
    columns,
    valueCount,
    valueEncoding: 'sparse-index-value',
    extent: gridMeta.extent,
    transform: gridMeta.transform,
    sparseValues,
    rawUnit: config.rawUnit,
    unit: '정규화 점수',
    sourceResolution: config.sourceResolution,
    spatialMethod: config.kernelMethod || null,
    bandwidthMeters: config.kernelBandwidthMeters || null,
    pointFeatureCollection,
    pointFeatureCount: pointFeatureCollection?.features?.length || 0,
    normalization: {
      method: `local-${config.normalization}-p02-p98`,
      lowerRaw: Number(rawLower.toFixed(4)),
      upperRaw: Number(rawUpper.toFixed(4)),
    },
    stats: {
      regionCells: valueCount,
      validCells,
      rawMin,
      rawMax,
      rawMean: Number((rawSum / validCells).toFixed(4)),
      normalizedMean: Number((normalizedSum / validCells).toFixed(6)),
      mean: Number((normalizedSum / validCells).toFixed(6)),
    },
  };
  rememberRegionalAnalysisGrid(cacheKey, payload);
  return payload;
}

async function fetchFloodGrid(searchParams) {
  const regionCode = (searchParams.get('regionCode') || '').trim();
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');
  const indicator = (searchParams.get('indicator') || '').trim().toUpperCase();
  const columns = { FH01: 'fh01', FH02: 'fh02', FH03: 'fh03', FE01: 'fe01', FE02: 'fe02', FE03: 'fe03', UF50: 'uf50', UF80: 'uf80', UF100: 'uf100' };
  const column = columns[indicator];
  if (!column) throw new Error('indicator must be FH01 through FH03, FE01 through FE03, or UF50/UF80/UF100');

  const metaResult = await cadastrePool.query({
    text: `
      SELECT stats.payload, stats.version_id
      FROM analysis.flood_region_indicator_stats stats
      JOIN analysis.flood_dataset_versions versions
        ON versions.version_id = stats.version_id
       AND versions.active
      WHERE stats.region_code = $1 AND stats.indicator_code = $2
      ORDER BY stats.updated_at DESC
      LIMIT 1
    `,
    values: [regionCode, indicator],
  });
  const metaRow = metaResult.rows[0];
  if (!metaRow) throw new Error(`flood grid is not available: ${regionCode} ${indicator}`);
  const gridMeta = typeof metaRow.payload === 'string' ? JSON.parse(metaRow.payload) : metaRow.payload;
  const valueResult = await cadastrePool.query({
    text: `
      SELECT regional.cell_index, values.${column} AS value
      FROM analysis.region_grid_cells_100m regional
      JOIN analysis.flood_values_100m values
        ON values.version_id = $2
       AND values.cell_id = regional.cell_id
      WHERE regional.region_code = $1 AND values.${column} IS NOT NULL
      ORDER BY regional.cell_index
    `,
    values: [regionCode, metaRow.version_id],
  });
  const lower = Number(gridMeta?.stats?.rawMin);
  const upper = Number(gridMeta?.stats?.rawMax);
  const range = Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ? upper - lower : 1;
  const valueCount = Number(gridMeta.valueCount) || Number(gridMeta.rows) * Number(gridMeta.columns);
  const sparseValues = [];
  valueResult.rows.forEach((row) => {
    const index = Number(row.cell_index);
    const value = Number(row.value);
    if (!Number.isInteger(index) || index < 0 || index >= valueCount || !Number.isFinite(value)) return;
    sparseValues.push(index, Number(Math.min(1, Math.max(0, (value - lower) / range)).toFixed(6)));
  });
  return { ...gridMeta, schemaVersion: 'livinglabs-flood-grid/v1', valueEncoding: 'sparse-index-value', valueCount, sparseValues };
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(data ? JSON.parse(data) : null);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function readHandoffStore(storePath = handoffStorePath) {
  try {
    if (!existsSync(storePath)) return {};
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHandoffStore(store, storePath = handoffStorePath) {
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function resetDevStores() {
  writeHandoffStore({}, handoffStorePath);
  writeHandoffStore({}, responsibleHandoffStorePath);
  writeHandoffStore({}, responsibleReviewStorePath);
  writeHandoffStore({ resetAt: new Date().toISOString() }, devResetStatePath);
}

async function handleStoredHandoffRoute(request, response, url, { storePath, schemaVersion }) {
  if (request.method === 'GET') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    send(response, 200, JSON.stringify({
      ok: true,
      payload: regionCode ? store[regionCode] || null : null,
    }));
    return true;
  }

  if (request.method === 'POST') {
    try {
      const payload = await readJsonBody(request);
      if (!payload?.regionCode || payload?.schemaVersion !== schemaVersion) {
        send(response, 400, JSON.stringify({ ok: false, error: `Invalid ${schemaVersion} payload` }));
        return true;
      }
      const store = readHandoffStore(storePath);
      store[payload.regionCode] = {
        ...payload,
        storedAt: new Date().toISOString(),
      };
      writeHandoffStore(store, storePath);
      send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
    }
    return true;
  }

  if (request.method === 'DELETE') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    if (regionCode) delete store[regionCode];
    writeHandoffStore(store, storePath);
    send(response, 200, JSON.stringify({ ok: true, regionCode }));
    return true;
  }

  return false;
}

function fetchVWorldData(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!apiKey) {
      reject(new Error('Missing VITE_VWORLD_API_KEY'));
      return;
    }

    const url = new URL('https://api.vworld.kr/req/data');
    const query = {
      service: 'data',
      version: '2.0',
      request: 'GetFeature',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
      crs: 'EPSG:4326',
      size: '1000',
      page: '1',
    };

    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    for (const [key, value] of searchParams.entries()) {
      if (!['key', 'domain'].includes(key)) url.searchParams.set(key, value);
    }
    url.searchParams.set('key', apiKey);
    url.searchParams.set('domain', domain);

    const request = httpsRequest(url, { method: 'GET', timeout: 20000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('VWorld request timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

function fetchKmaObservation(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/awsh.php');
    const latestCompletedHour = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 13).replace(/[-T:]/g, '') + '00';
    url.searchParams.set('tm', searchParams.get('tm') || latestCompletedHour);
    url.searchParams.set('stn', searchParams.get('stn') || '119');
    url.searchParams.set('help', '0');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 20000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveStaticFile(rootPath, relativePath) {
  const safeRoot = resolve(rootPath);
  const requestedPath = resolve(safeRoot, `.${relativePath}`);
  if (requestedPath !== safeRoot && !requestedPath.startsWith(`${safeRoot}\\`) && !requestedPath.startsWith(`${safeRoot}/`)) {
    return '';
  }

  if (isFile(requestedPath)) return requestedPath;
  if (isFile(join(requestedPath, 'index.html'))) return join(requestedPath, 'index.html');
  if (!extname(requestedPath) && isFile(`${requestedPath}.html`)) return `${requestedPath}.html`;
  return '';
}

function serveStatic(request, response, url) {
  if (!staticRoot || !['GET', 'HEAD'].includes(request.method || 'GET')) return false;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }

  let appRoot = staticRoot;
  let relativePath = pathname;
  let fallback = join(staticRoot, 'index.html');

  if (pathname === '/internal-tools' || pathname.startsWith('/internal-tools/')) {
    appRoot = join(staticRoot, 'internal-tools');
    relativePath = pathname.slice('/internal-tools'.length) || '/';
    fallback = '';
  } else if (pathname === '/survey' || pathname.startsWith('/survey/')) {
    appRoot = join(staticRoot, 'survey');
    relativePath = pathname.slice('/survey'.length) || '/';
    fallback = join(appRoot, 'index.html');
  } else if (pathname.startsWith('/analysis-data/') || pathname.startsWith('/indicator-icons/')) {
    appRoot = join(staticRoot, 'internal-tools');
    fallback = '';
  }

  const filePath = resolveStaticFile(appRoot, relativePath) || (fallback && isFile(fallback) ? fallback : '');
  if (!filePath) return false;

  response.writeHead(200, {
    'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
  });
  if (request.method === 'HEAD') {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

function fetchKmaLstList(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const now = new Date();
    now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const formatUtc = (date) => date.toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const area = String(searchParams.get('area') || 'KO').toUpperCase();
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/dataList`);
    url.searchParams.set('sDate', searchParams.get('sDate') || formatUtc(start));
    url.searchParams.set('eDate', searchParams.get('eDate') || formatUtc(now));
    url.searchParams.set('format', 'json');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA LST request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function fetchKmaLstFileList(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const now = new Date();
    now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
    const requestedTime = searchParams.get('tm') || now.toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/sat_file_list.php');
    url.searchParams.set('sat', 'GK2A');
    url.searchParams.set('vars', 'L2');
    url.searchParams.set('area', String(searchParams.get('area') || 'KO').toUpperCase());
    url.searchParams.set('fmt', 'bin');
    url.searchParams.set('tm', requestedTime);
    url.searchParams.set('size', 'Y');
    url.searchParams.set('filter', 'lst');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA LST file-list request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function checkKmaLstDataAt(date, area = 'KO') {
  return new Promise((resolvePromise, reject) => {
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/data`);
    url.searchParams.set('date', date);
    url.searchParams.set('authKey', kmaApiKey);
    let settled = false;
    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      let byteLength = 0;
      upstream.on('data', (chunk) => {
        if (settled) return;
        byteLength += chunk.length;
        if (upstream.statusCode === 200) {
          settled = true;
          resolvePromise({
            ok: true,
            date,
            statusCode: upstream.statusCode,
            contentType: upstream.headers['content-type'] || '',
            contentLength: Number(upstream.headers['content-length'] || byteLength || 0),
            disposition: upstream.headers['content-disposition'] || '',
          });
          upstream.destroy();
          request.destroy();
          return;
        }
        if (byteLength <= 16_384) chunks.push(Buffer.from(chunk));
      });
      upstream.on('end', () => {
        if (settled) return;
        settled = true;
        resolvePromise({
          ok: false,
          date,
          statusCode: upstream.statusCode || 502,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('timeout', () => {
      if (!settled) reject(new Error('KMA LST data request timeout'));
      request.destroy();
    });
    request.on('error', (error) => {
      if (!settled) reject(error);
    });
    request.end();
  });
}

async function checkRecentKmaLstData(searchParams) {
  if (!kmaApiKey) throw new Error('Missing KMA_API_KEY');
  const area = String(searchParams.get('area') || 'KO').toUpperCase();
  const requestedDate = searchParams.get('date');
  if (requestedDate) return checkKmaLstDataAt(requestedDate, area);

  const now = new Date();
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
  const attempts = [];
  for (let offsetMinutes = 10; offsetMinutes <= 180; offsetMinutes += 10) {
    const date = new Date(now.getTime() - offsetMinutes * 60 * 1000)
      .toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const result = await checkKmaLstDataAt(date, area);
    attempts.push({ date, statusCode: result.statusCode });
    if (result.ok) return { ...result, attempts };
    if (result.statusCode === 403) return { ...result, attempts };
  }
  return { ok: false, statusCode: 404, message: 'No recent LST file found', attempts };
}

function fetchKmaLstData(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }
    const date = searchParams.get('date');
    if (!/^\d{12}$/.test(date || '')) {
      reject(new Error('A 12-digit UTC date is required'));
      return;
    }
    const area = String(searchParams.get('area') || 'KO').toUpperCase();
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/data`);
    url.searchParams.set('date', date);
    url.searchParams.set('authKey', kmaApiKey);
    const request = httpsRequest(url, { method: 'GET', timeout: 45000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      upstream.on('end', () => resolvePromise({
        statusCode: upstream.statusCode || 502,
        body: Buffer.concat(chunks),
        contentType: upstream.headers['content-type'] || 'application/octet-stream',
      }));
    });
    request.on('timeout', () => request.destroy(new Error('KMA LST data download timeout')));
    request.on('error', reject);
    request.end();
  });
}

const kmaLstGridCache = new Map();

function h5AttributeNumber(attribute, fallback = NaN) {
  const value = attribute?.value ?? attribute;
  const scalar = ArrayBuffer.isView(value) || Array.isArray(value) ? value[0] : value;
  const number = Number(scalar);
  return Number.isFinite(number) ? number : fallback;
}

async function buildKmaLstGrid(searchParams) {
  const date = searchParams.get('date');
  if (!/^\d{12}$/.test(date || '')) throw new Error('A 12-digit UTC date is required');
  if (kmaLstGridCache.has(date)) return kmaLstGridCache.get(date);

  const downloaded = await fetchKmaLstData(searchParams);
  if (downloaded.statusCode !== 200) {
    throw new Error(`KMA LST download failed (${downloaded.statusCode})`);
  }

  await h5wasm.ready;
  const workDir = mkdtempSync(join(tmpdir(), 'livinglabs-lst-'));
  const filePath = join(workDir, `${date}.nc`);
  writeFileSync(filePath, downloaded.body);

  try {
    const file = new h5wasm.File(filePath, 'r');
    try {
      const lstDataset = file.get('LST');
      const qualityDataset = file.get('DQF_LST');
      const projectionDataset = file.get('gk2a_imager_projection');
      const projection = projectionDataset.attrs;
      const width = h5AttributeNumber(projection.image_width);
      const height = h5AttributeNumber(projection.image_height);
      const pixelSize = h5AttributeNumber(projection.pixel_size);
      const upperLeftEasting = h5AttributeNumber(projection.upper_left_easting);
      const upperLeftNorthing = h5AttributeNumber(projection.upper_left_northing);
      const sourceProjection = [
        '+proj=lcc',
        `+lat_1=${h5AttributeNumber(projection.standard_parallel1)}`,
        `+lat_2=${h5AttributeNumber(projection.standard_parallel2)}`,
        `+lat_0=${h5AttributeNumber(projection.origin_latitude)}`,
        `+lon_0=${h5AttributeNumber(projection.central_meridian)}`,
        `+x_0=${h5AttributeNumber(projection.false_easting, 0)}`,
        `+y_0=${h5AttributeNumber(projection.false_northing, 0)}`,
        '+datum=WGS84',
        '+units=m',
        '+no_defs',
      ].join(' ');
      const gyeonggiBounds = { west: 126.32, south: 36.82, east: 127.88, north: 38.32 };
      const projectedCorners = [
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.west, gyeonggiBounds.south]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.west, gyeonggiBounds.north]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.east, gyeonggiBounds.south]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.east, gyeonggiBounds.north]),
      ];
      const minX = Math.min(...projectedCorners.map(([x]) => x));
      const maxX = Math.max(...projectedCorners.map(([x]) => x));
      const minY = Math.min(...projectedCorners.map(([, y]) => y));
      const maxY = Math.max(...projectedCorners.map(([, y]) => y));
      const startColumn = Math.max(0, Math.floor((minX - upperLeftEasting) / pixelSize) - 1);
      const endColumn = Math.min(width, Math.ceil((maxX - upperLeftEasting) / pixelSize) + 1);
      const startRow = Math.max(0, Math.floor((upperLeftNorthing - maxY) / pixelSize) - 1);
      const endRow = Math.min(height, Math.ceil((upperLeftNorthing - minY) / pixelSize) + 1);
      const columnCount = endColumn - startColumn;
      const rowCount = endRow - startRow;
      const rawValues = lstDataset.slice([[startRow, endRow], [startColumn, endColumn]]);
      const qualityValues = qualityDataset.slice([[startRow, endRow], [startColumn, endColumn]]);
      const scaleFactor = h5AttributeNumber(lstDataset.attrs.scale_factor, 0.01);
      const addOffset = h5AttributeNumber(lstDataset.attrs.add_offset, 0);
      const fillValue = h5AttributeNumber(lstDataset.attrs._FillValue, 65535);
      const cells = [];

      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
          const index = row * columnCount + column;
          const rawValue = Number(rawValues[index]);
          const quality = Number(qualityValues[index]);
          if (rawValue === fillValue || quality !== 0) continue;
          const x = upperLeftEasting + (startColumn + column) * pixelSize;
          const y = upperLeftNorthing - (startRow + row) * pixelSize;
          const [longitude, latitude] = proj4(sourceProjection, 'EPSG:4326', [x, y]);
          if (
            longitude < gyeonggiBounds.west || longitude > gyeonggiBounds.east ||
            latitude < gyeonggiBounds.south || latitude > gyeonggiBounds.north
          ) continue;
          cells.push({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            temperatureC: Number((rawValue * scaleFactor + addOffset - 273.15).toFixed(2)),
            quality,
          });
        }
      }

      const temperatures = cells.map((cell) => cell.temperatureC);
      const result = {
        ok: true,
        date,
        gridSizeMeters: pixelSize,
        cells,
        minC: temperatures.length ? Math.min(...temperatures) : null,
        maxC: temperatures.length ? Math.max(...temperatures) : null,
        count: cells.length,
      };
      kmaLstGridCache.set(date, result);
      if (kmaLstGridCache.size > 24) kmaLstGridCache.delete(kmaLstGridCache.keys().next().value);
      return result;
    } finally {
      file.close();
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
const kmaNetworkCache = new Map();

function requestKmaText(pathname, params) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }
    const url = new URL(`https://apihub.kma.go.kr/api/typ01/${pathname}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('help', '0');
    url.searchParams.set('authKey', kmaApiKey);
    const request = httpsRequest(url, { method: 'GET', timeout: 25000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });
      upstream.on('end', () => resolvePromise(new TextDecoder('euc-kr').decode(Buffer.concat(chunks))));
    });
    request.on('timeout', () => request.destroy(new Error('KMA request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function parseKmaStations(payload, type) {
  return payload.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+\s+\d/.test(line)).map((line) => {
    const values = line.split(/\s+/);
    const nameIndex = type === 'asos' ? 10 : 8;
    return {
      id: values[0],
      longitude: Number(values[1]),
      latitude: Number(values[2]),
      name: values[nameIndex] || `관측소 ${values[0]}`,
      type,
    };
  }).filter((station) => Number.isFinite(station.longitude) && Number.isFinite(station.latitude));
}

function parseKmaHourly(payload) {
  const observations = new Map();
  payload.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d{12}\s+\d+/.test(line)).forEach((line) => {
    const values = line.split(/\s+/);
    const numeric = (index) => {
      const value = Number(values[index]);
      return Number.isFinite(value) && value > -90 ? value : null;
    };
    observations.set(values[1], {
      observedAt: values[0],
      temperature: numeric(2),
      windDirection: numeric(3),
      windSpeed: numeric(4),
      rainfallDay: numeric(5),
      rainfallHour: numeric(6),
      humidity: numeric(7),
      stationPressure: numeric(8),
      seaLevelPressure: numeric(9),
    });
  });
  return observations;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (value) => value * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchKmaNetwork(type = 'asos', radiusKm = 35) {
  const safeType = type === 'aws' ? 'aws' : 'asos';
  const safeRadius = Math.min(80, Math.max(10, Number(radiusKm) || 35));
  const cacheKey = `${safeType}:${safeRadius}`;
  const cached = kmaNetworkCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < 5 * 60 * 1000) return cached.payload;

  const latestCompletedHour = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 13).replace(/[-T:]/g, '') + '00';
  const [selectedCatalogText, asosCatalogText, observationText] = await Promise.all([
    requestKmaText('url/stn_inf.php', { inf: safeType === 'asos' ? 'SFC' : 'AWS', stn: 0 }),
    requestKmaText('url/stn_inf.php', { inf: 'SFC', stn: 0 }),
    requestKmaText('url/awsh.php', { tm: latestCompletedHour, stn: 0 }),
  ]);

  const selectedStations = parseKmaStations(selectedCatalogText, safeType);
  const asosIds = new Set(parseKmaStations(asosCatalogText, 'asos').map((station) => station.id));
  const observations = parseKmaHourly(observationText);
  const center = { latitude: 37.2636, longitude: 127.0286 };
  const stations = selectedStations
    .filter((station) => safeType === 'asos' || !asosIds.has(station.id))
    .map((station) => ({
      ...station,
      distanceKm: distanceKm(center.latitude, center.longitude, station.latitude, station.longitude),
      observation: observations.get(station.id) || null,
    }))
    .filter((station) => station.distanceKm <= safeRadius && station.observation?.temperature != null)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const payload = {
    ok: true,
    type: safeType,
    radiusKm: safeRadius,
    center,
    observedAt: stations[0]?.observation?.observedAt || latestCompletedHour,
    count: stations.length,
    stations,
  };
  kmaNetworkCache.set(cacheKey, { storedAt: Date.now(), payload });
  return payload;
}
const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, '');
    return;
  }

  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  const routePath = url.pathname.startsWith('/api/') ? url.pathname.slice('/api'.length) : url.pathname;
  if (routePath === '/health') {
    send(response, 200, JSON.stringify({
      ok: true,
      service: staticRoot ? 'living-labs-platform' : 'vworld-data-proxy',
      unified: Boolean(staticRoot),
    }));
    return;
  }

  if (routePath === '/cadastre/health') {
    try {
      const result = await cadastrePool.query(`
        SELECT current_database() AS database,
               to_regclass('cadastre.parcels') IS NOT NULL AS ready,
               (SELECT count(*) FROM cadastre.import_log WHERE status = 'loaded') AS loaded_files
      `);
      send(response, 200, JSON.stringify({ ok: true, ...result.rows[0] }));
    } catch (error) {
      send(response, 503, JSON.stringify({ ok: false, error: error?.message || 'PostGIS unavailable' }));
    }
    return;
  }

  if (routePath === '/cadastre/parcel') {
    try {
      send(response, 200, JSON.stringify(await fetchCadastreParcel(url.searchParams)));
    } catch (error) {
      send(response, /must be/.test(error?.message || '') ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Parcel lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/cadastre/bbox') {
    try {
      send(response, 200, JSON.stringify(await fetchCadastreBbox(url.searchParams)));
    } catch (error) {
      send(response, /bbox/.test(error?.message || '') ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Parcel extent lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/population/health') {
    try {
      const result = await cadastrePool.query(`
        SELECT to_regclass('population.grid_100m') IS NOT NULL AS ready,
               to_char(max(reference_month), 'YYYY-MM-DD') AS latest_month,
               count(*) AS unique_cells,
               count(elderly_count) AS elderly_cells,
               count(infant_count) AS infant_cells,
               (SELECT count(*) FROM population.import_log WHERE status = 'loaded') AS loaded_files,
               (SELECT count(*) FROM population.value_conflict_log) AS logged_conflicts
        FROM population.grid_100m
      `);
      send(response, 200, JSON.stringify({ ok: true, ...result.rows[0] }));
    } catch (error) {
      send(response, 503, JSON.stringify({ ok: false, error: error?.message || 'Population PostGIS unavailable' }));
    }
    return;
  }

  if (routePath === '/population/grid') {
    try {
      const payload = await fetchPopulationGrid(url.searchParams);
      send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', 'public, max-age=300');
    } catch (error) {
      const isInputError = /must be|not available|too large/.test(error?.message || '');
      send(response, isInputError ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Population grid lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/hazard-grid') {
    try {
      const payload = await fetchHazardGrid(url.searchParams);
      send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', 'public, max-age=300');
    } catch (error) {
      const isInputError = /must be|not available|not loaded/.test(error?.message || '');
      send(response, isInputError ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Hazard grid lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/flood-grid') {
    try {
      const payload = await fetchFloodGrid(url.searchParams);
      send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', 'public, max-age=300');
    } catch (error) {
      const isInputError = /must be|not available/.test(error?.message || '');
      send(response, isInputError ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Flood grid lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/analysis-grid') {
    try {
      const payload = await fetchRegionalAnalysisGrid(url.searchParams);
      send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', 'public, max-age=300');
    } catch (error) {
      const isInputError = /must be|not available/.test(error?.message || '');
      send(response, isInputError ? 400 : 503, JSON.stringify({
        ok: false,
        error: error?.message || 'Analysis grid lookup failed',
      }));
    }
    return;
  }

  if (routePath === '/dev-reset') {
    if (request.method === 'GET') {
      send(response, 200, JSON.stringify({ ok: true, ...readHandoffStore(devResetStatePath) }));
      return;
    }
    if (!['POST', 'DELETE'].includes(request.method)) {
      send(response, 405, JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    resetDevStores();
    send(response, 200, JSON.stringify({
      ok: true,
      reset: [
        'priority-handoffs',
        'responsible-handoffs',
        'responsible-review-responses',
      ],
      ...readHandoffStore(devResetStatePath),
    }));
    return;
  }

  if (routePath === '/priority-handoff') {
    if (request.method === 'GET') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      send(response, 200, JSON.stringify({
        ok: true,
        payload: regionCode ? store[regionCode] || null : null,
      }));
      return;
    }

    if (request.method === 'POST') {
      try {
        const payload = await readJsonBody(request);
        if (!payload?.regionCode || payload?.schemaVersion !== 'priority-management-handoff/v1') {
          send(response, 400, JSON.stringify({ ok: false, error: 'Invalid priority handoff payload' }));
          return;
        }
        const store = readHandoffStore();
        store[payload.regionCode] = {
          ...payload,
          storedAt: new Date().toISOString(),
        };
        writeHandoffStore(store);
        send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
      } catch (error) {
        send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
      }
      return;
    }

    if (request.method === 'DELETE') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      if (regionCode) delete store[regionCode];
      writeHandoffStore(store);
      send(response, 200, JSON.stringify({ ok: true, regionCode }));
      return;
    }
  }

  if (routePath === '/responsible-handoff') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleHandoffStorePath,
      schemaVersion: 'lead-to-responsible-handoff/v1',
    })) return;
  }

  if (routePath === '/responsible-review-response') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleReviewStorePath,
      schemaVersion: 'responsible-to-lead-review/v1',
    })) return;
  }

  if (routePath === '/kma-network') {
    try {
      const payload = await fetchKmaNetwork(url.searchParams.get('type') || 'asos', url.searchParams.get('radiusKm') || 35);
      send(response, 200, JSON.stringify(payload));
    } catch (error) {
      send(response, 502, JSON.stringify({ ok: false, error: error?.message || 'Failed to load KMA station network' }));
    }
    return;
  }
  if (routePath === '/kma-observation') {
    try {
      const result = await fetchKmaObservation(url.searchParams);
      send(response, result.statusCode, result.body, 'text/plain; charset=utf-8');
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'Local KMA proxy failed',
      }));
    }
    return;
  }
  if (routePath === '/kma-lst-list') {
    try {
      const result = await fetchKmaLstList(url.searchParams);
      send(response, result.statusCode, result.body);
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST list request failed',
      }));
    }
    return;
  }
  if (routePath === '/kma-lst-files') {
    try {
      const result = await fetchKmaLstFileList(url.searchParams);
      send(response, result.statusCode, result.body, 'text/plain; charset=utf-8');
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST file-list request failed',
      }));
    }
    return;
  }
  if (routePath === '/kma-lst-check') {
    try {
      const result = await checkRecentKmaLstData(url.searchParams);
      send(response, result.ok ? 200 : result.statusCode || 502, JSON.stringify(result));
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST data check failed',
      }));
    }
    return;
  }
  if (routePath === '/kma-lst-data') {
    try {
      const result = await fetchKmaLstData(url.searchParams);
      send(response, result.statusCode, result.body, result.contentType);
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST data download failed',
      }));
    }
    return;
  }
  if (routePath === '/kma-lst-grid') {
    try {
      const result = await buildKmaLstGrid(url.searchParams);
      send(response, 200, JSON.stringify(result));
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST grid conversion failed',
      }));
    }
    return;
  }
  if (routePath !== '/vworld-data') {
    if (serveStatic(request, response, url)) return;
    send(response, 404, JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const result = await fetchVWorldData(url.searchParams);
    send(response, result.statusCode, result.body);
  } catch (error) {
    send(response, 502, JSON.stringify({
      response: {
        status: 'ERROR',
        error: {
          code: 'LOCAL_PROXY_ERROR',
          text: error?.message || 'Local VWorld proxy failed',
        },
      },
    }));
  }
});

server.listen(port, '127.0.0.1', () => {
  try {
    const label = staticRoot ? 'Living Labs platform' : 'VWorld data proxy';
    console.log(`${label} listening on http://127.0.0.1:${port}/`);
  } catch {
    // Hidden Windows background processes may not have a writable console.
  }
});
