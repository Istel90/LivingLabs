// Explicit integration check: only newly generated QA rows are written and moved to trash.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {savePriorityAreaDraft,listPriorityAreaDrafts,managePriorityAreaDraft,draftPayloadFromRow} from '../shared/services/priorityAreaDrafts.js';
import {buildSupabaseDraftPayload} from '../riskmap-core-main/src/lib/priority/alternativeRepository.js';
const report={startedAt:new Date().toISOString(),checks:[],testRows:[]};
const file='output/common-repositories-browser/database-roundtrip.json';
const persist=()=>writeFileSync(file,JSON.stringify(report,null,2));
try {
  for (const [hazard,source] of [['flood','second-linked'],['heatwave','heatwave-custom']]) {
    const exported=JSON.parse(readFileSync(`output/common-repositories-browser/${source}.json`,'utf8'));
    const payload=buildSupabaseDraftPayload({...exported,schemaVersion:'priority-management-draft/v2',regionCode:'41110',hazard,activeAlternative:hazard==='flood'?1:0});
    assert.ok(payload.alternatives.some(a=>a.analysisResult?.indicators.some(i=>i.customDatasetId)));
    const requestId=(hazard==='flood' && process.env.QA_FLOOD_REQUEST_ID) || randomUUID();
    const entry={id:requestId,hazard,cleanup:false};report.testRows.push(entry);persist();
    const args={regionCode:'41110',regionName:'경기도 수원시',hazardType:hazard,projectName:'QA 공통 저장소 왕복 검증',actorUser:'QA 공통 저장소 검증',draftPayload:payload,requestId};
    if(hazard==='flood' && process.env.QA_FLOOD_REQUEST_ID) {
      const prior=await listPriorityAreaDrafts({regionCode:'41110',hazardType:hazard,draftId:requestId,deleted:true});
      if(prior[0]) {
        assert.equal(prior[0].created_by_user,'QA 공통 저장소 검증');
        await managePriorityAreaDraft(prior[0],'restore');
        entry.reusedOwnQaRow=true;
      }
    }
    const started=performance.now();
    const row=await savePriorityAreaDraft(args);
    entry.saveAndConfirmMs=Math.round(performance.now()-started);
    assert.equal(row.id,requestId);
    const rows=await listPriorityAreaDrafts({regionCode:'41110',hazardType:hazard,draftId:requestId});
    assert.equal(rows.length,1);assert.deepEqual(draftPayloadFromRow(rows[0]),payload);
    const repeated=await savePriorityAreaDraft(args);
    assert.equal(repeated.id,row.id);assert.equal(repeated.analysis_version,row.analysis_version);
    report.checks.push(`${hazard}: full saved payload, Risk values and IDs, user indicator references and retry identity match`);persist();
    const deleted=await managePriorityAreaDraft(repeated,'delete');
    assert.ok(deleted.deleted_at);entry.cleanup=true;persist();
    assert.equal((await listPriorityAreaDrafts({regionCode:'41110',hazardType:hazard,draftId:requestId})).length,0);
  }
  report.ok=true;
} catch(error) { report.ok=false;report.error=error.message;throw error; }
finally {
  for(const entry of report.testRows.filter(item=>!item.cleanup)) {
    try {
      const rows=await listPriorityAreaDrafts({regionCode:'41110',hazardType:entry.hazard,draftId:entry.id});
      if(rows[0]) {
        assert.equal(rows[0].created_by_user,'QA 공통 저장소 검증');
        await managePriorityAreaDraft(rows[0],'delete');
      }
      entry.cleanup=true;
    } catch(error) { entry.cleanupError=error.message; }
  }
  report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify(report,null,2));
}
