'use strict';
const {navDiffersFromQuery}=require('./growth-intent-signals.cjs');
const {rejectLead,marketRelevance}=require('./growth-serp-quality.cjs');
const {glOf,countryName}=require('./growth-search-locale.cjs');
// Optional, public, low-frequency Bing web RSS discovery. Bing's public RSS
// format is experimental, NOT a Google SERP, ranking or guaranteed service.
// If unavailable, return a visible status; never substitute invented results.
const {fetchPublicGrowthHtml,validateUrl}=require('./growth-public-html-reader.cjs');
const {terms}=require('./growth-one-action-decision.cjs');
const {matchedTerms}=require('./growth-word-match.cjs');
const decode=x=>String(x||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&#(\d{1,6});/g,(_,n)=>{const v=Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):''})
 .replace(/&#x([0-9a-f]{1,6});/gi,(_,n)=>{const v=parseInt(n,16);return v>0&&v<=0x10ffff?String.fromCodePoint(v):''})
 .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n.toLowerCase()]||''));
const clean=x=>decode(x).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const wrongProductIntent=(title,snippet,query)=>navDiffersFromQuery(title,query).length>0||
 (/\b(reviews?|alternatives?|vs\.?|versus)\b/i.test(title)&&!/\b(reviews?|alternatives?|vs\.?|versus)\b/i.test(query));
const infrastructure=/^(?:www\.)?(?:bing\.com|microsoft\.com|google\.com|youtube\.com|facebook\.com|instagram\.com|pinterest\.com|linkedin\.com)$/i;
function parseBingRss(xml,{query='',ownUrl='',limit=7,market=null}={}){
 const marketStates=market?.states||[];
 const raw=String(xml||'');
 if(!/<rss\b/i.test(raw)||!/<channel\b/i.test(raw)||!/<item\b/i.test(raw))return [];
 let own='';try{own=new URL(ownUrl).hostname.replace(/^www\./,'').toLowerCase()}catch{}
 const required=terms(query),seen=new Set(),rows=[];
 for(const item of raw.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const body=item[1],title=clean(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(body)?.[1]||'');
  const href=decode(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i.exec(body)?.[1]||'').trim();
  const snippet=clean(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i.exec(body)?.[1]||'').slice(0,400);
  let url;try{url=validateUrl(href)}catch{continue}
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  if(host===own||infrastructure.test(host)||seen.has(url.href)||!title)continue;
  // Word forms count (tracker ↔ tracking): a title about the same thing is not dropped for its grammar.
  const matched=matchedTerms(required,terms(title));
  if(required.length&&matched.length<Math.min(2,required.length))continue;
  if(wrongProductIntent(title,snippet,query))continue;
  if(/(?:^|\/)(?:privacy|terms|disclaimer|login|signup|checkout|tag|category|search)(?:\/|$)/i.test(url.pathname))continue;
  if(rejectLead({query,lead:{url:url.href,title,snippet},ownHost:own,marketStates}))continue;
  seen.add(url.href);
  rows.push({url:url.href,title:title.slice(0,180),snippet,source:'BING_PUBLIC_RSS',status:'FRESH_BING_RSS_LEAD_NOT_GOOGLE_RANKING',query,
   market_relevance:marketRelevance({title,snippet},marketStates)});
  if(rows.length>=limit)break;
 }
 return rows;
}
async function discoverGrowthCompetitors({query,ownUrl,market=null,locale=null,fetchFeed=fetchPublicGrowthHtml,now=new Date()}={}){
 const term=String(query||'').trim();
 if(!term||term.length>100||!/^[\p{L}\p{N}][\p{L}\p{N}\s&'’.,/-]*$/u.test(term))
  return {status:'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH',query:term,leads:[],checked_at:null,source:'BING_PUBLIC_RSS'};
 let feed;
 try{
  // The page's stated market (cc = country, setlang = language); without one the request is unchanged.
  const where=!market&&locale?.country?{cc:locale.country,setlang:locale.hl||'en'}:{};
  const searchUrl='https://www.bing.com/search?'+new URLSearchParams({q:term,format:'rss',...where});
  feed=await fetchFeed(searchUrl,{allowFeedXml:true,timeout:8000,limit:80000,redirects:0});
 }catch(e){
  return {status:'PUBLIC_SEARCH_UNAVAILABLE',query:term,leads:[],checked_at:new Date(now).toISOString(),
   source:'BING_PUBLIC_RSS',reason:String(e?.code||'FETCH_FAILED').slice(0,80)};
 }
 const body=feed?.html||'';
 if(!/<rss\b/i.test(body)||!/<channel\b/i.test(body))
  return {status:'PUBLIC_SEARCH_UNAVAILABLE',query:term,leads:[],
   checked_at:feed?.retrieved_at||new Date(now).toISOString(),source:'BING_PUBLIC_RSS',
   reason:'UNEXPECTED_NON_RSS_RESPONSE',
   warning:'Public search returned something other than RSS (possibly a bot-check or changed format). This is a source failure, not evidence that no competitors exist.'};
 const items=parseBingRss(body,{query:term,ownUrl,limit:10,market});
 return {status:feed.truncated?(items.length?'PARTIAL_PUBLIC_SEARCH_LEADS':'PUBLIC_SEARCH_PARTIAL'):
   items.length?'FRESH_PUBLIC_SEARCH_LEADS':'NO_RELEVANT_PUBLIC_SEARCH_LEADS',
  query:term,leads:items,checked_at:feed?.retrieved_at||new Date(now).toISOString(),source:'BING_PUBLIC_RSS',
  warning:'Bing RSS is an optional public discovery source; results and order do NOT establish current Google rankings. Page comparison is based on separately retrieved HTML.'};
}

const lookupLabel=(primary,market,locale)=>market?.location?'US English lookup localised to '+market.location:
 locale?.country?countryName(locale.country)+' lookup (language '+primary.hl+', from '+String(locale.source||'').toLowerCase().replace(/_/g,' ')+')':
 'US English lookup (default: the page states no market)';
// Google sometimes returns organic results as its own redirect links (google.com/goto?url=… or /url?q=…), seen for
// lookups outside the US. They are the real results, not Google pages: the target is taken from the link when it is
// plain, otherwise the redirect is followed once (Location header only, no page body read). A link that cannot be
// resolved is reported as such, never mistaken for search infrastructure.
const isWrapped=u=>{try{const x=new URL(u);return /(^|\.)google\.[a-z.]+$/i.test(x.hostname)&&/^\/(goto|url)$/.test(x.pathname)}catch{return false}};
const plainTarget=u=>{try{const x=new URL(u);for(const k of ['url','q','u']){const v=x.searchParams.get(k);if(v&&/^https?:\/\//i.test(v))return v}}catch{}return null};
const notGoogle=v=>{try{const x=new URL(v);return /^https?:$/.test(x.protocol)&&!/(^|\.)google\.[a-z.]+$/i.test(x.hostname)}catch{return false}};
// Google's redirect page (HTTP 200) names the target in a meta refresh, a script redirect (location.replace / href, often
// with \/ or \x3d escapes) or a link; only those constructs are read, at most 64 KB. Any other URL on the page is ignored.
const unescapeJs=t=>String(t).replace(/\\\//g,'/').replace(/\\x([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))
 .replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/&amp;/g,'&');
const targetInNotice=html=>{
 const t=unescapeJs(html),found=[];
 for(const re of [/http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/gi,
  /location(?:\.href)?(?:\.replace\(|\s*=\s*)\s*["'](https?:\/\/[^"']+)["']/gi,
  /<a\s[^>]*href=["'](https?:\/\/[^"']+)["']/gi])for(const m of t.matchAll(re))found.push(m[1]);
 return found.find(notGoogle)||null;
};
// What Google's page was, for the report (title and markers only, never the page itself).
const noticeSample=(status,html)=>{const t=String(html||'');return {status,bytes:t.length,
 title:((t.match(/<title[^>]*>([^<]{0,120})/i)||[])[1]||'').trim()||null,
 has_script:/<script/i.test(t),consent:/consent\.google|before you continue/i.test(t),unusual_traffic:/unusual traffic|captcha|\/sorry\//i.test(t)}};
async function unwrapGoogleLinks(payload,{fetchImpl,max=12}={}){
 const items=Array.isArray(payload?.organic)?payload.organic.filter(i=>i&&typeof i.link==='string'&&isWrapped(i.link)):[];
 // Why a link stayed unresolved, counted per reason, so a thin research can be explained from the report.
 const stats={received:items.length,resolved:0,unresolved:0},why={};
 await Promise.all(items.map(async(item,i)=>{
  let target=plainTarget(item.link),failure=null;
  if(!target&&i>=max)failure='NOT_TRIED_LIMIT';
  else if(!target&&typeof fetchImpl!=='function')failure='NO_HTTP_CLIENT';
  else if(!target){
   try{const r=await fetchImpl(item.link,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(4000)});
    const loc=r?.headers?.get?.('location'),status=Number(r?.status)||0;
    if(status>=300&&status<400&&loc){target=new URL(loc,item.link).href;if(!notGoogle(target))failure=/consent\./i.test(target)?'REDIRECTED_TO_GOOGLE_CONSENT':'REDIRECTED_TO_GOOGLE'}
    else if(status===200&&typeof r.text==='function'){const html=(await r.text()).slice(0,65536);target=targetInNotice(html);if(!target){failure='NO_TARGET_ON_GOOGLE_PAGE';if(!stats.sample)stats.sample=noticeSample(status,html)}}
    else failure='HTTP_'+(status||'NO_STATUS');
   }catch(e){failure=e?.name==='TimeoutError'?'TIMEOUT':'REQUEST_FAILED'}
  }
  if(target&&notGoogle(target)){item.wrapped_link=item.link;item.link=target;stats.resolved++}
  else why[failure||'TARGET_IS_GOOGLE']=(why[failure||'TARGET_IS_GOOGLE']||0)+1;
 }));
 stats.unresolved=stats.received-stats.resolved;
 if(stats.unresolved)stats.unresolved_reasons=why;
 else delete stats.sample;
 return stats;
}
function parseSerperGoogleOrganic(payload,{query='',ownUrl='',limit=7,rejectedLog=null,market=null,searched={gl:'us',hl:'en'}}={}){
 const marketStates=market?.states||[];
 const results=Array.isArray(payload?.organic)?payload.organic:[];
 let own='';try{own=new URL(ownUrl).hostname.replace(/^www\./,'').toLowerCase()}catch{}
 const needle=terms(query),seen=new Set(),leads=[];
 for(const item of results){
  if(!item||typeof item.title!=='string'||typeof item.link!=='string')continue;
  let parsed;try{parsed=validateUrl(item.link)}catch{continue}
  const hostname=parsed.hostname.replace(/^www\./,'').toLowerCase();
  if(seen.has(parsed.href))continue;
  const title=clean(item.title).slice(0,180),snippet=clean(item.snippet||'').slice(0,400);
  // Every organic result that is not used is logged with its reason, so a thin SERP can be explained from the report.
  const drop=reason=>{(rejectedLog||[]).push({url:parsed.href,title:title.slice(0,100),reason})};
  if(isWrapped(parsed.href)){drop('GOOGLE_REDIRECT_LINK_NOT_RESOLVED');continue}
  if(hostname===own){drop('OWN_SITE');continue}
  if(infrastructure.test(hostname)){drop('SEARCH_OR_SOCIAL_INFRASTRUCTURE');continue}
  const matched=matchedTerms(needle,terms(title));
  if(needle.length&&matched.length<Math.min(2,needle.length)){drop('QUERY_TERMS_NOT_IN_TITLE');continue}
  if(wrongProductIntent(title,snippet,query)){drop('DIFFERENT_PRODUCT_OR_NAVIGATION_INTENT');continue}
  if(/(?:^|\/)(?:privacy|terms|disclaimer|login|signup|checkout|tag|category|search)(?:\/|$)/i.test(parsed.pathname)){drop('NON_CONTENT_PATH');continue}
  const why=rejectLead({query,lead:{url:parsed.href,title,snippet},ownHost:own,marketStates});
  if(why){(rejectedLog||[]).push({url:parsed.href,title:title.slice(0,100),reason:why});continue}
  seen.add(parsed.href);
  const position=Number(item.position);
  leads.push({url:parsed.href,title,snippet,source:'SERPER_GOOGLE_ORGANIC',
   status:'GOOGLE_SERP_OBSERVATION_NOT_TRACKED_PAGE_POSITION',query,
   serp_position:Number.isInteger(position)&&position>=1&&position<=200?position:null,
   geographic_scope:market?.location||(searched.gl==='us'?'US':searched.gl.toUpperCase()),search_language:searched.hl,market_relevance:marketRelevance({url:parsed.href,title,snippet},marketStates)});
  if(leads.length>=limit)break;
 }
 return leads;
}
// Serper.dev is the only paid Google-organic provider for Growth (product rule). Growth reads ONLY SERPER_API_KEY;
// SERPAPI_KEY is never used as a fallback, even though other tracker code paths still accept it.
// Paid calls per run: one, plus at most one retry when fewer than three usable results remain (market query or page 2).
async function optionalGoogleOrganicDiscovery({query,ownUrl,market=null,locale=null,fetchImpl=global.fetch,key=process.env.SERPER_API_KEY,now=new Date()}={}){
 const term=String(query||'').trim(),available=String(key||'').trim();
 if(!term||term.length>100||!/^[\p{L}\p{N}][\p{L}\p{N}\s&'’.,/-]*$/u.test(term))
  return {status:'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 if(!available)return {status:'OPTIONAL_PROVIDER_NOT_CONFIGURED',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 if(typeof fetchImpl!=='function')return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 // Serper.dev accepts POST JSON; never put API credentials into URL or logs.
 // The market the page states (growth-search-locale); a US-state market keeps the US lookup with its location.
 const primary=market?{gl:'us',hl:'en'}:{gl:locale?.gl||'us',hl:locale?.hl||'en'};
 const wrapped={received:0,resolved:0,unresolved:0};const wrappedWhy={};let wrappedSample=null;
 const ask=async(q,page=1,where=primary)=>{
  const response=await fetchImpl('https://google.serper.dev/search',{
   method:'POST',headers:{'X-API-KEY':available,'Content-Type':'application/json'},
   // A local page is researched where it competes: Serper's documented `location` parameter localises the organic results.
   body:JSON.stringify({q,gl:where.gl,hl:where.hl,num:10,...(page>1?{page}:{}),...(market?.location?{location:market.location}:{})}),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return {failure:'HTTP_'+response.status};
  const payload=await response.json();
  if(payload?.error||!Array.isArray(payload?.organic))return {failure:'ORGANIC_RESULTS_MISSING_OR_PROVIDER_ERROR'};
  const w=await unwrapGoogleLinks(payload,{fetchImpl});
  for(const k of Object.keys(wrapped))wrapped[k]+=w[k];
  for(const [k,n] of Object.entries(w.unresolved_reasons||{}))wrappedWhy[k]=(wrappedWhy[k]||0)+n;
  if(w.sample&&!wrappedSample)wrappedSample=w.sample;
  return {payload};
 };
 try{
  const first=await ask(term);
  if(first.failure)return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',reason:first.failure,source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
  const rejected_leads=[];
  let leads=parseSerperGoogleOrganic(first.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market,searched:primary});
  // A localised lookup can still be dominated by other-state providers; when fewer than three comparable results survive the
  // market filter, ask once more with the market named in the query. Bounded to one extra call; nothing is invented.
  let market_query_retry=null;
  const place=market?.location?market.location.split(',')[0].trim():'';
  if(place&&leads.length<3&&!term.toLowerCase().includes(place.toLowerCase())){
   const q2=term+' '+place,second=await ask(q2).catch(()=>({failure:'FETCH_FAILED'}));
   if(second.payload){
    const extra=parseSerperGoogleOrganic(second.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market,searched:primary})
     .filter(l=>!leads.some(x=>x.url===l.url)).map(l=>({...l,query:q2,market_query:true}));
    leads=[...leads,...extra].slice(0,10);
    market_query_retry={query:q2,added_leads:extra.length};
   }else market_query_retry={query:q2,added_leads:0,failure:second.failure};
  }
  // Owner decision (2026-10-29): without a market, a thin first page (fewer than three usable results) may cost exactly one
  // more Serper call for result page 2 of the same query. Never more than two paid calls per research run.
  // A page that names several markets (an international page) spends that one call on its second market instead, so the
  // comparison is not one country's results only. Still never more than two paid calls; further markets are listed as
  // not searched.
  let next_page_retry=null,second_market=null;
  const otherMarkets=market?[]:(locale?.other_countries||[]);
  if(!market_query_retry&&otherMarkets.length){
   const where={gl:glOf(otherMarkets[0]),hl:primary.hl},second=await ask(term,1,where).catch(()=>({failure:'FETCH_FAILED'}));
   if(second.payload){
    const extra=parseSerperGoogleOrganic(second.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market,searched:where})
     .filter(l=>!leads.some(x=>x.url===l.url)).map(l=>({...l,second_market:true}));
    // Interleaved, so both markets reach the limited set of pages that is read.
    const mixed=[];for(let i=0;i<Math.max(leads.length,extra.length);i++){if(leads[i])mixed.push(leads[i]);if(extra[i])mixed.push(extra[i])}
    leads=mixed.slice(0,10);
    second_market={country:otherMarkets[0],gl:where.gl,added_leads:extra.length};
   }else second_market={country:otherMarkets[0],gl:where.gl,added_leads:0,failure:second.failure};
  }
  if(!market_query_retry&&!second_market&&leads.length<3){
   const second=await ask(term,2).catch(()=>({failure:'FETCH_FAILED'}));
   if(second.payload){
    const extra=parseSerperGoogleOrganic(second.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market,searched:primary})
     .filter(l=>!leads.some(x=>x.url===l.url)).map(l=>({...l,result_page:2}));
    leads=[...leads,...extra].slice(0,10);
    next_page_retry={page:2,added_leads:extra.length,organic_results_received:second.payload.organic.length};
   }else next_page_retry={page:2,added_leads:0,failure:second.failure};
  }
  return {status:leads.length?'FRESH_GOOGLE_ORGANIC_LEADS':'NO_RELEVANT_GOOGLE_ORGANIC_LEADS',market_query_retry,next_page_retry,
   organic_results_received:first.payload.organic.length,
   source:'SERPER_GOOGLE_ORGANIC',leads,rejected_leads:rejected_leads.slice(0,20),
   // Per reason, each result counted once (a second lookup can return the same result again).
   rejected_reasons:[...new Map(rejected_leads.map(x=>[x.url,x.reason])).values()].reduce((n,r)=>(n[r]=(n[r]||0)+1,n),{}),query:term,checked_at:new Date(now).toISOString(),
   second_market,
   ...(wrapped.received?{google_redirect_links:{...wrapped,...(wrapped.unresolved?{unresolved_reasons:wrappedWhy}:{}),...(wrappedSample?{google_page_sample:wrappedSample}:{})}}:{}),
   scope:{country:primary.gl,language:primary.hl,location:market?.location||null,market_states:market?.states||[],
    market_source:market?'US_STATE_IN_QUERY_KEYWORD_OR_URL':locale?.source||'NO_MARKET_SIGNAL_ON_PAGE',
    searched_markets:[primary.gl,...(second_market&&!second_market.failure?[second_market.gl]:[])],
    target_markets_not_searched:otherMarkets.slice(second_market&&!second_market.failure?1:0).map(c=>({country:c,name:countryName(c)})),
    source:'Google organic results through optional configured Serper.dev'},
   warning:'Organic positions describe observed search result placement in a '+lookupLabel(primary,market,locale)+
    (second_market&&!second_market.failure?' and a second lookup in '+countryName(second_market.country):'')+
    ', not the tracked page ranking, a search-volume estimate, or proven traffic.'+
    (otherMarkets.length>(second_market&&!second_market.failure?1:0)?' Not searched (at most two paid calls per run): '+otherMarkets.slice(second_market&&!second_market.failure?1:0).map(countryName).join(', ')+'.':'')+
    ' Serper.dev is optional.'};
 }catch(e){
  return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',reason:String(e?.name==='TimeoutError'?'TIMEOUT':e?.code||'FETCH_FAILED').slice(0,70),
   source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 }
}
// Which of the page's target markets were actually researched, whichever provider answered. Research that covers only
// some markets is reported as partial, never as complete market research.
function marketCoverage({market,locale,result}){
 const targets=market?['US']:locale?.country?[locale.country,...(locale.other_countries||[])]:[];
 if(!targets.length)return {status:'NO_TARGET_MARKET_STATED',markets:[],note:'The page states no market; the lookup used the default (US / English).'};
 const leads=result?.leads||[],provider=result?.source||null;
 const counted=c=>leads.filter(l=>String(l.search_market||l.geographic_scope||'').toUpperCase()===c||(c==='GB'&&String(l.geographic_scope||'').toUpperCase()==='UK')||
  (c==='US'&&market&&l.geographic_scope===market.location)).length;
 // A lookup that answered with nothing usable still researched its market; an unavailable source did not.
 const listed=result?.searched_markets||result?.scope?.searched_markets||(/^NO_RELEVANT/.test(String(result?.status||''))?[targets[0]]:[]);
 const asked=new Set(listed.map(x=>String(x).toUpperCase()==='UK'?'GB':String(x).toUpperCase()));
 const markets=targets.map(c=>({country:c,name:countryName(c),researched:asked.has(c),provider:asked.has(c)?provider:null,usable_results:asked.has(c)?counted(c):0}));
 const done=markets.filter(m=>m.researched).length;
 const lost=result?.google_redirect_links?.unresolved||0;
 return {status:!done?'NOT_RESEARCHED':done<markets.length?'PARTIAL_MARKET_RESEARCH':'ALL_TARGET_MARKETS_RESEARCHED',
  markets,confirmed:market?false:locale?.confirmed===true,priority_confirmed:market?true:locale?.priority_confirmed!==false,
  ...(lost?{google_redirect_links_not_resolved:lost}:{}),
  note:(lost?lost+' result(s) came as Google redirect links that could not be opened; they are missing from this research. ':'')+(done<markets.length?'Researched: '+markets.filter(m=>m.researched).map(m=>m.name).join(', ')+'. Not researched: '+markets.filter(m=>!m.researched).map(m=>m.name).join(', ')+'. This is partial market research.':
   'Every target market was researched once; this is an observation of search results, not a ranking.')};
}
async function discoverGrowthCompetitorsWithFallback(args={}){
 const out=await discoverWithFallback(args);
 return {...out,market_coverage:marketCoverage({market:args.market,locale:args.locale,result:out})};
}
// Free first. A page with several target markets gets one more FREE lookup in its second market, so a free answer is not
// one market only. Paid calls stay as before (Serper only when the free source has nothing, at most two).
async function discoverWithFallback({query,ownUrl,market=null,locale=null,
 fetchFree=discoverGrowthCompetitors,fetchGoogle=optionalGoogleOrganicDiscovery,now=new Date()}={}){
 // Avoid a paid provider call whenever the free public feed returned relevant
 // leads. If it fails and an existing key is configured, use at most one query.
 const publicResult=await Promise.resolve().then(()=>fetchFree({query,ownUrl,market,locale,now}))
  .catch(()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[],query,reason:'FETCH_FAILED'}));
 if(Array.isArray(publicResult.leads)&&publicResult.leads.length){
  const primary=!market&&locale?.country?locale.country:null,second=!market&&primary?(locale.other_countries||[])[0]:null;
  const tag=(rows,c)=>c?rows.map(l=>({...l,search_market:c})):rows;
  let leads=tag(publicResult.leads,primary),searched=primary?[primary]:[],second_market=null;
  if(second){
   const r=await Promise.resolve().then(()=>fetchFree({query,ownUrl,market,locale:{...locale,country:second,other_countries:[]},now})).catch(()=>null);
   const extra=tag((r?.leads||[]).filter(l=>!leads.some(x=>x.url===l.url)),second);
   const mixed=[];for(let i=0;i<Math.max(leads.length,extra.length);i++){if(leads[i])mixed.push(leads[i]);if(extra[i])mixed.push(extra[i])}
   leads=mixed.slice(0,10);if(r&&!/UNAVAILABLE|NOT_SAFE/.test(String(r.status||'')))searched.push(second);
   second_market={country:second,added_leads:extra.length,status:r?.status||'PUBLIC_SEARCH_UNAVAILABLE'};
  }
  return {...publicResult,leads,searched_markets:searched,second_market,provider_attempts:['BING_PUBLIC_RSS'],fallback_used:false};
 }
 if(publicResult.status==='QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH')
  return {...publicResult,provider_attempts:[],fallback_used:false};
 const google=await Promise.resolve().then(()=>fetchGoogle({query,ownUrl,market,locale,now}))
  .catch(()=>({status:'OPTIONAL_PROVIDER_UNAVAILABLE',source:'SERPER_GOOGLE_ORGANIC',leads:[],query}));
 if(Array.isArray(google.leads)&&google.leads.length)
  return {...google,provider_attempts:['BING_PUBLIC_RSS',google.source||'SERPER_GOOGLE_ORGANIC'],
   fallback_used:true,free_discovery_status:publicResult.status};
 return {...publicResult,provider_attempts:google.status==='OPTIONAL_PROVIDER_NOT_CONFIGURED'?['BING_PUBLIC_RSS']:
  ['BING_PUBLIC_RSS',google.source||'SERPER_GOOGLE_ORGANIC'],fallback_used:false,
  optional_google_status:google.status,optional_google_failure_reason:google.reason||null,free_discovery_status:publicResult.status,
  warning:(publicResult.warning||'Free public search may be unavailable.')+
   ' Optional Google organic lookup: '+google.status+'. No competitor ranking or content gap is inferred from a missing response.'};
}
module.exports={discoverGrowthCompetitors,discoverGrowthCompetitorsWithFallback,marketCoverage,unwrapGoogleLinks,
 optionalGoogleOrganicDiscovery,parseSerperGoogleOrganic,parseBingRss,clean};

