'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.PREWRITE_CANDIDATE_FILE||'/tmp/contentscale-prewrite-pure-get.js','utf8');
const helperStart=source.indexOf('async function _pwbPrepareSavedBriefV506(');
const helperEnd=source.indexOf("\napp.get('/api/tracker-client/:token/prewrite-briefs/:id'",helperStart);
assert(helperStart>=0&&helperEnd>helperStart&&helperEnd-helperStart<8500);
const helperCode=source.slice(helperStart,helperEnd);
function makeTestContext(){
 const calls=[],saved=[],original={publication_quality_check:{score:48},final_qa_version:'v503-meta-policy',research:{persisted:'keep'},evidence:{saved:true}};
 const row={id:41,client_id:1,keyword:'roof repair',language:'en',working_title:'Roof repair',region:'us',brief_json:original,competitors_scraped:2,created_at:'2026-10-01T00:00:00Z'};
 const pool={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('SELECT id,domain FROM tracker_clients'))return {rows:[{id:1,domain:'example.test'}]};
  if(sql.includes('FROM prewrite_briefs WHERE id=$1 AND client_id=$2'))return {rows:[row]};
  if(sql.includes('SELECT share_token,share_created_at'))return {rows:[{share_token:null,share_created_at:null}]};
  if(sql.includes('FROM network_placements p JOIN network_websites'))return {rows:[{publisher_domain:'publisher.test',owner_domain:'example.test',publisher_scan:{checked_url:'https://publisher.test/'}}]};
  if(sql.includes('FROM prewrite_async_jobs'))return {rows:[{request_json:{manualAiEvidence:{perplexity:'Existing manual verification'}}}]};
  if(sql.startsWith('UPDATE prewrite_briefs')){saved.push(JSON.parse(args[0]));return {rowCount:1,rows:[]};}
  throw Error('Unexpected SQL '+sql.slice(0,100));
 }};
 const helpers={
  _pwbEnsureResearchContractV506(b){b.research_contract_verified=true;},
  _pwbMergeManualAiEvidenceV506(b,e){b.manual_ai_evidence={...(b.manual_ai_evidence||{}),...e};return {added:Object.keys(e)};},
  _pwbEnsureNetworkInternalDestinationV506(b,{checked_url}){b.link_research={internal:{selected_url:checked_url}};return {source:'publisher_homepage_fallback'};},
  _pwbEvidenceBackedGapV506(b){b.gap_preserved=true;},
  _pwbCanonicalizeAiAnalysisV506(b){b.ai_canonicalized=true;},
  _pwbFinalPublicationPass(b){b.publication_quality_check={score:91};b.final_qa_version='v504-meta-policy';},
  _pwbReadiness(){return {score:91,missing:[],details:{}};},
  _PWB_AI_ENGINES_V506:['perplexity','google_aio','copilot','chatgpt','gemini']
 };
 const context={pool,process:{env:{APP_URL:'https://test.contentscale.local'}},console:{warn(){},error(...a){throw Error('handler error '+a.join(' '));}},
  URL,Date,Number,JSON,String,Array,Object,Set,Math,...helpers};
 vm.runInNewContext(helperCode+';globalThis.prepareBrief=_pwbPrepareSavedBriefV506;',context,{timeout:1700});
 return {context,db:{calls,saved},row,original};
}
function extractHandler(source,marker,{method='get',env={}}={}){
 const at=source.indexOf(marker),end=source.indexOf('\n});',at);
 assert(at>=0&&end>at&&end-at<25000,'Cannot isolate canonical handler');
 let handle;
 const app={[method](p,fn){assert.equal(p,method==='get'?'/api/tracker-client/:token/prewrite-briefs/:id':'/api/tracker-client/:token/prewrite-briefs/:id/finalize');handle=fn;}};
 vm.runInNewContext(source.slice(at,end+4),{app,...env},{timeout:2100});
 assert.equal(typeof handle,'function');return handle;
}
function response(){
 return {code:200,result:null,header:{},status(n){this.code=n;return this;},set(k,v){this.header[k]=v;return this;},json(v){this.result=JSON.parse(JSON.stringify(v));return this;}};
}
test('shared helper recovers previously saved AI work only via SELECT and does not mutate saved Brief',async()=>{
 const t=makeTestContext();
 const result=await t.context.prepareBrief(t.row,{networkEmbed:'1',networkPlacement:25});
 assert.equal(result.pendingSave,true);
 assert.equal(result.finalQaPersisted,false);
 assert.equal(result.autoMigrated,true);
 assert.equal(result.integrityMigrated,true);
 assert.equal(result.brief.manual_ai_evidence.perplexity,'Existing manual verification');
 assert.equal(result.brief.research.persisted,'keep');
 assert.equal(result.brief.link_research.internal.selected_url,'https://publisher.test/');
 assert.equal(result.brief.final_qa_history.length,1);
 assert.equal(t.db.saved.length,0);
 assert(t.db.calls.every(x=>x.sql.trim().startsWith('SELECT ')));
 assert.equal(t.original.final_qa_version,'v503-meta-policy');
});
test('canonical GET previews recovery without writing even if the Brief needs deterministic upgrade',async()=>{
 const t=makeTestContext();
 const get=extractHandler(source,"app.get('/api/tracker-client/:token/prewrite-briefs/:id'",{
  env:{pool:t.context.pool,process:t.context.process,console:t.context.console,_pwbPrepareSavedBriefV506:t.context.prepareBrief}
 });
 const res=response();
 await get({params:{token:'owner',id:'41'},query:{networkEmbed:'1',networkPlacement:'25'}},res);
 assert.equal(res.code,200,JSON.stringify(res.result));
 assert.equal(res.result.pending_explicit_save,true);
 assert.equal(res.result.final_qa_persisted,false);
 assert.equal(res.result.deterministic_qa_migrated,true);
 assert.equal(res.result.integrity_migrated,true);
 assert.equal(t.db.saved.length,0,'GET wrote to the database');
 assert(t.db.calls.every(x=>x.sql.trim().startsWith('SELECT ')));
 assert.equal(res.result.brief.research.persisted,'keep');
});
test('existing authorized Finalize POST persists the very same recovery with no AI calls',async()=>{
 const t=makeTestContext();
 const finalize=extractHandler(source,"app.post('/api/tracker-client/:token/prewrite-briefs/:id/finalize'",{
 method:'post',env:{
  pool:t.context.pool,Date,JSON,Number,Array,String,
  _pwbLoadAuthorizedSavedBriefV500:async()=>({row:t.row,placementId:25,publisherDomain:'publisher.test',ownerDomain:'example.test',publisherCheckedUrl:'https://publisher.test/'}),
  _pwbPrepareSavedBriefV506:t.context.prepareBrief,
  _pwbEnsureResearchContractV506:t.context._pwbEnsureResearchContractV506,
  _pwbEnsureNetworkInternalDestinationV506:t.context._pwbEnsureNetworkInternalDestinationV506,
  _pwbEvidenceBackedGapV506:t.context._pwbEvidenceBackedGapV506,
  _pwbCanonicalizeAiAnalysisV506:t.context._pwbCanonicalizeAiAnalysisV506,
  _pwbFinalPublicationPass:t.context._pwbFinalPublicationPass,
  _pwbReadiness:t.context._pwbReadiness
 }});
 const res=response();
 await finalize({params:{token:'owner',id:'41'},query:{networkEmbed:'1',networkPlacement:'25'},body:{}},res);
 assert.equal(res.code,200,JSON.stringify(res.result));
 assert.equal(res.result.gemini_calls,0);
 assert.equal(res.result.research_rerun,false);
 assert.equal(t.db.saved.length,1);
 assert.equal(t.db.saved[0].manual_ai_evidence.perplexity,'Existing manual verification');
 assert.equal(t.db.saved[0].link_research.internal.selected_url,'https://publisher.test/');
 assert.equal(t.db.saved[0].research.persisted,'keep');
});
test('canonical Prewrite GET has no implicit persistence SQL or provider calls',()=>{
 const start=source.indexOf("app.get('/api/tracker-client/:token/prewrite-briefs/:id'"),end=source.indexOf('\n});',start);
 const body=source.slice(start,end+4);
 assert.doesNotMatch(body,/UPDATE\s+prewrite_briefs/i);
 assert.doesNotMatch(body,/gemini|_pwbGenerateBrief|serpApi|perplexityApi/i);
 assert.match(body,/pending_explicit_save:_preview.pendingSave/);
});
