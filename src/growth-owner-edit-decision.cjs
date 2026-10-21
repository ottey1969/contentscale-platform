'use strict';
// Derive an owner-only, reviewable edit from a fact-checked draft and actual
// same-page/competitor quotations. Never claim an automatically verified gap.
function decideOwnerGrowthEdit({report={},completion={}}={}){
 const base=report.editorial_decision_gate||{decision:'DATA_BLOCKED',facts:[],uncertainties:[],evidence:[]};
 const rows=report.destination_section_comparison?.comparisons||[];
 const pair=rows.find(x=>x.match_status==='POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'&&
  x.nearest_existing_section?.heading&&String(x.nearest_existing_section?.excerpt||'').length>=50&&
  x.competitor_url&&String(x.competitor_excerpt||'').length>=75);
 const section=completion.draft?.sections?.find(x=>x?.h2&&Array.isArray(x.paragraphs)&&
  x.paragraphs.some(p=>String(p||'').trim().length>=80));
 const hasSafeTarget=completion.target_url&&completion.target_url===report.destination_section_comparison?.target_url;
 if(!completion.draft||!section||!pair||!hasSafeTarget||report.case_study_locked===true)
  return {...base,decision_scope:'RESEARCH_ONLY_NO_CONFIRMED_EDIT',copy_ready:false,publish_allowed:false};
 const reviewText=section.paragraphs.filter(p=>typeof p==='string'&&p.trim().length>=80).join('\n\n');
 const pageExcerpt=String(pair.nearest_existing_section.excerpt).trim();
 if(!reviewText||!pageExcerpt)
  return {...base,decision_scope:'RESEARCH_ONLY_NO_CONFIRMED_EDIT',copy_ready:false,publish_allowed:false};
 return {...base,decision:'IMPROVE_EXISTING',decision_scope:'OWNER_REVIEW_CANDIDATE_NOT_VERIFIED_GAP',
  target_url:completion.target_url,target_section:pair.nearest_existing_section.heading,
  draft_heading:section.h2,proposed_text:reviewText,existing_passage:pageExcerpt,
  source_comparison:{competitor_url:pair.competitor_url,
   competitor_heading:pair.competitor_heading,competitor_passage:pair.competitor_excerpt},
  evidence:[...(base.evidence||[]),
   {type:'OWN_PAGE',source_url:completion.target_url,heading:pair.nearest_existing_section.heading,excerpt:pageExcerpt},
   {type:'COMPETITOR',source_url:pair.competitor_url,heading:pair.competitor_heading,excerpt:pair.competitor_excerpt}],
  verified_gap:false,copy_ready:true,publish_allowed:false,requires_editor_approval:true,
  facts:[...(base.facts||[]),{code:'OWNER_DRAFT_SOURCE_VALIDATED',source:'EXISTING_OWNER_DRAFT_HANDLER'}],
  uncertainties:[...(base.uncertainties||[]),'Editor must confirm the proposed paragraph adds a distinct useful answer; lexical similarity alone does not prove a gap.'],
  next_action:'Review proposed text against existing passage and linked competitor quotation before any CMS handoff.'};
}
module.exports={decideOwnerGrowthEdit};
