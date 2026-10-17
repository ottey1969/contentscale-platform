'use strict';
const assert=require('node:assert/strict');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const ownUrl='https://example.org/roof-repair/';
let active=false,saved=false,writes=0,aiCalls=0,fetchCalls=0;
const original='<html><h1>Roof repair</h1><p>A roof inspection can establish the observed condition before a repair is proposed.</p><p>Check the project scope and review the existing materials before discussing options.</p></html>';
const pool={async query(sql,args){
 if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes++;throw Error('Writes forbidden')}
 if(sql.includes('FROM tracker_clients'))return {rows:args[0]==='owner-token'?[{id:4,domain:'example.org',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_snapshots'))return {rows:[{checked_at:'2026-10-10T08:00:00Z',google_competitors:[{url:'https://other.example/a',title:'Roof inspection guide'}],ai_perplexity_competitors:[]}]};
 if(sql.includes('FROM tracker_pages p'))return {rows:[{id:17,url:ownUrl,html_content:saved?original:null,keyword:'roof repair',case_study_active:active}]};
 if(sql.includes('FROM tracker_pages WHERE url=')){assert.equal(args[1],4);return{rows:[{id:17,tracker_client_id:4}]}};
 throw Error('Unexpected SQL '+sql);
}};
const routes={};
registerTrackerGrowthCmsExport({get(){},post:(p,fn)=>{routes[p]=fn}},pool,{
 fetchLive:async()=>{fetchCalls++;return{html:original,final_url:ownUrl}},
 generateDraft:async x=>{aiCalls++;assert.equal(x.pageUrl,ownUrl);assert.equal(x.sourceHtml,original);assert.deepEqual(x.topics,['Roof inspection guide']);
  return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:[{h2:'Inspection steps',paragraphs:['A reviewed explanation requiring editor consent.']}],editor_approved:false}}}
});
async function run(token='owner-token',page_id=17){
 const req={params:{token},body:{page_id,focus_query:'roof repair'}};
 const res={statusCode:200,headers:{},status(x){this.statusCode=x;return this},set(k,v){this.headers[k]=v;return this},json(x){this.body=x;return this}};
 await routes['/api/tracker-client/:token/growth/cms-export/editor-draft'](req,res);return res;
}
(async()=>{
 let r=await run();assert.equal(r.statusCode,200);assert.equal(r.body.success,true);
 assert.equal(r.body.historical_competitor_titles_used,1);
 assert.equal(r.body.auto_publishing,false);assert.equal(r.body.no_gsc_requirement,true);assert.equal(aiCalls,1);assert.equal(fetchCalls,1);
 assert.equal((await run('readonly-token')).statusCode,403);
 active=true;assert.equal((await run()).statusCode,409);active=false;
 saved=true;r=await run();assert.equal(r.statusCode,200);assert.equal(fetchCalls,1);
 assert.equal(aiCalls,2);assert.equal(writes,0);
 console.log('PASS owner-only Growth AI editor draft route without GSC, CMS writes or Case Study override');
})().catch(e=>{console.error(e);process.exitCode=1});