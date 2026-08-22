import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const snapshotRoot = resolve(
    workspaceRoot,
    'data',
    'LivingLabs_flood_national',
    '02_hazard',
    'flood_history_2002_2022'
);
const layerUrl =
    'https://portal.esrikr.com/arcgis/rest/services/Hosted/Flood_2002_2022/FeatureServer/0/query';
const pageSize = 2000;
const insertBatchSize = 200;

const pool = new Pool({
    host: process.env.VWORLD_POSTGIS_HOST || '127.0.0.1',
    port: Number(process.env.VWORLD_POSTGIS_PORT || 55432),
    database: process.env.VWORLD_POSTGIS_DATABASE || 'vworld_cadastral',
    user: process.env.VWORLD_POSTGIS_USER || 'postgres',
    password: process.env.VWORLD_POSTGIS_PASSWORD || undefined,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
});

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { Accept: 'application/geo+json' },
        signal: AbortSignal.timeout(180000)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.json();
}

async function prepareSchema() {
    await pool.query(`
    CREATE SCHEMA IF NOT EXISTS analysis;
    CREATE TABLE IF NOT EXISTS analysis.flood_observed_history (
      source_object_id bigint PRIMARY KEY,
      event_name text,
      flood_grade text,
      depth_m real,
      flood_year smallint,
      start_date date,
      end_date date,
      cause_detail text,
      sigungu_code text,
      sido_code text,
      attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
      geom geometry(MultiPolygon, 5179) NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS flood_observed_history_year_idx
      ON analysis.flood_observed_history (flood_year, sigungu_code);
    CREATE INDEX IF NOT EXISTS flood_observed_history_geom_gix
      ON analysis.flood_observed_history USING gist (geom);
    CREATE TABLE IF NOT EXISTS analysis.flood_observed_max_100m (
      cell_id bigint PRIMARY KEY REFERENCES analysis.grid_cells_100m(cell_id) ON DELETE CASCADE,
      max_depth_m real NOT NULL,
      event_count integer NOT NULL,
      latest_year smallint,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function toIsoDate(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) return null;
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    )
        return null;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
async function insertFeatures(features) {
    for (let index = 0; index < features.length; index += insertBatchSize) {
        const batch = features.slice(index, index + insertBatchSize).map((feature) => ({
            objectid: feature.properties.objectid,
            event_name: feature.properties.fldn_dst_nm || null,
            flood_grade: feature.properties.fldn_grade || null,
            depth_m: Number.isFinite(Number(feature.properties.fldn_dowa))
                ? Number(feature.properties.fldn_dowa)
                : null,
            flood_year: Number.isFinite(Number(feature.properties.fldn_yr))
                ? Number(feature.properties.fldn_yr)
                : null,
            start_date: toIsoDate(feature.properties.fldn_bgng_ymd),
            end_date: toIsoDate(feature.properties.fldn_end_ymd),
            cause_detail: feature.properties.fldn_cs_dtl_nm || null,
            sigungu_code: feature.properties.stdg_sgg_cd
                ? String(feature.properties.stdg_sgg_cd).padStart(5, '0')
                : null,
            sido_code: feature.properties.stdg_ctpv_cd
                ? String(feature.properties.stdg_ctpv_cd).padStart(2, '0')
                : null,
            attributes: feature.properties,
            geometry: feature.geometry
        }));
        await pool.query({
            text: `
        WITH input AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(
            objectid bigint, event_name text, flood_grade text, depth_m real,
            flood_year smallint, start_date date, end_date date,
            cause_detail text, sigungu_code text, sido_code text,
            attributes jsonb, geometry jsonb
          )
        )
        INSERT INTO analysis.flood_observed_history (
          source_object_id, event_name, flood_grade, depth_m, flood_year,
          start_date, end_date, cause_detail, sigungu_code, sido_code,
          attributes, geom, updated_at
        )
        SELECT objectid, event_name, flood_grade, depth_m, flood_year,
               start_date, end_date, cause_detail, sigungu_code, sido_code,
               attributes,
               ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 5179)), 3)),
               now()
        FROM input
        WHERE geometry IS NOT NULL
        ON CONFLICT (source_object_id) DO UPDATE SET
          event_name = EXCLUDED.event_name,
          flood_grade = EXCLUDED.flood_grade,
          depth_m = EXCLUDED.depth_m,
          flood_year = EXCLUDED.flood_year,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          cause_detail = EXCLUDED.cause_detail,
          sigungu_code = EXCLUDED.sigungu_code,
          sido_code = EXCLUDED.sido_code,
          attributes = EXCLUDED.attributes,
          geom = EXCLUDED.geom,
          updated_at = now()
      `,
            values: [JSON.stringify(batch)]
        });
    }
}

async function collect() {
    await mkdir(snapshotRoot, { recursive: true });
    let offset = 0;
    let page = 0;
    let total = 0;
    while (true) {
        const url = new URL(layerUrl);
        url.searchParams.set('where', '1=1');
        url.searchParams.set('outFields', '*');
        url.searchParams.set('returnGeometry', 'true');
        url.searchParams.set('outSR', '5179');
        url.searchParams.set('orderByFields', 'objectid');
        url.searchParams.set('resultOffset', String(offset));
        url.searchParams.set('resultRecordCount', String(pageSize));
        url.searchParams.set('geometryPrecision', '2');
        url.searchParams.set('f', 'geojson');
        const collection = await fetchJson(url);
        const features = collection.features || [];
        if (!features.length) break;
        await writeFile(
            resolve(snapshotRoot, `chunk_${String(page).padStart(3, '0')}.geojson`),
            JSON.stringify(collection),
            'utf8'
        );
        await insertFeatures(features);
        total += features.length;
        page += 1;
        offset += features.length;
        console.log(`flood history: ${total.toLocaleString()} features`);
        if (features.length < pageSize && !collection.properties?.exceededTransferLimit) break;
    }
    return { total, pages: page };
}

async function rebuildGrid() {
    await pool.query('TRUNCATE analysis.flood_observed_max_100m');
    const result = await pool.query(`
    INSERT INTO analysis.flood_observed_max_100m (cell_id, max_depth_m, event_count, latest_year, updated_at)
    SELECT g.cell_id,
           max(h.depth_m)::real,
           count(*)::integer,
           max(h.flood_year)::smallint,
           now()
    FROM analysis.flood_observed_history h
    JOIN analysis.grid_cells_100m g
      ON g.geom && h.geom AND ST_Intersects(h.geom, g.geom)
    WHERE h.depth_m > 0 AND h.depth_m <= 20
      AND h.flood_year BETWEEN 2002 AND 2022
    GROUP BY g.cell_id
  `);
    return result.rowCount;
}

async function main() {
    await prepareSchema();
    const collected = await collect();
    await pool.query('ANALYZE analysis.flood_observed_history');
    const gridCells = await rebuildGrid();
    await pool.query('ANALYZE analysis.flood_observed_max_100m');
    console.log(JSON.stringify({ ok: true, ...collected, gridCells }));
}

try {
    await main();
} finally {
    await pool.end();
}
