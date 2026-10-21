'use strict';
// Resolve broad site navigation labels against observed title and H1.
// Do not invent an industry, service or location that the page has not named.
const GENERIC=new Set(['services','service','products','solutions','about','contact','home','index','pricing','offers']);
const clean=value=>String(value||'').replace(/&(?:amp|nbsp|quot);/gi,' ').replace(/\s+/g,' ').trim();
function resolveGrowthPageIntent({keyword='',title='',h1=[],description=''}={}){
 const tracked=clean(keyword),lower=tracked.toLowerCase();
 if(!GENERIC.has(lower))
  return {status:tracked?'TRACKED_QUERY_NEEDS_SERP_VERIFICATION':'NO_TRACKED_QUERY',query:tracked||null,original_keyword:tracked||null,source:tracked?'TRACKER_KEYWORD':'NONE'};
 const primary=[...(Array.isArray(h1)?h1:[]),title].map(clean);
 const candidates=primary.map(x=>x.split(/\s(?:\||—|–)\s|:/)[0]
  .replace(/\b20\d{2}\b/g,' ').replace(/\s+/g,' ').trim());
 const industry=candidates.find(x=>{
  const tokens=x.split(/\s+/).filter(Boolean);
  return tokens.length>=2&&tokens.length<=8&&tokens.some(w=>!GENERIC.has(w.toLowerCase())&&w.length>=4)&&
   (new RegExp('\\b'+lower+'\\b','i')).test(x);
 });
 if(!industry){
  return {status:'AMBIGUOUS_SITE_NAVIGATION_INTENT',query:null,original_keyword:tracked,
   source:'INSUFFICIENT_OBSERVED_MAIN_HEADING',
   warning:'A generic menu label cannot be compared to a global search result without a named service or brand.'};
 }
 return {status:'RESOLVED_FROM_OBSERVED_MAIN_HEADING',query:industry,
  original_keyword:tracked,source:'PAGE_TITLE_OR_H1',
  warning:'Heading-grounded working search phrase, not verified search demand or true SERP intent.'};
}
module.exports={resolveGrowthPageIntent};
