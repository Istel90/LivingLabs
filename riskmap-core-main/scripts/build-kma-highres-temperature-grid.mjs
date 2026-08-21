import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as h5wasm from 'h5wasm/node';
import proj4 from 'proj4';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(projectRoot, 'data', 'raw', 'kma', 'highres-500m');
const outputDir = path.join(projectRoot, 'static', 'analysis-data', 'climate');
const years = [2021, 2022, 2023, 2024, 2025];
const binaryPath = path.join(outputDir, 'kma-highres-ta-2021-2025-500m.f32.gz');
const metadataPath = path.join(outputDir, 'kma-highres-ta-2021-2025-500m.json');

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.match(/^([^#=\s]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

const env = {
  ...process.env,
  ...loadEnv(path.join(projectRoot, '.env.local')),
};

async function downloadIfMissing(filePath, url) {
  if (existsSync(filePath)) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`KMA download failed (${response.status}): ${url.pathname}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function ensureSourceFiles() {
  await fs.mkdir(rawDir, { recursive: true });
  await downloadIfMissing(
    path.join(rawDir, 'sfc_grid_latlon.nc'),
    new URL('https://apihub.kma.go.kr/getAttachFile.do?fileName=sfc_grid_latlon.nc'),
  );
  if (!env.KMA_API_KEY) throw new Error('KMA_API_KEY is missing');
  for (const year of years) {
    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/sfc_grid_nc_sts_down.php');
    url.searchParams.set('var', 'ta_avg');
    url.searchParams.set('tm', String(year));
    url.searchParams.set('authKey', env.KMA_API_KEY);
    await downloadIfMissing(path.join(rawDir, `ta_avg_${year}.nc`), url);
  }
}

await ensureSourceFiles();
proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs',
);

await h5wasm.ready;
const latLonFile = new h5wasm.File(path.join(rawDir, 'sfc_grid_latlon.nc'), 'r');
const yearFiles = years.map((year) => new h5wasm.File(path.join(rawDir, `ta_avg_${year}.nc`), 'r'));

try {
  const latitudes = latLonFile.get('lat').value;
  const longitudes = latLonFile.get('lon').value;
  const annualValues = yearFiles.map((file) => file.get('data').value);
  const records = [];
  let minimum = Infinity;
  let maximum = -Infinity;
  let sum = 0;

  for (let index = 0; index < annualValues[0].length; index += 1) {
    let annualSum = 0;
    let validYears = 0;
    for (const values of annualValues) {
      const rawValue = Number(values[index]);
      if (rawValue === -9990 || !Number.isFinite(rawValue)) continue;
      annualSum += rawValue / 10;
      validYears += 1;
    }
    const longitude = Number(longitudes[index]);
    const latitude = Number(latitudes[index]);
    if (validYears < 4 || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const temperature = annualSum / validYears;
    const [x, y] = proj4('EPSG:4326', 'EPSG:5179', [longitude, latitude]);
    if (![x, y, temperature].every(Number.isFinite)) continue;
    records.push(x, y, temperature);
    minimum = Math.min(minimum, temperature);
    maximum = Math.max(maximum, temperature);
    sum += temperature;
  }

  const bytes = Buffer.allocUnsafe(records.length * 4);
  records.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  const compressed = gzipSync(bytes, { level: 9 });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(binaryPath, compressed);
  await fs.writeFile(metadataPath, JSON.stringify({
    schemaVersion: 'kma-highres-temperature-grid/v1',
    source: 'KMA API Hub high-resolution observation grid annual statistics',
    sourceApi: 'sfc_grid_nc_sts_down.php?var=ta_avg',
    sourceResolution: '500m',
    sourceCrs: 'KMA 2049x2049 observation grid',
    outputCrs: 'EPSG:5179',
    period: '2021-2025',
    years,
    recordLayout: ['x', 'y', 'temperatureC'],
    recordType: 'Float32LE',
    recordBytes: 12,
    recordCount: records.length / 3,
    validYearMinimum: 4,
    stats: {
      rawMin: Number(minimum.toFixed(4)),
      rawMax: Number(maximum.toFixed(4)),
      rawMean: Number((sum / (records.length / 3)).toFixed(4)),
    },
  }, null, 2));
  console.log(`Generated ${records.length / 3} KMA 500m cells (${compressed.length} compressed bytes)`);
} finally {
  yearFiles.forEach((file) => file.close());
  latLonFile.close();
}