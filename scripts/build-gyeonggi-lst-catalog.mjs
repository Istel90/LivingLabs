import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as h5wasm from 'h5wasm/node';
import proj4 from 'proj4';

const ROOT = new URL('../', import.meta.url);
const ENV_PATH = new URL('../riskmap-core-main/.env.local', import.meta.url);
const BOUNDARY_PATH = new URL('../public/data/gyeonggi-boundary.geojson', import.meta.url);
const OUTPUT_DIRECTORY = new URL('../public/data/weather/lst/gyeonggi/', import.meta.url);
const CATALOG_PATH = new URL('../public/data/weather/lst/gyeonggi-catalog.json', import.meta.url);
const API_BASE = 'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2';
// This workspace already opts into the same TLS compatibility mode in
// riskmap-core-main/.env.local for the local KMA/VWorld proxy.
const httpsAgent = new HttpsAgent({ keepAlive: true, rejectUnauthorized: false });

function loadApiKey() {
  const line = readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('KMA_API_KEY='));
  if (!line) throw new Error('KMA_API_KEY is missing from riskmap-core-main/.env.local');
  return line.slice('KMA_API_KEY='.length).trim();
}

function attributeNumber(attribute, fallback = Number.NaN) {
  const value = attribute?.value ?? attribute;
  const scalar = ArrayBuffer.isView(value) || Array.isArray(value) ? value[0] : value;
  const number = Number(scalar);
  return Number.isFinite(number) ? number : fallback;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if ((y1 > latitude) !== (y2 > latitude) && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function pointInGeometry(longitude, latitude, geometry) {
  const polygons = geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
  return polygons.some((polygon) => (
    pointInRing(longitude, latitude, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole))
  ));
}

function pointInBoundary(longitude, latitude, boundary) {
  return boundary.features.some((feature) => pointInGeometry(longitude, latitude, feature.geometry));
}

function boundaryExtent(boundary) {
  const result = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  const visit = (coordinates) => {
    if (typeof coordinates?.[0] === 'number') {
      result.west = Math.min(result.west, coordinates[0]);
      result.south = Math.min(result.south, coordinates[1]);
      result.east = Math.max(result.east, coordinates[0]);
      result.north = Math.max(result.north, coordinates[1]);
      return;
    }
    coordinates?.forEach(visit);
  };
  boundary.features.forEach((feature) => visit(feature.geometry?.coordinates));
  return result;
}

function fetchProduct(apiKey, product, date) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/${product}/KO/data`);
    url.searchParams.set('date', date);
    url.searchParams.set('authKey', apiKey);
    const request = httpsRequest(url, { method: 'GET', timeout: 45_000, agent: httpsAgent }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode || 502,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('timeout', () => request.destroy(new Error(`${product} ${date} request timeout`)));
    request.on('error', reject);
    request.end();
  });
}

function withHdf5(buffer, date, product, callback) {
  const directory = mkdtempSync(join(tmpdir(), `livinglabs-${product.toLowerCase()}-`));
  const path = join(directory, `${date}.nc`);
  writeFileSync(path, buffer);
  try {
    const file = new h5wasm.File(path, 'r');
    try {
      return callback(file);
    } finally {
      file.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function projectionDefinition(attrs) {
  return [
    '+proj=lcc',
    `+lat_1=${attributeNumber(attrs.standard_parallel1)}`,
    `+lat_2=${attributeNumber(attrs.standard_parallel2)}`,
    `+lat_0=${attributeNumber(attrs.origin_latitude)}`,
    `+lon_0=${attributeNumber(attrs.central_meridian)}`,
    `+x_0=${attributeNumber(attrs.false_easting, 0)}`,
    `+y_0=${attributeNumber(attrs.false_northing, 0)}`,
    '+datum=WGS84',
    '+units=m',
    '+no_defs',
  ].join(' ');
}

function buildGyeonggiPixelIndex(file, boundary) {
  const projection = file.get('gk2a_imager_projection').attrs;
  const width = attributeNumber(projection.image_width);
  const height = attributeNumber(projection.image_height);
  const pixelSize = attributeNumber(projection.pixel_size);
  const upperLeftEasting = attributeNumber(projection.upper_left_easting);
  const upperLeftNorthing = attributeNumber(projection.upper_left_northing);
  const sourceProjection = projectionDefinition(projection);
  const extent = boundaryExtent(boundary);
  const projectedCorners = [
    [extent.west, extent.south],
    [extent.west, extent.north],
    [extent.east, extent.south],
    [extent.east, extent.north],
  ].map((coordinate) => proj4('EPSG:4326', sourceProjection, coordinate));
  const minX = Math.min(...projectedCorners.map(([x]) => x));
  const maxX = Math.max(...projectedCorners.map(([x]) => x));
  const minY = Math.min(...projectedCorners.map(([, y]) => y));
  const maxY = Math.max(...projectedCorners.map(([, y]) => y));
  const startColumn = Math.max(0, Math.floor((minX - upperLeftEasting) / pixelSize) - 1);
  const endColumn = Math.min(width, Math.ceil((maxX - upperLeftEasting) / pixelSize) + 1);
  const startRow = Math.max(0, Math.floor((upperLeftNorthing - maxY) / pixelSize) - 1);
  const endRow = Math.min(height, Math.ceil((upperLeftNorthing - minY) / pixelSize) + 1);
  const pixels = [];
  for (let row = startRow; row < endRow; row += 1) {
    for (let column = startColumn; column < endColumn; column += 1) {
      const x = upperLeftEasting + column * pixelSize;
      const y = upperLeftNorthing - row * pixelSize;
      const [longitude, latitude] = proj4(sourceProjection, 'EPSG:4326', [x, y]);
      if (!pointInBoundary(longitude, latitude, boundary)) continue;
      pixels.push({
        index: row * width + column,
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      });
    }
  }
  return { pixels, pixelSize };
}

function buildUtcCandidates() {
  const candidates = [];
  const start = new Date('2026-05-01T00:00:00+09:00');
  const end = new Date('2026-07-28T00:00:00+09:00');
  for (let day = new Date(end); day >= start; day.setDate(day.getDate() - 1)) {
    const dateKst = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    ].join('-');
    for (const hour of [12, 13, 14]) {
      const date = new Date(`${dateKst}T${String(hour).padStart(2, '0')}:00:00+09:00`)
        .toISOString().slice(0, 16).replace(/[-T:]/g, '');
      candidates.push({ date, dateKst, timeKst: `${String(hour).padStart(2, '0')}:00` });
    }
  }
  return candidates;
}

async function mapPool(items, concurrency, task) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return output;
}

async function main() {
  await h5wasm.ready;
  const apiKey = loadApiKey();
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
  const candidates = buildUtcCandidates();
  let pixelIndex = null;
  let completed = 0;

  const cloudRecords = await mapPool(candidates, 4, async (candidate) => {
    try {
      const response = await fetchProduct(apiKey, 'CLD', candidate.date);
      if (response.statusCode !== 200 || response.body.subarray(0, 8).toString('hex') !== '894844460d0a1a0a') return null;
      const result = withHdf5(response.body, candidate.date, 'CLD', (file) => {
        if (!pixelIndex) pixelIndex = buildGyeonggiPixelIndex(file, boundary);
        const values = file.get('CLD').value;
        let cloud = 0;
        let clear = 0;
        let unknown = 0;
        for (const pixel of pixelIndex.pixels) {
          const value = Number(values[pixel.index]);
          if (value === 0 || value === 1) cloud += 1;
          else if (value === 2) clear += 1;
          else unknown += 1;
        }
        const total = cloud + clear + unknown;
        return {
          ...candidate,
          totalCells: total,
          cloudCells: cloud,
          clearCells: clear,
          unknownCells: unknown,
          cloudPercent: Number((cloud / total * 100).toFixed(1)),
          clearPercent: Number((clear / total * 100).toFixed(1)),
        };
      });
      completed += 1;
      if (completed % 20 === 0) console.log(`CLD scan ${completed}/${candidates.length}`);
      return result;
    } catch (error) {
      console.warn(`CLD ${candidate.date} skipped: ${error.message}`);
      return null;
    }
  });

  const ranked = cloudRecords
    .filter(Boolean)
    .sort((left, right) => left.cloudPercent - right.cloudPercent || right.clearPercent - left.clearPercent)
    .slice(0, 40);

  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const selected = [];
  for (const cloud of ranked) {
    if (selected.length >= 20) break;
    try {
      const response = await fetchProduct(apiKey, 'LST', cloud.date);
      if (response.statusCode !== 200 || response.body.subarray(0, 8).toString('hex') !== '894844460d0a1a0a') continue;
      const snapshot = withHdf5(response.body, cloud.date, 'LST', (file) => {
        const values = file.get('LST').value;
        const quality = file.get('DQF_LST').value;
        const attrs = file.get('LST').attrs;
        const scaleFactor = attributeNumber(attrs.scale_factor, 0.01);
        const addOffset = attributeNumber(attrs.add_offset, 0);
        const fillValue = attributeNumber(attrs._FillValue, 65535);
        const cells = [];
        for (const pixel of pixelIndex.pixels) {
          const rawValue = Number(values[pixel.index]);
          if (rawValue === fillValue || Number(quality[pixel.index]) !== 0) continue;
          cells.push({
            latitude: pixel.latitude,
            longitude: pixel.longitude,
            temperatureC: Number((rawValue * scaleFactor + addOffset - 273.15).toFixed(2)),
          });
        }
        const temperatures = cells.map((cell) => cell.temperatureC);
        return {
          ok: true,
          date: cloud.date,
          dateKst: cloud.dateKst,
          timeKst: cloud.timeKst,
          area: '경기도',
          source: 'GK2A AMI L2 LST/CLD',
          gridSizeMeters: pixelIndex.pixelSize,
          totalCells: cloud.totalCells,
          cloudCells: cloud.cloudCells,
          clearCells: cloud.clearCells,
          unknownCells: cloud.unknownCells,
          cloudPercent: cloud.cloudPercent,
          clearPercent: cloud.clearPercent,
          lstValidCells: cells.length,
          lstCoveragePercent: Number((cells.length / cloud.totalCells * 100).toFixed(1)),
          minC: temperatures.length ? Math.min(...temperatures) : null,
          maxC: temperatures.length ? Math.max(...temperatures) : null,
          cells,
        };
      });
      writeFileSync(new URL(`./${cloud.date}.json`, OUTPUT_DIRECTORY), JSON.stringify(snapshot));
      selected.push({ ...snapshot, cells: undefined, file: `/data/weather/lst/gyeonggi/${cloud.date}.json` });
      console.log(`selected ${selected.length}/20 ${cloud.dateKst} ${cloud.timeKst} cloud ${cloud.cloudPercent}%`);
    } catch (error) {
      console.warn(`LST ${cloud.date} skipped: ${error.message}`);
    }
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    method: '2026-05-01~2026-07-28, 12/13/14 KST CLD scan; lowest Gyeonggi cloud fraction; matching original LST',
    count: selected.length,
    records: selected,
  };
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`catalog written: ${selected.length} records -> ${CATALOG_PATH.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
