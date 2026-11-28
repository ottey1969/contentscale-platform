'use strict';
// Shared optional hosted reader for Free Growth, Tracker and GSC Audit.
// Existing public HTTPS reader remains the fallback.
// No Firecrawl package, crawler or WordPress plugin is installed.
const dns=require('node:dns').promises;
const {fetchPublicGrowthHtml,validateUrl,publicV4,RESEARCH_FETCH}=require('./growth-public-html-reader.cjs');
const {firecrawlManager,createFirecrawlManager}=require('./firecrawl-manager.cjs');
const DEFAULT_LIMIT=6;
function enabled(env=process.env){
 return env.FREE_GROWTH_FIRECRAWL_ENABLED==='true'&&!!String(env.FIRECRAWL_API_KEY||'').trim();
}
function createFreeGrowthFirecrawlReader({
 env=process.env,
 original=fetchPublicGrowthHtml,
 fetchImpl=globalThis.fetch,
 lookup=dns.lookup,
 module='UNCLASSIFIED',
 maxPages=DEFAULT_LIMIT,
 timeoutMs=11000,
 manager=fetchImpl===globalThis.fetch?firecrawlManager:createFirecrawlManager(),
 // Free Growth keeps 10; the owner's GSC report may ask for more (at most 50, paid per page).
 hardCap=10,
}={}){
 const active=enabled(env);
 const cap=Math.max(1,Math.min(Math.min(50,Number(hardCap)||10),Number(maxPages)||DEFAULT_LIMIT));
 const stats={enabled:active,provider:'FIRECRAWL_HOSTED',attempted:0,used:0,fallbacks:0,cache_hits:0,shared_cache_hits:0,provider_requests:0,limit:cap,errors:[],pages:[]};
 const cache=new Map();
 const record=async event=>{if(typeof manager.record==='function')await manager.record(env,module,event)};
 const limitedMessage=(url,code)=>{if(stats.errors.length<10)stats.errors.push({host:(()=>{try{return new URL(url).hostname}catch{return 'invalid'}})(),code})};
 const reader=async (raw,options=RESEARCH_FETCH)=>{
  if(!active)return original(raw,options);
  // Preserve refusals from publishers: Firecrawl must never be used to bypass a 401/403/406/429.
  // The pilot still tries Firecrawl on readable public pages to compare capture quality.
  let direct=null;
  try{direct=await original(raw,options)}
  catch(e){if(/^HTTP_(401|403|406|429)$/.test(String(e?.code||'')))throw e}
  // The normal reader checks each actual redirect. We also validate the supplied hostname
  // before giving it to an external service. Never send internal/private hosts to Firecrawl.
  let url;
  try{
   url=validateUrl(raw);
   const addresses=await lookup(url.hostname,{family:4,all:true,verbatim:true});
   if(!addresses?.length||!addresses.every(a=>publicV4(a.address)))throw Object.assign(Error('PUBLIC_IPV4_UNAVAILABLE'),{code:'PUBLIC_IPV4_UNAVAILABLE'});
  }catch(e){if(direct)return direct;return original(raw,options)}
  const cacheKey=url.href+'|'+String(options?.compact===true)+'|'+String(options?.limit||RESEARCH_FETCH.limit);
  if(cache.has(cacheKey)){stats.cache_hits++;await record('cache');return cache.get(cacheKey)}
  if(stats.attempted>=cap)return direct||original(raw,options);
  stats.attempted++;
  const task=(async()=>{
   try{
    const managed=await manager.read({env,url:url.href,load:async()=>{
     stats.provider_requests++;
     await record('request');
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),timeoutMs);
     try{
      const response=await fetchImpl('https://api.firecrawl.dev/v2/scrape',{
       method:'POST',
       headers:{Authorization:'Bearer '+String(env.FIRECRAWL_API_KEY).trim(),'Content-Type':'application/json'},
       body:JSON.stringify({url:url.href,formats:['html'],onlyMainContent:false,maxAge:0}),
       signal:controller.signal
      });
      if(!response.ok)throw Object.assign(Error('FIRECRAWL_HTTP_'+response.status),{code:'FIRECRAWL_HTTP_'+response.status});
      const body=await response.json(),data=body?.data||body;
      const html=typeof data?.html==='string'?data.html:'',meta=data?.metadata||{};
      if(body?.success===false||html.length<500)throw Object.assign(Error('FIRECRAWL_EMPTY'),{code:'FIRECRAWL_EMPTY'});
      const final=validateUrl(meta.sourceURL||meta.url||url.href);
      const dest=await lookup(final.hostname,{family:4,all:true,verbatim:true});
      if(!dest?.length||!dest.every(a=>publicV4(a.address)))throw Object.assign(Error('FIRECRAWL_PRIVATE_REDIRECT'),{code:'FIRECRAWL_PRIVATE_REDIRECT'});
      return {html,final_url:final.href,retrieved_at:new Date().toISOString()};
     }catch(e){await record('error');throw e}finally{clearTimeout(timeout)}
    }});
    if(managed.source!=='REQUEST'){stats.shared_cache_hits++;await record('cache')}
    const {html,retrieved_at}=managed.value;
    const final=validateUrl(managed.value.final_url);
    // Revalidate the final destination even when a previous capture is reused.
    const dest=await lookup(final.hostname,{family:4,all:true,verbatim:true});
    if(!dest?.length||!dest.every(a=>publicV4(a.address)))throw Object.assign(Error('FIRECRAWL_PRIVATE_REDIRECT'),{code:'FIRECRAWL_PRIVATE_REDIRECT'});
    // Existing Growth sections and quality gates consume HTML (not Markdown).
    const limit=Math.max(1000,Math.min(600000,Number(options?.limit)||RESEARCH_FETCH.limit));
    const {compactPublicHtml}=require('./growth-public-html-reader.cjs');
    const clean=options?.compact===true?compactPublicHtml(html):html;
    if(clean.length<300)throw Object.assign(Error('FIRECRAWL_UNREADABLE'),{code:'FIRECRAWL_UNREADABLE'});
    if(direct?.html&&clean.length<direct.html.length*0.5)throw Object.assign(Error('FIRECRAWL_LESS_COMPLETE'),{code:'FIRECRAWL_LESS_COMPLETE'});
    stats.used++;
    await record('used');
    stats.pages.push({url:url.href,final_url:final.href,provider:'FIRECRAWL_HOSTED_API',status:'USED',cache_source:managed.source,retrieved_at,readable_chars:clean.length,truncated:clean.length>limit});
    return {html:clean.slice(0,limit),truncated:clean.length>limit,final_url:final.href,
     requested_url:url.href,status:200,retrieved_at,
     source:'FIRECRAWL_HOSTED_API',capture:{cause:clean.length>limit?'READABLE_HTML_EXCEEDED_LIMIT':null,readable_chars:clean.length,readable_limit:limit}};
   }catch(err){
    const code=String(err?.code||err?.name||'FIRECRAWL_FAILED').slice(0,60);
    limitedMessage(url.href,code);stats.fallbacks++;
    await record('fallback');
    stats.pages.push({url:url.href,provider:'STANDARD_READER',status:'FIRECRAWL_FALLBACK',reason:code,retrieved_at:new Date().toISOString()});
    return direct||original(raw,options);
   }
  })();
  cache.set(cacheKey,task);
  return task;
 };
 return {reader,stats};
}
// Pre-Write (owner 2026-11-28): Firecrawl only when the normal reader could not read a page, never by default, to keep the
// budget down. Used for: a timeout or network error, a 5xx, or a page whose visible text is too thin (a JavaScript shell).
// Never for a refusal (401/403/406/429), a bot check or a 404: bot blocks are respected, a missing page stays missing.
const REFUSED=/^HTTP_(401|403|406|429)$/;
const visibleChars=html=>String(html||'').replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim().length;
function createFallbackReader({env=process.env,original=fetchPublicGrowthHtml,fetchImpl=globalThis.fetch,lookup=dns.lookup,
 manager,maxPages=6,minChars=400,module='PREWRITE'}={}){
 const key=String(env.FIRECRAWL_API_KEY||'').trim();
 const on=!!key&&env.PREWRITE_FIRECRAWL_FALLBACK!=='false';
 const stats={enabled:on,attempted:0,used:0,reasons:[]};
 const {isBotCheck}=require('./gsc-report/site-audit.cjs');
 const reader=async(raw,options=RESEARCH_FETCH)=>{
  let direct=null,failure=null;
  try{direct=await original(raw,options)}
  catch(e){if(REFUSED.test(String(e?.code||'')))throw e;failure=e}
  if(direct){
   if(isBotCheck(direct.html))return direct;
   const thin=direct.status===200&&visibleChars(direct.html)<minChars;
   if(!(direct.status>=500||thin))return direct;
  }
  if(!on||stats.attempted>=maxPages){if(direct)return direct;throw failure}
  stats.attempted++;
  stats.reasons.push(failure?String(failure.code||failure.name||'ERROR').slice(0,40):direct.status>=500?'HTTP_'+direct.status:'THIN_TEXT');
  const inner=createFreeGrowthFirecrawlReader({env:{...env,FREE_GROWTH_FIRECRAWL_ENABLED:'true',FIRECRAWL_API_KEY:key},
   original:async()=>{if(direct)return direct;throw failure},fetchImpl,lookup,module,maxPages:1,
   ...(manager?{manager}:{})});
  const page=await inner.reader(raw,options);
  if(inner.stats.used)stats.used++;
  return page;
 };
 reader.stats=stats;
 return reader;
}
module.exports={enabled,createFreeGrowthFirecrawlReader,createFallbackReader};
