import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync, mkdirSync} from 'node:fs';
import {getPlatformHandoffConfig} from '../shared/services/platformHandoffs.js';
import {managePriorityAreaDraft} from '../shared/services/priorityAreaDrafts.js';
const {url,key}=getPlatformHandoffConfig();
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'};
const ids=[];const checks=[];
mkdirSync('output/draft-production-20260922',{recursive:true});
async function request(query,method='GET',body){
 const r=await fetch(`${url}/rest/v1/priority_area_sets?${query}`,{method,headers,body:body?JSON.stringify(body):undefined});
 const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};
}
async function insert(hazard,parent=null,id=randomUUID()){
 ids.push(id);return request('on_conflict=id','POST',{id,parent_id:parent,region_code:'41110',set_name:'운영 반영 점검용 (실제 작업 아님)',hazard_type:hazard,status:'draft',is_demo:true,created_by_user:'배포 기능 점검',created_by_tool:'priority_area_tool',analysis_conditions:{draftPayload:{regionCode:'41110',hazard,alternatives:[]}}});
}
try{
 for(const hazard of ['flood','heatwave']){
  const r=await insert(hazard);assert.equal(r.status,201,JSON.stringify(r));let row=r.body[0];
  assert.equal(row.lineage_id,row.id);assert.match(row.analysis_version,/^draft\/\d+$/);
  row=await managePriorityAreaDraft(row,'rename','운영 반영 점검용 이름 변경');
  await assert.rejects(()=>managePriorityAreaDraft({...row,management_version:row.management_version-1},'rename','stale'));
  row=await managePriorityAreaDraft(row,'delete');assert.ok(row.deleted_at);
  row=await managePriorityAreaDraft(row,'restore');assert.equal(row.deleted_at,null);
  const children=await Promise.all([insert(hazard,row.id),insert(hazard,row.id)]);
  assert.equal(children.filter(x=>x.status===201).length,1,JSON.stringify(children));
  assert.equal(children.filter(x=>x.status===409).length,1);
  const child=children.find(x=>x.status===201).body[0];
  const replay=await insert(hazard,row.id,child.id);assert.equal(replay.status,201);assert.equal(replay.body.length,0);
  checks.push(`${hazard}: insert, server number, rename, stale update rejection, trash, restore, concurrent child conflict, idempotent retry PASS`);
 }
} finally {
 // Only exact UUIDs created by this test; preserve all records recoverably.
 const clean=await request(`id=in.(${[...new Set(ids)].join(',')})`,'PATCH',{status:'archived',deleted_at:new Date().toISOString()});
 assert.equal(clean.status,200,JSON.stringify(clean));
 writeFileSync('output/draft-production-20260922/production-api-test.json',JSON.stringify({checks,testIds:[...new Set(ids)],cleanup:'archived',finishedAt:new Date().toISOString()},null,2));
}
console.log(checks.join('\n'));
