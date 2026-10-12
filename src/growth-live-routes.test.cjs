'use strict';
const assert=require('node:assert/strict');
const {registerGrowthLiveRoutes}=require('./growth-live-routes.cjs');
const url='https://contentscale.site/google-penalty-recovery/';
function fixture({admin=true,locked=false,duplicates=false,queries=1}={}){
 const routes={};let writes=0;
 const app={get:(path,...handlers)=>routes['GET '+path]=handlers,post:(path,...handlers)=>routes['POST '+path]=handlers};
 const pool={query:async(sql)=>{
  if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[{id:2303,tracker_client_id:10,url,html_content:'<html>Source</html>',serp_spy:{found:true}}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:queries?[{tracker_client_id:10,page_id:2303,source_page_url:url,evidence_scope:'page_verified',query:'google penalty recovery'}]:[]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:1}]:[]};
  if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
  if(sql.includes('FROM tracker_pages WHERE url='))return {rows:duplicates?[{id:2303},{id:999}]:[{id:2303}]};
  if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:[]};
  if(sql.includes('FROM content_profiles'))return {rows:[]};
  throw Error('Unexpected SQL: '+sql);
 }};
 registerGrowthLiveRoutes({app,pool,verifyEngineAccess:(req,res,next)=>next(),fetchExactGsc:async()=>{writes++;return {page_checked:true,saved:3};}});
 async function request(method){const h=routes[method+' /api/growth/admin/pages/:pageId/'+(method==='GET'?'readiness':'refresh-gsc')];
  const req={engineUser:{isAdmin:admin},params:{pageId:'2303'},query:{client_id:'10'},body:{client_id:10}};
  const response={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
  let i=0;const next=()=>{const cb=h[i++];if(cb)return cb(req,response,next)};
  await next();return response;
 }
 return {request,writes:()=>writes};
}
(async()=>{
 let f=fixture();let r=await f.request('GET');
 assert.equal(r.body.success,true);assert.equal(r.body.status,'BLOCKED');
 assert(r.body.issues.includes('WORDPRESS_CREDENTIALS_REQUIRED'));
 assert(r.body.issues.includes('REVIEWED_WORDPRESS_MAPPING_REQUIRED'));
 assert.equal(f.writes(),0);
 r=await f.request('POST');assert.equal(r.body.verified_queries,3);assert.equal(f.writes(),1);
 f=fixture({admin:false});r=await f.request('POST');assert.equal(r.statusCode,403);assert.equal(f.writes(),0);
 f=fixture({locked:true});r=await f.request('POST');assert.equal(r.statusCode,409);assert.equal(f.writes(),0);
 f=fixture({duplicates:true,queries:0});r=await f.request('GET');assert(r.body.issues.includes('DUPLICATE_TRACKER_URL'));assert(r.body.issues.includes('EXACT_PAGE_GSC_QUERIES_REQUIRED'));
 console.log('PASS: actual Growth admin routes, no WP writes, exact-page GSC and Case Study guards');
})().catch(e=>{console.error(e);process.exitCode=1});
