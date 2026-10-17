'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const url='https://sample.example/service/';
const html='<html><head><title>Current Service Page</title><meta name="description" content="Understand the services described"></head><body><h1>Current service</h1><p>The actual public text is reviewed before handoff. Content availability is not a promise or verified offer.</p></body></html>';
let locked=false,saved=false,redirected=false,writes=0,called=0;
const pool={async query(sql,args){
 if(/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(sql)){writes++;throw Error('Write prohibited')}
 if(sql.includes('FROM tracker_clients'))return {rows:args[0]==='owner-token'?[{id:3,domain:'sample.example',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_pages p'))return {rows:[{id:17,url,html_content:saved?html:null,case_study_active:locked,keyword:'current service'}]};
 if(sql.includes('FROM tracker_pages WHERE url=')){
  assert.match(sql,/tracker_client_id=\$2/);assert.equal(args[1],3);
  return {rows:[{id:17,tracker_client_id:3}]};
 }
 throw Error('Unexpected SQL '+sql.slice(0,70));
}};
const fetchLive=async()=>{called++;return{html,final_url:redirected?'https://elsewhere.example/page/':url,retrieved_at:'2026-10-17T04:00:00Z'}};
const routes={};
registerTrackerGrowthCmsExport({get(p,h){routes[p]=h},post(){}},pool,{fetchLive});
async function test(token='owner-token',page_id='17'){
 const req={params:{token},query:{page_id}};
 const res={code:200,headers:{},status(x){this.code=x;return this},set(k,v){this.headers[k]=v;return this},json(v){this.body=v;return this},type(){return this},send(v){this.body=v;return this}};
 await routes['/api/tracker-client/:token/growth/cms-export/public-source'](req,res);
 return res;
}
(async()=>{
 const okay=await test();assert.equal(okay.code,200);
 assert.equal(okay.body.success,true);
 assert.equal(okay.body.html,html);
 assert.equal(okay.body.source_sha256,crypto.createHash('sha256').update(html).digest('hex'));
 assert.equal(okay.body.auto_published,false);
 assert.equal(okay.body.stored_in_tracker,false);
 assert.equal(okay.body.live_render_verified,false);
 assert.equal(okay.headers['Cache-Control'],'private, no-store');
 assert.equal((await test('read-only')).code,403);
 assert.equal((await test('owner-token','not-an-id')).code,400);
 locked=true;assert.equal((await test()).code,409);locked=false;
 saved=true;assert.equal((await test()).code,409);saved=false;
 redirected=true;assert.equal((await test()).code,409);redirected=false;
 assert.equal(called,2);
 assert.equal(writes,0);
 console.log('PASS verified client-only original public HTML autofill, safe redirect rejection, no GSC/scans/writes and protected Case Study');
})().catch(e=>{console.error(e);process.exitCode=1});