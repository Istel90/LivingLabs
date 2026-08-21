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
const indicatorArgument = process.argv.find((argument) => argument.startsWith('--indicator='))?.slice('--indicator='.length)?.toUpperCase();
const loadAll = process.argv.includes('--all');
if (!loadAll && !/^\d{5}$/.test(regionArgument || '')) throw new Error('Use --region=41110 or --all');
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

const regionCodes = loadAll
  ? [...new Set((JSON.parse(readFileSync(boundariesPath, 'utf8')).features || [])
      .map((feature) => String(feature.properties?.code || ''))
      .filter((code) => /^\d{5}$/.test(code)))]
  : [regionArgument];
const indicators = indicatorArgument ? [indicatorArgument] : Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`);
let loaded = 0;
try {
  for (const regionCode of regionCodes) {
    for (const indicator of indicators) {
      const startedAt = Date.now();
      const payload = await buildGrid(new URLSearchParams({ regionCode, indicator }));
      const result = await store.put(payload);
      loaded += 1;
      console.log(`${regionCode} ${indicator}: ${result.cells.toLocaleString()} cells (${Date.now() - startedAt}ms)`);
    }
  }
  await pool.query('ANALYZE analysis.grid_cells_100m, analysis.region_grid_cells_100m, analysis.hev_values_100m, analysis.region_indicator_stats');
  console.log(JSON.stringify({ ok: true, loaded, ...(await store.status()) }));
} finally {
  await pool.end();
}