'use strict';
// The actual scanner writes to disposable PostgreSQL; all network, email and AI are mocked.
// The test refuses Neon and runs every statement inside a rolled-back transaction.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('complete Case Study POST dispatches real scanner to PostgreSQL once and then locks duplicates',async()=>{
 const uri=process.env.TRACKER_TEST_DATABASE_URL;
 if(process.env.CI!=='true'||uri!=='postgres://test:test@127.0.0.1:5432/testdb')
  throw Error('REFUSED: disposable PostgreSQL test database only');
 const {Client}=require(process.env.TRACKER_PG_MODULE_PATH||'pg');
 const db=new Client({connectionString:uri});
 await db.connect();
 try{
  await db.query('BEGIN');
  await db.query('CREATE TEMP TABLE tracker_pages(id integer primary key,url text,tracker_client_id integer,html_content text,html_source text,check_frequency text,last_checked_at timestamptz,next_check_at timestamptz,redirects_to text,redirect_checked_at timestamptz,last_page_hash text,last_graaf_score integer,fetch_reliable boolean,treatment text,treatment_source text,treatment_updated_at timestamptz,brief_content jsonb,brief_started_at timestamptz,brief_evaluated_at timestamptz,brief_status text,brief_claimed_by text,brief_claimed_at timestamptz,brief_check_count integer,implementation_status text,gsc_impressions integer,gsc_clicks integer,gsc_position numeric,manual_done boolean,revision_cycle integer,monitoring_waiting_input boolean,brief_published_at timestamptz,brief_published_confirmed_at timestamptz,implementation_verified_at timestamptz,keyword text,gsc_keyword text) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE tracker_ai_evidence(id serial,page_id integer,engine text,evidence_method text,verified_at timestamptz,updated_at timestamptz,created_at timestamptz,is_cleared boolean,revision_cycle integer,exact_page_cited boolean,domain_cited boolean,brand_recommended boolean,brand_direct_supported boolean) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE tracker_clients(id integer primary key,token text,status text,claims_facts_updated_at timestamptz,domain text,live_wall_enabled boolean) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE tracker_case_studies(id integer primary key,tracker_client_id integer,tracker_page_id integer,status text,baseline_at timestamptz,baseline_locked boolean) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE tracker_case_study_events(case_study_id integer,event_type text) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE tracker_case_study_content_versions(case_study_id integer,version_type text,captured_at timestamptz) ON COMMIT DROP');
  const source=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
  const a=source.indexOf('async function runTrackerCheck('),b=source.indexOf('\n// ── Custom news management',a);
  assert(a>0&&b>a&&b-a<350000,'Scanner source unexpectedly moved');
  const scanner=source.slice(a,b);
  assert.doesNotMatch(scanner,/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i);
  assert.doesNotMatch(scanner,/_trackerEnsureAiEvidenceSchema\s*\(/);
  const match=scanner.match(/INSERT INTO tracker_snapshots\s*\(([^]*?)\)\s*VALUES\s*\(/);
  assert(match,'Canonical snapshot INSERT moved');
  const names=match[1].split(',').map(x=>x.trim()).filter(Boolean);
  assert(names.length>=30&&names.length<=42);
  const bool=new Set(['ai_google_overview_found','ai_google_overview_cited','ai_perplexity_found','ai_perplexity_cited','ai_bing_found','ai_bing_cited','ai_brave_found','ai_brave_cited','content_changed']);
  const json=new Set(['recommendations','gsc_brief','source_suggestions','author_trust_findings','discovered_sources','google_competitors','ai_perplexity_competitors','graaf_breakdown','graaf_recommendations','content_diff','ai_google_overview_references']);
  const ints=new Set(['page_id','score','author_trust_score']);
  const types=names.map(name=>{
   if(!/^[a-z_]+$/.test(name))throw Error('Unsafe snapshot column name');
   const type=bool.has(name)?'boolean':json.has(name)?'jsonb':ints.has(name)?'integer':name==='google_position'?'numeric':name==='checked_at'?'timestamptz':name==='methodology_updated_at'?'date':'text';
   return '"'+name+'" '+type;
  });
  await db.query('CREATE TEMP TABLE tracker_snapshots(id serial primary key,'+types.join(',')+') ON COMMIT DROP');
  const html='<html><body>'+('<p>Isolated historical HTML content with real paragraphs. </p>'.repeat(25))+'</body></html>';
  await db.query("INSERT INTO tracker_pages(id,url,tracker_client_id,html_content,html_source,check_frequency,gsc_impressions,gsc_clicks,gsc_position,last_checked_at,next_check_at) VALUES(17,'https://fixtures.invalid/page',3,$1,'manual','0',123,5,14,'2026-08-18T12:00:00Z',NULL)",[html]);
  await db.query("UPDATE tracker_pages SET manual_done=TRUE,revision_cycle=4,monitoring_waiting_input=FALSE,brief_content=$1::jsonb,brief_evaluated_at='2026-08-18T12:00:00Z' WHERE id=17",[JSON.stringify({outstanding_actions:2,cycle_id:'historical'})]);
  await db.query("INSERT INTO tracker_clients(id,token,status,domain,live_wall_enabled) VALUES(3,'fixture-owner','active','fixtures.invalid',false)");
  await db.query("INSERT INTO tracker_case_studies VALUES(21,3,17,'active','2026-10-10T12:00:00Z',TRUE)");
  await db.query("INSERT INTO tracker_case_study_events VALUES(21,'case_study_fresh_cycle_initialized')");
  await db.query("INSERT INTO tracker_snapshots(page_id,checked_at) VALUES(17,'2026-08-18T12:00:00Z')");
  const fetches=[],steps=[];let mails=0,intervals=0;
  const pool={async query(sql,args=[]){
    const s=String(sql).trim();
    if(/^\s*(ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i.test(s))throw Error('Scanner DDL is forbidden');
    if(s.includes('FROM information_schema.columns'))
     return db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema LIKE 'pg_temp%' AND table_name IN ('tracker_pages','tracker_snapshots','tracker_ai_evidence') AND column_name=ANY($1::text[])",args);
    if(/^INSERT INTO tracker_snapshots\b/.test(s)||/^UPDATE tracker_pages\b/.test(s)||/^SELECT\b[^]*\bFROM tracker_snapshots\b/.test(s)||/^SELECT\b[^]*\bFROM tracker_pages\b/.test(s))
     return db.query(s,args);
    if(/^SELECT\b[^]*\bFROM tracker_clients\b/.test(s)||/^SELECT\b[^]*\bFROM tracker_case_studies\b/.test(s))
     return db.query(s,args);
    if(/^SELECT\b/.test(s))return {rows:[]};
    throw Error('Unexpected scanner write: '+s.slice(0,180));
  }};
  const ctx={pool,Date,JSON,Buffer,Promise,URL,URLSearchParams,AbortSignal,require,
   process:{env:{CS_DEPLOYMENT_TIER:'staging'}},console:{log(){},warn(){},error(){}},
   setTimeout(){return 0},clearTimeout(){},setInterval(){intervals++;throw Error('Scheduler forbidden')},
   fetch:async url=>{fetches.push(String(url));if(String(url)!=='https://fixtures.invalid/page')throw Error('External network forbidden');return {ok:true,status:200,url:String(url),text:async()=>html};},
   _trSetStep:(...x)=>steps.push(x),
   _canonicalContentScoreScan:async()=>({success:true,score:71,metrics:{accuracy:70},recommendations:[]}),
   _cacheGet:()=>null,_cacheSet:()=>{},_sseBroadcast:()=>{},_liveWallBroadcast:()=>{},
   discoverSourcesForClaims:async()=>[],notifyClient:async()=>{mails++;throw Error('Email forbidden')},
   _trackerBuildFiveEngineEmailState:()=>[],_trackerFiveEngineEmailBlock:()=>'',authorTrustAnalyzeHtml:()=>({score:65,findings:[]}),
   CONTENTSCORE_SCANNER_VERSION:'synthetic-ci',CONTENTSCORE_SCORING_VERSION:'synthetic-ci',CONTENTSCORE_METHODOLOGY_UPDATED_AT:'2026-01-01',
   CONTENTSCALE_BUILD_ID:'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN'
  };
  vm.runInNewContext(scanner+'\nglobalThis.scan=runTrackerCheck;',ctx,{timeout:10000});
  // Actual client POST dispatches exactly one scanner run, then becomes locked after a fresh snapshot.
  const g0=source.indexOf('function _trackerNormalScanGate(');
  const g1=source.indexOf('\n// POST /api/tracker-client/:token/scan-all',g0);
  const r0=source.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
  const r1=source.indexOf('\n// Exact client-side scan status',r0);
  assert(g0>0&&g1>g0&&r0>0&&r1>r0&&r1-r0<22000,'Canonical first scan route changed');
  let handler;const queued=[],lock=new Map();
  const routeContext={app:{post(_path,fn){handler=fn}},pool,
    _trackerCheckStatus:lock,_sseBroadcast:()=>{},setImmediate:fn=>queued.push(fn),
    runTrackerCheck:(pg,...args)=>ctx.scan(pg,...args),
    Date,JSON,process:{env:{CS_DEPLOYMENT_TIER:'staging'}},console:{log(){},warn(){},error(){}}
  };
  vm.runInNewContext(source.slice(g0,g1)+'\n'+source.slice(r0,r1),routeContext,{timeout:10000});
  async function callRoute(){
    const res={code:200,status(v){this.code=v;return this},json(v){this.data=JSON.parse(JSON.stringify(v));return this}};
    await handler({params:{token:'fixture-owner',pageId:'17'}},res);
    return res;
  }
  const first=await callRoute();
  assert.equal(first.code,200,'First Case Study manual scan should be accepted');
  assert.equal(first.data.message,'Check started');
  assert.equal(queued.length,1,'One scanner job must be queued');
  await queued.shift()();

  const snapshots=(await db.query("SELECT page_id,score,scanner_version FROM tracker_snapshots WHERE scanner_version='synthetic-ci'")).rows;
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].page_id,17);
  assert.equal(snapshots[0].score,71);assert.equal(snapshots[0].scanner_version,'synthetic-ci');
  const row=(await db.query('SELECT check_frequency,next_check_at,gsc_impressions,gsc_clicks,gsc_position,html_content,last_checked_at FROM tracker_pages WHERE id=17')).rows[0];
  assert.equal(row.check_frequency,'0');assert.equal(row.next_check_at,null);
  assert.equal(row.gsc_impressions,123);assert.equal(row.gsc_clicks,5);assert.equal(Number(row.gsc_position),14);
  assert.equal(row.html_content,html);
  assert(new Date(row.last_checked_at).getTime()>new Date('2026-08-18').getTime());
  assert.deepEqual(fetches,['https://fixtures.invalid/page']);
  assert.equal(mails,0);assert.equal(intervals,0);
  assert(steps.some(x=>x[1]==='save'&&x[2]==='done'));
  const second=await callRoute();
  assert.equal(second.code,409,'A snapshot after locked baseline must block duplicate manual scan');
  assert.equal(second.data.scan_locked,true);
  assert.equal(queued.length,0,'Blocked duplicate must not queue another scan');

  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
 finally{await db.end()}
});
