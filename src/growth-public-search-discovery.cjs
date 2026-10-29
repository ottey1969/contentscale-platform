'use strict';
const {navDiffersFromQuery}=require('./growth-intent-signals.cjs');
const {rejectLead,marketRelevance}=require('./growth-serp-quality.cjs');
// Optional, public, low-frequency Bing web RSS discovery. Bing's public RSS
// format is experimental, NOT a Google SERP, ranking or guaranteed service.
// If unavailable, return a visible status; never substitute invented results.
const {fetchPublicGrowthHtml,validateUrl}=require('./growth-public-html-reader.cjs');
const {terms}=require('./growth-one-action-decision.cjs');
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
  const titleTokens=new Set(terms(title)),matched=required.filter(x=>titleTokens.has(x));
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
async function discoverGrowthCompetitors({query,ownUrl,market=null,fetchFeed=fetchPublicGrowthHtml,now=new Date()}={}){
 const term=String(query||'').trim();
 if(!term||term.length>100||!/^[\p{L}\p{N}][\p{L}\p{N}\s&'’.,/-]*$/u.test(term))
  return {status:'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH',query:term,leads:[],checked_at:null,source:'BING_PUBLIC_RSS'};
 let feed;
 try{
  const searchUrl='https://www.bing.com/search?'+new URLSearchParams({q:term,format:'rss'});
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

function parseSerperGoogleOrganic(payload,{query='',ownUrl='',limit=7,rejectedLog=null,market=null}={}){
 const marketStates=market?.states||[];
 const results=Array.isArray(payload?.organic)?payload.organic:[];
 let own='';try{own=new URL(ownUrl).hostname.replace(/^www\./,'').toLowerCase()}catch{}
 const needle=terms(query),seen=new Set(),leads=[];
 for(const item of results){
  if(!item||typeof item.title!=='string'||typeof item.link!=='string')continue;
  let parsed;try{parsed=validateUrl(item.link)}catch{continue}
  const hostname=parsed.hostname.replace(/^www\./,'').toLowerCase();
  if(hostname===own||infrastructure.test(hostname)||seen.has(parsed.href))continue;
  const title=clean(item.title).slice(0,180),snippet=clean(item.snippet||'').slice(0,400);
  const matched=needle.filter(w=>terms(title).includes(w));
  if(needle.length&&matched.length<Math.min(2,needle.length))continue;
  if(wrongProductIntent(title,snippet,query))continue;
  if(/(?:^|\/)(?:privacy|terms|disclaimer|login|signup|checkout|tag|category|search)(?:\/|$)/i.test(parsed.pathname))continue;
  const why=rejectLead({query,lead:{url:parsed.href,title,snippet},ownHost:own,marketStates});
  if(why){(rejectedLog||[]).push({url:parsed.href,title:title.slice(0,100),reason:why});continue}
  seen.add(parsed.href);
  const position=Number(item.position);
  leads.push({url:parsed.href,title,snippet,source:'SERPER_GOOGLE_ORGANIC',
   status:'GOOGLE_SERP_OBSERVATION_NOT_TRACKED_PAGE_POSITION',query,
   serp_position:Number.isInteger(position)&&position>=1&&position<=200?position:null,
   geographic_scope:market?.location||'US',search_language:'en',market_relevance:marketRelevance({title,snippet},marketStates)});
  if(leads.length>=limit)break;
 }
 return leads;
}
// Serper.dev is the only paid Google-organic provider for Growth (product rule). Growth reads ONLY SERPER_API_KEY;
// SERPAPI_KEY is never used as a fallback, even though other tracker code paths still accept it.
async function optionalGoogleOrganicDiscovery({query,ownUrl,market=null,fetchImpl=global.fetch,key=process.env.SERPER_API_KEY,now=new Date()}={}){
 const term=String(query||'').trim(),available=String(key||'').trim();
 if(!term||term.length>100||!/^[\p{L}\p{N}][\p{L}\p{N}\s&'’.,/-]*$/u.test(term))
  return {status:'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 if(!available)return {status:'OPTIONAL_PROVIDER_NOT_CONFIGURED',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 if(typeof fetchImpl!=='function')return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 // Serper.dev accepts POST JSON; never put API credentials into URL or logs.
 const ask=async q=>{
  const response=await fetchImpl('https://google.serper.dev/search',{
   method:'POST',headers:{'X-API-KEY':available,'Content-Type':'application/json'},
   // A local page is researched where it competes: Serper's documented `location` parameter localises the organic results.
   body:JSON.stringify({q,gl:'us',hl:'en',num:10,...(market?.location?{location:market.location}:{})}),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return {failure:'HTTP_'+response.status};
  const payload=await response.json();
  if(payload?.error||!Array.isArray(payload?.organic))return {failure:'ORGANIC_RESULTS_MISSING_OR_PROVIDER_ERROR'};
  return {payload};
 };
 try{
  const first=await ask(term);
  if(first.failure)return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',reason:first.failure,source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
  const rejected_leads=[];
  let leads=parseSerperGoogleOrganic(first.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market});
  // A localised lookup can still be dominated by other-state providers; when fewer than three comparable results survive the
  // market filter, ask once more with the market named in the query. Bounded to one extra call; nothing is invented.
  let market_query_retry=null;
  const place=market?.location?market.location.split(',')[0].trim():'';
  if(place&&leads.length<3&&!term.toLowerCase().includes(place.toLowerCase())){
   const q2=term+' '+place,second=await ask(q2).catch(()=>({failure:'FETCH_FAILED'}));
   if(second.payload){
    const extra=parseSerperGoogleOrganic(second.payload,{query:term,ownUrl,limit:10,rejectedLog:rejected_leads,market})
     .filter(l=>!leads.some(x=>x.url===l.url)).map(l=>({...l,query:q2,market_query:true}));
    leads=[...leads,...extra].slice(0,10);
    market_query_retry={query:q2,added_leads:extra.length};
   }else market_query_retry={query:q2,added_leads:0,failure:second.failure};
  }
  return {status:leads.length?'FRESH_GOOGLE_ORGANIC_LEADS':'NO_RELEVANT_GOOGLE_ORGANIC_LEADS',market_query_retry,
   source:'SERPER_GOOGLE_ORGANIC',leads,rejected_leads:rejected_leads.slice(0,12),query:term,checked_at:new Date(now).toISOString(),
   scope:{country:'us',language:'en',location:market?.location||null,market_states:market?.states||[],source:'Google organic results through optional configured Serper.dev'},
   warning:'Organic positions describe observed search result placement in a US English lookup'+(market?.location?' localised to '+market.location:'')+', not the tracked page ranking, a search-volume estimate, or proven traffic. Serper.dev is optional.'};
 }catch(e){
  return {status:'OPTIONAL_PROVIDER_UNAVAILABLE',reason:String(e?.name==='TimeoutError'?'TIMEOUT':e?.code||'FETCH_FAILED').slice(0,70),
   source:'SERPER_GOOGLE_ORGANIC',leads:[],query:term};
 }
}
async function discoverGrowthCompetitorsWithFallback({query,ownUrl,market=null,
 fetchFree=discoverGrowthCompetitors,fetchGoogle=optionalGoogleOrganicDiscovery,now=new Date()}={}){
 // Avoid a paid provider call whenever the free public feed returned relevant
 // leads. If it fails and an existing key is configured, use at most one query.
 const publicResult=await Promise.resolve().then(()=>fetchFree({query,ownUrl,market,now}))
  .catch(()=>({status:'PUBLIC_SEARCH_UNAVAILABLE',source:'BING_PUBLIC_RSS',leads:[],query,reason:'FETCH_FAILED'}));
 if(Array.isArray(publicResult.leads)&&publicResult.leads.length)
  return {...publicResult,provider_attempts:['BING_PUBLIC_RSS'],fallback_used:false};
 if(publicResult.status==='QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH')
  return {...publicResult,provider_attempts:[],fallback_used:false};
 const google=await Promise.resolve().then(()=>fetchGoogle({query,ownUrl,market,now}))
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
module.exports={discoverGrowthCompetitors,discoverGrowthCompetitorsWithFallback,
 optionalGoogleOrganicDiscovery,parseSerperGoogleOrganic,parseBingRss,clean};

