'use strict';
// Exercise canonical dashboard state only; never boot app or call external providers.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const start=s.indexOf('function _trackerEvidenceGateState('),end=s.indexOf('\nfunction _trackerImplementationCheckState(',start);
assert(start>0&&end>start&&end-start<30000,'Canonical dashboard decision markers changed');
const ctx={Date,JSON,_aiEvidenceIsVerified:()=>false};
vm.runInNewContext(s.slice(start,end)+'\nglobalThis.next=_trackerNextActionState;',ctx,{timeout:5000});
function page(extra={}){return {id:17,url:'https://es.contentscale.site/',check_frequency:'0',manual_done:true,
 case_study_active:true,case_study_fresh_cycle_initialized:true,
 case_study:{baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'},
 ai_manual_evidence:{},brief_content:{outstanding_actions:2},prepublication_checkpoint_saved:true,...extra};}
function next(p,scan){return ctx.next(p,true,scan,'');}
test('dashboard offers manual first scan without old snapshot, AI checked 0/5',()=>{
 const p=page({ai_checked:0}),r=next(p,null);
 assert.equal(r.code,'SCAN');assert.match(r.buttonAction,/checkPage\(17\)/);assert.equal(p.check_frequency,'0');
});
test('historical Done and old scan do not lock new Case Study',()=>{
 const r=next(page(),'2026-08-18T00:00:00Z');assert.equal(r.code,'SCAN');assert.match(r.label,/FIRST MANUAL SCAN/);
});
test('evidence checkpoint takes precedence over first manual scan',()=>{
 const r=next(page({monitoring_waiting_input:true,monitoring_gate_label:'case_day_7',monitoring_request_at:'2026-10-10T12:10:00Z'}),null);
 assert.equal(r.code,'WAITING');assert.equal(r.button,'');
});
test('scan completed after baseline cannot display first manual scan again',()=>{
 const r=next(page(),'2026-10-10T12:10:00Z');assert.notEqual(r.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('missing fresh-cycle marker does not expose first manual scan action',()=>{
 const r=next(page({case_study_fresh_cycle_initialized:false}),null);
 assert.notEqual(r.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
