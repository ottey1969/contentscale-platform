'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/start',");
const b=src.indexOf('\n// POST /pages/:pageId/baseline-gsc',a);
assert(a>0&&b>a&&b-a<21000,'Canonical start route changed');
function scenario(opts={}){
 let route,prepares=0,unexpected=[];
 const page={id:17,tracker_client_id:3,url:'https://es.contentscale.site/consultor-geo/',
   revision_cycle:2,manual_done:true,brief_content:{cycle_id:'historical'},implementation_verified_at:null,monitoring_waiting_input:false,...opts.page};
 const cs={id:21,tracker_client_id:3,tracker_page_id:17,status:'active',baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'};
 const evidence={fresh_cycle_initialized:false,latest_snapshot_at:'2026-08-18T00:00:00Z',latest_published_at:null,baseline_html_ready:true,...opts.evidence};
 const pool={async query(sql){
  if(sql.includes('SELECT * FROM tracker_clients'))return {rows:[{id:3,token:'fixture',domain:'contentscale.site'}]};
  if(sql.includes('SELECT * FROM tracker_pages'))return {rows:[page]};
  if(sql.includes('SELECT * FROM tracker_case_studies'))return {rows:[cs]};
  if(sql.includes('AS baseline_html_ready'))return {rows:[evidence]};
  unexpected.push(sql.slice(0,90));throw Error('Unexpected SQL '+sql.slice(0,90));
 }};
 const ctx={app:{post(_path,fn){route=fn}},pool,Date,JSON,console:{error:()=>{},warn:()=>{}},
  _ensureCaseStudySchema:async()=>{},_caseStudyNormUrl:u=>u,
  _caseStudyUrlPreflight:async()=>({ok:true}),_caseStudyOpenFreshStartCycle:async()=>{prepares++;return {revision_cycle:3}},
 };
 vm.runInNewContext(src.slice(a,b),ctx,{timeout:5000});
 return {page,cs,evidence,unexpected,get prepares(){return prepares},async call(){
  const res={statusCode:200,status(v){this.statusCode=v;return this},json(v){this.data=JSON.parse(JSON.stringify(v));return this}};
  await route({params:{token:'fixture',pageId:'17'},body:{}},res);
  return res;
 }};
}
test('previously active Case Study with no verified date may prepare a first manual scan',async()=>{
 const x=scenario(),r=await x.call();
 assert.equal(r.statusCode,200);
 assert.equal(r.data.fresh_cycle_repaired,true);
 assert.equal(x.prepares,1);assert.deepEqual(x.unexpected,[]);
});
test('existing current fresh marker must never initialize twice',async()=>{
 const x=scenario({evidence:{fresh_cycle_initialized:true}}),r=await x.call();
 assert.equal(r.statusCode,200);assert.equal(x.prepares,0);
});
for(const [name,scenarioOptions] of [
 ['newer snapshot',{evidence:{latest_snapshot_at:'2026-10-10T12:01:00Z'}}],
 ['newer publication',{evidence:{latest_published_at:'2026-10-10T12:01:00Z'}}],
 ['missing immutable HTML',{evidence:{baseline_html_ready:false}}],
 ['evidence checkpoint pending',{page:{monitoring_waiting_input:true}}],
 ['implementation verified after baseline',{page:{implementation_verified_at:'2026-10-10T12:01:00Z'}}]
]){
 test('legacy active recovery refuses '+name,async()=>{
  const x=scenario(scenarioOptions),r=await x.call();
  assert.equal(r.statusCode,409);assert.equal(r.data.case_cycle_review_required,true);
  assert.equal(x.prepares,0);assert.deepEqual(x.unexpected,[]);
 });
}
test('NEXT ACTION offers preparation rather than a bypass scan on legacy active Case Study',()=>{
 const u0=src.indexOf('function _trackerNextActionState('),u1=src.indexOf('\nfunction _trackerImplementationCheckState(',u0);
 const ctx={Date,JSON,_aiEvidenceIsVerified:()=>false,_trackerEvidenceGateState:()=>({waiting:false,ready_to_scan:false,ready_to_complete:false})};
 vm.runInNewContext(src.slice(u0,u1)+'\nglobalThis.next=_trackerNextActionState;',ctx,{timeout:5000});
 const p={id:17,url:'https://es.contentscale.site/consultor-geo/',manual_done:true,
  case_study_active:true,case_study_fresh_cycle_initialized:false,
  case_study:{status:'active',baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'},
  brief_content:{outstanding_actions:2,cycle_id:'historical'},brief_evaluated_at:'2026-08-18T00:00:00Z',check_frequency:'0'};
 const x=ctx.next(p,true,'2026-08-18T00:00:00Z',null);
 assert.equal(x.code,'PREPARE_CASE');assert.equal(x.buttonAction,'startCaseStudy(17)');
});
