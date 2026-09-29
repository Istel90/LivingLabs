import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createSectorConfigs, validateRegistry } from '../../riskmap-core-main/src/lib/priority/registry.js';
import { DATA_SOURCES } from '../../riskmap-core-main/src/lib/priority/dataSources.js';
import { INDICATOR_CATALOG } from '../../riskmap-core-main/src/lib/priority/indicatorCatalog.js';
import { SECTOR_PROFILES } from '../../riskmap-core-main/src/lib/priority/sectorProfiles.js';
import { configureRegisteredIndicators, indicatorRequestUrl } from '../../riskmap-core-main/src/lib/priority/indicatorData.js';
import { MAP_DISPLAY_CONTROLS, validateDisplayControls } from '../../riskmap-core-main/src/lib/priority/mapDisplayControls.js';
import { resolveIndicatorRequest } from '../../riskmap-core-main/scripts/indicator-index.mjs';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/priority-configs-before-registry.json', import.meta.url)));
const legacySource = execFileSync('git', ['show', '79338ed:riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte'], { encoding: 'utf8' });
const legacyFunction = legacySource.slice(legacySource.indexOf('    function configureIndicatorsForRegion('), legacySource.indexOf('    function isGridValueCollection('));
const plain = value => JSON.parse(JSON.stringify(value, (key, entry) => ['registryId', 'dataSourceId'].includes(key) ? undefined : entry));

test('all sector labels, defaults, legacy IDs, order and metadata match checkpoint', () => {
    assert.deepEqual(plain(createSectorConfigs()), baseline);
});

test('main screen markup preserves checkpoint layout with requested sector back-link wording', () => {
    const current = readFileSync(new URL('../../riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte', import.meta.url), 'utf8');
    assert.equal(current.split('</script>')[1].replaceAll('\r\n', '\n'), legacySource.split('</script>')[1].replaceAll('\r\n', '\n').replace('지역·재해 선택으로 돌아가기', '부문선택으로 돌아가기'));
});

test('regional, temporal and saved-draft configurations match previous behavior', () => {
    for (const sector of Object.keys(baseline)) for (const region of ['', '41110', '11680', '26110']) {
        for (const mode of ['observed', 'future']) for (const scenario of ['ssp126', 'ssp245']) for (const period of ['2030', '2050']) {
            const ctx = vm.createContext({ URLSearchParams, hazardDatasetMode: mode, hazardScenario: scenario, hazardFuturePeriod: period });
            vm.runInContext(legacyFunction, ctx);
            const expected = ctx.configureIndicatorsForRegion(structuredClone(baseline[sector].indicators), region, mode);
            for (const input of [createSectorConfigs()[sector].indicators, structuredClone(baseline[sector].indicators)]) {
                const actual = configureRegisteredIndicators(input, region, { datasetMode: mode, scenario, period });
                assert.deepEqual(plain(actual), plain(expected), `${sector}/${region}/${mode}/${scenario}/${period}`);
                for (let i = 0; i < expected.length; i++) {
                    const old = expected[i];
                    if (!old.dataPath) continue;
                    const expectedUrl = old.populationIndicator
                        ? `/population/grid?regionCode=${encodeURIComponent(region)}&indicator=${encodeURIComponent(old.populationIndicator)}`
                        : ['/hazard-grid', '/flood-grid', '/analysis-grid'].some(p => old.dataPath.startsWith(p)) ? old.dataPath : `/internal-tools${old.dataPath}`;
                    const nextUrl = indicatorRequestUrl(actual[i], { regionCode: region, asset: p => `/internal-tools${p}` });
                    if (!/^\d{5}$/.test(region) || actual[i].dataStatus === 'missing') continue;
                    if (nextUrl.startsWith('/indicator-grid?')) {
                        const target = resolveIndicatorRequest(new URL(nextUrl, 'http://local.invalid').searchParams);
                        if (target.kind === 'static') assert.equal(`/internal-tools${target.path}`, expectedUrl);
                        else {
                            const oldUrl = new URL(expectedUrl, 'http://local.invalid');
                            assert.equal(target.path, oldUrl.pathname);
                            assert.deepEqual(Object.fromEntries(target.query), Object.fromEntries(oldUrl.searchParams));
                        }
                    } else assert.equal(nextUrl, expectedUrl);
                }
            }
        }
    }
});

test('mutable screen state cannot contaminate other sectors or future instances', () => {
    const first = createSectorConfigs();
    first.flood.indicators[0].enabled = false;
    first.flood.indicators[0].supportedGridUnits.push('bad');
    assert.deepEqual(plain(createSectorConfigs()), baseline);
    assert.equal(createSectorConfigs(p => `/internal-tools${p}`).heatwave.indicators.find(i => i.iconPath)?.iconPath.startsWith('/internal-tools/'), true);
});

test('bad references and duplicate saved IDs are rejected before rendering', () => {
    const sectors = structuredClone(SECTOR_PROFILES);
    sectors.flood.indicators[0].indicatorId = 'unknown';
    assert.throws(() => validateRegistry({ sectors }), /Unknown indicator/);
    const duplicate = structuredClone(SECTOR_PROFILES);
    duplicate.flood.indicators[1].id = duplicate.flood.indicators[0].id;
    assert.throws(() => validateRegistry({ sectors: duplicate }), /Duplicate/);
    const indicators = structuredClone(INDICATOR_CATALOG);
    indicators[Object.keys(indicators)[0]].dataSourceId = 'unknown';
    assert.throws(() => validateRegistry({ indicators }), /Missing data source/);
    const sources = structuredClone(DATA_SOURCES);
    sources[Object.keys(sources)[0]].kind = 'unregistered';
    assert.throws(() => validateRegistry({ sources }), /Unknown data adapter/);
});

test('ecosystem remains unavailable until real connections are registered', () => {
    assert.equal(createSectorConfigs().ecosystem.indicators.every(i => i.dataStatus === 'missing' && !i.enabled && !i.dataSourceId), true);
});

test('display controls require registered behavior and preserve order', () => {
    const actions = Object.fromEntries(MAP_DISPLAY_CONTROLS.map(c => [c.action, { get: () => false, set: () => {} }]));
    assert.equal(validateDisplayControls(MAP_DISPLAY_CONTROLS, actions), true);
    assert.deepEqual(MAP_DISPLAY_CONTROLS.map(c => c.label), ['행정경계', '분석지역 경계', '흑백 지도']);
    delete actions.analysisBoundary;
    assert.throws(() => validateDisplayControls(MAP_DISPLAY_CONTROLS, actions), /Invalid display control/);
});
