'use strict';
const assert=require('node:assert/strict');
const {registerNetworkMapsAcquisition}=require('./network-maps-acquisition.cjs');
const routes={},written=[];
let fetches=0,siteChecks=0;
const app={get:(p,fn)=>routes['GET '+p]=fn,post:(p,fn)=>routes['POST '+p]=fn};
const pool={query:async(sql,args)=>{
 if(sql.includes("SELECT id FROM network_directory_businesses")&&sql.includes("version"))return {rows:[{id:'82'}]};
 if(sql.includes('id=ANY($1::bigint[])'))return {rows:[{
  id:'82',domain:'jerseycraftroofing.com',canonical_url:'https://jerseycraftroofing.com/',
  email_discovery:{email:null,version:'public-v3'},
  website_review:{status:'review_required',reason:'Website unavailable or restricted; manual review required',checked_at:'2026-10-14T00:00:00.000Z'}
 }]};
 if(sql.includes('UPDATE network_directory_businesses')){written.push({sql,args});return {rows:[]}};
 throw Error('Unexpected SQL: '+sql);
}};
registerNetworkMapsAcquisition({app,pool,auth:()=>true,backfillDelayMs:0,
 inspect:async()=>{siteChecks++;return {status:'site_observed',reason:'Public HTML homepage observed',checked_at:new Date().toISOString()};},
 discover:async()=>{fetches++;return {
  domain:'jerseycraftroofing.com',email:'info@jerseycraftexteriors.com',
  source_url:'https://jerseycraftroofing.com/',verification:'publicly_observed',
  relationship:'publicly_listed_other_business_domain',contact_review_required:false,
  checked:[{url:'https://jerseycraftroofing.com/',status:'checked'}]
 }}
});
setTimeout(()=>{
 try{
  assert.equal(fetches,1,'start-up backfill should trigger one real scanner invocation');
  assert.equal(siteChecks,1,'previous unavailable site review should be retried');
  assert.equal(written.length,2,'website review and email evidence must be stored in canonical company');
  const email=written.find(w=>w.sql.includes("'{acquisition,email_discovery}'"));
  assert.equal(JSON.parse(email.args[1]).email,'info@jerseycraftexteriors.com');
  assert.equal(JSON.parse(email.args[1]).version,'public-v4');
  assert(!Object.keys(routes).some(k=>k.includes('quickscan')),'must not create QuickScan routes');
  console.log('PASS: automatic background recovery updates existing acquisition without an email send');
 }catch(e){console.error(e);process.exitCode=1;}
},80);
