import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const workspaceRoot = resolve(import.meta.dirname, '..');
const asosRoot = resolve(
  workspaceRoot,
  'riskmap-core-main',
  'data',
  'raw',
  'kma',
  'national-asos-temperature-2021-2025',
);
const awsRoot = resolve(
  workspaceRoot,
  'riskmap-core-main',
  'data',
  'raw',
  'kma',
  'national-aws-temperature-2021-2025',
);
const outputRoot = resolve(
  workspaceRoot,
  'riskmap-core-main',
  'static',
  'analysis-data',
  'national-observed-heat',
);

function isoDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
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

function asosDaily() {
  const files = Array.from({ length: 60 }, (_, index) => {
    const year = 2021 + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return resolve(
      asosRoot,
      `asos-ta-${year}${String(month).padStart(2, '0')}01-${year}${String(month).padStart(2, '0')}${lastDay}.txt.gz`,
    );
  }).filter(existsSync);
  const stationMetadata = new Map();
  const rows = [];
  for (const file of files) {
    const payload = gunzipSync(readFileSync(file)).toString('utf8');
    const daily = new Map();
    for (const line of payload.split(/\r?\n/)) {
      const text = line.trim();
      if (!/^\d{12}[,\s]+\d+/.test(text)) continue;
      const values = text.includes(',') ? text.split(',').map((value) => value.trim()) : text.split(/\s+/);
      const temperature = Number(values[5]);
      const stationId = Number(values[1]);
      if (!Number.isFinite(temperature) || temperature <= -90 || !Number.isInteger(stationId)) continue;
      const timestamp = values[0];
      const date = isoDate(timestamp);
      stationMetadata.set(stationId, {
        station_id: stationId,
        network: 'ASOS',
        longitude: Number(values[2]),
        latitude: Number(values[3]),
        elevation_m: Number(values[4]) > -90 ? Number(values[4]) : null,
      });
      const key = `${stationId}:${date}`;
      const group = daily.get(key) || {
        station_id: stationId,
        date,
        count: 0,
        sum: 0,
        maximum_c: -Infinity,
        minimum_c: Infinity,
      };
      group.count += 1;
      group.sum += temperature;
      group.maximum_c = Math.max(group.maximum_c, temperature);
      group.minimum_c = Math.min(group.minimum_c, temperature);
      daily.set(key, group);
    }
    for (const group of daily.values()) {
      const valid = group.count >= 18;
      rows.push({
        ...stationMetadata.get(group.station_id),
        date: group.date,
        valid_hours: group.count,
        mean_c: valid ? group.sum / group.count : null,
        maximum_c: valid ? group.maximum_c : null,
        minimum_c: valid ? group.minimum_c : null,
      });
    }
  }
  return rows;
}

function awsDaily() {
  if (!existsSync(awsRoot)) return [];
  const rows = [];
  for (let year = 2021; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const file = resolve(awsRoot, `aws-daily-temperature-${year}-${String(month).padStart(2, '0')}.csv.gz`);
      if (!existsSync(file)) continue;
      const payload = gunzipSync(readFileSync(file)).toString('utf8');
      for (const row of csvRows(payload)) {
        rows.push({
          station_id: Number(row.station_id),
          network: 'AWS',
          longitude: Number(row.longitude),
          latitude: Number(row.latitude),
          elevation_m: row.elevation_m === '' ? null : Number(row.elevation_m),
          date: row.date,
          valid_hours: Number(row.valid_hours),
          mean_c: row.mean_c === '' ? null : Number(row.mean_c),
          maximum_c: row.maximum_c === '' ? null : Number(row.maximum_c),
          minimum_c: row.minimum_c === '' ? null : Number(row.minimum_c),
        });
      }
    }
  }
  return rows;
}

function summarize(dailyRows) {
  const groups = new Map();
  for (const row of dailyRows) {
    const year = Number(row.date.slice(0, 4));
    if (year < 2021 || year > 2025) continue;
    const key = `${row.network}:${row.station_id}:${year}`;
    const group = groups.get(key) || {
      station_id: row.station_id,
      network: row.network,
      longitude: row.longitude,
      latitude: row.latitude,
      elevation_m: row.elevation_m,
      year,
      valid_tmax_days: 0,
      valid_tmin_days: 0,
      sum_tmax_c: 0,
      sum_tmin_c: 0,
      heatwave_days: 0,
      tropical_nights: 0,
      annual_max_tmax_c: null,
    };
    if (row.maximum_c !== null) {
      group.valid_tmax_days += 1;
      group.sum_tmax_c += row.maximum_c;
      if (row.maximum_c >= 33) group.heatwave_days += 1;
      group.annual_max_tmax_c = group.annual_max_tmax_c === null
        ? row.maximum_c
        : Math.max(group.annual_max_tmax_c, row.maximum_c);
    }
    if (row.minimum_c !== null) {
      group.valid_tmin_days += 1;
      group.sum_tmin_c += row.minimum_c;
      if (row.minimum_c >= 25) group.tropical_nights += 1;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
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
      h06_wsdi_days: null,
      h07_annual_max_daily_max_c: group.annual_max_tmax_c,
      h08_tx90p_days: null,
      h09_maximum_warm_spell_days: null,
      percentile_baseline_status: '1991-2020_BASELINE_PENDING',
      quality_status: group.valid_tmax_days >= 300 && group.valid_tmin_days >= 300 ? 'PASS' : 'INSUFFICIENT_DAYS',
    }))
    .sort((left, right) => left.network.localeCompare(right.network) || left.station_id - right.station_id || left.year - right.year);
}

function csv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => row[header] ?? '').join(',')).join('\n')}\n`;
}

function coverageByNetworkYear(rows) {
  const groups = new Map();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    const key = `${row.network}:${year}`;
    const group = groups.get(key) || {
      network: row.network,
      year,
      dates: new Set(),
      stations: new Set(),
      first_date: row.date,
      last_date: row.date,
    };
    group.dates.add(row.date);
    group.stations.add(row.station_id);
    if (row.date < group.first_date) group.first_date = row.date;
    if (row.date > group.last_date) group.last_date = row.date;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const expectedDays = new Date(Date.UTC(group.year + 1, 0, 1)) - new Date(Date.UTC(group.year, 0, 1));
      const expected = expectedDays / 86400000;
      return {
        network: group.network,
        year: group.year,
        first_date: group.first_date,
        last_date: group.last_date,
        calendar_days_present: group.dates.size,
        expected_calendar_days: expected,
        station_count: group.stations.size,
        calendar_coverage_complete: group.dates.size === expected,
      };
    })
    .sort((left, right) => left.network.localeCompare(right.network) || left.year - right.year);
}

function main() {
  const asos = asosDaily();
  const aws = awsDaily();
  const indicators = summarize([...asos, ...aws]);
  const networks = Object.fromEntries(
    ['ASOS', 'AWS'].map((network) => {
      const selected = indicators.filter((row) => row.network === network);
      return [network, {
        stations: new Set(selected.map((row) => row.station_id)).size,
        station_year_rows: selected.length,
        pass_rows: selected.filter((row) => row.quality_status === 'PASS').length,
      }];
    }),
  );
  const result = {
    metadata: {
      title: 'KMA ASOS + AWS observed temperature indicators, station-year',
      period: { start: '2021-01-01', end: '2025-12-31' },
      indicators_computable_from_daily_temperature: ['H02', 'H03', 'H04', 'H05', 'H07'],
      completeness_rule: 'Use only station-year rows with quality_status=PASS for annual analysis.',
      indicators_waiting_for_1991_2020_baseline: ['H06', 'H08', 'H09'],
      minimum_valid_days_for_quality_pass: 300,
      networks,
      source_coverage: coverageByNetworkYear([...asos, ...aws]),
      spatial_grid_status: 'PENDING_SPATIAL_MODEL',
      generated_at: new Date().toISOString(),
    },
    station_years: indicators,
  };
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(resolve(outputRoot, 'kma-asos-aws-indicators-2021-2025.json'), JSON.stringify(result), 'utf8');
  writeFileSync(resolve(outputRoot, 'kma-asos-aws-indicators-2021-2025.csv'), csv(indicators), 'utf8');
  console.log(JSON.stringify(result.metadata, null, 2));
}

main();
