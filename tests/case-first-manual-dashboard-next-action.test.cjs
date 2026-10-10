'use strict';
// Read-only state-machine test: extracts the actual browser next-action function.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf('function _trackerNextActionState('),b=s.indexOf('\nfunction ',a+20);
assert(a>0&&b>a&&b-a<26000,'canonical UI action function changed');
const ctx={_trackerEvidenceGateState:()=>({waiting:false,checkpoint:false,missing:[],ready_to_complete:false,ready_to_scan:false}),_aiEvidenceIsVerified:()=>false,Date,JSON};
vm.runInNewContext(s.slice(a,b)+'\nglobalThis.nextAction=_trackerNextActionState;',ctx,{timeout:5000});
function page(done,url){
 return {id:17,url,revision_cycle:2,case_study_active:true,
 case_study_fresh_cycle_initialized:true,
 case_study:{status:'active',baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'},
 manual_done:done,brief_content:{outstanding_actions:2},check_frequency:'0'};
}
test('old Done page shows first manual Case Study scan action, scheduler Off',()=>{
 const p=page(true,'https://example.test/consultor-geo/');
 const x=ctx.nextAction(p,true,'2026-08-30T00:00:00Z',null);
 assert.equal(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
 assert.equal(x.button,'Scan current live page');
 assert.equal(x.buttonAction,'checkPage(17)');
 assert.equal(p.check_frequency,'0');
});
test('not-Done case homepage also shows first manual scan action',()=>{
 const p=page(false,'https://example.test/');
 const x=ctx.nextAction(p,false,'2026-08-18T00:00:00Z',null);
 assert.equal(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('first scan opportunity disappears after current-cycle snapshot',()=>{
 const p=page(true,'https://example.test/');
 const x=ctx.nextAction(p,true,'2026-10-10T13:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('uninitialized cycle cannot display first scan action',()=>{
 const p=page(false,'https://example.test/');p.case_study_fresh_cycle_initialized=false;
 const x=ctx.nextAction(p,false,'2026-08-18T00:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
test('published revision does not display first scan action',()=>{
 const p=page(false,'https://example.test/');p.current_revision_published_at='2026-10-10T13:00:00Z';
 const x=ctx.nextAction(p,false,'2026-08-18T00:00:00Z',null);
 assert.notEqual(x.label,'CASE STUDY ACTIVE · FIRST MANUAL SCAN');
});
