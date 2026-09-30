import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIndicatorInputs } from '../riskmap-core-main/src/lib/priority/indicatorRepository.js';

const item = {id:'custom-1', customDatasetId:'custom-1', datasetVersion:1, regionCode:'41110', label:'사용자 노출', dataPath:'/user-indicators?id=custom-1', weight:2};
const cached = {...item, weight:1, gridValues:new Map([[0,0.2],[2,0.7]]), gridMeta:{rows:1,columns:3}};
const options = {regionCode:'41110',usableIndicator:()=>true,userLibraryEnabled:false};

test('public reanalysis uses matching saved inputs and the current weight without accessing the local library', async()=>{
    const originalFetch=globalThis.fetch;
    globalThis.fetch=()=>{throw new Error('The local library must not be requested');};
    try {
        const [result]=await loadIndicatorInputs([item],[cached],options);
        assert.equal(result.loadError,null);
        assert.equal(result.weight,2);
        assert.deepEqual(result.gridValues,cached.gridValues);
        assert.deepEqual(result.gridMeta,cached.gridMeta);
        assert.equal(result.gridValues.has(1),false);
    } finally {globalThis.fetch=originalFetch;}
});

test('public reanalysis rejects missing, different-version and different-region custom inputs', async()=>{
    for (const source of [[],[{...cached,datasetVersion:2}],[{...cached,regionCode:'11110'}]]) {
        const [result]=await loadIndicatorInputs([item],source,options);
        assert.equal(result.gridValues,null);
        assert.match(result.loadError,/저장된 사용자 지표 입력이 없습니다/);
    }
});
