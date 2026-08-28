export const PRIORITY_ANALYSIS_CONTRACT_VERSION = 'priority-analysis-grid/v1';

export const ANALYSIS_GRID_ROUTES = Object.freeze({
    flood: '/flood-grid',
    analysis: '/analysis-grid',
    hazard: '/hazard-grid'
});

function joinApiRoute(apiBase, route) {
    const normalizedBase = String(apiBase || '').replace(/\/$/, '');
    return normalizedBase ? `${normalizedBase}${route}` : route;
}

export function indicatorContractKey(item) {
    return (
        item?.floodIndicator ||
        item?.analysisIndicator ||
        item?.indicatorCode ||
        String(item?.id || '')
    );
}

export function indicatorGridPath(item, regionCode, analysisApiUrl = '') {
    const code = String(regionCode || '').trim();
    if (!item || !code) return null;
    if (item.coveragePrefix && !code.startsWith(item.coveragePrefix)) return null;
    if (
        Array.isArray(item.supportedRegionPrefixes) &&
        item.supportedRegionPrefixes.length &&
        !item.supportedRegionPrefixes.some((prefix) => code.startsWith(prefix))
    ) {
        return null;
    }

    let route = null;
    let indicator = null;
    if (item.floodIndicator) {
        route = ANALYSIS_GRID_ROUTES.flood;
        indicator = item.floodIndicator;
    } else if (item.analysisIndicator) {
        route = ANALYSIS_GRID_ROUTES.analysis;
        indicator = item.analysisIndicator;
    } else if (/^F(?:H|E)/.test(item.indicatorCode || '')) {
        route = ANALYSIS_GRID_ROUTES.flood;
        indicator = item.indicatorCode;
    } else if (/^H(?:0[1-9]|10)$/.test(item.indicatorCode || '')) {
        route = ANALYSIS_GRID_ROUTES.hazard;
        indicator = item.indicatorCode;
    }

    if (!route || !indicator) return null;
    const query = `?regionCode=${encodeURIComponent(code)}&indicator=${encodeURIComponent(indicator)}`;
    return joinApiRoute(analysisApiUrl, `${route}${query}`);
}

export function configurePriorityIndicators({
    sourceIndicators,
    hazard,
    regionCode,
    analysisApiUrl = ''
}) {
    return (sourceIndicators || []).map((item) => {
        if (hazard !== 'flood') return { ...item };
        if (!item.floodIndicator && !item.analysisIndicator && !item.indicatorCode)
            return { ...item };

        const dataPath = indicatorGridPath(item, regionCode, analysisApiUrl);
        const dataStatus = dataPath ? item.dataStatus : 'missing';
        return {
            ...item,
            dataPath,
            dataStatus,
            enabled: Boolean(dataPath && item.enabled && dataStatus !== 'missing')
        };
    });
}

export function gridFetchOptions(url, supabaseAnonKey = '') {
    if (!supabaseAnonKey || !String(url).includes('.supabase.co/functions/v1/')) return {};
    return {
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`
        }
    };
}

export function decodeGridValues(grid) {
    if (Array.isArray(grid?.values)) return grid.values;
    if (grid?.valueEncoding !== 'sparse-index-value' || !Array.isArray(grid?.sparseValues))
        return null;

    const valueCount = Number(grid.valueCount) || Number(grid.columns) * Number(grid.rows);
    if (!Number.isInteger(valueCount) || valueCount < 0) return null;

    const values = new Array(valueCount).fill(null);
    for (let offset = 0; offset < grid.sparseValues.length; offset += 2) {
        const index = Number(grid.sparseValues[offset]);
        const value = Number(grid.sparseValues[offset + 1]);
        if (Number.isInteger(index) && index >= 0 && index < valueCount && Number.isFinite(value)) {
            values[index] = value;
        }
    }
    return values;
}

export async function loadIndicatorGrid(
    item,
    { assetPath = (path) => path, supabaseAnonKey = '', fetchImpl = globalThis.fetch } = {}
) {
    if (!item?.dataPath) throw new Error('Indicator data path is missing.');
    if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is missing.');

    const dataUrl =
        /^https?:\/\//.test(item.dataPath) || item.dataPath.startsWith('/')
            ? item.dataPath
            : assetPath(item.dataPath);
    const response = await fetchImpl(dataUrl, gridFetchOptions(dataUrl, supabaseAnonKey));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const grid = await response.json();
    const gridValues = decodeGridValues(grid);
    const loadedValue = Number(grid?.stats?.normalizedMean ?? grid?.stats?.mean);
    if (!Array.isArray(gridValues)) throw new Error('Grid values are missing.');
    if (!Number.isFinite(loadedValue)) throw new Error('normalizedMean is missing.');

    return {
        loadedValue,
        gridValues,
        gridMeta: {
            gridUnit: grid.gridUnit,
            rows: grid.rows,
            columns: grid.columns,
            extent: grid.extent,
            transform: grid.transform,
            crs: grid.crs
        },
        gridSummary: {
            gridUnit: grid.gridUnit,
            rows: grid.rows,
            columns: grid.columns,
            validCells: grid.stats?.validCells,
            rawUnit: grid.rawUnit || grid.unit || '',
            rawMean: grid.stats?.rawMean,
            normalizedMean: grid.stats?.normalizedMean ?? grid.stats?.mean,
            sourceResolution: grid.sourceResolution
        }
    };
}
