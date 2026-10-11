'use strict';
// Writable integration of the ACTUAL canonical Case Study start route.
// Runs exclusively against GitHub Actions disposable local PostgreSQL.
// No external page fetch, email or customer DB. All writes ROLLBACK.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Client}=require('pg');
const dbUrl='postgres://test:test@127.0.0.1:5432/testdb';
if(process.env.CI!=='true'||process.env.DATABASE_URL!==dbUrl||process.env.NODE_ENV!=='test')
 throw Error('Refusing writable Case Study test outside exact disposable CI database');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const a=source.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/start'");
const b=source.indexOf('// POST /pages/:pageId/baseline-gsc',a);
assert(a>0&&b>a&&b-a<18000,'Case Study canonical start handler moved');
const route=source.slice(a,b);
const html='<html><body>'+('Verified roof repair service description. '.repeat(40))+'</body></html>';
const client=new Client({connectionString:dbUrl});
async function run(){
 await client.connect();
 await client.query('BEGIN');
 try{

  // Prospect-to-Tracker handoff uses the same disposable transaction as Case Study.
  // A TEMP table shadows only this connection; it never mutates production schema.
  await client.query(`CREATE TEMP TABLE prospect_quick_scans (
    token text PRIMARY KEY,revoked_at timestamptz,url text,ceo_report_url text,
    ceo_report_page_url text,status text,scan_completed_at timestamptz,
    audit20_interested boolean DEFAULT FALSE,audit20_interested_at timestamptz,
    audit20_interest_note text,follow_up_status text,updated_at timestamptz,
    business_name text,domain text,language text,contact_email_origin text,
    visitor_email text,audit20_status text,audit20_ready_at timestamptz,
    audit20_report_url text,audit20_ready_email_sent_at timestamptz,
    tracker_interested boolean DEFAULT FALSE,tracker_interested_at timestamptz
  )`);
  await client.query("INSERT INTO prospect_quick_scans(token,url,status,domain,business_name,language,ceo_report_url,ceo_report_page_url) VALUES('prospect-e2e-synthetic','https://synthetic.example/roof-repair','pending','synthetic.example','Synthetic Service','en','https://example.org/ceo','https://synthetic.example/roof-repair')");
  const prospectA=source.indexOf("app.post('/api/prospect-quick-scan/:token/audit20-interest'");
  const prospectB=source.indexOf("app.post('/api/prospect-quick-scan/admin/:token/two-page-overview'",prospectA);
  const auditReadyA=source.indexOf("app.post('/api/prospect-quick-scan/admin/:token/audit20-ready'");
  const trackerInterestA=source.indexOf("app.post('/api/prospect-quick-scan/:token/tracker-interest'");
  assert(prospectA>0&&prospectB>prospectA&&prospectB-prospectA<6500&&auditReadyA>0&&trackerInterestA>0,'Canonical sales transition boundaries changed');
  const handlers={};let auditEmails=0;const ownerEvents=[];
  const salesContext={
    app:{post(route,...args){handlers[route]=args[args.length-1]}},
    pool:client,Date,String,Number,JSON,console,process:{env:{}},
    requireAdmin:()=>{},_ensureProspectQuickScanTable:async()=>true,
    _pqsLang3:()=> 'en',_pqsValidEmail:()=>false,
    _pqsNotifyOwner:async(_r,kind)=>{ownerEvents.push(kind)},
    _pqsSendLocalized:async()=>{auditEmails++;return {sent:true}},
  };
  vm.runInNewContext(source.slice(prospectA,prospectB),salesContext,{timeout:4000});
  vm.runInNewContext(source.slice(auditReadyA,source.indexOf('\\n',auditReadyA)),salesContext,{timeout:4000});
  vm.runInNewContext(source.slice(trackerInterestA,source.indexOf('\\n',trackerInterestA)),salesContext,{timeout:4000});
  async function sales(route,body={}){
    const res={statusCode:200,status(n){this.statusCode=n;return this},json(x){this.body=JSON.parse(JSON.stringify(x));return x}};
    await handlers[route]({params:{token:'prospect-e2e-synthetic'},body},res);
    return res;
  }
  const interestRoute='/api/prospect-quick-scan/:token/audit20-interest';
  const readyRoute='/api/prospect-quick-scan/admin/:token/audit20-ready';
  const trackerRoute='/api/prospect-quick-scan/:token/tracker-interest';
  const blocked=await sales(interestRoute);
  assert.equal(blocked.statusCode,409,'Audit20 cannot begin before completed QuickScan');
  await client.query("UPDATE prospect_quick_scans SET status='completed',scan_completed_at=NOW() WHERE token='prospect-e2e-synthetic'");
  const interest=await sales(interestRoute);
  assert.equal(interest.statusCode,200,JSON.stringify(interest.body));
  let prospect=await client.query("SELECT * FROM prospect_quick_scans WHERE token='prospect-e2e-synthetic'");
  assert.equal(prospect.rows[0].audit20_interested,true);
  const ready=await sales(readyRoute,{report_url:'https://example.org/audit20'});
  assert.equal(ready.statusCode,200,JSON.stringify(ready.body));
  assert.equal(auditEmails,1);
  const replayReady=await sales(readyRoute,{report_url:'https://example.org/replace'});
  assert.equal(replayReady.body.already_ready,true);
  assert.equal(replayReady.body.report_url,'https://example.org/audit20');
  assert.equal(auditEmails,1);
  assert.equal((await sales(trackerRoute)).statusCode,200);
  const replayTracker=await sales(trackerRoute);
  assert.equal(replayTracker.body.already_interested,true);
  assert.equal(ownerEvents.filter(x=>x==='tracker_interest').length,1);
  prospect=await client.query("SELECT * FROM prospect_quick_scans WHERE token='prospect-e2e-synthetic'");
  assert.equal(prospect.rows[0].tracker_interested,true);
  assert.equal(prospect.rows[0].audit20_report_url,'https://example.org/audit20');
  console.log('PASS writable synthetic PG QuickScan -> interested Audit20 -> ready once -> Tracker interest once');

  // Test-only defaults for the historical-column fixture (not a production migration).
  await client.query('CREATE TEMP SEQUENCE synthetic_case_study_ids START 99010');
  await client.query("ALTER TABLE tracker_case_studies ALTER COLUMN id SET DEFAULT nextval('pg_temp.synthetic_case_study_ids')");
  await client.query('CREATE TEMP SEQUENCE synthetic_case_event_ids START 99020');
  await client.query("ALTER TABLE tracker_case_study_events ALTER COLUMN id SET DEFAULT nextval('pg_temp.synthetic_case_event_ids')");
  await client.query("INSERT INTO tracker_clients(id,token,domain,name,email,status) VALUES (99001,'case-e2e-synthetic','synthetic.example','Synthetic Service','test@example.org','active')");
  await client.query("INSERT INTO tracker_pages(id,tracker_client_id,url,keyword,last_checked_at,html_content,gsc_clicks,gsc_impressions,gsc_position,revision_cycle) VALUES (99002,99001,'https://synthetic.example/roof-repair','roof repair',NOW(),$1,3,40,9,1)",[html]);
  await client.query("INSERT INTO tracker_snapshots(id,page_id,checked_at,google_position) VALUES(99003,99002,NOW(),9)");
  await client.query("INSERT INTO tracker_gsc_queries(id,tracker_client_id,page_id,evidence_scope,query,clicks,impressions,position,imported_at) VALUES(99004,99001,99002,'page_verified','roof repair',3,40,9,NOW())");
  for(const [i,engine] of ['google_aio','chatgpt','perplexity','claude','copilot'].entries())
   await client.query("INSERT INTO tracker_ai_evidence(id,page_id,tracker_client_id,engine,evidence_method,is_cleared,raw_text,revision_cycle,created_at) VALUES($1,99002,99001,$2,'manual',FALSE,'Verified manual observation',1,NOW())",[99030+i,engine]);
  let handler;
  const context={
   app:{post(_path,fn){handler=fn}},pool:client,Date,Number,String,Set,JSON,Math,parseInt,AbortSignal,
   fetch:async()=>({ok:true,text:async()=>html}),console,
   _ensureCaseStudySchema:async()=>{},
   _caseStudyUrlPreflight:async()=>({ok:true}),
   _caseStudySendRedirectNotice:async()=>{throw Error('Unexpected redirect notice')},
   _caseStudyNormUrl:x=>x,
   _caseStudyStableContentHash:()=> 'synthetic-content-hash',
   _caseStudyStoreContentVersion:async(_clientId,pageId,versionType,url,pageHtml,htmlSource,metadata)=>{
     const row=await client.query("INSERT INTO tracker_case_study_content_versions(id,case_study_id,tracker_page_id,version_type,canonical_url,html_content,source,captured_at,version_data) VALUES(99050,(SELECT id FROM tracker_case_studies WHERE tracker_page_id=$1 LIMIT 1),$1,$2,$3,$4,$5,NOW(),$6::jsonb) RETURNING id",[pageId,versionType,url,pageHtml,htmlSource,JSON.stringify(metadata)]);
     return row.rows[0];
   },
   _caseStudyEventForPage:async()=>{},
   _caseStudyOpenFreshStartCycle:async()=>{await client.query("INSERT INTO tracker_case_study_events(case_study_id,tracker_page_id,event_type,event_at,source) VALUES((SELECT id FROM tracker_case_studies WHERE tracker_page_id=99002 LIMIT 1),99002,'case_study_fresh_cycle_initialized',NOW(),'synthetic_e2e')");return {revision_cycle:2}}
  };
  vm.runInNewContext(route,context,{timeout:4000});
  assert.equal(typeof handler,'function');
  async function invoke(){
   const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=JSON.parse(JSON.stringify(body));return body}};
   await handler({params:{token:'case-e2e-synthetic',pageId:'99002'},body:{primary_query:'roof repair'}},res);
   return res;
  }
  const first=await invoke();assert.equal(first.statusCode,200,JSON.stringify(first.body));
  assert.equal(first.body.success,true);assert.equal(first.body.five_engine_checks,5);
  const original=await client.query("SELECT id,baseline_locked,baseline_data,baseline_at FROM tracker_case_studies WHERE tracker_page_id=99002");
  assert.equal(original.rowCount,1);
  assert.equal(original.rows[0].baseline_locked,true);
  assert.equal(original.rows[0].baseline_data.schema_version,3);
  const htmlRows=await client.query("SELECT html_content FROM tracker_case_study_content_versions WHERE case_study_id=$1",[original.rows[0].id]);
  assert.equal(htmlRows.rowCount,1);assert.equal(htmlRows.rows[0].html_content,html);
  const events=await client.query("SELECT event_type FROM tracker_case_study_events WHERE case_study_id=$1",[original.rows[0].id]);
  assert(events.rows.some(x=>x.event_type==='baseline_frozen'));
  const second=await invoke();assert.equal(second.statusCode,200,JSON.stringify(second.body));
  assert.equal(second.body.already_active,true);
  const after=await client.query("SELECT id,baseline_data FROM tracker_case_studies WHERE tracker_page_id=99002");
  assert.equal(after.rowCount,1);assert.equal(after.rows[0].id,original.rows[0].id);
  assert.deepEqual(after.rows[0].baseline_data,original.rows[0].baseline_data);
  // Continue through the ACTUAL manual-check HTTP handler using the persisted
  // locked baseline + fresh-cycle event, without external scanning services.
  await client.query("UPDATE tracker_pages SET manual_done=TRUE,brief_content='{\"outstanding_actions\":0}'::jsonb WHERE id=99002");
  const gateA=source.indexOf('function _trackerNormalScanGate(');
  const gateB=source.indexOf('// POST /api/tracker-client/:token/scan-all',gateA);
  const checkA=source.indexOf("app.post('/api/tracker-client/:token/check/:pageId'");
  const checkB=source.indexOf('\n});',checkA);
  assert(gateA>0&&gateB>gateA&&checkA>0&&checkB>checkA,'Canonical single-page scan route missing');
  let checkHandler,queued=null,actualChecks=0;
  const checkContext={
   app:{post(_p,fn){checkHandler=fn}},pool:client,Date,Number,String,JSON,Math,Set,process:{env:{}},
   console,_trackerCheckStatus:new Map(),_sseBroadcast:()=>{},
   _ensureMonitoringGateSchema:async()=>{},_caseStudyEventForPage:async()=>{},
   setImmediate:fn=>{queued=fn},
   runTrackerCheck:async()=>{actualChecks++;await client.query("INSERT INTO tracker_snapshots(id,page_id,checked_at,google_position) VALUES (99090,99002,$1,9)",[new Date(original.rows[0].baseline_at.getTime()+1000)]);}
  };
  vm.runInNewContext(source.slice(gateA,gateB)+'\n'+source.slice(checkA,checkB+4),checkContext,{timeout:4000});
  async function check(){
   const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=JSON.parse(JSON.stringify(body));return body}};
   await checkHandler({params:{token:'case-e2e-synthetic',pageId:'99002'},body:{}},res);
   return res;
  }
  const accepted=await check();assert.equal(accepted.statusCode,200,JSON.stringify(accepted.body));
  assert.equal(accepted.body.success,true);
  assert(queued,'Manual check must schedule the canonical scan');
  await queued();assert.equal(actualChecks,1);
  const refused=await check();assert.equal(refused.statusCode,409,JSON.stringify(refused.body));
  assert.equal(refused.body.scan_locked,true);
  assert.equal(actualChecks,1,'A later scan may not replay the first-scan exception');
  const frozen=await client.query('SELECT baseline_data FROM tracker_case_studies WHERE id=$1',[original.rows[0].id]);
  assert.deepEqual(frozen.rows[0].baseline_data,original.rows[0].baseline_data);
  console.log('PASS writable synthetic PG Case Study: first manual scan accepted, later replay blocked, baseline unchanged');

  console.log('PASS writable synthetic PG Case Study: baseline freeze, HTML, 5 engines, GSC, replay, immutable history');
 } finally {
  await client.query('ROLLBACK');
  await client.end();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
