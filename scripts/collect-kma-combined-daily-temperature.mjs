import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const workspaceRoot = resolve(import.meta.dirname, '..');
const defaultOutputRoot = resolve(
  workspaceRoot,
  'riskmap-core-main',
  'data',
  'raw',
  'kma',
  'combined-daily-temperature',
);

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }
  return args;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

function compact(date) {
  return date.replaceAll('-', '');
}

function isoDate(value) {
  const text = String(value).replace(/\D/g, '').slice(0, 8);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function monthWindows(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const windows = [];
  for (
    let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    cursor <= endDate;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const first = new Date(Math.max(cursor.getTime(), startDate.getTime()));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const last = new Date(Math.min(monthEnd.getTime(), endDate.getTime()));
    windows.push([
      first.toISOString().slice(0, 10),
      last.toISOString().slice(0, 10),
    ]);
  }
  return windows;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchKma(apiKey, pathname, params, options = {}) {
  const attempts = Number(options.attempts || 5);
  const timeoutMs = Number(options.timeoutMs || 60000);
  const url = new URL(`https://apihub.kma.go.kr/api/typ01/url/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set('authKey', apiKey);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const payload = new TextDecoder('euc-kr').decode(bytes);
      if (!response.ok) {
        throw new Error(`KMA API HTTP ${response.status}: ${payload.slice(0, 240).trim()}`);
      }
      if (/활용신청|인증키.*(오류|없|필요)|Forbidden/i.test(payload)) {
        throw new Error(`KMA API authorization error: ${payload.slice(0, 240).trim()}`);
      }
      return payload;
    } catch (error) {
      const cause = error?.cause;
      const detail = cause
        ? ` [cause=${cause.code || cause.name || 'unknown'}: ${cause.message || String(cause)}]`
        : '';
      lastError = new Error(`${error?.message || String(error)}${detail}`);
      if (attempt < attempts) await delay(attempt * 1000);
    }
  }
  throw lastError;
}

function parseStationIds(payload) {
  const ids = new Set();
  for (const line of payload.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const values = text.includes(',')
      ? text.split(',').map((value) => value.trim())
      : text.split(/\s+/);
    const stationId = Number(values[0]);
    if (Number.isInteger(stationId)) ids.add(stationId);
  }
  return ids;
}

async function loadAsosIds(apiKey) {
  const indicatorPath = resolve(
    workspaceRoot,
    'riskmap-core-main',
    'static',
    'analysis-data',
    'national-observed-heat',
    'kma-asos-aws-indicators-2021-2025.json',
  );
  if (existsSync(indicatorPath)) {
    const document = JSON.parse(readFileSync(indicatorPath, 'utf8'));
    const ids = new Set(
      (document.station_years || [])
        .filter((row) => row.network === 'ASOS')
        .map((row) => Number(row.station_id))
        .filter(Number.isInteger),
    );
    if (ids.size) {
      console.log(`Using cached ASOS station IDs: ${ids.size}`);
      return ids;
    }
  }
  console.log('Loading KMA ASOS station catalog...');
  const catalog = await fetchKma(apiKey, 'stn_inf.php', {
    inf: 'SFC', stn: 0, help: 0,
  });
  return parseStationIds(catalog);
}

function parseDaily(payload, variable) {
  const rows = [];
  for (const line of payload.split(/\r?\n/)) {
    const text = line.trim();
    if (!/^\d{8}(?:\d{4})?[,\s]+\d+/.test(text)) continue;
    const values = text.includes(',')
      ? text.split(',').map((value) => value.trim())
      : text.split(/\s+/);
    const stationId = Number(values[1]);
    const longitude = Number(values[2]);
    const latitude = Number(values[3]);
    const elevation = Number(values[4]);
    const value = Number(values[5]);
    if (!Number.isInteger(stationId) || !Number.isFinite(value) || value <= -90) continue;
    rows.push({
      station_id: stationId,
      date: isoDate(values[0]),
      longitude: Number.isFinite(longitude) ? longitude : null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      elevation_m: Number.isFinite(elevation) && elevation > -90 ? elevation : null,
      [variable]: value,
    });
  }
  return rows;
}

function csv(rows) {
  const headers = [
    'station_id', 'network', 'longitude', 'latitude', 'elevation_m', 'date',
    'maximum_c', 'minimum_c',
  ];
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => row[header] ?? '').join(',')).join('\n')}\n`;
}

function loadRaw(path) {
  return gunzipSync(readFileSync(path)).toString('utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = {
    ...readEnvFile(resolve(workspaceRoot, '.env.local')),
    ...readEnvFile(resolve(workspaceRoot, 'riskmap-core-main', '.env.local')),
    ...process.env,
  };
  if (!env.KMA_API_KEY) throw new Error('KMA_API_KEY is missing');
  const start = String(args.start || '2021-01-01');
  const end = String(args.end || '2025-12-31');
  const outputRoot = resolve(String(args['output-dir'] || defaultOutputRoot));
  const refresh = Boolean(args.refresh);
  mkdirSync(outputRoot, { recursive: true });

  const asosIds = await loadAsosIds(env.KMA_API_KEY);
  const windows = monthWindows(start, end);
  const manifest = {
    title: 'KMA combined ASOS/AWS daily maximum and minimum temperature',
    source_endpoint: 'sfc_aws_day.php',
    period: { start, end },
    requested_months: windows.length,
    months: [],
    generated_at: null,
  };

  for (let index = 0; index < windows.length; index += 1) {
    const [windowStart, windowEnd] = windows[index];
    const month = windowStart.slice(0, 7);
    const maximumRaw = resolve(outputRoot, `kma-daily-ta_max-${month}.txt.gz`);
    const minimumRaw = resolve(outputRoot, `kma-daily-ta_min-${month}.txt.gz`);
    const dailyPath = resolve(outputRoot, `kma-daily-temperature-${month}.csv.gz`);
    const metadataPath = resolve(outputRoot, `kma-daily-temperature-${month}.metadata.json`);
    if (!refresh && existsSync(dailyPath) && existsSync(metadataPath)) {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      manifest.months.push(metadata);
      console.log(`[${index + 1}/${windows.length}] cached ${month} · ${metadata.daily_rows} rows`);
      continue;
    }

    const fetchVariable = async (variable, path) => {
      if (!refresh && existsSync(path)) return loadRaw(path);
      const payload = await fetchKma(env.KMA_API_KEY, 'sfc_aws_day.php', {
        tm1: compact(windowStart),
        tm2: compact(windowEnd),
        obs: variable,
        stn: 0,
        disp: 1,
        help: 0,
      });
      writeFileSync(path, gzipSync(Buffer.from(payload, 'utf8'), { level: 9 }));
      return payload;
    };

    const maximumPayload = await fetchVariable('ta_max', maximumRaw);
    const minimumPayload = await fetchVariable('ta_min', minimumRaw);
    const maximumRows = parseDaily(maximumPayload, 'maximum_c');
    const minimumRows = parseDaily(minimumPayload, 'minimum_c');
    if (!maximumRows.length || !minimumRows.length) {
      throw new Error(
        `${month}: no parsed daily data (ta_max=${maximumRows.length}, ta_min=${minimumRows.length}). `
        + `Response prefixes: ${maximumPayload.slice(0, 160).trim()} | ${minimumPayload.slice(0, 160).trim()}`,
      );
    }

    const daily = new Map();
    for (const row of [...maximumRows, ...minimumRows]) {
      const key = `${row.station_id}:${row.date}`;
      daily.set(key, { ...(daily.get(key) || {}), ...row });
    }
    const rows = [...daily.values()]
      .map((row) => ({
        station_id: row.station_id,
        network: asosIds.has(row.station_id) ? 'ASOS' : 'AWS',
        longitude: row.longitude,
        latitude: row.latitude,
        elevation_m: row.elevation_m,
        date: row.date,
        maximum_c: row.maximum_c ?? null,
        minimum_c: row.minimum_c ?? null,
      }))
      .sort((left, right) => left.station_id - right.station_id || left.date.localeCompare(right.date));
    writeFileSync(dailyPath, gzipSync(Buffer.from(csv(rows), 'utf8'), { level: 9 }));
    const metadata = {
      month,
      period: { start: windowStart, end: windowEnd },
      daily_rows: rows.length,
      stations: new Set(rows.map((row) => row.station_id)).size,
      asos_stations: new Set(rows.filter((row) => row.network === 'ASOS').map((row) => row.station_id)).size,
      aws_stations: new Set(rows.filter((row) => row.network === 'AWS').map((row) => row.station_id)).size,
      maximum_rows: rows.filter((row) => row.maximum_c !== null).length,
      minimum_rows: rows.filter((row) => row.minimum_c !== null).length,
      files: { maximum_raw: maximumRaw, minimum_raw: minimumRaw, daily: dailyPath },
      generated_at: new Date().toISOString(),
    };
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    manifest.months.push(metadata);
    console.log(`[${index + 1}/${windows.length}] completed ${month} · ${rows.length} rows`);
  }

  manifest.generated_at = new Date().toISOString();
  writeFileSync(resolve(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Done: ${manifest.months.length}/${windows.length} months`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
