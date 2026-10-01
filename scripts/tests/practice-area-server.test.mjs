import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHotspotPoints, hotspotRequestBoxes, parcelScoreRecords, clusterParcelRecords } from '../../riskmap-core-main/scripts/practice-area-engine.mjs';
import { createPracticeAreaHandler, derivePracticeAreas, validatePracticeRequest, collectParcels, regionBoundaries } from '../../riskmap-core-main/scripts/practice-area-service.mjs';
import { practiceAreaRequest, requestPracticeAreas } from '../../riskmap-core-main/src/lib/priority/practiceAreaClient.js';
import { enrichPracticeDistricts } from '../../riskmap-core-main/src/lib/data/practiceDistricts.js';

// Use the immutable pre-migration implementation as an independent regression oracle.
const old = execFileSync('git', ['show', '6142d46:riskmap-core-main/src/lib/maps/SelectedRegionMap.svelte'], { encoding: 'utf8', maxBuffer: 2e6 }).replace(/\r\n/g, '\n');
const names = [...old.slice(old.indexOf('    function meridionalArc('), old.indexOf('    function extractGeoJsonFeatures(')).matchAll(/^    function (\w+)\(/gm)].map(m => m[1]);
names.push('featureId', 'parcelLabel', 'parcelScoreRecords', 'boundsForParcelRecords', 'clusterParcelRecords');
const legacyCode = names.map(name => old.match(new RegExp('^    function ' + name + '\\([\\s\\S]*?^    }\\n', 'm'))[0]).join('\n');
const legacy = vm.createContext({ regionCode: '41110', getBoundaryFeaturesForRegionCode: () => [] });
vm.runInContext(legacyCode, legacy);
const plain = value => JSON.parse(JSON.stringify(value));
const grid = { rows: 2, columns: 4, crs: 'EPSG:5179', transform: { originX: 956000, originY: 1919000, pixelWidth: 100, pixelHeight: 100 },
    stats: { topThreshold: .7 }, validIndices: [0,1,2,3,4,5,6,7],
    values: new Float32Array([.95,.85,.75,NaN,.9,.8,0,.2]),
    hValues: new Float32Array([.95,.85,.75,NaN,.9,.8,0,.2]),
    eValues: new Float32Array([.95,.85,.75,NaN,.9,.8,0,.2]),
    vValues: new Float32Array([.95,.85,.75,NaN,.9,.8,0,.2]) };
const options = { regionCode: '41110', hazard: 'flood', sourceRiskResultId: 'risk-test', candidateContextKey: 'alternative-test' };
const hotspots = createHotspotPoints(grid);
const features = hotspots.map((h, i) => ({ type:'Feature', properties:{pnu:`411101010010000${String(i).padStart(5,'0')}`,cadastreDatasetVersion:'test-v1'},
    geometry:{type:'Polygon',coordinates:[[...h.corners,h.corners[0]]]}}));
const loadParcels = async () => ({ features, metadata:{hasMore:false} });

test('geometry, hotspots, query boxes, parcel intersections and district ranks match old UI', () => {
    assert.deepEqual(plain(hotspots), plain(legacy.createHotspotPoints(grid)));
    assert.deepEqual(plain(hotspotRequestBoxes(hotspots)), plain(legacy.hotspotRequestBoxes(hotspots)));
    const current = parcelScoreRecords(features,hotspots), prior = legacy.parcelScoreRecords(features,hotspots);
    assert.deepEqual(plain(current),plain(prior));
    assert.deepEqual(plain(clusterParcelRecords(current)),plain(legacy.clusterParcelRecords(prior)));
});

test('server worker preserves results, classification, PNU and parent Risk context', async () => {
    const result = await derivePracticeAreas(practiceAreaRequest(grid, options), { loadParcels });
    const expected = enrichPracticeDistricts(plain(legacy.clusterParcelRecords(legacy.parcelScoreRecords(features, hotspots))), 'flood');
    assert.equal(result.sourceRiskResultId,options.sourceRiskResultId);
    assert.equal(result.candidateContextKey,options.candidateContextKey);
    assert.deepEqual(result.candidates.map(({features,featureLimit,featureTotal,...c})=>c), expected.map(({features,...c})=>c));
    assert.equal(result.metadata.intersectedParcels,features.length);
});

test('reject malformed geometry metadata, duplicate cells, invalid values and unknown region before lookup', () => {
    const input=practiceAreaRequest(grid,options);
    assert.equal(validatePracticeRequest(input),input);
    for (const change of [x=>x.grid.rows=1e9, x=>x.grid.transform.originX+=50, x=>x.grid.entries.push(x.grid.entries[0]),
        x=>x.grid.entries[0][1]=null, x=>x.grid.validIndices.push(0), x=>x.regionCode='99999',x=>x.sourceRiskResultId='']) {
        const bad=structuredClone(input);change(bad);assert.throws(()=>validatePracticeRequest(bad));
    }
});

test('all supported frontend region boundaries match the server, including parent cities', () => {
    let source=readFileSync('riskmap-core-main/src/lib/data/administrativeRegions.js','utf8');
    const document=readFileSync('shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json','utf8');
    source=source.replace(/^import .*;\r?\n/m,'').replace(/export /g,'');
    const context=vm.createContext({DOWNLOADS_SIGUNGU_BOUNDARIES:document});
    vm.runInContext(source+'\nglobalThis.codes=regionOptions.map(r=>r.code);',context);
    for(const code of context.codes) assert.deepEqual(plain(regionBoundaries(code)),plain(context.getBoundaryFeaturesForRegionCode(code)),code);
});

test('partial parcel pages and skipped boxes are explicitly reported, missing source is never success', async () => {
    const boxes=hotspotRequestBoxes(hotspots);
    let calls=0;
    const partial=await collectParcels(boxes,async()=>{if(calls++)throw new Error('offline');return {features,metadata:{hasMore:true}};},{deadline:Date.now()+10000});
    assert.ok(partial.features.length);assert.ok(partial.failureCount);
    await assert.rejects(()=>derivePracticeAreas(practiceAreaRequest(grid,options),{loadParcels:async()=>{throw new Error('offline');}}),/offline/);
    const fallback=await derivePracticeAreas(practiceAreaRequest(grid,options),{loadParcels:async()=>{throw new Error('offline');},loadFallback:loadParcels});
    assert.equal(fallback.metadata.source,'vworld');
    assert.ok(fallback.candidates.every(c=>c.basis.startsWith('VWorld')));
});

test('HTTP transport uses the service, rejects mismatched response context and never computes locally', async () => {
    const handler=createPracticeAreaHandler({loadParcels});
    const server=createServer((req,res)=>handler(req,res,(r,status,body)=>{r.writeHead(status,{'Content-Type':'application/json'});r.end(body);}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const original=globalThis.fetch;
    globalThis.fetch=(path,init)=>original(`http://127.0.0.1:${server.address().port}${path}`,init);
    try {
        const result=await requestPracticeAreas(grid,options);assert.ok(result.candidates.length);
        assert.equal((await fetch('/practice-areas')).status,405);
        assert.equal((await fetch('/practice-areas',{method:'POST',body:'{'})).status,400);
        globalThis.fetch=async()=>new Response(JSON.stringify({...result,sourceRiskResultId:'stale'}),{status:200});
        await assert.rejects(()=>requestPracticeAreas(grid,options),/연결 정보/);
    } finally {globalThis.fetch=original;await new Promise(resolve=>server.close(resolve));}
});

test('cancelled calculations do not continue to query parcels', async () => {
    const controller=new AbortController();controller.abort();let calls=0;
    await assert.rejects(()=>derivePracticeAreas(practiceAreaRequest(grid,options),{signal:controller.signal,loadParcels:async()=>{calls++;return {features};}}),/취소/);
    assert.equal(calls,0);
});

test('concurrent HTTP derivation returns 429 and retries after the running request completes', async () => {
    let entered, release;
    const started = new Promise(resolve => entered = resolve);
    const gate = new Promise(resolve => release = resolve);
    const handler = createPracticeAreaHandler({ loadParcels: async () => { entered(); await gate; return { features }; } });
    const server = createServer((req,res) => handler(req,res,(r,status,body) => { r.writeHead(status,{'Content-Type':'application/json'}); r.end(body); }));
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const url = `http://127.0.0.1:${server.address().port}/practice-areas`;
    const init = { method: 'POST', body: JSON.stringify(practiceAreaRequest(grid,options)) };
    try {
        const first = fetch(url, init);
        await started;
        assert.equal((await fetch(url, init)).status,429);
        release();
        assert.equal((await first).status,200);
        assert.equal((await fetch(url,{method:'POST',body:'{'})).status,400);
        assert.equal((await fetch(url,init)).status,200);
    } finally { release(); await new Promise(resolve => server.close(resolve)); }
});
