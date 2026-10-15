'use strict';
const assert=require('node:assert/strict');
const {registerGrowthLiveRoutes}=require('./growth-live-routes.cjs');
const url='https://contentscale.site/google-penalty-recovery/';
function fixture({admin=true,locked=false,duplicates=false,queries=1,runs=[],historyTableMissing=false,queryText='google penalty recovery'}={}){
 const routes={};let writes=0;
 const app={get:(path,...handlers)=>routes['GET '+path]=handlers,post:(path,...handlers)=>routes['POST '+path]=handlers};
 const pool={query:async(sql,args)=>{
  if(sql.includes('FROM growth_gsc_page_import_runs')){
   assert.deepEqual(args,[10,2303,url],'read-only history must be scoped to tenant, page and canonical URL');
   if(historyTableMissing)throw Object.assign(Error('relation does not exist'),{code:'42P01'});
   return {rows:runs};
  }
  if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[{id:2303,tracker_client_id:10,url,html_content:'<html>Source</html>',serp_spy:{found:true}}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:queries?[{tracker_client_id:10,page_id:2303,source_page_url:url,evidence_scope:'page_verified',query:queryText,impressions:120,clicks:0,position:38,imported_at:new Date().toISOString()}]:[]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:1}]:[]};
  if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
  if(sql.includes('FROM tracker_pages WHERE url='))return {rows:duplicates?[{id:2303},{id:999}]:[{id:2303}]};
  if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:[]};
  if(sql.includes('FROM content_profiles'))return {rows:[]};
  throw Error('Unexpected SQL: '+sql);
 }};
 registerGrowthLiveRoutes({app,pool,verifyEngineAccess:(req,res,next)=>next(),fetchExactGsc:async()=>{writes++;return {page_checked:true,saved:3};}});
 async function request(method,kind=method==='GET'?'readiness':'refresh-gsc'){const h=routes[method+' /api/growth/admin/pages/:pageId/'+kind];
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
 assert.equal(r.body.next_action,'CONFIGURE_WORDPRESS_PROFILE');
 assert.equal(f.writes(),0);
 r=await f.request('POST');assert.equal(r.body.verified_queries,3);assert.equal(f.writes(),1);
 f=fixture({admin:false});r=await f.request('POST');assert.equal(r.statusCode,403);assert.equal(f.writes(),0);
 f=fixture({locked:true});r=await f.request('GET');assert.equal(r.body.next_action,'PRESERVE_CASE_STUDY_BASELINE');r=await f.request('POST');assert.equal(r.statusCode,409);assert.equal(f.writes(),0);
 f=fixture({duplicates:true,queries:0});r=await f.request('GET');assert(r.body.issues.includes('DUPLICATE_TRACKER_URL'));assert(r.body.issues.includes('EXACT_PAGE_GSC_QUERIES_REQUIRED'));
 f=fixture({queryText:'chimney flashing nj'});r=await f.request('GET','click-opportunities');
 assert.equal(r.statusCode,200);
 assert(r.body.queries.some(x=>x.query==='chimney flashing nj'&&x.commercial_intent_signal===true),'real chimney/flashing demand is commercial');
 // Read-only outcome comparisons must never require a draft or overwrite Case Studies.
 f=fixture();r=await f.request('GET','outcomes');
 assert.equal(r.body.status,'NO_VERIFIED_GSC_HISTORY');
 assert.equal(f.writes(),0);
 const sourceWindow=(start_date,end_date,clicks,impressions)=>({
  page_url:url,gsc_property:'sc-domain:contentscale.site',start_date,end_date,clicks,impressions,
  query_count:2,position:42,imported_at:'2026-10-13T00:00:00Z'
 });
 f=fixture({runs:[sourceWindow('2026-09-15','2026-10-12',2,100),
   sourceWindow('2026-08-18','2026-09-14',0,120)]});
 r=await f.request('GET','outcomes');
 assert.equal(r.body.status,'READY_FOR_RESULT_REVIEW');
 assert.equal(r.body.changes.clicks,2);
 assert.equal(r.body.attribution_established,false);
 assert.equal(r.body.publication_allowed,false);
 f=fixture({admin:false});r=await f.request('GET','outcomes');assert.equal(r.statusCode,403);
 f=fixture({historyTableMissing:true});r=await f.request('GET','outcomes');
 assert.equal(r.statusCode,503);
 assert.equal(r.body.code,'GSC_HISTORY_SCHEMA_REQUIRED');
 f=fixture({locked:true,runs:[sourceWindow('2026-09-15','2026-10-12',2,100),
   sourceWindow('2026-08-18','2026-09-14',0,120)]});
 r=await f.request('GET','outcomes');
 assert.equal(r.body.case_study_locked,true);
 assert.equal(r.body.publication_allowed,false);

 console.log('PASS: actual Growth admin routes, no WP writes, adjacent GSC outcome windows and Case Study guards');
})().catch(e=>{console.error(e);process.exitCode=1});
