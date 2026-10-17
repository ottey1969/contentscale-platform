'use strict';
const assert=require('node:assert/strict');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const {registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const sameUrl='https://example.org/roof/';
const p1={id:50,tracker_client_id:3,url:sameUrl,html_content:'<main><h1>Roofing</h1><p>Real saved original page.</p></main>',keyword:'roof repair'};
const p2={id:91,tracker_client_id:99,url:sameUrl,html_content:'<h1>Another client snapshot</h1>',keyword:'roof repair'};
let locked=false,withinClientDuplicate=false,writes=0;
const seen=[];
const pool={async query(sql,args=[]){
 seen.push({sql,args});
 if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(sql)){writes++;throw Error('Read only test must not write')}
 if(sql.includes('FROM tracker_clients'))return{rows:args[0]==='owner-token'?[{id:3,domain:'example.org',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_pages p'))return{rows:[{...p1,case_study_active:locked,gsc_impressions:null,gsc_clicks:null,gsc_position:null,brief_content:null}]};
 if(sql.includes('FROM tracker_pages WHERE url=')){
  assert.match(sql,/\btracker_client_id=\$2/,'Must filter duplicates for this client');
  assert.equal(args[0],sameUrl);assert.equal(args[1],3);
  const candidates=[p1,p2,...(withinClientDuplicate?[{...p1,id:51}]:[])];
  return {rows:candidates.filter(p=>p.url===args[0]&&p.tracker_client_id===args[1])};
 }
 if(sql.includes('FROM tracker_gsc_queries q'))return {rows:[]};
 throw Error('Unexpected SQL: '+sql);
}};
const routes={};
const app={get(path,...handlers){routes['GET '+path]=handlers},post(path,...handlers){routes['POST '+path]=handlers}};
registerGrowthCockpit(app,pool);
async function invoke(path,token='owner-token',query={page_id:'50'},body={}){
 const req={params:{token},query,body};
 const res={code:200,headers:{},status(n){this.code=n;return this},set(k,v){this.headers[k]=v;return this},
  type(v){this.mime=v;return this},send(v){this.body=v;return this},json(v){this.body=v;return this}};
 const stack=routes['GET '+path]; assert(stack,'route '+path+' registered');
 const chain=async i=>stack[i]&&stack[i](req,res,()=>chain(i+1));
 await chain(0);return res;
}
(async()=>{
 let page=await invoke('/track/:token/growth/cms-export');
 assert.equal(page.code,200,'Cross-client URL reuse must NOT block rightful owner');
 assert.match(page.body,/CMS-independent Growth handoff/);
 assert.equal((await invoke('/api/tracker-client/:token/growth/cms-export/source')).body.source_mode,'TRACKER_SAVED_HTML');
 withinClientDuplicate=true;
 page=await invoke('/track/:token/growth/cms-export');
 assert.equal(page.code,409,'Same client duplicate must remain blocked');
 assert.match(page.body,/more than one page record inside this Tracker account/);
 withinClientDuplicate=false;
 locked=true;
 page=await invoke('/track/:token/growth/cms-export');
 assert.equal(page.code,409);
 assert.match(page.body,/active Case Study/);
 assert.match(page.body,/Return to Growth research/);
 const growth=await invoke('/track/:token/growth');
 assert.equal(growth.code,200);
 assert.match(growth.body,/Case Study protected — research is available/);
 assert.doesNotMatch(growth.body,/Prepare reviewed CMS handoff · Wix/,'Locked page must not offer export');
 locked=false;
 const ordinary=await invoke('/track/:token/growth');
 assert.match(ordinary.body,/Prepare reviewed CMS handoff · Wix/);
 assert.equal((await invoke('/track/:token/growth/cms-export','read-only')).code,403);
 assert.equal(writes,0);
 console.log('PASS owner-scoped canonical URL, cross-client duplicate accepted, within-client duplicate denied, Case Study protection visibly explained');
})().catch(e=>{console.error(e);process.exitCode=1});
