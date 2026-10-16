'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
assert(original.includes('CONTENTSCALE_CANONICAL_GROWTH_JOURNEY_V1'));
assert(original.includes('CONTENTSCALE_SHARED_MONITORING_GUARD_V1'));
assert(!original.includes('CONTENTSCALE-MANUAL-MONITORING-PRIORITY:'),
 'old competing page-specific override must be removed');
const start=original.indexOf('function _trackerEvidenceGateState(p){');
const end=original.indexOf('function _trackerImplementationCheckState(',start);
assert(start>0&&end>start,'extract ACTUAL Tracker browser state machine');
const templateExpression="${require('fs').readFileSync(require('path').join(__dirname,'tracker-page-journey.cjs'),'utf8')}";
let code=original.slice(start,end);
assert(code.includes(templateExpression),'Tracker embeds the one shared lifecycle source');
code=code.replace(templateExpression,fs.readFileSync(path.join(__dirname,'tracker-page-journey.cjs'),'utf8'));
const windowStub={};
const state=vm.runInNewContext(code+'\n_trackerNextActionState;',{
 Date,window:windowStub,_aiEvidenceIsVerified:()=>true
});
assert.equal(typeof windowStub.ContentScaleTrackerJourney?.inspect,'function');
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
assert.equal(r.code,'MONITOR','My Check completed page must not reopen old Brief');
assert.match(r.detail,/Proof & History/);
assert.match(r.detail,/Next evidence request/);
assert.equal(r.button,'');
r=evaluate({manual_done:false});
assert.equal(r.code,'REVIEW_BRIEF','uncompleted editorial workflow remains available');
r=evaluate({manual_done_at:null});
assert.equal(r.code,'REVIEW_BRIEF','completion requires a real timestamp');
r=evaluate({brief_evaluated_at:'2026-10-10T12:00:00Z',last_checked:'2026-10-10T12:00:00Z'});
assert.equal(r.code,'REVIEW_BRIEF','genuinely new scan after My Check reopens Brief');
r=evaluate({html_pasted_at:'2026-10-10T12:00:00Z'});
assert.notEqual(r.code,'MONITOR','new HTML must not be masked');
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
assert.equal(r.code,'CHECKPOINT_READY','ready evidence milestone remains actionable');
console.log('PASS: one canonical Tracker classifier; closed personal work, real new edits, protected evidence');
