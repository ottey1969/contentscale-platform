'use strict';
const assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const url='https://contentscale.site/';
const good='https://editorial.example/guides/content-scaling/';
const obsolete='https://review.example/brandwell-ai-detector-review/';
const html='<html><head><title>Content At Scale — Quality and Growth</title><meta name="description" content="Scale content and track SEO"></head><body><h1>Content at scale without the quality drop</h1><h2>How do you scale content without losing quality?</h2><p>Inventory search demand and pages before editing.</p></body></html>';
const rivalHtml='<html><head><title>Content Scaling Strategies and Workflows</title><meta name="description" content="Editorial operations for scaling content"></head><body><h1>Content Scaling Strategies</h1><h2>How to prioritize your content inventory</h2><p>Workflows and checklists for content teams begin with a complete inventory of existing articles, intended search questions and assigned owners. Editors compare useful URLs with actual search data, mark overlaps and identify factual updates before commissioning any new pages. This step helps teams prioritize genuine reader needs while retaining successful existing answers.</p><h2>Review content quality before publishing</h2><p>Evaluate intent and quality by confirming that each published section answers a clear reader task with accurate, attributable evidence. Record the source and date for factual statements, protect pages that already attract relevant traffic, and check whether a draft duplicates an existing article. Approve changes editorially and track the same query and URL afterward.</p></body></html>';
const record=(query,impressions,clicks,position)=>({page_id:2320,tracker_client_id:10,source_page_url:url,evidence_scope:'page_verified',query,impressions,clicks,position,imported_at:new Date().toISOString()});
const gsc=[record('content at scale',4667,1159,1.42),record('content scaling',3943,2,12.72),record('content at scale ai detector',1432,234,5.9)];
const routes={},visited=[],searched=[];let writes=0;
const app={get(path,...handlers){routes[path]=handlers}};
const pool={query:async sql=>{
 if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(sql)){writes++;throw Error('Unexpected write')}
 if(sql.includes('LEFT(html_content'))return {rows:[{id:2320,tracker_client_id:10,url,keyword:'content at scale',saved_html:html,brief_content:null}]};
 if(sql.includes('FROM tracker_snapshots'))return {rows:[{page_id:2320,checked_at:'2026-09-28T06:04:10Z',
  google_competitors:[{url:obsolete,title:'BrandWell AI Detector Review'}]}]};
 if(sql.includes('FROM tracker_ai_evidence'))return {rows:[]};
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:gsc};
 if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:[{id:99,url:'https://contentscale.site/content-at-scale/',keyword:'content at scale'}]};
 throw Error('Unexpected query '+sql);
}};
let locked=true;
const data=(req,res,next)=>{req.growthTrackerClientId=10;req.growth={can_edit:true,pages:[{id:2320,url,case_study_active:locked}]};next()};
const fetchLive=async pageUrl=>{visited.push(pageUrl);return {html:pageUrl===url?html:rivalHtml,retrieved_at:new Date().toISOString(),final_url:pageUrl,source:'LIVE_PUBLIC_HTTPS'}};
let searchSource='BING_PUBLIC_RSS';
const searchLive=async ({query,ownUrl})=>{searched.push({query,ownUrl});return {
 status:searchSource==='BING_PUBLIC_RSS'?'FRESH_PUBLIC_SEARCH_LEADS':'FRESH_GOOGLE_ORGANIC_LEADS',
 query,checked_at:new Date().toISOString(),source:searchSource,
 leads:[{url:good,title:'Content Scaling Strategies and Workflows',source:searchSource,
 status:searchSource==='BING_PUBLIC_RSS'?'FRESH_BING_RSS_LEAD_NOT_GOOGLE_RANKING':'GOOGLE_SERP_OBSERVATION_NOT_TRACKED_PAGE_POSITION'}]};};
registerGrowthAutomaticResearch(app,pool,data,{fetchLive,searchLive});
async function invoke(){
 const res={statusCode:200,headers:{},status(x){this.statusCode=x;return this},set(){return this},json(data){this.body=data;return this}};
 const req={query:{page_id:'2320'},params:{token:'fixture'}},handlers=routes['/api/tracker-client/:token/growth/auto-research'];
 let running;
 handlers[0](req,res,()=>{running=Promise.resolve(handlers[1](req,res))});
 await running;
 return res;
}
(async()=>{
 const response=await invoke();
 assert.equal(response.statusCode,200,JSON.stringify(response.body));
 const r=response.body;
 assert.equal(searched.length,1);assert.equal(searched[0].query,'content scaling');
 assert.deepEqual(visited,[url,good,'https://contentscale.site/content-at-scale/'],'obsolete detector rival must not be fetched; same-site destination is inspected');
 assert.equal(r.autonomous_growth_opportunity.existing_destinations[0].verified_live,true);
 assert.equal(r.search_discovery.status,'FRESH_PUBLIC_SEARCH_LEADS');
 assert.equal(r.competitors.live_reviewed.length,1);
 assert.equal(r.competitors.live_reviewed[0].url,good);
 assert.equal(r.competitors.live_reviewed[0].discovery_source,'BING_PUBLIC_RSS');
 assert.equal(r.competitors.total_leads,1,'historical lead remains visible and not re-labelled');
 assert.equal(r.growth_decision.primary_next_action.query,'content scaling');
 assert.equal(r.case_study_locked,true);
 assert.equal(r.access.can_edit,false);assert.equal(writes,0);
 assert.equal(r.practical_growth_plan.competitors.inspected,1);
 assert.equal(r.practical_growth_plan.competitors.relevant_to_action,1);
 assert.equal(r.practical_growth_plan.competitors.side_by_side.length,1);
 assert.match(r.practical_growth_plan.competitors.side_by_side[0].competitor_section,/content inventory/i);
 assert.match(r.practical_growth_plan.competitors.side_by_side[0].competitor_excerpt,/workflows/i);
 assert.equal(r.search.verified_queries.length,3);
 assert.equal(r.summary.published,false);
 const cached=await invoke();assert.equal(cached.statusCode,200);assert.equal(searched.length,1);assert.equal(visited.length,3);
 locked=false;
 searchSource='SERPER_GOOGLE_ORGANIC';
 const unlocked=await invoke();assert.equal(unlocked.statusCode,200);
 assert.equal(unlocked.body.search_discovery.source,'SERPER_GOOGLE_ORGANIC');
 assert.equal(unlocked.body.competitors.live_reviewed[0].discovery_source,'SERPER_GOOGLE_ORGANIC');
 assert.equal(unlocked.body.practical_growth_plan.competitors.side_by_side.length,1);
 assert.equal(unlocked.body.case_study_locked,false,'cache must not reuse a locked report after owner changes Case Study state');
 assert.equal(unlocked.body.growth_decision.protection.case_study_locked,false);
 assert.equal(searched.length,2,'lock change invalidates in-memory research cache');
 console.log('PASS: source-aligned fresh competitor, preserved historical evidence, one next action, protected Case Study, no writes');
})().catch(e=>{console.error(e);process.exitCode=1});
