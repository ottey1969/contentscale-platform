'use strict';
function terms(v){
 const stop=new Set(['the','and','for','from','this','that','with','your','about','best','services','service','page','pages','home','near','in','are','how','what','you','why','a','an','of','to','is','on','at','of','van','het','een','voor','met','de','en','of','op','bij','naar','zijn','als','hoe','wat']);
 return [...new Set(String(v||'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(t=>t.length>=3&&!stop.has(t)))];
}
function classifyGrowthIntent(query=''){
 const q=String(query||'').toLowerCase();
 const signals={
  question:/\b(how|what|why|when|guide|tutorial|meaning|definition|tips|diy|can i|should i)\b|wat is|hoe werkt|waarom/.test(q),
  evaluate:/\b(best|review|compare|comparison|vs|versus|alternative|pros and cons)\b|vergelijken|ervaringen|beste/.test(q),
  transaction:/\b(buy|book|order|quote|price|cost|pricing|estimate|appointment|hire|apply)\b|kosten|prijs|offerte|aanvragen|boeken/.test(q),
  urgent:/\b(emergency|urgent|same day|24 hour|immediate)\b|spoed|nood/.test(q),
  local:/\b(near me|nearby|local)\b|in de buurt|dichtbij/.test(q)
 };
 const intent=signals.urgent?'URGENT_ACTION':signals.transaction?'TRANSACTIONAL_OR_COST':
  signals.evaluate?'COMMERCIAL_COMPARISON':signals.question?'INFORMATIONAL':
  signals.local?'LOCAL_SERVICE':'INTENT_UNCONFIRMED';
 return {intent,signals,status:'HEURISTIC_ONLY_VERIFY_LIVE_SERP',
  suggested_page_action:intent==='INFORMATIONAL'?'Answer the question directly, cite accurate sources, then offer a genuinely relevant next step':
   intent==='COMMERCIAL_COMPARISON'?'Explain real options, limitations and verified differentiators without invented reviews':
   intent==='TRANSACTIONAL_OR_COST'?'Give transparent scope and verified cost factors; confirm the offer before adding a conversion step':
   intent==='URGENT_ACTION'?'Verify actual availability, response terms and contact delivery before presenting urgent claims':
   intent==='LOCAL_SERVICE'?'Confirm service area and local evidence before claiming proximity or availability':
   'Compare real SERP intent before changing the original page'};
}
function suggestInternalGrowthLinks({pageUrl='',focusQuery='',currentHtml='',sitePages=[]}={}){
 let origin,canonical;
 try{canonical=new URL(pageUrl);origin=canonical.origin}catch{return {status:'INVALID_CANONICAL',candidates:[],intent_overlap_risks:[]}}
 const base=terms(focusQuery),profile=new Set(base),currentLinks=new Set();
 for(const m of String(currentHtml||'').slice(0,120000).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
  try{currentLinks.add(new URL(m[1],canonical).pathname.replace(/\/+$/,'')||'/')}catch{}
 }
 const accepted=[],overlaps=[];
 for(const raw of Array.isArray(sitePages)?sitePages.slice(0,500):[]){
  if(!raw||typeof raw.url!=='string')continue;
  let other;try{other=new URL(raw.url)}catch{continue}
  if(other.origin!==origin||other.href===canonical.href||!/https?:/.test(other.protocol))continue;
  const route=other.pathname.replace(/\/+$/,'')||'/';
  if(/(?:^|\/)(privacy|terms|disclaimer|cookie|imprint|legal|feed|sitemap|wp-json|robots)(?:\/|$)/i.test(route))continue;
  const kw=terms(raw.keyword||''),pathTokens=terms(other.pathname.replace(/[-_/]+/g,' '));
  const target=[...new Set([...kw,...pathTokens])];
  if(!target.length)continue;
  const common=target.filter(x=>profile.has(x));
  const overlap=base.length?common.length/base.length:0;
  if(base.length>=2&&kw.length>=2&&common.length>=2&&
     common.length/Math.max(base.length,kw.length)>=0.65)
   overlaps.push({url:other.href,keyword:raw.keyword||null,evidence:'TRACKER_KEYWORD_OVERLAP_HEURISTIC',verified_cannibalization:false});
  if(common.length<Math.min(2,base.length)||overlap<0.4||currentLinks.has(route))continue;
  const candidate={url:other.href,tracked_keyword:raw.keyword||null,
   overlapping_terms:common.slice(0,8),evidence:'CANONICAL_TRACKER_SITE_INVENTORY',
   status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE',
   action:'Confirm destination is useful and live; if so, link naturally from an appropriate relevant paragraph on the current page',
   exists_in_observed_page:false};
  accepted.push({value:common.length+overlap,detail:candidate});
 }
 accepted.sort((a,b)=>b.value-a.value);
 return {status:'SITE_INVENTORY_OBSERVED_NOT_LINK_VALIDATED',
  inspected_site_pages:Math.min(500,sitePages.length),
  candidates:accepted.slice(0,4).map(x=>x.detail),
  intent_overlap_risks:overlaps.slice(0,8),
  caution:'Related URLs are grounded in the same client Tracker inventory; topical overlap is not proven cannibalization or a verified live link.'};
}
module.exports={terms,classifyGrowthIntent,suggestInternalGrowthLinks};
