'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFreeGrowthFirecrawlReader,enabled}=require('../src/growth-free-firecrawl-reader.cjs');
const url='https://example.com/roof-leak/';
const opts={compact:true,limit:600000};
const lookup=async()=>[{address:'93.184.216.34',family:4}];
const env={FREE_GROWTH_FIRECRAWL_ENABLED:'true',FIRECRAWL_API_KEY:'test-secret'};
const fallback=async()=>({html:'<h1>Original reader</h1>',truncated:false,source:'LIVE_PUBLIC_HTTPS'});
const ok=async()=>({ok:true,json:async()=>({success:true,data:{html:'<main><h1>Roof Leak Repair</h1><p>'+('Useful evidence. '.repeat(80))+'</p></main>',metadata:{sourceURL:url}}})});
test('pilot is opt-in and cannot activate without credentials',()=>{
 assert.equal(enabled({FREE_GROWTH_FIRECRAWL_ENABLED:'true'}),false);
 assert.equal(enabled({FIRECRAWL_API_KEY:'key'}),false);
});
test('hosted Firecrawl HTML is normalized and duplicate reads use run cache',async()=>{
 let calls=0;
 const {reader,stats}=createFreeGrowthFirecrawlReader({env,lookup,fetchImpl:async(...args)=>{calls++;assert.equal(args[0],'https://api.firecrawl.dev/v2/scrape');return ok()},original:fallback});
 const [a,b]=await Promise.all([reader(url,opts),reader(url,opts)]);
 assert.equal(a.source,'FIRECRAWL_HOSTED_API');
 assert.match(a.html,/Roof Leak Repair/);
 assert.equal(b.source,a.source);
 assert.equal(calls,1);
 assert.equal(stats.used,1);
 assert.equal(stats.cache_hits,1);
});
test('external failure falls back to the original reader and records failure without API secret',async()=>{
 const {reader,stats}=createFreeGrowthFirecrawlReader({env,lookup,fetchImpl:async()=>({ok:false,status:429}),original:fallback});
 const result=await reader(url,opts);
 assert.equal(result.source,'LIVE_PUBLIC_HTTPS');
 assert.equal(stats.attempted,1);
 assert.equal(stats.fallbacks,1);
 assert.equal(stats.errors[0].code,'FIRECRAWL_HTTP_429');
 assert.doesNotMatch(JSON.stringify(stats),/test-secret/);
});
test('no API requests after page budget, original reader still works',async()=>{
 let calls=0;
 const {reader,stats}=createFreeGrowthFirecrawlReader({env,lookup,maxPages:1,fetchImpl:async()=>{calls++;return ok()},original:fallback});
 await reader(url,opts);
 const second=await reader('https://other.example.com/',opts);
 assert.equal(second.source,'LIVE_PUBLIC_HTTPS');
 assert.equal(calls,1);
 assert.equal(stats.attempted,1);
});
test('internal or invalid hosts are never sent to the hosted API',async()=>{
 let calls=0;
 const {reader}=createFreeGrowthFirecrawlReader({env,lookup:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:async()=>{calls++;return ok()},original:fallback});
 assert.equal((await reader('https://internal.example/',opts)).source,'LIVE_PUBLIC_HTTPS');
 assert.equal(calls,0);
});
