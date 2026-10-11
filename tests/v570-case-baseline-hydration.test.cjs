'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf("app.get('/api/tracker-client/:token', async");
const b=s.indexOf('// GET /api/tracker-client/:token/briefs/:pageId',a);
assert(a>0&&b>a&&b-a<60000,'Canonical Tracker GET route changed');
const getRoute=s.slice(a,b);
const d=s.indexOf('function _trackerNextActionState('),e=s.indexOf('\nfunction _trackerImplementationCheckState(',d);
assert(d>0&&e>d&&e-d<26000,'Canonical NEXT ACTION function changed');
const ctx={Date,JSON,_trackerEvidenceGateState:p=>({waiting:!!p.monitoring_waiting_input,ready_to_scan:false,ready_to_complete:false,missing:[]}),_aiEvidenceIsVerified:()=>false};
vm.runInNewContext(s.slice(d,e)+'\nglobalThis.resolve=_trackerNextActionState;',ctx,{timeout:5000});
function page(id,done){
 return {id,url:id===2538?'https://es.contentscale.site/consultor-geo/':'https://es.contentscale.site/',manual_done:done,
  implementation_status:'case_study_baseline_locked',last_checked_at:id===2538?'2026-08-30T00:08:36.681Z':'2026-08-17T21:04:58.236Z',
  claims_facts_updated_at:'2026-10-10T13:00:00Z',case_study_active:true,case_study_fresh_cycle_initialized:true,
  case_study:{id:id===2538?2159:2160,baseline_locked:true,baseline_at:'2026-10-10T11:48:13.942Z'},
  monitoring_waiting_input:false,check_frequency:'0',brief_content:null};
}
test('real Tracker GET hydrates persisted baseline_locked for nested case_study',()=>{
 assert.match(getRoute,/SELECT id,tracker_page_id,canonical_url,status,baseline_at,baseline_locked,baseline_data,started_at/);
 assert.match(getRoute,/_p\.case_study=_cs\|\|null;/);
 assert.match(getRoute,/_p\.case_study_baseline_locked=!!\(_cs&&_cs\.baseline_locked\)/);
 assert.doesNotMatch(getRoute,/UPDATE tracker_case_studies\s+SET\s+baseline_locked/i);
});
for(const [id,done] of [[2538,true],[2537,false]]){
 test('live legacy page '+id+' sees first manual scan despite old Done='+done+' and newer Claims & Facts',()=>{
  const p=page(id,done);
  const r=ctx.resolve(p,p.manual_done,p.last_checked_at,null);
  assert.equal(r.code,'SCAN');
  assert.equal(r.button,'Scan current live page');
  assert.equal(r.buttonAction,'checkPage('+id+')');
 });
}
test('reproduces screenshot root cause before SELECT repair: missing nested baseline flag shows FACTS_WAIT_SCAN',()=>{
 const p=page(2538,true);delete p.case_study.baseline_locked;
 const r=ctx.resolve(p,true,p.last_checked_at,null);
 assert.equal(r.code,'FACTS_WAIT_SCAN');
});
test('active Case Study monitoring checkpoint still blocks unsafe first scan',()=>{
 const p=page(2538,true);p.monitoring_waiting_input=true;
 assert.equal(ctx.resolve(p,true,p.last_checked_at,null).code,'WAITING');
});
test('new snapshot after protected baseline does not offer duplicate first manual scan',()=>{
 const p=page(2538,true);p.last_checked_at='2026-10-11T03:00:00Z';
 assert.notEqual(ctx.resolve(p,true,p.last_checked_at,null).code,'SCAN');
});
test('first scan has only one primary action, with no redundant implementation banner',()=>{
 const a=s.indexOf('function _trackerImplementationCheckHtml('),b=s.indexOf('\nfunction _trackerNextActionHtml(',a);
 assert(a>0&&b>a&&b-a<2500);
 const view={_trackerImplementationCheckState:()=>{throw Error('Duplicate panel not allowed')}};
 vm.runInNewContext(s.slice(a,b)+'\nglobalThis.render=_trackerImplementationCheckHtml;',view,{timeout:5000});
 assert.equal(view.render(page(2538,true),true,{code:'SCAN'}),'');
 assert.equal(view.render(page(2538,true),true,{code:'PREPARE_CASE'}),'');
});
