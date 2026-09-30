const clamp01 = value => Math.min(1,Math.max(0,value));
export function demoNoise(column, row) {
    const value = Math.sin((column + 3) * 12.9898 + (row + 7) * 78.233) * 43758.5453;
    return value - Math.floor(value);
}

export function createDemoIndicatorValues(pattern, indicatorPreviewGrid) {
    if (!indicatorPreviewGrid?.values?.length) return null;
    const { columns, rows } = indicatorPreviewGrid;
    return Array.from(indicatorPreviewGrid.values,(referenceValue, index) => {
        if (referenceValue == null || !Number.isFinite(Number(referenceValue))) return null;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = columns > 1 ? column / (columns - 1) : 0.5;
        const y = rows > 1 ? row / (rows - 1) : 0.5;
        const noise = demoNoise(column, row);
        let score;
        if (pattern === 'southwest') {
            score = Math.exp(-(((x - 0.3) ** 2) / 0.055 + ((y - 0.72) ** 2) / 0.08));
        } else if (pattern === 'corridor') {
            score = Math.exp(-((y - (0.78 - x * 0.52)) ** 2) / 0.018) * (0.55 + 0.45 * Math.sin(x * Math.PI));
        } else if (pattern === 'distributed') {
            score = 0.22 + (0.48 * noise) + (0.22 * Math.sin(x * Math.PI * 3) * Math.cos(y * Math.PI * 2));
        } else {
            score = Math.exp(-(((x - 0.52) ** 2) / 0.07 + ((y - 0.47) ** 2) / 0.06));
        }
        return clamp01((score * 0.84) + (noise * 0.16));
    });
}

export function normalizeUploadedValues(rawValues, indicatorPreviewGrid) {
    if (!indicatorPreviewGrid?.values?.length) throw new Error('기준 100m 격자가 아직 준비되지 않았습니다.');
    if (!Array.isArray(rawValues) || rawValues.length !== indicatorPreviewGrid.values.length) {
        throw new Error(`JSON 값 개수는 현재 격자 ${indicatorPreviewGrid.values.length.toLocaleString()}개와 같아야 합니다.`);
    }
    const numericValues = rawValues.map((value, index) => value == null || value === '' || typeof value === 'boolean' || indicatorPreviewGrid.values[index] == null || !Number.isFinite(Number(indicatorPreviewGrid.values[index])) ? null : Number(value));
    const finiteValues = numericValues.filter(Number.isFinite);
    if (!finiteValues.length) throw new Error('JSON에서 사용할 수 있는 숫자를 찾지 못했습니다.');
    const minimum = finiteValues.reduce((result, value) => Math.min(result, value), Infinity);
    const maximum = finiteValues.reduce((result, value) => Math.max(result, value), -Infinity);
    const needsNormalization = minimum < 0 || maximum > 1;
    const range = maximum - minimum;
    return numericValues.map((value, index) => {
        if (!Number.isFinite(value) || (indicatorPreviewGrid.values[index] == null || !Number.isFinite(Number(indicatorPreviewGrid.values[index])))) return null;
        return needsNormalization ? clamp01(range ? (value - minimum) / range : 0.5) : clamp01(value);
    });
}

export function normalizeProjection(projection) {
    if (typeof projection === 'number') return `EPSG:${projection}`;
    const text = String(projection || '').trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return `EPSG:${text}`;
    return text.toUpperCase().startsWith('EPSG:') ? text.toUpperCase() : text;
}

export function summarizeCustomValues(values) {
    const finiteValues = values.filter(Number.isFinite);
    if (!finiteValues.length) return 0.5;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}
