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
(async()=>{
 const denied=await request(false);assert.equal(denied.code,403);
 const blocked=await request(true);
 assert.equal(blocked.payload.status,'BLOCKED');
 assert(blocked.payload.issues.includes('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED'));
 assert(blocked.payload.issues.includes('REVIEWED_WORDPRESS_MAPPING_REQUIRED'));
 assert.equal(blocked.payload.publication_allowed,false);
 console.log('PASS: real guarded Growth preflight, credentials and mapping blockers');
})().catch(e=>{console.error(e);process.exitCode=1});
