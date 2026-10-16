'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {patch,marker}=require('../scripts/fix-tracker-manual-monitoring-next-action.cjs');
const original=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const fixed=patch(original).source;
assert(fixed.includes(marker));
assert.equal(patch(fixed).changed,false,'surgical fix must be idempotent');
assert.equal(patch(fixed).source,fixed,'never duplicate the UI guard');
const start=fixed.indexOf('function _trackerEvidenceGateState(p){');
const end=fixed.indexOf('function _trackerImplementationCheckState(',start);
assert(start>0&&end>start,'extract ACTUAL Tracker browser state machine');
const state=vm.runInNewContext(fixed.slice(start,end)+'\n_trackerNextActionState;',{
 Date,
 _aiEvidenceIsVerified:()=>true
});
const base={
 id:20,url:'https://synthetic-roofer.example/roof-replacement/',
 case_study_active:true,case_study:{baseline_locked:true,baseline_at:'2026-09-25T00:00:00Z'},
 case_study_fresh_cycle_initialized:true,
 manual_done:true,manual_done_at:'2026-10-08T10:00:00Z',
 brief_content:{outstanding_actions:4,cycle_id:'legacy-brief'},
 brief_evaluated_at:'2026-10-01T12:00:00Z',
 prepublication_checkpoint_saved:true,
 prepublication_checkpoint_at:'2026-09-28T09:00:00Z',
 last_checked:'2026-10-01T13:00:00Z',
 implementation_status:'not_verified',
 monitoring_waiting_input:false
};
const evaluate=(overrides={})=>{
 const p={...base,...overrides};
 return state(p,p.is_done===true,p.last_checked,'Next evidence request: 31 Oct 2026');
};
let r=evaluate();
assert.equal(r.code,'MONITOR','manual completed page must not be ordered to reopen an old Brief');
assert.match(r.detail,/Proof & History/);
assert.match(r.detail,/Next evidence request/);
assert.equal(r.button,'');
r=evaluate({manual_done:false});
assert.equal(r.code,'REVIEW_BRIEF','uncompleted editorial workflow remains available');
r=evaluate({manual_done_at:null});
assert.equal(r.code,'REVIEW_BRIEF','without completion timestamp do not infer closure');
r=evaluate({brief_evaluated_at:'2026-10-10T12:00:00Z',last_checked:'2026-10-10T12:00:00Z'});
assert.equal(r.code,'REVIEW_BRIEF','a genuinely NEW scan after My Check must reopen the Brief');
r=evaluate({html_pasted_at:'2026-10-10T12:00:00Z'});
assert.notEqual(r.code,'MONITOR','new HTML requires fresh review');
r=evaluate({current_revision_published_at:'2026-10-10T12:00:00Z'});
assert.notEqual(r.code,'MONITOR','post-check publication must not be masked');
r=evaluate({implementation_status:'verifying'});
assert.notEqual(r.code,'MONITOR','active verification must remain visible');
r=evaluate({monitoring_waiting_input:true,monitoring_gate_label:'case_day_30',
 monitoring_request_at:'2026-10-15T00:00:00Z'});
assert.equal(r.code,'WAITING','new evidence request outranks historical monitoring');
r=evaluate({monitoring_waiting_input:true,monitoring_gate_label:'case_day_30',
 monitoring_request_at:'2026-10-15T00:00:00Z',
 monitoring_gsc_pages_at:'2026-10-15T12:00:00Z',
 monitoring_gsc_queries_at:'2026-10-15T12:00:00Z',
 monitoring_require_ai:false});
assert.equal(r.code,'CHECKPOINT_READY','completed evidence milestone must remain actionable');
console.log('PASS: My Check completed monitoring beats stale Brief; fresh work and evidence checkpoints still work');
