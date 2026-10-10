'use strict';
// Extracts only the canonical dashboard next-action function; never boots app.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(process.env.CS_CASE_TEST_INDEX_FILE||path.resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf('function _trackerNextActionState('),b=src.indexOf('\nfunction _trackerImplementationCheckState(',a);
assert(a>0&&b>a&&b-a<35000,'canonical NEXT ACTION boundary changed');
const box={
 Date,JSON,
 _aiEvidenceIsVerified:()=>false,
 _trackerEvidenceGateState:p=>p.monitoring_waiting_input
  ? {waiting:true,checkpoint:true,missing:['AI 0/5'],ready_to_complete:false,ready_to_scan:false}
  : {waiting:false,checkpoint:false,missing:[],ready_to_complete:false,ready_to_scan:false}
};
vm.runInNewContext(src.slice(a,b)+'\nglobalThis.testNextAction=_trackerNextActionState;',box,{timeout:5000});
function page(extra={}){
 return {id:2538,url:'https://es.contentscale.site/consultor-geo/',revision_cycle:2,
  case_study_active:true,case_study_fresh_cycle_initialized:true,
  case_study:{status:'active',baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'},
  manual_done:true,brief_content:{outstanding_actions:2},brief_evaluated_at:'2026-08-18T00:00:00Z',
  check_frequency:'0',ai_manual_evidence:{},...extra};
}
test('real NEXT ACTION enables first manual scan despite old Done and zero new AI checks',()=>{
 const p=page(),x=box.testNextAction(p,true,'2026-08-18T00:00:00Z',null);
 assert.equal(x.code,'SCAN');assert.equal(x.button,'Scan current live page');
 assert.equal(x.buttonAction,'checkPage(2538)');assert.equal(p.check_frequency,'0');
});
test('real NEXT ACTION does not bypass incomplete case checkpoint',()=>{
 const x=box.testNextAction(page({monitoring_waiting_input:true}),true,'2026-08-18T00:00:00Z',null);
 assert.equal(x.code,'WAITING');assert.equal(x.button,'');
});
test('real NEXT ACTION refuses first scan without cycle marker',()=>{
 const x=box.testNextAction(page({case_study_fresh_cycle_initialized:false}),true,'2026-08-18T00:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('real NEXT ACTION refuses first scan after revision publication',()=>{
 const x=box.testNextAction(page({current_revision_published_at:'2026-10-10T13:00:00Z'}),true,'2026-08-18T00:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('real NEXT ACTION refuses first scan after a newer snapshot',()=>{
 const x=box.testNextAction(page({brief_content:{outstanding_actions:2},prepublication_checkpoint_saved:true}),true,'2026-10-10T13:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
