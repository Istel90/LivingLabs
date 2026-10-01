import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {identifyDistrictResult} from '../../riskmap-core-main/src/lib/data/resultIdentity.js';
import {compareAlternatives} from '../../riskmap-core-main/src/lib/data/alternativeOverlap.js';

const source=readFileSync(new URL('../../riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte',import.meta.url),'utf8');
const start=source.indexOf('    function handleParcelCandidates(');
assert.ok(start>=0,'Current UI callback must exist');
const callback=source.slice(start,source.indexOf('\n    }',start)+6);
const grid={rows:1,columns:2,crs:'EPSG:5179',transform:{originX:949100,originY:1928200,pixelWidth:100,pixelHeight:100},validIndices:[0,1],values:[.2,.8],stats:{topThreshold:.8}};
const result=id=>({alternativeId:'alternative-'+id,riskResultId:'risk-'+id,districtResultId:'districts-'+id,gridResult:structuredClone(grid),parcelCandidates:[{id:'old-'+id,districtId:'district-'+id,pnuList:['4111010100100010000']}]});
function state(){
 const a=result('a'),b=result('b');
 const context=vm.createContext({hazard:'flood',activeAlternativeId:'a',activeAlternative:0,analysisResult:a,alternatives:[{id:'a',alternativeId:a.alternativeId,analysisResult:a},{id:'b',alternativeId:b.alternativeId,analysisResult:b}],enrichPracticeDistricts:x=>x,identifyDistrictResult,candidateIdentity:x=>x.id,saves:0});
 context.schedulePriorityDraftSave=()=>context.saves++;
 vm.runInContext(callback,context);return context;
}
test('late districts from an old Risk run cannot replace current results',()=>{
 const c=state(),before=JSON.stringify(c.alternatives),active=c.analysisResult;
 c.handleParcelCandidates([{id:'late'}],'late','a',{kind:'derive',riskResultId:'risk-stale'});
 assert.equal(JSON.stringify(c.alternatives),before);assert.equal(c.analysisResult,active);assert.equal(c.saves,0);
});
test('a completed request for an inactive alternative cannot change the active alternative',()=>{
 const c=state();c.activeAlternative=1;c.activeAlternativeId='b';c.analysisResult=c.alternatives[1].analysisResult;
 const active=c.analysisResult;
 c.handleParcelCandidates([{id:'new-a'}],'done','a',{kind:'derive',riskResultId:'risk-a'});
 assert.equal(c.analysisResult,active);assert.equal(c.alternatives[1].analysisResult,active);
 assert.equal(c.alternatives[0].analysisResult.riskResultId,'risk-a');assert.notEqual(c.alternatives[0].analysisResult.districtResultId,'districts-a');assert.equal(c.saves,1);
});
test('failed district refresh retains valid candidates and result identities',()=>{
 const c=state(),before=JSON.stringify(c.alternatives);
 c.handleParcelCandidates([],'network error','a',{kind:'error',riskResultId:'risk-a'});
 assert.equal(JSON.stringify(c.alternatives),before);assert.equal(c.saves,0);
});
test('comparison sources preserve independent alternative, Risk and district identities',()=>{
 const selected=['a','b'].map(id=>({key:id,name:id,regionCode:'41110',hazard:'flood',alternative:{alternativeId:'alternative-'+id,analysisResult:result(id)}}));
 const comparison=compareAlternatives(selected);
 assert.equal(comparison.commonCoverage,2);assert.equal(comparison.cells[0].count,2);
 assert.deepEqual(comparison.sources.map(x=>[x.alternativeId,x.riskResultId,x.districtResultId]),[['alternative-a','risk-a','districts-a'],['alternative-b','risk-b','districts-b']]);
});
