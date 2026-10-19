'use strict';
// Explicit single-action editorial triage from already-observed, read-only evidence.
// A lexical comparison is NOT proof of a missing answer; do not write or publish.
function decideGrowthEditorialAction({report={},destination={}}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=String(action.query||'').trim();
 const protectedUrl=String(report.url||'');
 const target=destination.target_url||destination.own_url||null;
 const comparisons=Array.isArray(destination.comparisons)?destination.comparisons:[];
 const checks=report.growth_decision?.protection||{};
 const base={focus_query:query,protected_url:protectedUrl,target_url:target,
  case_study_locked:checks.case_study_locked===true,
  preserve_title_h1:true,publish_allowed:false,copy_ready:false,verified_gap:false,
  evidence_count:comparisons.length};
 if(!query||!action.metrics)return {...base,decision:'NEEDS_EVIDENCE',reason:'No exact-page query metrics selected.',next_action:'Obtain verified query data or retain research-only status.'};
 if(!target||destination.status==='EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE'||destination.status==='OWN_SOURCE_INCOMPLETE')
  return {...base,decision:'NEEDS_EVIDENCE',reason:'Relevant existing destination was not fetched as readable HTML.',next_action:'Verify an existing same-domain destination before drafting.'};
 const reliable=comparisons.filter(x=>x.match_status==='POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'&&x.nearest_existing_section&&x.competitor_url);
 if(reliable.length)return {...base,decision:'REVIEW_EXISTING',reason:'A related answer exists on the selected destination. Word overlap does not establish an improvement.',next_action:'Review the identified existing section and the competitor answer before claiming a missing reader task.',
  strongest_comparison:{own_heading:reliable[0].nearest_existing_section.heading,competitor_heading:reliable[0].competitor_heading,competitor_url:reliable[0].competitor_url}};
 if(comparisons.length)return {...base,decision:'VERIFY_DISTINCT_INTENT',reason:'Competitor sections were observed, but none reliably matches an existing answer. This does not prove an absent topic.',next_action:'Verify whether the query belongs on this existing page or requires another destination; do not draft speculative copy.'};
 return {...base,decision:'NEEDS_EVIDENCE',reason:'No comparable fully observed section establishes a specific editorial action.',next_action:'Retrieve readable sections from an intent-matched competitor and existing destination.'};
}
module.exports={decideGrowthEditorialAction};
