import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';
import { createObservedHazardGridBuilder } from './hazard-grid.mjs';
import { createHevGridStore } from './hev-grid-store.mjs';

const { Pool } = pg;
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(root, '..');
const regionArgument = process.argv.find((argument) => argument.startsWith('--region='))?.slice('--region='.length);
const regionsArgument = process.argv.find((argument) => argument.startsWith('--regions='))?.slice('--regions='.length);
const indicatorArgument = process.argv.find((argument) => argument.startsWith('--indicator='))?.slice('--indicator='.length)?.toUpperCase();
const loadAll = process.argv.includes('--all');
if (!loadAll && !regionsArgument && !/^\d{5}$/.test(regionArgument || '')) throw new Error('Use --region=41110, --regions=11110,11140, or --all');
if (regionsArgument && regionsArgument.split(',').some((code) => !/^\d{5}$/.test(code))) throw new Error('--regions must contain comma-separated 5-digit codes');
if (indicatorArgument && !/^H(?:0[1-9]|10)$/.test(indicatorArgument)) throw new Error('--indicator must be H01 through H10');

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
const boundariesPath = resolve(workspaceRoot, 'public', 'data', 'climate', 'admin-boundaries.geojson');
const buildGrid = createObservedHazardGridBuilder({
  metricsPath: resolve(root, 'static', 'analysis-data', 'climate', 'kma-asos-hazard-station-metrics-2021-2025.json'),
  boundariesPath,
  highresBinaryPath: resolve(root, 'static', 'analysis-data', 'climate', 'kma-highres-ta-2021-2025-500m.f32.gz'),
  highresMetadataPath: resolve(root, 'static', 'analysis-data', 'climate', 'kma-highres-ta-2021-2025-500m.json'),
  landsatPath: resolve(root, 'static', 'analysis-data', 'climate', 'kor_lst_summer_p90_2021_2025_100m_epsg5179.tif'),
});
const store = createHevGridStore({ pool });
if (!(await store.ready())) throw new Error('HEV PostGIS schema is missing. Run scripts/prepare-hev-postgis.ps1 first.');

function allSelectableRegionCodes() {
  const features = JSON.parse(readFileSync(boundariesPath, 'utf8')).features || [];
  const directCodes = features.map((feature) => String(feature.properties?.code || '')).filter((code) => /^\d{5}$/.test(code));
  const parentCounts = new Map();
  for (const feature of features) {
    const code = String(feature.properties?.code || '');
    const name = String(feature.properties?.name || '');
    if (!/^(.+시)\s+.+구$/.test(name)) continue;
    const parentCode = `${code.slice(0, 4)}0`;
    parentCounts.set(parentCode, (parentCounts.get(parentCode) || 0) + 1);
  }
  const parentCodes = [...parentCounts].filter(([, count]) => count > 1).map(([code]) => code);
  return [...new Set([...directCodes, ...parentCodes, '28000'])];
}

const regionCodes = loadAll
  ? allSelectableRegionCodes()
  : regionsArgument ? [...new Set(regionsArgument.split(','))] : [regionArgument];
const indicators = indicatorArgument ? [indicatorArgument] : Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`);
let loaded = 0;
const failures = [];
try {
  for (const regionCode of regionCodes) {
    const startedAt = Date.now();
    try {
      const payloads = [];
      for (const indicator of indicators) {
        payloads.push(await buildGrid(new URLSearchParams({ regionCode, indicator })));
      }
      const result = await store.putMany(payloads);
      loaded += payloads.length;
      console.log(`${regionCode} ${result.indicators.join(',')}: ${result.cells.toLocaleString()} cells (${Date.now() - startedAt}ms)`);
    } catch (error) {
      failures.push({ regionCode, error: error?.message || String(error) });
      console.error(`${regionCode} ERROR: ${error?.message || error}`);
    }
  }
  await pool.query('ANALYZE analysis.grid_cells_100m, analysis.region_grid_cells_100m, analysis.hev_values_100m, analysis.region_indicator_stats');
  console.log(JSON.stringify({ ok: failures.length === 0, loaded, failures, ...(await store.status()) }));
  if (failures.length) process.exitCode = 1;
} finally {
  await pool.end();
}