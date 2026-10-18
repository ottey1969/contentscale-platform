'use strict';
// Bounded, deterministic editorial proposal. Never assert a content gap from words alone.
const CHECKS={
 inventory:{heading:'Start with a content inventory',paragraph:'Before scaling production, list the useful URLs you already have and the reader question each one answers. Mark overlap and pages that should remain unchanged. This becomes the working content inventory rather than an arbitrary article-count goal.'},
 search_data:{heading:'Use measured search demand',paragraph:'Group existing pages by search intent and compare their actual Google Search Console queries, impressions, clicks and average positions. Record the date range for every comparison. A page with impressions but few clicks may need better intent alignment or ranking before it needs a different snippet.'},
 decisions:{heading:'Decide what to improve before publishing more',paragraph:'For each search question, decide whether to protect, update, consolidate or expand an existing answer. Only plan a new URL when the reader needs a genuinely separate answer. Check for overlapping existing URLs first.'},
 measurement:{heading:'Measure the results',paragraph:'Record the original page and query before editing. After the reviewed change goes live, compare equivalent measurement windows for clicks and impressions; track AI citations separately. Do not treat traffic changes as proof of causation without additional evidence.'},
 worked_example:{heading:'Worked example: prioritize a scaling opportunity',paragraph:'Suppose one article earns many impressions but few clicks and ranks beyond the first page. First verify the query intent and read existing pages that could answer it. If a relevant guide already exists, improve that guide before proposing another URL. Measure clicks and impressions for the selected URL over comparable periods.'}
};
function prepareEvidenceGuidedCopy({target=null,query='',protectedSource='' }={}){
 if(!target||target.suitability!=='TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW')
  return {status:'NO_ELIGIBLE_EXISTING_PAGE',copy_ready:false};
 const evidence=target.body_evidence;
 if(!evidence||evidence.source_truncated||evidence.status!=='PUBLIC_HTML_CONTENT_OBSERVED')
  return {status:'BODY_EVIDENCE_INCOMPLETE',copy_ready:false,
   reason:'Do not draft an alleged gap from missing or truncated HTML.'};
 const absent=Object.keys(CHECKS).filter(k=>evidence.evidence_checks?.[k]===false);
 const present=Object.keys(CHECKS).filter(k=>evidence.evidence_checks?.[k]===true);
 const candidates=absent.slice(0,2).map(k=>({
  code:k,proposed_heading:CHECKS[k].heading,reviewable_paragraph:CHECKS[k].paragraph,
  basis:'TOPIC_NOT_DETECTED_IN_OBSERVED_HTML_NOT_A_VERIFIED_CONTENT_GAP',
  action:'Review the full current article; add or adapt only if a reader-facing practical answer is actually absent.'
 }));
 return {
  status:candidates.length?'REVIEWABLE_DISTINCT_ADDITION_CANDIDATES':'NO_OBVIOUS_MISSING_ELEMENTS',
  query,target_url:target.url,protected_source_url:protectedSource,
  evidence_source:evidence.status,
  already_observed:present,not_detected:absent,
  proposed_additions:candidates,copy_ready:candidates.length>0,
  no_proven_content_gaps:true,requires_editorial_review:true,
  publish_allowed:false,
  preserve_existing_text:true,preserve_title_h1:true,
  verification:'A detector only establishes presence/absence of matching terms; it does not demonstrate that the current article is incomplete. Check original paragraphs for conceptual duplicates before insertion.'
 };
}
module.exports={prepareEvidenceGuidedCopy};
