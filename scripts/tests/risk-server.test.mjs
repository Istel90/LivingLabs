import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { calculateRisk } from '../../riskmap-core-main/scripts/risk-engine.mjs';
import { handleRiskRequest, validateRiskRequest } from '../../riskmap-core-main/scripts/risk-service.mjs';
import { requestRiskAnalysis } from '../../riskmap-core-main/src/lib/priority/riskClient.js';
import { createSectorConfigs } from '../../riskmap-core-main/src/lib/priority/registry.js';
import { configureRegisteredIndicators, indicatorRequestUrl } from '../../riskmap-core-main/src/lib/priority/indicatorData.js';

const source = execFileSync('git', ['show','d2a3c5c:riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte'], {encoding:'utf8'});
export function legacyFunction(name) {
    const start = source.indexOf(`    function ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n    }',start)+6);
}
const names=['isGridValueCollection','gridValueCollectionSize','clamp01','isIndicatorAvailable','usableIndicator','weightedGeometricMean','finiteGridValue','gridValue','weightedCellMean','summarizeGridValues','stripIndicatorForResult','computeGridAnalysis','computeAnalysis'];
export function legacyCalculate(inputs, options) {
    const context=vm.createContext({...options, vLambda:0.5, Float32Array, Map, inputs});
    vm.runInContext(names.map(legacyFunction).join('\n'),context);
    return context.computeAnalysis(inputs);
}
const options={gridUnit:'100m',dimensionWeights:{H:1,E:2,V:3},nationalLab:false};
const meta={rows:2,columns:3,crs:'EPSG:5179',transform:{originX:949100,originY:1928200,pixelWidth:100,pixelHeight:100},extent:[0,0,1,1]};
const inputs=['기후위험','노출','민감도','적응역량'].map((group,i)=>({label:group,group,direction:i===3?'negative':'positive',weight:i+1,enabled:true,dataStatus:'available',gridMeta:meta,gridValues:new Float32Array([0,.2+i/10,NaN,.8,1,.4]),gridValidIndices:[0,1,3,4,5]}));
test('saved-draft restoration and fresh runs do not reference removed browser engines',()=>{
    const current=readFileSync('riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte','utf8');
    assert.doesNotMatch(current,/\b(?:computeAnalysis|computeGridAnalysis)\s*\(/);
});
test('compact saved results retain Risk and parcels; stale restoration cannot overwrite another alternative',async()=>{
    const current=readFileSync('riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte','utf8');
    const start=current.indexOf('    async function restoreAlternativeComponents(');
    const fn=current.slice(start,current.indexOf('\n    }',start)+6);
    const saved={indicators:inputs,gridResult:{values:[.5],stats:{mean:.5}},parcelCandidates:[{id:'keep'}],riskScore:.5};
    const rebuilt=calculateRisk(inputs,options);
    const context=vm.createContext({...options,analysisRunId:1,activeAlternative:0,running:false,analysisMessage:'done',analysisResult:saved,alternatives:[{}],usableIndicator:()=>true,requestRiskAnalysis:async()=>rebuilt});
    vm.runInContext(fn,context);
    await context.restoreAlternativeComponents(0,1,saved);
    assert.equal(context.analysisResult.gridResult.values,saved.gridResult.values);
    assert.equal(context.analysisResult.parcelCandidates,saved.parcelCandidates);
    assert.equal(context.analysisResult.gridResult.stats,saved.gridResult.stats);
    assert.equal(context.running,false);
    let release;
    context.requestRiskAnalysis=()=>new Promise(resolve=>{release=resolve;});
    const pending=context.restoreAlternativeComponents(0,1,saved);
    context.analysisRunId=2;context.activeAlternative=1;context.analysisResult={marker:'new'};
    release(rebuilt);await pending;
    assert.equal(context.analysisResult.marker,'new');
});
function numeric(result) { const copy={...result};delete copy.indicators;return JSON.parse(JSON.stringify(copy,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v)); }

test('server engine matches old UI cell arrays, missing cells and statistics',()=>{
    for(const nationalLab of [false,true]) for(const sparse of [false,true]) {
        const data=structuredClone(nationalLab?inputs.slice(0,1):inputs);
        if(sparse) data.forEach(i=>i.gridValues=new Map([...i.gridValues].map((v,k)=>[k,v]).filter(([,v])=>Number.isFinite(v))));
        const opts={...options,nationalLab};
        assert.deepEqual(numeric(calculateRisk(data,opts)),numeric(legacyCalculate(data,opts)));
    }
    const bad=structuredClone(inputs);bad[1].gridMeta=structuredClone(bad[1].gridMeta);bad[1].gridMeta.transform.originX+=50;
    assert.throws(()=>calculateRisk(bad,options),/정렬/);
});

test('browser transport, HTTP service and worker preserve old calculation without local fallback',async()=>{
    const server=createServer((req,res)=>handleRiskRequest(req,res,(r,status,body)=>{r.writeHead(status,{'Content-Type':'application/json'});r.end(body);}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const original=globalThis.fetch;
    globalThis.fetch=(path,init)=>original(`http://127.0.0.1:${server.address().port}${path}`,init);
    try {
        assert.deepEqual(numeric(await requestRiskAnalysis(inputs,options)),numeric(legacyCalculate(inputs,options)));
        const textual=inputs.map(i=>({...i,gridValues:['0','0.4',null,'',1,NaN]}));
        assert.deepEqual(numeric(await requestRiskAnalysis(textual,options)),numeric(legacyCalculate(textual,options)));
        const bad=await fetch('/risk-analysis',{method:'POST',body:'{'});
        assert.equal(bad.status,400);
        await assert.rejects(()=>requestRiskAnalysis(inputs,{...options,dimensionWeights:{H:0,E:0,V:0}}),/가중치/);
    } finally { globalThis.fetch=original; await new Promise(resolve=>server.close(resolve)); }
});

test('untrusted grid dimensions and duplicate indices rejected before worker allocation',()=>{
    const input={schemaVersion:1,...options,indicators:inputs.map(i=>({...i,entries:[[0,0.5]],gridValidIndices:null}))};
    assert.equal(validateRiskRequest(input),input);
    const tooBig=structuredClone(input);tooBig.indicators[0].gridMeta.rows=100000000;
    assert.throws(()=>validateRiskRequest(tooBig),/격자 크기/);
    const duplicate=structuredClone(input);duplicate.indicators[0].entries.push([0,0.2]);
    assert.throws(()=>validateRiskRequest(duplicate),/셀 번호/);
});

test('live Suwon flood, heatwave and WBGT match every legacy result cell', {skip: !process.env.RISK_LIVE_TEST}, async()=>{
    const original=globalThis.fetch;
    globalThis.fetch=(path,init)=>original(new URL(path,'http://127.0.0.1:4173'),init);
    try {
        for(const sector of ['flood','heatwave','wbgt']) {
            const config=createSectorConfigs()[sector==='wbgt'?'heatwave':sector];
            let selected=configureRegisteredIndicators(config.indicators,'41110').filter(i=>i.enabled && ['available','partial'].includes(i.dataStatus));
            if(sector==='wbgt') {
                selected=selected.filter(i=>i.group!=='기후위험');
                const h11=configureRegisteredIndicators(config.indicators,'41110').find(i=>i.indicatorCode==='H11');
                selected.unshift({...h11,enabled:true});
            }
            const context=vm.createContext({Float32Array,Map,gridUnit:'100m'});
            vm.runInContext(['isGridValueCollection','clamp01','finiteGridValue','gridValue','decodeGridValues','cropStaticGridToRegion'].map(legacyFunction).join('\n'),context);
            let enriched=await Promise.all(selected.map(async item=>{
                const response=await fetch(indicatorRequestUrl(item,{regionCode:'41110'}));
                assert.equal(response.status,200,item.label);
                const grid=await response.json();const decoded=context.decodeGridValues(grid);
                return {...item,gridValues:decoded.values,gridValidIndices:decoded.validIndices,gridMeta:{gridUnit:grid.gridUnit,rows:grid.rows,columns:grid.columns,extent:grid.extent,transform:grid.transform,crs:grid.crs}};
            }));
            const reference=enriched.find(i=>i.indicatorCode||i.analysisIndicator||i.floodIndicator);
            enriched=enriched.map(i=>context.cropStaticGridToRegion(i,reference));
            const expected=numeric(legacyCalculate(enriched,options));
            const actual=numeric(await requestRiskAnalysis(enriched,options));
            assert.deepEqual(actual,expected,sector);
            console.log(JSON.stringify({sector,indicators:enriched.length,validCells:actual.gridResult.stats.validCells,riskScore:actual.riskScore,allCellsIdentical:true}));
        }
    } finally { globalThis.fetch=original; }
});
