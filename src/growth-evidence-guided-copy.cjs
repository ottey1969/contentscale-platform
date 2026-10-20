'use strict';
// Industry-agnostic, evidence-first editorial review. This code never
// generates article text or claims a gap solely because terms are absent.
function prepareEvidenceGuidedCopy({target=null,query='',protectedSource=''}={}){
 if(!target||target.suitability!=='TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW')
  return {status:'NO_ELIGIBLE_EXISTING_PAGE',copy_ready:false};
 const evidence=target.body_evidence;
 if(!evidence||evidence.source_truncated||evidence.status!=='PUBLIC_HTML_CONTENT_OBSERVED')
  return {status:'BODY_EVIDENCE_INCOMPLETE',copy_ready:false,
   reason:'Readable, complete target HTML is required to compare the existing answer.'};
 const passages=(evidence.evidence_passages?.query_answer||[])
  .filter(p=>typeof p==='string'&&p.trim().length>=45).slice(0,3);
 const observed=passages.length>0;
 return {
  status:observed?'EXISTING_QUERY_ANSWER_OBSERVED':'EXACT_QUERY_PASSAGE_NOT_ESTABLISHED',
  query,target_url:target.url,protected_source_url:protectedSource,
  evidence_source:evidence.status,
  already_observed:observed?['query_answer']:[],
  not_detected:observed?[]:['query_answer'],
  // No canned additions from a content-scaling-only regex checklist.
  proposed_additions:[],held_possible_duplicates:[],
  copy_ready:false,proposal_ready:false,research_hypothesis_available:false,
  one_next_action:{
   code:observed?'COMPARE_OBSERVED_ANSWER_WITH_SEARCH_INTENT':'VERIFY_EXISTING_PAGE_INTENT',
   target_url:target.url,focus_query:query,
   instruction:observed?
    'Use the observed answer passages to check the live SERP reader task and competitor passages. Keep adequate answers; prepare a specific edit only when a distinct unsupported or incomplete reader need is demonstrated.':
    'No query-matching passage was found in the retrieved HTML. Inspect the full page intent and other site URLs; do not infer absence or publish a new page.'
  },
  source_passages:{query_answer:passages},
  observed_paragraphs:evidence.observed_paragraphs||[],
  no_proven_content_gaps:true,requires_editorial_review:true,
  publish_allowed:false,preserve_existing_text:true,preserve_title_h1:true,
  verification:'Source quotations are observations only, not proof of missing content or higher ranking.'
 };
}
module.exports={prepareEvidenceGuidedCopy};
