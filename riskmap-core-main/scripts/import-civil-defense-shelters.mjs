import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, resolve } from 'node:path';
import pg from 'pg';
import XLSX from 'xlsx';

const { Pool } = pg;
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};

try {
  readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.replace(/^\uFEFF/, '').match(/^([^#=\s]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });
} catch {
  // Command-line and process environment values remain available.
}

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourcePath = argument('source');
if (!sourcePath) throw new Error('Use --source=<civil_defense_shelter.json|csv>');

const resolvedSourcePath = resolve(sourcePath);
const sourceExtension = extname(resolvedSourcePath).toLowerCase();
let sourceRows;
if (sourceExtension === '.json') {
  sourceRows = JSON.parse(readFileSync(resolvedSourcePath, 'utf8')).rows || [];
} else if (sourceExtension === '.csv') {
  const workbook = XLSX.read(readFileSync(resolvedSourcePath), { type: 'buffer', codepage: 949 });
  sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
} else {
  throw new Error('The source must be a JSON or CSV file');
}

function normalizedDate(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 20_000) {
    const parsed = XLSX.SSF.parse_date_code(Number(value));
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  return String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

const parsedRows = sourceRows.map((row) => {
  const longitude = Number(row['경도(EPSG4326)'] ?? row.LONGITUDE);
  const latitude = Number(row['위도(EPSG4326)'] ?? row.LATITUDE);
  if (
    !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
    longitude < 124 || longitude > 132 || latitude < 33 || latitude > 39
  ) return null;
  const name = String(row['시설명'] ?? row.CLNS_SHUNT_FCLTY_NM ?? '').trim();
  const roadAddress = String(row['도로명전체주소'] ?? row.RDNMADR ?? '').trim();
  const parcelAddress = String(row['소재지전체주소'] ?? row.LNMADR ?? '').trim();
  const managementId = String(row['관리번호'] ?? '').trim();
  const shelterId = createHash('sha256')
    .update(managementId || `${name}\u241f${roadAddress}\u241f${parcelAddress}\u241f${longitude}\u241f${latitude}`)
    .digest('hex');
  const capacity = Number.parseInt(row['최대수용인원'] ?? row.ACEPTNC_POSBL_CO, 10);
  const operatingStatus = String(row['운영상태'] ?? row.OPEN_YN ?? '').trim().toUpperCase();
  return {
    shelter_id: shelterId,
    source_key: 'civil_defense_shelter',
    name,
    road_address: roadAddress || null,
    parcel_address: parcelAddress || null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    open_yn: ['Y', '사용중', '운영중'].includes(operatingStatus) ? 'Y' : 'N',
    reference_date: normalizedDate(row['최종수정시점'] ?? row.REFERENCE_DATE),
    longitude,
    latitude,
  };
}).filter(Boolean);
const rows = [...new Map(parsedRows.map((row) => [row.shelter_id, row])).values()];

const pool = new Pool({
  host: argument('host') || process.env.VWORLD_POSTGIS_HOST || env.VWORLD_POSTGIS_HOST || '127.0.0.1',
  port: Number(argument('port') || process.env.VWORLD_POSTGIS_PORT || env.VWORLD_POSTGIS_PORT || 55432),
  database: argument('database') || process.env.VWORLD_POSTGIS_DATABASE || env.VWORLD_POSTGIS_DATABASE || 'livinglabs_postgis',
  user: argument('user') || process.env.VWORLD_POSTGIS_USER || env.VWORLD_POSTGIS_USER || 'postgres',
  password: process.env.VWORLD_POSTGIS_PASSWORD || env.VWORLD_POSTGIS_PASSWORD || undefined,
  max: 2,
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(readFileSync(resolve(root, 'scripts', 'analysis-civil-defense-shelter-points.sql'), 'utf8'));
  await client.query("DELETE FROM analysis.civil_defense_shelter_points WHERE source_key = 'civil_defense_shelter'");
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500);
    await client.query({
      text: `
        INSERT INTO analysis.civil_defense_shelter_points (
          shelter_id, source_key, name, road_address, parcel_address, capacity,
          open_yn, reference_date, longitude, latitude, geom, loaded_at
        )
        SELECT record.shelter_id, record.source_key, record.name,
               record.road_address, record.parcel_address, record.capacity,
               record.open_yn, record.reference_date::date,
               record.longitude, record.latitude,
               ST_Transform(ST_SetSRID(ST_MakePoint(record.longitude, record.latitude), 4326), 5179),
               now()
        FROM jsonb_to_recordset($1::jsonb) AS record(
          shelter_id text, source_key text, name text, road_address text,
          parcel_address text, capacity integer, open_yn char(1),
          reference_date text, longitude double precision, latitude double precision
        )
        ON CONFLICT (shelter_id) DO UPDATE SET
          source_key = EXCLUDED.source_key,
          name = EXCLUDED.name,
          road_address = EXCLUDED.road_address,
          parcel_address = EXCLUDED.parcel_address,
          capacity = EXCLUDED.capacity,
          open_yn = EXCLUDED.open_yn,
          reference_date = EXCLUDED.reference_date,
          longitude = EXCLUDED.longitude,
          latitude = EXCLUDED.latitude,
          geom = EXCLUDED.geom,
          loaded_at = now()
      `,
      values: [JSON.stringify(batch)],
    });
  }
  await client.query('COMMIT');
  const stats = await client.query(`
    SELECT count(*)::integer AS total,
           count(*) FILTER (WHERE open_yn = 'Y')::integer AS open,
           count(*) FILTER (WHERE open_yn = 'N')::integer AS closed
    FROM analysis.civil_defense_shelter_points
    WHERE source_key = 'civil_defense_shelter'
  `);
  console.log(JSON.stringify({ imported: rows.length, database: pool.options.database, ...stats.rows[0] }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
