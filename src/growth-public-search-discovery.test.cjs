'use strict';
const assert=require('node:assert/strict');
const {parseBingRss,discoverGrowthCompetitors}=require('./growth-public-search-discovery.cjs');
const own='https://contentscale.site/';
const xml='<?xml version="1.0"?><rss version="2.0"><channel><title>content scaling - Bing</title>'+
 '<item><title>Content Scaling Strategies for SEO Teams</title><link>https://growth.example/guide/content-scaling/</link><description>Scale content production while preserving quality &amp; helpful SEO advice</description></item>'+
 '<item><title>Content at Scale AI Detector Review</title><link>https://detector.example/review/</link><description>See detection accuracy</description></item>'+
 '<item><title>Content Scaling for SaaS Brands</title><link>https://contentscale.site/</link><description>Own page</description></item>'+
 '<item><title>Scaling Content without Losing Quality</title><link>https://other.example/content-growth/</link><description>What teams should measure</description></item>'+
 '<item><title>Content Scaling Free Tools</title><link>http://other.example/insecure</link><description>HTTP must be rejected</description></item>'+
 '<item><title>Content Scaling Deals</title><link>https://127.0.0.1/secret</link><description>SSRF must be rejected</description></item>'+
 '</channel></rss>';
const found=parseBingRss(xml,{query:'content scaling',ownUrl:own});
assert.deepEqual(found.map(x=>x.url),['https://growth.example/guide/content-scaling/','https://other.example/content-growth/']);
assert(!found.some(x=>/detector|127.0.0.1/.test(x.url)));
assert(found.every(x=>x.status==='FRESH_BING_RSS_LEAD_NOT_GOOGLE_RANKING'));
(async()=>{
 let calls=0;
 const ok=await discoverGrowthCompetitors({query:'content scaling',ownUrl:own,
  fetchFeed:async(url,options)=>{calls++;assert.equal(new URL(url).host,'www.bing.com');assert.equal(new URL(url).searchParams.get('q'),'content scaling');assert.equal(options.allowFeedXml,true);assert.equal(options.redirects,0);return {html:xml,retrieved_at:'2026-10-17T11:00:00Z'};}});
 assert.equal(calls,1);assert.equal(ok.status,'FRESH_PUBLIC_SEARCH_LEADS');
 assert.equal(ok.leads.length,2);
 assert(!ok.leads[0].serp_position,'No fabricated Google or Bing rank');
 assert.match(ok.warning,/NOT establish current Google rankings/);
 const unavailable=await discoverGrowthCompetitors({query:'content scaling',ownUrl:own,
  fetchFeed:async()=>{throw Object.assign(Error('blocked'),{code:'HTTP_429'})}});
 assert.equal(unavailable.status,'PUBLIC_SEARCH_UNAVAILABLE');assert.equal(unavailable.reason,'HTTP_429');
 assert.deepEqual(unavailable.leads,[]);
 const invalid=await discoverGrowthCompetitors({query:'content scaling site:evil.example',ownUrl:own,
  fetchFeed:async()=>{throw Error('should not fetch')}});
 assert.equal(invalid.status,'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH');
 const noFeed=await discoverGrowthCompetitors({query:'content scaling',ownUrl:own,
  fetchFeed:async()=>({html:'<html>Captcha required</html>'})});
 assert.equal(noFeed.status,'PUBLIC_SEARCH_UNAVAILABLE');assert.deepEqual(noFeed.leads,[]);
 assert.equal(noFeed.reason,'UNEXPECTED_NON_RSS_RESPONSE');
 const empty=await discoverGrowthCompetitors({query:'content scaling',ownUrl:own,
  fetchFeed:async()=>({html:'<rss><channel><title>none</title></channel></rss>'})});
 assert.equal(empty.status,'NO_RELEVANT_PUBLIC_SEARCH_LEADS');
 const partial=await discoverGrowthCompetitors({query:'content scaling',ownUrl:own,
  fetchFeed:async()=>({html:xml,truncated:true})});
 assert.equal(partial.status,'PARTIAL_PUBLIC_SEARCH_LEADS');
 console.log('PASS: bounded no-key public search, query scoping, no private IP, off-intent suppression, no Google rank claim, provider failure');
})().catch(e=>{console.error(e);process.exitCode=1});
