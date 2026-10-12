'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {registerGrowthWordPressApprovalRoute}=require('./growth-wordpress-identity-approval-route.cjs');
const url='https://contentscale.site/example/';
const html='<!doctype html><html><p>Original approved source</p></html>';
const hash=createHash('sha256').update(html).digest('hex');
const post={id:42,link:url,status:'publish',modified_gmt:'2026-10-12T10:00:00',content:{raw:'<p>WordPress source</p>'}};
async function scenario({caseLocked=false,duplicates=false,changed=false,wpChanged=false,missingCredentials=false}={}){
 let handler,writes=[],queries=[],released=false;
 const app={post:(path,middleware,fn)=>{assert.equal(path,'/api/growth/wordpress/mapping/:clientId/:pageId/approve');handler=fn;}};
 const client={query:async(sql,args)=>{
  queries.push(sql);
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){writes.push(sql);return{rows:[]};}
  if(sql.includes('FROM tracker_pages WHERE id='))return{rows:[{id:3,tracker_client_id:7,url,html_content:changed?html+' changed':html}]};
  if(sql.includes('FROM tracker_case_studies'))return{rows:caseLocked?[{id:1}]:[]};
  if(sql.includes('FROM tracker_pages WHERE url='))return{rows:duplicates?[{id:3,tracker_client_id:7},{id:4,tracker_client_id:9}]:[{id:3,tracker_client_id:7}]};
  if(sql.includes('INSERT INTO growth_wordpress_page_mapping')){
   assert.equal(args[0],7);assert.equal(args[1],3);assert.equal(args[2],42);
   assert.equal(args[6],hash);assert.equal(args[7],'admin:12');
   writes.push('INSERT');return{rows:[{id:9}]};
  }
  throw Error('Unexpected SQL '+sql);
 },release:()=>{released=true;}};
 const pool={query:async(sql,args)=>{
  assert.match(sql,/JOIN content_profiles/);
  return{rows:[{id:3,tracker_client_id:7,profile_id:4,url,html_content:html,wp_url:'https://contentscale.site/',wp_user:missingCredentials?'':'editor',wp_app_password:missingCredentials?'':'secret'}]};
 },connect:async()=>client};
 const fetchImpl=async(endpoint,options)=>{
  assert.match(endpoint,/wp-json\/wp\/v2\/posts\/42\?context=edit/);
  assert.equal(options.method,'GET');return{ok:true,json:async()=>({...post,modified_gmt:wpChanged?'2026-10-12T11:00:00':post.modified_gmt})};
 };
 registerGrowthWordPressApprovalRoute({app,pool,verifyGrowthAdmin:(r,s,n)=>n(),fetchImpl});
 const req={engineUser:{isAdmin:true,adminId:12},params:{clientId:'7',pageId:'3'},
  body:{wordpress_post_id:42,expected_source_sha256:hash,expected_modified_gmt:post.modified_gmt,confirm_identity_reviewed:true}};
 const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler(req,res);
 return{res,writes,queries,released,handler,req};
}
(async()=>{
 let s=await scenario();assert.equal(s.res.body.status,'MAPPING_REVIEWED');assert(s.writes.includes('COMMIT'));assert(s.released);
 s=await scenario({caseLocked:true});assert(s.res.body.issues.includes('CASE_STUDY_LOCK'));assert(s.writes.includes('ROLLBACK'));assert(!s.writes.includes('INSERT'));
 s=await scenario({duplicates:true});assert(s.res.body.issues.includes('DUPLICATE_TRACKER_URL'));assert(!s.writes.includes('INSERT'));
 s=await scenario({changed:true});assert(s.res.body.issues.includes('TRACKER_SOURCE_CHANGED'));
 s=await scenario({wpChanged:true});assert(s.res.body.issues.includes('WORDPRESS_REVISION_CHANGED_OR_UNVERIFIED'));
 s=await scenario({missingCredentials:true});assert(s.res.body.issues.includes('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED'));
 s=await scenario();s.req.engineUser.isAdmin=false;const denied={code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};
 await s.handler(s.req,denied);assert.equal(denied.code,403);
 console.log('PASS: transactional WordPress mapping approval, active Case Study, stale revisions, duplicates and admin restriction');
})().catch(err=>{console.error(err);process.exitCode=1});
