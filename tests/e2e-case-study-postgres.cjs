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
   _caseStudyOpenFreshStartCycle:async()=>({revision_cycle:2})
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
  console.log('PASS writable synthetic PG Case Study: baseline freeze, HTML, 5 engines, GSC, replay, immutable history');
 } finally {
  await client.query('ROLLBACK');
  await client.end();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
