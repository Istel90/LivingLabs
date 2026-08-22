import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const roadsRoot = resolve(
    workspaceRoot,
    'data',
    'LivingLabs_flood_national',
    '05_adaptive_capacity',
    'roads',
    'ITS_LINK_v2'
);
const batchSize = 1000;
const labels = ['urban', 'rural', 'urban_expressway', 'expressway'];
const pool = new Pool({
    host: process.env.VWORLD_POSTGIS_HOST || '127.0.0.1',
    port: Number(process.env.VWORLD_POSTGIS_PORT || 55432),
    database: process.env.VWORLD_POSTGIS_DATABASE || 'vworld_cadastral',
    user: process.env.VWORLD_POSTGIS_USER || 'postgres',
    password: process.env.VWORLD_POSTGIS_PASSWORD || undefined,
    max: 2,
    connectionTimeoutMillis: 5000
});

async function prepare() {
    await pool.query(`
    CREATE SCHEMA IF NOT EXISTS analysis;
    CREATE TABLE IF NOT EXISTS analysis.national_road_links (
      source_layer smallint NOT NULL,
      source_object_id bigint NOT NULL,
      road_group text NOT NULL,
      link_id text,
      from_node text,
      to_node text,
      road_name text,
      road_rank text,
      road_type text,
      lanes smallint,
      max_speed smallint,
      length_m real,
      observed_speed real,
      attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
      geom geometry(MultiLineString, 5179) NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_layer, source_object_id)
    );
    TRUNCATE analysis.national_road_links;
  `);
}

function normalizeFeature(feature, sourceLayer) {
    const a = feature.attributes || {};
    const paths =
        feature.geometry?.paths?.filter((path) => Array.isArray(path) && path.length >= 2) || [];
    if (!paths.length) return null;
    return {
        source_layer: sourceLayer,
        source_object_id: a.objectid,
        road_group: labels[sourceLayer] || `layer_${sourceLayer}`,
        link_id: a.link_id == null ? null : String(a.link_id),
        from_node: a.f_node == null ? null : String(a.f_node),
        to_node: a.t_node == null ? null : String(a.t_node),
        road_name: a.road_name || null,
        road_rank: a.road_rank == null ? null : String(a.road_rank),
        road_type: a.road_type == null ? null : String(a.road_type),
        lanes: Number.isFinite(Number(a.lanes)) ? Number(a.lanes) : null,
        max_speed: Number.isFinite(Number(a.max_spd)) ? Number(a.max_spd) : null,
        length_m: Number.isFinite(Number(a.length)) ? Number(a.length) : null,
        observed_speed: Number.isFinite(Number(a.speed)) ? Number(a.speed) : null,
        attributes: a,
        geometry: { type: 'MultiLineString', coordinates: paths }
    };
}

async function insertBatch(rows) {
    if (!rows.length) return;
    await pool.query({
        text: `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(
          source_layer smallint, source_object_id bigint, road_group text,
          link_id text, from_node text, to_node text, road_name text,
          road_rank text, road_type text, lanes smallint, max_speed smallint,
          length_m real, observed_speed real, attributes jsonb, geometry jsonb
        )
      )
      INSERT INTO analysis.national_road_links (
        source_layer, source_object_id, road_group, link_id, from_node, to_node,
        road_name, road_rank, road_type, lanes, max_speed, length_m,
        observed_speed, attributes, geom, updated_at
      )
      SELECT source_layer, source_object_id, road_group, link_id, from_node, to_node,
             road_name, road_rank, road_type, lanes, max_speed, length_m,
             observed_speed, attributes,
             ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 5179))),
             now()
      FROM input
      WHERE source_object_id IS NOT NULL AND geometry IS NOT NULL
      ON CONFLICT (source_layer, source_object_id) DO UPDATE SET
        road_group=EXCLUDED.road_group, link_id=EXCLUDED.link_id,
        from_node=EXCLUDED.from_node, to_node=EXCLUDED.to_node,
        road_name=EXCLUDED.road_name, road_rank=EXCLUDED.road_rank,
        road_type=EXCLUDED.road_type, lanes=EXCLUDED.lanes,
        max_speed=EXCLUDED.max_speed, length_m=EXCLUDED.length_m,
        observed_speed=EXCLUDED.observed_speed, attributes=EXCLUDED.attributes,
        geom=EXCLUDED.geom, updated_at=now()
    `,
        values: [JSON.stringify(rows)]
    });
}

async function loadLayer(sourceLayer) {
    const directory = resolve(roadsRoot, `layer_${sourceLayer}`);
    const files = (await readdir(directory))
        .filter((name) => /^chunk_\d+\.json$/.test(name))
        .sort();
    let loaded = 0;
    for (const file of files) {
        const data = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
        const rows = (data.features || [])
            .map((feature) => normalizeFeature(feature, sourceLayer))
            .filter(Boolean);
        for (let offset = 0; offset < rows.length; offset += batchSize) {
            await insertBatch(rows.slice(offset, offset + batchSize));
        }
        loaded += rows.length;
        if (loaded % 50000 < rows.length)
            console.log(`roads layer ${sourceLayer}: ${loaded.toLocaleString()}`);
    }
    return loaded;
}

async function main() {
    await prepare();
    const counts = [];
    for (let sourceLayer = 0; sourceLayer < 4; sourceLayer += 1)
        counts.push(await loadLayer(sourceLayer));
    await pool.query(`
    CREATE INDEX IF NOT EXISTS national_road_links_geom_gix ON analysis.national_road_links USING gist (geom);
    CREATE INDEX IF NOT EXISTS national_road_links_group_rank_idx ON analysis.national_road_links (road_group, road_rank);
    CREATE INDEX IF NOT EXISTS national_road_links_link_id_idx ON analysis.national_road_links (link_id);
    ANALYZE analysis.national_road_links;
  `);
    console.log(
        JSON.stringify({ ok: true, counts, total: counts.reduce((sum, count) => sum + count, 0) })
    );
}

try {
    await main();
} finally {
    await pool.end();
}
