'use strict';
// Canonical manual POST + owned GET status + browser poll, isolated. No app boot.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const g0=s.indexOf('function _trackerNormalScanGate('),g1=s.indexOf('\n// POST /api/tracker-client/:token/scan-all',g0);
const r0=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const r1=s.indexOf('\n// Exact client-side scan status',r0);
const q0=s.indexOf("app.get('/api/tracker-client/:token/check-status/:pageId', async (req, res) => {");
const q1=s.indexOf('\n// GET /track/:token — client tracker page',q0);
const u0=s.indexOf('function pollAndShowBrief('),u1=s.indexOf('\n  function _isFinalBriefForScan(',u0);
assert(g0>0&&g1>g0&&r0>g1&&r1>r0&&q0>r1&&q1>q0&&u0>0&&u1>u0);
function fixture(failure,snapshotAt='2026-08-18T00:00:00Z'){
 const page={id:17,tracker_client_id:3,url:'https://fixtures.invalid/page',manual_done:true,brief_content:{old:true},brief_evaluated_at:'2026-08-18T12:00:00Z',check_frequency:'0',monitoring_waiting_input:false,revision_cycle:4};
 const cycle={baseline_at:'2026-10-10T12:00:00Z',latest_snapshot_at:'2026-08-18T00:00:00Z',fresh_cycle_initialized:true,current_revision_published_at:null};
 const queued=[],events=[],queries=[];let scanCalls=0,post,get;
 const states=new Map();
 const pool={async query(sql){queries.push(sql);
  if(sql.startsWith('SELECT id,claims_facts_updated_at FROM tracker_clients'))return {rows:[{id:3}]};
  if(sql.startsWith('SELECT id FROM tracker_clients'))return {rows:[{id:3}]};
  if(sql.startsWith('SELECT * FROM tracker_pages'))return {rows:[page]};
  if(sql.startsWith('SELECT id FROM tracker_pages'))return {rows:[{id:17}]};
  if(sql.includes('FROM tracker_case_studies cs'))return {rows:[cycle]};
  if(sql.includes('FROM tracker_snapshots s JOIN tracker_pages p'))return {rows:[{url:page.url,score:97,checked_at:snapshotAt}]};
  throw Error('Unexpected SQL: '+sql.slice(0,100));
 }};
 const ctx={app:{post(_url,fn){post=fn},get(_url,fn){get=fn}},pool,_trackerCheckStatus:states,
  _sseBroadcast:x=>events.push(JSON.parse(JSON.stringify(x))),setImmediate:fn=>queued.push(fn),
  runTrackerCheck:async()=>{scanCalls++;if(failure)throw Error(failure)},Date,JSON,process:{env:{}},console:{warn(){},error(){},log(){}}};
 vm.runInNewContext(s.slice(g0,g1)+'\n'+s.slice(r0,r1)+'\n'+s.slice(q0,q1),ctx,{timeout:5000});
 const invoke=async fn=>{const res={statusCode:200,status(x){this.statusCode=x;return this},json(x){this.payload=JSON.parse(JSON.stringify(x));return this}};await fn({params:{token:'fixture-token',pageId:'17'}},res);return res;};
 return {post:()=>invoke(post),status:()=>invoke(get),flush:async()=>{for(const fn of queued.splice(0))await fn()},events,queries,queued,states,get scanCalls(){return scanCalls}};
}
test('failed schema check is visible without leaking column details; stale snapshot cannot announce success',async()=>{
 const f=fixture('TRACKER SCAN BLOCKED: database schema is incomplete: tracker_pages.private_column');
 const accepted=await f.post();assert.equal(accepted.statusCode,200);assert.equal(accepted.payload.message,'Check started');
 await f.flush();const st=await f.status();assert.equal(st.payload.running,false);assert.equal(st.payload.failed,true);
 assert.equal(st.payload.error_code,'SCHEMA_NOT_READY');assert.match(st.payload.error,/schema is not ready/i);
 assert(!st.payload.error.includes('private_column'));
 assert.equal(f.events.filter(e=>e.type==='check_done').length,0);
 assert.equal(f.events.filter(e=>e.type==='check_error').length,1);
 const retry=await f.post();assert.equal(retry.statusCode,200);assert.equal(f.queued.length,1);
});
test('first Case Study scan with unverified live HTML shows actionable retry message, never stale success',async()=>{
 const f=fixture('CASE_FIRST_LIVE_NOT_VERIFIED: historical cache is not a current page');
 const accepted=await f.post();assert.equal(accepted.statusCode,200);
 await f.flush();
 const st=await f.status();assert.equal(st.payload.failed,true);
 assert.equal(st.payload.error_code,'LIVE_HTML_NOT_VERIFIED');
 assert.match(st.payload.error,/Current live HTML could not be verified/);
 assert.match(st.payload.error,/Retry/);
 assert.equal(f.events.filter(e=>e.type==='check_done').length,0);
 assert.equal(f.events.filter(e=>e.type==='check_error').length,1);
 const retry=await f.post();assert.equal(retry.statusCode,200);
 assert.equal(f.queued.length,1);
});
test('failed AI/provider scan does not expose secret error text',async()=>{
 const f=fixture('Provider failed; token=secret-example');
 await f.post();await f.flush();const st=await f.status();
 assert.equal(st.payload.failed,true);assert.equal(st.payload.error_code,'SCAN_FAILED');
 assert(!st.payload.error.includes('secret-example'));
 assert.equal(f.events.filter(e=>e.type==='check_done').length,0);
});
test('dashboard immediately stops polling and returns a failed state without opening old Brief',async()=>{
 const poll=s.slice(u0,u1),notes=[],requests=[],done=[];let tick,cleared=false,hidden=0;
 const ctx={Date,setInterval(fn){tick=fn;return 8},clearInterval(){cleared=true},
  api:async url=>{requests.push(url);return {success:true,running:false,failed:true,error:'Scan did not complete',finishedAt:'2026-10-11T01:00:00Z'}},
  toast:(msg,color)=>notes.push(msg),hideScanOverlay(){hidden++},loadPages(){throw Error('stale load not allowed')},openBriefFromPoll(){throw Error('stale brief not allowed')}};
 vm.runInNewContext(poll+'\nglobalThis.startPoll=pollAndShowBrief;',ctx,{timeout:5000});
 ctx.startPoll(17,30,2000,value=>done.push(value),Date.parse('2026-10-11T00:59:58Z'));
 tick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(cleared,true);assert.equal(hidden,1);assert.deepEqual(done,[false]);
 assert.deepEqual(requests,['/check-status/17']);assert.match(notes[0],/Scan did not complete/);
});
test('checkPage propagates failure state to existing scan button',()=>{
 assert.match(s,/pollAndShowBrief\(pageId, 30, 2000, function\(ok\)\{ delete _checkAnimations\[pageId\]; _finishSingleProven\(ok!==false\)/);
});

test('handler that finishes with only a historical snapshot reports NO_NEW_SNAPSHOT, never check_done',async()=>{
 const f=fixture(null);await f.post();await f.flush();const st=await f.status();
 assert.equal(st.payload.failed,true);assert.equal(st.payload.error_code,'NO_NEW_SNAPSHOT');
 assert.equal(f.events.filter(e=>e.type==='check_done').length,0);
 assert.equal(f.events.filter(e=>e.type==='check_error').length,1);
});
test('new snapshot saved by successful handler emits one check_done and no failure',async()=>{
 const f=fixture(null,new Date().toISOString());await f.post();await f.flush();const st=await f.status();
 assert.equal(st.payload.failed,false);assert.equal(st.payload.error,null);
 assert.equal(f.events.filter(e=>e.type==='check_done').length,1);
 assert.equal(f.events.filter(e=>e.type==='check_error').length,0);
});
