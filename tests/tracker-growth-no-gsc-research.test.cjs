'use strict';
const assert=require('node:assert/strict');
const {computeGrowth,registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const rows=[
 {id:11,url:'https://example.org/about/',keyword:'about',gsc_impressions:null,gsc_clicks:null,gsc_position:null,brief_content:null,case_study_active:false},
 {id:12,url:'https://example.org/service/',keyword:'roof repair',gsc_impressions:null,gsc_clicks:null,gsc_position:null,brief_content:null,case_study_active:true},
 {id:13,url:'https://other.org/private/',keyword:'private',gsc_impressions:9999,gsc_clicks:0,gsc_position:2,case_study_active:false}
];
const computed=computeGrowth(rows,[],'example.org');
assert.equal(computed.pages.length,2);
assert(computed.pages.every(x=>x.opportunity==='CONTENT_RESEARCH'));
assert(computed.pages.every(x=>x.gsc_present===false));
assert(computed.pages.every(x=>/GSC is optional/.test(x.next_action)));
assert.equal(computed.non_brand.clicks,0); // internal arithmetic only; UI must not portray as verified
const routes={};
registerGrowthCockpit({get(p,...h){routes[p]=h}},{query:async sql=>{
 if(sql.includes('FROM tracker_clients'))return {rows:[{id:1,domain:'example.org',token:'owner-token',status:'active'}]};
 if(sql.includes('FROM tracker_pages p'))return {rows};
 if(sql.includes('FROM tracker_gsc_queries q'))throw Object.assign(Error('not connected'),{code:'42P01'});
 throw Error('Unexpected SQL '+sql.slice(0,80));
}});
async function exec(route,token,query={}){
 const req={params:{token},query};
 const res={statusCode:200,status(v){this.statusCode=v;return this},json(v){this.body=v;return this},set(){return this},type(){return this},send(v){this.body=v;return this}};
 await routes[route][0](req,res,()=>routes[route][1](req,res));return res;
}
(async()=>{
 const share='readonly-share';
 const api=await exec('/api/tracker-client/:token/growth',share);
 assert.equal(api.statusCode,200);
 assert.equal(api.body.can_edit,false);
 assert.equal(api.body.gsc_evidence_status,'UNAVAILABLE');
 assert.equal(api.body.query_opportunities.length,0);
 const screen=await exec('/track/:token/growth',share);
 assert.match(screen.body,/Research opportunities without GSC/);
 assert.match(screen.body,/Open research brief · no GSC required/);
 assert.doesNotMatch(screen.body,/Record actual publication/);
 const brief=await exec('/api/tracker-client/:token/growth/research-brief',share,{page_id:'11'});
 assert.equal(brief.statusCode,200);
 assert.match(brief.body,/NO GSC REQUIRED/);
 assert.match(brief.body,/WordPress, Wix, or any other CMS/);
 assert.match(brief.body,/clicks, impressions and rankings UNKNOWN/);
 assert.match(brief.body,/not a verified ranking query/);
 const locked=await exec('/api/tracker-client/:token/growth/research-brief',share,{page_id:'12'});
 assert.match(locked.body,/LOCKED — research only/);
 const missing=await exec('/api/tracker-client/:token/growth/research-brief',share,{page_id:'13'});
 assert.equal(missing.statusCode,404);
 const invalid=await exec('/api/tracker-client/:token/growth/research-brief',share,{page_id:'1 OR 1=1'});
 assert.equal(invalid.statusCode,400);
 const owner=await exec('/api/tracker-client/:token/growth/research-brief','owner-token',{page_id:'11'});
 assert.equal(owner.statusCode,200);
 console.log('PASS Growth without GSC: domain-scoped research, owner/share access, locked baseline, CMS-neutral output, no fabricated proof');
})().catch(e=>{console.error(e);process.exitCode=1});
