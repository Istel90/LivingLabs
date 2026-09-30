import { indicatorRequestUrl } from './indicatorData.js';
import { loadUserIndicator, userIndicatorLibraryEnabled } from './userIndicatorRepository.js';

export function isGridValueCollection(values) {
    return Array.isArray(values) || ArrayBuffer.isView(values) || values instanceof Map;
}

export function gridValueCollectionSize(values) {
    if (values instanceof Map) return values.size;
    return Number(values?.length) || 0;
}

export function decodeGridValues(grid, { preferDense = false } = {}) {
    if (Array.isArray(grid?.values)) {
        return { values: grid.values, validIndices: null };
    }
    if (grid?.valueEncoding !== 'sparse-index-value' || !Array.isArray(grid?.sparseValues)) {
        return { values: null, validIndices: null };
    }

    const valueCount = Number(grid.valueCount) || (Number(grid.columns) * Number(grid.rows));
    const useSparseMap = !preferDense && valueCount > 500_000;
    const values = useSparseMap ? new Map() : new Float32Array(valueCount);
    if (!useSparseMap) values.fill(Number.NaN);
    const validIndices = new Array(Math.floor(grid.sparseValues.length / 2));
    let validIndex = 0;
    for (let offset = 0; offset < grid.sparseValues.length; offset += 2) {
        const index = Number(grid.sparseValues[offset]);
        const value = Number(grid.sparseValues[offset + 1]);
        if (!Number.isInteger(index) || index < 0 || index >= valueCount || !Number.isFinite(value)) continue;
        if (useSparseMap) values.set(index, value);
        else values[index] = value;
        validIndices[validIndex] = index;
        validIndex += 1;
    }
    validIndices.length = validIndex;
    return { values, validIndices };
}

export function indicatorDataKey(item) {
    return [
        item.id,
        item.dataPath || '',
        item.populationIndicator || '',
        item.indicatorCode || '',
        item.floodIndicator || '',
        item.analysisIndicator || ''
    ].join('|');
}

export async function loadIndicatorInputs(sourceIndicators, cachedIndicators = [], { preferDense = false, regionCode, asset = value => value, usableIndicator, userLibraryEnabled = userIndicatorLibraryEnabled } = {}) {
    const cachedByKey = new Map(
        cachedIndicators
            .filter((item) => isGridValueCollection(item.gridValues))
            .map((item) => [indicatorDataKey(item), item])
    );
    let loaded = await Promise.all(sourceIndicators.map(async (item) => {
        if (usableIndicator(item) && item.customDatasetId) {
            if (!userLibraryEnabled) {
                const cached = cachedByKey.get(indicatorDataKey(item));
                if (cached && cached.customDatasetId === item.customDatasetId && cached.datasetVersion === item.datasetVersion && cached.regionCode === regionCode && item.regionCode === regionCode) {
                    return {...cached, ...item, gridValues:cached.gridValues, gridMeta:cached.gridMeta, gridValidIndices:cached.gridValidIndices, loadError:null};
                }
                return {...item, gridValues:null, loadError:`${item.label}: 저장된 사용자 지표 입력이 없습니다. 개발 사이트에서 원본을 연결해 저장해 주세요.`};
            }
            try { return await loadUserIndicator(item, regionCode); }
            catch (error) { return {...item, gridValues:null, loadError:`${item.label}: ${error.message}`}; }
        }
        if (!usableIndicator(item) || !item.dataPath) return item;

        const cached = cachedByKey.get(indicatorDataKey(item));
        if (cached) {
            return {
                ...cached,
                ...item,
                gridValues: cached.gridValues,
                gridValidIndices: cached.gridValidIndices,
                gridMeta: cached.gridMeta,
                gridSummary: cached.gridSummary,
                loadedValue: cached.loadedValue,
                loadError: null
            };
        }

        try {
            const dataUrl = indicatorRequestUrl(item, { regionCode, asset });
            const response = await fetch(dataUrl, { signal: AbortSignal.timeout(120000) });
            if (!response.ok) throw new Error(`자료 요청 실패 (HTTP ${response.status})`);
            const grid = await response.json();
            const decodedGrid = decodeGridValues(grid, { preferDense });
            const mean = grid?.stats?.normalizedMean ?? grid?.stats?.mean;
            const loadedValue = mean == null ? Number.NaN : Number(mean);
            if (!Number.isFinite(loadedValue) || !(Number(grid?.stats?.validCells) > 0)) {
                throw new Error('이 지역에 유효한 원자료가 없습니다');
            }

            return {
                ...item,
                loadedValue,
                loadError: null,
                geojson: grid.pointFeatureCollection || item.geojson,
                gridValues: decodedGrid.values,
                gridValidIndices: decodedGrid.validIndices,
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
                    rawMean: grid.stats?.rawMean,
                    rawUnit: grid.rawUnit || grid.unit || '',
                    normalizationSourceRange: grid.normalizationSourceRange,
                    normalizationMethod: grid.normalizationMethod,
                    normalizedMean: grid.stats?.normalizedMean ?? grid.stats?.mean,
                    sourceResolution: grid.sourceResolution,
                    rawMin: grid.stats?.rawMin,
                    rawMax: grid.stats?.rawMax,
                    qualityStatus: grid.qualityStatus,
                    method: grid.method,
                    assumptions: grid.assumptions,
                    pointFeatureCount: grid.pointFeatureCount || 0
                }
            };
        } catch (error) {
            return {
                ...item,
                gridValues: null,
                gridValidIndices: null,
                loadedValue: null,
                loadError: `${item.label}: ${error.name === 'TimeoutError' ? '자료 요청 시간이 초과되었습니다' : error.message}`
            };
        }
    }));

    return loaded;
}
