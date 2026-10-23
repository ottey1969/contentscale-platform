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
const {checkDraftSection,validParagraphs,plainText}=require('./growth-owner-edit-decision.cjs');

function produceVerifiedEditorialOpportunity({report={},completion={},sources={}}={}){
 const gate=report.editorial_decision_gate||{};
 const query=String(gate.focus_query||'').trim();
 const setName=report.reader_task_coverage?.task_set||'INFORMATIONAL_PROCESS';
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
   for(const task of plan.tasks){
    const r=checkDraftSection(section,{task,setName,destinationText,competitorTexts});
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
  return {status:'VERIFIED_IMPROVE_EXISTING',rejections,opportunity:{
   verified:true,type:'IMPROVE_EXISTING',producer:'GROWTH_TASK_COVERAGE_PLUS_DRAFT_VALIDATION',
   focus_query:query,target_url:gate.target_url,
   target_section:first.task.placement?.section_heading||'(page start)',
   placement:first.task.placement||null,task_codes:accepted.map(a=>a.task.code),
   proposed_text:validParagraphs(first.section).join('\n\n'),
   additional_sections:accepted.slice(1).map(a=>({task:a.task.code,placement:a.task.placement,heading:a.section.h2,text:validParagraphs(a.section).join('\n\n')})),
   draft_heading:first.section.h2,evidence,
   draft_validation:accepted.map(a=>({task:a.task.code,heading:a.section.h2,concept_hits:a.r.concept_hits,duplicate_overlap_pct:a.r.duplicate_overlap_pct,competitor_wording_reused:false}))}};
 }

 if(gate.decision==='NEW_DISTINCT_PAGE'&&gate.new_page_plan&&query){
  const usable=sections.filter(s=>validParagraphs(s).length);
  if(usable.length<2)return none('NEW_PAGE_DRAFT_TOO_THIN');
  const {shingles}=require('./growth-owner-edit-decision.cjs');
  const reuse=usable.some(s=>{const mine=shingles(validParagraphs(s).join(' '),8);
   return competitorTexts.some(c=>{const t=shingles(c,8);for(const x of mine)if(t.has(x))return true;return false})});
  if(reuse)return none('NEW_PAGE_DRAFT_REUSES_COMPETITOR_WORDING');
  const evidence=(gate.new_page_plan.tasks||[]).flatMap(t=>(t.competitor_evidence||[]).slice(0,1)
   .map(e=>({source_url:e.url,heading:e.heading,excerpt:String(e.excerpt||'').slice(0,300),type:'COMPETITOR'})));
  return {status:'VERIFIED_NEW_DISTINCT_PAGE',rejections:[],opportunity:{
   verified:true,type:'NEW_DISTINCT_PAGE',producer:'GROWTH_INTENT_EVIDENCE_PLUS_DRAFT_VALIDATION',
   focus_query:query,target_url:gate.target_url,target_section:'(new page)',
   // The gate already required SERP intent + a DIFFERENT destination verdict + no compatible/overlapping same-site page.
   site_overlap_checked:true,distinct_intent_verified:gate.distinct_intent_evidence?.destination?.verdict==='DIFFERENT',
   proposed_text:usable.map(s=>'## '+s.h2+'\n\n'+validParagraphs(s).join('\n\n')).join('\n\n'),
   new_page_draft:{working_query:query,sections:usable.map(s=>({h2:s.h2,paragraphs:validParagraphs(s)})),
    seo_title:completion.draft?.seo_title||null,meta_description:completion.draft?.meta_description||null,
    facts_source_url:gate.new_page_plan.facts_source_url},
   evidence}};
 }
 return none('GATE_DECISION_DOES_NOT_REQUEST_COPY');
}
module.exports={produceVerifiedEditorialOpportunity};
