'use strict';
// Derive an owner-only, reviewable edit from a fact-checked draft and actual
// same-page/competitor quotations. Never claim an automatically verified gap.
const {blocks,queryRoots}=require('./growth-reader-task-coverage.cjs');
const {draftTeachesTask,taskHitsInText}=require('./growth-derived-reader-tasks.cjs');
const {assessDraftClaims,headingMismatch}=require('./growth-draft-claim-guard.cjs');
const {answerCheckFor}=require('./growth-task-meaning.cjs');
const skipSet=query=>new Set(queryRoots(query).all.map(x=>x.slice(0,6)));
const words=t=>String(t||'').toLowerCase().match(/[a-z0-9']+/g)||[];
const ngramSet=(t,n)=>{const w=words(t),out=new Set();for(let i=0;i+n<=w.length;i++)out.add(w.slice(i,i+n).join(' '));return out};
const plainText=html=>blocks(html).map(b=>b.text).join(' ');
const validParagraphs=s=>Array.isArray(s?.paragraphs)?s.paragraphs.filter(p=>typeof p==='string'&&p.trim().length>=80):[];
// Claim review of one drafted section against the ONLY factual source (the destination page text).
function assessSectionClaims(section,{destinationText='',query='',brandLabel=''}={}){
 const paragraphs=[],rewrites=[],violations=[],review=[];
 for(const original of validParagraphs(section)){
  const r=assessDraftClaims({text:original,destinationText,query,brandLabel});
  violations.push(...r.violations);rewrites.push(...r.safe_rewrites);review.push(...(r.claim_review||[]));
  paragraphs.push(r.safe_rewrites.length?r.safe_text:original);
 }
 const ok=violations.length===0;
 // A rejected section yields no usable text at all: nothing of it can leak into a proposal.
 return {ok,paragraphs:ok?paragraphs:[],safe_rewrites:ok?rewrites:[],violations,claim_review:review};
}
// Draft acceptance for the evidence-based path: the text must teach the observed missing task (core concept in the
// heading or opening paragraph plus shared co-concepts), must not repeat the destination, must not reuse competitor
// wording, and every claim must pass the claim guard. Safe softening is applied and logged; anything else rejects.
function checkDraftSection(section,{task,destinationText='',competitorTexts=[],query='',brandLabel='',answerCheck=null}){
 const body=(section.h2+' '+validParagraphs(section).join(' ')).toLowerCase();
 const skip=skipSet(query);
 if(!task.match)return {ok:false,code:'DRAFT_OFF_TASK',concept_hits:0};
 const taught=draftTeachesTask(task.match,body,skip);
 const opening=taskHitsInText(task.match,section.h2+' '+(validParagraphs(section)[0]||''),skip);
 if(!taught.ok||opening.key<1)return {ok:false,code:'DRAFT_OFF_TASK',concept_hits:taught.key_mentions+taught.co_terms_hit,
  reason:'The text does not teach the missing reader task near its start (core concept “'+task.match.key+'” plus related concepts).'};
 const mine=ngramSet(body,5),dest=ngramSet(destinationText,5);
 let shared=0;for(const x of mine)if(dest.has(x))shared++;
 const overlap=mine.size?Math.round(shared/mine.size*100):0;
 if(overlap>=35)return {ok:false,code:'DRAFT_DUPLICATES_DESTINATION',concept_hits:taught.key_mentions,duplicate_overlap_pct:overlap};
 const m8=ngramSet(body,8);
 for(const c of competitorTexts){const theirs=ngramSet(c,8);for(const x of m8)if(theirs.has(x))return {ok:false,code:'DRAFT_REUSES_COMPETITOR_WORDING',concept_hits:taught.key_mentions,duplicate_overlap_pct:overlap}}
 // A task confirmed by the meaning check carries its reader question: the section must answer exactly that question.
 const answer=answerCheckFor(task,answerCheck,section.h2);
 if(answer)return {ok:false,code:answer.code,concept_hits:taught.key_mentions,reason:answer.reason};
 const mismatch=headingMismatch(section.h2,validParagraphs(section).join(' '));
 if(mismatch)return {ok:false,code:'DRAFT_HEADING_DOES_NOT_MATCH_CONTENT',concept_hits:taught.key_mentions,duplicate_overlap_pct:overlap,
  heading_check:{code:mismatch.code,instructions:mismatch.instructions,sentences:mismatch.sentences},reason:mismatch.reason};
 const claims=assessSectionClaims(section,{destinationText,query,brandLabel});
 if(!claims.ok)return {ok:false,code:'DRAFT_UNSUPPORTED_CLAIMS',concept_hits:taught.key_mentions,duplicate_overlap_pct:overlap,
  claim_violations:claims.violations.slice(0,6),reason:'Rejected: '+claims.violations.slice(0,3).map(v=>v.code).join(', ')+'.'};
 return {ok:true,concept_hits:taught.key_mentions+taught.co_terms_hit,duplicate_overlap_pct:overlap,paragraphs:claims.paragraphs,safe_rewrites:claims.safe_rewrites,claim_review:claims.claim_review};
}
function decideFromEvidence({report,completion,base,sources}){
 const common={publish_allowed:false,requires_editor_approval:true,case_study_unchanged:true};
 const sections=(completion.draft?.sections||[]).filter(s=>s?.h2&&validParagraphs(s).length);
 const destinationText=plainText(sources.destinationHtml||'');
 const competitorTexts=(sources.competitorHtml||[]).map(plainText);
 if(base.decision==='IMPROVE_EXISTING'&&base.improvement_plan){
  const plan=base.improvement_plan,tasks=plan.tasks;
  const rejected=[],accepted=[];
  for(const section of sections){
   let best=null;
   // Same candidate rule as the producer: a section labelled with a task outside the plan is not re-matched to another task.
   const labelled=section.task_code?tasks.find(t=>t.code===section.task_code):null;
   for(const task of (section.task_code?(labelled?[labelled]:[]):tasks)){const r=checkDraftSection(section,{task,destinationText,competitorTexts,query:base.focus_query,brandLabel:sources.brandLabel||'',answerCheck:completion.answer_check||null});
    if(r.ok){best={task,r,section};break}rejected.push({heading:section.h2,task:task.code,...r})}
   if(best)accepted.push(best);
  }
  // copy_ready follows the producer's verification (verified_gap on the gate), never a second, independent judgement.
  if(completion.draft&&accepted.length&&base.verified_gap!==true)
   return {...base,...common,copy_ready:false,copy_status:'DRAFT_NOT_VERIFIED_BY_PRODUCER',draft_rejections:rejected.slice(0,6),
    next_action:'The draft did not pass the verified-opportunity checks for this target and query; regenerate or write the missing task manually.'};
  if(!completion.draft||!accepted.length)
   return {...base,...common,copy_ready:false,
    copy_status:!completion.draft?'DRAFT_NOT_AVAILABLE_'+String(completion.status||'UNKNOWN'):'DRAFT_REJECTED_'+String(rejected[0]?.code||'NO_VALID_SECTION'),
    draft_rejections:rejected.slice(0,6),
    next_action:completion.status==='EDITOR_WRITES'?'AI drafts are switched off: write the section for each confirmed reader question yourself, then use the CMS handoff with your own text.':
     !completion.draft?'Complete owner draft generation (provider status: '+String(completion.status||'UNKNOWN')+'), then review.':
     'The generated text did not meet the evidence conditions; regenerate or write the missing task manually.'};
  const first=accepted[0],place=first.task.placement||{};
  const ev=first.task.competitor_evidence[0]||{};
  return {...base,...common,decision:'IMPROVE_EXISTING',decision_scope:'OWNER_REVIEW_DRAFT_ADDRESSES_OBSERVED_TASK_GAP',
   copy_ready:true,copy_status:'REVIEW_READY',target_url:plan.target_url,
   target_section:place.section_heading||null,placement:place,
   draft_heading:first.section.h2,proposed_text:first.r.paragraphs.join('\n\n'),safe_rewrites:accepted.flatMap(a=>a.r.safe_rewrites),
   additional_sections:accepted.slice(1).map(a=>({task:a.task.code,placement:a.task.placement,heading:a.section.h2,text:a.r.paragraphs.join('\n\n')})),
   existing_passage:first.task.destination_evidence?.[0]?.text||null,
   source_comparison:{competitor_url:ev.url||null,competitor_heading:ev.heading||null,competitor_passage:ev.excerpt||null},
   draft_validation:accepted.map(a=>({task:a.task.code,heading:a.section.h2,concept_hits:a.r.concept_hits,duplicate_overlap_pct:a.r.duplicate_overlap_pct,competitor_wording_reused:false,claims_checked:true,safe_rewrites:a.r.safe_rewrites.length})),
   facts:[...(base.facts||[]),{code:'OWNER_DRAFT_VALIDATED_AGAINST_TASK',source:'OWNER_COMPLETION_ROUTE'}],
   uncertainties:[...(base.uncertainties||[]),'Fact-check every sentence; the validator checks task fit, duplication and wording reuse, not truth.'],
   next_action:'Review the proposed text at the stated placement; approve before any CMS handoff. Nothing is published.'};
 }
 // A tool/product page is written by the owner from real product facts; there is no generated draft to review.
 if(base.decision==='NEW_DISTINCT_PAGE'&&base.new_page_plan?.page_type==='PRODUCT_OR_TOOL_PAGE')
  return {...base,...common,copy_ready:false,copy_status:'OWNER_PRODUCT_FACTS_REQUIRED',next_action:base.next_action};
 if(base.decision==='NEW_DISTINCT_PAGE'&&base.new_page_plan){
  const usable=sections.filter(s=>validParagraphs(s).length);
  if(completion.draft&&usable.length>=2&&base.verified_gap!==true)
   return {...base,...common,copy_ready:false,copy_status:'DRAFT_NOT_VERIFIED_BY_PRODUCER',next_action:'The new-page draft did not pass the verified-opportunity checks; regenerate.'};
  if(!completion.draft||usable.length<2)
   return {...base,...common,copy_ready:false,copy_status:!completion.draft?'DRAFT_NOT_AVAILABLE_'+String(completion.status||'UNKNOWN'):'DRAFT_TOO_THIN_FOR_NEW_PAGE',
    next_action:'Complete owner draft generation; a new page needs at least two substantive sections.'};
  const reuse=usable.some(s=>{const m8=ngramSet(validParagraphs(s).join(' '),8);return competitorTexts.some(c=>{const t=ngramSet(c,8);for(const x of m8)if(t.has(x))return true;return false})});
  if(reuse)return {...base,...common,copy_ready:false,copy_status:'DRAFT_REJECTED_DRAFT_REUSES_COMPETITOR_WORDING',next_action:'Regenerate in original wording.'};
  const reviewed=usable.map(sec=>({sec,...assessSectionClaims(sec,{destinationText,query:base.focus_query,brandLabel:sources.brandLabel||''})}));
  const bad=reviewed.flatMap(r=>r.violations);
  if(bad.length)return {...base,...common,copy_ready:false,copy_status:'DRAFT_REJECTED_DRAFT_UNSUPPORTED_CLAIMS',draft_rejections:bad.slice(0,6),next_action:'Regenerate without unsupported claims or add the missing facts to the page first.'};
  return {...base,...common,copy_ready:true,copy_status:'REVIEW_READY',
   new_page_draft:{working_query:base.new_page_plan.working_query,sections:reviewed.map(r=>({h2:r.sec.h2,paragraphs:r.paragraphs})),safe_rewrites:reviewed.flatMap(r=>r.safe_rewrites),
    seo_title:completion.draft?.seo_title||null,meta_description:completion.draft?.meta_description||null,
    facts_source_url:base.new_page_plan.facts_source_url},
   proposed_text:reviewed.map(r=>'## '+r.sec.h2+'\n\n'+r.paragraphs.join('\n\n')).join('\n\n'),
   next_action:'Review the new-page draft, the intent evidence and the internal-link plan; approve before any CMS handoff.'};
 }
 // NO_CHANGE and DATA_BLOCKED are final: no copy is forced.
 return {...base,...common,copy_ready:false,copy_status:base.decision==='NO_CHANGE'?'NOT_REQUIRED_NO_CHANGE':'NOT_AVAILABLE_DATA_BLOCKED'};
}
function decideOwnerGrowthEdit({report={},completion={},sources={}}={}){
 const base=report.editorial_decision_gate||{decision:'DATA_BLOCKED',facts:[],uncertainties:[],evidence:[]};
 if(report.reader_task_coverage)return decideFromEvidence({report,completion,base,sources});
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
module.exports={decideOwnerGrowthEdit,checkDraftSection,assessSectionClaims,validParagraphs,plainText,ngramSet};
