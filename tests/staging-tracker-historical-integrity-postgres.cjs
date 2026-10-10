'use strict';
// Real read-only historical audit over disposable CI PostgreSQL (never Neon).
const assert=require('node:assert/strict');
const {Pool}=require(process.env.TRACKER_PG_MODULE_PATH);
const {inspectHistoricalIntegrity}=require('../src/staging/tracker-historical-integrity.cjs');
async function run(){
 assert.equal(process.env.CI,'true','CI only');
 assert.equal(process.env.DATABASE_URL,undefined,'Application database URL forbidden');
 const u=new URL(process.env.TRACKER_TEST_DATABASE_URL);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/testdb');assert.equal(u.username,'test');
 const db=new Pool({connectionString:u.toString(),max:2,connectionTimeoutMillis:5000});
 try{
  await db.query([
   'CREATE TABLE public.tracker_clients(id bigint PRIMARY KEY,token text)',
   'CREATE TABLE public.tracker_pages(id bigint PRIMARY KEY,tracker_client_id bigint,manual_done boolean,manual_done_at timestamptz,implementation_verified_at timestamptz)',
   'CREATE TABLE public.tracker_case_studies(id bigint PRIMARY KEY,tracker_client_id bigint,tracker_page_id bigint,baseline_at timestamptz)'
  ].join(';'));
  const empty=await inspectHistoricalIntegrity(db);
  assert.equal(empty.review_status,'historical_data_not_exercised');
  assert.equal(empty.case_studies,0);
  assert.equal(empty.historical_repair_behavior_verified,false);
  await db.query("INSERT INTO public.tracker_clients VALUES (1,'one'),(2,'two')");
  await db.query("INSERT INTO public.tracker_pages VALUES (10,1,true,NULL,'2026-01-01'),(11,2,false,'2026-01-01',NULL)");
  await db.query("INSERT INTO public.tracker_case_studies VALUES (101,1,10,'2026-02-01'),(102,1,11,'2026-01-01'),(103,999,999,'2026-03-01')");
  const before=await db.query("SELECT (SELECT COUNT(*) FROM tracker_case_studies)::int AS cases,(SELECT COUNT(*) FROM tracker_pages)::int AS pages");
  const result=await inspectHistoricalIntegrity(db);
  assert.equal(result.review_status,'manual_historical_review_required');
  assert.equal(result.case_studies,3);
  assert.equal(result.pages,2);
  assert.equal(result.suspicious_relationships,3); // orphan client+page, plus owner mismatch
  assert.equal(result.early_verifications,1);
  assert.equal(result.manual_timestamp_mismatches,2);
  assert.equal(result.repairs_performed,false);assert.equal(result.writes_performed,false);
  assert.equal(result.historical_repair_behavior_verified,false);
  const after=await db.query("SELECT (SELECT COUNT(*) FROM tracker_case_studies)::int AS cases,(SELECT COUNT(*) FROM tracker_pages)::int AS pages");
  assert.deepEqual(after.rows,before.rows,'Audit changed historic fixture');
  console.log(JSON.stringify({test:'historical_tracker_integrity_pg',result:'verified',cases:result.case_studies,review_status:result.review_status,relationship_alerts:result.suspicious_relationships,early_verifications:result.early_verifications,timestamp_alerts:result.manual_timestamp_mismatches,repair_actions:0,live_database_connections:0}));
 }finally{await db.end()}
}
run().catch(e=>{console.error('[STAGING LEGACY AUDIT] FAILED',e.stack||e.message);process.exitCode=1});
