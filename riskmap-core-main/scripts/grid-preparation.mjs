// Shared server preparation; preserves previous UI decoding and aligned subset extraction.
export function isGridValueCollection(values) {
        return Array.isArray(values) || ArrayBuffer.isView(values) || values instanceof Map;
    }

export function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

export function finiteGridValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? clamp01(number) : null;
    }

export function gridValue(item, index) {
        if (!isGridValueCollection(item.gridValues)) return null;
        return finiteGridValue(item.gridValues instanceof Map ? item.gridValues.get(index) : item.gridValues[index]);
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

export function cropStaticGridToRegion(item, reference) {
        if (!item.dataPath?.startsWith('/analysis-data/') || !reference?.gridMeta || !isGridValueCollection(item.gridValues)) return item;
        const source = item.gridMeta;
        const target = reference.gridMeta;
        if (source.crs !== target.crs || ['pixelWidth', 'pixelHeight'].some((key) => Number(source.transform?.[key]) !== Number(target.transform?.[key]))) return item;
        const colOffset = (target.transform.originX - source.transform.originX) / source.transform.pixelWidth;
        const rowOffset = (source.transform.originY - target.transform.originY) / source.transform.pixelHeight;
        if (!Number.isInteger(colOffset) || !Number.isInteger(rowOffset) || colOffset < 0 || rowOffset < 0 ||
            colOffset + target.columns > source.columns || rowOffset + target.rows > source.rows) return item;
        if (colOffset === 0 && rowOffset === 0 && source.columns === target.columns && source.rows === target.rows) return item;
        const count = target.rows * target.columns;
        const values = new Float32Array(count).fill(Number.NaN);
        const indices = reference.gridValidIndices || Array.from({ length: count }, (_, index) => index);
        const validIndices = [];
        let sum = 0;
        for (const index of indices) {
            const sourceIndex = (Math.floor(index / target.columns) + rowOffset) * source.columns + index % target.columns + colOffset;
            const value = gridValue(item, sourceIndex);
            if (value === null) continue;
            values[index] = value;
            validIndices.push(index);
            sum += value;
        }
        return { ...item, gridValues: values, gridValidIndices: validIndices, gridMeta: { ...target },
            loadedValue: validIndices.length ? sum / validIndices.length : null,
            gridSummary: { ...item.gridSummary, columns: target.columns, rows: target.rows, validCells: validIndices.length, rawMean: null, normalizedMean: validIndices.length ? sum / validIndices.length : null },
            loadError: validIndices.length ? null : `${item.label}: 선택한 지역에 유효한 격자가 없습니다.` };
    }
