'use strict';
// Executes ONLY the canonical manual route, never imports or boots ContentScale.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const g0=s.indexOf('function _trackerNormalScanGate(');
const g1=s.indexOf('\n// POST /api/tracker-client/:token/scan-all',g0);
const r0=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const r1=s.indexOf('\n// Exact client-side scan status',r0);
assert(g0>0&&g1>g0&&r0>0&&r1>r0&&r1-r0<22000,'Canonical route markers changed: manual review required');
function scenario(options={}){
 const page={id:17,tracker_client_id:3,url:'https://example.test/page',manual_done:options.done!==false,brief_content:{outstanding_actions:2},brief_evaluated_at:'2026-08-18T00:00:00Z',check_frequency:'0',monitoring_waiting_input:false};
 // Intentional: canonical tracker_pages table has NO case_study_active column.
 const state={baseline_at:'2026-10-10T12:00:00Z',latest_snapshot_at:options.newSnapshot?'2026-10-10T13:00:00Z':'2026-08-18T00:00:00Z',fresh_cycle_initialized:options.fresh!==false};
 let handler=null,unexpected=[],writes=0,scheduled=[],scanCalls=0;
 const pool={async query(sql){
  if(/^(UPDATE |INSERT |DELETE )/i.test(sql))writes++;
  if(sql.startsWith('ALTER TABLE'))return {rows:[]};
  if(sql.startsWith('SELECT id,claims_facts_updated_at FROM tracker_clients'))return {rows:[{id:3}]};
  if(sql.startsWith('SELECT * FROM tracker_pages WHERE id='))return {rows:[page]};
  if(sql.includes('FROM tracker_case_studies cs'))return {rows:[state]};
  if(sql.includes('FROM tracker_snapshots s JOIN tracker_pages p'))return {rows:[]};
  unexpected.push(sql.slice(0,90));throw Error('Unexpected SQL: '+sql.slice(0,90));
 }};
 const ctx={app:{post(p,fn){handler=fn}},pool,_ensureMonitoringGateSchema:async()=>{},_trackerCheckStatus:new Map(),_sseBroadcast:()=>{},setImmediate:fn=>scheduled.push(fn),Date,JSON,process:{env:{}},console:{error:()=>{},warn:()=>{},log:()=>{}},runTrackerCheck:async()=>{scanCalls++}};
 vm.runInNewContext(s.slice(g0,g1)+'\n'+s.slice(r0,r1),ctx,{timeout:5000});
 async function call(){const res={statusCode:200,status(v){this.statusCode=v;return this},json(v){this.payload=JSON.parse(JSON.stringify(v));return this}};await handler({params:{token:'owner',pageId:'17'}},res);return res;}
 return {call,page,unexpected,get writes(){return writes},get scheduled(){return scheduled.length},get scanCalls(){return scanCalls},async flush(){for(const fn of scheduled.splice(0))await fn()}};
}
test('real endpoint allows first manual scan despite old Done, without scheduler',async()=>{
 const x=scenario();const r=await x.call();
 assert.equal(r.statusCode,200);assert.equal(r.payload.message,'Check started');
 assert.equal(x.page.check_frequency,'0');assert.equal(x.writes,0);assert.deepEqual(x.unexpected,[]);
});
test('real endpoint allows first scan without old Done too',async()=>{
 const x=scenario({done:false});const r=await x.call();assert.equal(r.statusCode,200);assert.equal(x.writes,0);
});
test('real endpoint blocks repeated scan after case baseline',async()=>{
 const x=scenario({newSnapshot:true});const r=await x.call();assert.equal(r.statusCode,409);assert.equal(r.payload.scan_locked,true);
});
test('real endpoint blocks uninitialized Case Study cycle',async()=>{
 const x=scenario({fresh:false});const r=await x.call();assert.equal(r.statusCode,409);assert.equal(r.payload.scan_locked,true);
});

test('accepted manual scan dispatches one background runner only when queued',async()=>{
 const x=scenario();const r=await x.call();
 assert.equal(r.statusCode,200);assert.equal(x.scheduled,1);assert.equal(x.scanCalls,0);
 await x.flush();assert.equal(x.scanCalls,1);assert.deepEqual(x.unexpected,[]);
});
test('concurrent double click reports already running without duplicate dispatch',async()=>{
 const x=scenario();const first=await x.call(),second=await x.call();
 assert.equal(first.payload.message,'Check started');assert.equal(second.payload.already_running,true);
 assert.equal(x.scheduled,1);await x.flush();assert.equal(x.scanCalls,1);
});
test('blocked repeat scan dispatches no runner',async()=>{
 const x=scenario({newSnapshot:true});const r=await x.call();
 assert.equal(r.statusCode,409);assert.equal(x.scheduled,0);assert.equal(x.scanCalls,0);
});
