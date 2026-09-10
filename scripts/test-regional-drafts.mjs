import assert from 'node:assert/strict';
import { groupRegionalDrafts } from '../riskmap-core-main/src/lib/data/regionalDraftGroups.js';
import { listPriorityAreaDrafts, listRegionalPriorityAreaDrafts } from '../shared/services/priorityAreaDrafts.js';
const requests = [];
globalThis.fetch = async url => {
    requests.push(new URL(url));
    const offset = Number(new URL(url).searchParams.get('offset'));
    return { ok:true, json:async () => Array.from({length: offset === 0 ? 100 : 1}, (_,i) => ({id:offset+i})) };
};
assert.equal((await listRegionalPriorityAreaDrafts('heatwave')).length,101);
assert.equal(requests.length,2);
assert.equal(requests[0].searchParams.has('region_code'),false);
assert.equal(requests[1].searchParams.get('offset'),'100');
await listPriorityAreaDrafts({regionCode:'41110',hazardType:'flood',draftId:'test',limit:1});
assert.equal(requests[2].searchParams.get('region_code'),'eq.41110');
assert.equal(requests[2].searchParams.get('id'),'eq.test');
await listRegionalPriorityAreaDrafts('heatwave','41110');
assert.equal(requests[3].searchParams.get('region_code'),'eq.41110');
assert.equal(requests[4].searchParams.get('region_code'),'eq.41110');
const rows = [...Array.from({length:9}, (_,i) => ({region_code:'41110', hazard_type:'heatwave',
    analysis_conditions:{draftPayload:{alternatives:i < 5 ? [{analysisResult:{gridResult:{}}}] : []}}})),
    {region_code:'11680', hazard_type:'heatwave', analysis_conditions:{draftPayload:{alternatives:[{analysisResult:{gridResult:{}}}]}}}];
const names={'41110':{sido:'경기도',fullName:'경기도 수원시'},'11680':{sido:'서울특별시',fullName:'서울특별시 강남구'}};
const grouped = groupRegionalDrafts(rows.filter(r=>r.hazard_type==='heatwave'), code=>names[code]);
assert.deepEqual(grouped.map(g=>[g.name,g.regions[0].rows.length,g.regions[0].analyzed]),[['경기도',9,5],['서울특별시',1,1]]);
assert.equal(groupRegionalDrafts([{region_code:'00000'}],()=>null)[0].name,'기타·미확인');
console.log('PASS: pagination, scoped/specific draft query, regional counts, unknown-region fallback.');
