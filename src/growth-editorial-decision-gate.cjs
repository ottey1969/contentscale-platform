'use strict';
// Deterministic evidence-based result, with no inferred content gaps from lexical overlap.
// Publication and Case Study modifications are never authorized by this decision.
function decideGrowthEditorialAction({report={},destination={}}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=String(action.query||report.search_discovery?.target_query||report.search?.focus_query||'').trim();
 const protectedUrl=String(report.url||''),target=destination.target_url||destination.own_url||null;
 const comparisons=Array.isArray(destination.comparisons)?destination.comparisons:[];
 const protection=report.growth_decision?.protection||{};
 const protectedQueries=report.growth_decision?.protected_queries||[];
 const facts=[],uncertainties=[],evidence=[];
 const base={focus_query:query,protected_url:protectedUrl,target_url:target,
  case_study_locked:protection.case_study_locked===true,preserve_title_h1:true,
  publish_allowed:false,copy_ready:false,verified_gap:false,
  gsc_optional:true,exact_page_query_metrics_verified:!!action.metrics,
  evidence_count:comparisons.length,facts,uncertainties,evidence};
 if(query)facts.push({code:'TOPIC_SELECTED',value:query,source:action.query?'PAGE_VERIFIED_GSC_OR_TRACKED_TOPIC':'TRACKED_PAGE_TOPIC'});
 const fail=(reason,code)=>({...base,decision:'DATA_BLOCKED',reason,blocker_code:code,
  next_action:'Resolve the named source or intent blocker; do not create text without matching evidence.'});
 if(!query)return fail('No meaningful page topic was selected.','TOPIC_NOT_RESOLVED');
 if(!target||destination.status==='EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE'||destination.status==='OWN_SOURCE_INCOMPLETE')
  return fail('Readable target-page sections were unavailable.','TARGET_HTML_UNAVAILABLE');
 if(destination.own_html_truncated||destination.comparison_scope==='PARTIAL_SOURCE_NO_ABSENCE_CLAIMS')
  return fail('The fetched page or competitor source was truncated.','HTML_TRUNCATED');
 const reliable=comparisons.filter(x=>x.match_status==='POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'&&x.nearest_existing_section&&x.competitor_url);
 for(const c of reliable.slice(0,3)){
  evidence.push({source_url:target,type:'OWN_PAGE',heading:c.nearest_existing_section.heading,excerpt:c.nearest_existing_section.excerpt||''});
  evidence.push({source_url:c.competitor_url,type:'COMPETITOR',heading:c.competitor_heading,excerpt:c.competitor_excerpt||''});
 }
 if(protection.case_study_locked&&protectedQueries.some(x=>x.position<=3&&x.clicks>=10)){
  facts.push({code:'STRONG_PROTECTED_QUERY',source:'PAGE_VERIFIED_GSC',queries:protectedQueries.slice(0,4)});
  uncertainties.push('Other separate growth opportunities may exist; protecting this page is not proof of a perfect article.');
  return {...base,decision:'NO_CHANGE',reason:'Preserve the strong, locked existing page and its verified search baseline.',next_action:'Continue research on other pages without changing this Case Study baseline.'};
 }
 if(!reliable.length){
  uncertainties.push('No two complete, intent-aligned passages can be compared to justify a specific content change.');
  return fail('No reliable paired target-page and competitor passage establishes an editorial change.','PAIRED_EVIDENCE_MISSING');
 }
 // Lexical overlap proves neither completeness nor an absent answer.
 // Keep a factual recommendation without pretending to have verified an edit.
 uncertainties.push('Paired passages have lexical overlap but substantive user-task sufficiency has not been verified.');
 return {...base,decision:'DATA_BLOCKED',blocker_code:'SUBSTANTIVE_GAP_NOT_VERIFIED',
  reason:'Relevant sections were compared, but no supported new fact or reader task has been established.',
  next_action:'Verify one distinct unanswered reader task with sourced supporting material or explicitly decide NO_CHANGE.',
  strongest_comparison:{own_heading:reliable[0].nearest_existing_section.heading,
   competitor_heading:reliable[0].competitor_heading,competitor_url:reliable[0].competitor_url}};
}
module.exports={decideGrowthEditorialAction};
