// Transport only: hotspot selection, parcel lookup and district arithmetic run on the server.
export function practiceAreaRequest(grid, { regionCode, hazard, sourceRiskResultId, candidateContextKey }) {
    const at = (values, index) => values instanceof Map ? values.get(index) : values?.[index];
    const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const entries = [];
    const add = (value, index) => {
        if (number(value) === null) return;
        entries.push([index, value, number(at(grid.hValues, index)), number(at(grid.eValues, index)), number(at(grid.vValues, index))]);
    };
    grid.values.forEach(add);
    return {
        schemaVersion: 1, regionCode, hazard, sourceRiskResultId, candidateContextKey,
        grid: { rows: grid.rows, columns: grid.columns, crs: grid.crs, transform: grid.transform,
            topThreshold: grid.stats?.topThreshold, validIndices: Array.isArray(grid.validIndices) ? grid.validIndices : null, entries }
    };
}

export async function requestPracticeAreas(grid, options, signal) {
    const response = await fetch('/practice-areas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(practiceAreaRequest(grid, options)),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `실천권역 계산 요청 실패 (${response.status})`);
    if (payload.schemaVersion !== 1 || payload.sourceRiskResultId !== options.sourceRiskResultId ||
        payload.candidateContextKey !== options.candidateContextKey || payload.regionCode !== options.regionCode ||
        payload.hazard !== options.hazard || !Array.isArray(payload.candidates) || typeof payload.message !== 'string') {
        throw new Error('실천권역 계산 응답의 분석 연결 정보가 일치하지 않습니다.');
    }
    return payload;
}
