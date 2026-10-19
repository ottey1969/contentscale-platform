'use strict';
const assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const {analyzeGrowthEvidence,excerpt}=require('../src/growth-automatic-analysis.cjs');
const {publicV4,validateUrl}=require('../src/growth-public-html-reader.cjs');
const own='https://roof.example/service/';
const rival='https://comp.example/roof-inspection/';
const html='<html><head><title>Roof Repair Service</title><meta name="description" content="Roof repairs for homes and buildings"></head><body><h1>Roof Repair Service</h1><h2>When to request a check</h2><p>Review the damage and determine whether a professional assessment is appropriate.</p></body></html>';
const rivalHtml='<html><head><title>Roof Inspection Information</title></head><body><h1>Inspection overview</h1><h2>Questions before a roof inspection</h2><h2>What happens after damage?</h2><p>Inspection steps and service limitations.</p></body></html>';
assert.equal(publicV4('127.0.0.1'),false);
assert.equal(publicV4('10.1.2.3'),false);
assert.equal(publicV4('172.20.1.2'),false);
assert.equal(publicV4('192.168.0.1'),false);
assert.equal(publicV4('169.254.169.254'),false);
assert.equal(publicV4('198.18.1.20'),false);
assert.equal(publicV4('203.0.113.1'),false);
assert.equal(publicV4('1.1.1.1'),true);
assert.throws(()=>validateUrl('http://roof.example/page'),/PUBLIC_HTTPS/);
assert.throws(()=>validateUrl('https://127.0.0.1/private'),/PUBLIC_HTTPS/);
assert.throws(()=>validateUrl('https://roof.example:8443/page'),/PUBLIC_HTTPS/);
assert.deepEqual(excerpt(html).h2,['When to request a check']);
const page={id:7,tracker_client_id:4,url:own,keyword:'roof repairs',case_study_active:false};
const snapshot={page_id:7,checked_at:'2026-10-10T00:00:00Z',google_competitors:[{url:rival,title:'Roof Inspection'}]};
const gsc=[{page_id:7,tracker_client_id:4,source_page_url:own,evidence_scope:'page_verified',query:'roof repair near me',impressions:300,clicks:2,position:18,imported_at:'2026-10-17T00:00:00Z'}];
const ai=[{page_id:7,tracker_client_id:4,engine:'perplexity',brand_recommended:false,domain_cited:true,exact_page_cited:false,citation_urls:[],verified_at:'2026-10-10T00:00:00Z',revision_cycle:1}];
const computed=analyzeGrowthEvidence({page,savedHtml:null,live:{html,final_url:own,retrieved_at:'2026-10-17T00:00:00Z'},snapshot,aiRows:ai,gscRows:gsc,
 competitorPages:[{url:rival,live:{html:rivalHtml,retrieved_at:'2026-10-17T00:00:01Z'}}],previousBrief:{generated_at:'2026-09-12T00:00:00Z',implementation_complete:true,outstanding_actions:0,items:[{title:'Historic content addition',action:'Old completed recommendation',priority:'HIGH'}],gsc_brief:[{title:'Old GSC evidence',action:'Review historical query'}]}});
assert.equal(computed.summary.primary_source,'LIVE_PUBLIC_HTML_OBSERVED');
assert.equal(computed.previous_brief.implementation_complete,true);
assert.equal(computed.previous_brief.status,'HISTORICAL_BRIEF_NOT_CURRENT_LIVE_EVIDENCE');
assert.equal(computed.previous_brief.items.length,1);
assert.match(computed.previous_brief.warning,/not reopen automatically/);
assert.equal(computed.summary.exact_gsc_queries,1);
assert.equal(computed.summary.ai_engines,1);
assert.equal(computed.summary.competitors_live_reviewed,1);
assert.equal(computed.competitors.topic_candidates.length,0,'off-intent competitor roof-inspection sections must not be recommended for a repair-service page');
assert(computed.competitors.excluded_unaligned_topics>=1,'unrelated headings must be excluded, not promoted into content gaps');
assert.equal(computed.page_content.signals.h1_count_observed,1);
assert.equal(computed.editorial.preserve_existing_page,true);
assert.equal(computed.editorial.status,'REVIEWABLE_RESEARCH_DRAFT_NOT_PUBLISHABLE');
assert.equal(computed.summary.forecasted_click_gain,null);
const missing=analyzeGrowthEvidence({page,savedHtml:null,snapshot:null,aiRows:[],gscRows:[],competitorPages:[]});
assert.equal(missing.summary.primary_source,'NO_PAGE_HTML');
assert.equal(missing.search.verified_queries.length,0);
assert.equal(missing.page_content.signals.h1_count_observed,undefined);
assert.equal(missing.editorial.focus_query.status,'WORKING_TOPIC_NOT_RANKING_PROOF');
async function testRoutes(){
 const route={},calls=[];
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql))throw Error('No writes permitted');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:7,tracker_client_id:4,url:own,keyword:'roof repair',saved_html:html}]};
  if(sql.includes('FROM tracker_snapshots'))return {rows:[snapshot]};
  if(sql.includes('FROM tracker_ai_evidence'))return {rows:ai};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:gsc};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:[{id:11,url:'https://roof.example/roof-repair-guide/',keyword:'roof repair guide'}]};
  throw Error('Unexpected database access '+sql.slice(0,120));
 }};
 let caseLocked=true;
 const middleware=(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:req.params.token==='owner-token',pages:[{id:7,url:own,keyword:'roof repair',case_study_active:caseLocked}]};next()};
 const fetchLive=async url=>{calls.push(url);return {html:url===own?html:rivalHtml,final_url:url,retrieved_at:'2026-10-17T00:00:00Z',source:'LIVE_PUBLIC_HTTPS'}};
 registerGrowthAutomaticResearch({get(path,...handlers){route[path]=handlers}},db,middleware,{fetchLive,
  searchLive:async()=>({status:'NO_RELEVANT_PUBLIC_SEARCH_LEADS',leads:[],source:'BING_PUBLIC_RSS',query:'roof repair near me'})});
 async function invoke(path,token='readonly-client-token',page_id='7'){
  const req={params:{token},query:{page_id}},res={
   statusCode:200,headers:{},status(x){this.statusCode=x;return this},
   set(k,v){this.headers[k]=v;return this},type(){return this},
   json(x){this.body=x;return this},send(x){this.body=x;return this}
  };
  const stack=route[path];assert(stack,'Route registered '+path);
  await new Promise((resolve,reject)=>{
   try{
    const invokeAt=i=>{if(i>=stack.length)return resolve();
     Promise.resolve(stack[i](req,res,()=>invokeAt(i+1))).then(()=>{if(i===stack.length-1)resolve()},reject);
    };invokeAt(0);
   }catch(e){reject(e)}
  });
  return res;
 }
 const api='/api/tracker-client/:token/growth/auto-research';
 const report=await invoke(api);
 assert.equal(report.statusCode,200);
 assert.equal(report.body.case_study_locked,true);
 assert.equal(report.body.access.can_edit,false);
 assert.equal(report.body.summary.competitors_live_reviewed,0,'unrelated historical roof inspection page is not selected as current competitor');
 assert.equal(report.body.competitors.leads.length,1,'historical lead remains in the evidence inventory');
 assert.equal(report.body.search_discovery.status,'NO_RELEVANT_PUBLIC_SEARCH_LEADS');
 assert.equal(report.body.search.verified_queries.length,1);
 assert.equal(report.body.destination_section_comparison.target_url,'https://roof.example/roof-repair-guide/');
 assert.equal(report.body.destination_section_comparison.protected_source_url,own);
 assert.equal(report.body.destination_section_comparison.copy_ready,false);
 assert.equal(report.body.destination_section_comparison.verified_gap,false);
 assert.deepEqual(calls,[own,'https://roof.example/roof-repair-guide/'],'No unrelated competitor fetch; related first-party page is inspected');
 const again=await invoke(api);
 assert.equal(again.statusCode,200);
 assert.equal(calls.length,2,'Shared safe cache prevents duplicate network calls');
 const view=await invoke('/track/:token/growth/auto-research');
 assert.equal(view.statusCode,200);
 assert.match(view.body,/Automatic Growth research/);
 assert.match(view.body,/growth-automatic-report-ui.js/);
 assert.doesNotMatch(view.body,/id="growthEditorHandoff"/,'Read-only Case Study cannot be offered publishing');
 assert.match(view.body,/data-owner-draft="false"/,'read-only share cannot prepare paid AI drafting');
 assert.match(view.body,/growthMeasurementLink/);
 caseLocked=false;
 const readOnlyView=await invoke('/track/:token/growth/auto-research');
 assert.doesNotMatch(readOnlyView.body,/id="growthEditorHandoff"/,'Readonly share token must not receive export');
 const ownedView=await invoke('/track/:token/growth/auto-research','owner-token');
 assert.match(ownedView.body,/id="growthEditorHandoff"/);
 assert.match(ownedView.body,/data-owner-draft="true"/,'owner can prepare reviewed editorial copy');
 assert.match(ownedView.body,/\/track\/owner-token\/growth\/cms-export\?page_id=7/);
 caseLocked=true;
 const lockedOwnerView=await invoke('/track/:token/growth/auto-research','owner-token');
 assert.match(lockedOwnerView.body,/data-owner-draft="true"/,'Case Study blocks publication not research-only draft');
 assert.doesNotMatch(lockedOwnerView.body,/id="growthEditorHandoff"/,'Case Study continues to block CMS publishing');
 assert.match(view.body,/\/track\/readonly-client-token\/growth/,'Client token is used only to preserve its authorized navigation link');
 const noPage=await invoke(api,'readonly-client-token','999');
 assert.equal(noPage.statusCode,404);
 const invalid=await invoke(api,'readonly-client-token','7 OR 1=1');
 assert.equal(invalid.statusCode,400);
 const later=registerGrowthAutomaticResearch;
 assert.equal(typeof later,'function');
}
testRoutes().then(()=>console.log('PASS Growth automatic: live page, real competitor, AI, GSC, locked Case Study, read-only access, no bogus zero, public-HTTPS SSRF limits')).catch(e=>{console.error(e);process.exitCode=1});
