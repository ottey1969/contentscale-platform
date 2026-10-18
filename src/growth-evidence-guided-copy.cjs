'use strict';
// Bounded, deterministic editorial proposal. Never assert a content gap from words alone.
const CHECKS={
 inventory:{heading:'Start with a content inventory',paragraph:'Before scaling production, list the useful URLs you already have and the reader question each one answers. Mark overlap and pages that should remain unchanged. This becomes the working content inventory rather than an arbitrary article-count goal.'},
 search_data:{heading:'Use measured search demand',paragraph:'Group existing pages by search intent and compare their actual Google Search Console queries, impressions, clicks and average positions. Record the date range for every comparison. A page with impressions but few clicks may need better intent alignment or ranking before it needs a different snippet.'},
 decisions:{heading:'Decide what to improve before publishing more',paragraph:'For each search question, decide whether to protect, update, consolidate or expand an existing answer. Only plan a new URL when the reader needs a genuinely separate answer. Check for overlapping existing URLs first.'},
 measurement:{heading:'Measure the results',paragraph:'Record the original page and query before editing. After the reviewed change goes live, compare equivalent measurement windows for clicks and impressions; track AI citations separately. Do not treat traffic changes as proof of causation without additional evidence.'},
 worked_example:{heading:'Worked example: prioritize a scaling opportunity',paragraph:'Suppose one article earns many impressions but few clicks and ranks beyond the first page. First verify the query intent and read existing pages that could answer it. If a relevant guide already exists, improve that guide before proposing another URL. Measure clicks and impressions for the selected URL over comparable periods.'}
};
// Conservative phrase-level similarity from *observed* passages, not semantic proof.
function tokens(s){
 const stop=new Set(['the','and','for','with','from','that','this','then','your','you','are','into','they','their','have','will','what','when','which','before','after','more','only','should','each','page','pages','content','scale','scaling']);
 return [...new Set(String(s||'').toLowerCase().match(/[a-z]{3,}/g)||[])].filter(w=>!stop.has(w));
}
function relatedPassages(proposal,source){
 const pt=tokens(proposal);
 return (source||[]).map(text=>{
  const st=tokens(text),matches=pt.filter(t=>st.includes(t));
  return {text:String(text).slice(0,460),shared_terms:matches.slice(0,15),token_overlap:pt.length?Math.round(100*matches.length/pt.length):0};
 }).sort((a,b)=>b.token_overlap-a.token_overlap).slice(0,2);
}
function prepareEvidenceGuidedCopy({target=null,query='',protectedSource='' }={}){
 if(!target||target.suitability!=='TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW')
  return {status:'NO_ELIGIBLE_EXISTING_PAGE',copy_ready:false};
 const evidence=target.body_evidence;
 if(!evidence||evidence.source_truncated||evidence.status!=='PUBLIC_HTML_CONTENT_OBSERVED')
  return {status:'BODY_EVIDENCE_INCOMPLETE',copy_ready:false,
   reason:'Do not draft an alleged gap from missing or truncated HTML.'};
 const absent=Object.keys(CHECKS).filter(k=>evidence.evidence_checks?.[k]===false);
 const present=Object.keys(CHECKS).filter(k=>evidence.evidence_checks?.[k]===true);
 const candidates=absent.map(k=>{
  const matches=relatedPassages(CHECKS[k].paragraph,(evidence.evidence_passages?.[k]||[]).concat(evidence.observed_paragraphs||[]));
  const strongest=matches[0]?.token_overlap||0;
  return {code:k,proposed_heading:CHECKS[k].heading,reviewable_paragraph:CHECKS[k].paragraph,
   basis:'TOPIC_NOT_DETECTED_IN_OBSERVED_HTML_NOT_A_VERIFIED_CONTENT_GAP',
   similarity_review:{method:'BOUNDED_LEXICAL_OVERLAP_NOT_SEMANTIC_PROOF',nearest_existing_passages:matches,highest_overlap_pct:strongest},
   status:strongest>=35?'HOLD_POSSIBLE_DUPLICATE':'EDITORIAL_REVIEW_REQUIRED',
   action:strongest>=35?'Compare the matching existing passages first; do not insert duplicate copy.':'Verify the full current article actually lacks this reader task before inserting.'
  };
 }).sort((a,b)=>a.similarity_review.highest_overlap_pct-b.similarity_review.highest_overlap_pct);
 const held=candidates.filter(x=>x.status==='HOLD_POSSIBLE_DUPLICATE');
 const actionable=candidates.filter(x=>x.status==='EDITORIAL_REVIEW_REQUIRED').slice(0,1);
 return {
  status:actionable.length?'ONE_EDITORIAL_CANDIDATE_REQUIRES_REVIEW':held.length?'NO_ADDITION_POSSIBLE_DUPLICATE':'NO_OBVIOUS_MISSING_ELEMENTS',
  query,target_url:target.url,protected_source_url:protectedSource,
  evidence_source:evidence.status,
  already_observed:present,not_detected:absent,
  proposed_additions:actionable,held_possible_duplicates:held,copy_ready:false,proposal_ready:actionable.length>0,
  one_next_action:actionable.length?{code:'REVIEW_ONE_POSSIBLE_GAP',target_url:target.url,focus_query:query,topic:actionable[0].proposed_heading,instruction:'Compare the displayed nearest source paragraphs, and insert only a genuinely missing helpful answer.'}:{code:'VERIFY_NO_CHANGE_OR_MORE_EVIDENCE',target_url:target.url,focus_query:query,instruction:'Existing passages may already cover the topics; verify before proposing more copy.'},
  source_passages:evidence.evidence_passages||{},observed_paragraphs:evidence.observed_paragraphs||[],
  no_proven_content_gaps:true,requires_editorial_review:true,
  publish_allowed:false,
  preserve_existing_text:true,preserve_title_h1:true,
  verification:'A detector only establishes presence/absence of matching terms; it does not demonstrate that the current article is incomplete. Check original paragraphs for conceptual duplicates before insertion.'
 };
}
module.exports={prepareEvidenceGuidedCopy};
