import { DATA_SOURCES } from '../../shared/data/priority/dataSources.js';

export function resolveIndicatorRequest(params) {
    const dataset = params.get('dataset');
    if (!Object.hasOwn(DATA_SOURCES, dataset)) throw new Error('Unknown dataset ID');
    const source = DATA_SOURCES[dataset];
    const regionCode = params.get('regionCode') || '';
    if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');
    if (source.coveragePrefix && !regionCode.startsWith(source.coveragePrefix)) throw new Error('Dataset is not available in this region');
    if (source.kind === 'static') return { kind: 'static', path: source.path };
    const query = new URLSearchParams({ regionCode, indicator: source.indicator });
    if (source.kind === 'hazard') {
        for (const key of ['mode', 'scenario', 'period']) if (params.has(key)) query.set(key, params.get(key));
    }
    return { kind: 'api', path: source.endpoint, query };
}
