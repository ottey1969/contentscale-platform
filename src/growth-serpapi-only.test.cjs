'use strict';
const assert=require('node:assert/strict');
const {optionalSerpApiOrganicDiscovery,discoverGrowthCompetitorsWithFallback}=require('./growth-public-search-discovery.cjs');
(async()=>{
 let requested,called=0;
 const result=await optionalSerpApiOrganicDiscovery({query:'content scaling',ownUrl:'https://contentscale.site/',key:'dummy',
  fetchImpl:async url=>{called++;requested=new URL(url);return {ok:true,json:async()=>({organic_results:[
   {title:'Content Scaling Strategy Guide',link:'https://example.com/content-scaling/',position:2,snippet:'A practical approach'},
   {title:'Content at Scale AI Detector Review',link:'https://example.com/detector/',position:3,snippet:'BrandWell'},
  ]})}}});
 assert.equal(called,1);
 assert.equal(requested.hostname,'serpapi.com');
 assert.equal(requested.searchParams.get('engine'),'google');
 assert.equal(result.source,'SERPAPI_GOOGLE_ORGANIC');
 assert.equal(result.leads.length,1);
 assert.equal(result.leads[0].source,'SERPAPI_GOOGLE_ORGANIC');
 const free=await discoverGrowthCompetitorsWithFallback({query:'content scaling',ownUrl:'https://contentscale.site/',
  fetchFree:async()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[]}),
  fetchGoogle:async()=>result});
 assert.equal(free.source,'SERPAPI_GOOGLE_ORGANIC');
 assert.deepEqual(free.provider_attempts,['BING_PUBLIC_RSS','SERPAPI_GOOGLE_ORGANIC']);
 const failure=await discoverGrowthCompetitorsWithFallback({query:'content scaling',ownUrl:'https://contentscale.site/',fetchFree:async()=>({source:'BING_PUBLIC_RSS',status:'NO_RELEVANT_PUBLIC_SEARCH_LEADS',leads:[]}),fetchGoogle:async()=>({source:'SERPAPI_GOOGLE_ORGANIC',status:'OPTIONAL_PROVIDER_UNAVAILABLE',reason:'HTTP_429',leads:[]})});
 assert.equal(failure.optional_google_failure_reason,'HTTP_429');
 console.log('PASS Growth SerpAPI fallback, source truth, intent exclusions');
})().catch(e=>{console.error(e);process.exitCode=1});