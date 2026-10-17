'use strict';
const assert=require('node:assert/strict');
const {discoverGrowthCompetitorsWithFallback,optionalGoogleOrganicDiscovery,
 parseSerpApiGoogleOrganic,parseBingRss}=require('./growth-public-search-discovery.cjs');
const ownUrl='https://contentscale.site/',query='content scaling';
const google={organic_results:[
 {position:1,title:'Scaling Content Production with SEO Quality Gates',link:'https://editorial.example/scale-content-production/',snippet:'A workflow to review content quality before publishing'},
 {position:2,title:'BrandWell AI Detector Review',link:'https://detector.example/brandwell-review/',snippet:'Content at Scale AI detector accuracy'},
 {position:3,title:'Content Scaling Strategy in Practice',link:'https://growth.example/content-scaling-guide/',snippet:'SEO and content scale management'},
 {position:4,title:'Content Scaling by ContentScale',link:'https://contentscale.site/',snippet:'Exclude own domain'},
 {position:5,title:'Content Scaling Report',link:'https://127.0.0.1/private',snippet:'Never fetch private IPs'}
]};
const parsed=parseSerpApiGoogleOrganic(google,{query,ownUrl});
assert.deepEqual(parsed.map(x=>x.url),['https://editorial.example/scale-content-production/','https://growth.example/content-scaling-guide/']);
assert.equal(parsed[0].serp_position,1);
assert.equal(parsed[0].status,'GOOGLE_SERP_OBSERVATION_NOT_TRACKED_PAGE_POSITION');
const rss='<?xml version="1.0"?><rss><channel><item><title>Content Scaling Strategy</title><link>https://strategy.example/guide/</link>'+
 '<description>Steps to review content quality before publishing</description></item></channel></rss>';
assert.equal(parseBingRss(rss,{query,ownUrl}).length,1,'legitimate editorial review must not be mistaken for product-review content');
(async()=>{
 let costed=0,seenUrl;
 const googleFetch=async url=>{
  costed++;seenUrl=new URL(url);
  return {ok:true,json:async()=>google};
 };
 const googleGood=await optionalGoogleOrganicDiscovery({query,ownUrl,key:'test-in-memory-key',
  fetchImpl:googleFetch,now:new Date('2026-10-17T12:00:00Z')});
 assert.equal(costed,1);assert.equal(seenUrl.hostname,'serpapi.com');
 assert.equal(seenUrl.searchParams.get('engine'),'google');
 assert.equal(seenUrl.searchParams.get('gl'),'us');
 assert.equal(googleGood.status,'FRESH_GOOGLE_ORGANIC_LEADS');
 assert.equal(googleGood.leads.length,2);
 assert.equal(googleGood.scope.country,'us');
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
 assert.equal(costed,0,'never consume paid lookup when free leads are adequate');
 const withGoogle=await discoverGrowthCompetitorsWithFallback({query,ownUrl,
  fetchFree:async()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[],reason:'UNEXPECTED_NON_RSS_RESPONSE'}),
  fetchGoogle:async()=>googleGood});
 assert.equal(withGoogle.status,'FRESH_GOOGLE_ORGANIC_LEADS');
 assert.equal(withGoogle.fallback_used,true);
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
 console.log('PASS free-first optional Google organic: strict query match, location/scope, no API dependency, no paid call when free available, privacy checks');
})().catch(e=>{console.error(e);process.exitCode=1});
