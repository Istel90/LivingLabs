import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUserIndicatorStore} from '../riskmap-core-main/scripts/user-indicator-store.mjs';
import {validateUserIndicator} from '../shared/data/priority/userIndicatorContract.js';
import {normalizeUploadedValues,createDemoIndicatorValues} from '../riskmap-core-main/src/lib/priority/gridInput.js';
import {prepareRegisteredRisk} from '../riskmap-core-main/scripts/registered-risk.mjs';
const gridMeta={crs:'EPSG:5179',gridUnit:'100m',rows:2,columns:2,transform:{originX:945900,originY:1968600,pixelWidth:100,pixelHeight:100}};
const input={label:'검증 지표',group:'노출',regionCode:'41110',gridMeta,entries:[[0,0],[2,0.7]]};
test('registration persists once outside alternatives, listing omits grid data and filters regions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'livinglabs-indicators-'));
 const store=createUserIndicatorStore(root);const record=await store.save(input);
 const restarted=createUserIndicatorStore(root);
 assert.deepEqual((await restarted.read(record.id)).entries,input.entries);
 const list=await restarted.list('41110');assert.equal(list.length,1);assert.equal(list[0].entries,undefined);
 assert.deepEqual(await restarted.list('11680'),[]);
 await assert.rejects(restarted.read('../data'),/ID/);
 await assert.rejects(restarted.read('user-00000000-0000-0000-0000-000000000000'),/찾지/);
});
test('strict grid and missing-value validation',()=>{
 for(const patch of [{entries:[[0,0.1],[0,0.2]]},{entries:[[4,0.1]]},{entries:[[0,null]]},{entries:[]},{gridMeta:{...gridMeta,crs:'EPSG:4326'}},{gridMeta:{...gridMeta,transform:{...gridMeta.transform,originX:945950}}}]) assert.throws(()=>validateUserIndicator({...input,...patch}));
 const preview={...gridMeta,values:new Float32Array([1,NaN,0.5,NaN])};
 assert.deepEqual(normalizeUploadedValues([2,9,4,null],preview),[0,null,1,null]);
 const values=createDemoIndicatorValues('urban-core',preview);assert.equal(values[1],null);assert.equal(values[3],null);
 assert.throws(()=>normalizeUploadedValues([null,null,null,null],preview));
});

test('registered custom analysis checks region and immutable version, and propagates missing storage',async()=>{
 const id='user-00000000-0000-0000-0000-000000000001';
 const request={schemaVersion:2,sector:'flood',regionCode:'41110',gridUnit:'100m',nationalLab:false,mode:'observed',dimensionWeights:{H:1,E:1,V:1},indicators:[{customDatasetId:id,datasetVersion:1,weight:1}]};
 const record={...input,id,version:1};
 const result=await prepareRegisteredRisk(request,()=>{throw Error('unexpected registered data request');},async()=>record);
 assert.deepEqual(result.input.indicators[0].entries,input.entries);
 await assert.rejects(prepareRegisteredRisk({...request,regionCode:'11680'},null,async()=>record),/지역/);
 await assert.rejects(prepareRegisteredRisk({...request,indicators:[{...request.indicators[0],datasetVersion:2}]},null,async()=>record),/버전/);
 await assert.rejects(prepareRegisteredRisk(request,null,async()=>{throw Error('보관된 지표를 찾지 못했습니다.');}),/찾지/);
});
