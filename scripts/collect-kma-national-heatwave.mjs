import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const defaultRawDir = resolve(root, 'riskmap-core-main', 'data', 'raw', 'kma', 'national-asos-temperature-2021-2025');
const defaultPublishDir = resolve(root, 'riskmap-core-main', 'static', 'analysis-data', 'national-observed-heat');

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^([^#=\s]+)=(.*)$/)).filter(Boolean)
    .map((match) => [match[1], match[2].trim()]));
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((token) => {
    const [key, ...rest] = token.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }));
}

function compact(value) { return String(value).replace(/\D/g, ''); }
function isoDate(digits) { return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`; }
function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function monthWindows(start, end) {
  const windows = [];
  const last = new Date(`${end}T00:00:00Z`);
  let cursor = new Date(`${start}T00:00:00Z`);
  while (cursor <= last) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowEnd = monthEnd < last ? monthEnd : last;
    windows.push([cursor.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10)]);
    cursor = new Date(windowEnd.getTime() + 86400000);
  }
  return windows;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function dayOfYear(date) {
  const value = new Date(`${date}T00:00:00Z`);
  return Math.floor((value - Date.UTC(value.getUTCFullYear(), 0, 0)) / 86400000);
}

function circularDayDistance(left, right) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 366 - distance);
}

export function parseTemperaturePayload(payload) {
  const rows = [];
  for (const original of payload.split(/\r?\n/)) {
    const line = original.trim();
    if (!/^\d{12}[,\s]+\d+/.test(line)) continue;
    const values = line.includes(',') ? line.split(',').map((value) => value.trim()) : line.split(/\s+/);
    if (values.length < 6) continue;
    const temperature = Number(values[5]);
    const longitude = Number(values[2]);
    const latitude = Number(values[3]);
    if (!Number.isFinite(temperature) || temperature <= -90 || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const timestamp = values[0];
    rows.push({
      timestamp,
      date: isoDate(timestamp.slice(0, 8)),
      hour: Number(timestamp.slice(8, 10)),
      station_id: Number(values[1]),
      longitude,
      latitude,
      elevation_m: Number(values[4]) > -90 ? Number(values[4]) : null,
      temperature_c: temperature,
    });
  }
  return rows;
}

export function aggregateDaily(rows, minimumDailyHours = 18, minimumNightHours = 12) {
  const daily = new Map();
  const nights = new Map();
  const stations = new Map();
  for (const row of rows) {
    stations.set(row.station_id, {
      station_id: row.station_id, longitude: row.longitude, latitude: row.latitude, elevation_m: row.elevation_m,
    });
    const dayKey = `${row.station_id}:${row.date}`;
    const day = daily.get(dayKey) || { station_id: row.station_id, date: row.date, values: [] };
    day.values.push(row.temperature_c);
    daily.set(dayKey, day);

    if (row.hour >= 19 || row.hour <= 9) {
      const nightDate = row.hour >= 19 ? row.date : addDays(row.date, -1);
      const nightKey = `${row.station_id}:${nightDate}`;
      const night = nights.get(nightKey) || { station_id: row.station_id, date: nightDate, values: [] };
      night.values.push(row.temperature_c);
      nights.set(nightKey, night);
    }
  }
  return {
    stations,
    days: [...daily.values()].map((day) => ({
      station_id: day.station_id,
      date: day.date,
      valid_hours: day.values.length,
      maximum_c: day.values.length >= minimumDailyHours ? Math.max(...day.values) : null,
    })),
    nights: [...nights.values()].map((night) => ({
      station_id: night.station_id,
      date: night.date,
      valid_hours: night.values.length,
      minimum_c: night.values.length >= minimumNightHours ? Math.min(...night.values) : null,
    })),
  };
}

function calculateWsdi(dailyByStation) {
  const thresholds = new Map();
  for (const [stationId, days] of dailyByStation) {
    for (let doy = 1; doy <= 366; doy += 1) {
      const sample = days.filter((day) => day.maximum_c !== null && circularDayDistance(dayOfYear(day.date), doy) <= 2)
        .map((day) => day.maximum_c);
      if (sample.length >= 10) thresholds.set(`${stationId}:${doy}`, percentile(sample, 0.9));
    }
  }
  const results = new Map();
  for (const [stationId, days] of dailyByStation) {
    const byYear = new Map();
    for (const day of days) {
      const year = Number(day.date.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(day);
    }
    for (const [year, yearDays] of byYear) {
      yearDays.sort((a, b) => a.date.localeCompare(b.date));
      let run = 0;
      let previous = null;
      let wsdiDays = 0;
      let maximumRun = 0;
      const close = () => {
        maximumRun = Math.max(maximumRun, run);
        if (run >= 6) wsdiDays += run;
        run = 0;
      };
      for (const day of yearDays) {
        const threshold = thresholds.get(`${stationId}:${dayOfYear(day.date)}`);
        const exceed = day.maximum_c !== null && threshold !== undefined && day.maximum_c > threshold;
        if (exceed) {
          if (previous && addDays(previous, 1) !== day.date) close();
          run += 1;
          previous = day.date;
        } else {
          close();
          previous = null;
        }
      }
      close();
      results.set(`${stationId}:${year}`, { wsdi_days: wsdiDays, maximum_warm_spell_days: maximumRun });
    }
  }
  return results;
}

export function summarizeIndicators(rows, options = {}) {
  const dailyHours = Number(options.minimumDailyHours || 18);
  const nightHours = Number(options.minimumNightHours || 12);
  const { stations, days, nights } = aggregateDaily(rows, dailyHours, nightHours);
  const dailyByStation = new Map();
  for (const day of days) {
    if (!dailyByStation.has(day.station_id)) dailyByStation.set(day.station_id, []);
    dailyByStation.get(day.station_id).push(day);
  }
  const wsdi = calculateWsdi(dailyByStation);
  const nightLookup = new Map(nights.map((night) => [`${night.station_id}:${night.date}`, night]));
  const groups = new Map();
  for (const day of days) {
    const year = Number(day.date.slice(0, 4));
    const key = `${day.station_id}:${year}`;
    if (!groups.has(key)) groups.set(key, { station_id: day.station_id, year, valid_days: 0, heatwave_days: 0, valid_nights: 0, tropical_nights: 0 });
    const group = groups.get(key);
    if (day.maximum_c !== null) {
      group.valid_days += 1;
      if (day.maximum_c >= 33) group.heatwave_days += 1;
    }
    const night = nightLookup.get(`${day.station_id}:${day.date}`);
    if (night?.minimum_c !== null && night?.minimum_c !== undefined) {
      group.valid_nights += 1;
      if (night.minimum_c >= 25) group.tropical_nights += 1;
    }
  }
  return [...groups.values()].map((group) => ({
    ...stations.get(group.station_id),
    ...group,
    ...(wsdi.get(`${group.station_id}:${group.year}`) || { wsdi_days: null, maximum_warm_spell_days: null }),
  })).sort((a, b) => a.station_id - b.station_id || a.year - b.year);
}

function csv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return `${keys.join(',')}\n${rows.map((row) => keys.map((key) => row[key] ?? '').join(',')).join('\n')}\n`;
}

async function fetchTemperature(apiKey, start, end) {
  const url = new URL('https://apihub.kma.go.kr/api/typ01/url/kma_sfctm5.php');
  for (const [key, value] of Object.entries({
    tm1: `${compact(start)}0000`, tm2: `${compact(end)}2300`, obs: 'TA', stn: 0, disp: 0, help: 0, authKey: apiKey,
  })) url.searchParams.set(key, String(value));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const payload = new TextDecoder('euc-kr').decode(bytes);
      if (response.status === 403) {
        const error = new Error(`KMA API HTTP 403: ${payload.slice(0, 200).trim()}`);
        error.fatal = true;
        throw error;
      }
      if (!response.ok) throw new Error(`KMA API HTTP ${response.status}: ${payload.slice(0, 200).trim()}`);
      if (!/^\d{12}[,\s]+\d+/m.test(payload)) throw new Error(`KMA API returned no observations: ${payload.slice(0, 200).trim()}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (error?.fatal) throw error;
      if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * 1000));
    }
  }
  throw lastError;
}

function runSelfTest() {
  const rows = [];
  const fixture = [
    ['2021-07-01', 34, 26, 26],
    ['2021-07-02', 35, 26, 24],
    ['2021-07-03', 32, 24, 24],
  ];
  for (const [date, maximum, morningMinimum, eveningMinimum] of fixture) {
    for (let hour = 0; hour < 24; hour += 1) rows.push({
      timestamp: `${compact(date)}${String(hour).padStart(2, '0')}00`, date, hour, station_id: 119,
      longitude: 127, latitude: 37, elevation_m: 10,
      temperature_c: hour === 15 ? maximum : (hour <= 9 ? morningMinimum : (hour >= 19 ? eveningMinimum : 28)),
    });
  }
  const result = summarizeIndicators(rows, { minimumDailyHours: 18, minimumNightHours: 12 });
  if (result[0].heatwave_days !== 2 || result[0].tropical_nights !== 1) throw new Error(`Self-test failed: ${JSON.stringify(result)}`);
  console.log('Self-test passed');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) return runSelfTest();
  const env = { ...readEnvFile(resolve(root, '.env.local')), ...readEnvFile(resolve(root, 'riskmap-core-main', '.env.local')), ...process.env };
  if (!env.KMA_API_KEY) throw new Error('KMA_API_KEY is missing');
  const start = String(args.start || '2021-01-01');
  const end = String(args.end || '2025-12-31');
  const rawDir = resolve(String(args['raw-dir'] || defaultRawDir));
  const publishDir = resolve(String(args['publish-dir'] || defaultPublishDir));
  const dailyDir = args['daily-dir'] ? resolve(String(args['daily-dir'])) : null;
  const dailyOnly = Boolean(args['daily-only']);
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(publishDir, { recursive: true });
  if (dailyDir) mkdirSync(dailyDir, { recursive: true });
  const allRows = [];
  const dailyMonths = [];
  const windows = monthWindows(start, end);
  for (let index = 0; index < windows.length; index += 1) {
    const [windowStart, windowEnd] = windows[index];
    const month = windowStart.slice(0, 7);
    const dailyPath = dailyDir ? resolve(dailyDir, `kma-daily-temperature-${month}.csv.gz`) : null;
    const dailyMetadataPath = dailyDir ? resolve(dailyDir, `kma-daily-temperature-${month}.metadata.json`) : null;
    if (dailyOnly && existsSync(dailyPath) && existsSync(dailyMetadataPath) && !args.refresh) {
      dailyMonths.push(JSON.parse(readFileSync(dailyMetadataPath, 'utf8')));
      console.log(`[${index + 1}/${windows.length}] cached daily ${month}`);
      continue;
    }
    const cache = resolve(rawDir, `asos-ta-${compact(windowStart)}-${compact(windowEnd)}.txt.gz`);
    let payload;
    if (existsSync(cache) && !args.refresh) {
      payload = gunzipSync(readFileSync(cache)).toString('utf8');
      console.log(`[${index + 1}/${windows.length}] cached ${windowStart}~${windowEnd}`);
    } else {
      payload = await fetchTemperature(env.KMA_API_KEY, windowStart, windowEnd);
      writeFileSync(cache, gzipSync(Buffer.from(payload, 'utf8'), { level: 9 }));
      console.log(`[${index + 1}/${windows.length}] fetched ${windowStart}~${windowEnd}`);
    }
    const rows = parseTemperaturePayload(payload);
    if (!rows.length) throw new Error(`No parsed observations for ${windowStart}~${windowEnd}`);
    if (dailyDir) {
      const { stations, days } = aggregateDaily(rows);
      const dailyRows = days
        .filter((day) => day.maximum_c !== null)
        .map((day) => ({
          station_id: day.station_id,
          network: 'ASOS',
          longitude: stations.get(day.station_id)?.longitude ?? '',
          latitude: stations.get(day.station_id)?.latitude ?? '',
          elevation_m: stations.get(day.station_id)?.elevation_m ?? '',
          date: day.date,
          maximum_c: day.maximum_c,
          minimum_c: '',
        }))
        .sort((left, right) => left.station_id - right.station_id || left.date.localeCompare(right.date));
      const dailyMetadata = {
        month,
        period: { start: windowStart, end: windowEnd },
        source: 'KMA API Hub kma_sfctm5.php (ASOS hourly TA)',
        purpose: '1991-2020 calendar-day TX90 baseline for H06/H08/H09',
        hourly_rows: rows.length,
        daily_rows: dailyRows.length,
        stations: new Set(dailyRows.map((row) => row.station_id)).size,
        minimum_daily_valid_hours: 18,
        generated_at: new Date().toISOString(),
      };
      writeFileSync(dailyPath, gzipSync(Buffer.from(csv(dailyRows), 'utf8'), { level: 9 }));
      writeFileSync(dailyMetadataPath, JSON.stringify(dailyMetadata, null, 2), 'utf8');
      dailyMonths.push(dailyMetadata);
      console.log(`[${index + 1}/${windows.length}] daily ${month} · ${dailyRows.length} rows`);
    }
    if (dailyOnly) continue;
    allRows.push(...rows);
  }
  if (dailyOnly) {
    const manifest = {
      title: 'KMA ASOS daily maximum temperature baseline',
      period: { start, end },
      purpose: 'H06 WSDI, H08 TX90p, H09 WSDIx 1991-2020 baseline',
      months: dailyMonths,
      generated_at: new Date().toISOString(),
    };
    writeFileSync(resolve(dailyDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Done: ${dailyMonths.length}/${windows.length} baseline months`);
    return;
  }
  console.log(`Aggregating ${allRows.length.toLocaleString()} hourly observations...`);
  const summary = summarizeIndicators(allRows);
  const stationCount = new Set(summary.map((row) => row.station_id)).size;
  const json = {
    metadata: {
      title: 'KMA ASOS observed heat indicators, nationwide station-year',
      source: 'KMA API Hub kma_sfctm5.php (TA hourly)',
      period: { start, end },
      spatial_unit: 'ASOS station',
      heatwave_definition: 'daily maximum temperature >= 33C',
      tropical_night_definition: 'minimum hourly temperature from 19:00 through next day 09:00 KST >= 25C; approximates requested 18:01-09:00 window',
      wsdi_definition: 'days in runs >=6 where daily maximum exceeds calendar-day 90th percentile (5-day window)',
      wsdi_reference_period: `${start.slice(0, 4)}-${end.slice(0, 4)} internal project baseline; not the standard 1991-2020 climatology`,
      minimum_daily_valid_hours: 18,
      minimum_night_valid_hours: 12,
      hourly_observations: allRows.length,
      stations: stationCount,
      station_year_rows: summary.length,
      generated_at: new Date().toISOString(),
    },
    station_years: summary,
  };
  writeFileSync(resolve(publishDir, 'national-asos-heat-indicators-2021-2025.json'), JSON.stringify(json), 'utf8');
  writeFileSync(resolve(publishDir, 'national-asos-heat-indicators-2021-2025.csv'), csv(summary), 'utf8');
  writeFileSync(resolve(rawDir, 'metadata.json'), JSON.stringify(json.metadata, null, 2), 'utf8');
  console.log(`Done: ${stationCount} stations, ${summary.length} station-year rows`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : error); process.exitCode = 1; });
}
