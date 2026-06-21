import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parseGeoraster from 'georaster';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, 'static/analysis-data/admin-physical-source');
const outputDir = path.resolve(projectRoot, 'static/analysis-data/admin-physical');
const statGridPath = path.resolve(projectRoot, 'static/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json');
const catalogPath = path.join(sourceDir, 'suwon_100m_new_indicator_catalog.json');

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
    const noDataValue = nodata ?? raster.noDataValue;

    for (let y = 0; y < raster.height; y += 1) {
        const row = band[y] || [];
        for (let x = 0; x < raster.width; x += 1) {
            const value = Number(row[x]);
            values.push(Number.isFinite(value) && value !== noDataValue ? round(value, 6) : null);
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

function normalizeValues(rawValues, item, rawStats) {
    const alreadyNormalized = item.normalization === 'already_0_1' || item.file.endsWith('_z.tif');

    if (alreadyNormalized) {
        return {
            method: 'already_normalized_0_1',
            values: rawValues.map((value) => Number.isFinite(value) ? round(Math.min(1, Math.max(0, value))) : null),
            normalizationRange: { min: 0, max: 1 }
        };
    }

    const min = rawStats.min;
    const max = rawStats.max;
    const range = Math.max(max - min, 0.000001);

    return {
        method: 'valid_grid_minmax_fallback',
        values: rawValues.map((value) => Number.isFinite(value) ? round(Math.min(1, Math.max(0, (value - min) / range))) : null),
        normalizationRange: { min: round(min), max: round(max) }
    };
}

function assertSameGrid(raster, statGrid, file) {
    const pixelWidth = Math.abs(raster.pixelWidth);
    const pixelHeight = Math.abs(raster.pixelHeight);
    const sameShape = raster.width === statGrid.columns && raster.height === statGrid.rows;
    const sameResolution = Math.abs(pixelWidth - statGrid.transform.pixelWidth) < 0.0001
        && Math.abs(pixelHeight - statGrid.transform.pixelHeight) < 0.0001;
    const sameOrigin = Math.abs(raster.xmin - statGrid.extent.xmin) < 0.0001
        && Math.abs(raster.ymax - statGrid.extent.ymax) < 0.0001;

    if (!sameShape || !sameResolution || !sameOrigin) {
        throw new Error(`${file} does not match the standard stat grid.`);
    }
}

function indicatorDirection(item) {
    if (item.direction?.includes('적응역량 증가')) return 'adaptive_capacity_increase';
    if (item.direction?.includes('취약성 증가')) return 'vulnerability_increase';
    return item.direction || null;
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
        assertSameGrid(raster, statGrid, item.file);

        const rawValues = flattenRawValues(raster, item.nodata);
        const rawStats = valueStats(rawValues);
        const normalized = normalizeValues(rawValues, item, rawStats);
        const normalizedStats = valueStats(normalized.values);
        const jsonFile = item.file.replace(/\.tif$/i, '.json');

        const grid = {
            id: item.indicator_id,
            label: item.indicator,
            sourceFile: item.file,
            dimension: item.dimension,
            subDimension: item.sub_dimension,
            component: item.component,
            gridUnit: '100m',
            crs: crsLabel(raster, item.crs),
            targetGridId: statGrid.id,
            targetGridPath: '/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json',
            columns: raster.width,
            rows: raster.height,
            noDataValue: item.nodata ?? raster.noDataValue,
            extent: statGrid.extent,
            transform: statGrid.transform,
            unit: item.normalization === 'already_0_1' ? '0-1 score' : 'ratio/proxy',
            direction: indicatorDirection(item),
            valueEncoding: 'row-major, top-left origin, null means NoData',
            rawValueEncoding: 'rawValues keep source ratio/proxy before normalization',
            normalizationMethod: normalized.method,
            normalizationSourceRange: normalized.normalizationRange,
            methodNote: item.method_note,
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
            webPath: `/analysis-data/admin-physical/${jsonFile}`,
            dimension: grid.dimension,
            subDimension: grid.subDimension,
            component: grid.component,
            crs: grid.crs,
            rows: grid.rows,
            columns: grid.columns,
            unit: grid.unit,
            direction: grid.direction,
            normalizationMethod: grid.normalizationMethod,
            stats: grid.stats
        });
    }

    const matching = {
        title: 'Suwon admin/physical 100m new V indicator matching',
        sourceZip: 'suwon_100m_admin_physical_new_indicators.zip',
        targetGrid: {
            id: statGrid.id,
            path: '/analysis-data/stat-grid/suwon-stat-grid-100m-epsg5179.json',
            crs: statGrid.crs,
            rows: statGrid.rows,
            columns: statGrid.columns,
            validCells: statGrid.stats.validCells
        },
        recommendedUiConnections: {
            singleHousehold: '/analysis-data/admin-physical/V_sensitivity_single_household_ratio_100m_z.json',
            chronicDisease: '/analysis-data/admin-physical/V_sensitivity_chronic_disease_ratio_proxy_100m_z.json',
            lowIncome: '/analysis-data/admin-physical/V_adaptive_low_income_ratio_proxy_100m_z.json',
            greenNatural: '/analysis-data/admin-physical/V_adaptive_green_natural_ratio_100m_z.json',
            oldHousing: '/analysis-data/admin-physical/V_adaptive_old_housing_ratio_100m_z.json',
            oldBuilding: '/analysis-data/admin-physical/V_adaptive_old_building_ratio_100m_z.json'
        },
        indicators: outputs
    };

    await fs.writeFile(path.join(outputDir, 'admin-physical-matching.json'), JSON.stringify(matching, null, 2), 'utf8');

    console.log(JSON.stringify({
        outputDir,
        indicators: outputs.length,
        targetGrid: matching.targetGrid,
        recommendedUiConnections: matching.recommendedUiConnections,
        outputs: outputs.map((item) => ({
            id: item.id,
            stats: item.stats,
            direction: item.direction,
            normalizationMethod: item.normalizationMethod
        }))
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
