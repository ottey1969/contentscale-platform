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
 if(/\bnear me\b|\bnearby\b|\bin\s+[a-z]{3,}(?:\s+[a-z]{3,})?\s*$/.test(label) &&
    !(/\bnear me\b|\bnearby\b/.test([headings.title,...(headings.h1||[]),...(headings.h2||[])].join(' ').toLowerCase())) &&
    !needle.every(w=>present.has(w)))return {fit:false,reason:'LOCATION_INTENT_NOT_SUPPORTED_BY_PAGE'};
 const hard=['review','reviews','coupon','pricing','price','login','download','software','alternatives','alternative','jobs','careers'];
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
// Single entry for "which query, which URL". Delegates to growth-query-selection (evidence-aware, industry-neutral) so
// the decision no longer depends on a query being printed in this page's own headline.
function chooseGrowthNextAction({page={},queries=[],headings={},siteGraph={},siteInventory=null,now=new Date()}={}){
 const {selectGrowthQuery}=require('./growth-query-selection.cjs');
 const inventory=Array.isArray(siteInventory)?siteInventory:(siteGraph.candidates||[]).map(x=>({url:x.url,keyword:x.tracked_keyword,id:x.page_id??null}));
 const sel=selectGrowthQuery({page,queries,headings,inventory,now});
 const candidateUrls=(siteGraph.candidates||[]).map(x=>x.url).filter(x=>typeof x==='string').slice(0,3);
 if(sel.destination?.url&&sel.destination.url!==page.url&&!candidateUrls.includes(sel.destination.url))candidateUrls.unshift(sel.destination.url);
 const locked=page.case_study_active===true,chosen=sel.chosen||null;
 let next;
 if(chosen){
  const far=chosen.position>35;
  next={code:'VERIFY_INTENT_AND_EXISTING_DESTINATION',title:'Investigate clicks for "'+chosen.query+'"',
   query:chosen.query,metrics:{impressions:chosen.impressions,clicks:chosen.clicks,ctr_pct:chosen.ctr_pct,average_position:chosen.position,imported_at:chosen.imported_at},
   reason:chosen.impressions+' exact-page impressions and '+chosen.clicks+' clicks; average position '+chosen.position.toFixed(1)+'. '+
    (far?'The average position is far beyond the first page, so ranking relative to live competitors is a larger obstacle than the snippet.':'The ranking may be a larger obstacle than the search snippet.'),
   instruction:'Compare the live search intent with the destination URL and existing same-site pages. If the existing page fits, propose one targeted improvement on that URL for editorial review. Do not create another page by default.',
   destination:sel.destination,source_page_signal:sel.surfacing_signal||null,query_source:sel.source,
   related_pages_to_check:candidateUrls,
   stop_before:'No title/H1 rewrite, new spoke, consolidation, publication or Case Study baseline change without separate evidence and owner approval.'};
 }else{
  next={code:'REVIEW_PAGE_INTENT',title:'Check this page against the live search intent',query:sel.query||null,metrics:null,
   reason:sel.query?'No verified high-impression, low-click query qualified; using '+sel.source.toLowerCase().replace(/_/g,' ')+'.':sel.reason||'No sufficiently recent exact-page query is available.',
   instruction:'Review the existing page and live SERP; keep working without GSC when unavailable. Do not invent a click gain.',
   destination:sel.destination||null,query_source:sel.source,query_status:sel.status,
   related_pages_to_check:candidateUrls,
   stop_before:'No automatic content or Case Study changes.'};
 }
 return {status:locked?'RESEARCH_ONLY_CASE_STUDY_LOCKED':'EDITOR_REVIEW_REQUIRED',
  confidence:'QUERY_DATA_VERIFIED_INTENT_HEURISTIC',protection:{case_study_locked:locked,preserve_existing_top_rankings:(sel.protected||[]).length>0,
   publication_allowed:false,automatic_page_changes:false},
  primary_next_action:next,protected_queries:(sel.protected||[]).slice(0,5),
  excluded_queries:(sel.excluded||[]).slice(0,12),brand_queries:sel.brand_queries||[],other_reviewable_queries:(sel.other_candidates||[]).slice(0,3),
  selection:{status:sel.status,source:sel.source,destination:sel.destination||null},
  guidance:'One action first. GSC import timestamp is not a measurement period; compare equivalent dated ranges after any approved publication.'};
}
module.exports={chooseGrowthNextAction,topicAligned,queryFit,terms};
