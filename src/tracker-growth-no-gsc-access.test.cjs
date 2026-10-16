'use strict';
const assert=require('node:assert/strict');
const {registerGrowthCockpit}=require('./tracker-growth-cockpit.cjs');
const routes={};
const app={get(path,...handlers){routes[path]=handlers}};
const client={id:7,domain:'example.org'};
const pages=[{id:19,url:'https://example.org/service/',keyword:'service',gsc_impressions:null,gsc_clicks:null,gsc_position:null,brief_content:null,case_study_active:false}];
registerGrowthCockpit(app,{async query(sql){
 if(sql.includes('FROM tracker_clients'))return {rows:[client]};
 if(sql.includes('FROM tracker_pages p'))return {rows:pages};
 if(sql.includes('FROM tracker_gsc_queries q'))throw Object.assign(Error('GSC unavailable'),{code:'42P01'});
 throw Error('Unexpected SQL');
}});
(async()=>{
 const req={params:{token:'valid-customer-token'}},res={statusCode:200,status(x){this.statusCode=x;return this},json(x){this.body=x;return this}};
 const handlers=routes['/api/tracker-client/:token/growth'];
 await handlers[0](req,res,()=>handlers[1](req,res));
 assert.equal(res.statusCode,200);
 assert.equal(res.body.success,true);
 assert.equal(res.body.pages.length,1);
 assert.equal(res.body.gsc_evidence_status,'UNAVAILABLE');
 assert.equal(res.body.gsc_connected_required_for_access,false);
 assert.deepEqual(res.body.query_opportunities,[]);
 console.log('PASS: Growth page remains open without Google Search Console; absence is not verified zero.');
})().catch(err=>{console.error(err);process.exitCode=1});
