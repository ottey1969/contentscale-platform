'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const gateStart=s.indexOf('function _trackerNormalScanGate(');
const gateEnd=s.indexOf('// POST /api/tracker-client/:token/scan-all',gateStart);
const start=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId'");
const end=s.indexOf('\n});',start);
assert(gateStart>0&&gateEnd>gateStart&&gateEnd-gateStart<10000,'Normal scan gate boundary changed');
assert(start>0&&end>start&&end-start<13000,'Canonical manual check route boundary changed');
const code=s.slice(gateStart,gateEnd)+'\n'+s.slice(start,end+4);
function fixture({snapshot='2026-10-10T00:00:00Z',fresh=true,published=false}={}){
 let handler,scheduled=null,scanned=0,notified=0;
 const baseline='2026-10-11T00:00:00Z';
 const page={id:12,tracker_client_id:8,url:'https://synthetic.example/service',manual_done:true,is_done:true,
  case_study_active:true,brief_content:{outstanding_actions:0},last_checked_at:new Date(snapshot),revision_cycle:2};
 const pool={query:async(sql)=>{
  if(sql.includes('FROM tracker_clients'))return {rows:[{id:8,claims_facts_updated_at:null}]};
  if(sql.includes('FROM tracker_pages'))return {rows:[page]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:[{baseline_at:baseline,latest_snapshot_at:snapshot,fresh_cycle_initialized:fresh,current_revision_published_at:published?'2026-10-12T00:00:00Z':null}]};
  throw Error('Unexpected query '+String(sql).slice(0,150));
 }};
 const context={app:{post(_p,fn){handler=fn}},pool,Date,Math,Number,String,JSON,Set,process:{env:{}},
  console:{log(){},warn(){}},_trackerCheckStatus:new Map(),
  _sseBroadcast:()=>{notified++},
  setImmediate:cb=>{scheduled=cb},
  runTrackerCheck:async p=>{scanned++;assert.equal(p._caseStudyFirstManualScan,true);return {success:true}},
  _caseStudyEventForPage:async()=>{},_ensureMonitoringGateSchema:async()=>{},setTimeout,
 };
 vm.runInNewContext(code,context,{timeout:4000});
 async function run(){
  const res={code:200,status(n){this.code=n;return this},json(x){this.body=JSON.parse(JSON.stringify(x));return x}};
  await handler({params:{token:'synthetic',pageId:'12'},body:{}},res);
  return res;
 }
 return {run,flush:async()=>{if(scheduled)await scheduled()},counts:()=>({scanned,notified})};
}
test('First manual Case Study scan allowed exactly after locked fresh baseline',async()=>{
 const f=fixture(),r=await f.run();
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.success,true);
 await f.flush();assert.equal(f.counts().scanned,1);
});
test('Scan after baseline is not permitted to masquerade as first manual scan',async()=>{
 const f=fixture({snapshot:'2026-10-12T00:00:00Z'}),r=await f.run();
 assert.equal(r.code,409);assert.equal(r.body.scan_locked,true);
 assert.equal(f.counts().scanned,0);
});
test('No fresh cycle means old Case Study cannot bypass protected normal scan gate',async()=>{
 const f=fixture({fresh:false}),r=await f.run();
 assert.equal(r.code,409);assert.equal(r.body.scan_locked,true);
 assert.equal(f.counts().scanned,0);
});
test('Published Case Study revision cannot claim first manual scan exception',async()=>{
 const f=fixture({published:true}),r=await f.run();
 assert.equal(r.code,409);assert.equal(f.counts().scanned,0);
});
