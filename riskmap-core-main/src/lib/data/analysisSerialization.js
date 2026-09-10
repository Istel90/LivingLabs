// JSON does not preserve Map entries or typed-array semantics on its own.
const gridKeys = new Set(['gridValues', 'values', 'hValues', 'eValues',
    'sensitivityValues', 'adaptiveCapacityValues', 'vValues']);

export function analysisJsonReplacer(key, value) {
    if (value instanceof Map) {
        return { __analysisGrid: 'sparse-v1', entries: [...value.entries()] };
    }
    if (gridKeys.has(key) && (Array.isArray(value) || ArrayBuffer.isView(value)) && value.length > 500_000) {
        const entries = [];
        for (let index = 0; index < value.length; index += 1) {
            if (typeof value[index] === 'number' && Number.isFinite(value[index])) entries.push([index, value[index]]);
        }
        // Coastal bounding boxes can contain millions of empty ocean cells.
        // Repeating those cells in every alternative can exceed JSON's string limit.
        if (entries.length < value.length / 4) {
            return { __analysisGrid: 'dense-sparse-v1', length: value.length,
                storage: value instanceof Float32Array ? 'float32' : 'number', entries };
        }
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return Array.from(value);
    return value;
}

export function restoreAnalysisPayload(value, key = '') {
    if (!value || typeof value !== 'object' || value instanceof Map || ArrayBuffer.isView(value)) return value;
    if (value.__analysisGrid === 'sparse-v1' && Array.isArray(value.entries)) {
        return new Map(value.entries.filter(([index, score]) =>
            Number.isInteger(index) && index >= 0 && typeof score === 'number' && Number.isFinite(score)));
    }
    if (value.__analysisGrid === 'dense-sparse-v1' && Number.isInteger(value.length) && value.length >= 0 && Array.isArray(value.entries)) {
        const restored = value.storage === 'float32'
            ? new Float32Array(value.length).fill(Number.NaN)
            : new Array(value.length).fill(Number.NaN);
        for (const [index, score] of value.entries) {
            if (Number.isInteger(index) && index >= 0 && index < value.length && typeof score === 'number' && Number.isFinite(score)) restored[index] = score;
        }
        return restored;
    }
    if (gridKeys.has(key)) {
        if (Array.isArray(value) && value.every((item) => item === null || typeof item === 'number')) {
            // Some source grids are plain double-precision arrays. Do not
            // downcast them when restoring a compact result for recalculation.
            return value.map((item) => item === null ? Number.NaN : item);
        }
        // Older drafts serialized dense typed arrays as numeric-key objects.
        const keys = Object.keys(value);
        if (!Array.isArray(value) && keys.length && keys.every((item) => /^\d+$/.test(item))) {
            const length = keys.reduce((maximum, item) => Math.max(maximum, Number(item) + 1), 0);
            const restored = new Float32Array(length).fill(Number.NaN);
            for (const index of keys) if (value[index] !== null) restored[Number(index)] = value[index];
            return restored;
        }
        // A Map already lost by an older JSON export cannot be reconstructed.
        if (key === 'gridValues' && !keys.length) return null;
    }
    if (Array.isArray(value)) return value.map((item) => restoreAnalysisPayload(item));
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) =>
        [childKey, restoreAnalysisPayload(item, childKey)]));
}
