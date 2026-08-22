import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import pg from 'pg';
import { DEFAULT_FLOOD_DATASET_KEY, FLOOD_INDICATOR_COLUMNS } from './flood-grid-store.mjs';

const { Pool } = pg;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const dataRootArgument = process.argv.find((argument) => argument.startsWith('--data-root='))?.slice('--data-root='.length);
const dataRoot = resolve(dataRootArgument || resolve(workspaceRoot, 'data', 'LivingLabs_flood_national'));
const replaceExisting = process.argv.includes('--replace');
const batchSize = Math.min(100000, Math.max(5000, Number(process.argv.find((argument) => argument.startsWith('--batch='))?.slice(8)) || 50000));
const WIDTH = 7000;
const HEIGHT = 7000;
const ORIGIN_X = 700000;
const ORIGIN_Y = 2100000;
const CELL_SIZE = 100;
const DEPTH_MIDPOINTS = Object.freeze({ 1: 0.25, 2: 0.75, 3: 1.5, 4: 3.5, 5: 5.0 });

const RASTERS = Object.freeze([
  {
    indicator: 'FH01', column: 'fh01', kind: 'hazard', unit: 'm',
    path: '02_hazard/floodmap/H_urban_flood_30y_class_100m_epsg5179.tif',
    sourceResolution: '도시침수 30년 위험도 5m 원자료를 EPSG:5179 전국 100m 최근접 정렬 · 등급별 침수심 중간값',
  },
  {
    indicator: 'FH02', column: 'fh02', kind: 'hazard', unit: 'm',
    path: '02_hazard/floodmap/H_national_river_flood_100y_class_100m_epsg5179.tif',
    sourceResolution: '국가하천 범람 100년 위험도 5m 원자료를 EPSG:5179 전국 100m 최근접 정렬 · 등급별 침수심 중간값',
  },
  {
    indicator: 'FH03', column: 'fh03', kind: 'hazard', unit: 'm',
    path: '02_hazard/floodmap/H_local_river_flood_50y_class_100m_epsg5179.tif',
    sourceResolution: '지방하천 범람 50년 위험도 5m 원자료를 EPSG:5179 전국 100m 최근접 정렬 · 등급별 침수심 중간값',
  },
  {
    indicator: 'FE01', column: 'fe01', kind: 'count', unit: '명/셀',
    path: '03_exposure/population/E_population_2024_100m_epsg5179.tif',
    sourceResolution: '2024 전국 총인구 EPSG:5179 100m 통계격자',
  },
  {
    indicator: 'FE02', column: 'fe02', kind: 'count', unit: '호/셀',
    path: '03_exposure/population/E_housing_2024_100m_epsg5179.tif',
    sourceResolution: '2024 전국 주택 EPSG:5179 100m 통계격자',
  },
]);

const pool = new Pool({
  host: process.env.VWORLD_POSTGIS_HOST || '127.0.0.1',
  port: Number(process.env.VWORLD_POSTGIS_PORT || 55432),
  database: process.env.VWORLD_POSTGIS_DATABASE || 'vworld_cadastral',
  user: process.env.VWORLD_POSTGIS_USER || 'postgres',
  password: process.env.VWORLD_POSTGIS_PASSWORD || undefined,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

function rasterIndex(x, y) {
  const column = Math.floor((Number(x) - ORIGIN_X) / CELL_SIZE);
  const row = Math.floor((ORIGIN_Y - Number(y)) / CELL_SIZE);
  return column >= 0 && column < WIDTH && row >= 0 && row < HEIGHT ? (row * WIDTH) + column : -1;
}

function serviceValue(config, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric === 65535) return null;
  return config.kind === 'hazard' ? DEPTH_MIDPOINTS[numeric] ?? null : numeric;
}

async function loadRasters() {
  const loaded = [];
  for (const config of RASTERS) {
    const path = resolve(dataRoot, config.path);
    const tiff = await fromFile(path);
    const image = await tiff.getImage();
    if (image.getWidth() !== WIDTH || image.getHeight() !== HEIGHT) throw new Error(`Unexpected raster size: ${path}`);
    const [originX, originY] = image.getOrigin();
    const [resolutionX, resolutionY] = image.getResolution();
    if (Math.abs(originX - ORIGIN_X) > 0.01 || Math.abs(originY - ORIGIN_Y) > 0.01 || Math.abs(resolutionX - CELL_SIZE) > 0.01 || Math.abs(Math.abs(resolutionY) - CELL_SIZE) > 0.01) {
      throw new Error(`Raster alignment mismatch: ${path}`);
    }
    const values = await image.readRasters({ samples: [0], interleave: true });
    loaded.push({ ...config, values });
    console.log(`${config.indicator}: ${path} (${values.length.toLocaleString()} pixels)`);
  }
  return loaded;
}

async function activeVersionId() {
  const result = await pool.query({
    text: 'SELECT version_id FROM analysis.flood_dataset_versions WHERE dataset_key = $1 AND active = true',
    values: [DEFAULT_FLOOD_DATASET_KEY],
  });
  if (!result.rows[0]) throw new Error('Flood PostGIS schema is missing. Run scripts/prepare-flood-postgis.ps1 first.');
  return result.rows[0].version_id;
}

async function upsertBatch(versionId, rows, rasters) {
  const cellIds = [];
  const valuesByColumn = Object.fromEntries(Object.values(FLOOD_INDICATOR_COLUMNS).map((column) => [column, []]));
  for (const row of rows) {
    const index = rasterIndex(row.x, row.y);
    if (index < 0) continue;
    const values = Object.fromEntries(rasters.map((raster) => [raster.column, serviceValue(raster, raster.values[index])]));
    if (!Object.values(values).some((value) => value !== null)) continue;
    cellIds.push(row.cell_id);
    for (const column of Object.keys(valuesByColumn)) valuesByColumn[column].push(values[column]);
  }
  if (!cellIds.length) return 0;
  await pool.query({
    text: `
      WITH input AS (
        SELECT * FROM unnest($2::bigint[], $3::real[], $4::real[], $5::real[], $6::real[], $7::real[])
          AS t(cell_id, fh01, fh02, fh03, fe01, fe02)
      )
      INSERT INTO analysis.flood_values_100m
        (version_id, cell_id, fh01, fh02, fh03, fe01, fe02)
      SELECT $1, cell_id, fh01, fh02, fh03, fe01, fe02 FROM input
      ON CONFLICT (version_id, cell_id) DO UPDATE SET
        fh01 = COALESCE(EXCLUDED.fh01, analysis.flood_values_100m.fh01),
        fh02 = COALESCE(EXCLUDED.fh02, analysis.flood_values_100m.fh02),
        fh03 = COALESCE(EXCLUDED.fh03, analysis.flood_values_100m.fh03),
        fe01 = COALESCE(EXCLUDED.fe01, analysis.flood_values_100m.fe01),
        fe02 = COALESCE(EXCLUDED.fe02, analysis.flood_values_100m.fe02),
        updated_at = now()
    `,
    values: [versionId, cellIds, valuesByColumn.fh01, valuesByColumn.fh02, valuesByColumn.fh03, valuesByColumn.fe01, valuesByColumn.fe02],
  });
  return cellIds.length;
}

async function rebuildRegionStats(versionId, rasters) {
  const aggregates = await pool.query({
    text: `
      SELECT r.region_code,
             count(*)::bigint AS total_cells,
             count(f.fh01)::bigint AS fh01_count, COALESCE(sum(f.fh01), 0) AS fh01_sum, COALESCE(max(f.fh01), 0) AS fh01_max,
             count(f.fh02)::bigint AS fh02_count, COALESCE(sum(f.fh02), 0) AS fh02_sum, COALESCE(max(f.fh02), 0) AS fh02_max,
             count(f.fh03)::bigint AS fh03_count, COALESCE(sum(f.fh03), 0) AS fh03_sum, COALESCE(max(f.fh03), 0) AS fh03_max,
             count(f.fe01)::bigint AS fe01_count, COALESCE(sum(f.fe01), 0) AS fe01_sum, COALESCE(max(f.fe01), 0) AS fe01_max,
             count(f.fe02)::bigint AS fe02_count, COALESCE(sum(f.fe02), 0) AS fe02_sum, COALESCE(max(f.fe02), 0) AS fe02_max
      FROM analysis.region_grid_cells_100m r
      LEFT JOIN analysis.flood_values_100m f ON f.version_id = $1 AND f.cell_id = r.cell_id
      GROUP BY r.region_code
      ORDER BY r.region_code
    `,
    values: [versionId],
  });
  const templates = await pool.query(`
    SELECT DISTINCT ON (s.region_code) s.region_code, s.payload
    FROM analysis.region_indicator_stats s
    JOIN analysis.hev_dataset_versions d ON d.version_id = s.version_id AND d.active = true
    WHERE s.indicator_code = 'H01'
    ORDER BY s.region_code, s.updated_at DESC
  `);
  const templateByRegion = new Map(templates.rows.map((row) => [row.region_code, row.payload]));
  for (const aggregate of aggregates.rows) {
    const template = templateByRegion.get(aggregate.region_code);
    if (!template) continue;
    const totalCells = Number(aggregate.total_cells);
    for (const config of rasters) {
      const count = Number(aggregate[`${config.column}_count`]);
      const sum = Number(aggregate[`${config.column}_sum`]);
      const rawMax = Number(aggregate[`${config.column}_max`]);
      const rawMean = totalCells > 0 ? sum / totalCells : 0;
      const normalizedMean = rawMax > 0 ? rawMean / rawMax : 0;
      const payload = {
        schemaVersion: 'livinglabs-flood-grid/v1',
        crs: template.crs,
        rows: template.rows,
        columns: template.columns,
        extent: template.extent,
        transform: template.transform,
        gridUnit: '100m',
        indicator: config.indicator,
        regionCode: aggregate.region_code,
        valueEncoding: 'sparse-index-value',
        valueCount: Number(template.rows) * Number(template.columns),
        unit: config.unit,
        rawUnit: config.unit,
        referencePeriod: config.kind === 'count' ? '2024' : '공개 홍수위험지도 기준',
        sourceResolution: config.sourceResolution,
        stats: {
          rawMin: 0,
          rawMax,
          rawMean: Number(rawMean.toFixed(6)),
          normalizedMean: Number(normalizedMean.toFixed(6)),
          mean: Number(normalizedMean.toFixed(6)),
          validCells: count,
          totalCells,
        },
      };
      await pool.query({
        text: `
          INSERT INTO analysis.flood_region_indicator_stats
            (version_id, region_code, indicator_code, payload, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, now())
          ON CONFLICT (version_id, region_code, indicator_code) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = now()
        `,
        values: [versionId, aggregate.region_code, config.indicator, JSON.stringify(payload)],
      });
    }
  }
}

async function main() {
  const versionId = await activeVersionId();
  if (replaceExisting) {
    await pool.query('DELETE FROM analysis.flood_region_indicator_stats WHERE version_id = $1', [versionId]);
    await pool.query('DELETE FROM analysis.flood_values_100m WHERE version_id = $1', [versionId]);
  }
  const rasters = await loadRasters();
  let lastCellId = 0;
  let scanned = 0;
  let written = 0;
  let batch = 0;
  while (true) {
    const result = await pool.query({
      text: `SELECT cell_id, x, y FROM analysis.grid_cells_100m WHERE cell_id > $1 ORDER BY cell_id LIMIT $2`,
      values: [lastCellId, batchSize],
    });
    if (!result.rows.length) break;
    written += await upsertBatch(versionId, result.rows, rasters);
    scanned += result.rows.length;
    lastCellId = Number(result.rows.at(-1).cell_id);
    batch += 1;
    if (batch % 20 === 0) console.log(`scanned ${scanned.toLocaleString()} cells; upsert candidates ${written.toLocaleString()}`);
  }
  await rebuildRegionStats(versionId, rasters);
  await pool.query('ANALYZE analysis.flood_values_100m, analysis.flood_region_indicator_stats');
  const status = await pool.query({
    text: `
      SELECT d.dataset_key,
             (SELECT count(*)::bigint FROM analysis.flood_values_100m WHERE version_id = d.version_id) AS cells,
             (SELECT count(DISTINCT region_code)::integer FROM analysis.flood_region_indicator_stats WHERE version_id = d.version_id) AS regions,
             (SELECT count(*)::integer FROM analysis.flood_region_indicator_stats WHERE version_id = d.version_id) AS region_indicators
      FROM analysis.flood_dataset_versions d WHERE d.version_id = $1
    `,
    values: [versionId],
  });
  console.log(JSON.stringify({ ok: true, scanned, written, ...status.rows[0] }));
}

try {
  await main();
} finally {
  await pool.end();
}
