'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(process.env.CASE_CANDIDATE||'/tmp/contentscale-case-reads.js','utf8');
const first=s.indexOf('async function _trackerCaseStudyReadonlySchema(');
const last=s.indexOf("\napp.get('/api/tracker-client/:token/pages/:pageId/case-study'",first);
assert(first>=0&&last>first&&last-first<2600);
const helper=s.slice(first,last);
const routes=["app.get('/api/tracker-client/:token/pages/:pageId/case-study'","app.get('/case-study-report/:reportToken'","app.get('/api/admin/tracker-clients/:id/monitoring'","app.get('/api/admin/tracker-readiness'"];
function instantiate(pool){const ctx={pool,Set};vm.runInNewContext(helper+';globalThis.auditGuard=_trackerCaseStudyReadonlySchema;',ctx);return ctx.auditGuard;}
test('schema guard checks tables and columns only with SELECT',async()=>{
 const calls=[];
 const guard=instantiate({async query(sql,args){
  calls.push(sql);assert.match(sql,/^SELECT /);
  return sql.includes('information_schema.tables')?{rows:args[0].map(table_name=>({table_name}))}:{rows:args[1].map(column_name=>({column_name}))};
 }});
 const r=await guard({tables:['tracker_case_studies'],pageColumns:['monitoring_waiting_input'],caseColumns:['report_token']});
 assert.equal(r.ready,true);assert.equal(calls.length,3);
});
test('missing schema fails closed with explicit affected columns and tables',async()=>{
 const guard=instantiate({async query(){return {rows:[]};}});
 const r=await guard({tables:['tracker_case_studies'],pageColumns:['monitoring_waiting_input'],caseColumns:['report_token']});
 assert.equal(r.ready,false);assert.deepEqual(Array.from(r.missing_tables),['tracker_case_studies']);assert.equal(r.missing_columns.length,2);
});
test('four GET routes use only metadata guard for missing-schema checks',()=>{
 for(const marker of routes){
  const from=s.indexOf(marker),to=s.indexOf('\napp.',from+marker.length);
  assert(from>=0);const body=s.slice(from,to>from?to:from+5500);
  assert.match(body,/_trackerCaseStudyReadonlySchema/);
  assert.doesNotMatch(body,/await _ensureCaseStudySchema\(|await _ensureMonitoringGateSchema\(|await _trackerEnsureAiEvidenceSchema\(/);
 }
});
test('historical Perfect Roofing Team baseline not auto-inserted',()=>{
 assert.match(s,/async function _ensurePerfectRoofingCaseStudy/);
 assert.doesNotMatch(s,/await _ensurePerfectRoofingCaseStudy\(/);
});
test('metadata lookup failures propagate without hidden writes',async()=>{
 const calls=[];const guard=instantiate({async query(sql){calls.push(sql);throw Error('simulated error');}});
 await assert.rejects(guard({tables:['tracker_case_studies']}),/simulated error/);
 assert.equal(calls.length,1);assert.match(calls[0],/^SELECT /);
});
