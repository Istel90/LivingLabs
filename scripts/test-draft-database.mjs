import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../riskmap-core-main/package.json',import.meta.url));
const {Pool}=require('pg');
const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',database:'livinglabs_postgis',max:12});
const schema='draft_validation_'+Date.now();
const results=[];
mkdirSync('output/draft-management-backup-20260922',{recursive:true});
try {
 await pool.query(`create schema ${schema}; create table ${schema}.regions(region_code text primary key);
 insert into ${schema}.regions values ('41110');
 create table ${schema}.priority_area_sets(id uuid primary key default gen_random_uuid(),region_code text not null references ${schema}.regions,
 set_name text not null,hazard_type text not null,scenario_name text,analysis_version text,analysis_conditions jsonb not null default '{}',
 status text not null default 'draft',created_by_tool text default 'priority_area_tool',created_by_user text,is_demo boolean default true,
 created_at timestamptz not null default now(),updated_at timestamptz,submitted_at timestamptz,description text,source_job_id text);`);
 const sql=readFileSync('docs/PRIORITY_DRAFT_CONCURRENCY.sql','utf8').replaceAll('public.',schema+'.')
  .replace(/grant usage on sequence[^;]+;/,'').replace(/revoke all on function[^;]+;/,'');
 await pool.query(sql);
 const save=(id,parent=null)=>pool.query(`insert into ${schema}.priority_area_sets(id,region_code,hazard_type,set_name,parent_id,analysis_conditions)
 values($1,'41110','flood','',$2,'{"test":true}') on conflict(id) do nothing returning *`,[id,parent]);
 const roots=await Promise.all(Array.from({length:10},()=>save(randomUUID())));
 assert.equal(new Set(roots.map(r=>r.rows[0].analysis_version)).size,10);results.push('10 simultaneous root saves have distinct server versions');
 const parent=roots[0].rows[0];
 const children=await Promise.allSettled([save(randomUUID(),parent.id),save(randomUUID(),parent.id)]);
 assert.equal(children.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(children.filter(r=>r.status==='rejected'&&['PT409','23505'].includes(r.reason.code)).length,1);
 results.push('two concurrent edits of the same parent: one success, one conflict');
 const child=children.find(r=>r.status==='fulfilled').value.rows[0];
 assert.equal(child.lineage_id,parent.lineage_id);
 const retry=await save(child.id,parent.id);assert.equal(retry.rowCount,0);results.push('confirmed request replay inserts no duplicate');
 const mutation=()=>pool.query(`update ${schema}.priority_area_sets set set_name='renamed' where id=$1 and management_version=1 returning *`,[child.id]);
 const edits=await Promise.all([mutation(),mutation()]);assert.equal(edits.reduce((n,r)=>n+r.rowCount,0),1);
 results.push('concurrent metadata edits: stale version changes zero rows');
 await pool.query(`update ${schema}.priority_area_sets set deleted_at=now() where id=$1`,[child.id]);
 await assert.rejects(save(randomUUID(),child.id),e=>e.code==='PT409');
 await pool.query(`update ${schema}.priority_area_sets set deleted_at=null where id=$1`,[child.id]);
 assert.equal((await save(randomUUID(),child.id)).rowCount,1);results.push('deleted parent rejected, restored parent usable');
 await assert.rejects(pool.query(`update ${schema}.priority_area_sets set analysis_conditions='{}' where id=$1`,[child.id]),e=>e.code==='PT409');
 results.push('analysis snapshots cannot be overwritten');
 await assert.rejects(pool.query(`insert into ${schema}.priority_area_sets(region_code,hazard_type,set_name,parent_id) values('41110','heatwave','',$1)`,[roots[1].rows[0].id]),e=>e.code==='PT409');
 results.push('cross-hazard parent rejected');
 console.log(JSON.stringify({status:'PASS',results,limits:'Local isolated schema; production RLS/grants not applied or tested.'},null,2));
 writeFileSync('output/draft-management-backup-20260922/database-test.json',JSON.stringify({status:'PASS',results},null,2));
} finally {
 await pool.query(`drop schema if exists ${schema} cascade`);
 await pool.end();
}
