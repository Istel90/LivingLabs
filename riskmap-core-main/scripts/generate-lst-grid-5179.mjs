import fs from 'node:fs/promises';
import path from 'node:path';
import proj4 from 'proj4';
import parseGeoraster from 'georaster';

const [sourcePath, targetGridPath, outputPath] = process.argv.slice(2);

if (!sourcePath || !targetGridPath || !outputPath) {
    console.error('Usage: node scripts/generate-lst-grid-5179.mjs <source-lst.tif> <target-grid-json> <output.json>');
    process.exit(1);
}

proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs');
proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs +type=crs');

const round = (value, digits = 5) => {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

const sourceBuffer = await fs.readFile(sourcePath);
const sourceArrayBuffer = sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);
const sourceRaster = await parseGeoraster(sourceArrayBuffer);
const sourceBand = sourceRaster.values?.[0];

if (!sourceBand) {
    console.error('The LST GeoTIFF does not contain a readable first band.');
    process.exit(1);
}

const targetGrid = JSON.parse(await fs.readFile(targetGridPath, 'utf8'));
const columns = targetGrid.columns;
const rows = targetGrid.rows;
const originX = targetGrid.transform?.originX ?? targetGrid.extent?.xmin;
const originY = targetGrid.transform?.originY ?? targetGrid.extent?.ymax;
const cellSize = Math.abs(targetGrid.transform?.pixelWidth ?? 100);
const targetMask = (targetGrid.values || []).map(Number.isFinite);

if (!columns || !rows || !originX || !originY || targetMask.length !== columns * rows) {
    console.error('Target grid JSON is missing columns, rows, transform, or values.');
    process.exit(1);
}

const sums = new Array(rows * columns).fill(0);
const counts = new Array(rows * columns).fill(0);
const sourcePixelHeight = Math.abs(sourceRaster.pixelHeight);
const sourcePixelWidth = Math.abs(sourceRaster.pixelWidth);
const sourceCrs = `EPSG:${sourceRaster.projection}`;
const targetCrs = targetGrid.crs || 'EPSG:5179';

let sourceValidPixels = 0;
let sourceMatchedPixels = 0;
let sourceMin = Infinity;
let sourceMax = -Infinity;
let sourceSum = 0;

for (let y = 0; y < sourceRaster.height; y += 1) {
    const row = sourceBand[y];
    const yCenter = sourceRaster.ymax - (y + 0.5) * sourcePixelHeight;

    for (let x = 0; x < sourceRaster.width; x += 1) {
        const value = Number(row[x]);
        if (!Number.isFinite(value) || value === sourceRaster.noDataValue) continue;

        const xCenter = sourceRaster.xmin + (x + 0.5) * sourcePixelWidth;
        const [targetX, targetY] = proj4(sourceCrs, targetCrs, [xCenter, yCenter]);
        const targetCol = Math.floor((targetX - originX) / cellSize);
        const targetRow = Math.floor((originY - targetY) / cellSize);

        sourceValidPixels += 1;
        sourceMin = Math.min(sourceMin, value);
        sourceMax = Math.max(sourceMax, value);
        sourceSum += value;

        if (targetCol < 0 || targetCol >= columns || targetRow < 0 || targetRow >= rows) continue;

        const index = targetRow * columns + targetCol;
        if (!targetMask[index]) continue;

        sums[index] += value;
        counts[index] += 1;
        sourceMatchedPixels += 1;
    }
}

const rawValues = sums.map((sum, index) => counts[index] ? round(sum / counts[index], 4) : null);
const validRawValues = rawValues.filter(Number.isFinite);
const rawMin = Math.min(...validRawValues);
const rawMax = Math.max(...validRawValues);
const rawMean = validRawValues.reduce((sum, value) => sum + value, 0) / validRawValues.length;
const range = Math.max(rawMax - rawMin, 0.000001);
const values = rawValues.map((value) => Number.isFinite(value) ? round((value - rawMin) / range, 5) : null);
const validValues = values.filter(Number.isFinite);
const normalizedMean = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;

const output = {
    id: 'suwon_lst_100m_epsg5179',
    label: '수원 LST 100m 격자 평균(EPSG:5179)',
    sourceFile: path.basename(sourcePath),
    sourceResolution: `${sourcePixelWidth}m`,
    sourceCrs,
    gridUnit: '100m',
    crs: targetCrs,
    targetGridId: targetGrid.id,
    targetGridSource: path.basename(targetGridPath),
    noDataValue: sourceRaster.noDataValue,
    extent: targetGrid.extent,
    transform: {
        originX,
        originY,
        pixelWidth: cellSize,
        pixelHeight: cellSize
    },
    columns,
    rows,
    valueEncoding: 'row-major, top-left origin, null means NoData',
    rawUnit: 'degree Celsius, source LST pixels averaged into EPSG:5179 100m target cells',
    normalizedMethod: 'min-max over valid EPSG:5179 target cells with matched LST pixels',
    reprojectionMethod: 'source EPSG:5186 pixel centers transformed to target EPSG:5179, then binned by target 100m cell',
    stats: {
        sourceBytes: sourceBuffer.byteLength,
        sourceWidth: sourceRaster.width,
        sourceHeight: sourceRaster.height,
        sourcePixelWidth: sourceRaster.pixelWidth,
        sourcePixelHeight: sourceRaster.pixelHeight,
        sourceValidPixels,
        sourceMatchedPixels,
        targetMaskCells: targetMask.filter(Boolean).length,
        validCells: validRawValues.length,
        sourceMin: round(sourceMin, 4),
        sourceMax: round(sourceMax, 4),
        sourceMean: round(sourceSum / sourceValidPixels, 4),
        rawMin: round(rawMin, 4),
        rawMax: round(rawMax, 4),
        rawMean: round(rawMean, 4),
        normalizedMean: round(normalizedMean, 5)
    },
    rawValues,
    values
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output), 'utf8');

console.log(JSON.stringify({
    outputPath,
    bytes: (await fs.stat(outputPath)).size,
    crs: output.crs,
    sourceCrs,
    rows,
    columns,
    targetMaskCells: output.stats.targetMaskCells,
    validCells: output.stats.validCells,
    sourceMatchedPixels,
    rawMean: output.stats.rawMean,
    normalizedMean: output.stats.normalizedMean
}, null, 2));
