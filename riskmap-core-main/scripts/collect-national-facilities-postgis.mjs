import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const snapshotRoot = resolve(workspaceRoot, 'data', 'LivingLabs_flood_national', '06_facilities');
const DATA_GO_BASE = 'https://www.data.go.kr';
const batchSize = 1000;

const SOURCES = [
    {
        key: 'civil_defense_shelter',
        publicDataPk: '15021098',
        category: '대피시설',
        nameField: 'CLNS_SHUNT_FCLTY_NM',
        addressField: 'RDNMADR',
        latitudeField: 'LATITUDE',
        longitudeField: 'LONGITUDE',
        capacityField: 'ACEPTNC_POSBL_CO',
        referenceDateField: 'REFERENCE_DATE'
    },
    {
        key: 'urban_rail_station',
        publicDataPk: '15013205',
        category: '도시철도 역사',
        nameField: 'STATN_NM',
        addressField: 'RDNMADR',
        latitudeField: 'LATITUDE',
        longitudeField: 'LONGITUDE',
        capacityField: null,
        referenceDateField: 'REFERENCE_DATE'
    }
];

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
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.json();
}

async function readStandardSource(source) {
    const headerUrl = new URL('/download/columList.json', DATA_GO_BASE);
    headerUrl.searchParams.set('pk', source.publicDataPk);
    headerUrl.searchParams.set('ext', 'JSON');
    const header = await fetchJson(headerUrl);
    const perPage = 10000;
    const pages = Math.ceil(Number(header.totalCount) / perPage);
    const rows = [];
    for (let page = 1; page <= pages; page += 1) {
        const dataUrl = new URL('/download/standard.json', DATA_GO_BASE);
        dataUrl.searchParams.set('publicDataPk', source.publicDataPk);
        for (const column of header.tableVO.colNmList)
            dataUrl.searchParams.append('colNmList', column);
        dataUrl.searchParams.set('totalCount', header.totalCount);
        dataUrl.searchParams.set('svcTableNm', header.tableVO.svcTableNm);
        dataUrl.searchParams.set('perPage', String(perPage));
        dataUrl.searchParams.set('page', String(page));
        rows.push(...(await fetchJson(dataUrl)));
    }
    return { header, rows };
}

function normalizedRow(source, row) {
    const latitude = Number(row[source.latitudeField]);
    const longitude = Number(row[source.longitudeField]);
    const name = String(row[source.nameField] || '').trim();
    const address = String(row[source.addressField] || '').trim();
    const sourceId = createHash('sha256')
        .update([source.key, name, address, latitude, longitude].join('|'))
        .digest('hex');
    return {
        sourceId,
        name,
        category: source.category,
        address,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        capacity:
            source.capacityField && Number.isFinite(Number(row[source.capacityField]))
                ? Number(row[source.capacityField])
                : null,
        referenceDate: row[source.referenceDateField] || null,
        attributes: row
    };
}

async function prepareSchema() {
    await pool.query(`
    CREATE SCHEMA IF NOT EXISTS analysis;
    CREATE TABLE IF NOT EXISTS analysis.national_facilities (
      source_key text NOT NULL,
      source_id text NOT NULL,
      category text NOT NULL,
      name text NOT NULL,
      road_address text,
      latitude double precision,
      longitude double precision,
      capacity integer,
      reference_date date,
      attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
      geom geometry(Point, 5179),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_key, source_id)
    );
    CREATE INDEX IF NOT EXISTS national_facilities_source_idx
      ON analysis.national_facilities (source_key, category);
    CREATE INDEX IF NOT EXISTS national_facilities_geom_gix
      ON analysis.national_facilities USING gist (geom);
  `);
}

async function upsertRows(source, rows) {
    let written = 0;
    for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize);
        const result = await pool.query({
            text: `
        WITH input AS (
          SELECT * FROM jsonb_to_recordset($2::jsonb) AS i(
            source_id text, category text, name text, road_address text,
            latitude double precision, longitude double precision,
            capacity integer, reference_date date, attributes jsonb
          )
        )
        INSERT INTO analysis.national_facilities (
          source_key, source_id, category, name, road_address,
          latitude, longitude, capacity, reference_date, attributes, geom, updated_at
        )
        SELECT $1, source_id, category, name, road_address,
               latitude, longitude, capacity, reference_date, attributes,
               CASE WHEN latitude BETWEEN 30 AND 40 AND longitude BETWEEN 120 AND 135
                 THEN ST_Transform(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), 5179)
                 ELSE NULL END,
               now()
        FROM input
        ON CONFLICT (source_key, source_id) DO UPDATE SET
          category = EXCLUDED.category,
          name = EXCLUDED.name,
          road_address = EXCLUDED.road_address,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          capacity = EXCLUDED.capacity,
          reference_date = EXCLUDED.reference_date,
          attributes = EXCLUDED.attributes,
          geom = EXCLUDED.geom,
          updated_at = now()
      `,
            values: [
                source.key,
                JSON.stringify(
                    batch.map((row) => ({
                        source_id: row.sourceId,
                        category: row.category,
                        name: row.name,
                        road_address: row.address,
                        latitude: row.latitude,
                        longitude: row.longitude,
                        capacity: row.capacity,
                        reference_date: row.referenceDate,
                        attributes: row.attributes
                    }))
                )
            ]
        });
        written += result.rowCount;
    }
    return written;
}

async function main() {
    await mkdir(snapshotRoot, { recursive: true });
    await prepareSchema();
    const summary = [];
    for (const source of SOURCES) {
        const { header, rows } = await readStandardSource(source);
        const normalized = [
            ...new Map(
                rows.map((row) => normalizedRow(source, row)).map((row) => [row.sourceId, row])
            ).values()
        ];
        await writeFile(
            resolve(snapshotRoot, `${source.key}.json`),
            JSON.stringify({ source, collectedAt: new Date().toISOString(), rows }, null, 2),
            'utf8'
        );
        await pool.query('DELETE FROM analysis.national_facilities WHERE source_key = $1', [
            source.key
        ]);
        const written = await upsertRows(source, normalized);
        const validGeometry = normalized.filter(
            (row) => row.latitude !== null && row.longitude !== null
        ).length;
        summary.push({
            source: source.key,
            expected: Number(header.totalCount),
            collected: rows.length,
            written,
            validGeometry
        });
    }
    await pool.query('ANALYZE analysis.national_facilities');
    console.log(JSON.stringify({ ok: true, summary }));
}

try {
    await main();
} finally {
    await pool.end();
}
