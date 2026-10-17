'use strict';
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
const product=/\b(detector|detection|plagiarism|brandwell|contentatscale|undetectable|ai writer|ai writing tool|review|reviews|login|coupon|discount|jobs|careers)\b/i;
const infrastructure=/^(?:www\.)?(?:bing\.com|microsoft\.com|google\.com|youtube\.com|facebook\.com|instagram\.com|pinterest\.com|linkedin\.com)$/i;
function parseBingRss(xml,{query='',ownUrl='',limit=7}={}){
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
  if(product.test(title+' '+snippet)&&!product.test(query))continue;
  if(/(?:^|\/)(?:privacy|terms|disclaimer|login|signup|checkout|tag|category|search)(?:\/|$)/i.test(url.pathname))continue;
  seen.add(url.href);
  rows.push({url:url.href,title:title.slice(0,180),snippet,source:'BING_PUBLIC_RSS',status:'FRESH_BING_RSS_LEAD_NOT_GOOGLE_RANKING',query});
  if(rows.length>=limit)break;
 }
 return rows;
}
async function discoverGrowthCompetitors({query,ownUrl,fetchFeed=fetchPublicGrowthHtml,now=new Date()}={}){
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
 const items=parseBingRss(body,{query:term,ownUrl,limit:7});
 return {status:feed.truncated?(items.length?'PARTIAL_PUBLIC_SEARCH_LEADS':'PUBLIC_SEARCH_PARTIAL'):
   items.length?'FRESH_PUBLIC_SEARCH_LEADS':'NO_RELEVANT_PUBLIC_SEARCH_LEADS',
  query:term,leads:items,checked_at:feed?.retrieved_at||new Date(now).toISOString(),source:'BING_PUBLIC_RSS',
  warning:'Bing RSS is an optional public discovery source; results and order do NOT establish current Google rankings. Page comparison is based on separately retrieved HTML.'};
}
module.exports={discoverGrowthCompetitors,parseBingRss,clean};
