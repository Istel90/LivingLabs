import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(workspaceRoot, 'riskmap-core-main');
const dataRoot = resolve(projectRoot, 'data', 'raw', 'wamis', 'design-rainfall', 'hadgem3-ra-1');
const jsonRoot = resolve(dataRoot, 'json');
const excelRoot = resolve(dataRoot, 'xls');
const processedRoot = resolve(projectRoot, 'data', 'processed', 'flood', 'wamis-design-rainfall');
const staticRoot = resolve(projectRoot, 'static', 'analysis-data', 'flood');
const stationSource = resolve(
  projectRoot,
  'static',
  'analysis-data',
  'national-observed-heat',
  'national-asos-heat-indicators-2021-2025.json',
);
const boundarySource = resolve(
  workspaceRoot,
  'shared',
  'data',
  'administrative-regions',
  'boundaries',
  'downloads-sigungu-boundaries.json',
);

const BASE_URL = 'https://www.wamis.go.kr';
const SCENARIOS = [
  { key: 'hist', code: 'RCP_HIST', label: 'HadGEM3-RA(1) HIST' },
  { key: 'rcp45', code: 'RCP_45', label: 'HadGEM3-RA(1) RCP4.5' },
  { key: 'rcp85', code: 'RCP_85', label: 'HadGEM3-RA(1) RCP8.5' },
];
const RETURN_PERIODS = [2, 5, 10, 20, 25, 30, 50, 80, 100, 150, 200, 500];
const delayMs = Math.max(0, Number(process.env.WAMIS_DELAY_MS || 250));
const force = process.argv.includes('--force');

function ensureDirectories() {
  for (const path of [jsonRoot, excelRoot, processedRoot, staticRoot]) mkdirSync(path, { recursive: true });
  for (const scenario of SCENARIOS) {
    mkdirSync(resolve(jsonRoot, scenario.key), { recursive: true });
    mkdirSync(resolve(excelRoot, scenario.key), { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((accept) => setTimeout(accept, ms));
}

async function post(path, data, responseType = 'json', attempts = 4) {
  const body = new URLSearchParams(data);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          referer: `${BASE_URL}/wkc/wkc_flooddesign_lst.do`,
          'user-agent': 'LivingLabs-WAMIS-collector/1.0',
        },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return responseType === 'json' ? response.json() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1000);
    }
  }
  throw lastError;
}

async function stationList() {
  const payload = await post('/wkc/selectFlooddesignObs.do', { scenario: '1' });
  return (payload.rows || []).map((row) => ({
    stationId: String(row.wtobscd).padStart(3, '0'),
    stationName: row.wtobsnm,
  }));
}

function stationCoordinates() {
  if (!existsSync(stationSource)) return new Map();
  const source = JSON.parse(readFileSync(stationSource, 'utf8'));
  const coordinates = new Map();
  for (const row of source.station_years || []) {
    const stationId = String(row.station_id).padStart(3, '0');
    if (!coordinates.has(stationId)) {
      coordinates.set(stationId, {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude),
        elevationM: Number.isFinite(Number(row.elevation_m)) ? Number(row.elevation_m) : null,
      });
    }
  }
  return coordinates;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInGeometry(point, geometry) {
  if (geometry?.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  return false;
}

function adminIndex() {
  if (!existsSync(boundarySource)) return [];
  const source = JSON.parse(readFileSync(boundarySource, 'utf8'));
  return Object.entries(source.featuresByCode || {}).map(([code, feature]) => {
    const geometry = feature.geometry;
    const points = [];
    const collect = (value) => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value);
      else value.forEach(collect);
    };
    collect(geometry?.coordinates);
    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    return {
      code,
      name: feature.properties?.sig_kor_nm || feature.properties?.full_nm || code,
      geometry,
      center: points.length ? {
        longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
        latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      } : null,
    };
  });
}

function containingAdmin(longitude, latitude, boundaries) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const match = boundaries.find((boundary) => pointInGeometry([longitude, latitude], boundary.geometry));
  return match ? { code: match.code, name: match.name } : null;
}

function haversineKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.longitude - a.longitude);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function adminRegions(boundaries) {
  const direct = boundaries.map((boundary) => ({
    code: boundary.code,
    name: boundary.name,
    childCodes: [boundary.code],
    center: boundary.center,
  }));
  const parentGroups = new Map();
  for (const region of direct) {
    const match = region.name.match(/^(.+시)\s+.+구$/);
    if (!match) continue;
    const code = `${region.code.slice(0, 4)}0`;
    const current = parentGroups.get(code) || { code, name: match[1], childCodes: [], centers: [] };
    current.childCodes.push(region.code);
    if (region.center) current.centers.push(region.center);
    parentGroups.set(code, current);
  }
  const parents = [...parentGroups.values()].filter((region) => region.childCodes.length > 1).map((region) => ({
    code: region.code,
    name: region.name,
    childCodes: region.childCodes,
    center: {
      longitude: region.centers.reduce((sum, center) => sum + center.longitude, 0) / region.centers.length,
      latitude: region.centers.reduce((sum, center) => sum + center.latitude, 0) / region.centers.length,
    },
  }));
  const incheonChildren = direct.filter((region) => region.code.startsWith('28'));
  const incheon = incheonChildren.length ? [{
    code: '28000',
    name: '인천광역시',
    childCodes: incheonChildren.map((region) => region.code),
    center: {
      longitude: incheonChildren.reduce((sum, region) => sum + region.center.longitude, 0) / incheonChildren.length,
      latitude: incheonChildren.reduce((sum, region) => sum + region.center.latitude, 0) / incheonChildren.length,
    },
  }] : [];
  return [...direct, ...parents, ...incheon];
}

function mapAdminsToStations(regions, stations) {
  const usableStations = stations.filter((station) => Number.isFinite(station.longitude) && Number.isFinite(station.latitude));
  return regions.map((region) => {
    const inside = usableStations.filter((station) => region.childCodes.includes(station.adminCode));
    const candidates = inside.length ? inside : usableStations;
    const ranked = candidates.map((station) => ({
      station,
      distanceKm: haversineKm(region.center, station),
    })).sort((left, right) => left.distanceKm - right.distanceKm);
    const selected = ranked[0];
    return {
      adminCode: region.code,
      adminName: region.name,
      childCodes: region.childCodes,
      stationId: selected?.station.stationId || null,
      stationName: selected?.station.stationName || null,
      mappingMethod: inside.length ? 'inside_boundary' : 'nearest_station',
      distanceKm: selected ? Number(selected.distanceKm.toFixed(2)) : null,
      stationsInside: inside.map((station) => station.stationId),
    };
  });
}

function validJsonFile(path) {
  if (!existsSync(path) || statSync(path).size < 100) return false;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(value.rows) && (value.rows.length > 0 || value.status === 'source-missing');
  } catch {
    return false;
  }
}

function csvValue(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function collectCombination(station, scenario, index, total) {
  const jsonPath = resolve(jsonRoot, scenario.key, `${station.stationId}.json`);
  const excelPath = resolve(excelRoot, scenario.key, `${station.stationId}.xls`);
  // WAMIS 목록은 속초를 090으로 표시하지만 조회 API는 90만 허용한다.
  const request = { obscd: String(Number(station.stationId)), scenario: scenario.code, daterange: '' };

  let payload;
  if (!force && validJsonFile(jsonPath)) {
    payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } else {
    const response = await post('/wkc/wkc_flooddesign_list.do', request);
    if (!Array.isArray(response.rows)) throw new Error('invalid JSON rows');
    payload = {
      sourceUrl: `${BASE_URL}/wkc/wkc_flooddesign_lst.do`,
      endpoint: '/wkc/wkc_flooddesign_list.do',
      collectedAt: new Date().toISOString(),
      station,
      scenario,
      status: response.rows.length ? 'available' : 'source-missing',
      rows: response.rows,
    };
    writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
    await sleep(delayMs);
  }

  if (payload.rows.length && (force || !existsSync(excelPath) || statSync(excelPath).size < 1000)) {
    const excel = await post('/wkc/flooddesign_excel.do', request, 'buffer');
    if (excel.length < 1000) throw new Error(`unexpected Excel size ${excel.length}`);
    writeFileSync(excelPath, excel);
    await sleep(delayMs);
  }

  const status = payload.rows.length ? '완료' : '원자료 없음';
  process.stdout.write(`[${String(index).padStart(String(total).length, ' ')}/${total}] ${scenario.key} ${station.stationId} ${station.stationName} · ${status}\n`);
  return payload;
}

async function main() {
  ensureDirectories();
  const stations = await stationList();
  const coordinates = stationCoordinates();
  const boundaries = adminIndex();
  const enrichedStations = stations.map((station) => {
    const coordinate = coordinates.get(station.stationId) || {};
    const admin = containingAdmin(coordinate.longitude, coordinate.latitude, boundaries);
    return { ...station, ...coordinate, adminCode: admin?.code || null, adminName: admin?.name || null };
  });
  const adminMappings = mapAdminsToStations(adminRegions(boundaries), enrichedStations);

  const total = enrichedStations.length * SCENARIOS.length;
  const records = [];
  let index = 0;
  for (const scenario of SCENARIOS) {
    for (const station of enrichedStations) {
      index += 1;
      try {
        const payload = await collectCombination(station, scenario, index, total);
        records.push({ station, scenario, rows: payload.rows });
      } catch (error) {
        throw new Error(`${scenario.key}/${station.stationId} 수집 실패: ${error.message}`);
      }
    }
  }

  const longRows = [];
  for (const record of records) {
    for (const row of record.rows) {
      for (const returnPeriod of RETURN_PERIODS) {
        longRows.push({
          station_id: record.station.stationId,
          station_name: record.station.stationName,
          longitude: record.station.longitude,
          latitude: record.station.latitude,
          admin_code: record.station.adminCode,
          admin_name: record.station.adminName,
          scenario_code: record.scenario.code,
          scenario_label: record.scenario.label,
          duration_hours: row.durate,
          return_period_years: returnPeriod,
          design_rainfall_mm: row[`year${returnPeriod}`],
        });
      }
    }
  }

  const headers = Object.keys(longRows[0]);
  const csv = [headers.join(','), ...longRows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
  writeFileSync(resolve(processedRoot, 'wamis-hadgem3-ra-1-design-rainfall-long.csv'), `\uFEFF${csv}\n`);

  const platformPayload = {
    metadata: {
      title: 'WAMIS HadGEM3-RA(1) 관측소별 설계강수량',
      source: '국가수자원관리종합정보시스템(WAMIS)',
      sourceUrl: `${BASE_URL}/wkc/wkc_flooddesign_lst.do`,
      collectedAt: new Date().toISOString(),
      stationCount: enrichedStations.length,
      scenarioCount: SCENARIOS.length,
      combinationCount: records.length,
      valueCount: longRows.length,
      unit: 'mm',
      spatialUnit: 'ASOS 관측소',
      adminMapping: '경계 내부 관측소 우선, 내부 관측소가 없으면 행정경계 중심과 가장 가까운 관측소 연결',
      note: '원자료는 관측소 지점 자료이며 adminMappings.mappingMethod로 경계 내부/최근접 대입을 구분함',
    },
    scenarios: SCENARIOS,
    returnPeriods: RETURN_PERIODS,
    durations: [...new Set(records.flatMap((record) => record.rows.map((row) => row.durate)))],
    stations: enrichedStations,
    adminMappings,
    valuesByStation: Object.fromEntries(enrichedStations.map((station) => [
      station.stationId,
      Object.fromEntries(SCENARIOS.map((scenario) => {
        const record = records.find((item) => item.station.stationId === station.stationId && item.scenario.key === scenario.key);
        return [scenario.key, record?.rows || []];
      })),
    ])),
  };
  const outputJson = `${JSON.stringify(platformPayload)}\n`;
  writeFileSync(resolve(processedRoot, 'wamis-hadgem3-ra-1-design-rainfall.json'), outputJson);
  writeFileSync(resolve(staticRoot, 'wamis-hadgem3-ra-1-design-rainfall.json'), outputJson);

  const manifest = {
    collectedAt: platformPayload.metadata.collectedAt,
    sourceUrl: platformPayload.metadata.sourceUrl,
    model: 'HadGEM3-RA(1)',
    modelInstitution: '세종대학교',
    scenarios: SCENARIOS,
    stations: enrichedStations,
    combinations: records.length,
    availableCombinations: records.filter((record) => record.rows.length).length,
    missingCombinations: records.filter((record) => !record.rows.length).map((record) => ({
      stationId: record.station.stationId,
      stationName: record.station.stationName,
      scenario: record.scenario.key,
    })),
    jsonFiles: records.length,
    excelFiles: records.filter((record) => record.rows.length).length,
    longRows: longRows.length,
  };
  writeFileSync(resolve(dataRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`완료: 관측소 ${enrichedStations.length}개 × 시나리오 ${SCENARIOS.length}개 = ${records.length}조합`);
  console.log(`장기형 값 ${longRows.length.toLocaleString()}개`);
}

await main();
