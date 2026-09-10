import { restoreAnalysisPayload } from './analysisSerialization.js';

export function comparisonAlternatives(rows, regionCode, hazard) {
    return rows.flatMap(row => {
        const payload = row.analysis_conditions?.draftPayload;
        if (!payload || String(payload.regionCode) !== String(regionCode) || payload.hazard !== hazard) return [];
        return (payload.alternatives || []).map((alternative, index) => ({
            key: `${row.id}:${index}`, rowId: row.id, version: row.analysis_version,
            date: row.created_at, author: row.created_by_user || '작업자 미기록',
            project: payload.projectName || payload.id, name: alternative.name || `대안 ${index + 1}`,
            regionCode: String(payload.regionCode), hazard: payload.hazard,
            alternative, available: Boolean(alternative.analysisResult?.gridResult)
        }));
    });
}

export function latestComparisonRows(items) {
    const latest = new Map();
    for (const item of items) {
        const key = JSON.stringify([item.author, item.project]);
        const previous = latest.get(key);
        if (!previous || String(item.date) > String(previous.date)) latest.set(key, item);
    }
    const rowIds = new Set([...latest.values()].map(item => item.rowId));
    return items.filter(item => rowIds.has(item.rowId));
}

function gridSignature(grid) {
    const t = grid?.transform;
    const numbers = [grid?.columns, grid?.rows, t?.originX, t?.originY, t?.pixelWidth, t?.pixelHeight];
    if (!numbers.every(v => typeof v === 'number' && Number.isFinite(v)) ||
        !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns <= 0 || grid.rows <= 0 ||
        Math.abs(t.pixelWidth) !== 100 || Math.abs(t.pixelHeight) !== 100 || grid.crs !== 'EPSG:5179') {
        throw new Error('비교에는 좌표계와 위치가 기록된 EPSG:5179 100m 격자가 필요합니다.');
    }
    return JSON.stringify([grid.crs, ...numbers.slice(0, 4), Math.abs(t.pixelWidth), Math.abs(t.pixelHeight)]);
}

function entries(grid) {
    const values = grid.values;
    const indices = grid.validIndices ?? (values instanceof Map ? [...values.keys()] : Object.keys(values || {}).map(Number));
    return [...new Set(indices)].flatMap(index => {
        const value = values instanceof Map ? values.get(index) : values?.[index];
        return Number.isInteger(index) && index >= 0 && index < grid.rows * grid.columns && typeof value === 'number' && Number.isFinite(value)
            ? [[index, value]] : [];
    });
}

export function compareAlternatives(selected, mode = 'saved', percent = 10) {
    if (selected.length < 2) throw new Error('분석 결과가 있는 대안을 2개 이상 선택하세요.');
    if (!['saved', 'percent'].includes(mode) || ![5, 10, 20, 30].includes(Number(percent))) throw new Error('비교 기준을 확인하세요.');
    const area = `${selected[0].regionCode}:${selected[0].hazard}`;
    const restored = selected.map(item => ({ ...item, result: restoreAnalysisPayload(item.alternative.analysisResult) }));
    const grid = restored[0].result?.gridResult;
    const signature = gridSignature(grid);
    const coverage = new Map(), votes = new Map(), parcels = new Map();
    const sources = restored.map(item => {
        if (`${item.regionCode}:${item.hazard}` !== area || gridSignature(item.result?.gridResult) !== signature) {
            throw new Error('지역·재해 또는 격자 위치가 다른 대안이 있습니다. 같은 기준의 대안만 선택하세요.');
        }
        const cells = entries(item.result.gridResult);
        if (!cells.length) throw new Error(`${item.name}: 저장된 Risk 값이 없습니다.`);
        let threshold = item.result.gridResult.stats?.topThreshold;
        if (mode === 'percent') {
            const scores = cells.map(([, value]) => value).sort((a, b) => b - a);
            threshold = scores[Math.max(0, Math.ceil(scores.length * Number(percent) / 100) - 1)];
        }
        if (typeof threshold !== 'number' || !Number.isFinite(threshold)) throw new Error(`${item.name}: 저장된 Hotspot 기준이 없습니다. 상위 비율 기준을 선택하세요.`);
        let selectedCells = 0;
        for (const [index, value] of cells) {
            coverage.set(index, (coverage.get(index) || 0) + 1);
            if (value < threshold) continue;
            selectedCells++;
            if (!votes.has(index)) votes.set(index, []);
            votes.get(index).push(item.key);
        }
        const pnus = new Set((item.result.parcelCandidates || []).flatMap(candidate => candidate.pnuList || []).map(String));
        for (const pnu of pnus) {
            if (!parcels.has(pnu)) parcels.set(pnu, []);
            parcels.get(pnu).push(item.key);
        }
        const indicators = item.alternative.appliedIndicators || item.alternative.settings?.indicators || [];
        return { key: item.key, name: item.name, version: item.version, author: item.author, date: item.date,
            threshold, selectedCells, validCells: cells.length, parcelCount: pnus.size,
            weights: item.alternative.settings?.dimensionWeights || null,
            indicators: indicators.filter(i => i.enabled !== false).map(i => ({ name: i.name || i.label || i.id, weight: i.weight })) };
    });
    // Counts use the selected alternatives as denominator; missing values are reported separately.
    return { grid: { columns: grid.columns, rows: grid.rows, crs: grid.crs, transform: grid.transform },
        sources, total: sources.length, mode, percent: Number(percent),
        cells: [...votes].map(([index, sourceKeys]) => ({ index, sourceKeys, count: sourceKeys.length, coverage: coverage.get(index) })),
        parcels: [...parcels].map(([pnu, sourceKeys]) => ({ pnu, sourceKeys, count: sourceKeys.length })).sort((a, b) => b.count - a.count || a.pnu.localeCompare(b.pnu)),
        commonCoverage: [...coverage.values()].filter(count => count === sources.length).length,
        unionCoverage: coverage.size };
}
