import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {getPlatformHandoffConfig} from '../shared/services/platformHandoffs.js';
const before=JSON.parse(readFileSync('output/draft-production-20260922/supabase-drafts.json','utf8'));
const {url,key}=getPlatformHandoffConfig();
const response=await fetch(`${url}/rest/v1/priority_area_sets?select=*&id=in.(${before.map(r=>r.id).join(',')})`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
assert.equal(response.status,200);const after=await response.json();assert.equal(after.length,before.length);
for(const row of before){const current=after.find(r=>r.id===row.id);for(const field of Object.keys(row)){if(field!=='updated_at')assert.deepEqual(current[field],row[field],`${row.id}: ${field}`);}}
writeFileSync('output/draft-production-20260922/backup-preservation.json',JSON.stringify({status:'PASS',rows:before.length,unchanged:'all pre-existing fields except migration-trigger updated_at',checkedAt:new Date().toISOString()},null,2));
console.log(`PASS: ${before.length} original rows preserved.`);
