'use strict';
const assert=require('node:assert/strict');
const {registerGrowthCommercialOutcomeRoutes}=require('./growth-commercial-outcome-routes.cjs');
const routes={};let records=[],insertCount=0;
const app={get:(path,...handlers)=>routes['GET '+path]=handlers,post:(path,...handlers)=>routes['POST '+path]=handlers};
const pool={query:async(sql,args=[])=>{
 if(sql.startsWith('SELECT id FROM tracker_clients'))return {rows:args[0]===7?[{id:7}]:[]};
 if(sql.startsWith('SELECT internal_evidence_id'))return {rows:records};
 if(sql.startsWith('INSERT INTO growth_commercial_outcome_events')){
  assert.equal(args[0],7);insertCount++;
  records.push({internal_evidence_id:args[1],reported_stage:args[2],claimed_channel:args[3],observed_at:args[4]});
  return {rows:[]};
 }
 throw Error('Unknown DB query');
}};
registerGrowthCommercialOutcomeRoutes({app,pool,verifyEngineAccess:(req,res,next)=>next()});
async function request(method,{admin=true,clientId='7',body={}}={}){
 const key=method+' /api/growth/admin/clients/:clientId/commercial-evidence';
 const stack=routes[key];assert(stack,'route exists');
 const req={params:{clientId},body,engineUser:{isAdmin:admin}},res={
   statusCode:200,headers:{},status(n){this.statusCode=n;return this},
   set(k,v){this.headers[k]=v;return this},json(v){this.body=v;return this}
 };
 let i=0;const next=()=>{const f=stack[i++];if(f)return f(req,res,next)};
 await next();return res;
}
(async()=>{
 let r=await request('POST',{admin:false,body:{reported_stage:'invoice_issued',observed_at:'2026-10-07'}});
 assert.equal(r.statusCode,403);assert.equal(insertCount,0);
 r=await request('POST',{body:{reported_stage:'invoice_issued',observed_at:'2026-10-07',client_name:'Never store a name'}});
 assert.equal(r.statusCode,400);assert.equal(insertCount,0);
 r=await request('POST',{body:{reported_stage:'invoice_issued',observed_at:'2026-10-07',invoice_number:712}});
 assert.equal(r.statusCode,400);assert.equal(insertCount,0);
 r=await request('POST',{body:{reported_stage:'invoice_issued',observed_at:'2026-10-07',invoice_amount:12000}});
 assert.equal(r.statusCode,400);assert.equal(insertCount,0);
 r=await request('POST',{body:{reported_stage:'invoice_issued',claimed_channel:'unknown',observed_at:'2026-10-07'}});
 assert.equal(r.statusCode,201);assert.equal(insertCount,1);
 assert.equal(r.body.status,'UNVERIFIED_OWNER_REPORTED_STAGE');
 assert.equal(r.body.job_completion_verified,false);
 assert.equal(r.body.payment_verified,false);
 assert.equal(r.body.seo_attribution_verified,false);
 r=await request('GET');
 assert.equal(r.statusCode,200);assert.equal(r.body.counts.invoices_issued,1);
 assert.equal(r.body.counts.completed_verified,0);
 assert.equal(r.body.counts.payments_verified,0);
 assert.equal(r.body.counts.verified_organic_attribution,0);
 assert.equal(r.body.paid_revenue_amount,null);
 assert.equal(r.headers['Cache-Control'],'private, no-store');
 r=await request('GET',{admin:false});assert.equal(r.statusCode,403);
 r=await request('POST',{clientId:'8',body:{reported_stage:'invoice_issued',observed_at:'2026-10-07'}});
 assert.equal(r.statusCode,404);
 console.log('PASS: private Growth commercial events, no invoice/customer PII, invoice cannot prove jobs, payments or SEO revenue');
})().catch(e=>{console.error(e);process.exitCode=1});
