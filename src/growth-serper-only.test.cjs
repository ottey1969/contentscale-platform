'use strict';
// Product rule: Growth uses Bing RSS first, then Serper.dev. SerpAPI is never called.
// Product rule: Growth reads ONLY SERPER_API_KEY.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {discoverGrowthCompetitorsWithFallback}=require('./growth-public-search-discovery.cjs');
const source=fs.readFileSync(__dirname+'/growth-public-search-discovery.cjs','utf8');
assert(!/serpapi\.com/i.test(source),'no request to serpapi.com may exist in the Growth discovery module');
assert(!/optionalSerpApiOrganicDiscovery/.test(source),'SerpAPI helper was removed');
assert(source.includes('fetchGoogle=optionalGoogleOrganicDiscovery'),'default paid fallback is Serper.dev');
const noFree=async()=>({source:'BING_PUBLIC_RSS',status:'NO_RELEVANT_PUBLIC_SEARCH_LEADS',leads:[]});
const payload={organic:[{title:'AI Overview Optimization Guide',link:'https://example.net/ai-overview-optimization/',position:3,snippet:'An informational optimization guide'}]};
async function withEnv(env,fn){
 const saved={};for(const k of ['SERPER_API_KEY','SERPAPI_KEY','SERPAPI_API_KEY'])saved[k]=process.env[k];
 const realFetch=global.fetch;
 try{for(const k of Object.keys(saved))delete process.env[k];Object.assign(process.env,env);return await fn()}
 finally{global.fetch=realFetch;for(const [k,v] of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v}
}
(async()=>{
 // SERPAPI_KEY alone must NOT enable the paid fallback and must not trigger any request.
 await withEnv({SERPAPI_KEY:'legacy-key-must-not-be-used'},async()=>{
  let called=0;global.fetch=async()=>{called++;return {ok:true,json:async()=>payload}};
  const r=await discoverGrowthCompetitorsWithFallback({query:'ai overview optimization',ownUrl:'https://contentscale.site/',fetchFree:noFree});
  assert.equal(called,0);assert.equal(r.optional_google_status,'OPTIONAL_PROVIDER_NOT_CONFIGURED');assert.deepEqual(r.leads,[]);
 });
 await withEnv({SERPER_API_KEY:'serper-key'},async()=>{
  const calls=[];
  global.fetch=async(url,opts)=>{calls.push({host:new URL(url).hostname,opts});return {ok:true,json:async()=>payload}};
  const found=await discoverGrowthCompetitorsWithFallback({query:'ai overview optimization',ownUrl:'https://contentscale.site/ai-overview-optimization/',fetchFree:noFree});
  // One usable lead (< 3): exactly one bounded retry for result page 2 is allowed (owner decision 2026-10-29), never more.
  assert.equal(calls.length,2);assert.equal(calls[0].host,'google.serper.dev');assert.equal(calls[1].host,'google.serper.dev');
  assert.equal(JSON.parse(calls[0].opts.body).page,undefined);assert.equal(JSON.parse(calls[1].opts.body).page,2);
  assert.equal(found.next_page_retry.page,2);
  assert.equal(calls[0].opts.method,'POST');assert.equal(calls[0].opts.headers['X-API-KEY'],'serper-key');
  assert.equal(found.source,'SERPER_GOOGLE_ORGANIC');assert.equal(found.leads.length,1);
  assert.deepEqual(found.provider_attempts,['BING_PUBLIC_RSS','SERPER_GOOGLE_ORGANIC']);
 });
 await withEnv({SERPER_API_KEY:'serper-key-primary-name',SERPAPI_KEY:'ignored-legacy'},async()=>{
  let sent;global.fetch=async(url,opts)=>{sent=opts.headers['X-API-KEY'];return {ok:true,json:async()=>payload}};
  await discoverGrowthCompetitorsWithFallback({query:'ai overview optimization',ownUrl:'https://contentscale.site/',fetchFree:noFree});
  assert.equal(sent,'serper-key-primary-name','SERPER_API_KEY wins when both exist');
 });
 await withEnv({},async()=>{
  global.fetch=async()=>{throw Error('no key: no paid call may be made')};
  const none=await discoverGrowthCompetitorsWithFallback({query:'ai overview optimization',ownUrl:'https://contentscale.site/',fetchFree:noFree});
  assert.equal(none.optional_google_status,'OPTIONAL_PROVIDER_NOT_CONFIGURED');assert.deepEqual(none.leads,[]);
  assert.deepEqual(none.provider_attempts,['BING_PUBLIC_RSS']);
 });
 await withEnv({SERPER_API_KEY:'k'},async()=>{
  global.fetch=async()=>({ok:false,status:429,json:async()=>({})});
  const failed=await discoverGrowthCompetitorsWithFallback({query:'ai overview optimization',ownUrl:'https://contentscale.site/',fetchFree:noFree});
  assert.equal(failed.optional_google_failure_reason,'HTTP_429');assert.deepEqual(failed.leads,[]);
 });
 console.log('PASS Growth Serper.dev-only paid fallback: SERPER_API_KEY only, no serpapi.com, no key no call');
})().catch(e=>{console.error(e);process.exitCode=1});
