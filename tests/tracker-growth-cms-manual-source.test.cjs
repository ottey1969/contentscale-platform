'use strict';
const assert=require('node:assert/strict');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const canonical='https://example.org/services/';
const manualHtml='<main><h1>Existing service page</h1><p>This is an editor-supplied historical copy of the originally published page. It might be stale and must be checked against the live URL before use.</p></main>';
const changes=[{approved:true,evidence_ref:'observed:owner-review',html:'<section><h2>How to assess the current service needs</h2><p>Review the exact current situation, ask for an inspection and verify the information before deciding which repairs to pursue.</p></section>'}];
let blocked=false,duplicates=false,otherSite=false,writes=0;
const pool={async query(sql,args=[]){
 if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(sql)){writes++;throw Error('Unexpected mutation')};
 if(sql.includes('FROM tracker_clients'))
  return {rows:args[0]==='owner-token'?[{id:17,domain:'example.org',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_pages p'))
  return {rows:[{id:55,url:otherSite?'https://unrelated.example/page/':canonical,keyword:'existing service',html_content:null,case_study_active:blocked}]};
 if(sql.includes('FROM tracker_pages WHERE url='))
  return {rows:duplicates?[{id:55,tracker_client_id:17},{id:99,tracker_client_id:17}]:[{id:55,tracker_client_id:17}]};
 if(sql.includes('FROM tracker_gsc_queries'))return{rows:[]};
 throw Error('Unexpected SQL '+sql);
}};
const routes={};
registerTrackerGrowthCmsExport({get(p,fn){routes['GET '+p]=fn},post(p,fn){routes['POST '+p]=fn}},pool);
async function call(method,p,token,body={},query={}){
 const req={params:{token},query,body};
 const res={statusCode:200,headers:{},status(v){this.statusCode=v;return this},type(){return this},set(k,v){this.headers[k]=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}};
 await routes[method+' '+p](req,res);return res;
}
(async()=>{
 const root='/api/tracker-client/:token/growth/cms-export';
 const source=await call('GET',root+'/source','owner-token',{}, {page_id:'55'});
 assert.equal(source.statusCode,200);
 assert.equal(source.body.manual_source_required,true);
 assert.equal(source.body.source_mode,'MANUAL_HTML_REQUIRED');
 assert.equal(source.body.source_sha256,null);
 const screen=await call('GET','/track/:token/growth/cms-export','owner-token',{}, {page_id:'55'});
 assert.equal(screen.statusCode,200);assert.match(screen.body,/manualOriginalHtml/);
 const payload={page_id:55,editor_approved:true,cms:'wix',evidence_scope:'needs_access',
  seo_title:'Existing Service in Example Area | Service Guide',
  meta_description:'Understand service assessments and what information to check before requesting local assistance.',
  approved_changes:changes,
  original_html_override:manualHtml,manual_source_acknowledged:true,
  source_provenance:'OWNER_SUPPLIED_UNVERIFIED'};
 let response=await call('POST',root,'owner-token',payload);
 assert.equal(response.statusCode,200,JSON.stringify(response.body));
 assert.equal(response.body.manifest.source_provenance,'OWNER_SUPPLIED_UNVERIFIED');
 assert.equal(response.body.manifest.source_snapshot_preserved,false);
 assert.equal(response.body.manifest.manual_html_persisted,false);
 assert.equal(response.body.publication_allowed,false);
 assert(response.body.warnings.includes('MANUAL_HTML_NOT_VERIFIED_LIVE'));
 assert(!response.body.files.some(f=>f.content.includes(manualHtml)),'Original manual HTML is not leaked in the handoff ZIP');
 const manifest=JSON.parse(response.body.files.find(f=>f.name==='manifest.json').content);
 assert.equal(manifest.manual_html_persisted,false);
 assert.equal(manifest.source_provenance,'OWNER_SUPPLIED_UNVERIFIED');
 response=await call('POST',root,'owner-token',{...payload,format:'zip'});
 assert.equal(response.statusCode,200);assert(Buffer.isBuffer(response.body));
 assert.equal(response.body.readUInt32LE(0),0x04034b50);
 assert.equal((await call('POST',root,'readonly-token',payload)).statusCode,403);
 assert.equal((await call('GET',root+'/source','readonly-token',{}, {page_id:'55'})).statusCode,403);
 assert.equal((await call('POST',root,'owner-token',{...payload,manual_source_acknowledged:false})).statusCode,409);
 assert.equal((await call('POST',root,'owner-token',{...payload,original_html_override:'<p>Short</p>'})).statusCode,409);
 assert.equal((await call('POST',root,'owner-token',{...payload,source_provenance:'verified_live'})).statusCode,409);
 assert.equal((await call('POST',root,'owner-token',{...payload,source_sha256:'0'.repeat(64)})).statusCode,409);
 assert.equal((await call('POST',root,'owner-token',{...payload,evidence_scope:'verified',focus_query:'unverified keyword'})).statusCode,409);
 blocked=true;assert.equal((await call('POST',root,'owner-token',payload)).statusCode,409);blocked=false;
 duplicates=true;assert.equal((await call('POST',root,'owner-token',payload)).statusCode,409);duplicates=false;
 otherSite=true;assert.equal((await call('POST',root,'owner-token',payload)).statusCode,403);otherSite=false;
 assert.equal(writes,0);
 console.log('PASS manual HTML handoff: no GSC, no scan, no DB writes, unverified provenance, no stored source, locked Case Studies');
})().catch(e=>{console.error(e);process.exitCode=1});
