'use strict';
// Real SQL + canonical route, against GitHub Actions' disposable postgres only.
// Never import the main server, connect to Neon or invoke the scanner.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('first Case Study scan uses real PostgreSQL evidence and publication state',async()=>{
 const conn=process.env.TRACKER_TEST_DATABASE_URL;
 if(process.env.CI!=='true'||!/^postgres(?:ql)?:\/\/test:test@127\.0\.0\.1:5432\/testdb$/.test(conn||''))
   throw Error('Refusing non-disposable PostgreSQL');
 const {Client}=require(process.env.TRACKER_PG_MODULE_PATH);
 const db=new Client({connectionString:conn});
 await db.connect();
 try{
  await db.query('BEGIN');
  const ddl=[
   "CREATE TEMP TABLE tracker_clients(id int primary key,token text,status text,claims_facts_updated_at timestamptz) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_pages(id int primary key,tracker_client_id int,url text,manual_done boolean,brief_content jsonb,brief_evaluated_at timestamptz,check_frequency text,monitoring_waiting_input boolean,revision_cycle int,brief_published_at timestamptz,brief_published_confirmed_at timestamptz,implementation_verified_at timestamptz) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_case_studies(id int primary key,tracker_client_id int,tracker_page_id int,status text,baseline_locked boolean,baseline_at timestamptz) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_case_study_events(case_study_id int,event_type text) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_snapshots(page_id int,checked_at timestamptz) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_case_study_content_versions(case_study_id int,version_type text,captured_at timestamptz) ON COMMIT DROP",
   "CREATE TEMP TABLE tracker_ai_evidence(page_id int,tracker_client_id int,engine text,verified_at timestamptz) ON COMMIT DROP"
  ];for(const sql of ddl)await db.query(sql);
  await db.query("INSERT INTO tracker_clients(id,token,status) VALUES(3,'fixture-owner','active')");
  await db.query("INSERT INTO tracker_pages(id,tracker_client_id,url,manual_done,brief_content,brief_evaluated_at,check_frequency,monitoring_waiting_input,revision_cycle) VALUES(17,3,'https://fixture.invalid/page',true,'{\"outstanding_actions\":2}','2026-08-18','0',false,4)");
  await db.query("INSERT INTO tracker_case_studies VALUES(21,3,17,'active',true,'2026-10-10T12:00:00Z')");
  await db.query("INSERT INTO tracker_case_study_events VALUES(21,'case_study_fresh_cycle_initialized')");
  await db.query("INSERT INTO tracker_snapshots VALUES(17,'2026-08-18T00:00:00Z')");
  // Configured AI engines are not the same as completed AI evidence checks.
  await db.query("INSERT INTO tracker_ai_evidence(page_id,tracker_client_id,engine) SELECT 17,3,unnest(ARRAY['google_aio','chatgpt','perplexity','claude','copilot'])");
  const engineState=await db.query("SELECT COUNT(DISTINCT engine)::int AS configured,COUNT(verified_at)::int AS checked FROM tracker_ai_evidence WHERE page_id=17");
  assert.equal(engineState.rows[0].configured,5);
  assert.equal(engineState.rows[0].checked,0);
  const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
  const g0=src.indexOf('function _trackerNormalScanGate('),g1=src.indexOf('\n// POST /api/tracker-client/:token/scan-all',g0);
  const r0=src.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {"),r1=src.indexOf('\n// Exact client-side scan status',r0);
  assert(g0>0&&g1>g0&&r0>0&&r1>r0&&r1-r0<22000,'unexpected route boundary');
  async function call(){
   let handler,scheduled=0;
   const pool={query(sql,args){if(/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(sql))throw Error('Canonical handler unexpectedly wrote data');return db.query(sql,args)}};
   const sandbox={
    app:{post(_route,fn){handler=fn}},pool,_ensureMonitoringGateSchema:async()=>{},
    _trackerCheckStatus:new Map(),_sseBroadcast:()=>{},setImmediate(){scheduled++},
    runTrackerCheck(){throw Error('Scanner must not run in isolated PostgreSQL fixture')},
    Date,JSON,process:{env:{}},console:{warn:()=>{},log:()=>{},error:()=>{}}
   };
   vm.runInNewContext(src.slice(g0,g1)+'\n'+src.slice(r0,r1),sandbox,{timeout:5000});
   const res={statusCode:200,status(n){this.statusCode=n;return this},json(o){this.result=JSON.parse(JSON.stringify(o));return this}};
   await handler({params:{token:'fixture-owner',pageId:'17'}},res);
   return {code:res.statusCode,data:res.result,scheduled};
  }
  const initial=await call();assert.equal(initial.code,200);assert.equal(initial.data.message,'Check started');assert.equal(initial.scheduled,1);
  // A freshly activated Case Study can have zero historical Tracker snapshots.
  await db.query('DELETE FROM tracker_snapshots');
  const firstWithoutSnapshot=await call();
  assert.equal(firstWithoutSnapshot.code,200);
  assert.equal(firstWithoutSnapshot.data.message,'Check started');
  assert.equal(firstWithoutSnapshot.scheduled,1);
  await db.query("INSERT INTO tracker_snapshots VALUES(17,'2026-08-18T00:00:00Z')");
  await db.query("INSERT INTO tracker_snapshots VALUES(17,'2026-10-10T12:10:00Z')");
  const repeated=await call();assert.equal(repeated.code,409);assert.equal(repeated.scheduled,0);
  await db.query("DELETE FROM tracker_snapshots WHERE checked_at>'2026-10-10T12:00:00Z'");
  await db.query("INSERT INTO tracker_case_study_content_versions VALUES(21,'published_implementation_r4','2026-10-10T12:05:00Z')");
  const published=await call();assert.equal(published.code,409);assert.equal(published.scheduled,0);
  await db.query("DELETE FROM tracker_case_study_content_versions");
  await db.query("UPDATE tracker_pages SET brief_published_confirmed_at='2026-10-10T12:05:00Z' WHERE id=17");
  const confirmed=await call();assert.equal(confirmed.code,409);assert.equal(confirmed.scheduled,0);
  await db.query("UPDATE tracker_pages SET brief_published_confirmed_at=NULL WHERE id=17");
  await db.query("DELETE FROM tracker_case_study_events");
  const missingMarker=await call();assert.equal(missingMarker.code,409);assert.equal(missingMarker.scheduled,0);
  // All active Case Studies are per-page manual-only, including unfinished fresh cycles.
  const eligibleSql=`SELECT p.id FROM tracker_pages p WHERE
    NOT EXISTS (
      SELECT 1 FROM tracker_case_studies cs
      WHERE cs.tracker_page_id=p.id AND cs.tracker_client_id=p.tracker_client_id AND cs.status='active'
    ) ORDER BY p.id`;
  const excluded=await db.query(eligibleSql);
  assert.equal(excluded.rows.some(row=>row.id===17),false,'Completed active case leaked into bulk scan');
  await db.query('UPDATE tracker_pages SET manual_done=FALSE WHERE id=17');
  const excludedFresh=await db.query(eligibleSql);
  assert.equal(excludedFresh.rows.some(row=>row.id===17),false,'Unfinished active Case Study leaked into bulk scan');
  await db.query("UPDATE tracker_case_studies SET status='completed' WHERE id=21");
  const eligible=await db.query(eligibleSql);
  assert.equal(eligible.rows.some(row=>row.id===17),true,'Unfinished ordinary Tracker page unexpectedly excluded');
  await db.query("UPDATE tracker_case_studies SET status='active' WHERE id=21");
  await db.query('UPDATE tracker_pages SET manual_done=TRUE WHERE id=17');
  const before=await db.query("SELECT check_frequency,manual_done FROM tracker_pages WHERE id=17");
  assert.equal(before.rows[0].check_frequency,'0');assert.equal(before.rows[0].manual_done,true);
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
 finally{await db.end()}
});