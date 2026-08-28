import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const workspaceRoot = resolve(import.meta.dirname, '..');
const defaultBaselineRoot = resolve(
  workspaceRoot,
  'riskmap-core-main', 'data', 'raw', 'kma', 'combined-daily-temperature-1991-2020',
);
const defaultRecentRoot = resolve(
  workspaceRoot,
  'riskmap-core-main', 'data', 'raw', 'kma', 'combined-daily-temperature-2021-2025',
);
const defaultOutputRoot = resolve(
  workspaceRoot,
  'riskmap-core-main', 'static', 'analysis-data', 'national-observed-heat',
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

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function dailyFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /^kma-daily-temperature-\d{4}-\d{2}\.csv\.gz$/.test(name))
    .sort()
    .map((name) => resolve(root, name));
}

function readDailyFile(path) {
  const payload = gunzipSync(readFileSync(path)).toString('utf8');
  return csvRows(payload).map((row) => ({
    station_id: Number(row.station_id),
    network: row.network,
    longitude: row.longitude === '' ? null : Number(row.longitude),
    latitude: row.latitude === '' ? null : Number(row.latitude),
    elevation_m: row.elevation_m === '' ? null : Number(row.elevation_m),
    date: row.date,
    maximum_c: row.maximum_c === '' ? null : Number(row.maximum_c),
    minimum_c: row.minimum_c === '' ? null : Number(row.minimum_c),
  }));
}

function calendarDayIndex(date) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.round((Date.UTC(2000, month - 1, day) - Date.UTC(2000, 0, 1)) / 86400000);
}

function nextDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function baselineThresholds(rows, options = {}) {
  const minimumYears = Number(options.minimumYears || 20);
  const minimumWindowSamples = Number(options.minimumWindowSamples || minimumYears * 4);
  const stations = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.maximum_c)) continue;
    const key = `${row.network}:${row.station_id}`;
    const station = stations.get(key) || {
      station_id: row.station_id,
      network: row.network,
      longitude: row.longitude,
      latitude: row.latitude,
      elevation_m: row.elevation_m,
      calendar_values: Array.from({ length: 366 }, () => []),
      year_counts: new Map(),
      valid_days: 0,
    };
    station.calendar_values[calendarDayIndex(row.date)].push(row.maximum_c);
    const year = Number(row.date.slice(0, 4));
    station.year_counts.set(year, (station.year_counts.get(year) || 0) + 1);
    station.valid_days += 1;
    stations.set(key, station);
  }

  const result = new Map();
  for (const [key, station] of stations) {
    const thresholds = Array(366).fill(null);
    const validBaselineYears = [...station.year_counts.values()].filter((days) => days >= 300).length;
    if (validBaselineYears >= minimumYears) {
      for (let day = 0; day < 366; day += 1) {
        const window = [];
        for (let offset = -2; offset <= 2; offset += 1) {
          const index = (day + offset + 366) % 366;
          window.push(...station.calendar_values[index]);
        }
        if (window.length >= minimumWindowSamples) thresholds[day] = percentile(window, 0.9);
      }
    }
    result.set(key, {
      ...station,
      thresholds,
      baseline_years: validBaselineYears,
      threshold_days: thresholds.filter(Number.isFinite).length,
      baseline_status: validBaselineYears >= minimumYears && thresholds.filter(Number.isFinite).length >= 365
        ? 'PASS'
        : 'INSUFFICIENT_BASELINE',
    });
  }
  return result;
}

function warmSpellMetrics(days, thresholds) {
  const observations = days
    .filter((row) => Number.isFinite(row.maximum_c))
    .sort((left, right) => left.date.localeCompare(right.date));
  let tx90pDays = 0;
  let wsdiDays = 0;
  let maximumWarmSpellDays = 0;
  let run = 0;
  let priorDate = null;
  const closeRun = () => {
    if (run >= 6) wsdiDays += run;
    maximumWarmSpellDays = Math.max(maximumWarmSpellDays, run);
    run = 0;
  };
  for (const row of observations) {
    if (priorDate && nextDay(priorDate) !== row.date) closeRun();
    const threshold = thresholds[calendarDayIndex(row.date)];
    const exceeded = Number.isFinite(threshold) && row.maximum_c > threshold;
    if (exceeded) {
      tx90pDays += 1;
      run += 1;
    } else {
      closeRun();
    }
    priorDate = row.date;
  }
  closeRun();
  return { tx90pDays, wsdiDays, maximumWarmSpellDays };
}

function summarizeRecent(rows, thresholds) {
  const groups = new Map();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    const key = `${row.network}:${row.station_id}:${year}`;
    const group = groups.get(key) || {
      station_id: row.station_id,
      network: row.network,
      longitude: row.longitude,
      latitude: row.latitude,
      elevation_m: row.elevation_m,
      year,
      days: [],
      valid_tmax_days: 0,
      valid_tmin_days: 0,
      sum_tmax_c: 0,
      sum_tmin_c: 0,
      heatwave_days: 0,
      tropical_nights: 0,
      annual_max_tmax_c: null,
    };
    group.days.push(row);
    if (Number.isFinite(row.maximum_c)) {
      group.valid_tmax_days += 1;
      group.sum_tmax_c += row.maximum_c;
      if (row.maximum_c >= 33) group.heatwave_days += 1;
      group.annual_max_tmax_c = group.annual_max_tmax_c === null
        ? row.maximum_c
        : Math.max(group.annual_max_tmax_c, row.maximum_c);
    }
    if (Number.isFinite(row.minimum_c)) {
      group.valid_tmin_days += 1;
      group.sum_tmin_c += row.minimum_c;
      if (row.minimum_c >= 25) group.tropical_nights += 1;
    }
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const baseline = thresholds.get(`${group.network}:${group.station_id}`);
    const warm = baseline?.baseline_status === 'PASS'
      ? warmSpellMetrics(group.days, baseline.thresholds)
      : null;
    return {
      station_id: group.station_id,
      network: group.network,
      longitude: group.longitude,
      latitude: group.latitude,
      elevation_m: group.elevation_m,
      year: group.year,
      valid_tmax_days: group.valid_tmax_days,
      valid_tmin_days: group.valid_tmin_days,
      h02_mean_daily_max_c: group.valid_tmax_days ? group.sum_tmax_c / group.valid_tmax_days : null,
      h03_mean_daily_min_c: group.valid_tmin_days ? group.sum_tmin_c / group.valid_tmin_days : null,
      h04_heatwave_days: group.heatwave_days,
      h05_tropical_nights: group.tropical_nights,
      h06_wsdi_days: warm?.wsdiDays ?? null,
      h07_annual_max_daily_max_c: group.annual_max_tmax_c,
      h08_tx90p_days: warm?.tx90pDays ?? null,
      h09_maximum_warm_spell_days: warm?.maximumWarmSpellDays ?? null,
      baseline_years: baseline?.baseline_years ?? 0,
      percentile_baseline_status: baseline?.baseline_status ?? 'MISSING_BASELINE',
      quality_status: group.valid_tmax_days >= 300 && group.valid_tmin_days >= 300
        ? 'PASS'
        : 'INSUFFICIENT_DAYS',
    };
  }).sort((left, right) => (
    left.network.localeCompare(right.network)
    || left.station_id - right.station_id
    || left.year - right.year
  ));
}

function csv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => row[header] ?? '').join(',')).join('\n')}\n`;
}

function runSelfTest() {
  const baseline = [];
  for (let year = 1991; year <= 1992; year += 1) {
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
      baseline.push({ station_id: 1, network: 'ASOS', date, maximum_c: 20, minimum_c: 10 });
    }
  }
  const recent = [];
  for (let day = 0; day < 365; day += 1) {
    const date = new Date(Date.UTC(2021, 0, 1 + day)).toISOString().slice(0, 10);
    recent.push({
      station_id: 1,
      network: 'ASOS',
      date,
      maximum_c: day >= 180 && day < 190 ? 40 : 20,
      minimum_c: 10,
    });
  }
  const thresholds = baselineThresholds(baseline, { minimumYears: 2, minimumWindowSamples: 8 });
  const result = summarizeRecent(recent, thresholds)[0];
  if (result.h06_wsdi_days !== 10 || result.h08_tx90p_days !== 10 || result.h09_maximum_warm_spell_days !== 10) {
    throw new Error(`Self-test failed: ${JSON.stringify(result)}`);
  }
  console.log('Self-test passed: H06=10, H08=10, H09=10');
}

function loadRows(files, label) {
  const rows = [];
  files.forEach((path, index) => {
    rows.push(...readDailyFile(path));
    if ((index + 1) % 12 === 0 || index + 1 === files.length) {
      console.log(`${label}: ${index + 1}/${files.length} months · ${rows.length.toLocaleString()} rows`);
    }
  });
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) return runSelfTest();
  const baselineRoot = resolve(String(args['baseline-dir'] || defaultBaselineRoot));
  const recentRoot = resolve(String(args['recent-dir'] || defaultRecentRoot));
  const outputRoot = resolve(String(args['output-dir'] || defaultOutputRoot));
  const baselineFiles = dailyFiles(baselineRoot);
  const recentFiles = dailyFiles(recentRoot);
  if (!baselineFiles.length) throw new Error(`No baseline daily files in ${baselineRoot}`);
  if (!recentFiles.length) throw new Error(`No recent daily files in ${recentRoot}`);
  console.log(`Baseline files: ${baselineFiles.length}; recent files: ${recentFiles.length}`);
  const baselineRows = loadRows(baselineFiles, 'baseline');
  const recentRows = loadRows(recentFiles, 'recent');
  const thresholds = baselineThresholds(baselineRows, {
    minimumYears: Number(args['minimum-baseline-years'] || 20),
  });
  const indicators = summarizeRecent(recentRows, thresholds);
  const baselinePassStations = [...thresholds.values()].filter((row) => row.baseline_status === 'PASS').length;
  const result = {
    metadata: {
      title: 'KMA ASOS/AWS observed temperature indicators with 1991-2020 percentile baseline',
      baseline_period: '1991-2020',
      observed_period: '2021-2025',
      percentile: 90,
      percentile_window: 'calendar day +/-2 days',
      wsdi_minimum_run_days: 6,
      minimum_baseline_years: Number(args['minimum-baseline-years'] || 20),
      baseline_stations: thresholds.size,
      baseline_pass_stations: baselinePassStations,
      station_year_rows: indicators.length,
      station_year_quality_pass: indicators.filter((row) => row.quality_status === 'PASS').length,
      spatial_grid_status: 'PENDING_SPATIAL_MODEL',
      generated_at: new Date().toISOString(),
    },
    station_years: indicators,
  };
  mkdirSync(outputRoot, { recursive: true });
  const jsonPath = resolve(outputRoot, 'kma-asos-aws-indicators-2021-2025-with-baseline.json');
  const csvPath = resolve(outputRoot, 'kma-asos-aws-indicators-2021-2025-with-baseline.csv');
  writeFileSync(jsonPath, JSON.stringify(result), 'utf8');
  writeFileSync(csvPath, csv(indicators), 'utf8');
  console.log(JSON.stringify({ ...result.metadata, outputs: [basename(jsonPath), basename(csvPath)] }, null, 2));
}

main();
