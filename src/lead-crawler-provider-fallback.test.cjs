'use strict';
const assert=require('node:assert/strict');
const {registerLeadCrawlerSerpApi}=require('./lead-crawler-serpapi.cjs');
const sample={
 title:'Garden State Roofers',
 website:'https://gardenstate-roofers.example/about',
 phoneNumber:'+1 609 555 0132',
 address:'15 Main Street, Trenton, NJ 08608',
 category:'Roofing contractor',
 placeId:'serper-abc'
};
function suite({serperKey='s-key',serpapiKey='p-key',fetchImpl}){
 const routes={};
 registerLeadCrawlerSerpApi({post:(path,handler)=>routes[path]=handler},{
  fetchImpl,
  serperKey:()=>serperKey,
  apiKey:()=>serpapiKey,
  auth:req=>req.get('x-admin-code')==='authorized'
 });
 return async function request(niche,code='authorized'){
  let status=200,body=null;
  const req={body:{city:'Trenton, New Jersey',country:'USA',niche,industry_id:niche},get:()=>code};
  const res={status(n){status=n;return this;},json(data){body=data;return this;}};
  await routes['/api/lead-crawler/verified-nj-search'](req,res);
  return {status,body};
 };
}
async function main(){
 const providers=[];
 const request=suite({fetchImpl:async(url,opts)=>{
  providers.push({url,opts});
  assert.equal(url,'https://google.serper.dev/maps');
  assert.equal(opts.method,'POST');
  assert.equal(opts.headers['X-API-KEY'],'s-key');
  assert.equal(JSON.parse(opts.body).q,'roofing businesses in Trenton, New Jersey, USA');
  return{ok:true,status:200,json:async()=>({places:[sample,{...sample,address:'New York, NY'},{...sample,title:'duplicate'}]})};
 }});
 let r=await request('roofing','bad');assert.equal(r.status,403);assert.equal(providers.length,0);
 r=await request('roofing');
 assert.equal(r.status,200);
 assert.equal(r.body.source,'google_maps_serper');
 assert.equal(r.body.provider_calls,1);
 assert.equal(r.body.leads.length,1);
 assert.equal(r.body.leads[0].website,'https://gardenstate-roofers.example/');
 assert.equal(r.body.leads[0].phone,'+1 609 555 0132');
 assert.equal(r.body.leads[0].type,'Roofing contractor');
 assert.equal(r.body.leads[0].estimated_pages,null);
 r=await request('roofing');assert.equal(r.body.cached,true);assert.equal(r.body.provider_calls,0);
 assert.equal(providers.length,1,'cached call must not charge another provider request');

 // Canonical NJ discovery uses Serper.dev alone. SerpAPI is reserved for
 // other crawler paths; a failed Maps API must never trigger an implicit
 // paid second-provider request.
 const calls=[];
 const blocked=suite({fetchImpl:async(url)=>{
  calls.push(url);
  assert.equal(url,'https://google.serper.dev/maps');
  return{ok:false,status:401,json:async()=>({error:'invalid key'})};
 }});
 r=await blocked('roofing replacement');
 assert.equal(r.status,503);
 assert.match(r.body.error,/Serper/);
 assert.match(r.body.error,/HTTP 401/);
 assert.equal(r.body.providers_attempted,1);
 assert.equal(calls.length,1,'Serper failure must never call SerpAPI');
 assert(!r.body.error.includes('s-key')&&!r.body.error.includes('p-key'));

 const noKeys=suite({serperKey:'',serpapiKey:'',fetchImpl:()=>{throw Error('should not fetch');}});
 r=await noKeys('roofing without keys');assert.equal(r.status,503);assert.match(r.body.error,/not configured/);
 console.log('PASS: Serper-only NJ Maps, per-request credit count, 20-min cache, fail-closed provider errors, 403 auth, no key exposure');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
