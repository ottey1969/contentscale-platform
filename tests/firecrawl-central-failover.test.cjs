'use strict';
// Owner 2026-11-28: one central Firecrawl integration for every module.
// - Native first: Firecrawl only when the normal crawler gives too little usable content.
// - FIRECRAWL_API_KEY_BACKUP, FIRECRAWL_AUTO_FAILOVER and FIRECRAWL_MIN_CREDITS: switch to the second authorised key only
//   when the provider reports fewer than FIRECRAWL_MIN_CREDITS remaining credits, or confirms exhaustion (HTTP 402).
// - Never switch keys on a rate limit (429) or any other provider limit.
// - Central cache, PostgreSQL accounting, daily/monthly limits and duplicate-request prevention stay.
// - The owner dashboard shows per account: remaining credits, active key, last verification, usage per module. Never a key.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFirecrawlManager}=require('../src/firecrawl-manager.cjs');
const {createFreeGrowthFirecrawlReader,createFallbackReader}=require('../src/growth-free-firecrawl-reader.cjs');
const {MODULES}=require('../src/firecrawl-postgres-accounting.cjs');

const PRIMARY='fc-primary-secret-key',BACKUP='fc-backup-secret-key';
const url='https://example.com/roof-leak/';
const lookup=async()=>[{address:'93.184.216.34',family:4}];
const failoverEnv=(extra={})=>({FIRECRAWL_API_KEY:PRIMARY,FIRECRAWL_API_KEY_BACKUP:BACKUP,FIRECRAWL_AUTO_FAILOVER:'true',FIRECRAWL_MIN_CREDITS:'50',...extra});
const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
// Provider mock: credit-usage answers per key (a number = remaining credits, a string = an HTTP error status); every call is logged without the key itself.
function provider(credits){
 const calls=[];
 const fetchImpl=async(u,init={})=>{
  const auth=String(init.headers?.Authorization||'');
  const who=auth.endsWith(PRIMARY)?'PRIMARY':auth.endsWith(BACKUP)?'BACKUP':'UNKNOWN';
  calls.push({url:u,who,method:init.method||'GET'});
  if(u==='https://api.firecrawl.dev/v2/team/credit-usage'){
   const c=credits[who];
   if(typeof c==='number')return json(200,{success:true,data:{remainingCredits:c,planCredits:3000,billingPeriodStart:'2026-11-01T00:00:00Z',billingPeriodEnd:'2026-11-30T23:59:59Z'}});
   return json(Number(c)||500,{success:false,error:'unavailable'});
  }
  throw Error('unexpected provider call '+u);
 };
 return {calls,fetchImpl,credits:who=>calls.filter(c=>c.who===who&&c.url.endsWith('/credit-usage')).length};
}
const page=label=>({html:'<main><h1>'+label+'</h1><p>'+'Useful evidence. '.repeat(60)+'</p></main>',final_url:url});

test('fewer than FIRECRAWL_MIN_CREDITS remaining on the primary account switches to the backup key',async()=>{
 const p=provider({PRIMARY:49,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const used=[];
 const r=await manager.read({env:failoverEnv(),url,load:async ctx=>{used.push(ctx.label);assert.equal(ctx.apiKey,BACKUP);return page('backup')}});
 assert.deepEqual(used,['BACKUP']);
 assert.equal(r.key.label,'BACKUP');
 assert.equal(p.credits('PRIMARY'),1);assert.equal(p.credits('BACKUP'),1);
});

test('exactly FIRECRAWL_MIN_CREDITS remaining keeps the primary key; no backup check is needed',async()=>{
 const p=provider({PRIMARY:50,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const r=await manager.read({env:failoverEnv(),url,load:async ctx=>{assert.equal(ctx.label,'PRIMARY');return page('primary')}});
 assert.equal(r.key.label,'PRIMARY');assert.equal(p.credits('BACKUP'),0);
});

test('without FIRECRAWL_AUTO_FAILOVER=true the primary key is always used and no credit check is made',async()=>{
 const p=provider({PRIMARY:1,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const r=await manager.read({env:failoverEnv({FIRECRAWL_AUTO_FAILOVER:'false'}),url,load:async ctx=>{assert.equal(ctx.label,'PRIMARY');return page('primary')}});
 assert.equal(r.key.label,'PRIMARY');assert.equal(p.calls.length,0);
});

test('confirmed credit exhaustion (HTTP 402) moves the same request once to the backup key, then stays there',async()=>{
 const p=provider({PRIMARY:500,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const used=[];
 const load=async ctx=>{used.push(ctx.label);if(ctx.label==='PRIMARY')throw Object.assign(Error('FIRECRAWL_HTTP_402'),{code:'FIRECRAWL_HTTP_402'});return page('backup')};
 const r=await manager.read({env:failoverEnv(),url,load});
 assert.equal(r.key.label,'BACKUP');assert.deepEqual(used,['PRIMARY','BACKUP']);
 await manager.read({env:failoverEnv(),url:url+'next',load});
 assert.deepEqual(used,['PRIMARY','BACKUP','BACKUP'],'the exhausted primary is not asked again');
 const account=(await manager.accounts(failoverEnv())).find(a=>a.label==='PRIMARY');
 assert.equal(account.credits.status,'EXHAUSTED');assert.equal(account.credits.remaining,0);
});

test('a rate limit (429) never switches keys and never marks credits exhausted',async()=>{
 const p=provider({PRIMARY:500,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const used=[];
 await assert.rejects(manager.read({env:failoverEnv(),url,load:async ctx=>{used.push(ctx.label);throw Object.assign(Error('FIRECRAWL_HTTP_429'),{code:'FIRECRAWL_HTTP_429'})}}),{code:'FIRECRAWL_HTTP_429'});
 assert.deepEqual(used,['PRIMARY']);
 assert.equal(p.credits('BACKUP'),0,'the backup key is not even checked');
 const account=(await manager.accounts(failoverEnv())).find(a=>a.label==='PRIMARY');
 assert.notEqual(account.credits.status,'EXHAUSTED');
});

test('a rate-limited or failed credit check is not a confirmation: the primary key stays active',async()=>{
 for(const status of ['429','500']){
  const p=provider({PRIMARY:status,BACKUP:900});
  const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
  const r=await manager.read({env:failoverEnv(),url,load:async()=>page('primary')});
  assert.equal(r.key.label,'PRIMARY',String(status));assert.equal(p.credits('BACKUP'),0);
 }
});

test('other provider errors (5xx, 401, timeout) do not switch keys',async()=>{
 for(const code of ['FIRECRAWL_HTTP_500','FIRECRAWL_HTTP_401','AbortError','FIRECRAWL_EMPTY']){
  const p=provider({PRIMARY:500,BACKUP:900});
  const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
  const used=[];
  await assert.rejects(manager.read({env:failoverEnv(),url,load:async ctx=>{used.push(ctx.label);throw Object.assign(Error(code),{code})}}));
  assert.deepEqual(used,['PRIMARY'],code);
 }
});

test('both accounts exhausted: no provider request, FIRECRAWL_CREDITS_EXHAUSTED, the reader keeps the native page',async()=>{
 const p=provider({PRIMARY:0,BACKUP:0});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 let loads=0;
 await assert.rejects(manager.read({env:failoverEnv({FIRECRAWL_MIN_CREDITS:'50'}),url,load:async()=>{loads++;return page('x')}}),{code:'FIRECRAWL_CREDITS_EXHAUSTED'});
 assert.equal(loads,0);
 // Below the minimum but not confirmed empty: the key with the most credits is still used rather than nothing.
 const q=provider({PRIMARY:10,BACKUP:30});
 const m2=createFirecrawlManager({fetchImpl:q.fetchImpl});
 assert.equal((await m2.read({env:failoverEnv(),url,load:async()=>page('x')})).key.label,'BACKUP');
 // The reader turns exhaustion into the native result.
 let scrapes=0;
 const native=async()=>({html:'<h1>Native</h1>',status:200,final_url:url,source:'LIVE_PUBLIC_HTTPS'});
 const {reader,stats}=createFreeGrowthFirecrawlReader({env:{...failoverEnv(),FREE_GROWTH_FIRECRAWL_ENABLED:'true'},lookup,manager,original:native,
  fetchImpl:async()=>{scrapes++;return json(200,{})}});
 assert.equal((await reader(url,{compact:true})).source,'LIVE_PUBLIC_HTTPS');
 assert.equal(scrapes,0);assert.equal(stats.errors[0].code,'FIRECRAWL_CREDITS_EXHAUSTED');
});

test('the primary key is used again once its verified credits are back above the minimum',async()=>{
 let now=Date.parse('2026-11-28T10:00:00Z');
 const credits={PRIMARY:20,BACKUP:900};
 const p=provider(credits);
 const manager=createFirecrawlManager({now:()=>now,fetchImpl:p.fetchImpl});
 const env=failoverEnv({FIRECRAWL_CREDIT_CHECK_SECONDS:'300'});
 assert.equal((await manager.read({env,url,load:async()=>page('a')})).key.label,'BACKUP');
 credits.PRIMARY=2000;
 assert.equal((await manager.read({env,url:url+'2',load:async()=>page('b')})).key.label,'BACKUP','verification is cached for the configured time');
 assert.equal(p.credits('PRIMARY'),1);
 now+=301000;
 assert.equal((await manager.read({env,url:url+'3',load:async()=>page('c')})).key.label,'PRIMARY');
});

test('credits spent since the last verification count towards the minimum',async()=>{
 const p=provider({PRIMARY:52,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const labels=[];
 for(let i=0;i<4;i++)labels.push((await manager.read({env:failoverEnv(),url:url+i,load:async()=>page(String(i))})).key.label);
 assert.deepEqual(labels,['PRIMARY','PRIMARY','PRIMARY','BACKUP'],'52, 51, 50 remain usable; at 49 the backup takes over');
});

test('central cache: a page captured once is reused across modules and keys without a provider call',async()=>{
 const p=provider({PRIMARY:10,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const env=failoverEnv({FIRECRAWL_SHARED_CACHE_TTL_SECONDS:'60'});
 let loads=0;
 const first=await manager.read({env,url,load:async()=>{loads++;return page('one')}});
 const second=await manager.read({env,url,load:async()=>{loads++;return page('two')}});
 assert.equal(loads,1);assert.equal(second.source,'CACHE');
 assert.equal(second.key.label,first.key.label,'the cache says which account captured the page');
});

test('simultaneous identical requests make one provider request and one credit check per key',async()=>{
 const p=provider({PRIMARY:10,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 let loads=0;
 const load=async()=>{loads++;await new Promise(r=>setTimeout(r,20));return page('once')};
 const results=await Promise.all(Array.from({length:6},()=>manager.read({env:failoverEnv(),url,load})));
 assert.equal(loads,1);
 assert.equal(results.filter(r=>r.source==='IN_FLIGHT').length,5);
 // Different pages at the same moment: still one credit check per key.
 const q=provider({PRIMARY:10,BACKUP:900});
 const m2=createFirecrawlManager({fetchImpl:q.fetchImpl});
 await Promise.all(Array.from({length:5},(_,i)=>m2.read({env:failoverEnv(),url:url+i,load:async()=>page(String(i))})));
 assert.equal(q.credits('PRIMARY'),1);assert.equal(q.credits('BACKUP'),1);
});

test('daily and monthly limits cover all keys together: switching keys never resets them',async()=>{
 const p=provider({PRIMARY:500,BACKUP:900});
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl});
 const env=failoverEnv({FIRECRAWL_DAILY_REQUEST_LIMIT:'1'});
 const load=async ctx=>{if(ctx.label==='PRIMARY')throw Object.assign(Error('FIRECRAWL_HTTP_402'),{code:'FIRECRAWL_HTTP_402'});return page('b')};
 await assert.rejects(manager.read({env,url,load}),{code:'FIRECRAWL_LOCAL_REQUEST_LIMIT'},'the 402 used the only request of the day');
 await assert.rejects(manager.read({env,url:url+'x',load:async()=>page('c')}),{code:'FIRECRAWL_LOCAL_REQUEST_LIMIT'});
});

test('PostgreSQL accounting: the shared quota is reserved once per provider request; module usage is recorded per account',async()=>{
 const p=provider({PRIMARY:10,BACKUP:900});
 const reserved=[],events=[];
 const accounting={reserve:async e=>reserved.push(e.id),usage:async()=>({daily:reserved.length,monthly:reserved.length}),
  record:async e=>events.push([e.id,e.module,e.event]),moduleUsage:async({id})=>events.filter(e=>e[0]===id).map(e=>({module:e[1],event:e[2]}))};
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl,accounting,requireAccounting:true});
 const env={...failoverEnv(),FREE_GROWTH_FIRECRAWL_ENABLED:'true'};
 const scrape=async(u,init)=>{if(u.endsWith('/credit-usage'))return p.fetchImpl(u,init);
  assert.ok(String(init.headers.Authorization).endsWith(BACKUP),'the scrape uses the active key');
  return json(200,{success:true,data:{html:page('hosted').html,metadata:{sourceURL:url}}})};
 const {reader}=createFreeGrowthFirecrawlReader({env,lookup,manager,module:'FREE_PREWRITE',original:async()=>({html:'<h1>x</h1>',status:200,final_url:url}),fetchImpl:scrape});
 assert.equal((await reader(url,{compact:true})).source,'FIRECRAWL_HOSTED_API');
 assert.equal(reserved.length,1);
 const ids=new Set(events.map(e=>e[0]));
 assert.equal(ids.size,1,'every event for this request is booked on the account that paid for it');
 assert.notEqual(reserved[0],[...ids][0],'quota uses the shared account group, usage uses the paying key');
 assert.deepEqual(events.map(e=>e.slice(1)),[['FREE_PREWRITE','request'],['FREE_PREWRITE','used']]);
 assert.ok(!JSON.stringify({reserved,events}).includes(PRIMARY)&&!JSON.stringify({reserved,events}).includes(BACKUP));
});

test('owner dashboard: per account remaining credits, active key, last verification and module usage; never a key',async()=>{
 const {dashboard}=require('../src/firecrawl-owner-dashboard.cjs');
 const p=provider({PRIMARY:20,BACKUP:900});
 const accounting={reserve:async()=>{},usage:async()=>({daily:3,monthly:9}),
  moduleUsage:async()=>[{module:'QUICK_SCAN',requests:2,used:2,fallbacks:0,cache_hits:1,errors:0,daily_requests:1}]};
 const manager=createFirecrawlManager({fetchImpl:p.fetchImpl,accounting,now:()=>Date.parse('2026-11-28T12:00:00Z')});
 const d=await dashboard({manager,env:{...failoverEnv(),FIRECRAWL_DAILY_REQUEST_LIMIT:'100'}});
 const text=JSON.stringify(d);
 assert.ok(!text.includes(PRIMARY)&&!text.includes(BACKUP),'no API key in the dashboard');
 assert.equal(d.accounts.length,2);
 const [pa,ba]=d.accounts;
 assert.equal(pa.label,'PRIMARY');assert.equal(pa.credits.remaining,20);assert.equal(pa.active,false);
 assert.equal(ba.label,'BACKUP');assert.equal(ba.credits.remaining,900);assert.equal(ba.active,true);
 assert.equal(pa.last_verified,'2026-11-28T12:00:00.000Z');
 assert.deepEqual(pa.modules.map(m=>m.module),['QUICK_SCAN']);
 assert.equal(d.active_key,'BACKUP');assert.equal(d.failover.enabled,true);assert.equal(d.failover.min_credits,50);
 assert.equal(d.provider_credits.status,'VERIFIED');assert.equal(d.provider_credits.remaining,900);
 assert.equal(d.daily.used,3);
 // An invalid key is reported as such, still without the key.
 const bad=provider({PRIMARY:'401'});
 const d2=await dashboard({manager:createFirecrawlManager({fetchImpl:bad.fetchImpl,accounting}),env:{FIRECRAWL_API_KEY:PRIMARY}});
 assert.equal(d2.accounts[0].credits.status,'KEY_INVALID');assert.equal(d2.key_validity,'INVALID');
 assert.ok(!JSON.stringify(d2).includes(PRIMARY));
});

test('native first: a readable page from the normal crawler never goes to Firecrawl',async()=>{
 let scrapes=0;
 const rich={html:'<main><h1>Roof</h1><p>'+'Readable native content. '.repeat(40)+'</p></main>',status:200,final_url:url,source:'LIVE_PUBLIC_HTTPS'};
 const env={FREE_GROWTH_FIRECRAWL_ENABLED:'true',FIRECRAWL_API_KEY:PRIMARY};
 const {reader,stats}=createFreeGrowthFirecrawlReader({env,lookup,original:async()=>rich,manager:createFirecrawlManager(),fetchImpl:async()=>{scrapes++;return json(200,{})}});
 assert.equal((await reader(url,{compact:true})).source,'LIVE_PUBLIC_HTTPS');
 assert.equal(scrapes,0);assert.equal(stats.attempted,0);
 // A bot check is respected: never sent.
 const bot={html:'<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing. cf-challenge</body></html>',status:200,final_url:url};
 const b=createFreeGrowthFirecrawlReader({env,lookup,original:async()=>bot,manager:createFirecrawlManager(),fetchImpl:async()=>{scrapes++;return json(200,{})}});
 await b.reader(url,{compact:true});assert.equal(scrapes,0);
 // A caller that already proved the native page insufficient (GSC audit, Tracker) may say so.
 const ok=async()=>json(200,{success:true,data:{html:page('hosted').html,metadata:{sourceURL:url}}});
 const c=createFreeGrowthFirecrawlReader({env,lookup,original:async()=>rich,manager:createFirecrawlManager(),fetchImpl:ok,insufficient:()=>true});
 assert.equal((await c.reader(url,{compact:true})).source,'FIRECRAWL_HOSTED_API');
});

test('the Pre-Write fallback never sends a missing page (404) or a refusal to Firecrawl',async()=>{
 let scrapes=0;
 for(const code of ['HTTP_404','HTTP_410','HTTP_403','HTTP_429']){
  const reader=createFallbackReader({env:{FIRECRAWL_API_KEY:PRIMARY},lookup,manager:createFirecrawlManager(),
   original:async()=>{throw Object.assign(Error(code),{code})},fetchImpl:async()=>{scrapes++;return json(200,{})}});
  await assert.rejects(reader(url),{code});
 }
 assert.equal(scrapes,0);
});

test('provider errors fall back to the native result: 5xx, timeout, empty answer',async()=>{
 const native=async()=>({html:'<h1>Thin native</h1>',status:200,final_url:url,source:'LIVE_PUBLIC_HTTPS'});
 const cases=[async()=>json(503,{}),async()=>{throw Object.assign(Error('aborted'),{name:'AbortError'})},async()=>json(200,{success:true,data:{html:''}})];
 for(const fetchImpl of cases){
  const reader=createFallbackReader({env:{FIRECRAWL_API_KEY:PRIMARY},lookup,manager:createFirecrawlManager(),original:native,fetchImpl});
  const r=await reader(url);
  assert.equal(r.source,'LIVE_PUBLIC_HTTPS');assert.equal(reader.stats.attempted,1);assert.equal(reader.stats.used,0);
 }
});

test('the Pre-Write fallback names its module per call (Free, Tracker, Network)',async()=>{
 const events=[];let mod='TRACKER_PREWRITE';
 const manager=createFirecrawlManager({accounting:{reserve:async()=>{},record:async e=>events.push(e.module)}});
 const ok=async()=>json(200,{success:true,data:{html:page('hosted').html,metadata:{sourceURL:url}}});
 const reader=createFallbackReader({env:{FIRECRAWL_API_KEY:PRIMARY},lookup,manager,module:()=>mod,
  original:async()=>({html:'<h1>x</h1>',status:200,final_url:url}),fetchImpl:ok});
 await reader(url);mod='NETWORK_PREWRITE';await reader(url+'n');
 assert.deepEqual(events,['TRACKER_PREWRITE','TRACKER_PREWRITE','NETWORK_PREWRITE','NETWORK_PREWRITE']);
});

test('Quick Scan and CEO Scan: Firecrawl only after the scanner failed for a non-refusal reason and the static page is unusable',async()=>{
 const {scanFallbackEligible,acquireScanHtml}=require('../src/firecrawl-scan-fallback.cjs');
 assert.equal(scanFallbackEligible({status:500,scan:{step:'navigation'}}),true);
 assert.equal(scanFallbackEligible({status:503,scan:{step:'browser_launch'}}),true);
 assert.equal(scanFallbackEligible({name:'TimeoutError'}),true);
 assert.equal(scanFallbackEligible({status:422,scan:{step:'invalid_response',http_status:502}}),true);
 for(const blocked of [{status:422,scan:{step:'invalid_response',http_status:403,error:'SCAN RESPONSE INVALID — HTTP 403'}},
  {status:422,scan:{step:'invalid_response',error:'SCAN RESPONSE INVALID — security or anti-bot page received'}},
  {status:422,scan:{step:'invalid_response',http_status:404}},{status:422,scan:{step:'invalid_response',http_status:429}},{status:400,scan:{}}])
  assert.equal(scanFallbackEligible(blocked),false,JSON.stringify(blocked));
 const hosted={html:page('hosted').html,source:'FIRECRAWL_HOSTED_API',final_url:url};
 assert.equal((await acquireScanHtml(url,{reader:async()=>hosted})).html,hosted.html);
 assert.equal(await acquireScanHtml(url,{reader:async()=>({html:page('native').html,source:'LIVE_PUBLIC_HTTPS'})}),null,'native HTML keeps the original scan result');
 assert.equal(await acquireScanHtml(url,{reader:async()=>{throw Object.assign(Error('HTTP_403'),{code:'HTTP_403'})}}),null);
});

test('one central integration: every module is a named module and only the shared reader talks to the provider',()=>{
 for(const m of ['GSC_AUDIT','FREE_GROWTH','TRACKER_GROWTH','FREE_PREWRITE','TRACKER_PREWRITE','NETWORK_PREWRITE','CEO_SCAN','QUICK_SCAN'])assert.ok(MODULES.has(m),m);
 const src=f=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
 const files=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(c?js)$/.test(e.name))files.push(p)}})(path.join(__dirname,'..','src'));
 const callers=files.filter(f=>/api\.firecrawl\.dev/.test(fs.readFileSync(f,'utf8'))).map(f=>path.relative(path.join(__dirname,'..','src'),f)).sort();
 assert.deepEqual(callers,['firecrawl-manager.cjs','growth-free-firecrawl-reader.cjs']);
 assert.match(src('growth-free/engine.cjs'),/module:'FREE_GROWTH'/);
 assert.match(src('gsc-report/routes.cjs'),/module:'GSC_AUDIT'/);
 assert.match(src('tracker-growth-automatic-routes.cjs'),/module:'TRACKER_GROWTH'/);
 assert.match(src('free-prewrite.cjs'),/module:'FREE_PREWRITE'/);
 const index=src('index.js');
 assert.match(index,/'FREE_PREWRITE'[\s\S]{0,80}'NETWORK_PREWRITE'[\s\S]{0,40}'TRACKER_PREWRITE'/);
 assert.match(index,/_canonicalContentScoreScan\(\{url:row\.url\},\{timeoutMs:90000,firecrawlModule:'QUICK_SCAN'\}\)/);
 assert.match(index,/firecrawlModule:req\[_INTERNAL_CEO_AUDIT\]\?'CEO_SCAN':null/);
});
