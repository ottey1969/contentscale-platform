'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
test('tracked same-page Growth destination is recognized without GSC',async()=>{
 const url='https://contentscale.site/ai-overview-optimization/',id=2358,client=8;
 const html='<html><head><title>AI Overview Optimization: Complete Technical SEO Guide</title></head><body><h1>AI Overview Optimization: Complete Technical SEO Guide</h1><h2>Technical steps</h2><p>Review crawlability and accessibility and maintain clear useful answers on the existing content page before publishing edits.</p></body></html>';
 const routes={},writes=[];
 const db={async query(sql,args){
  if(/^\\s*(?:UPDATE|INSERT|DELETE|ALTER|CREATE)\\b/i.test(sql)){writes.push(sql);throw Error('Read-only required')}
  if(sql.includes('LEFT(html_content'))return {rows:[{id,tracker_client_id:client,url,keyword:'ai overview optimization',saved_html:html}]};
  if(sql.includes('FROM tracker_gsc_queries')){assert.equal(args[0],client);assert.equal(args[1],id);assert.equal(args[2],url);return {rows:[]}};
  return {rows:[]};
 }};
 const page={id,url,keyword:'ai overview optimization',case_study_active:false};
 const data=(req,res,next)=>{req.growthTrackerClientId=client;req.growth={can_edit:true,pages:[page]};next()};
 registerGrowthAutomaticResearch({get(path,...handlers){routes[path]=handlers},post(path,...handlers){routes[path]=handlers}},db,data,{
  fetchLive:async target=>{assert.equal(target,url);return {html,final_url:url,retrieved_at:'2026-10-21T04:00:00Z',truncated:false}},
  searchLive:async()=>({status:'NO_RELEVANT_PUBLIC_SEARCH_LEADS',source:'BING_PUBLIC_RSS',leads:[]})
 });
 const req={params:{token:'owner'},query:{page_id:String(id)}};
 const res={statusCode:200,status(v){this.statusCode=v;return this},set(){return this},json(v){this.body=v;return this}};
 const stack=routes['/api/tracker-client/:token/growth/auto-research'];
 await new Promise((resolve,reject)=>{
  try{stack[0](req,res,()=>Promise.resolve(stack[1](req,res)).then(resolve,reject))}catch(e){reject(e)}
 });
 assert.equal(res.statusCode,200);
 assert.equal(res.body.destination_gsc_evidence.target_url,url);
 assert.equal(res.body.destination_gsc_evidence.target_page_id,id);
 assert.equal(res.body.destination_gsc_evidence.status,'NO_VERIFIED_DESTINATION_ROWS');
 assert.equal(res.body.destination_gsc_evidence.exact_query_verified,false);
 assert.equal(res.body.editorial_review_draft.status,'RESEARCH_ONLY_OWNER_COMPLETION_NOT_RUN');
 assert.deepEqual(writes,[]);
});
