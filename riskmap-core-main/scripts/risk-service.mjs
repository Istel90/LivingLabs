import { Worker } from 'node:worker_threads';

const groups = ['기후위험', '노출', '민감도', '적응역량'];
const maxCells = 8_000_000;
const maxEntries = 2_000_000;
let busy = false;
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }

export function validateRiskRequest(input) {
    if (!input || input.schemaVersion !== 1 || input.gridUnit !== '100m' || typeof input.nationalLab !== 'boolean') invalid('지원하지 않는 Risk 요청 형식입니다.');
    if (!Array.isArray(input.indicators) || !input.indicators.length || input.indicators.length > 64) invalid('분석 지표 수가 올바르지 않습니다.');
    const validWeight = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
    if (!input.dimensionWeights || !['H','E','V'].every(key => validWeight(input.dimensionWeights[key])) || ['H','E','V'].reduce((sum,key) => sum + input.dimensionWeights[key], 0) <= 0) invalid('H/E/V 가중치를 확인하세요.');
    let count = 0;
    for (const item of input.indicators) {
        if (!item || !groups.includes(item.group) || !['positive','negative'].includes(item.direction) || !validWeight(item.weight) || typeof item.label !== 'string' || item.label.length > 300) invalid('지표 분류·방향·가중치가 올바르지 않습니다.');
        const meta = item.gridMeta;
        if (!meta || !Number.isInteger(meta.rows) || !Number.isInteger(meta.columns) || meta.rows <= 0 || meta.columns <= 0 || meta.rows * meta.columns > maxCells) invalid('분석 격자 크기를 확인하세요. 최대 800만 셀입니다.');
        if (meta.crs !== 'EPSG:5179' || !meta.transform || !['originX','originY','pixelWidth','pixelHeight'].every(k=> typeof meta.transform[k] === 'number' && Number.isFinite(meta.transform[k]))) invalid('분석 격자 좌표가 올바르지 않습니다.');
        const cells = meta.rows * meta.columns;
        if (!Array.isArray(item.entries)) invalid('격자 값이 없습니다.');
        count += item.entries.length;
        if (count > maxEntries) invalid('한 번에 분석할 수 있는 입력 값 수를 초과했습니다.');
        const seen = new Set();
        for (const entry of item.entries) {
            if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= cells || typeof entry[1] !== 'number' || !Number.isFinite(entry[1]) || seen.has(entry[0])) invalid('격자 값 또는 셀 번호가 올바르지 않습니다.');
            seen.add(entry[0]);
        }
        if (item.gridValidIndices !== null && (!Array.isArray(item.gridValidIndices) || item.gridValidIndices.length > cells || item.gridValidIndices.some(i=>!Number.isInteger(i)||i<0||i>=cells))) invalid('유효 셀 목록이 올바르지 않습니다.');
    }
    const required = input.nationalLab ? ['기후위험'] : groups;
    for (const group of required) if (!input.indicators.some(i => i.group === group && i.weight > 0)) invalid(`${group} 지표와 양수 가중치가 필요합니다.`);
    return input;
}

export async function handleRiskRequest(request, response, send) {
    if (request.method !== 'POST') return send(response, 405, JSON.stringify({ error: 'POST required' }));
    if (busy) return send(response, 429, JSON.stringify({ error: '다른 분석을 계산 중입니다. 잠시 후 다시 실행하세요.' }));
    busy = true;
    let worker;
    try {
        let size = 0;
        const chunks = [];
        for await (const chunk of request) {
            size += chunk.length;
            if (size > 64 * 1024 * 1024) throw Object.assign(new Error('분석 요청이 64MB를 초과했습니다.'), { status: 413 });
            chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { invalid('Risk 요청 JSON이 올바르지 않습니다.'); }
        validateRiskRequest(input);
        const payload = await new Promise((resolve, reject) => {
            worker = new Worker(new URL('./risk-worker.mjs', import.meta.url), { workerData: input, resourceLimits: { maxOldGenerationSizeMb: 512 } });
            const timer = setTimeout(()=>reject(Object.assign(new Error('Risk 계산 시간이 초과되었습니다.'), {status:504})), 90000);
            worker.once('message', data=>{ clearTimeout(timer); resolve(data); });
            worker.once('error', error=>{ clearTimeout(timer); reject(error); });
            worker.once('exit', ()=>{ clearTimeout(timer); reject(new Error('Risk 계산 작업이 중단되었습니다.')); });
        });
        if (payload.error) invalid(payload.error);
        send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', 'no-store');
    } catch (error) {
        send(response, error.status || 500, JSON.stringify({ error: error.message }));
    } finally {
        if (worker) await worker.terminate();
        busy = false;
    }
}
