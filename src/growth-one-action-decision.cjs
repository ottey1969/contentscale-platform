'use strict';
// Read-only, deterministic decision layer for canonical Tracker Growth research.
// Import dates do not establish an underlying GSC measurement window.
const STOP=new Set('the and for from this that with your about when what where some more will have into which been also does how can are you was were of to on at in is it a an as by or near me vs versus een het van voor met naar wat hoe waar deze zijn een'.split(' '));
function terms(value){
 return [...new Set(String(value||'').toLowerCase().normalize('NFKD')
  .replace(/[^a-z0-9\s]+/g,' ').split(/\s+/).filter(Boolean)
  .map(w=>w==='scaling'?'scale':w==='scaled'?'scale':w==='scales'?'scale':w)
  .filter(w=>w.length>2&&!STOP.has(w)))];
}
function safeMetric(row){
 const impressions=Number(row.impressions),clicks=Number(row.clicks),position=Number(row.position);
 if(!Number.isFinite(impressions)||impressions<0||!Number.isFinite(clicks)||clicks<0||clicks>impressions||!Number.isFinite(position)||position<=0)return null;
 return {impressions,clicks,position,ctr_pct:impressions?Math.round(clicks/impressions*10000)/100:0};
}
function queryFit(query,headings){
 const label=String(query||'').toLowerCase(),needle=terms(label);
 const headline=terms([headings.title,...(headings.h1||[]),...(headings.h2||[])].join(' '));
 const present=new Set(headline),matched=needle.filter(w=>present.has(w));
 if(/\bnear me\b|\bnearby\b|\bin\s+(los angeles|new york|london|amsterdam)\b/.test(label) &&
    !(/\bnear me\b|\bnearby\b/.test([headings.title,...(headings.h1||[]),...(headings.h2||[])].join(' ').toLowerCase())) &&
    !needle.every(w=>present.has(w)))return {fit:false,reason:'LOCATION_INTENT_NOT_SUPPORTED_BY_PAGE'};
 const hard=['detector','detect','plagiarism','review','reviews','accuracy','coupon','pricing','price','login','download','software','alternatives','alternative','jobs','careers'];
 const absent=needle.filter(w=>hard.includes(w)&&!present.has(w));
 if(absent.length)return {fit:false,reason:'DIFFERENT_SEARCH_INTENT',unmatched:absent};
 if(!needle.length||matched.length<Math.min(2,needle.length)||matched.length/needle.length<0.67)
  return {fit:false,reason:'TOPIC_NOT_ESTABLISHED_ON_PAGE',unmatched:needle.filter(w=>!present.has(w))};
 return {fit:true,reason:'HEADING_TOPIC_MATCH_ONLY_SERP_STILL_UNVERIFIED',matched};
}
function topicAligned(heading,headings){
 const tokens=terms(heading),headline=new Set(terms([headings.title,...(headings.h1||[]),...(headings.h2||[])].join(' ')));
 // A competitor heading can be a review topic only when it shares meaningful
 // subject vocabulary. A difference alone never proves a missing topic.
 return tokens.length>=2&&tokens.filter(w=>headline.has(w)).length>=2;
}
function chooseGrowthNextAction({page={},queries=[],headings={},siteGraph={},now=new Date()}={}){
 const nowMs=new Date(now).getTime();
 const seen=new Set(),supported=[],excluded=[],preserve=[];
 for(const q of Array.isArray(queries)?queries:[]){
  if(!q||typeof q.query!=='string')continue;
  const name=q.query.trim(),key=name.toLowerCase();
  if(!name||seen.has(key))continue;seen.add(key);
  const metric=safeMetric(q);
  const imported=Date.parse(q.imported_at||'');
  if(!metric||!Number.isFinite(imported)||imported>nowMs||nowMs-imported>75*86400000){
   excluded.push({query:name,reason:'MISSING_OR_STALE_QUERY_EVIDENCE'});continue;
  }
  const fit=queryFit(name,headings);
  if(!fit.fit){excluded.push({query:name,reason:fit.reason});continue}
  const entry={query:name,...metric,imported_at:q.imported_at,fit:'HEADING_HEURISTIC_NOT_LIVE_SERP_PROOF'};
  supported.push(entry);
  if(metric.position<=3&&metric.clicks>=10&&metric.impressions>=100)preserve.push(entry);
 }
 // Low clicks at an average position outside the top 10 usually requires
 // ranking / page-intent work, not a snippet-only CTR promise.
 const underserved=supported.filter(x=>x.impressions>=150&&x.position>=4&&x.position<=35&&x.ctr_pct<=3)
  .sort((a,b)=>b.impressions-a.impressions||a.position-b.position);
 const chosen=underserved[0]||null,protectedBaseline=preserve.length>0;
 const candidateUrls=(siteGraph.candidates||[]).map(x=>x.url).filter(x=>typeof x==='string').slice(0,3);
 const locked=page.case_study_active===true;
 let next;
 if(chosen){
  next={code:'VERIFY_INTENT_AND_EXISTING_DESTINATION',title:'Investigate clicks for "'+chosen.query+'"',
   query:chosen.query,metrics:{impressions:chosen.impressions,clicks:chosen.clicks,ctr_pct:chosen.ctr_pct,average_position:chosen.position,imported_at:chosen.imported_at},
   reason:chosen.impressions+' exact-page impressions and '+chosen.clicks+' clicks; average position '+chosen.position.toFixed(1)+'. The ranking may be a larger obstacle than the search snippet.',
   instruction:'Compare the live search intent with this URL and existing same-site pages. If the existing page fits, propose one targeted improvement on that URL for editorial review. Do not create another page by default.',
   related_pages_to_check:candidateUrls,
   stop_before:'No title/H1 rewrite, new spoke, consolidation, publication or Case Study baseline change without separate evidence and owner approval.'};
 }else{
  next={code:'REVIEW_PAGE_INTENT',title:'Check this page against the live search intent',query:String(page.keyword||headings.h1?.[0]||headings.title||'').trim().slice(0,160)||null,metrics:null,
   reason:supported.length?'No supported high-impression, low-click ranking opportunity meets the threshold.':'No sufficiently recent, on-page-aligned exact-page query is available.',
   instruction:'Review the existing page and live SERP; keep working without GSC when unavailable. Do not invent a click gain.',
   related_pages_to_check:candidateUrls,
   stop_before:'No automatic content or Case Study changes.'};
 }
 return {status:locked?'RESEARCH_ONLY_CASE_STUDY_LOCKED':'EDITOR_REVIEW_REQUIRED',
  confidence:'QUERY_DATA_VERIFIED_INTENT_HEURISTIC',protection:{case_study_locked:locked,preserve_existing_top_rankings:protectedBaseline,
   publication_allowed:false,automatic_page_changes:false},
  primary_next_action:next,protected_queries:preserve.slice(0,5),
  excluded_queries:excluded.slice(0,12),other_reviewable_queries:underserved.slice(1,4),
  guidance:'One action first. GSC import timestamp is not a measurement period; compare equivalent dated ranges after any approved publication.'};
}
module.exports={chooseGrowthNextAction,topicAligned,queryFit,terms};
