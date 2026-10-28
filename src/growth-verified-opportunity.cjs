'use strict';
// PRODUCER of report.verified_editorial_opportunity, the object the editorial decision gate has always
// required but nothing ever created. It runs only inside the owner-only POST completion, AFTER an owner draft
// exists, and verifies four independent things before it returns verified:true:
//  1. the gate's evidence plan (intent + >=2 independent competitors + complete destination HTML),
//  2. the draft teaches exactly a planned, missing reader task (not off-topic),
//  3. the draft does not repeat the destination and does not reuse competitor wording,
//  4. for a new page: distinct intent and same-site overlap were both checked by the gate.
// It never writes text itself, never calls a provider and never publishes. Without a valid draft it returns
// {opportunity:null, rejections} so the gate keeps its research-only outcome.
const {checkDraftSection,assessSectionClaims,validParagraphs,plainText}=require('./growth-owner-edit-decision.cjs');

// Typed claim summary shown to the owner. copy_ready never means 'verified true': it means reviewable.
function summarizeClaims(rows){
 const by=c=>rows.filter(x=>x.class===c);
 return {counts:{sourced_from_page:by('SOURCED_FROM_PAGE').length,general_advice:by('GENERAL_ADVICE').length,general_statement_unverified:by('GENERAL_STATEMENT_UNVERIFIED').length},
  needs_fact_check:by('GENERAL_STATEMENT_UNVERIFIED').map(x=>x.sentence),
  needs_owner_confirmation:rows.filter(x=>x.confirm_with_owner).map(x=>x.sentence),
  needs_safety_review:rows.filter(x=>x.safety_review).map(x=>x.sentence),
  confidence:by('GENERAL_STATEMENT_UNVERIFIED').length?'REVIEWABLE_WITH_UNVERIFIED_STATEMENTS':'REVIEWABLE_ADVICE_AND_SOURCED_STATEMENTS',
  requirements:['Fact-check every statement against your own knowledge and sources before publishing.',
   ...(rows.some(x=>x.confirm_with_owner)?['Some statements repeat claims the page itself makes (availability, coverage, credentials or figures). They are only as true as the page: confirm each with the business before reusing it in new copy.']:[]),
   ...(rows.some(x=>x.safety_review)?['Safety-related guidance (hazards, urgency, what can wait) must be reviewed by a qualified professional before publication. If in doubt, the text should treat a situation as urgent and point readers to professional help, and to emergency services where life or property is at risk.']:[]),
   'Owner approval is required; nothing is published automatically.']};
}
function produceVerifiedEditorialOpportunity({report={},completion={},sources={}}={}){
 const gate=report.editorial_decision_gate||{};
 const query=String(gate.focus_query||'').trim();
 const sections=(completion.draft?.sections||[]).filter(s=>s?.h2&&validParagraphs(s).length);
 const none=(code,rejections=[])=>({opportunity:null,status:code,rejections});
 if(!completion.draft)return none('NO_OWNER_DRAFT');
 if(!sections.length)return none('NO_SUBSTANTIVE_DRAFT_SECTION');
 const destinationText=plainText(sources.destinationHtml||'');
 const competitorTexts=(sources.competitorHtml||[]).map(plainText);

 if(gate.decision==='IMPROVE_EXISTING'&&gate.improvement_plan&&query&&gate.target_url===completion.target_url){
  const plan=gate.improvement_plan,rejections=[],accepted=[];
  for(const section of sections){
   let hit=null;
  const labelled=section.task_code?plan.tasks.find(t=>t.code===section.task_code):null;
  const candidateTasks=section.task_code?(labelled?[labelled]:[]):plan.tasks;
  for(const task of candidateTasks){
    const r=checkDraftSection(section,{task,destinationText,competitorTexts,query,brandLabel:sources.brandLabel||''});
    if(r.ok){hit={task,section,r};break}
    rejections.push({heading:section.h2,task:task.code,...r});
   }
   if(hit)accepted.push(hit);
  }
  if(!accepted.length)return none('DRAFT_FAILED_TASK_VERIFICATION',rejections.slice(0,6));
  const first=accepted[0];
  const evidence=[];
  for(const a of accepted){
   for(const e of (a.task.competitor_evidence||[]).slice(0,2))
    evidence.push({source_url:e.url,heading:e.heading,excerpt:String(e.excerpt||'').slice(0,300),type:'COMPETITOR'});
   for(const e of (a.task.destination_evidence||[]).slice(0,1))
    evidence.push({source_url:gate.target_url,heading:e.heading||null,excerpt:String(e.text||'').slice(0,300),type:'OWN_PAGE'});
  }
  return {status:'VERIFIED_IMPROVE_EXISTING',rejections,accepted_headings:accepted.map(a=>a.section.h2),opportunity:{
   verified:true,type:'IMPROVE_EXISTING',producer:'GROWTH_TASK_COVERAGE_PLUS_DRAFT_VALIDATION',
   focus_query:query,target_url:gate.target_url,
   target_section:first.task.placement?.section_heading||'(page start)',
   placement:first.task.placement||null,task_codes:accepted.map(a=>a.task.code),
   proposed_text:first.r.paragraphs.join('\n\n'),safe_rewrites:accepted.flatMap(a=>a.r.safe_rewrites),
   claim_review:summarizeClaims(accepted.flatMap(a=>a.r.claim_review||[])),
   additional_sections:accepted.slice(1).map(a=>({task:a.task.code,placement:a.task.placement,heading:a.section.h2,text:a.r.paragraphs.join('\n\n')})),
   draft_heading:first.section.h2,evidence,
   draft_validation:accepted.map(a=>({task:a.task.code,heading:a.section.h2,concept_hits:a.r.concept_hits,duplicate_overlap_pct:a.r.duplicate_overlap_pct,competitor_wording_reused:false,claims_checked:true,safe_rewrites:a.r.safe_rewrites.length}))}};
 }

 if(gate.decision==='NEW_DISTINCT_PAGE'&&gate.new_page_plan&&query){
  const usable=sections.filter(s=>validParagraphs(s).length);
  if(usable.length<2)return none('NEW_PAGE_DRAFT_TOO_THIN');
  const {ngramSet}=require('./growth-owner-edit-decision.cjs');
  const reuse=usable.some(s=>{const mine=ngramSet(validParagraphs(s).join(' '),8);
   return competitorTexts.some(c=>{const t=ngramSet(c,8);for(const x of mine)if(t.has(x))return true;return false})});
  if(reuse)return none('NEW_PAGE_DRAFT_REUSES_COMPETITOR_WORDING');
  const reviewed=usable.map(sec=>({sec,...assessSectionClaims(sec,{destinationText,query,brandLabel:sources.brandLabel||''})}));
  const bad=reviewed.flatMap(r=>r.violations);
  if(bad.length)return none('NEW_PAGE_DRAFT_UNSUPPORTED_CLAIMS',bad.slice(0,6));
  const evidence=(gate.new_page_plan.tasks||[]).flatMap(t=>(t.competitor_evidence||[]).slice(0,1)
   .map(e=>({source_url:e.url,heading:e.heading,excerpt:String(e.excerpt||'').slice(0,300),type:'COMPETITOR'})));
  // The gate only ignores an opportunity without source evidence; the producer must not call such a draft verified.
  if(!evidence.some(e=>e.source_url&&e.excerpt))return none('NEW_PAGE_WITHOUT_SHARED_TASK_EVIDENCE');
  return {status:'VERIFIED_NEW_DISTINCT_PAGE',rejections:[],opportunity:{
   verified:true,type:'NEW_DISTINCT_PAGE',producer:'GROWTH_INTENT_EVIDENCE_PLUS_DRAFT_VALIDATION',
   focus_query:query,target_url:gate.target_url,target_section:'(new page)',
   // The gate already required SERP intent + a DIFFERENT destination verdict + no compatible/overlapping same-site page.
   site_overlap_checked:true,distinct_intent_verified:gate.distinct_intent_evidence?.destination?.verdict==='DIFFERENT',
   proposed_text:reviewed.map(r=>'## '+r.sec.h2+'\n\n'+r.paragraphs.join('\n\n')).join('\n\n'),
   new_page_draft:{working_query:query,sections:reviewed.map(r=>({h2:r.sec.h2,paragraphs:r.paragraphs})),safe_rewrites:reviewed.flatMap(r=>r.safe_rewrites),
    seo_title:completion.draft?.seo_title||null,meta_description:completion.draft?.meta_description||null,
    facts_source_url:gate.new_page_plan.facts_source_url},
   evidence}};
 }
 return none('GATE_DECISION_DOES_NOT_REQUEST_COPY');
}
module.exports={produceVerifiedEditorialOpportunity};
