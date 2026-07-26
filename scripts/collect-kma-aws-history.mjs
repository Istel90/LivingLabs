import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const progressDir = resolve(workspaceRoot, ".runtime-logs");
const progressPath = resolve(progressDir, "kma-aws-history-progress.json");
const suwonCenter = { latitude: 37.2636, longitude: 127.0286 };
const radiusKm = 35;
const hours = [13, 14, 15];

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.match(/^([^#=\s]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

const env = {
  ...loadEnv(resolve(workspaceRoot, ".env.local")),
  ...loadEnv(resolve(workspaceRoot, "riskmap-core-main", ".env.local")),
};
const kmaApiKey = env.KMA_API_KEY;
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
const collectorToken = env.KMA_COLLECTOR_TOKEN;

if (!kmaApiKey || !supabaseUrl || !supabaseAnonKey || !collectorToken) {
  throw new Error("KMA_API_KEY, Supabase URL/key, or KMA_COLLECTOR_TOKEN is missing");
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const latestCompletedHour = new Date(Date.now() + 8 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 13)
  .replace(/[-T:]/g, "") + "00";
const startDate = args.start || "2020-06-01";
const endDate = args.end || (todayKst < "2026-09-30" ? todayKst : "2026-09-30");
const batchSize = Math.max(1, Math.min(12, Number(args.batch || 10)));
const concurrency = Math.max(1, Math.min(6, Number(args.concurrency || 4)));

function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const month = Number(date.slice(5, 7));
    if (month >= 6 && month <= 9) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function toKmaTimestamp(date, hour) {
  return `${date.replaceAll("-", "")}${String(hour).padStart(2, "0")}00`;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchKma(pathname, params) {
  const url = new URL(`https://apihub.kma.go.kr/api/typ01/${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  url.searchParams.set("help", "0");
  url.searchParams.set("authKey", kmaApiKey);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`KMA HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new TextDecoder("euc-kr").decode(bytes);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  throw lastError;
}

function parseStations(payload, type) {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+\d/.test(line))
    .map((line) => {
      const values = line.split(/\s+/);
      const nameIndex = type === "asos" ? 10 : 8;
      return {
        station_id: Number(values[0]),
        longitude: Number(values[1]),
        latitude: Number(values[2]),
        elevation_m: Number.isFinite(Number(values[3])) ? Number(values[3]) : null,
        station_name: values[nameIndex] || `Station ${values[0]}`,
      };
    })
    .filter(
      (station) =>
        Number.isInteger(station.station_id) &&
        Number.isFinite(station.longitude) &&
        Number.isFinite(station.latitude),
    );
}

function numeric(values, index) {
  const value = Number(values[index]);
  return Number.isFinite(value) && value > -90 ? value : null;
}

function parseHourly(payload, selectedStationIds) {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{12}\s+\d+/.test(line))
    .map((line) => line.split(/\s+/))
    .filter((values) => selectedStationIds.has(Number(values[1])))
    .map((values) => {
      const observed = values[0];
      const date = `${observed.slice(0, 4)}-${observed.slice(4, 6)}-${observed.slice(6, 8)}`;
      const hour = Number(observed.slice(8, 10));
      return {
        station_id: Number(values[1]),
        observed_at: `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`,
        observation_date: date,
        hour_kst: hour,
        temperature_c: numeric(values, 2),
        wind_direction_deg: numeric(values, 3),
        wind_speed_ms: numeric(values, 4),
        rainfall_day_mm: numeric(values, 5),
        rainfall_hour_mm: numeric(values, 6),
        humidity_pct: numeric(values, 7),
        station_pressure_hpa: numeric(values, 8),
        sea_level_pressure_hpa: numeric(values, 9),
      };
    });
}

async function callIngest(body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/kma-history-ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
      "x-collector-token": collectorToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `Ingest HTTP ${response.status}`);
  return result;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

mkdirSync(progressDir, { recursive: true });
const progress = existsSync(progressPath)
  ? JSON.parse(readFileSync(progressPath, "utf8"))
  : { completed: [], errors: [], totalRows: 0 };
const completed = new Set(progress.completed || []);
const timestamps = dateRange(startDate, endDate)
  .flatMap((date) => hours.map((hour) => toKmaTimestamp(date, hour)))
  .filter((timestamp) => timestamp <= latestCompletedHour);

console.log(`Period ${startDate}~${endDate}, ${timestamps.length} timestamps`);
const [awsCatalog, asosCatalog] = await Promise.all([
  fetchKma("url/stn_inf.php", { inf: "AWS", stn: 0 }),
  fetchKma("url/stn_inf.php", { inf: "SFC", stn: 0 }),
]);
const asosIds = new Set(parseStations(asosCatalog, "asos").map((station) => station.station_id));
const stations = parseStations(awsCatalog, "aws")
  .filter((station) => !asosIds.has(station.station_id))
  .map((station) => ({
    ...station,
    distance_from_suwon_km: distanceKm(
      suwonCenter.latitude,
      suwonCenter.longitude,
      station.latitude,
      station.longitude,
    ),
  }))
  .filter((station) => station.distance_from_suwon_km <= radiusKm)
  .sort((a, b) => a.distance_from_suwon_km - b.distance_from_suwon_km);
const stationIds = new Set(stations.map((station) => station.station_id));
console.log(`Suwon ${radiusKm}km AWS stations: ${stations.length}`);

const run = await callIngest({
  action: "start",
  period_start: startDate,
  period_end: endDate,
  requested_timestamps: timestamps.length,
});
let runRows = 0;
const pending = timestamps.filter((timestamp) => !completed.has(timestamp));

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batchTimestamps = pending.slice(offset, offset + batchSize);
  try {
    const observationsByTimestamp = await mapLimit(
      batchTimestamps,
      concurrency,
      async (timestamp) =>
        parseHourly(await fetchKma("url/awsh.php", { tm: timestamp, stn: 0 }), stationIds),
    );
    const observations = observationsByTimestamp.flat();
    const result = await callIngest({ action: "batch", stations, observations });
    runRows += Number(result.observation_rows || observations.length);
    batchTimestamps.forEach((timestamp) => completed.add(timestamp));
    progress.completed = [...completed].sort();
    progress.totalRows = Number(progress.totalRows || 0) + observations.length;
    progress.lastCompletedAt = new Date().toISOString();
    writeFileSync(progressPath, JSON.stringify(progress, null, 2), "utf8");
    console.log(`[${completed.size}/${timestamps.length}] ${batchTimestamps.at(-1)} · ${observations.length} rows`);
  } catch (error) {
    const detail = {
      timestamps: batchTimestamps,
      error: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    };
    progress.errors = [...(progress.errors || []), detail];
    writeFileSync(progressPath, JSON.stringify(progress, null, 2), "utf8");
    console.error(`[error] ${batchTimestamps[0]}~${batchTimestamps.at(-1)}: ${detail.error}`);
  }
}

const errors = progress.errors || [];
await callIngest({
  action: "finish",
  run_id: run.run_id,
  status: errors.length ? "partial" : "completed",
  completed_timestamps: timestamps.filter((timestamp) => completed.has(timestamp)).length,
  upserted_rows: runRows,
  error_details: errors.slice(-100),
});
console.log(`Done: ${completed.size}/${timestamps.length} timestamps, ${runRows} rows this run`);
