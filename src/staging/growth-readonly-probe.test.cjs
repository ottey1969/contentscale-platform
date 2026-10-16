'use strict';
const assert=require('node:assert/strict');
const {assertGrowthStagingSafety,inspectGrowthRouteRegistration,inspectSyntheticCmsHandoff,
 inspectIsolatedGrowthSchema,inspectGrowthStaging,makeHandler}=require('./growth-readonly-probe.cjs');
const env={CS_DEPLOYMENT_TIER:'staging',CS_STAGING_SIDE_EFFECTS_DISABLED:'true',
 CS_STAGING_ISOLATED_DB_CONFIRMED:'true',CS_STAGING_SCAN_EXECUTION_ENABLED:'false',
 ENABLE_TRACKER_SCHEDULER:'false',CS_GROWTH_STAGING_DB_HOST:'ep-isolated.eu-central-1.aws.neon.tech',
 DATABASE_URL:'postgresql://fake:fake@ep-isolated.eu-central-1.aws.neon.tech/neondb'};
assert.equal(assertGrowthStagingSafety(env),true);
for(const mutation of [
 {CS_DEPLOYMENT_TIER:'production'}, {CS_STAGING_SIDE_EFFECTS_DISABLED:'false'},
 {CS_STAGING_ISOLATED_DB_CONFIRMED:'false'}, {CS_STAGING_SCAN_EXECUTION_ENABLED:'true'},
 {ENABLE_TRACKER_SCHEDULER:'true'}, {CS_GROWTH_STAGING_DB_HOST:'wrong.neon.tech'},
 {DATABASE_URL:'postgresql://example:secret@production.example.com/neondb'},
 {DATABASE_URL:'postgresql://example:secret@another.neon.tech/neondb'}
])assert.throws(()=>assertGrowthStagingSafety({...env,...mutation}),/GROWTH_STAGING_REFUSED/);
const routes=inspectGrowthRouteRegistration();
assert.equal(routes.routes_registered,true);
assert.equal(routes.required_route_count,6);
const cms=inspectSyntheticCmsHandoff();
assert.equal(cms.cms_handoff_ready,true);
assert.equal(cms.zip_valid,true);
assert.equal(cms.source_revision_enforced,true);
assert.equal(cms.paid_provider_required,false);
assert.equal(cms.automatic_publishing,false);
const statements=[];
const pool={connect:async()=>({query:async(sql)=>{
 statements.push(sql);
 if(sql.startsWith('SELECT to_regclass'))return {rows:[{clients:true,pages:true,daily_gsc:true,commercial_outcomes:true}]};
 return {rows:[]};},release:()=>statements.push('RELEASE')})};
(async()=>{
 const probe=await inspectGrowthStaging(pool);
 assert.equal(probe.ready,true);
 assert.equal(probe.writes_executed,false);
 assert.equal(probe.canonical_app_started,false);
 assert.equal(probe.actual_gsc_authorization_tested,false);
 assert.equal(probe.real_elementor_render_tested,false);
 assert.equal(statements[0],'BEGIN TRANSACTION READ ONLY');
 assert(statements.includes('ROLLBACK'));
 assert(statements.includes('RELEASE'));
 const bad=await inspectIsolatedGrowthSchema({connect:async()=>({query:async(sql)=>sql.startsWith('SELECT to_regclass')?
  {rows:[{clients:true,pages:true,daily_gsc:false,commercial_outcomes:true}]}:{rows:[]},release:()=>{}})});
 assert.equal(bad.growth_schema_present,false);
 function request(method,path){
  const res={headers:{},setHeader(k,v){this.headers[k]=v},
   writeHead(status){this.status=status},end(value){this.body=JSON.parse(value)}};
  makeHandler(probe)({method,url:path},res);return res;
 }
 const health=request('GET','/__staging/health');
 assert.equal(health.status,200);assert.equal(health.body.success,true);
 assert.equal(health.body.actual_client_page_data_exposed,false);
 assert.equal(health.body.actual_gsc_authorization_tested,false);
 assert.equal(health.headers['Cache-Control'],'no-store');
 assert.equal(request('GET','/__staging/growth/probe').status,200);
 assert.equal(request('GET','/api/growth/admin/pages/1/readiness').status,404);
 assert.equal(request('POST','/__staging/health').status,404);
 console.log('PASS: isolated staging Growth probe, readonly DB transaction, route boot, synthetic Wix ZIP and fail-closed safety');
})().catch(e=>{console.error(e);process.exitCode=1});
