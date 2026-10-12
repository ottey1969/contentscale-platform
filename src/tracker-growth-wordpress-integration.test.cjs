'use strict';
const assert=require('node:assert/strict');
const {registerGrowthExecution}=require('./tracker-growth-execution.cjs');
const url='https://contentscale.site/reputation-crisis-management-1/';
const endpoints={};
const app={
 get:(path,...handlers)=>{endpoints[path]={method:'GET',handlers};},
 post:(path,...handlers)=>{endpoints[path]={method:'POST',handlers};}
};
let writes=0;
const pool={query:async(sql,args)=>{
 if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(sql)){writes++;throw Error('Write forbidden during preflight');}
 if(sql.includes('FROM super_admins'))return {rows:args[0]==='valid_admin'?[{id:1}]:[]};
 if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[{id:2318,profile_id:4,tracker_client_id:10,url,html_content:'<!doctype html><html></html>'}]};
 if(sql.includes('FROM tracker_gsc_queries')||sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots')||sql.includes('FROM tracker_case_studies'))return {rows:[]};
 if(sql.includes('FROM tracker_pages WHERE url='))return {rows:[{id:2318,tracker_client_id:10}]};
 if(sql.includes('FROM content_profiles'))return {rows:[{id:4,wp_url:'',has_credentials:false}]};
 if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:[]};
 throw Error('Unexpected SQL: '+sql);
}};
registerGrowthExecution(app,pool);
assert(endpoints['/api/tracker-client/:token/growth/publication']);
const route=endpoints['/api/growth/wordpress/preflight/:clientId/:pageId'];
assert(route);assert.equal(route.handlers.length,2);
async function invoke(token){
 const req={headers:{'x-admin-key':token},params:{clientId:'10',pageId:'2318'},engineUser:null};
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(obj){this.body=obj;return this}};
 let next=false;
 await route.handlers[0](req,res,()=>{next=true});
 if(next)await route.handlers[1](req,res);
 return res;
}
(async()=>{
 const denied=await invoke('wrong');assert.equal(denied.statusCode,403);
 const verified=await invoke('valid_admin');
 assert.equal(verified.statusCode,200);
 assert.equal(verified.body.status,'BLOCKED');
 assert(verified.body.issues.includes('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED'));
 assert(verified.body.issues.includes('REVIEWED_WORDPRESS_MAPPING_REQUIRED'));
 assert.equal(writes,0);
 console.log('PASS: canonical Tracker Growth boot registers admin-only live WordPress preflight without DB writes');
})().catch(e=>{console.error(e);process.exitCode=1});
