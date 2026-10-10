'use strict';
// Exercise the canonical handler in isolation. No production connection, no app boot,
// no outgoing provider calls, and no user data: synthetic v1/v3 legacy records only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const routePath='/api/tracker-client/:token/pages/:pageId/case-study';
const marker="app.get('"+routePath+"',async(req,res)=>{try{";
const guardMarker="async function _trackerCaseStudyReadonlySchema(";
const guardStart=source.indexOf(guardMarker);
const handlerStart=source.indexOf(marker);
const guardEnd=source.indexOf('\napp.get(',guardStart);
const handlerEnd=source.indexOf('\napp.',handlerStart+marker.length);
assert(guardStart>=0&&guardEnd>guardStart&&guardEnd-guardStart<4000,'guard extraction unexpectedly moved');
assert(handlerStart>=0&&handlerEnd>handlerStart&&handlerEnd-handlerStart<8500,'GET route extraction unexpectedly moved');
assert.equal(source.indexOf(marker,handlerStart+1),-1,'Duplicate canonical GET route');
const guard=source.slice(guardStart,guardEnd);
const route=source.slice(handlerStart,handlerEnd);
assert.match(route,/history_protected:true/);
assert.match(route,/SELECT \* FROM tracker_case_studies/);
assert.doesNotMatch(route,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\s+/i);

function fixture(schemaVersion){
 const old=schemaVersion===1;
 const baseline_data={
  schema_version:schemaVersion,
  source:'synthetic_legacy_baseline',
  ai_evidence:{google_aio:{status:'UNVERIFIED',exact_page_cited:false}},
  google_position:null,
  graaf_score:37,
  gsc_clicks:0,
  gsc_impressions:0,
  primary_query:'synthetic query',
  treatment_guardrail:{historical_snapshot:true}
 };
 if(!old)Object.assign(baseline_data,{
  html_source:'synthetic_captured_html',
  html_captured_at:'2026-09-20T10:00:00Z',
  metric_snapshot_at:'2026-09-20T10:00:00Z'
 });
 return {id:old?1:1018,tracker_client_id:4,tracker_page_id:old?2290:2282,
  status:'active',baseline_locked:true,baseline_at:'2026-09-09T10:00:00Z',baseline_data};
}
function harness(cs,{schemaReady=true,tokenFound=true,caseFound=true,throwOnEvidence=false}={}){
 let handler;
 const queries=[];
 const fakePool={async query(sql,args=[]){
  queries.push({sql,args});
  assert.match(sql.trimStart(),/^SELECT\b/i,'GET attempted a DB write');
  if(sql.includes('information_schema.tables'))
   return {rows:schemaReady?args[0].map(table_name=>({table_name})):[]};
  if(sql.includes('information_schema.columns'))
   return {rows:schemaReady?args[1].map(column_name=>({column_name})):[]};
  if(sql.includes('FROM tracker_clients WHERE token=$1'))
   return {rows:tokenFound?[{id:4}]:[]};
  if(sql.includes('FROM tracker_case_studies WHERE tracker_client_id=$1'))
   return {rows:caseFound&&String(args[1])===String(cs.tracker_page_id)?[structuredClone(cs)]:[]};
  if(sql.includes('FROM tracker_case_study_events'))return {rows:[]};
  if(sql.includes('FROM tracker_case_study_content_versions'))return {rows:[]};
  if(sql.includes('FROM tracker_snapshots'))return {rows:[]};
  if(sql.includes('FROM tracker_ai_evidence')){
   if(throwOnEvidence)throw new Error('AI evidence store unreachable');
   return {rows:[]};
  }
  throw Error('Unexpected DB request: '+sql.slice(0,125));
 }};
 const app={get(p,fn){assert.equal(p,routePath);handler=fn;}};
 const logger={error(){}};
 const context={pool:fakePool,app,console:logger,Set};
 vm.runInNewContext(guard+'\n'+route,context,{timeout:1500});
 assert.equal(typeof handler,'function');
 async function call({token='owner',pageId=cs.tracker_page_id}={}){
  const res={statusCode:200,data:null,
   status(n){this.statusCode=n;return this;},
   json(body){this.data=JSON.parse(JSON.stringify(body));return this;}
  };
  await handler({params:{token,pageId}},res);
  return res;
 }
 return {call,queries,cs};
}

test('legacy v1 baseline stays byte-for-byte equivalent at JSON level; absent HTML is not recreated',async()=>{
 const cs=fixture(1),before=JSON.stringify(cs.baseline_data),h=harness(cs);
 const r=await h.call();
 assert.equal(r.statusCode,200);
 assert.equal(r.data.success,true);
 assert.equal(r.data.history_protected,true);
 assert.deepEqual(r.data.case_study.baseline_data,cs.baseline_data);
 assert.equal(JSON.stringify(cs.baseline_data),before);
 assert.equal(Object.hasOwn(r.data.case_study.baseline_data,'html_source'),false);
 assert.equal(Object.hasOwn(r.data.case_study.baseline_data,'html_captured_at'),false);
 assert.equal(Object.hasOwn(r.data.case_study.baseline_data,'metric_snapshot_at'),false);
 assert.equal(r.data.case_study.baseline_data.ai_evidence.google_aio.exact_page_cited,false);
 assert.ok(h.queries.length>=6);
 for(const q of h.queries)assert.match(q.sql.trimStart(),/^SELECT\b/i);
});
test('v3 baseline remains intact and in-memory reading does not redate it',async()=>{
 const cs=fixture(3),before=JSON.stringify(cs),h=harness(cs);
 const r=await h.call();
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.data.case_study,cs);
 assert.equal(JSON.stringify(cs),before);
 assert.equal(r.data.case_study.baseline_data.html_captured_at,'2026-09-20T10:00:00Z');
});
test('schema missing returns controlled 503 without fetching or repairing case studies',async()=>{
 const h=harness(fixture(1),{schemaReady:false});
 const r=await h.call();
 assert.equal(r.statusCode,503);
 assert.equal(r.data.schema_ready,false);
 assert.equal(h.queries.filter(q=>q.sql.includes('tracker_case_studies WHERE')).length,0);
});
test('wrong owner token and unrelated page cannot access a legacy baseline',async()=>{
 const denied=harness(fixture(1),{tokenFound:false});
 assert.equal((await denied.call()).statusCode,404);
 const foreign=harness(fixture(1));
 assert.equal((await foreign.call({pageId:123456})).statusCode,404);
});
test('AI-evidence query fallback remains read-only; never patches legacy snapshot',async()=>{
 const h=harness(fixture(1),{throwOnEvidence:true});
 const r=await h.call();
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.data.ai_evidence,[]);
 assert.equal(r.data.case_study.baseline_data.schema_version,1);
});
