import fs from 'node:fs/promises';
import path from 'node:path';
import parseGeoraster from 'georaster';

const [sourcePath, outputPath, gridUnitArg = '100'] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
    console.error('Usage: node scripts/generate-lst-grid.mjs <source.tif> <output.json> [gridMeters]');
    process.exit(1);
}

const gridSize = Number(gridUnitArg);
if (!Number.isFinite(gridSize) || gridSize <= 0) {
    console.error(`Invalid grid size: ${gridUnitArg}`);
    process.exit(1);
}

const buffer = await fs.readFile(sourcePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const raster = await parseGeoraster(arrayBuffer);
const band = raster.values?.[0];

if (!band) {
    console.error('The GeoTIFF does not contain a readable first band.');
    process.exit(1);
}

const columns = Math.ceil((raster.xmax - raster.xmin) / gridSize);
const rows = Math.ceil((raster.ymax - raster.ymin) / gridSize);
const sums = new Array(rows * columns).fill(0);
const counts = new Array(rows * columns).fill(0);
const pixelHeight = Math.abs(raster.pixelHeight);

let sourceValidPixels = 0;
let sourceMin = Infinity;
let sourceMax = -Infinity;
let sourceSum = 0;

for (let y = 0; y < raster.height; y += 1) {
    const row = band[y];
    const yCenter = raster.ymax - (y + 0.5) * pixelHeight;
    const gridY = Math.floor((raster.ymax - yCenter) / gridSize);
    if (gridY < 0 || gridY >= rows) continue;

    for (let x = 0; x < raster.width; x += 1) {
        const value = row[x];
        if (!Number.isFinite(value) || value === raster.noDataValue) continue;

        const xCenter = raster.xmin + (x + 0.5) * raster.pixelWidth;
        const gridX = Math.floor((xCenter - raster.xmin) / gridSize);
        if (gridX < 0 || gridX >= columns) continue;

        const index = gridY * columns + gridX;
        sums[index] += value;
        counts[index] += 1;

        sourceValidPixels += 1;
        sourceMin = Math.min(sourceMin, value);
        sourceMax = Math.max(sourceMax, value);
        sourceSum += value;
    }
}

const rawValues = sums.map((sum, index) => counts[index] ? Number((sum / counts[index]).toFixed(4)) : null);
const validRawValues = rawValues.filter(Number.isFinite);
const rawMin = Math.min(...validRawValues);
const rawMax = Math.max(...validRawValues);
const rawMean = validRawValues.reduce((sum, value) => sum + value, 0) / validRawValues.length;
const range = Math.max(rawMax - rawMin, 0.000001);
const values = rawValues.map((value) => Number.isFinite(value) ? Number(((value - rawMin) / range).toFixed(5)) : null);
const validValues = values.filter(Number.isFinite);
const normalizedMean = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;

const output = {
    id: `suwon_lst_${gridSize}m`,
    label: `수원 LST ${gridSize}m 격자 평균`,
    sourceFile: path.basename(sourcePath),
    sourceResolution: `${Math.abs(raster.pixelWidth)}m`,
    gridUnit: `${gridSize}m`,
    crs: `EPSG:${raster.projection}`,
    noDataValue: raster.noDataValue,
    extent: {
        xmin: raster.xmin,
        ymin: raster.ymin,
        xmax: raster.xmax,
        ymax: raster.ymax
    },
    transform: {
        originX: raster.xmin,
        originY: raster.ymax,
        cellSize: gridSize
    },
    columns,
    rows,
    valueEncoding: 'row-major, top-left origin, null means NoData',
    rawUnit: `degree Celsius, ${gridSize}m cell mean from source LST pixels`,
    normalizedMethod: `min-max over valid ${gridSize}m cells`,
    stats: {
        sourceBytes: buffer.byteLength,
        sourceWidth: raster.width,
        sourceHeight: raster.height,
        sourcePixelWidth: raster.pixelWidth,
        sourcePixelHeight: raster.pixelHeight,
        sourceValidPixels,
        sourceMin: Number(sourceMin.toFixed(4)),
        sourceMax: Number(sourceMax.toFixed(4)),
        sourceMean: Number((sourceSum / sourceValidPixels).toFixed(4)),
        validCells: validRawValues.length,
        rawMin: Number(rawMin.toFixed(4)),
        rawMax: Number(rawMax.toFixed(4)),
        rawMean: Number(rawMean.toFixed(4)),
        normalizedMean: Number(normalizedMean.toFixed(5))
    },
    rawValues,
    values
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output), 'utf8');
console.log(JSON.stringify({
    outputPath,
    bytes: (await fs.stat(outputPath)).size,
    rows,
    columns,
    validCells: validRawValues.length,
    rawMean: output.stats.rawMean,
    normalizedMean: output.stats.normalizedMean
}, null, 2));
