import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parseGeoraster from 'georaster';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, 'static/analysis-data/population-source');
const outputDir = path.resolve(projectRoot, 'static/analysis-data/population');
const statGridPath = path.resolve(projectRoot, 'static/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json');
const catalogPath = path.join(sourceDir, 'indicator_catalog_suwon_population_100m.json');

const round = (value, digits = 5) => {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

const crsLabel = (raster, fallback) => {
    if (fallback) return fallback;
    if (raster.projection) return String(raster.projection).startsWith('EPSG:')
        ? String(raster.projection)
        : `EPSG:${raster.projection}`;
    return null;
};

function flattenRawValues(raster, nodata) {
    const band = raster.values?.[0] || [];
    const values = [];

    for (let y = 0; y < raster.height; y += 1) {
        const row = band[y] || [];
        for (let x = 0; x < raster.width; x += 1) {
            const value = Number(row[x]);
            values.push(Number.isFinite(value) && value !== nodata ? round(value, 6) : null);
        }
    }

    return values;
}

function valueStats(values) {
    let validCells = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        validCells += 1;
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
    }

    return {
        validCells,
        min: round(min),
        max: round(max),
        sum: round(sum),
        mean: round(validCells ? sum / validCells : null)
    };
}

function normalizeValues(rawValues, indicator, rawStats) {
    if (indicator.value_type === 'ratio' || indicator.normalization_method === 'already_normalized_or_fixed_minmax_0_1') {
        return {
            method: 'already_normalized_0_1',
            values: rawValues.map((value) => Number.isFinite(value) ? round(Math.min(1, Math.max(0, value))) : null)
        };
    }

    const min = Number.isFinite(Number(indicator.min_value)) ? Number(indicator.min_value) : rawStats.min;
    const max = Number.isFinite(Number(indicator.max_value)) ? Number(indicator.max_value) : rawStats.max;
    const range = Math.max(max - min, 0.000001);

    return {
        method: Number.isFinite(Number(indicator.min_value)) && Number.isFinite(Number(indicator.max_value))
            ? 'catalog_fixed_minmax'
            : 'valid_grid_minmax_fallback',
        values: rawValues.map((value) => Number.isFinite(value) ? round(Math.min(1, Math.max(0, (value - min) / range))) : null),
        normalizationRange: { min: round(min), max: round(max) }
    };
}

function assertSameGrid(raster, statGrid, item) {
    const pixelWidth = Math.abs(raster.pixelWidth);
    const pixelHeight = Math.abs(raster.pixelHeight);
    const sameShape = raster.width === statGrid.columns && raster.height === statGrid.rows;
    const sameResolution = Math.abs(pixelWidth - statGrid.transform.pixelWidth) < 0.0001
        && Math.abs(pixelHeight - statGrid.transform.pixelHeight) < 0.0001;
    const sameOrigin = Math.abs(raster.xmin - statGrid.extent.xmin) < 0.0001
        && Math.abs(raster.ymax - statGrid.extent.ymax) < 0.0001;

    if (!sameShape || !sameResolution || !sameOrigin) {
        throw new Error(`${item.file} does not match the standard stat grid.`);
    }
}

async function main() {
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
    const statGrid = JSON.parse(await fs.readFile(statGridPath, 'utf8'));
    await fs.mkdir(outputDir, { recursive: true });

    const outputs = [];

    for (const item of catalog) {
        const bytes = await fs.readFile(path.join(sourceDir, item.file));
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const raster = await parseGeoraster(arrayBuffer);
        assertSameGrid(raster, statGrid, item);

        const rawValues = flattenRawValues(raster, item.nodata);
        const rawStats = valueStats(rawValues);
        const normalized = normalizeValues(rawValues, item, rawStats);
        const normalizedStats = valueStats(normalized.values);
        const jsonFile = item.file.replace(/\.tif$/i, '.json');

        const grid = {
            id: item.indicator_id,
            label: item.name_ko,
            sourceFile: item.file,
            source: item.source || null,
            dimension: item.dimension,
            component: item.component || item.vulnerability_group || null,
            gridUnit: '100m',
            crs: crsLabel(raster, item.crs),
            targetGridId: statGrid.id,
            targetGridPath: '/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json',
            columns: raster.width,
            rows: raster.height,
            noDataValue: item.nodata ?? raster.noDataValue,
            extent: statGrid.extent,
            transform: statGrid.transform,
            unit: item.value_type === 'count' ? 'people' : 'ratio',
            direction: item.direction,
            valueEncoding: 'row-major, top-left origin, null means NoData',
            rawValueEncoding: 'rawValues keep source count/ratio before normalization',
            normalizationMethod: normalized.method,
            normalizationSourceRange: normalized.normalizationRange || {
                min: item.min_value ?? 0,
                max: item.max_value ?? 1
            },
            formula: item.formula || null,
            note: item.note || null,
            stats: {
                sourceBytes: bytes.byteLength,
                rawMin: rawStats.min,
                rawMax: rawStats.max,
                rawSum: rawStats.sum,
                rawMean: rawStats.mean,
                validCells: normalizedStats.validCells,
                min: normalizedStats.min,
                max: normalizedStats.max,
                mean: normalizedStats.mean,
                normalizedMean: normalizedStats.mean
            },
            rawValues,
            values: normalized.values
        };

        await fs.writeFile(path.join(outputDir, jsonFile), JSON.stringify(grid), 'utf8');
        outputs.push({
            id: grid.id,
            label: grid.label,
            sourceTif: item.file,
            json: jsonFile,
            webPath: `/analysis-data/population/${jsonFile}`,
            dimension: grid.dimension,
            component: grid.component,
            crs: grid.crs,
            rows: grid.rows,
            columns: grid.columns,
            unit: grid.unit,
            normalizationMethod: grid.normalizationMethod,
            stats: grid.stats
        });
    }

    const matching = {
        title: 'Suwon population 100m raster matching',
        sourceZip: 'suwon_population_100m_rasters.zip',
        targetGrid: {
            id: statGrid.id,
            path: '/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json',
            crs: statGrid.crs,
            rows: statGrid.rows,
            columns: statGrid.columns,
            validCells: statGrid.stats.validCells
        },
        indicators: outputs
    };

    await fs.writeFile(path.join(outputDir, 'population-matching.json'), JSON.stringify(matching, null, 2), 'utf8');

    console.log(JSON.stringify({
        outputDir,
        indicators: outputs.length,
        targetGrid: matching.targetGrid,
        outputs: outputs.map((item) => ({
            id: item.id,
            stats: item.stats,
            normalizationMethod: item.normalizationMethod
        }))
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
