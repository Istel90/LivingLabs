import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'riskmap-core-main/package.json'));
const GeoTIFF = require('geotiff');
const sourcePath = resolve(root, 'riskmap-core-main/data/raw/gee/indicators/kor_lst_annual_summer_p90_2021_2025_100m_epsg5179.tif');
const maskPath = resolve(root, 'riskmap-core-main/static/analysis-data/suwon-lst-100m-epsg5179-grid.json');
const outputPath = resolve(root, 'riskmap-core-main/static/analysis-data/national/gee-lst-suwon-2021-2025-summer-p90-mean-100m.json');

const extent = { xmin: 949100, ymin: 1914000, xmax: 963700, ymax: 1928200 };
const transform = { originX: 949100, originY: 1928200, pixelWidth: 100, pixelHeight: 100 };
const columns = 146;
const rows = 142;

const sourceBytes = readFileSync(sourcePath);
const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength);
const tiff = await GeoTIFF.fromArrayBuffer(sourceBuffer);
const image = await tiff.getImage(0);
const directory = image.getFileDirectory();
const pixelScale = directory.ModelPixelScale;
const tiepoint = directory.ModelTiepoint;
const sourceOriginX = tiepoint[3];
const sourceOriginY = tiepoint[4];
const sourcePixelWidth = pixelScale[0];
const sourcePixelHeight = pixelScale[1];
const window = [
  Math.round((extent.xmin - sourceOriginX) / sourcePixelWidth),
  Math.round((sourceOriginY - extent.ymax) / sourcePixelHeight),
  Math.round((extent.xmax - sourceOriginX) / sourcePixelWidth),
  Math.round((sourceOriginY - extent.ymin) / sourcePixelHeight),
];
const [raster] = await image.readRasters({ window });
if (raster.length !== columns * rows) throw new Error(`Unexpected raster size: ${raster.length}`);

const mask = JSON.parse(readFileSync(maskPath, 'utf8').replace(/^\uFEFF/, ''));
const rawValues = Array.from(raster, (value, index) => (
  mask.values[index] == null || !Number.isFinite(value) || value <= -9990 ? null : Number(value.toFixed(4))
));
const validValues = rawValues.filter((value) => value != null);
const rawMin = Math.min(...validValues);
const rawMax = Math.max(...validValues);
const rawMean = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
const values = rawValues.map((value) => value == null ? null : Number(((value - rawMin) / (rawMax - rawMin)).toFixed(5)));

const output = {
  id: 'gee_lst_suwon_2021_2025_summer_p90_mean_100m',
  label: 'GEE Landsat 수원 여름철 LST P90 2021~2025 평균',
  sourceFile: 'kor_lst_annual_summer_p90_2021_2025_100m_epsg5179.tif',
  sourcePlatform: 'Google Earth Engine',
  sourceCollection: 'LANDSAT/LC08/C02/T1_L2 + LANDSAT/LC09/C02/T1_L2',
  periodYears: '2021-2025',
  months: [6, 7, 8, 9],
  temporalAggregation: '각 연도 여름철 LST P90을 산출한 뒤 5개년 평균',
  annualLayersAvailable: false,
  annualLayersNote: '현재 GeoTIFF는 5개년 평균 단일 밴드이며 2021~2025 연도별 레이어는 별도 재산출이 필요함',
  gridUnit: '100m',
  crs: 'EPSG:5179',
  columns,
  rows,
  extent,
  transform,
  rawUnit: '°C',
  valueEncoding: 'row-major, top-left origin, null means outside Suwon mask or NoData',
  normalizedMethod: 'min-max over valid Suwon 100m cells',
  stats: {
    sourceBytes: sourceBytes.length,
    validCells: validValues.length,
    rawMin: Number(rawMin.toFixed(4)),
    rawMax: Number(rawMax.toFixed(4)),
    rawMean: Number(rawMean.toFixed(4)),
  },
  rawValues,
  values,
};

writeFileSync(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
console.log(JSON.stringify(output.stats));
