import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { featureId } from './practice-area-engine.mjs';

const boundaries = JSON.parse(readFileSync(new URL('../../shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json', import.meta.url), 'utf8')).featuresByCode;
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const aborted = () => Object.assign(new Error('실천권역 계산 요청이 취소되었습니다.'), { status: 499 });
const timeout = () => Object.assign(new Error('실천권역 계산 시간이 초과되었습니다. 잠시 후 다시 실행하세요.'), { status: 504 });

export function regionBoundaries(code) {
    if (boundaries[code]) return [boundaries[code]];
    if (code === '28000') return Object.entries(boundaries).filter(([key]) => key.startsWith('28')).map(([, value]) => value);
    const children = Object.entries(boundaries).filter(([key, value]) => `${key.slice(0, 4)}0` === code &&
        /^(.+시)\s+.+구$/.test(value.properties?.sig_kor_nm || value.properties?.full_nm || ''));
    return children.length > 1 ? children.map(([, value]) => value) : [];
}

export function validatePracticeRequest(input) {
    if (input?.schemaVersion !== 1 || !['flood', 'heatwave', 'ecosystem'].includes(input.hazard) ||
        !/^\d{5}$/.test(input.regionCode || '') || !regionBoundaries(input.regionCode).length) invalid('실천권역 부문·지역을 확인하세요.');
    for (const key of ['sourceRiskResultId', 'candidateContextKey']) {
        if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 250) invalid('실천권역의 대안·Risk 연결 정보가 없습니다.');
    }
    const g = input.grid;
    if (!g || !Number.isInteger(g.rows) || !Number.isInteger(g.columns) || g.rows <= 0 || g.columns <= 0 || g.rows * g.columns > 8_000_000) invalid('실천권역 격자 크기를 확인하세요.');
    const t = g.transform;
    if (g.crs !== 'EPSG:5179' || !t || !Number.isFinite(t.originX) || !Number.isFinite(t.originY) ||
        t.pixelWidth !== 100 || t.pixelHeight !== 100 || t.originX % 100 !== 0 || t.originY % 100 !== 0) invalid('EPSG:5179 · 정렬된 100m 격자가 필요합니다.');
    if (!Number.isFinite(g.topThreshold) || g.topThreshold < 0 || g.topThreshold > 1.000001) invalid('Risk 상위 임계값을 확인하세요.');
    if (!Array.isArray(g.entries) || !g.entries.length || g.entries.length > 2_000_000) invalid('실천권역 입력 값 수를 확인하세요.');
    const cells = g.rows * g.columns;
    const seen = new Set();
    const finiteScore = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1.000001;
    for (const row of g.entries) {
        if (!Array.isArray(row) || row.length !== 5 || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= cells || seen.has(row[0]) ||
            !finiteScore(row[1]) || !row.slice(2).every(value => value === null || finiteScore(value))) invalid('Risk 격자의 셀 번호·값을 확인하세요.');
        seen.add(row[0]);
    }
    if (g.validIndices !== null) {
        if (!Array.isArray(g.validIndices) || g.validIndices.length > cells || g.validIndices.some(index => !Number.isInteger(index) || index < 0 || index >= cells) ||
            new Set(g.validIndices).size !== g.validIndices.length) invalid('분석 지역 유효 셀 목록을 확인하세요.');
    }
    return input;
}

async function bounded(promise, deadline, signal) {
    // The operation may already be in flight when a cancellation wins the race.
    // Keep its eventual rejection observed even when returning before Promise.race.
    promise.catch(() => {});
    if (signal?.aborted) throw aborted();
    if (Date.now() >= deadline) throw timeout();
    let timer, stop;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(timeout()), Math.max(1, deadline - Date.now()));
            stop = () => reject(aborted());
            signal?.addEventListener('abort', stop, { once: true });
        })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
}

async function calculate(workerData, deadline, signal) {
    if (signal?.aborted) throw aborted();
    if (Date.now() >= deadline) throw timeout();
    const worker = new Worker(new URL('./practice-area-worker.mjs', import.meta.url), { workerData, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    try {
        const result = await bounded(new Promise((resolve, reject) => {
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.once('exit', () => reject(new Error('실천권역 계산 작업이 중단되었습니다.')));
        }), deadline, signal);
        if (result.error) throw new Error(result.error);
        return result;
    } finally { await worker.terminate(); }
}

export async function collectParcels(boxes, load, { deadline, signal, fallback = false } = {}) {
    const byId = new Map(), queue = [...boxes], failures = [];
    const maxFeatures = fallback ? 5000 : 12000;
    let completed = 0;
    async function boxPages(box) {
        const features = [];
        const size = fallback ? 650 : 1000, pages = fallback ? 1 : 5;
        let truncated = false;
        for (let page = 0; page < pages; page++) {
            try {
                if (signal?.aborted) throw aborted();
                if (Date.now() >= deadline) throw timeout();
                let payload;
                for (let attempt = 0; ; attempt++) {
                    try { payload = await bounded(load(box, { limit: size, offset: page * size, simplifyMeters: 0.2 }), Math.min(deadline, Date.now() + 12000), signal); break; }
                    catch (error) { if (fallback || attempt || signal?.aborted || Date.now() >= deadline) throw error; }
                }
                const data = payload?.features || [];
                features.push(...data);
                const more = Boolean(payload?.metadata?.hasMore) || data.length >= size;
                if (!more || page === pages - 1 || Date.now() > deadline - 3000) { truncated = more; break; }
            } catch (error) {
                if (signal?.aborted || !features.length) throw error;
                return { features, truncated: true };
            }
        }
        return { features, truncated };
    }
    async function run() {
        while (queue.length && byId.size < maxFeatures && !signal?.aborted) {
            if (Date.now() >= deadline) break;
            const box = queue.shift();
            try {
                const data = await boxPages(box);
                data.features.forEach(feature => byId.set(featureId(feature), feature));
                if (data.truncated) failures.push('partial-response');
            } catch (error) { failures.push(error.message); }
            completed++;
        }
    }
    await Promise.all(Array.from({ length: Math.min(fallback ? 4 : 6, boxes.length) }, run));
    if (signal?.aborted) throw aborted();
    if (!byId.size && failures.length) throw new Error(failures[0]);
    if (!byId.size && queue.length) throw timeout();
    return { features: [...byId.values()], failureCount: failures.length + queue.length, completedCount: completed, requestedCount: boxes.length };
}

export async function derivePracticeAreas(input, { loadParcels, loadFallback, signal, timeoutMs = 85000 }) {
    validatePracticeRequest(input);
    const deadline = Date.now() + timeoutMs;
    const prepared = await calculate({ stage: 'prepare', grid: input.grid, boundaryFeatures: regionBoundaries(input.regionCode) }, deadline, signal);
    let source = 'postgis', collected;
    try {
        collected = await collectParcels(prepared.boxes, loadParcels, { deadline: Math.min(deadline - 5000, Date.now() + 60000), signal });
    } catch (error) {
        if (!loadFallback || signal?.aborted || Date.now() >= deadline - 5000) throw error;
        source = 'vworld';
        collected = await collectParcels(prepared.boxes, loadFallback, { deadline: deadline - 5000, signal, fallback: true });
    }
    if (!collected.features.length) throw new Error('parcel-empty');
    const result = await calculate({ stage: 'derive', features: collected.features, hotspots: prepared.hotspots, hazard: input.hazard, source }, deadline, signal);
    const partial = collected.failureCount ? ` · ${collected.failureCount}개 구역은 응답 누락으로 부분 분석` : '';
    const sourceLabel = source === 'vworld' ? 'VWorld 연속지적도' : 'PostGIS 연속지적도';
    return { schemaVersion: 1, sourceRiskResultId: input.sourceRiskResultId, candidateContextKey: input.candidateContextKey,
        regionCode: input.regionCode, hazard: input.hazard, candidates: result.candidates,
        message: result.candidates.length ? `실천권역 내 ${result.candidates.length}개 실천지구 도출 · ${sourceLabel} ${result.intersectedParcels.toLocaleString()}필지 교차 · 3개 유형 시연 분류${partial}`
            : '교차된 필지가 있으나 실천지구 기준을 충족하지 못했습니다.',
        metadata: { source, hotspotCount: prepared.hotspots.length, queriedParcels: collected.features.length,
            intersectedParcels: result.intersectedParcels, requestedBoxes: collected.requestedCount,
            completedBoxes: collected.completedCount, partialBoxes: collected.failureCount, modelVersion: 'practice-area-v1',
            limits: { requestTiles: 20, intersectionHotspots: 600, clusteringParcels: 650, neighborMeters: 230, districts: 10 } } };
}

export function createPracticeAreaHandler(dependencies) {
    let busy = false;
    return async (request, response, send) => {
        if (request.method !== 'POST') return send(response, 405, JSON.stringify({ error: 'POST required' }));
        if (busy) return send(response, 429, JSON.stringify({ error: '다른 실천권역을 계산 중입니다. 잠시 후 다시 실행하세요.' }));
        busy = true;
        const controller = new AbortController();
        const cancel = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', cancel);
        try {
            let size = 0;
            const chunks = [];
            for await (const chunk of request) {
                size += chunk.length;
                if (size > 64 * 1024 * 1024) throw Object.assign(new Error('실천권역 요청이 64MB를 초과했습니다.'), { status: 413 });
                chunks.push(chunk);
            }
            let input;
            try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { invalid('실천권역 요청 JSON이 올바르지 않습니다.'); }
            const result = await derivePracticeAreas(input, { ...dependencies, signal: controller.signal });
            if (!response.destroyed) send(response, 200, JSON.stringify(result));
        } catch (error) {
            const messages = { 'hotspot-empty': 'Hotspot 격자가 없습니다.', 'parcel-empty': '연속지적도에서 필지 도형을 찾지 못했습니다.', 'intersection-empty': 'Hotspot과 겹치는 필지를 찾지 못했습니다.' };
            if (!response.destroyed) send(response, error.status || 502, JSON.stringify({ error: messages[error.message] || error.message }));
        } finally { busy = false; response.off('close', cancel); }
    };
}
