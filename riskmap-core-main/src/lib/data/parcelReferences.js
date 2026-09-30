import { CADASTRE_BATCH_SIZE } from '../../../../shared/map/cadastre.js';

// Bounded, session-only cache. Unknown historical versions must query the server.
const geometryCache = new Map();
export async function loadReferencedParcels(candidates, fetchJson, origin, onProgress = () => {}) {
    const groups = new Map();
    for (const candidate of candidates) {
        const version = candidate.parcelDatasetVersion || '';
        if (!groups.has(version)) groups.set(version, new Set());
        for (const value of candidate.pnuList || []) {
            const id = String(value);
            if (!/^\d{19}$/.test(id)) throw new Error('저장된 필지번호 형식이 올바르지 않습니다.');
            groups.get(version).add(id);
        }
    }
    const found = new Map();
    let completed = 0;
    const total = [...groups.values()].reduce((sum, ids) => sum + ids.size, 0);
    for (const [version, ids] of groups) {
        const pending = [];
        for (const id of ids) {
            const key = `${version}:${id}`;
            if (version && geometryCache.has(key)) {
                found.set(key, geometryCache.get(key));
                completed++;
            } else pending.push(id);
        }
        for (let start = 0; start < pending.length; start += CADASTRE_BATCH_SIZE) {
            const batch = pending.slice(start, start + CADASTRE_BATCH_SIZE);
            const url = new URL('/cadastre/parcel', origin);
            url.searchParams.set('pnu', batch.join(','));
            if (version) url.searchParams.set('datasetVersion', version);
            const payload = await fetchJson(url);
            const actualVersion = payload.metadata?.datasetVersion;
            if (version && actualVersion !== version) throw new Error('저장된 지적도 버전과 조회 자료가 다릅니다.');
            for (const feature of payload.features || []) {
                const id = String(feature.properties?.pnu || feature.id || '');
                if (!batch.includes(id)) continue;
                found.set(`${version}:${id}`, feature);
                if (actualVersion) geometryCache.set(`${actualVersion}:${id}`, feature);
            }
            while (geometryCache.size > 12000) geometryCache.delete(geometryCache.keys().next().value);
            completed += batch.length;
            onProgress({ completed, total });
        }
    }
    return candidates.map((candidate) => {
        const version = candidate.parcelDatasetVersion || '';
        const features = [...new Set(candidate.pnuList || [])]
            .map((id) => found.get(`${version}:${id}`)).filter(Boolean);
        return { ...candidate, features };
    });
}
