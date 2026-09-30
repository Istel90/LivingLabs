import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodePriorityDraft,decodePriorityDraft,decodePriorityDraftRow} from '../shared/services/priorityDraftCodec.js';
import {buildSupabaseDraftPayload} from '../riskmap-core-main/src/lib/priority/alternativeRepository.js';
const large={schemaVersion:'priority-management-draft/v2',label:'홍수·폭염',values:Array.from({length:60000},(_,i)=>i%5?i/60000:null),ids:['R001','Z001'],settings:{enabled:false,weight:0}};
test('small and existing uncompressed snapshots stay compatible',async()=>{
 const old={alternatives:[{id:'A001',analysisResult:null}]};
 assert.equal(await encodePriorityDraft(old),old);assert.equal(await decodePriorityDraft(old),old);
 assert.deepEqual(await decodePriorityDraftRow({id:'old',analysis_conditions:{draftPayload:old}}),{id:'old',analysis_conditions:{draftPayload:old}});
});
test('large snapshots round trip exactly, including missing values, IDs and settings',async()=>{
 const encoded=await encodePriorityDraft(large);
 assert.equal(encoded.__priorityDraftEncoding,'gzip-base64-v1');
 assert.ok(JSON.stringify(encoded).length<JSON.stringify(large).length);
 assert.deepEqual(await decodePriorityDraft(encoded),large);
 const row=await decodePriorityDraftRow({id:'row',analysis_conditions:{actorUser:'QA',draftPayload:encoded}});
 assert.deepEqual(row.analysis_conditions.draftPayload,large);assert.equal(row.analysis_conditions.actorUser,'QA');
});
test('corrupt, unsupported and oversized compressed snapshots fail explicitly',async()=>{
 const encoded=await encodePriorityDraft(large);
 for(const patch of [{data:'invalid'},{byteLength:encoded.byteLength-1},{byteLength:encoded.byteLength+1},{byteLength:129*1024*1024},{__priorityDraftEncoding:'unknown'}]) await assert.rejects(decodePriorityDraft({...encoded,...patch}));
});
test('actual flood and heatwave browser exports preserve all saved content',{skip:!process.env.DRAFT_CODEC_LIVE_FIXTURES},async()=>{
 for(const source of ['second-linked','heatwave-custom']) {
  const payload=buildSupabaseDraftPayload(JSON.parse(readFileSync(`output/common-repositories-browser/${source}.json`,'utf8')));
  const encoded=await encodePriorityDraft(payload);assert.deepEqual(await decodePriorityDraft(encoded),payload);
  console.log(JSON.stringify({source,before:Buffer.byteLength(JSON.stringify(payload)),after:Buffer.byteLength(JSON.stringify(encoded))}));
 }
});
