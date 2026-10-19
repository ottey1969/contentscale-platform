'use strict';
const assert=require('node:assert/strict');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const ownUrl='https://example.org/roof-repair/';
let active=false,saved=false,writes=0,aiCalls=0,fetchCalls=0;
let liveHtml=null,liveFailed=false;
const original='<html><h1>Roof repair</h1><p>A roof inspection can establish the observed condition before a repair is proposed.</p><p>Check the project scope and review the existing materials before discussing options.</p></html>';
liveHtml=original;
const refreshed=original.replace('A roof inspection can establish the observed condition before a repair is proposed.','A current roof inspection records visible conditions and confirms material details before any repair options are recommended.');
const pool={async query(sql,args){
 if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes++;throw Error('Writes forbidden')}
 if(sql.includes('FROM tracker_clients'))return {rows:args[0]==='owner-token'?[{id:4,domain:'example.org',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_snapshots'))return {rows:[{checked_at:'2026-10-10T08:00:00Z',google_competitors:[{url:'https://other.example/a',title:'Roof inspection guide'},{url:'https://other.example/detector',title:'BrandWell AI detector review'}],ai_perplexity_competitors:[]}]};
 if(sql.includes('FROM tracker_pages p'))return {rows:[{id:17,url:ownUrl,html_content:saved?original:null,keyword:'roof repair',case_study_active:active}]};
 if(sql.includes('FROM tracker_pages WHERE url=')){assert.equal(args[1],4);return{rows:[{id:17,tracker_client_id:4}]}};
 throw Error('Unexpected SQL '+sql);
}};
const routes={};
registerTrackerGrowthCmsExport({get(){},post:(p,fn)=>{routes[p]=fn}},pool,{
 fetchLive:async()=>{fetchCalls++;if(liveFailed)throw Error('temporary fetch failure');return{html:liveHtml,final_url:ownUrl,retrieved_at:'2026-10-19T12:00:00Z'}},
 generateDraft:async x=>{aiCalls++;assert.equal(x.pageUrl,ownUrl);assert.equal(x.sourceHtml,liveFailed?original:liveHtml);assert.deepEqual(x.topics,x.researchObservations?.length?['Audit before scaling']:['Roof inspection guide']);
  return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:[{h2:'Inspection steps',paragraphs:['A reviewed explanation requiring editor consent.']}],editor_approved:false}}}
});
async function run(token='owner-token',page_id=17,research_context=null){
 const req={params:{token},body:{page_id,focus_query:'roof repair',research_context}};
 const res={statusCode:200,headers:{},status(x){this.statusCode=x;return this},set(k,v){this.headers[k]=v;return this},json(x){this.body=x;return this}};
 await routes['/api/tracker-client/:token/growth/cms-export/editor-draft'](req,res);return res;
}
(async()=>{
 let r=await run();assert.equal(r.statusCode,200);assert.equal(r.body.success,true);
 assert.equal(r.body.historical_competitor_titles_used,1);
 assert.equal(r.body.auto_publishing,false);assert.equal(r.body.no_gsc_requirement,true);assert.equal(aiCalls,1);assert.equal(fetchCalls,1);
 r=await run();assert.equal(r.statusCode,200);
 assert.equal(aiCalls,1,'same source/query editor draft must reuse the model result');
 assert.equal(fetchCalls,2);
 assert.equal((await run('readonly-token')).statusCode,403);
 active=true;r=await run();assert.equal(r.statusCode,200,'research-only editorial drafts work during Case Study');
 assert.equal(r.body.case_study_locked,true);assert.equal(r.body.review_only,true);
 assert.equal(r.body.auto_publishing,false);assert.equal(aiCalls,2);assert.equal(fetchCalls,3);
 active=false;
 saved=true;liveHtml=refreshed;
 r=await run();assert.equal(r.statusCode,200);assert.equal(fetchCalls,4);
 assert.equal(r.body.draft_source_type,'LIVE_PUBLIC_HTML','fresh public page must override stale saved HTML');
 assert.equal(r.body.draft_source_retrieved_at,'2026-10-19T12:00:00Z');
 assert.equal(aiCalls,3);
 liveFailed=true;r=await run();assert.equal(r.statusCode,200);assert.equal(fetchCalls,5);
 assert.equal(r.body.draft_source_type,'TRACKER_SAVED_HTML_FALLBACK');
 assert.equal(r.body.draft_source_warning,'LIVE_SOURCE_UNAVAILABLE_OR_INCOMPLETE');
 assert.equal(aiCalls,4,'saved fallback cannot reuse draft cache from live source');
 liveFailed=false;liveHtml=refreshed;
 const researched={target_url:ownUrl,focus_query:'roof repair',observations:[
  {competitor_url:'https://editor.example/roof-guide/',competitor_heading:'Audit before scaling',
   competitor_excerpt:'A complete original guide first inventories real service pages and checks the reader tasks each answer provides. This is competitor context only and must not be presented as a verified factual gap.'}]};
 r=await run('owner-token',17,researched);
 assert.equal(r.statusCode,200);
 assert.equal(r.body.live_competitor_observations_used,1);
 assert.equal(r.body.research_context_scope,'UNTRUSTED_RESEARCH_QUESTIONS_ONLY');
 assert.equal(r.body.historical_competitor_titles_used,0);
 assert.equal(r.body.historical_snapshot_checked_at,null,'old snapshots are not needed when live research is present');
 assert.equal(aiCalls,5,'live research context generates its own review-only draft');
 assert.equal(writes,0);
 console.log('PASS owner-only Growth draft under Case Study with safe cache, no GSC requirement, no CMS writes');
})().catch(e=>{console.error(e);process.exitCode=1});