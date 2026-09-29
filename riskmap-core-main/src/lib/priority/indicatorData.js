import { DATA_SOURCES } from './dataSources.js';

export function indicatorRequestUrl(item, { regionCode, asset = path => path }) {
    const source = findDataSource(item);
    const registeredId = Object.entries(DATA_SOURCES).find(([, candidate]) => candidate === source)?.[0];
    if (registeredId) {
        const query = new URLSearchParams({ dataset: registeredId, regionCode });
        if (source.kind === 'static') query.set('regional', '1');
        if (source.kind === 'hazard' && item.dataPath) {
            const existing = new URL(item.dataPath, 'http://local.invalid').searchParams;
            for (const key of ['mode', 'scenario', 'period']) if (existing.has(key)) query.set(key, existing.get(key));
        }
        return `/indicator-grid?${query.toString()}`;
    }
    if (source?.kind === 'population') {
        return `${source.endpoint}?regionCode=${encodeURIComponent(regionCode)}&indicator=${encodeURIComponent(source.indicator)}`;
    }
    if (source && source.kind !== 'static') return item.dataPath;
    // Retain saved/custom API paths during the compatibility migration.
    if (['/hazard-grid', '/flood-grid', '/analysis-grid'].some(prefix => item.dataPath?.startsWith(prefix))) return item.dataPath;
    return item.dataPath ? asset(item.dataPath) : null;
}

export function findDataSource(item) {
    if (item.dataSourceId && DATA_SOURCES[item.dataSourceId]) return DATA_SOURCES[item.dataSourceId];
    // Older saved drafts and custom uploads still use the legacy fields.
    return Object.values(DATA_SOURCES).find(source => Object.entries(source.legacyBinding).every(([key, value]) => item[key] === value));
}

export function configureRegisteredIndicators(sourceIndicators, code, { datasetMode = 'observed', scenario: hazardScenario = 'ssp245', period: hazardFuturePeriod = '2050' } = {}) {
        const observedCodes = new Set(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11']);
        return sourceIndicators.map((item) => {
            const source = findDataSource(item);
            if (source?.kind === 'hazard') {
                const observed = datasetMode === 'observed';
                const availableForDataset = observed
                    ? observedCodes.has(item.indicatorCode)
                    : !['H10', 'H11'].includes(item.indicatorCode);
                const available = Boolean(code) && availableForDataset;
                const dataQuery = new URLSearchParams({
                    regionCode: code,
                    mode: observed ? 'observed' : 'future',
                    indicator: item.indicatorCode,
                    scenario: hazardScenario,
                    period: hazardFuturePeriod
                });
                return {
                    ...item,
                    description: observed
                        ? item.indicatorCode === 'H11'
                            ? '전국 시험 자료 · ASOS 폭염 대표조건·KMAP 100m 일사량·NGII DEM·건물 높이와 그림자를 결합한 09·12·15시 최대 추정 WBGT. 수목·건물 주변 국지풍·상세 장파복사는 미반영. 실제 관측값이나 5년 평균 WBGT는 아님.'
                            : item.indicatorCode === 'H01'
                            ? '2021~2025 평균 · 500m 원자료를 정렬한 지역 100m 분석격자'
                            : item.indicatorCode === 'H10'
                                ? '2021~2025 여름철 P90 평균 · Landsat 30m를 집계한 지역 100m 격자'
                                : observedCodes.has(item.indicatorCode)
                                    ? '2021~2025 ASOS 95개소 지표를 IDW 공간화한 지역 100m 분석격자'
                                    : '1991~2020 기준자료 수집 후 100m 공간모델 구축 예정'
                        : ['H10', 'H11'].includes(item.indicatorCode)
                            ? 'SSP 기반 직접 미래 전망자료 없음'
                            : `${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 지역 100m 분석격자`,
                    sourceType: observed
                        ? item.indicatorCode === 'H11'
                            ? 'KMA-KMAP-ASOS-building-DEM-100m'
                            : item.indicatorCode === 'H10'
                            ? 'Landsat-LST-100m'
                            : item.indicatorCode === 'H01'
                                ? 'KMA-observed-100m'
                                : 'KMA-ASOS-IDW-100m'
                        : 'KMA-AR6-region-100m',
                    dataPath: available ? `${source.endpoint}?${dataQuery.toString()}` : null,
                    dataStatus: available ? 'available' : 'missing',
                    enabled: available && item.indicatorCode === (observed ? 'H01' : 'H04')
                };
            }
            const covered = Boolean(code) && (!item.coveragePrefix || code.startsWith(item.coveragePrefix));
            if (source?.kind === 'flood') {
                const dataQuery = new URLSearchParams({ regionCode: code, indicator: item.floodIndicator });
                return {
                    ...item,
                    dataPath: covered ? `${source.endpoint}?${dataQuery.toString()}` : null,
                    dataStatus: covered ? (item.dataStatus || 'available') : 'missing',
                    enabled: covered && item.enabled
                };
            }
            if (source?.kind === 'analysis') {
                const dataQuery = new URLSearchParams({ regionCode: code, indicator: item.analysisIndicator });
                return {
                    ...item,
                    dataPath: covered ? `${source.endpoint}?${dataQuery.toString()}` : null,
                    dataStatus: covered ? (item.dataStatus || 'available') : 'missing',
                    enabled: covered && item.enabled
                };
            }
            if (source?.kind === 'population') {
                return { ...item, dataStatus: 'available' };
            }
            if (item.dataStatus === 'missing') return item;
            if (!code.startsWith('4111')) {
                return { ...item, enabled: false, dataStatus: 'missing' };
            }
            return { ...item };
        });
    }

