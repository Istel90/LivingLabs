import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parseGeoraster from 'georaster';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, 'static/analysis-data/stat-grid-source');
const outputDir = path.resolve(projectRoot, 'static/analysis-data/stat-grid');
const profilePath = path.join(sourceDir, 'suwon_stat_grid_profile_100m_epsg5179.json');

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

function flattenMask(raster, nodata) {
    const band = raster.values?.[0] || [];
    const values = [];

    for (let y = 0; y < raster.height; y += 1) {
        const row = band[y] || [];
        for (let x = 0; x < raster.width; x += 1) {
            const value = Number(row[x]);
            values.push(Number.isFinite(value) && value !== nodata && value > 0 ? 1 : null);
        }
    }

    return values;
}

function flattenGridIds(raster, nodata) {
    const band = raster.values?.[0] || [];
    const values = [];

    for (let y = 0; y < raster.height; y += 1) {
        const row = band[y] || [];
        for (let x = 0; x < raster.width; x += 1) {
            const value = Number(row[x]);
            values.push(Number.isFinite(value) && value !== nodata && value > 0 ? Math.round(value) : null);
        }
    }

    return values;
}

async function readRaster(file) {
    const bytes = await fs.readFile(path.join(sourceDir, file));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return {
        bytes,
        raster: await parseGeoraster(arrayBuffer)
    };
}

async function main() {
    const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
    const maskInput = await readRaster(profile.files.mask);
    const gridIdInput = await readRaster(profile.files.grid_id);
    const templateInput = await readRaster(profile.files.template);
    await fs.mkdir(outputDir, { recursive: true });

    const maskValues = flattenMask(maskInput.raster, profile.nodata.mask);
    const gridIdValues = flattenGridIds(gridIdInput.raster, profile.nodata.grid_id);
    const validCells = maskValues.filter(Number.isFinite).length;
    const gridIds = gridIdValues.filter(Number.isFinite);

    const grid = {
        id: 'suwon_stat_grid_100m_epsg5179',
        label: 'Suwon standard 100m statistics grid',
        sourceProfile: path.basename(profilePath),
        sourceFiles: profile.files,
        source: profile.source,
        region: profile.region,
        gridUnit: '100m',
        crs: crsLabel(maskInput.raster, profile.crs),
        columns: profile.width,
        rows: profile.height,
        noDataValue: profile.nodata.mask,
        extent: {
            xmin: profile.bounds.left,
            ymin: profile.bounds.bottom,
            xmax: profile.bounds.right,
            ymax: profile.bounds.top
        },
        transform: {
            originX: profile.transform[2],
            originY: profile.transform[5],
            pixelWidth: Math.abs(profile.transform[0]),
            pixelHeight: Math.abs(profile.transform[4])
        },
        valueEncoding: 'row-major, top-left origin, 1 means inside Suwon statistics grid, null means outside',
        stats: {
            sourceBytes: maskInput.bytes.byteLength + gridIdInput.bytes.byteLength + templateInput.bytes.byteLength,
            validCells,
            maskValidCellCount: profile.mask_valid_cell_count,
            gridCellCount: profile.grid_cell_count,
            gridIdMin: round(Math.min(...gridIds), 0),
            gridIdMax: round(Math.max(...gridIds), 0),
            templateWidth: templateInput.raster.width,
            templateHeight: templateInput.raster.height
        },
        profile,
        gridIds: gridIdValues,
        values: maskValues
    };

    const outputFile = 'suwon-stat-grid-100m-epsg5179.json';
    await fs.writeFile(path.join(outputDir, outputFile), JSON.stringify(grid), 'utf8');

    const matching = {
        title: 'Suwon standard statistics grid 100m matching',
        sourceZip: 'suwon_stat_grid_100m_standard_tif.zip',
        defaultGrid: `/analysis-data/stat-grid/${outputFile}`,
        crs: grid.crs,
        resolutionM: 100,
        rows: grid.rows,
        columns: grid.columns,
        validCells,
        notes: profile.notes,
        files: {
            source: profile.files,
            json: outputFile
        }
    };

    await fs.writeFile(path.join(outputDir, 'stat-grid-matching.json'), JSON.stringify(matching, null, 2), 'utf8');

    console.log(JSON.stringify({
        outputDir,
        outputFile,
        crs: grid.crs,
        rows: grid.rows,
        columns: grid.columns,
        validCells
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
