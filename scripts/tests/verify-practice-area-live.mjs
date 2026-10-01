// Read-only regression against actual grids captured by verify-result-identity.py.
// Usage: node scripts/tests/verify-practice-area-live.mjs <browser evidence directory>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createHotspotPoints, hotspotRequestBoxes, parcelScoreRecords, clusterParcelRecords } from '../../riskmap-core-main/scripts/practice-area-engine.mjs';
import { collectParcels, regionBoundaries } from '../../riskmap-core-main/scripts/practice-area-service.mjs';
import { enrichPracticeDistricts } from '../../riskmap-core-main/src/lib/data/practiceDistricts.js';

if (!process.argv[2]) throw new Error('Specify the browser evidence directory');
const output = resolve(process.argv[2]);
const origin = process.env.PLATFORM_TEST_ORIGIN || 'http://127.0.0.1:4173';
const old = execFileSync('git',['show','6142d46:riskmap-core-main/src/lib/maps/SelectedRegionMap.svelte'],{encoding:'utf8',maxBuffer:2e6}).replace(/\r\n/g,'\n');
const names = [...old.slice(old.indexOf('    function meridionalArc('),old.indexOf('    function extractGeoJsonFeatures(')).matchAll(/^    function (\w+)\(/gm)].map(m=>m[1]);
names.push('featureId','parcelLabel','parcelScoreRecords','boundsForParcelRecords','clusterParcelRecords');
const code = names.map(name=>old.match(new RegExp('^    function '+name+'\\([\\s\\S]*?^    }\\n','m'))[0]).join('\n');
const plain = value=>JSON.parse(JSON.stringify(value));
const results = [];
for (const hazard of ['flood','heatwave']) {
    const input = JSON.parse(readFileSync(join(output,`${hazard}-server-request.json`),'utf8'));
    const grid = {...input.grid,stats:{topThreshold:input.grid.topThreshold}};
    for (const key of ['values','hValues','eValues','vValues']) grid[key]=new Float64Array(grid.rows*grid.columns).fill(NaN);
    for (const [index,risk,h,e,v] of grid.entries) {
        grid.values[index]=risk;grid.hValues[index]=h??NaN;grid.eValues[index]=e??NaN;grid.vValues[index]=v??NaN;
    }
    const legacy=vm.createContext({regionCode:input.regionCode,getBoundaryFeaturesForRegionCode:regionBoundaries});
    vm.runInContext(code,legacy);
    const hotspots=createHotspotPoints(grid,regionBoundaries(input.regionCode));
    assert.deepEqual(plain(hotspots),plain(legacy.createHotspotPoints(grid)));
    const boxes=hotspotRequestBoxes(hotspots);
    assert.deepEqual(plain(boxes),plain(legacy.hotspotRequestBoxes(hotspots)));
    const collected=await collectParcels(boxes,async(box,options)=>{
        const query=new URLSearchParams({bbox:[box.minLng,box.minLat,box.maxLng,box.maxLat].join(','),...options});
        const response=await fetch(`${origin}/cadastre/bbox?${query}`,{signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error(`Parcel lookup ${response.status}`);
        return response.json();
    },{deadline:Date.now()+75000});
    assert.equal(collected.failureCount,0,'Live comparison requires complete retrieval');
    const current=parcelScoreRecords(collected.features,hotspots);
    const previous=legacy.parcelScoreRecords(collected.features,hotspots);
    assert.deepEqual(plain(current),plain(previous));
    const candidates=enrichPracticeDistricts(clusterParcelRecords(current),hazard);
    const expected=enrichPracticeDistricts(plain(legacy.clusterParcelRecords(previous)),hazard);
    assert.deepEqual(plain(candidates),plain(expected));
    const result={hazard,regionCode:input.regionCode,gridEntries:grid.entries.length,hotspots:hotspots.length,
        queriedParcels:collected.features.length,intersectedParcels:current.length,districts:candidates.length,
        includedPnus:candidates.reduce((count,c)=>count+c.pnuList.length,0),exactLegacyMatch:true,baselineCommit:'6142d46'};
    results.push(result);console.log(JSON.stringify(result));
}
writeFileSync(join(output,'live-legacy-parity.json'),JSON.stringify(results,null,2));
