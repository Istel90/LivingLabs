import fs from 'node:fs/promises';
import path from 'node:path';
import parseGeoraster from 'georaster';

const sourceDir = path.resolve('static/analysis-data/cooling-shelter-source');
const outputDir = path.resolve('static/analysis-data/cooling-shelter');
const catalogPath = path.join(sourceDir, 'cooling_shelter_indicator_catalog.json');

const round = (value, digits = 5) => {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

function getValues(raster) {
    const band = raster.values?.[0] || [];
    const values = [];

    for (let y = 0; y < raster.height; y += 1) {
        const row = band[y] || [];
        for (let x = 0; x < raster.width; x += 1) {
            const value = Number(row[x]);
            values.push(Number.isFinite(value) && value !== raster.noDataValue ? round(value) : null);
        }
    }

    return values;
}

function stats(values) {
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

    const mean = validCells ? sum / validCells : null;

    return {
        validCells,
        min: round(min),
        max: round(max),
        mean: round(mean),
        normalizedMean: round(mean)
    };
}

async function main() {
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
    await fs.mkdir(outputDir, { recursive: true });

    const outputs = [];
    const files = [
        'V_adaptive_cooling_shelter_distance_100m.tif',
        'V_adaptive_cooling_shelter_distance_100m_z.tif',
        'V_adaptive_cooling_shelter_accessibility_100m_z.tif'
    ];

    for (const file of files) {
        const indicator = catalog.indicators.find((item) => item.file === file) || {};
        const bytes = await fs.readFile(path.join(sourceDir, file));
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const raster = await parseGeoraster(arrayBuffer);
        const values = getValues(raster);
        const valueStats = stats(values);
        const jsonFile = file.replace(/\.tif$/i, '.json');

        const grid = {
            id: indicator.indicator_id || file.replace(/\.tif$/i, ''),
            label: indicator.name_ko || file,
            sourceFile: file,
            dimension: indicator.dimension || 'V',
            subDimension: indicator.sub_dimension || 'Adaptive Capacity',
            component: indicator.component || '공공 시설',
            gridUnit: '100m',
            crs: `EPSG:${raster.projection}`,
            columns: raster.width,
            rows: raster.height,
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
                pixelWidth: Math.abs(raster.pixelWidth),
                pixelHeight: Math.abs(raster.pixelHeight)
            },
            unit: indicator.unit || null,
            direction: indicator.direction || null,
            normalizationMethod: indicator.normalization_method || null,
            note: indicator.note || null,
            valueEncoding: 'row-major, top-left origin, null means NoData',
            stats: {
                sourceBytes: bytes.byteLength,
                ...valueStats
            },
            values
        };

        await fs.writeFile(path.join(outputDir, jsonFile), JSON.stringify(grid), 'utf8');
        outputs.push({
            id: grid.id,
            label: grid.label,
            sourceTif: file,
            json: jsonFile,
            webPath: `/analysis-data/cooling-shelter/${jsonFile}`,
            crs: grid.crs,
            rows: grid.rows,
            columns: grid.columns,
            unit: grid.unit,
            direction: grid.direction,
            useForVDefault: Boolean(indicator.use_for_v_default),
            stats: grid.stats
        });
    }

    const matching = {
        title: '수원시 무더위쉼터 접근성 100m 데이터 매칭 현황',
        source: {
            zip: 'suwon_cooling_shelter_100m_distance_accessibility_tifs.zip',
            csv: catalog.source_csv
        },
        crs: catalog.crs,
        resolutionM: catalog.resolution_m,
        shelterCountUsed: catalog.shelter_count_used,
        method: catalog.method,
        caution: catalog.caution,
        defaultIndicator: outputs.find((item) => item.useForVDefault)?.id || null,
        indicators: outputs
    };

    await fs.writeFile(path.join(outputDir, 'cooling-shelter-matching.json'), JSON.stringify(matching, null, 2), 'utf8');
    console.log(JSON.stringify({
        outputDir,
        indicators: outputs.length,
        defaultIndicator: matching.defaultIndicator,
        shelterCountUsed: matching.shelterCountUsed,
        outputs: outputs.map((item) => ({ id: item.id, stats: item.stats }))
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
