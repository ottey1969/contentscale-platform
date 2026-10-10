'use strict';
// CI-only: execute original saved-Brief GET, existing authorization and Finalize routes
// against TEMP tables on disposable localhost PostgreSQL. Never import or boot the app.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
 assert.equal(process.env.CI,'true');
 assert.equal(process.env.DATABASE_URL,undefined);
 const u=new URL(process.env.TRACKER_TEST_DATABASE_URL);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/testdb');assert.equal(u.username,'test');
 const {Client}=require(process.env.TRACKER_PG_MODULE_PATH);
 const client=new Client({connectionString:u.toString()});await client.connect();let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  await client.query("SET LOCAL search_path=pg_temp,pg_catalog");
  await client.query("SET LOCAL statement_timeout='5000ms'");
  for(const sql of [
   'CREATE TEMP TABLE tracker_clients(id bigint PRIMARY KEY,token text UNIQUE,domain text,status text)',
   'CREATE TEMP TABLE prewrite_briefs(id bigint PRIMARY KEY,client_id bigint,keyword text,working_title text,language text,region text,brief_json jsonb,competitors_scraped jsonb,created_at timestamptz DEFAULT NOW(),share_token text,share_created_at timestamptz)',
   'CREATE TEMP TABLE network_websites(id bigint PRIMARY KEY,domain text,scan_snapshot jsonb)',
   'CREATE TEMP TABLE network_content(id bigint PRIMARY KEY,prewrite_brief_id bigint,owner_website_id bigint)',
   'CREATE TEMP TABLE network_placements(id bigint PRIMARY KEY,content_id bigint,publisher_website_id bigint)',
   'CREATE TEMP TABLE prewrite_async_jobs(id bigint PRIMARY KEY,network_placement_id bigint,request_json jsonb,created_at timestamptz DEFAULT NOW())'
  ])await client.query(sql);
  await client.query("INSERT INTO tracker_clients VALUES(1,'owner','example.test','active')");
  const old={publication_quality_check:{score:44},final_qa_version:'v503',research:{persisted:true}};
  await client.query("INSERT INTO prewrite_briefs(id,client_id,keyword,working_title,language,region,brief_json,competitors_scraped) VALUES (41,1,'roof','Roof repair','en','us',$1::jsonb,'[]'),(42,1,'other','Other brief','en','us','{}','[]')",[JSON.stringify(old)]);
  await client.query("INSERT INTO network_websites VALUES (1,'publisher.test','{\"checked_url\":\"https://publisher.test/\"}'),(2,'publisher-other.test','{\"checked_url\":\"https://publisher-other.test/\"}'),(3,'example.test','{}')");
  await client.query("INSERT INTO network_content VALUES(5,41,3),(6,42,3)");
  await client.query("INSERT INTO network_placements VALUES(25,5,1),(26,6,2)");
  await client.query("INSERT INTO prewrite_async_jobs(id,network_placement_id,request_json) VALUES(1,25,'{\"manualAiEvidence\":{\"perplexity\":\"Existing owner evidence\"}}'),(2,26,'{\"manualAiEvidence\":{\"perplexity\":\"Other placement evidence\"}}')");
  const source=fs.readFileSync('src/index.js','utf8'),pool={query:(...a)=>client.query(...a)};
  const helpers={
   _PWB_AI_ENGINES_V506:['perplexity'],
   _pwbEnsureResearchContractV506(b){b.recovered_contract=true;},
   _pwbMergeManualAiEvidenceV506(b,e){b.manual_ai_evidence={...(b.manual_ai_evidence||{}),...e};return {added:Object.keys(e)};},
   _pwbEnsureNetworkInternalDestinationV506(b,c){b.link_research={internal:{selected_url:c.checked_url||('https://'+c.publisher_domain+'/')}};return {source:'publisher_homepage_fallback'};},
   _pwbEvidenceBackedGapV506(){},_pwbCanonicalizeAiAnalysisV506(){},
   _pwbFinalPublicationPass(b){b.publication_quality_check={score:91};b.final_qa_version='v504-meta-policy';},
   _pwbReadiness(){return {missing:[],score:91,details:{}};}
  };
  const ctx={pool,console:{warn(){},error(){}} ,process:{env:{APP_URL:'https://staging.example.test'}},URL,Number,String,JSON,Date,Set,Map,Array,Object,Math,...helpers};
  function loadFunction(marker,endMarker,alias){
   const i=source.indexOf(marker),j=source.indexOf(endMarker,i+marker.length);
   assert(i>0&&j>i&&j-i<16000,'Cannot safely extract '+alias);
   vm.runInNewContext(source.slice(i,j)+';globalThis.'+alias+'='+marker.match(/(?:function )([A-Za-z0-9_]+)\(/)[1]+';',ctx,{timeout:2200});
  }
  loadFunction('async function _pwbPrepareSavedBriefV506(', "\napp.get('/api/tracker-client/:token/prewrite-briefs/:id'",'prepare');
  loadFunction('async function _pwbLoadAuthorizedSavedBriefV500(', "\napp.post('/api/tracker-client/:token/prewrite-briefs/:id/finalize'",'authorize');
  function handler(method,route){
   const marker=method==='post'?"app.post('"+route+"', async (req,res)=>{":"app.get('"+route+"', async (req, res) => {";
   const at=source.indexOf(marker),end=source.indexOf('\n});',at);assert(at>0&&end>at&&end-at<16500,'Unsafe '+route);
   let fn;vm.runInNewContext(source.slice(at,end+4),{...ctx,_pwbPrepareSavedBriefV506:ctx.prepare,_pwbLoadAuthorizedSavedBriefV500:ctx.authorize,app:{[method](p,h){assert.equal(p,route);fn=h;}}},{timeout:2200});
   return fn;
  }
  const get=handler('get','/api/tracker-client/:token/prewrite-briefs/:id');
  const finalize=handler('post','/api/tracker-client/:token/prewrite-briefs/:id/finalize');
  function res(){return{code:200,data:null,status(n){this.code=n;return this;},set(){return this;},json(v){this.data=JSON.parse(JSON.stringify(v));return this;}}}
  async function call(fn,placement){
   const r=res();await fn({params:{token:'owner',id:'41'},query:{networkEmbed:'1',networkPlacement:String(placement)},body:{}},r);assert(r.data);return r;
  }
  const persisted=async()=> (await client.query('SELECT brief_json FROM prewrite_briefs WHERE id=41')).rows[0].brief_json;
  const before=await persisted();
  const read=await call(get,25);
  assert.equal(read.code,200,JSON.stringify(read.data));
  assert.equal(read.data.pending_explicit_save,true);
  assert.equal(read.data.final_qa_persisted,false);
  assert.equal(read.data.brief.manual_ai_evidence.perplexity,'Existing owner evidence');
  assert.deepEqual(await persisted(),before,'Prewrite GET mutated persisted data');
  const saved=await call(finalize,25);
  assert.equal(saved.code,200,JSON.stringify(saved.data));
  assert.equal(saved.data.research_rerun,false);assert.equal(saved.data.gemini_calls,0);
  const after=await persisted();
  assert.equal(after.manual_ai_evidence.perplexity,'Existing owner evidence');
  assert.equal(after.research.persisted,true);
  assert.equal(after.link_research.internal.selected_url,'https://publisher.test/');
  const reload=await call(get,25);
  assert.equal(reload.data.brief.manual_ai_evidence.perplexity,'Existing owner evidence');
  // A client owning Brief 41 must not inherit placement 26 belonging to Brief 42.
  await client.query("UPDATE prewrite_briefs SET brief_json=$1::jsonb WHERE id=41",[JSON.stringify(old)]);
  const alien=await call(get,26);
  assert.equal(alien.code,200);
  assert.equal(alien.data.brief.manual_ai_evidence,undefined,'GET recovered another placement evidence');
  const alienFinalize=await call(finalize,26);
  assert.equal(alienFinalize.code,200);
  const alienSaved=await persisted();
  assert.notEqual(alienSaved.manual_ai_evidence?.perplexity,'Other placement evidence');
  assert.notEqual(alienSaved.link_research?.internal?.selected_url,'https://publisher-other.test/','Finalize used foreign placement context');
  console.log(JSON.stringify({test:'prewrite_saved_brief_postgres_e2e',result:'verified',read_only_get:true,explicit_finalize_saved:true,reloaded_evidence:true,foreign_placement_blocked:true,gemini_calls:0,provider_calls:0,real_customer_records:0}));
 }finally{if(begun)try{await client.query('ROLLBACK')}catch(_){}await client.end();}
}
main().catch(e=>{console.error('[PREWRITE-POSTGRES-E2E] FAILED',e.stack||e.message);process.exitCode=1;});
