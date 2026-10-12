'use strict';
const assert=require('node:assert/strict');
const {registerGrowthGscPageVerification,validateGscQueryRows}=require('./growth-gsc-page-verification.cjs');
const url='https://contentscale.site/google-penalty-recovery/';
function build({locked=false,duplicate=false,empty=false,changeAfter=false,token='service-account'}={}){
 let handler,writes=[],metricsCalls=0,connectCalls=0;
 const app={post:(path,middleware,fn)=>{assert.equal(path,'/api/growth/gsc/verify/:clientId/:pageId');handler=fn;}};
 const tracker={id:2303,tracker_client_id:10,url,html_content:'<!doctype html><html>Original</html>'};
 const pool={query:async(sql)=>{
  if(sql.includes('FROM tracker_pages WHERE id='))return{rows:[tracker]};
  if(sql.includes('FROM tracker_gsc_queries')||sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return{rows:[]};
  if(sql.includes('FROM tracker_case_studies'))return{rows:locked?[{id:1}]:[]};
  if(sql.includes('FROM tracker_clients WHERE id='))return{rows:[{id:10,domain:'contentscale.site'}]};
  if(sql.includes('FROM tracker_pages WHERE url='))return{rows:duplicate?[{id:2303,tracker_client_id:10},{id:2304,tracker_client_id:11}]:[{id:2303,tracker_client_id:10}]};
  throw Error('Unexpected read '+sql);
 },connect:async()=>{
  connectCalls++;
  const connection={query:async(sql,params)=>{
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){writes.push(sql);return{rows:[]};}
   if(sql.includes('FROM tracker_pages WHERE id='))return{rows:[{...tracker,url:changeAfter?'https://other.test/':url}]};
   if(sql.includes('FROM tracker_case_studies'))return{rows:locked?[{id:1}]:[]};
   if(sql.includes('FROM tracker_pages WHERE url='))return{rows:duplicate?[{id:2303,tracker_client_id:10},{id:2304,tracker_client_id:11}]:[{id:2303,tracker_client_id:10}]};
   if(sql.startsWith('DELETE')||sql.startsWith('INSERT')){writes.push({sql,params});return{rows:[]};}
   throw Error('Unexpected txn '+sql);
  },release:()=>{writes.push('RELEASE')}};
  return connection;
 }};
 registerGrowthGscPageVerification({app,pool,verifyGrowthAdmin:(r,s,n)=>n(),
 tokenProvider:async()=>token,now:()=>new Date('2026-10-12T12:00:00Z'),
 metricsProvider:async(property,page,options,auth)=>{
  metricsCalls++;
  assert.equal(page,url);assert.equal(auth,'service-account');
  assert.equal(options.startDate,'2026-09-11');assert.equal(options.endDate,'2026-10-09');
  return{clicks:3,impressions:170,position:18.5,
   topQueries:empty?[]:[{query:'google penalty recovery',clicks:2,impressions:100,position:16},
    {query:'recover google organic traffic',clicks:1,impressions:70,position:22}]};
 }});
 return{handler,writes,metricsCalls:()=>metricsCalls,connectCalls:()=>connectCalls};
}
async function request(s,{confirm=false,admin=true}={}){
 const req={params:{clientId:'10',pageId:'2303'},engineUser:{isAdmin:admin},body:{confirm_import:confirm}};
 const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await s.handler(req,res);return res;
}
(async()=>{
 assert.equal(validateGscQueryRows([{query:'x',clicks:1,impressions:20,position:9}]).length,1);
 assert.equal(validateGscQueryRows([{query:'X',clicks:1,impressions:2,position:9},{query:'x',clicks:0,impressions:3,position:12}]),null);
 assert.equal(validateGscQueryRows([{query:'x',clicks:4,impressions:3,position:9}]),null);
 let s=build(),r=await request(s);
 assert.equal(r.body.status,'VERIFIED_GSC_PREVIEW');
 assert.equal(r.body.summary.query_count,2);
 assert.equal(r.body.summary.property,'sc-domain:contentscale.site');
 assert.equal(s.connectCalls(),0);
 s=build();r=await request(s,{confirm:true});
 assert.equal(r.body.status,'GSC_EXACT_PAGE_VERIFIED');
 assert.equal(r.body.data_imported,true);
 assert(s.writes.includes('COMMIT'));
 assert(s.writes.some(x=>typeof x==='object'&&x.sql.includes('INSERT INTO tracker_gsc_queries')&&x.sql.includes("'page_verified','gsc_api_exact_page_query'")));
 assert(s.writes.some(x=>typeof x==='object'&&x.sql.includes('INSERT INTO growth_gsc_page_import_runs')));
 s=build({locked:true});r=await request(s,{confirm:true});
 assert(r.body.issues.includes('CASE_STUDY_LOCK'));assert.equal(s.connectCalls(),0);
 s=build({duplicate:true});r=await request(s,{confirm:true});
 assert(r.body.issues.includes('DUPLICATE_TRACKER_URL_REVIEW_REQUIRED'));
 s=build({empty:true});r=await request(s,{confirm:true});
 assert(r.body.issues.includes('NO_GSC_EXACT_PAGE_QUERIES'));assert.equal(s.connectCalls(),0);
 s=build({changeAfter:true});r=await request(s,{confirm:true});
 assert(r.body.issues.includes('TRACKER_PAGE_CHANGED'));assert(s.writes.includes('ROLLBACK'));
 s=build();r=await request(s,{admin:false});assert.equal(r.code,403);assert.equal(s.metricsCalls(),0);
 console.log('PASS: exact-page GSC preview/import, canonical provenance, Case Study, duplicate, rollback and zero-query blocks');
})().catch(e=>{console.error(e);process.exitCode=1});
