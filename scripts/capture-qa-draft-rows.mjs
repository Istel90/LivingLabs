// Read only the two UUIDs recorded by the explicitly approved integration test.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {getPlatformHandoffConfig} from '../shared/services/platformHandoffs.js';
const root='output/common-repositories-browser';
const report=JSON.parse(readFileSync(`${root}/database-roundtrip.json`,'utf8'));
assert.equal(report.ok,true);assert.equal(report.testRows.length,2);
const {url,key}=getPlatformHandoffConfig();
for(const item of report.testRows) {
 const endpoint=new URL(`${url}/rest/v1/priority_area_sets`);
 endpoint.search=new URLSearchParams({id:`eq.${item.id}`,select:'*'}).toString();
 const response=await fetch(endpoint,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 assert.equal(response.status,200);const [row]=await response.json();
 assert.equal(row.created_by_user,'QA 공통 저장소 검증');assert.ok(row.deleted_at);
 writeFileSync(`${root}/database-wire-${item.hazard}.json`,JSON.stringify(row));
 console.log(`${item.hazard}: raw database snapshot captured; QA row remains in trash`);
}
