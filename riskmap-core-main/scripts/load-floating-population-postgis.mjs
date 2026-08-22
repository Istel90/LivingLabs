import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
import { DEFAULT_FLOOD_DATASET_KEY } from './flood-grid-store.mjs';

const { Pool } = pg;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceArgument = process.argv
    .find((argument) => argument.startsWith('--shp='))
    ?.slice('--shp='.length);
if (!sourceArgument)
    throw new Error('Pass the official 100m floating-population shapefile with --shp=<path>.');
const sourcePath = resolve(projectRoot, sourceArgument);
const replaceExisting = process.argv.includes('--replace');
const batchSize = Math.min(
    5000,
    Math.max(
        500,
        Number(process.argv.find((argument) => argument.startsWith('--batch='))?.slice(8)) || 2000
    )
);

const EPSG_5186 =
    '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const EPSG_5179 =
    '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
const SOURCE = '수원시정연구원 2021 수원시 일평균 유동인구 100m GIS';

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

function gridCenter(feature) {
    const rings =
        feature.geometry?.type === 'Polygon'
            ? feature.geometry.coordinates
            : feature.geometry?.type === 'MultiPolygon'
              ? feature.geometry.coordinates.flat()
              : [];
    const points = rings.flat();
    if (!points.length) return null;
    const xs = points.map((point) => Number(point[0]));
    const ys = points.map((point) => Number(point[1]));
    const center5186 = [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2
    ];
    const [rawX, rawY] = proj4(EPSG_5186, EPSG_5179, center5186);
    return {
        x: Math.round((rawX - 50) / 100) * 100 + 50,
        y: Math.round((rawY - 50) / 100) * 100 + 50
    };
}

async function activeVersionId() {
    const result = await pool.query({
        text: 'SELECT version_id FROM analysis.flood_dataset_versions WHERE dataset_key = $1 AND active = true',
        values: [DEFAULT_FLOOD_DATASET_KEY]
    });
    if (!result.rows[0])
        throw new Error(
            'Flood PostGIS schema is missing. Run scripts/prepare-flood-postgis.ps1 first.'
        );
    return result.rows[0].version_id;
}

async function readSource() {
    const dbfPath = sourcePath.replace(/\.shp$/i, '.dbf');
    const source = await shapefile.open(sourcePath, dbfPath);
    const byCell = new Map();
    let sourceRows = 0;
    while (true) {
        const record = await source.read();
        if (record.done) break;
        sourceRows += 1;
        const value = Number(record.value.properties?.Day_Total);
        const center = gridCenter(record.value);
        if (!center || !Number.isFinite(value) || value < 0) continue;
        byCell.set(`${center.x},${center.y}`, { ...center, value });
    }
    return { sourceRows, rows: [...byCell.values()] };
}

async function upsertBatch(versionId, rows) {
    const result = await pool.query({
        text: `
      WITH input AS (
        SELECT * FROM unnest($2::integer[], $3::integer[], $4::real[]) AS i(x, y, value)
      )
      INSERT INTO analysis.flood_values_100m (version_id, cell_id, fe03)
      SELECT $1, g.cell_id, i.value
      FROM input i
      JOIN analysis.grid_cells_100m g ON g.x = i.x AND g.y = i.y
      ON CONFLICT (version_id, cell_id) DO UPDATE SET
        fe03 = EXCLUDED.fe03,
        updated_at = now()
      RETURNING cell_id
    `,
        values: [
            versionId,
            rows.map((row) => row.x),
            rows.map((row) => row.y),
            rows.map((row) => row.value)
        ]
    });
    return result.rowCount;
}

async function rebuildStats(versionId) {
    await pool.query(
        'DELETE FROM analysis.flood_region_indicator_stats WHERE version_id = $1 AND indicator_code = $2',
        [versionId, 'FE03']
    );
    const aggregates = await pool.query({
        text: `
      SELECT r.region_code,
             count(*)::bigint AS total_cells,
             count(f.fe03)::bigint AS valid_cells,
             COALESCE(sum(f.fe03), 0) AS value_sum,
             COALESCE(max(f.fe03), 0) AS raw_max
      FROM analysis.region_grid_cells_100m r
      LEFT JOIN analysis.flood_values_100m f
        ON f.version_id = $1 AND f.cell_id = r.cell_id
      WHERE r.region_code LIKE '4111%'
      GROUP BY r.region_code
      HAVING count(f.fe03) > 0
      ORDER BY r.region_code
    `,
        values: [versionId]
    });
    const templates = await pool.query(`
    SELECT DISTINCT ON (s.region_code) s.region_code, s.payload
    FROM analysis.region_indicator_stats s
    JOIN analysis.hev_dataset_versions d ON d.version_id = s.version_id AND d.active = true
    WHERE s.indicator_code = 'H01'
    ORDER BY s.region_code, s.updated_at DESC
  `);
    const templateByRegion = new Map(templates.rows.map((row) => [row.region_code, row.payload]));
    let written = 0;
    for (const aggregate of aggregates.rows) {
        const template = templateByRegion.get(aggregate.region_code);
        if (!template) continue;
        const totalCells = Number(aggregate.total_cells);
        const validCells = Number(aggregate.valid_cells);
        const rawMax = Number(aggregate.raw_max);
        const rawMean = totalCells > 0 ? Number(aggregate.value_sum) / totalCells : 0;
        const normalizedMean = rawMax > 0 ? rawMean / rawMax : 0;
        const payload = {
            schemaVersion: 'livinglabs-flood-grid/v1',
            crs: template.crs,
            rows: template.rows,
            columns: template.columns,
            extent: template.extent,
            transform: template.transform,
            gridUnit: '100m',
            indicator: 'FE03',
            regionCode: aggregate.region_code,
            valueEncoding: 'sparse-index-value',
            valueCount: Number(template.rows) * Number(template.columns),
            unit: '명/셀·일평균',
            rawUnit: '명/셀·일평균',
            referencePeriod: '2021',
            sourceResolution: `${SOURCE} · EPSG:5186 원격자를 EPSG:5179 공통 100m 셀에 정렬`,
            stats: {
                rawMin: 0,
                rawMax,
                rawMean: Number(rawMean.toFixed(6)),
                normalizedMean: Number(normalizedMean.toFixed(6)),
                mean: Number(normalizedMean.toFixed(6)),
                validCells,
                totalCells
            }
        };
        await pool.query({
            text: `
        INSERT INTO analysis.flood_region_indicator_stats
          (version_id, region_code, indicator_code, payload, updated_at)
        VALUES ($1, $2, 'FE03', $3::jsonb, now())
        ON CONFLICT (version_id, region_code, indicator_code) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
            values: [versionId, aggregate.region_code, JSON.stringify(payload)]
        });
        written += 1;
    }
    return written;
}

async function main() {
    const versionId = await activeVersionId();
    if (replaceExisting) {
        await pool.query(
            'UPDATE analysis.flood_values_100m SET fe03 = NULL, updated_at = now() WHERE version_id = $1 AND fe03 IS NOT NULL',
            [versionId]
        );
    }
    const { sourceRows, rows } = await readSource();
    let matched = 0;
    for (let index = 0; index < rows.length; index += batchSize) {
        matched += await upsertBatch(versionId, rows.slice(index, index + batchSize));
    }
    const regionIndicators = await rebuildStats(versionId);
    await pool.query({
        text: `
      UPDATE analysis.flood_dataset_versions
      SET source_metadata = source_metadata || $2::jsonb, updated_at = now()
      WHERE version_id = $1
    `,
        values: [
            versionId,
            JSON.stringify({
                floating_population: {
                    indicator: 'FE03',
                    source: SOURCE,
                    reference_period: '2021',
                    source_crs: 'EPSG:5186',
                    service_grid: 'EPSG:5179 100m',
                    coverage: '수원시'
                }
            })
        ]
    });
    await pool.query('ANALYZE analysis.flood_values_100m, analysis.flood_region_indicator_stats');
    console.log(
        JSON.stringify({
            ok: true,
            indicator: 'FE03',
            sourceRows,
            uniqueCells: rows.length,
            matchedCells: matched,
            unmatchedCells: rows.length - matched,
            regionIndicators
        })
    );
}

try {
    await main();
} finally {
    await pool.end();
}
