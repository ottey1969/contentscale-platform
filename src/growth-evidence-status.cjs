'use strict';
// One evidence ladder for every Growth output (API response, editorial decision, work packet, owner package, UI, download).
// Each rung is a separate, observable fact; none implies the next. Derived only from the final decision and the research
// inputs that decision used, so no output can claim more than the decision itself.
const EDIT_DECISIONS=['IMPROVE_EXISTING','NEW_DISTINCT_PAGE'];
function deriveEvidenceStatus({decision={},serpIntent=null,coverage=null}={}){
 const d=decision.decision||'DATA_BLOCKED';
 const hosts=new Set((coverage?.competitors_considered||[]).map(c=>c.host)).size;
 const destinationRead=!!coverage&&Array.isArray(coverage.destination_sections)&&coverage.destination_sections.length>0;
 const status={
  decision:d,
  search_intent_confirmed:serpIntent?.status==='SERP_INTENT_OBSERVED',
  competitor_content_observed:hosts>=2,
  destination_fully_examined:destinationRead&&coverage.destination_truncated!==true,
  // A missing tool page is a missing page type, not a missing reader task.
  missing_task_established:EDIT_DECISIONS.includes(d)&&decision.gap_observed===true&&decision.gap_basis!=='TOOL_SEARCH_AND_NO_TOOL_PAGE_ON_SITE',
  draft_checked:EDIT_DECISIONS.includes(d)&&decision.copy_ready===true&&decision.verified_gap===true,
  // Truth of individual statements and publication are owner actions; the system never sets them.
  factual_claims_confirmed:false,
  publication_approved:false
 };
 status.copy_ready=status.draft_checked;
 status.verified_gap=status.draft_checked;
 status.label=decision.blocker_code==='DESTINATION_IS_PROTECTED_CASE_STUDY'?'CASE_STUDY_PROTECTED_NO_CHANGE_REQUIRED':
  decision.blocker_code==='QUERY_MEANS_SOMETHING_ELSE'?'SEARCH_TERM_HAS_ANOTHER_MEANING_NO_COMPARISON':
  decision.gap_basis==='TOOL_SEARCH_AND_NO_TOOL_PAGE_ON_SITE'?'TOOL_PAGE_MISSING_OWNER_PRODUCT_FACTS_REQUIRED':status.draft_checked?'TASK_GAP_AND_DRAFT_VERIFIED_FOR_REVIEW':status.missing_task_established?'TASK_GAP_OBSERVED_DRAFT_NOT_VERIFIED':
  d==='NO_CHANGE'?'NO_GAP_ALL_SHARED_TASKS_COVERED':d==='DATA_BLOCKED'?'EVIDENCE_INCOMPLETE':'NO_VERIFIED_GAP';
 return status;
}
const LADDER_LABELS=[['search_intent_confirmed','Search intent confirmed from live results'],['competitor_content_observed','Competitor content read (2+ sites)'],
 ['destination_fully_examined','Target page read completely'],['missing_task_established','Missing reader task established'],
 ['draft_checked','Draft checked (task fit, duplication, wording, claims)'],['factual_claims_confirmed','Factual claims confirmed by the owner'],
 ['publication_approved','Publication approved']];
module.exports={deriveEvidenceStatus,LADDER_LABELS};
