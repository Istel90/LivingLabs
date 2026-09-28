import { DATA_SOURCES } from './dataSources.js';
import { INDICATOR_CATALOG } from './indicatorCatalog.js';
import { SECTOR_PROFILES } from './sectorProfiles.js';

export const INDICATOR_GROUPS = Object.freeze([
    { id: 'hazard', label: '기후위험', dimension: 'H' },
    { id: 'exposure', label: '노출', dimension: 'E' },
    { id: 'sensitivity', label: '민감도', dimension: 'V' },
    { id: 'capacity', label: '적응역량', dimension: 'V' }
]);

export function validateRegistry({ sources = DATA_SOURCES, indicators = INDICATOR_CATALOG, sectors = SECTOR_PROFILES } = {}) {
    const kinds = new Set(['hazard', 'flood', 'analysis', 'population', 'static']);
    for (const [id, source] of Object.entries(sources)) {
        if (!kinds.has(source.kind)) throw new Error(`Unknown data adapter: ${id}`);
        if (source.kind === 'static' ? !source.path?.startsWith('/') : !source.endpoint?.startsWith('/') || !source.indicator) {
            throw new Error(`Invalid data connection: ${id}`);
        }
        if (!source.legacyBinding || !Object.keys(source.legacyBinding).length) throw new Error(`Missing compatibility binding: ${id}`);
    }
    for (const [id, item] of Object.entries(indicators)) {
        if (item.uiType !== 'weighted-indicator') throw new Error(`Unknown UI type: ${id}`);
        if (!INDICATOR_GROUPS.some(group => group.label === item.group && group.dimension === item.dimension)) {
            throw new Error(`Invalid indicator group: ${id}`);
        }
        if (!['positive', 'negative'].includes(item.direction)) throw new Error(`Invalid direction: ${id}`);
        if (item.dataSourceId && !sources[item.dataSourceId]) throw new Error(`Missing data source: ${id}`);
        if (!item.dataSourceId && item.dataStatus !== 'missing') throw new Error(`Unconnected indicator must be missing: ${id}`);
    }
    for (const [sector, profile] of Object.entries(sectors)) {
        const ids = new Set();
        const refs = new Set();
        for (const entry of profile.indicators) {
            if (!indicators[entry.indicatorId]) throw new Error(`Unknown indicator in ${sector}: ${entry.indicatorId}`);
            if (ids.has(entry.id) || refs.has(entry.indicatorId)) throw new Error(`Duplicate indicator in ${sector}: ${entry.id}`);
            if (!Number.isInteger(entry.id) || !Number.isFinite(entry.weight) || entry.weight < 0 || typeof entry.enabled !== 'boolean') {
                throw new Error(`Invalid defaults in ${sector}: ${entry.indicatorId}`);
            }
            if (Object.keys(entry.overrides || {}).some(key => ['dataSourceId', 'uiType', 'id', 'indicatorCode', 'floodIndicator', 'analysisIndicator', 'populationIndicator'].includes(key))) {
                throw new Error(`Connection override is not permitted: ${entry.indicatorId}`);
            }
            ids.add(entry.id);
            refs.add(entry.indicatorId);
        }
    }
    return true;
}

export function createSectorConfigs(asset = path => path) {
    validateRegistry();
    return Object.fromEntries(Object.entries(SECTOR_PROFILES).map(([sector, profile]) => {
        const { indicators, ...metadata } = structuredClone(profile);
        return [sector, {
            ...metadata,
            indicators: indicators.map(entry => {
                const definition = structuredClone(INDICATOR_CATALOG[entry.indicatorId]);
                const { uiType, dataSourceId, ...presentation } = definition;
                const source = DATA_SOURCES[dataSourceId];
                const item = {
                    ...presentation,
                    ...structuredClone(source?.legacyBinding || {}),
                    ...entry.overrides,
                    id: entry.id, enabled: entry.enabled, weight: entry.weight,
                    registryId: entry.indicatorId, dataSourceId
                };
                if (item.iconPath) item.iconPath = asset(item.iconPath);
                return item;
            })
        }];
    }));
}
