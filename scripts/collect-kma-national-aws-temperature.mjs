import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const workspaceRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(
  workspaceRoot,
  'riskmap-core-main',
  'data',
  'raw',
  'kma',
  'national-aws-temperature-2021-2025',
);

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.match(/^([^#=\s]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((token) => {
      const [key, ...rest] = token.replace(/^--/, '').split('=');
      return [key, rest.length ? rest.join('=') : true];
    }),
  );
}

function compact(value) {
  return String(value).replace(/\D/g, '');
}

function monthsBetween(start, end) {
  const months = [];
  const first = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  for (const cursor = first; cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
}

function hourlyTimestamps(month, start, end) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const first = new Date(`${start > monthStart ? start : monthStart}T00:00:00Z`);
  const last = new Date(`${end < monthEnd ? end : monthEnd}T23:00:00Z`);
  const timestamps = [];
  for (const cursor = first; cursor <= last; cursor.setUTCHours(cursor.getUTCHours() + 1)) {
    timestamps.push(`${cursor.toISOString().slice(0, 10).replaceAll('-', '')}${String(cursor.getUTCHours()).padStart(2, '0')}00`);
  }
  return timestamps;
}

function isoDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

async function fetchKma(apiKey, pathname, params, options = {}) {
  const url = new URL(`https://apihub.kma.go.kr/api/typ01/url/${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  url.searchParams.set('authKey', apiKey);
  let lastError;
  const attempts = Number(options.attempts || 5);
  const timeoutMs = Number(options.timeoutMs || 10000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const payload = new TextDecoder('euc-kr').decode(bytes);
      if (response.status === 403) {
        const error = new Error(`KMA HTTP 403: ${payload.slice(0, 160)}`);
        error.fatal = true;
        throw error;
      }
      if (!response.ok) throw new Error(`KMA HTTP ${response.status}: ${payload.slice(0, 160)}`);
      if (payload.includes('"status" : 403') || payload.includes('활용신청이 필요한')) {
        throw new Error('KMA API utilization approval is required');
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (error?.fatal) throw error;
      if (attempt < attempts) await new Promise((done) => setTimeout(done, attempt * 500));
    }
  }
  throw lastError;
}

function parseStations(payload, network) {
  const stations = new Map();
  for (const line of payload.split(/\r?\n/)) {
    const text = line.trim();
    if (!/^\d+\s+\d/.test(text)) continue;
    const values = text.split(/\s+/);
    const stationId = Number(values[0]);
    const longitude = Number(values[1]);
    const latitude = Number(values[2]);
    const elevation = Number(values[3]);
    if (!Number.isInteger(stationId) || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    stations.set(stationId, {
      station_id: stationId,
      network,
      longitude,
      latitude,
      elevation_m: Number.isFinite(elevation) && elevation > -90 ? elevation : null,
    });
  }
  return stations;
}

function parseHourly(payload, allowedStationIds) {
  const rows = [];
  for (const line of payload.split(/\r?\n/)) {
    const text = line.trim();
    if (!/^\d{12}\s+\d+/.test(text)) continue;
    const values = text.split(/\s+/);
    const stationId = Number(values[1]);
    const temperature = Number(values[2]);
    if (!allowedStationIds.has(stationId) || !Number.isFinite(temperature) || temperature <= -90) continue;
    rows.push({ timestamp: values[0], station_id: stationId, temperature_c: temperature });
  }
  return rows;
}

async function mapLimit(items, limit, mapper) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
}

function csv(rows) {
  const columns = [
    'station_id',
    'network',
    'longitude',
    'latitude',
    'elevation_m',
    'date',
    'valid_hours',
    'mean_c',
    'maximum_c',
    'minimum_c',
  ];
  const body = rows.map((row) => columns.map((column) => row[column] ?? '').join(',')).join('\n');
  return `${columns.join(',')}\n${body}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = {
    ...readEnv(resolve(workspaceRoot, '.env.local')),
    ...readEnv(resolve(workspaceRoot, 'riskmap-core-main', '.env.local')),
    ...process.env,
  };
  if (!env.KMA_API_KEY) throw new Error('KMA_API_KEY is missing');

  const start = String(args.start || '2021-01-01');
  const end = String(args.end || '2025-12-31');
  const concurrency = Math.max(1, Math.min(12, Number(args.concurrency || 8)));
  const maxMonths = args['max-months'] ? Math.max(1, Number(args['max-months'])) : Infinity;
  mkdirSync(outputRoot, { recursive: true });

  console.log('Loading KMA AWS and ASOS station catalogs...');
  const [awsPayload, asosPayload] = await Promise.all([
    fetchKma(env.KMA_API_KEY, 'stn_inf.php', { inf: 'AWS', stn: 0, help: 0 }),
    fetchKma(env.KMA_API_KEY, 'stn_inf.php', { inf: 'SFC', stn: 0, help: 0 }),
  ]);
  const awsStations = parseStations(awsPayload, 'AWS');
  const asosStations = parseStations(asosPayload, 'ASOS');
  for (const stationId of asosStations.keys()) awsStations.delete(stationId);
  const stationIds = new Set(awsStations.keys());
  if (stationIds.size < 300) throw new Error(`Unexpected AWS station count after ASOS deduplication: ${stationIds.size}`);
  console.log(`Station catalogs ready: AWS ${stationIds.size}, ASOS ${asosStations.size}`);
  writeFileSync(
    resolve(outputRoot, 'aws-stations.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), stations: [...awsStations.values()] }, null, 2),
    'utf8',
  );

  const allMonths = monthsBetween(start, end);
  const selectedMonths = allMonths.slice(0, maxMonths);
  const manifest = {
    source: 'KMA API Hub awsh.php hourly temperature',
    period: { start, end },
    station_network: 'AWS excluding station IDs also present in ASOS',
    station_count: stationIds.size,
    minimum_daily_valid_hours: 18,
    months: [],
    generated_at: new Date().toISOString(),
  };

  for (let monthIndex = 0; monthIndex < selectedMonths.length; monthIndex += 1) {
    const month = selectedMonths[monthIndex];
    const timestamps = hourlyTimestamps(month, start, end);
    const target = resolve(outputRoot, `aws-daily-temperature-${month}.csv.gz`);
    const metadataPath = resolve(outputRoot, `aws-daily-temperature-${month}.metadata.json`);
    if (existsSync(target) && existsSync(metadataPath) && !args.refresh) {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      const missingHours = Array.isArray(metadata.missing_hours) ? metadata.missing_hours.length : Infinity;
      const toleratedMissingHours = Math.max(6, Math.floor(timestamps.length * 0.01));
      const complete = Number(metadata.requested_hours) === timestamps.length
        && missingHours <= toleratedMissingHours
        && Number(metadata.valid_daily_rows) > 0;
      if (complete) {
        manifest.months.push(metadata);
        console.log(`[${monthIndex + 1}/${selectedMonths.length}] cached ${month} · ${metadata.daily_rows} rows`);
        continue;
      }
      console.log(`[${monthIndex + 1}/${selectedMonths.length}] incomplete cache ${month} · collecting again`);
    }

    console.log(`[${monthIndex + 1}/${selectedMonths.length}] collecting ${month} · ${timestamps.length} hours`);
    const daily = new Map();
    let observations = 0;
    const failedTimestamps = [];
    const acceptPayload = (payload) => {
      for (const row of parseHourly(payload, stationIds)) {
        const date = isoDate(row.timestamp);
        const key = `${row.station_id}:${date}`;
        const group = daily.get(key) || {
          station_id: row.station_id,
          date,
          count: 0,
          sum: 0,
          maximum_c: -Infinity,
          minimum_c: Infinity,
        };
        group.count += 1;
        group.sum += row.temperature_c;
        group.maximum_c = Math.max(group.maximum_c, row.temperature_c);
        group.minimum_c = Math.min(group.minimum_c, row.temperature_c);
        daily.set(key, group);
        observations += 1;
      }
    };
    await mapLimit(timestamps, concurrency, async (timestamp, index) => {
      try {
        const payload = await fetchKma(env.KMA_API_KEY, 'awsh.php', {
          var: 'TA',
          tm: timestamp,
          stn: 0,
          help: 0,
        });
        acceptPayload(payload);
      } catch (error) {
        if (error?.fatal) throw error;
        failedTimestamps.push(timestamp);
      }
      if ((index + 1) % 120 === 0) console.log(`  ${month}: ${index + 1}/${timestamps.length} hours`);
    });
    const unrecoveredTimestamps = [];
    if (failedTimestamps.length) {
      console.log(`  ${month}: recovering ${failedTimestamps.length} timed-out hours`);
      for (const timestamp of failedTimestamps.sort()) {
        try {
          const payload = await fetchKma(
            env.KMA_API_KEY,
            'awsh.php',
            { var: 'TA', tm: timestamp, stn: 0, help: 0 },
            { attempts: 3, timeoutMs: 15000 },
          );
          acceptPayload(payload);
        } catch (error) {
          unrecoveredTimestamps.push(timestamp);
          console.warn(`  ${month}: unavailable hour ${timestamp}`);
        }
      }
    }

    const rows = [...daily.values()]
      .map((group) => {
        const station = awsStations.get(group.station_id);
        const valid = group.count >= 18;
        return {
          ...station,
          date: group.date,
          valid_hours: group.count,
          mean_c: valid ? Number((group.sum / group.count).toFixed(3)) : null,
          maximum_c: valid ? group.maximum_c : null,
          minimum_c: valid ? group.minimum_c : null,
        };
      })
      .sort((left, right) => left.station_id - right.station_id || left.date.localeCompare(right.date));
    writeFileSync(target, gzipSync(Buffer.from(csv(rows), 'utf8'), { level: 9 }));
    const metadata = {
      month,
      requested_hours: timestamps.length,
      recovered_hours: failedTimestamps.length - unrecoveredTimestamps.length,
      missing_hours: unrecoveredTimestamps,
      hourly_observations: observations,
      daily_rows: rows.length,
      valid_daily_rows: rows.filter((row) => row.maximum_c !== null && row.minimum_c !== null).length,
      file: target,
      generated_at: new Date().toISOString(),
    };
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    manifest.months.push(metadata);
    console.log(`[${monthIndex + 1}/${selectedMonths.length}] completed ${month} · ${rows.length} rows`);
  }

  manifest.months = readdirSync(outputRoot)
    .filter((name) => /^aws-daily-temperature-\d{4}-\d{2}\.metadata\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(resolve(outputRoot, name), 'utf8')))
    .sort((left, right) => String(left.month).localeCompare(String(right.month)));
  manifest.cached_months = manifest.months.length;
  manifest.cached_period = manifest.months.length
    ? { start: manifest.months[0].month, end: manifest.months.at(-1).month }
    : null;
  writeFileSync(resolve(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    `Done: ${selectedMonths.length}/${allMonths.length} requested months, `
    + `${manifest.cached_months} cached months, ${stationIds.size} AWS stations`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
