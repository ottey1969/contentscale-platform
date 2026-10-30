'use strict';
// Reading the ranking pages of one search, shared by the existing-page research and the new-page research (one system).
// Moved unchanged from tracker-growth-automatic-routes.cjs: candidates from the search (same-market first, one page per
// site first, discussion sites last) and topic-matching historical SERP pages; batches of three until three readable
// articles exist; HTTP 202 retried once; a site that refuses access is respected, never bypassed; a page with no static
// text may be rendered in the restricted browser (at most three per run). readMore() reads one more batch (no new search).
const {fetchPublicGrowthHtml,RESEARCH_FETCH}=require('./growth-public-html-reader.cjs');
const {queryFit}=require('./growth-one-action-decision.cjs');
const {assessGrowthCompetitorContent}=require('./growth-competitor-quality-gate.cjs');
const {renderPublicGrowthPage}=require('./growth-safe-browser-renderer.cjs');

async function readRankingPages({query,discovery,historical=[],fetchLive=fetchPublicGrowthHtml,renderOwn=renderPublicGrowthPage,retryDelayMs=1500}={}){
  // Discussion listings remain in SERP evidence but should not displace readable
  // long-form articles in the limited content-comparison budget.
  const editorialHost=url=>{try{const host=new URL(url).hostname.toLowerCase();
   return !/(^|\.)(?:reddit\.com|quora\.com)$/.test(host)}
   catch{return false}};
  // Same-market pages are read first; general sources that name no place follow (stable within each group).
  const marketRank=x=>x.market_relevance==='SAME_MARKET'?0:1;
  const fresh=(Array.isArray(discovery.leads)?discovery.leads:[])
   .filter(x=>x.url&&editorialHost(x.url)).map((x,i)=>({x,i})).sort((a,b)=>marketRank(a.x)-marketRank(b.x)||a.i-b.i).map(o=>o.x).slice(0,10);
  const candidates=[...fresh.map(x=>({...x,search_source:x.source==='SERPAPI_GOOGLE_ORGANIC'?'SERPAPI_GOOGLE_ORGANIC':x.source==='SERPER_GOOGLE_ORGANIC'?'SERPER_GOOGLE_ORGANIC':'BING_PUBLIC_RSS'})),
   ...historical.filter(x=>editorialHost(x.url)&&!fresh.some(y=>y.url===x.url)&&queryFit(x.serp_title||'',{title:query,h1:[],h2:[]}).fit)
    .map(x=>({...x,search_source:'HISTORICAL_SERP_TOPIC_MATCH'}))].slice(0,10);
  const fetchCompetitorOnce=async lead=>{
   try{const live=await fetchLive(lead.url,RESEARCH_FETCH);
    return {url:lead.url,live,quality:assessGrowthCompetitorContent({html:live.html,query:query,truncated:live.truncated}),
     search_source:lead.search_source,search_query:query}}
   catch(e){return {url:lead.url,status:'LIVE_COMPARISON_UNAVAILABLE',reason:String(e?.code||'FETCH_FAILED').slice(0,70),search_source:lead.search_source}}
  };
  // HTTP 202 means 'accepted, not ready yet' (seen on a real competitor). Retry exactly once, then report it as unavailable.
  const fetchCompetitor=async lead=>{
   const first=await fetchCompetitorOnce(lead);
   if(first.reason!=='HTTP_202')return first;
   await new Promise(done=>setTimeout(done,Math.max(0,retryDelayMs)));
   const second=await fetchCompetitorOnce(lead);
   return {...second,retried_after_http_202:true};
  };
  // A site that refuses automated access (401/403/406/429) is respected, not bypassed: the next candidate is tried.
  const explain=code=>/^HTTP_(401|403|406|429)$/.test(code)?'BLOCKED_BY_SITE_RESPECTED':/^HTTP_(404|410)$/.test(code)?'PAGE_NOT_FOUND':/^HTTP_5/.test(code)?'SITE_ERROR':
   /TIMEOUT/.test(code)?'TIMEOUT':/^HTTP_202$/.test(code)?'NOT_READY_AFTER_ONE_RETRY':'FETCH_FAILED';
  const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
  // Candidates are tried in batches of three, one page per site first, until three readable articles exist or the list is exhausted.
  const candidatePool=[];const seenHosts=new Set();
  for(const c of candidates){const h=hostOf(c.url);if(seenHosts.has(h))continue;seenHosts.add(h);candidatePool.push(c)}
  for(const c of candidates)if(!candidatePool.includes(c))candidatePool.push(c);
  let attempted=[];const fetchLog=[];
  // A page that answered (HTTP 200) but holds no static text is rendered in the restricted browser, at most three per run and
  // only while fewer than three readable articles exist. A page that REFUSED access (403 etc.) is never rendered: that would bypass the block.
  let renderBudget=3;const renderNotes={};
  const canRender=fetchLive===fetchPublicGrowthHtml||renderOwn!==renderPublicGrowthPage;
  const eligible=items=>items.filter(x=>x.live&&x.quality?.eligible).slice(0,3);
  let comparisons=[];let cursor=0;
  while(cursor<candidatePool.length&&comparisons.length<3){
   const batch=candidatePool.slice(cursor,cursor+3);cursor+=3;
   const results=await Promise.all(batch.map(fetchCompetitor));
   for(let i=0;i<results.length;i++){const x=results[i];
    const have=comparisons.length+results.filter(y=>y.live&&y.quality?.eligible).length;
    if(canRender&&renderBudget>0&&have<3&&x.live&&!x.quality?.eligible&&['JS_RENDERED_PAGE_NO_STATIC_TEXT','NO_PARAGRAPH_TEXT'].includes(x.quality?.reason_code)){
     renderBudget--;const rendered=await Promise.resolve().then(()=>renderOwn(x.url)).catch(()=>({status:'RENDER_UNAVAILABLE'}));
     renderNotes[x.url]=rendered?.status||'RENDER_UNAVAILABLE';
     if(rendered?.live?.html){const q=assessGrowthCompetitorContent({html:rendered.live.html,query:query,truncated:rendered.live.truncated});
      if(q.eligible)results[i]={...x,live:rendered.live,quality:q,rendered_fallback:true}}
    }
   }
   results.forEach((x,i)=>logFetch(x,batch[i]));
   attempted=attempted.concat(results);comparisons=eligible(attempted);
  }
  function logFetch(x,lead){
    fetchLog.push({url:x.url,host:hostOf(x.url),serp_position:lead.serp_position??null,source:lead.search_source,
     outcome:x.live?(x.quality?.eligible?'READABLE':'NOT_READABLE'):'FETCH_FAILED',
     code:x.live?(x.quality?.reason_code||null):(x.reason||'FETCH_FAILED'),
     explanation:x.live?(x.quality?.eligible?null:x.quality?.reason_code):explain(x.reason||''),
     partial_capture:x.live?.truncated===true,retried_after_http_202:x.retried_after_http_202===true,
     rendered_fallback:x.rendered_fallback===true,render_status:renderNotes[x.url]||null,
     readable_words:x.quality?.readable_words??null});
  }
  const fetchSummaryNow=()=>{const c=k=>fetchLog.filter(x=>x.outcome===k).length;
   const blocked=fetchLog.filter(x=>x.explanation==='BLOCKED_BY_SITE_RESPECTED').length,timeouts=fetchLog.filter(x=>x.explanation==='TIMEOUT').length;
   return fetchLog.length+' tried: '+c('READABLE')+' readable, '+blocked+' blocked by the site (respected), '+timeouts+' timed out, '+c('NOT_READABLE')+' fetched but not readable'+
    (fetchLog.filter(x=>x.outcome==='NOT_READABLE').length?' ('+[...new Set(fetchLog.filter(x=>x.outcome==='NOT_READABLE').map(x=>x.code))].join(', ')+')':'')+
    (fetchLog.some(x=>x.rendered_fallback)?'; '+fetchLog.filter(x=>x.rendered_fallback).length+' read after rendering in the restricted browser':'')+
    '; '+Math.max(0,candidatePool.length-cursor)+' further candidate(s) untried'};
  let fetchSummary=fetchSummaryNow();
 const readMore=async()=>{
  const batch=candidatePool.slice(cursor,cursor+3);cursor+=3;
  const results=await Promise.all(batch.map(fetchCompetitor));
  results.forEach((x,i)=>logFetch(x,batch[i]));
  attempted=attempted.concat(results);
  return batch.length;
 };
 // Read these candidates (already in the pool) now, e.g. the results of the page's own type.
 const readThese=async leads=>{const results=await Promise.all(leads.map(fetchCompetitor));results.forEach((x,i)=>logFetch(x,leads[i]));attempted=attempted.concat(results);return results};
 return {readThese,get comparisons(){return comparisons},get attempted(){return attempted},fetchLog,get fetchSummary(){return fetchSummary},
  summary:fetchSummaryNow,hasMore:()=>cursor<candidatePool.length,readMore,fetchCompetitor,logFetch,candidatePool};
}
module.exports={readRankingPages};
