'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const a=source.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/start'");
const b=source.indexOf('// POST /pages/:pageId/baseline-gsc',a);
assert(a>0&&b>a&&b-a<18000,'Canonical case-study start route moved; inspect before changing test');
const handlerSource=source.slice(a,b);
const client={id:7,token:'synthetic',name:'Test Business',domain:'test.example',email:'owner@example.org'};
const page={id:19,tracker_client_id:7,url:'https://test.example/service',last_checked_at:new Date('2026-10-10'),keyword:'roof repair'};
function make(overrides={}){
 let handler,selects=0,writes=0,emails=0;
 const caseRows=overrides.existing?[{id:42,status:'inactive',baseline_locked:true}]:[];
 const pool={query:async(sql)=>{
  const s=String(sql);
  if(/^\s*(INSERT|UPDATE|DELETE)\b/i.test(s)){writes++;throw Error('Unexpected mutation in refusal fixture');}
  selects++;
  if(s.includes('FROM tracker_clients'))return {rows:overrides.noClient?[]:[client]};
  if(s.includes('FROM tracker_pages'))return {rows:overrides.wrongPage?[]:[page]};
  if(s.includes('FROM tracker_case_studies'))return {rows:caseRows};
  if(s.includes('FROM tracker_snapshots'))return {rows:overrides.snapshot?[{checked_at:new Date('2026-10-10')}]:[]};
  throw Error('Unexpected SELECT: '+s.slice(0,90));
 }};
 const context={
  app:{post(_url,fn){handler=fn}},pool,Date,Number,String,Set,JSON,parseInt,Math,AbortSignal,
  console:{error(){},log(){}},
  _ensureCaseStudySchema:async()=>{},
  _caseStudyUrlPreflight:async()=>overrides.preflight||{ok:true},
  _caseStudySendRedirectNotice:async()=>{emails++},
  _caseStudyNormUrl:u=>u,
 };
 vm.runInNewContext(handlerSource,context,{timeout:3000});
 assert.equal(typeof handler,'function');
 async function invoke(){
  const res={code:200,status(n){this.code=n;return this},json(body){this.body=JSON.parse(JSON.stringify(body));return body}};
  await handler({params:{token:'synthetic',pageId:'19'},body:{primary_query:'roof repair'}},res);
  return res;
 }
 return {invoke,counts:()=>({selects,writes,emails})};
}
test('Case Study refuses unknown Tracker without creating state',async()=>{
 const f=make({noClient:true}),r=await f.invoke();
 assert.equal(r.code,404);assert.equal(f.counts().writes,0);
});
test('Case Study refuses page belonging to another Tracker',async()=>{
 const f=make({wrongPage:true}),r=await f.invoke();
 assert.equal(r.code,403);assert.equal(f.counts().writes,0);
});
test('Case Study fails closed on redirect or dead URL before writing baseline',async()=>{
 for(const kind of ['redirect','dead']){
  const f=make({preflight:{ok:false,kind,destination:'https://test.example/new',destinationTracked:false}});
  const r=await f.invoke();
  assert.equal(r.code,409);assert.equal(r.body.url_preflight_failed,true);
  assert.equal(f.counts().writes,0);
 }
});
test('Case Study never overwrites protected inactive history',async()=>{
 const f=make({existing:true}),r=await f.invoke();
 assert.equal(r.code,409);assert.equal(r.body.protected_history,true);assert.equal(f.counts().writes,0);
});
test('Case Study requires real Tracker snapshot before baseline',async()=>{
 const f=make(),r=await f.invoke();
 assert.equal(r.code,409);assert.equal(r.body.scan_required,true);assert.equal(f.counts().writes,0);
});
