'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Canonical paid fallback is Serper.dev (product rule). SerpAPI must not be used.
const providerSource=fs.readFileSync('src/growth-public-search-discovery.cjs','utf8');
assert(providerSource.includes('fetchGoogle=optionalGoogleOrganicDiscovery'));
assert(!/serpapi\.com/i.test(providerSource));

const {discoverGrowthCompetitorsWithFallback,optionalGoogleOrganicDiscovery,
 parseSerperGoogleOrganic,parseBingRss}=require('./growth-public-search-discovery.cjs');
const ownUrl='https://contentscale.site/',query='content scaling';
const google={organic:[
 {position:1,title:'Scaling Content Production with SEO Quality Gates',link:'https://editorial.example/scale-content-production/',snippet:'A workflow to review content quality before publishing'},
 {position:2,title:'BrandWell AI Detector Review',link:'https://detector.example/brandwell-review/',snippet:'Content at Scale AI detector accuracy'},
 {position:3,title:'Content Scaling Strategy in Practice',link:'https://growth.example/content-scaling-guide/',snippet:'SEO and content scale management'},
 {position:4,title:'Content Scaling by ContentScale',link:'https://contentscale.site/',snippet:'Exclude own domain'},
 {position:5,title:'Content Scaling Report',link:'https://127.0.0.1/private',snippet:'Never fetch private IPs'}
]};
const parsed=parseSerperGoogleOrganic(google,{query,ownUrl});
assert.deepEqual(parsed.map(x=>x.url),['https://editorial.example/scale-content-production/','https://growth.example/content-scaling-guide/']);
assert.equal(parsed[0].serp_position,1);
assert.equal(parsed[0].status,'GOOGLE_SERP_OBSERVATION_NOT_TRACKED_PAGE_POSITION');
const rss='<?xml version="1.0"?><rss><channel><item><title>Content Scaling Strategy</title><link>https://strategy.example/guide/</link>'+
 '<description>Steps to review content quality before publishing</description></item></channel></rss>';
assert.equal(parseBingRss(rss,{query,ownUrl}).length,1,'legitimate editorial review must not be mistaken for product-review content');
(async()=>{
 let costed=0,seenUrl,seenOptions;
 const googleFetch=async (url,options)=>{
  costed++;if(costed===1){seenUrl=new URL(url);seenOptions=options}
  return {ok:true,json:async()=>google};
 };
 const googleGood=await optionalGoogleOrganicDiscovery({query,ownUrl,key:'test-in-memory-key',
  fetchImpl:googleFetch,now:new Date('2026-10-17T12:00:00Z')});
 // Two usable leads (< 3): one bounded page-2 retry is allowed (owner decision 2026-10-29); the first request is checked below.
 assert.equal(costed,2);assert.equal(seenUrl.hostname,'google.serper.dev');
 assert.equal(seenUrl.pathname,'/search');
 assert.equal(seenUrl.search,'','API key must never appear in a URL');
 assert.equal(seenOptions.method,'POST');
 assert.equal(seenOptions.headers['X-API-KEY'],'test-in-memory-key');
 assert.equal(seenOptions.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(seenOptions.body),{q:query,gl:'us',hl:'en',num:10});
 assert(!JSON.stringify(seenOptions.body).includes('test-in-memory-key'),'No key in request body');
 assert.equal(googleGood.status,'FRESH_GOOGLE_ORGANIC_LEADS');
 assert.equal(googleGood.leads.length,2);
 assert.equal(googleGood.scope.country,'us');
 assert.equal(googleGood.source,'SERPER_GOOGLE_ORGANIC');
 assert.equal(googleGood.scope.source,'Google organic results through optional configured Serper.dev');
 const noPaid=await optionalGoogleOrganicDiscovery({query,ownUrl,key:'',
  fetchImpl:async()=>{throw Error('NOT_ALLOWED')}});
 assert.equal(noPaid.status,'OPTIONAL_PROVIDER_NOT_CONFIGURED');
 const failed=await optionalGoogleOrganicDiscovery({query,ownUrl,key:'present',
  fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(failed.status,'OPTIONAL_PROVIDER_UNAVAILABLE');assert.equal(failed.reason,'HTTP_429');
 const free={status:'FRESH_PUBLIC_SEARCH_LEADS',source:'BING_PUBLIC_RSS',leads:[{url:'https://strategy.example/guide/',source:'BING_PUBLIC_RSS'}]};
 costed=0;
 const freeFirst=await discoverGrowthCompetitorsWithFallback({query,ownUrl,
  fetchFree:async()=>free,fetchGoogle:async()=>{costed++;return googleGood}});
 assert.equal(freeFirst.source,'BING_PUBLIC_RSS');
 assert.deepEqual(freeFirst.provider_attempts,['BING_PUBLIC_RSS']);
 assert.deepEqual(freeFirst.provider_attempts,['BING_PUBLIC_RSS']);
 assert.equal(costed,0,'never consume paid lookup when free leads are adequate');
 const withGoogle=await discoverGrowthCompetitorsWithFallback({query,ownUrl,
  fetchFree:async()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[],reason:'UNEXPECTED_NON_RSS_RESPONSE'}),
  fetchGoogle:async()=>googleGood});
 assert.equal(withGoogle.status,'FRESH_GOOGLE_ORGANIC_LEADS');
 assert.equal(withGoogle.fallback_used,true);
 assert.deepEqual(withGoogle.provider_attempts,['BING_PUBLIC_RSS','SERPER_GOOGLE_ORGANIC']);
 assert.equal(withGoogle.leads.length,2);
 assert.equal(withGoogle.free_discovery_status,'PUBLIC_SEARCH_UNAVAILABLE');
 const freeOnly=await discoverGrowthCompetitorsWithFallback({query,ownUrl,
  fetchFree:async()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[]}),
  fetchGoogle:async()=>noPaid});
 assert.equal(freeOnly.status,'PUBLIC_SEARCH_UNAVAILABLE');
 assert.deepEqual(freeOnly.leads,[]);
 assert.equal(freeOnly.optional_google_status,'OPTIONAL_PROVIDER_NOT_CONFIGURED');
 const bad=await discoverGrowthCompetitorsWithFallback({query:'hello site:evil.com',ownUrl,
  fetchFree:async()=>({status:'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH',source:'BING_PUBLIC_RSS',leads:[]}),
  fetchGoogle:async()=>{throw Error('MUST_NOT_EXECUTE')}});
 assert.equal(bad.status,'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH');
 assert.deepEqual(bad.provider_attempts,[]);
 console.log('PASS Serper.dev free-first Google organic: POST X-API-KEY, safe organic parsing, no optional key dependency, no paid call when free available');
})().catch(e=>{console.error(e);process.exitCode=1});
