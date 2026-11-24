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

const {readRankingPages}=require('../src/growth-ranking-page-reader.cjs');
test('Tracker ranking fallback only reads thin successful pages and respects three-page cap',async()=>{
 const leads=Array.from({length:8},(_,i)=>({url:'https://site'+i+'.example/roof/',source:'SERPER_GOOGLE_ORGANIC'}));
 const called=[];
 const rich='<h1>Roof repair</h1><p>'+('Roof repair requires careful inspection and practical preparation. '.repeat(12))+'</p>';
 const result=await readRankingPages({query:'roof repair',discovery:{leads},
  fetchLive:async url=>{
   if(url===leads[0].url)throw Object.assign(Error('HTTP_403'),{code:'HTTP_403'});
   return {html:url===leads[1].url?rich:'<h1>Roof repair</h1>',final_url:url,source:'LIVE_PUBLIC_HTTPS'};
  },
  renderOwn:async()=>({status:'RENDER_UNAVAILABLE'}),
  hostedFallback:async(url)=>{called.push(url);return null;}
 });
 assert.equal(called.length,3);
 assert(!called.includes(leads[0].url));
 assert(!called.includes(leads[1].url));
 assert.equal(result.comparisons.length,1);
});
test('Tracker ranking hosted evidence must match final URL and pass editorial quality',async()=>{
 const url='https://roof.example/repair/';
 const rich='<h1>Roof repair</h1><p>'+('Roof repair requires careful inspection and practical preparation. '.repeat(12))+'</p>';
 const run=final_url=>readRankingPages({query:'roof repair',discovery:{leads:[{url}]},
  fetchLive:async()=>({html:'<h1>Roof repair</h1>',final_url:url,source:'LIVE_PUBLIC_HTTPS'}),
  renderOwn:async()=>({status:'RENDER_UNAVAILABLE'}),
  hostedFallback:async()=>({html:rich,final_url,source:'FIRECRAWL_HOSTED_API',truncated:false})});
 const good=await run(url);
 assert.equal(good.comparisons.length,1);
 assert.equal(good.fetchLog[0].hosted_status,'USED');
 const wrong=await run('https://other.example/');
 assert.equal(wrong.comparisons.length,0);
 assert.equal(wrong.fetchLog[0].hosted_status,'FALLBACK');
});

test('AI gap per-run reader factory is not called for empty source lists',async()=>{
 const {createAiGapCache}=require('../src/growth-free/ai-gap.cjs');
 let calls=0;
 const gap=createAiGapCache({fetchHtml:async()=>{throw Error('unexpected read')}});
 assert.equal(await gap({key:'owner',answers:[],pageUrl:'https://example.com/',readerForRun:()=>{calls++;throw Error('unexpected factory')}}),null);
 assert.equal(calls,0);
});
test('AI gap uses per-run reader and records capture provider separately from citing engines',async()=>{
 const {createAiGapCache}=require('../src/growth-free/ai-gap.cjs');
 const own='https://example.com/roof/',rival='https://competitor.example/roof/';
 const answers=[{engine:'perplexity',parsed:{validation_status:'valid',sources_verifiable:true,sources:[rival]}}];
 let factories=0,reads=0;
 const gap=createAiGapCache({fetchHtml:async()=>{throw Error('base reader not expected')}});
 const options={key:'owner',answers,pageUrl:own,query:'roof repair',wait:true,readerForRun:()=>{factories++;return async url=>{reads++;return {html:'<h1>Roof repair</h1><h2>Roof inspection</h2><p>'+('Inspect roofing carefully before repairs. '.repeat(50))+'</p>',source:url===rival?'FIRECRAWL_HOSTED_API':'LIVE_PUBLIC_HTTPS'}}}};
 const result=await gap(options);
 assert.equal(result.status,'READ');
 assert.equal(result.pages[0].read_provider,'FIRECRAWL_HOSTED_API');
 assert.deepEqual(result.pages[0].cited_by,['perplexity']);
 await gap(options);
 assert.equal(factories,1);
 assert.equal(reads,2);
});

test('shared manager coalesces simultaneous module reads and preserves capture time',async()=>{
 const {createFirecrawlManager}=require('../src/firecrawl-manager.cjs');
 let now=Date.parse('2026-11-24T00:00:00Z'),calls=0;
 const manager=createFirecrawlManager({now:()=>now});
 const env={FIRECRAWL_API_KEY:'one',FIRECRAWL_SHARED_CACHE_TTL_SECONDS:'60'};
 const load=async()=>{calls++;return {html:'<p>capture</p>',retrieved_at:'original'}};
 const [a,b]=await Promise.all([manager.read({env,url,load}),manager.read({env,url,load})]);
 assert.equal(calls,1);assert.equal(a.value.retrieved_at,b.value.retrieved_at);
 assert.equal((await manager.read({env,url,load})).source,'CACHE');
 now+=61000;await manager.read({env,url,load});assert.equal(calls,2);
 assert.equal(manager.usage(env).daily_requests,2);
});
test('shared manager enforces UTC daily and monthly request limits and separates keys',async()=>{
 const {createFirecrawlManager}=require('../src/firecrawl-manager.cjs');
 let now=Date.parse('2026-11-24T23:59:00Z');
 const manager=createFirecrawlManager({now:()=>now});
 const env={FIRECRAWL_API_KEY:'first',FIRECRAWL_DAILY_REQUEST_LIMIT:'1',FIRECRAWL_MONTHLY_REQUEST_LIMIT:'2'};
 const read=(e=env)=>manager.read({env:e,url,load:async()=>({html:'ok'})});
 await read();await assert.rejects(read(),/FIRECRAWL_LOCAL_REQUEST_LIMIT/);
 await read({...env,FIRECRAWL_API_KEY:'second'});
 now+=120000;await read();assert.equal(manager.usage(env).daily_requests,1);
 now+=86400000;await assert.rejects(read(),/FIRECRAWL_LOCAL_REQUEST_LIMIT/);
 now=Date.parse('2026-12-01T00:00:00Z');await read();
 assert.equal(manager.usage(env).monthly_requests,1);
 assert.equal(manager.usage(env).provider_credits_verified,false);
});
test('two reader instances share hosted capture but still respect publisher refusals',async()=>{
 const {createFirecrawlManager}=require('../src/firecrawl-manager.cjs');
 const manager=createFirecrawlManager();let calls=0;
 const config={env:{...env,FIRECRAWL_SHARED_CACHE_TTL_SECONDS:'60'},lookup,manager,fetchImpl:async()=>{calls++;return ok()},original:fallback};
 const a=createFreeGrowthFirecrawlReader(config),b=createFreeGrowthFirecrawlReader(config);
 await a.reader(url,opts);await b.reader(url,opts);
 assert.equal(calls,1);assert.equal(b.stats.shared_cache_hits,1);assert.equal(b.stats.provider_requests,0);
 const blocked=createFreeGrowthFirecrawlReader({...config,original:async()=>{throw Object.assign(Error('HTTP_403'),{code:'HTTP_403'})}});
 await assert.rejects(blocked.reader(url,opts),/HTTP_403/);assert.equal(calls,1);
});

test('durable accounting survives manager recreation and prevents calls when unavailable',async()=>{
 const {createFirecrawlManager}=require('../src/firecrawl-manager.cjs');
 let count=0,loads=0;
 const accounting={reserve:async()=>{if(count>=1)throw Object.assign(Error('limit'),{code:'FIRECRAWL_LOCAL_REQUEST_LIMIT'});count++},usage:async()=>({daily:count,monthly:count})};
 const env={FIRECRAWL_API_KEY:'durable',FIRECRAWL_DAILY_REQUEST_LIMIT:'1'};
 const load=async()=>{loads++;return {html:'ok'}};
 const first=createFirecrawlManager({accounting,requireAccounting:true});
 await first.read({env,url,load});
 const second=createFirecrawlManager({accounting,requireAccounting:true});
 await assert.rejects(second.read({env,url,load}),/FIRECRAWL_LOCAL_REQUEST_LIMIT/);
 assert.equal((await second.durableUsage(env)).daily_requests,1);
 assert.equal((await second.durableUsage(env)).scope,'POSTGRES_SHARED');
 const broken=createFirecrawlManager({accounting:{reserve:async()=>{throw Error('db down')}},requireAccounting:true});
 await assert.rejects(broken.read({env,url,load}),/FIRECRAWL_ACCOUNTING_UNAVAILABLE/);
 await assert.rejects(createFirecrawlManager({requireAccounting:true}).read({env,url,load}),/FIRECRAWL_ACCOUNTING_UNAVAILABLE/);
 assert.equal(loads,1);
});

test('owner usage summary distinguishes quotas, warnings, missing keys and unknown provider credits',async()=>{
 const {meter,dashboard}=require('../src/firecrawl-owner-dashboard.cjs');
 assert.equal(meter(79,100).status,'OK');
 assert.equal(meter(80,100).status,'WARNING_80');
 assert.equal(meter(90,100).status,'WARNING_90');
 assert.equal(meter(101,100).remaining,0);
 assert.equal(meter(0,0).status,'LIMIT_REACHED');
 assert.equal(meter(5,null).status,'NO_LIMIT_CONFIGURED');
 const manager={durableUsage:async()=>({scope:'POSTGRES_SHARED',day_utc:'2026-11-24',month_utc:'2026-11',daily_requests:9,daily_limit:10,monthly_requests:40,monthly_limit:50})};
 const secret='never-show-this-key';
 const summary=await dashboard({manager,env:{FIRECRAWL_API_KEY:secret,TRACKER_GROWTH_FIRECRAWL_ENABLED:'true'}});
 assert.equal(summary.daily.status,'WARNING_90');
 assert.equal(summary.monthly.status,'WARNING_80');
 assert.equal(summary.provider_credits.remaining,null);
 assert.equal(summary.key_validity,'NOT_CHECKED');
 assert(!JSON.stringify(summary).includes(secret));
 assert.equal((await dashboard({manager,env:{}})).status,'KEY_MISSING');
 assert.equal((await dashboard({manager:{durableUsage:async()=>{throw Error(secret)}},env:{FIRECRAWL_API_KEY:secret}})).status,'ACCOUNTING_UNAVAILABLE');
});
test('Firecrawl usage route checks owner authorization before requesting statistics',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require.resolve('../src/growth-free/routes.cjs'),'utf8');
 assert.match(source,/app\.get\(apiPath\+'\/admin\/firecrawl-usage',async\(req,res\)=>\{\s*if\(!admin\(req,res\)\)return;\s*res\.set\('Cache-Control','private, no-store'\)/);
});
