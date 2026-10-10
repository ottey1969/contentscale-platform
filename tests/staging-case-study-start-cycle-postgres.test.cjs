'use strict';
// Exercises canonical Case Study cycle initialization on disposable PostgreSQL.
// No app boot, no API keys, no emails, no actual websites.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('starting Case Study preserves historical proof and opens a fresh manual scan cycle',async()=>{
 const uri=process.env.TRACKER_TEST_DATABASE_URL;
 if(process.env.CI!=='true'||uri!=='postgres://test:test@127.0.0.1:5432/testdb')
  throw Error('Refusing non-disposable database for Case Study start test');
 const {Client}=require(process.env.TRACKER_PG_MODULE_PATH);
 const db=new Client({connectionString:uri});
 await db.connect();
 try{
  await db.query('BEGIN');
  await db.query("CREATE TEMP TABLE tracker_pages(id integer primary key,tracker_client_id integer,url text,revision_cycle integer,is_done boolean,manual_done boolean,manual_done_at timestamptz,implementation_status text,implementation_at timestamptz,implementation_verified_at timestamptz,implementation_verified_brief_cycle_id text,implementation_before_graaf float,needs_html boolean,html_pasted_at timestamptz,brief_content jsonb,ranking_brief jsonb,brief_started_at timestamptz,brief_evaluated_at timestamptz,brief_viewed_at timestamptz,brief_check_count integer,brief_done_at timestamptz,brief_status text,treatment text,treatment_target_url text,treatment_updated_at timestamptz,treatment_source text,check_frequency text) ON COMMIT DROP");
  await db.query("CREATE TEMP TABLE tracker_case_study_events(id serial,case_study_id integer,tracker_page_id integer,event_type text,source text,event_at timestamptz default now(),event_data jsonb,content_hash text) ON COMMIT DROP");
  await db.query("CREATE TEMP TABLE tracker_case_study_content_versions(case_study_id integer,version_type text,captured_at timestamptz,content_hash text) ON COMMIT DROP");
  await db.query("CREATE TEMP TABLE tracker_snapshots(page_id integer,checked_at timestamptz) ON COMMIT DROP");
  await db.query("INSERT INTO tracker_pages(id,tracker_client_id,url,revision_cycle,is_done,manual_done,implementation_verified_at,brief_content,brief_evaluated_at,check_frequency) VALUES(17,3,'https://fixture.invalid/legacy',3,true,true,'2026-08-18T12:00:00Z','{\"outstanding_actions\":2,\"cycle_id\":\"historical\"}','2026-08-18T00:00:00Z','0')");
  await db.query("INSERT INTO tracker_snapshots VALUES(17,'2026-08-18T00:00:00Z')");
  const source=fs.readFileSync(process.env.CS_CASE_TEST_INDEX_FILE||path.resolve(__dirname,'../src/index.js'),'utf8');
  const a=source.indexOf('async function _caseStudyOpenFreshStartCycle('),b=source.indexOf('\n// v229: case-study URL pre-flight',a);
  assert(a>0&&b>a&&b-a<11000,'canonical Case Study start function changed');
  const pool={query:(sql,args)=>db.query(sql,args)};
  let checkpointCalls=0;
  const ctx={Date,JSON,pool,console:{warn:()=>{},error:()=>{},log:()=>{}},
   async _caseStudyStoreContentVersion(_clientId,_pageId,versionType){
    checkpointCalls++;
    await db.query("INSERT INTO tracker_case_study_content_versions VALUES(21,$1,'2026-10-10T12:00:00Z','synthetic-hash')",[versionType]);
    return {id:50,content_hash:'synthetic-hash'};
   }
  };
  vm.runInNewContext(source.slice(a,b)+'\nglobalThis.openCycle=_caseStudyOpenFreshStartCycle;',ctx,{timeout:5000});
  const original=(await db.query('SELECT * FROM tracker_pages WHERE id=17')).rows[0];
  const cs={id:21,tracker_page_id:17,status:'active',baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'};
  const result=await ctx.openCycle(3,original,cs,'<html>'+('source truth '.repeat(70))+'</html>','verified_html','synthetic_case_start');
  assert.equal(result.revision_cycle,4);assert.equal(checkpointCalls,1);
  const updated=(await db.query('SELECT * FROM tracker_pages WHERE id=17')).rows[0];
  assert.equal(updated.revision_cycle,4);assert.equal(updated.manual_done,false);assert.equal(updated.is_done,false);
  assert.equal(updated.brief_content,null);assert.equal(updated.check_frequency,'0');
  const event=(await db.query("SELECT event_data FROM tracker_case_study_events WHERE case_study_id=21 AND event_type='case_study_fresh_cycle_initialized'")).rows[0];
  assert(event,'fresh-cycle event missing');
  assert.equal(event.event_data.previous_manual_done,true);
  assert.equal(event.event_data.previous_revision_cycle,3);
  assert.equal(event.event_data.history_preserved,true);
  const oldSnap=await db.query("SELECT count(*)::int AS n FROM tracker_snapshots WHERE page_id=17 AND checked_at<'2026-10-10T12:00:00Z'");
  assert.equal(oldSnap.rows[0].n,1);
  const checkpoint=await db.query("SELECT version_type FROM tracker_case_study_content_versions WHERE case_study_id=21");
  assert.equal(checkpoint.rows[0].version_type,'pre_publication_r4');
  const again=await ctx.openCycle(3,updated,cs,'<html>unchanged</html>','verified_html','reload');
  assert.equal(again.already_initialized,true);assert.equal(checkpointCalls,1);
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{await db.end()}
});