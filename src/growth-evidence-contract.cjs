'use strict';
// Converts already-researched Search Spy / AI Spy observations into a page-specific,
// reviewable contract. Explicit provenance is required; no content generation or scans.
function growthEvidenceContract({url,pageQueries=[],searchSpy,aiSpy,originalHtml='',templateMarkers=[]}={}){
 const problems=[],gaps=[];
 const exact=pageQueries.filter(q=>q&&q.evidence_scope==='page_verified'&&q.page_url===url&&String(q.query||'').trim());
 if(!exact.length)problems.push('NO_EXACT_PAGE_GSC');
 function take(kind,items){
  if(!Array.isArray(items)){problems.push(kind+'_NOT_PROVIDED');return}
  for(const item of items){
   if(!item||item.target_url!==url)continue;
   const source=String(item.source_url||'');
   const observed=String(item.observed||'').trim();
   const improvement=String(item.improvement||'').trim();
   const location=String(item.where_in_draft||'').trim();
   if(!/^https:\/\//.test(source)||!observed||!improvement||!location){
    problems.push(kind+'_INCOMPLETE_EVIDENCE');
    continue;
   }
   gaps.push({kind,competitor_url:source,observed,improvement,where_in_draft:location,
     retrieved_at:item.retrieved_at||null,source_ref:item.source_ref||null});
  }
 }
 take('SEARCH_SPY',searchSpy);take('AI_SPY',aiSpy);
 if(!gaps.some(x=>x.kind==='SEARCH_SPY'))problems.push('NO_PAGE_SCOPED_SEARCH_SPY_GAP');
 // AI visibility varies: an empty AI Spy result is not fabricated into an AI citation.
 if(!gaps.some(x=>x.kind==='AI_SPY'))problems.push('AI_SPY_EVIDENCE_UNAVAILABLE');
 if(!originalHtml.trim())problems.push('ORIGINAL_HTML_REQUIRED');
 if(!Array.isArray(templateMarkers)||!templateMarkers.length)problems.push('TEMPLATE_REQUIRED');
 return {url,pageQueries:exact,competitiveGaps:gaps,searchSpy:gaps.filter(x=>x.kind==='SEARCH_SPY'),
   aiSpy:gaps.filter(x=>x.kind==='AI_SPY'),originalHtml,templateMarkers,
   evidence_status:problems.length?'RESEARCH_INCOMPLETE':'EVIDENCE_READY',
   problems:[...new Set(problems)]};
}
module.exports={growthEvidenceContract};
