// Only transport and result restoration live in the browser; Risk arithmetic runs on the server.
export async function requestRiskAnalysis(indicators, options) {
    const inputs = indicators.map(item => {
        const entries = [];
        const add = (value, index) => {
            if (value === null || value === undefined || value === '') return;
            const number = Number(value);
            if (Number.isFinite(number)) entries.push([index, number]);
        };
        if (item.gridValues instanceof Map) item.gridValues.forEach(add);
        else (item.gridValues || []).forEach(add);
        return {
            label: item.label, group: item.group, direction: item.direction,
            weight: Number(item.weight), gridMeta: item.gridMeta,
            gridValidIndices: item.gridValidIndices || null,
            entries
        };
    });
    const response = await fetch('/risk-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, ...options, indicators: inputs }),
        signal: AbortSignal.timeout(120000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Risk 계산 요청 실패 (HTTP ${response.status})`);
    const result = payload.result;
    if (payload.schemaVersion !== 1 || !result?.gridResult) throw new Error('Risk 계산 응답 형식이 올바르지 않습니다.');
    const cells = result.gridResult.rows * result.gridResult.columns;
    for (const key of ['values', 'hValues', 'eValues', 'sensitivityValues', 'adaptiveCapacityValues', 'vValues']) {
        const values = new Float32Array(cells).fill(Number.NaN);
        for (const [index, value] of result.gridResult[key]) values[index] = value;
        result.gridResult[key] = values;
    }
    return { ...result, indicators };
}
