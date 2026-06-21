import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parseGeoraster from 'georaster';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, 'static/analysis-data/ar6-hazard-source');
const outputDir = path.resolve(projectRoot, 'static/analysis-data/ar6-hazard');
const catalogPath = path.join(sourceDir, 'ar6_pdf_hazard_indicator_catalog_100m.json');

const round = (value, digits = 5) => {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

function flatRasterValues(georaster) {
    const band = georaster.values?.[0] || [];
    const values = [];
    for (const row of band) {
        for (const value of row) {
            const number = Number(value);
            values.push(Number.isFinite(number) && number !== georaster.noDataValue ? round(number) : null);
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

    return {
        validCells,
        min: round(min),
        max: round(max),
        mean: round(validCells ? sum / validCells : null),
        normalizedMean: round(validCells ? sum / validCells : null)
    };
}

async function main() {
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
    await fs.mkdir(outputDir, { recursive: true });

    const normalizedIndicators = catalog.indicators.filter((item) => item.normalized);
    const matchRows = [];

    for (const item of normalizedIndicators) {
        const tifPath = path.join(sourceDir, item.file);
        const bytes = await fs.readFile(tifPath);
        const georaster = await parseGeoraster(bytes);
        const values = flatRasterValues(georaster);
        const computedStats = stats(values);
        const jsonFile = item.file.replace(/\.tif$/i, '.json');

        const grid = {
            id: item.indicator_id,
            label: item.name_ko,
            sourceFile: item.file,
            sourceRawFile: item.source_indicator_id ? `${item.source_indicator_id}.tif` : null,
            dimension: item.dimension,
            component: item.component,
            indicatorCode: item.indicator_code,
            indicatorKo: item.indicator_name_ko,
            definition: item.definition,
            scenario: item.scenario,
            period: item.period_code,
            periodKo: item.period_name_ko,
            periodYears: item.period_years,
            gridUnit: '100m',
            crs: catalog.metadata?.target_grid?.crs || georaster.projection || null,
            columns: georaster.width,
            rows: georaster.height,
            noDataValue: georaster.noDataValue,
            extent: {
                xmin: georaster.xmin,
                ymin: georaster.ymin,
                xmax: georaster.xmax,
                ymax: georaster.ymax
            },
            transform: {
                originX: georaster.xmin,
                originY: georaster.ymax,
                pixelWidth: georaster.pixelWidth,
                pixelHeight: georaster.pixelHeight
            },
            valueEncoding: 'row-major, top-left origin, null means NoData',
            normalizedMethod: item.normalization_method,
            normalizationSourceRange: {
                min: item.normalization_min ?? null,
                max: item.normalization_max ?? null
            },
            stats: {
                sourceBytes: bytes.byteLength,
                ...computedStats
            },
            values
        };

        await fs.writeFile(path.join(outputDir, jsonFile), JSON.stringify(grid));

        matchRows.push({
            id: item.indicator_id,
            pdfDimension: item.dimension,
            component: item.component,
            indicatorCode: item.indicator_code,
            indicatorKo: item.indicator_name_ko,
            definition: item.definition,
            scenario: item.scenario,
            period: item.period_code,
            periodKo: item.period_name_ko,
            periodYears: item.period_years,
            sourceTif: item.file,
            json: jsonFile,
            webPath: `/analysis-data/ar6-hazard/${jsonFile}`,
            matched: true,
            use: '_z normalized 100m grid for H calculation',
            stats: computedStats
        });
    }

    const matching = {
        title: '수원시 AR6 Hazard 미래 기후변화 100m TIF 매칭 현황',
        source: {
            pdf: '리스크평가도구_구조.pdf',
            xlsx: 'pdf_to_ar6_tif_matching_table.xlsx',
            zip: 'suwon_ar6_pdf_hazard_indicators_100m_tifs.zip'
        },
        defaultSelection: {
            scenario: 'SSP245',
            period: 'MT',
            periodKo: '중기',
            periodYears: '2041-2060'
        },
        targetGrid: catalog.metadata?.target_grid || null,
        indicators: matchRows
    };

    await fs.writeFile(path.join(outputDir, 'ar6-hazard-matching.json'), JSON.stringify(matching, null, 2));
    console.log(`Generated ${matchRows.length} normalized AR6 hazard grids in ${outputDir}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
