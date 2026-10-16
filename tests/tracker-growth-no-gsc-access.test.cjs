'use strict';
const assert=require('node:assert/strict');
const {registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const pages=[{id:33,url:'https://example.org/help/',keyword:'help',gsc_impressions:null,gsc_clicks:null,gsc_position:null,brief_content:null,case_study_active:false}];
function context({client=true,status='active',queries='error',pagesError=false}={}){
 const routes={};
 registerGrowthCockpit({get(path,...handlers){routes[path]=handlers}},{
  async query(sql){
   if(sql.includes('FROM tracker_clients'))return {rows:client?[{id:7,name:'Test',domain:'example.org',status,token:'owner-token'}]:[]};
   if(sql.includes('FROM tracker_pages p')){if(pagesError)throw Error('page database offline');return {rows:pages};}
   if(sql.includes('FROM tracker_gsc_queries q')){
    if(queries==='error')throw Object.assign(Error('no GSC query relation'),{code:'42P01'});
    return {rows:queries==='verified'?[{page_id:33,query:'find help service',impressions:185,clicks:1,position:17,imported_at:'2026-10-16T00:00:00Z',evidence_scope:'page_verified'}]:[]};
   }
   throw Error('Unexpected SQL');
  }
 });
 return routes;
}
async function invoke(handlers,token='readonly-share-token',query={}){
 const req={params:{token},query};
 const res={statusCode:200,status(s){this.statusCode=s;return this},json(body){this.body=body;return this},
  set(){return this},type(){return this},send(body){this.body=body;return this}};
 await handlers[0](req,res,()=>handlers[1](req,res));
 return res;
}
(async()=>{
 const routes=context();
 const data=await invoke(routes['/api/tracker-client/:token/growth']);
 assert.equal(data.statusCode,200);
 assert.equal(data.body.success,true);
 assert.equal(data.body.pages.length,1);
 assert.equal(data.body.can_edit,false);
 assert.equal(data.body.gsc_evidence_status,'UNAVAILABLE');
 assert.equal(data.body.gsc_connected_required_for_access,false);
 assert.deepEqual(data.body.query_opportunities,[]);
 const view=await invoke(routes['/track/:token/growth']);
 assert.equal(view.statusCode,200);
 assert.match(view.body,/Non-brand verified clicks<strong>Needs access<\/strong>/);
 assert.match(view.body,/GSC: Needs access/);
 assert.doesNotMatch(view.body,/Non-brand verified clicks<strong>0<\/strong>/);
 assert.doesNotMatch(view.body,/Record actual publication/);
 const noRows=await invoke(context({queries:'empty'})['/api/tracker-client/:token/growth'],'owner-token');
 assert.equal(noRows.body.gsc_evidence_status,'NEEDS_ACCESS');
 assert.equal(noRows.body.can_edit,true);
 const verified=context({queries:'verified'});
 const verifiedData=await invoke(verified['/api/tracker-client/:token/growth'],'owner-token');
 assert.equal(verifiedData.body.gsc_evidence_status,'AVAILABLE');
 assert.equal(verifiedData.body.query_opportunities.length,1);
 const readonlyVerified=await invoke(verified['/track/:token/growth']);
 assert.doesNotMatch(readonlyVerified.body,/Record actual publication/);
 const editorView=await invoke(verified['/track/:token/growth'],'owner-token');
 assert.match(editorView.body,/Record actual publication/);
 const disabled=await invoke(context({status:'disabled'})['/api/tracker-client/:token/growth']);
 assert.equal(disabled.statusCode,403);
 const missing=await invoke(context({client:false})['/api/tracker-client/:token/growth']);
 assert.equal(missing.statusCode,404);
 const unavailable=await invoke(context({pagesError:true})['/api/tracker-client/:token/growth']);
 assert.equal(unavailable.statusCode,503);
 console.log('PASS Tracker Growth: GSC missing/non-blocking; share link GET only; true data errors and client restrictions enforced');
})().catch(err=>{console.error(err);process.exitCode=1});
