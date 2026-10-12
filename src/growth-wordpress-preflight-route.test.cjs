'use strict';
const assert=require('node:assert/strict');
const {registerGrowthWordPressPreflightRoute}=require('./growth-wordpress-preflight-route.cjs');
let route;
const app={get:(path,middleware,fn)=>{assert.equal(path,'/api/growth/wordpress/preflight/:clientId/:pageId');assert.equal(typeof middleware,'function');route=fn;}};
const url='https://contentscale.site/example/';
const pool={query:async(sql)=>{
 if(sql.includes('FROM tracker_pages WHERE id='))return{rows:[{id:3,tracker_client_id:7,profile_id:4,url,html_content:'<html></html>'}]};
 if(sql.includes('FROM tracker_gsc_queries'))return{rows:[]};
 if(sql.includes('FROM tracker_case_studies'))return{rows:[]};
 if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return{rows:[]};
 if(sql.includes('FROM tracker_pages WHERE url='))return{rows:[{id:3,tracker_client_id:7}]};
 if(sql.includes('FROM content_profiles'))return{rows:[{id:4,wp_url:'',has_credentials:false}]};
 if(sql.includes('FROM growth_wordpress_page_mapping'))return{rows:[]};
 throw Error('Unexpected SQL '+sql);
}};
registerGrowthWordPressPreflightRoute({app,pool,verifyEngineAccess:(req,res,next)=>next()});
async function request(admin){
 const out={code:200,payload:null,status(n){this.code=n;return this;},json(j){this.payload=j;return this;}};
 await route({engineUser:{isAdmin:admin},params:{clientId:'7',pageId:'3'}},out);
 return out;
}

const {createHash}=require('node:crypto');
let readyRoute;
const expectedHtml='<!doctype html><html><body>Source</body></html>';
const expectedUrl='https://contentscale.site/example/';
const expectedSha=createHash('sha256').update(expectedHtml).digest('hex');
const expectedRaw='<p>WordPress editor source</p>';
const rawSha=createHash('sha256').update(expectedRaw).digest('hex');
const profilePool={query:async(sql)=>{
 if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[{id:3,tracker_client_id:7,profile_id:4,url:expectedUrl,html_content:expectedHtml}]};
 if(sql.includes('FROM tracker_gsc_queries')||sql.includes('FROM tracker_case_studies')||sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
 if(sql.includes('FROM tracker_pages WHERE url='))return {rows:[{id:3,tracker_client_id:7}]};
 if(sql.includes('FROM content_profiles'))return {rows:[{id:4,wp_url:'https://contentscale.site/',wp_user:'editor',wp_app_password:'secret',has_credentials:true}]};
 if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:[]};
 throw Error('Unexpected SQL '+sql);
}};
let requestCalls=0;
registerGrowthWordPressPreflightRoute({
 app:{get:(path,auth,handler)=>{readyRoute=handler;}},
 pool:profilePool,
 verifyEngineAccess:(req,res,next)=>next(),
 fetchImpl:async(endpoint,options)=>{
  requestCalls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>endpoint.includes('/posts?')?[{id:42,link:expectedUrl,status:'publish',modified_gmt:'2026-10-12T10:00:00',content:{raw:expectedRaw}}]:[]};
 }
});
const readyResponse={code:200,status(n){this.code=n;return this;},json(j){this.payload=j;return this;}};

(async()=>{
 const denied=await request(false);assert.equal(denied.code,403);
 const blocked=await request(true);
 assert.equal(blocked.payload.status,'BLOCKED');
 assert(blocked.payload.issues.includes('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED'));
 assert(blocked.payload.issues.includes('REVIEWED_WORDPRESS_MAPPING_REQUIRED'));
 assert.equal(blocked.payload.publication_allowed,false);
 await readyRoute({engineUser:{isAdmin:true},params:{clientId:'7',pageId:'3'}},readyResponse);
 assert.equal(readyResponse.payload.status,'REVIEW_REQUIRED');
 assert.equal(readyResponse.payload.next_action,'APPROVE_VERIFIED_WORDPRESS_MAPPING');
 assert.equal(readyResponse.payload.candidate.post_id,42);
 assert.equal(readyResponse.payload.candidate.raw_sha256,rawSha);
 assert.equal(readyResponse.payload.tracker.source_sha256,expectedSha);
 assert.equal(requestCalls,2);
 console.log('PASS: admin preflight discovers a unique authenticated WP candidate with immutable revision and source hash');
})().catch(e=>{console.error(e);process.exitCode=1});
