'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {registerGrowthCmsHandoffRoute}=require('./growth-cms-handoff-route.cjs');
const source='<article><h1>Roofing</h1><p>Original roofing images and source design remain untouched.</p></article>';
const hash=createHash('sha256').update(source).digest('hex');
const url='https://roofer.example/roof-service/';
const page={id:22,tracker_client_id:7,profile_id:4,url,html_content:source,serp_spy:{}};
let locked=false,duplicates=false,dbWrites=0;
const pool={query:async(sql,args=[])=>{
 if(/^\s*(UPDATE|INSERT|DELETE|ALTER|CREATE)/i.test(sql)){dbWrites++;throw Error('Unexpected write');}
 if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[page]};
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:7,page_id:22,source_page_url:url,evidence_scope:'page_verified',query:'roof repair nj',clicks:0,impressions:300,position:34}]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:2}]:[]};
 if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return{rows:[]};
 if(sql.includes('FROM tracker_pages WHERE url='))return{rows:duplicates?[{id:22,tracker_client_id:7},{id:23,tracker_client_id:9}]:[{id:22,tracker_client_id:7}]};
 throw Error('Unrecognized query '+sql);
}};
const app={routes:{},post(path,...middleware){this.routes['POST '+path]=middleware},get(path,...middleware){this.routes['GET '+path]=middleware}};
registerGrowthCmsHandoffRoute({app,pool,verifyEngineAccess:(req,res,next)=>next()});
const endpoint=app.routes['POST /api/growth/admin/pages/:pageId/cms-handoff'];assert.equal(endpoint.length,3);
async function call(overrides={},admin=true){
 const body={client_id:7,source_sha256:hash,editor_approved:true,cms:'wix',
 seo_title:'Roof Repair NJ | Verified Local Options',
 meta_description:'Roofing repair, roof leak inspection, and details about local roofing services.',
 evidence_scope:'needs_access',format:'json',
 approved_changes:[{approved:true,evidence_ref:'observed:manual-page-review',
  html:'<section><h2>What is included in a roof leak assessment?</h2><p>Roofing inspections evaluate accessible flashing, drainage and shingles. Confirm a suitable appointment before work begins.</p></section>'}],
 ...overrides};
 const req={params:{pageId:'22'},engineUser:{isAdmin:admin},body},res={
  statusCode:200,headers:{},status(v){this.statusCode=v;return this},
  set(k,v){this.headers[k]=v;return this},json(x){this.payload=x;return this},
  send(x){this.payload=x;return this}
 };
 const next=(i)=>{const fn=endpoint[i];if(fn)return fn(req,res,()=>next(i+1))};
 await next(0);return res;
}
(async()=>{
 const screen=app.routes['GET /growth/cms-handoff'];
 assert.equal(screen.length,1);
 const screenRes={headers:{},set(k,v){this.headers[k]=v;return this},
  type(x){this.contentType=x;return this},send(x){this.body=x;return this}};
 screen[0]({},screenRes);
 assert.equal(screenRes.contentType,'html');
 assert.equal(screenRes.headers['X-Robots-Tag'],'noindex, nofollow');
 assert(screenRes.body.includes('Wix'));
 assert(screenRes.body.includes('contentscale-growth-'));
 assert(screenRes.body.includes('revenueFields'));
 assert(screenRes.body.includes('daily-breakthrough?client_id='));
 assert(screenRes.body.includes('publishedOn'));
 assert(screenRes.body.includes('measured_click_lift_candidate'));

 assert(screenRes.body.includes("revenue_mode:'intent_to_revenue'"));
 assert(screenRes.body.includes("previewResult.revenue_status!=='READY_FOR_EDITOR'"));
 assert(screenRes.body.includes('offerVerified'));

 assert(screenRes.body.includes('/cms-handoff/source?client_id='));
 assert(screenRes.body.includes('Goed')||screenRes.body.includes('goedgekeurde'));
 assert(!screenRes.body.includes('WordPress Application Password'));
 const sourceStack=app.routes['GET /api/growth/admin/pages/:pageId/cms-handoff/source'];
 assert.equal(sourceStack.length,3);
 const sourceReq={engineUser:{isAdmin:true},params:{pageId:'22'},query:{client_id:'7'}};
 const sourceRes={statusCode:200,headers:{},status(n){this.statusCode=n;return this},
  set(k,v){this.headers[k]=v;return this},json(x){this.payload=x;return this}};
 let index=0;const run=()=>{const fn=sourceStack[index++];if(fn)return fn(sourceReq,sourceRes,run)};
 await run();
 assert.equal(sourceRes.payload.source_sha256,hash);
 assert.equal(sourceRes.payload.wordpress_required,false);
 assert.equal(sourceRes.payload.paid_api_required,false);
 assert.deepEqual(sourceRes.payload.page_verified_query_examples,['roof repair nj']);
 let r=await call();
 assert.equal(r.statusCode,200,JSON.stringify(r.payload));
 assert.equal(r.payload.status,'HANDOFF_READY_FOR_EDITOR');
 assert.equal(r.payload.manifest.cms,'wix');
 assert.equal(r.payload.manifest.evidence_scope,'needs_access');
 assert.equal(r.payload.files.length,6);
 assert.equal(dbWrites,0);
 r=await call({revenue_mode:'intent_to_revenue',focus_query:'roof leaks',
  offers:{roof_leak:{url:'https://roofer.example/roof-inspection/',available:true,claimsVerified:true}}});
 assert.equal(r.statusCode,200,JSON.stringify(r.payload));
 assert.equal(r.payload.status,'UNIFIED_HANDOFF_READY_FOR_EDITOR');
 assert.equal(r.payload.files.length,9);
 assert(r.payload.files.find(f=>f.name==='06-revenue-cta.html').content.includes('Request inspection'));
 assert.equal(r.payload.manifest.publication_allowed,false);
 r=await call({revenue_mode:'intent_to_revenue',focus_query:'roof leaks',offers:{}});
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.status,'EDITORIAL_HANDOFF_READY_REVENUE_NEEDS_EVIDENCE');
 assert(!r.payload.files.find(f=>f.name==='06-revenue-cta.html').content.includes('<aside'));
 r=await call({revenue_mode:'intent_to_revenue',focus_query:'roof leaks',format:'zip',
  offers:{roof_leak:{url:'https://roofer.example/roof-inspection/',available:true,claimsVerified:true}}});
 assert(Buffer.isBuffer(r.payload));assert.equal(r.payload.readUInt16LE(r.payload.length-22+10),9);
 r=await call({revenue_mode:'bogus'});
 assert.equal(r.statusCode,400);
 r=await call({format:'zip'});
 assert(Buffer.isBuffer(r.payload));
 assert.equal(r.statusCode,200);
 assert.equal(r.headers['Content-Type'],'application/zip');
 assert.equal(r.payload.readUInt32LE(0),0x04034b50);
 r=await call({evidence_scope:'verified',focus_query:'roof repair nj'});
 assert.equal(r.statusCode,200);assert.equal(r.payload.manifest.evidence_scope,'verified');
 r=await call({evidence_scope:'verified',focus_query:'not recorded'});
 assert.equal(r.statusCode,409);assert.equal(r.payload.code,'VERIFIED_GSC_EVIDENCE_NOT_FOUND');
 r=await call({},false);assert.equal(r.statusCode,403);
 r=await call({source_sha256:'a'.repeat(64)});assert.equal(r.statusCode,409);assert.equal(r.payload.code,'TRACKER_SOURCE_CHANGED');
 locked=true;r=await call();assert.equal(r.statusCode,409);assert(r.payload.issues.includes('CASE_STUDY_BASELINE_LOCKED'));locked=false;
 duplicates=true;r=await call();assert.equal(r.statusCode,409);assert.equal(r.payload.code,'DUPLICATE_CANONICAL_PAGE_IDENTITY');duplicates=false;
 r=await call({editor_approved:false});assert.equal(r.statusCode,409);
 r=await call({cms:'webflow',evidence_scope:'observed'});assert.equal(r.statusCode,200);
 assert.equal(dbWrites,0);
 console.log('PASS: CMS-neutral Tracker route makes Wix ZIP and manual bundle without WP/GSC; refuses forged evidence, locks and stale source');
})().catch(e=>{console.error(e);process.exitCode=1});
