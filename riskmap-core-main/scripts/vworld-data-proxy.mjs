import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as h5wasm from 'h5wasm/node';
import proj4 from 'proj4';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(root, '..');
const handoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'priority-handoffs.json');
const responsibleHandoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-handoffs.json');
const responsibleReviewStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-review-responses.json');
const devResetStatePath = resolve(workspaceRoot, '.runtime-logs', 'dev-reset-state.json');
const envPath = resolve(root, '.env.local');
const env = {};

try {
  const content = readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const cleanLine = line.replace(/^\uFEFF/, '');
    const match = cleanLine.match(/^([^#=\s]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });
} catch {
  // The proxy can still start, but VWorld requests will return a clear error.
}

const apiKey = env.VITE_VWORLD_API_KEY || '';
const kmaApiKey = env.KMA_API_KEY || '';
const domain = env.VITE_VWORLD_DOMAIN || 'http://127.0.0.1:5175/';
const allowInsecureTls = env.VWORLD_ALLOW_INSECURE_TLS === 'true' || process.env.VWORLD_ALLOW_INSECURE_TLS === 'true';
const httpsAgent = allowInsecureTls ? new HttpsAgent({ rejectUnauthorized: false }) : undefined;
const port = Number(process.env.VWORLD_PROXY_PORT || process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 5176);

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(data ? JSON.parse(data) : null);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function readHandoffStore(storePath = handoffStorePath) {
  try {
    if (!existsSync(storePath)) return {};
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHandoffStore(store, storePath = handoffStorePath) {
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function resetDevStores() {
  writeHandoffStore({}, handoffStorePath);
  writeHandoffStore({}, responsibleHandoffStorePath);
  writeHandoffStore({}, responsibleReviewStorePath);
  writeHandoffStore({ resetAt: new Date().toISOString() }, devResetStatePath);
}

async function handleStoredHandoffRoute(request, response, url, { storePath, schemaVersion }) {
  if (request.method === 'GET') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    send(response, 200, JSON.stringify({
      ok: true,
      payload: regionCode ? store[regionCode] || null : null,
    }));
    return true;
  }

  if (request.method === 'POST') {
    try {
      const payload = await readJsonBody(request);
      if (!payload?.regionCode || payload?.schemaVersion !== schemaVersion) {
        send(response, 400, JSON.stringify({ ok: false, error: `Invalid ${schemaVersion} payload` }));
        return true;
      }
      const store = readHandoffStore(storePath);
      store[payload.regionCode] = {
        ...payload,
        storedAt: new Date().toISOString(),
      };
      writeHandoffStore(store, storePath);
      send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
    }
    return true;
  }

  if (request.method === 'DELETE') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    if (regionCode) delete store[regionCode];
    writeHandoffStore(store, storePath);
    send(response, 200, JSON.stringify({ ok: true, regionCode }));
    return true;
  }

  return false;
}

function fetchVWorldData(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!apiKey) {
      reject(new Error('Missing VITE_VWORLD_API_KEY'));
      return;
    }

    const url = new URL('https://api.vworld.kr/req/data');
    const query = {
      service: 'data',
      version: '2.0',
      request: 'GetFeature',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
      crs: 'EPSG:4326',
      size: '1000',
      page: '1',
    };

    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    for (const [key, value] of searchParams.entries()) {
      if (!['key', 'domain'].includes(key)) url.searchParams.set(key, value);
    }
    url.searchParams.set('key', apiKey);
    url.searchParams.set('domain', domain);

    const request = httpsRequest(url, { method: 'GET', timeout: 20000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('VWorld request timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

function fetchKmaObservation(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/awsh.php');
    const latestCompletedHour = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 13).replace(/[-T:]/g, '') + '00';
    url.searchParams.set('tm', searchParams.get('tm') || latestCompletedHour);
    url.searchParams.set('stn', searchParams.get('stn') || '119');
    url.searchParams.set('help', '0');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 20000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function fetchKmaLstList(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const now = new Date();
    now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const formatUtc = (date) => date.toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const area = String(searchParams.get('area') || 'KO').toUpperCase();
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/dataList`);
    url.searchParams.set('sDate', searchParams.get('sDate') || formatUtc(start));
    url.searchParams.set('eDate', searchParams.get('eDate') || formatUtc(now));
    url.searchParams.set('format', 'json');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA LST request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function fetchKmaLstFileList(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }

    const now = new Date();
    now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
    const requestedTime = searchParams.get('tm') || now.toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/sat_file_list.php');
    url.searchParams.set('sat', 'GK2A');
    url.searchParams.set('vars', 'L2');
    url.searchParams.set('area', String(searchParams.get('area') || 'KO').toUpperCase());
    url.searchParams.set('fmt', 'bin');
    url.searchParams.set('tm', requestedTime);
    url.searchParams.set('size', 'Y');
    url.searchParams.set('filter', 'lst');
    url.searchParams.set('authKey', kmaApiKey);

    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => request.destroy(new Error('KMA LST file-list request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function checkKmaLstDataAt(date, area = 'KO') {
  return new Promise((resolvePromise, reject) => {
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/data`);
    url.searchParams.set('date', date);
    url.searchParams.set('authKey', kmaApiKey);
    let settled = false;
    const request = httpsRequest(url, { method: 'GET', timeout: 30000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      let byteLength = 0;
      upstream.on('data', (chunk) => {
        if (settled) return;
        byteLength += chunk.length;
        if (upstream.statusCode === 200) {
          settled = true;
          resolvePromise({
            ok: true,
            date,
            statusCode: upstream.statusCode,
            contentType: upstream.headers['content-type'] || '',
            contentLength: Number(upstream.headers['content-length'] || byteLength || 0),
            disposition: upstream.headers['content-disposition'] || '',
          });
          upstream.destroy();
          request.destroy();
          return;
        }
        if (byteLength <= 16_384) chunks.push(Buffer.from(chunk));
      });
      upstream.on('end', () => {
        if (settled) return;
        settled = true;
        resolvePromise({
          ok: false,
          date,
          statusCode: upstream.statusCode || 502,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('timeout', () => {
      if (!settled) reject(new Error('KMA LST data request timeout'));
      request.destroy();
    });
    request.on('error', (error) => {
      if (!settled) reject(error);
    });
    request.end();
  });
}

async function checkRecentKmaLstData(searchParams) {
  if (!kmaApiKey) throw new Error('Missing KMA_API_KEY');
  const area = String(searchParams.get('area') || 'KO').toUpperCase();
  const requestedDate = searchParams.get('date');
  if (requestedDate) return checkKmaLstDataAt(requestedDate, area);

  const now = new Date();
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
  const attempts = [];
  for (let offsetMinutes = 10; offsetMinutes <= 180; offsetMinutes += 10) {
    const date = new Date(now.getTime() - offsetMinutes * 60 * 1000)
      .toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const result = await checkKmaLstDataAt(date, area);
    attempts.push({ date, statusCode: result.statusCode });
    if (result.ok) return { ...result, attempts };
    if (result.statusCode === 403) return { ...result, attempts };
  }
  return { ok: false, statusCode: 404, message: 'No recent LST file found', attempts };
}

function fetchKmaLstData(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }
    const date = searchParams.get('date');
    if (!/^\d{12}$/.test(date || '')) {
      reject(new Error('A 12-digit UTC date is required'));
      return;
    }
    const area = String(searchParams.get('area') || 'KO').toUpperCase();
    const url = new URL(`https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/LST/${area}/data`);
    url.searchParams.set('date', date);
    url.searchParams.set('authKey', kmaApiKey);
    const request = httpsRequest(url, { method: 'GET', timeout: 45000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      upstream.on('end', () => resolvePromise({
        statusCode: upstream.statusCode || 502,
        body: Buffer.concat(chunks),
        contentType: upstream.headers['content-type'] || 'application/octet-stream',
      }));
    });
    request.on('timeout', () => request.destroy(new Error('KMA LST data download timeout')));
    request.on('error', reject);
    request.end();
  });
}

const kmaLstGridCache = new Map();

function h5AttributeNumber(attribute, fallback = NaN) {
  const value = attribute?.value ?? attribute;
  const scalar = ArrayBuffer.isView(value) || Array.isArray(value) ? value[0] : value;
  const number = Number(scalar);
  return Number.isFinite(number) ? number : fallback;
}

async function buildKmaLstGrid(searchParams) {
  const date = searchParams.get('date');
  if (!/^\d{12}$/.test(date || '')) throw new Error('A 12-digit UTC date is required');
  if (kmaLstGridCache.has(date)) return kmaLstGridCache.get(date);

  const downloaded = await fetchKmaLstData(searchParams);
  if (downloaded.statusCode !== 200) {
    throw new Error(`KMA LST download failed (${downloaded.statusCode})`);
  }

  await h5wasm.ready;
  const workDir = mkdtempSync(join(tmpdir(), 'livinglabs-lst-'));
  const filePath = join(workDir, `${date}.nc`);
  writeFileSync(filePath, downloaded.body);

  try {
    const file = new h5wasm.File(filePath, 'r');
    try {
      const lstDataset = file.get('LST');
      const qualityDataset = file.get('DQF_LST');
      const projectionDataset = file.get('gk2a_imager_projection');
      const projection = projectionDataset.attrs;
      const width = h5AttributeNumber(projection.image_width);
      const height = h5AttributeNumber(projection.image_height);
      const pixelSize = h5AttributeNumber(projection.pixel_size);
      const upperLeftEasting = h5AttributeNumber(projection.upper_left_easting);
      const upperLeftNorthing = h5AttributeNumber(projection.upper_left_northing);
      const sourceProjection = [
        '+proj=lcc',
        `+lat_1=${h5AttributeNumber(projection.standard_parallel1)}`,
        `+lat_2=${h5AttributeNumber(projection.standard_parallel2)}`,
        `+lat_0=${h5AttributeNumber(projection.origin_latitude)}`,
        `+lon_0=${h5AttributeNumber(projection.central_meridian)}`,
        `+x_0=${h5AttributeNumber(projection.false_easting, 0)}`,
        `+y_0=${h5AttributeNumber(projection.false_northing, 0)}`,
        '+datum=WGS84',
        '+units=m',
        '+no_defs',
      ].join(' ');
      const gyeonggiBounds = { west: 126.32, south: 36.82, east: 127.88, north: 38.32 };
      const projectedCorners = [
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.west, gyeonggiBounds.south]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.west, gyeonggiBounds.north]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.east, gyeonggiBounds.south]),
        proj4('EPSG:4326', sourceProjection, [gyeonggiBounds.east, gyeonggiBounds.north]),
      ];
      const minX = Math.min(...projectedCorners.map(([x]) => x));
      const maxX = Math.max(...projectedCorners.map(([x]) => x));
      const minY = Math.min(...projectedCorners.map(([, y]) => y));
      const maxY = Math.max(...projectedCorners.map(([, y]) => y));
      const startColumn = Math.max(0, Math.floor((minX - upperLeftEasting) / pixelSize) - 1);
      const endColumn = Math.min(width, Math.ceil((maxX - upperLeftEasting) / pixelSize) + 1);
      const startRow = Math.max(0, Math.floor((upperLeftNorthing - maxY) / pixelSize) - 1);
      const endRow = Math.min(height, Math.ceil((upperLeftNorthing - minY) / pixelSize) + 1);
      const columnCount = endColumn - startColumn;
      const rowCount = endRow - startRow;
      const rawValues = lstDataset.slice([[startRow, endRow], [startColumn, endColumn]]);
      const qualityValues = qualityDataset.slice([[startRow, endRow], [startColumn, endColumn]]);
      const scaleFactor = h5AttributeNumber(lstDataset.attrs.scale_factor, 0.01);
      const addOffset = h5AttributeNumber(lstDataset.attrs.add_offset, 0);
      const fillValue = h5AttributeNumber(lstDataset.attrs._FillValue, 65535);
      const cells = [];

      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
          const index = row * columnCount + column;
          const rawValue = Number(rawValues[index]);
          const quality = Number(qualityValues[index]);
          if (rawValue === fillValue || quality !== 0) continue;
          const x = upperLeftEasting + (startColumn + column) * pixelSize;
          const y = upperLeftNorthing - (startRow + row) * pixelSize;
          const [longitude, latitude] = proj4(sourceProjection, 'EPSG:4326', [x, y]);
          if (
            longitude < gyeonggiBounds.west || longitude > gyeonggiBounds.east ||
            latitude < gyeonggiBounds.south || latitude > gyeonggiBounds.north
          ) continue;
          cells.push({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            temperatureC: Number((rawValue * scaleFactor + addOffset - 273.15).toFixed(2)),
            quality,
          });
        }
      }

      const temperatures = cells.map((cell) => cell.temperatureC);
      const result = {
        ok: true,
        date,
        gridSizeMeters: pixelSize,
        cells,
        minC: temperatures.length ? Math.min(...temperatures) : null,
        maxC: temperatures.length ? Math.max(...temperatures) : null,
        count: cells.length,
      };
      kmaLstGridCache.set(date, result);
      if (kmaLstGridCache.size > 24) kmaLstGridCache.delete(kmaLstGridCache.keys().next().value);
      return result;
    } finally {
      file.close();
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
const kmaNetworkCache = new Map();

function requestKmaText(pathname, params) {
  return new Promise((resolvePromise, reject) => {
    if (!kmaApiKey) {
      reject(new Error('Missing KMA_API_KEY'));
      return;
    }
    const url = new URL(`https://apihub.kma.go.kr/api/typ01/${pathname}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('help', '0');
    url.searchParams.set('authKey', kmaApiKey);
    const request = httpsRequest(url, { method: 'GET', timeout: 25000, agent: httpsAgent }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });
      upstream.on('end', () => resolvePromise(new TextDecoder('euc-kr').decode(Buffer.concat(chunks))));
    });
    request.on('timeout', () => request.destroy(new Error('KMA request timeout')));
    request.on('error', reject);
    request.end();
  });
}

function parseKmaStations(payload, type) {
  return payload.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+\s+\d/.test(line)).map((line) => {
    const values = line.split(/\s+/);
    const nameIndex = type === 'asos' ? 10 : 8;
    return {
      id: values[0],
      longitude: Number(values[1]),
      latitude: Number(values[2]),
      name: values[nameIndex] || `관측소 ${values[0]}`,
      type,
    };
  }).filter((station) => Number.isFinite(station.longitude) && Number.isFinite(station.latitude));
}

function parseKmaHourly(payload) {
  const observations = new Map();
  payload.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d{12}\s+\d+/.test(line)).forEach((line) => {
    const values = line.split(/\s+/);
    const numeric = (index) => {
      const value = Number(values[index]);
      return Number.isFinite(value) && value > -90 ? value : null;
    };
    observations.set(values[1], {
      observedAt: values[0],
      temperature: numeric(2),
      windDirection: numeric(3),
      windSpeed: numeric(4),
      rainfallDay: numeric(5),
      rainfallHour: numeric(6),
      humidity: numeric(7),
      stationPressure: numeric(8),
      seaLevelPressure: numeric(9),
    });
  });
  return observations;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (value) => value * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchKmaNetwork(type = 'asos', radiusKm = 35) {
  const safeType = type === 'aws' ? 'aws' : 'asos';
  const safeRadius = Math.min(80, Math.max(10, Number(radiusKm) || 35));
  const cacheKey = `${safeType}:${safeRadius}`;
  const cached = kmaNetworkCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < 5 * 60 * 1000) return cached.payload;

  const latestCompletedHour = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 13).replace(/[-T:]/g, '') + '00';
  const [selectedCatalogText, asosCatalogText, observationText] = await Promise.all([
    requestKmaText('url/stn_inf.php', { inf: safeType === 'asos' ? 'SFC' : 'AWS', stn: 0 }),
    requestKmaText('url/stn_inf.php', { inf: 'SFC', stn: 0 }),
    requestKmaText('url/awsh.php', { tm: latestCompletedHour, stn: 0 }),
  ]);

  const selectedStations = parseKmaStations(selectedCatalogText, safeType);
  const asosIds = new Set(parseKmaStations(asosCatalogText, 'asos').map((station) => station.id));
  const observations = parseKmaHourly(observationText);
  const center = { latitude: 37.2636, longitude: 127.0286 };
  const stations = selectedStations
    .filter((station) => safeType === 'asos' || !asosIds.has(station.id))
    .map((station) => ({
      ...station,
      distanceKm: distanceKm(center.latitude, center.longitude, station.latitude, station.longitude),
      observation: observations.get(station.id) || null,
    }))
    .filter((station) => station.distanceKm <= safeRadius && station.observation?.temperature != null)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const payload = {
    ok: true,
    type: safeType,
    radiusKm: safeRadius,
    center,
    observedAt: stations[0]?.observation?.observedAt || latestCompletedHour,
    count: stations.length,
    stations,
  };
  kmaNetworkCache.set(cacheKey, { storedAt: Date.now(), payload });
  return payload;
}
const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, '');
    return;
  }

  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') {
    send(response, 200, JSON.stringify({ ok: true, service: 'vworld-data-proxy' }));
    return;
  }

  if (url.pathname === '/dev-reset') {
    if (request.method === 'GET') {
      send(response, 200, JSON.stringify({ ok: true, ...readHandoffStore(devResetStatePath) }));
      return;
    }
    if (!['POST', 'DELETE'].includes(request.method)) {
      send(response, 405, JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    resetDevStores();
    send(response, 200, JSON.stringify({
      ok: true,
      reset: [
        'priority-handoffs',
        'responsible-handoffs',
        'responsible-review-responses',
      ],
      ...readHandoffStore(devResetStatePath),
    }));
    return;
  }

  if (url.pathname === '/priority-handoff') {
    if (request.method === 'GET') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      send(response, 200, JSON.stringify({
        ok: true,
        payload: regionCode ? store[regionCode] || null : null,
      }));
      return;
    }

    if (request.method === 'POST') {
      try {
        const payload = await readJsonBody(request);
        if (!payload?.regionCode || payload?.schemaVersion !== 'priority-management-handoff/v1') {
          send(response, 400, JSON.stringify({ ok: false, error: 'Invalid priority handoff payload' }));
          return;
        }
        const store = readHandoffStore();
        store[payload.regionCode] = {
          ...payload,
          storedAt: new Date().toISOString(),
        };
        writeHandoffStore(store);
        send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
      } catch (error) {
        send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
      }
      return;
    }

    if (request.method === 'DELETE') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      if (regionCode) delete store[regionCode];
      writeHandoffStore(store);
      send(response, 200, JSON.stringify({ ok: true, regionCode }));
      return;
    }
  }

  if (url.pathname === '/responsible-handoff') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleHandoffStorePath,
      schemaVersion: 'lead-to-responsible-handoff/v1',
    })) return;
  }

  if (url.pathname === '/responsible-review-response') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleReviewStorePath,
      schemaVersion: 'responsible-to-lead-review/v1',
    })) return;
  }

  if (url.pathname === '/kma-network') {
    try {
      const payload = await fetchKmaNetwork(url.searchParams.get('type') || 'asos', url.searchParams.get('radiusKm') || 35);
      send(response, 200, JSON.stringify(payload));
    } catch (error) {
      send(response, 502, JSON.stringify({ ok: false, error: error?.message || 'Failed to load KMA station network' }));
    }
    return;
  }
  if (url.pathname === '/kma-observation') {
    try {
      const result = await fetchKmaObservation(url.searchParams);
      send(response, result.statusCode, result.body, 'text/plain; charset=utf-8');
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'Local KMA proxy failed',
      }));
    }
    return;
  }
  if (url.pathname === '/kma-lst-list') {
    try {
      const result = await fetchKmaLstList(url.searchParams);
      send(response, result.statusCode, result.body);
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST list request failed',
      }));
    }
    return;
  }
  if (url.pathname === '/kma-lst-files') {
    try {
      const result = await fetchKmaLstFileList(url.searchParams);
      send(response, result.statusCode, result.body, 'text/plain; charset=utf-8');
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST file-list request failed',
      }));
    }
    return;
  }
  if (url.pathname === '/kma-lst-check') {
    try {
      const result = await checkRecentKmaLstData(url.searchParams);
      send(response, result.ok ? 200 : result.statusCode || 502, JSON.stringify(result));
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST data check failed',
      }));
    }
    return;
  }
  if (url.pathname === '/kma-lst-data') {
    try {
      const result = await fetchKmaLstData(url.searchParams);
      send(response, result.statusCode, result.body, result.contentType);
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST data download failed',
      }));
    }
    return;
  }
  if (url.pathname === '/kma-lst-grid') {
    try {
      const result = await buildKmaLstGrid(url.searchParams);
      send(response, 200, JSON.stringify(result));
    } catch (error) {
      send(response, 502, JSON.stringify({
        ok: false,
        error: error?.message || 'KMA LST grid conversion failed',
      }));
    }
    return;
  }
  if (url.pathname !== '/vworld-data') {
    send(response, 404, JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const result = await fetchVWorldData(url.searchParams);
    send(response, result.statusCode, result.body);
  } catch (error) {
    send(response, 502, JSON.stringify({
      response: {
        status: 'ERROR',
        error: {
          code: 'LOCAL_PROXY_ERROR',
          text: error?.message || 'Local VWorld proxy failed',
        },
      },
    }));
  }
});

server.listen(port, '127.0.0.1', () => {
  try {
    console.log(`VWorld data proxy listening on http://127.0.0.1:${port}/vworld-data`);
  } catch {
    // Hidden Windows background processes may not have a writable console.
  }
});
