'use strict';
// Optional Firecrawl-hosted research reader for Free Growth ONLY.
// Existing public HTTPS reader remains the fallback; Tracker does not use this adapter.
// No Firecrawl package, crawler or WordPress plugin is installed.
const dns=require('node:dns').promises;
const {fetchPublicGrowthHtml,validateUrl,publicV4,RESEARCH_FETCH}=require('./growth-public-html-reader.cjs');
const DEFAULT_LIMIT=6;
function enabled(env=process.env){
 return env.FREE_GROWTH_FIRECRAWL_ENABLED==='true'&&!!String(env.FIRECRAWL_API_KEY||'').trim();
}
function createFreeGrowthFirecrawlReader({
 env=process.env,
 original=fetchPublicGrowthHtml,
 fetchImpl=globalThis.fetch,
 lookup=dns.lookup,
 maxPages=DEFAULT_LIMIT,
 timeoutMs=11000,
 // Free Growth keeps 10; the owner's GSC report may ask for more (at most 50, paid per page).
 hardCap=10,
}={}){
 const active=enabled(env);
 const cap=Math.max(1,Math.min(Math.min(50,Number(hardCap)||10),Number(maxPages)||DEFAULT_LIMIT));
 const stats={enabled:active,provider:'FIRECRAWL_HOSTED',attempted:0,used:0,fallbacks:0,cache_hits:0,limit:cap,errors:[],pages:[]};
 const cache=new Map();
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
   if(!addresses?.some(a=>publicV4(a.address)))throw Object.assign(Error('PUBLIC_IPV4_UNAVAILABLE'),{code:'PUBLIC_IPV4_UNAVAILABLE'});
  }catch(e){if(direct)return direct;return original(raw,options)}
  const cacheKey=url.href;
  if(cache.has(cacheKey)){stats.cache_hits++;return cache.get(cacheKey)}
  if(stats.attempted>=cap)return direct||original(raw,options);
  stats.attempted++;
  const task=(async()=>{
   try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{
     response=await fetchImpl('https://api.firecrawl.dev/v2/scrape',{
      method:'POST',
      headers:{Authorization:'Bearer '+String(env.FIRECRAWL_API_KEY).trim(),'Content-Type':'application/json'},
      body:JSON.stringify({url:url.href,formats:['html'],onlyMainContent:false,maxAge:0}),
      signal:controller.signal
     });
    }finally{clearTimeout(timeout)}
    if(!response.ok)throw Object.assign(Error('FIRECRAWL_HTTP_'+response.status),{code:'FIRECRAWL_HTTP_'+response.status});
    const body=await response.json();
    const data=body?.data||body;
    const html=typeof data?.html==='string'?data.html:'';
    const meta=data?.metadata||{};
    // Never use a failed, empty or unexpectedly short extraction as complete evidence.
    if(body?.success===false||html.length<500)throw Object.assign(Error('FIRECRAWL_EMPTY'),{code:'FIRECRAWL_EMPTY'});
    const final=validateUrl(meta.sourceURL||meta.url||url.href);
    // Redirects to other domains are allowed only if they still resolve to public IPv4.
    const dest=await lookup(final.hostname,{family:4,all:true,verbatim:true});
    if(!dest?.some(a=>publicV4(a.address)))throw Object.assign(Error('FIRECRAWL_PRIVATE_REDIRECT'),{code:'FIRECRAWL_PRIVATE_REDIRECT'});
    // Existing Growth sections and quality gates consume HTML (not Markdown).
    const limit=Math.max(1000,Math.min(600000,Number(options?.limit)||RESEARCH_FETCH.limit));
    const {compactPublicHtml}=require('./growth-public-html-reader.cjs');
    const clean=options?.compact===true?compactPublicHtml(html):html;
    if(clean.length<300)throw Object.assign(Error('FIRECRAWL_UNREADABLE'),{code:'FIRECRAWL_UNREADABLE'});
    if(direct?.html&&clean.length<direct.html.length*0.5)throw Object.assign(Error('FIRECRAWL_LESS_COMPLETE'),{code:'FIRECRAWL_LESS_COMPLETE'});
    stats.used++;
    const retrieved_at=new Date().toISOString();
    stats.pages.push({url:url.href,final_url:final.href,provider:'FIRECRAWL_HOSTED_API',status:'USED',retrieved_at,readable_chars:clean.length,truncated:clean.length>limit});
    return {html:clean.slice(0,limit),truncated:clean.length>limit,final_url:final.href,
     requested_url:url.href,status:200,retrieved_at,
     source:'FIRECRAWL_HOSTED_API',capture:{cause:clean.length>limit?'READABLE_HTML_EXCEEDED_LIMIT':null,readable_chars:clean.length,readable_limit:limit}};
   }catch(err){
    const code=String(err?.code||err?.name||'FIRECRAWL_FAILED').slice(0,60);
    limitedMessage(url.href,code);stats.fallbacks++;
    stats.pages.push({url:url.href,provider:'STANDARD_READER',status:'FIRECRAWL_FALLBACK',reason:code,retrieved_at:new Date().toISOString()});
    return direct||original(raw,options);
   }
  })();
  cache.set(cacheKey,task);
  return task;
 };
 return {reader,stats};
}
module.exports={enabled,createFreeGrowthFirecrawlReader};
