'use strict';
// Derive an owner-only, reviewable edit from a fact-checked draft and actual
// same-page/competitor quotations. Never claim an automatically verified gap.
const {TASK_SETS,blocks}=require('./growth-reader-task-coverage.cjs');
const words=t=>String(t||'').toLowerCase().match(/[a-z0-9']+/g)||[];
const shingles=(t,n)=>{const w=words(t),out=new Set();for(let i=0;i+n<=w.length;i++)out.add(w.slice(i,i+n).join(' '));return out};
const plainText=html=>blocks(html).map(b=>b.text).join(' ');
const validParagraphs=s=>Array.isArray(s?.paragraphs)?s.paragraphs.filter(p=>typeof p==='string'&&p.trim().length>=80):[];
// Draft acceptance for the evidence-based path: the text must teach the observed missing task,
// must not repeat what the destination already says, and must not reuse competitor wording.
function checkDraftSection(section,{task,setName,destinationText='',competitorTexts=[]}){
 const body=(section.h2+' '+validParagraphs(section).join(' ')).toLowerCase();
 const def=TASK_SETS[setName]?.[task.code];
 const hits=def&&def.anchor.test(body)?def.terms.filter(re=>re.test(body)).length:0;
 if(hits<2)return {ok:false,code:'DRAFT_OFF_TASK',concept_hits:hits};
 const mine=shingles(body,5),dest=shingles(destinationText,5);
 let shared=0;for(const x of mine)if(dest.has(x))shared++;
 const overlap=mine.size?Math.round(shared/mine.size*100):0;
 if(overlap>=35)return {ok:false,code:'DRAFT_DUPLICATES_DESTINATION',concept_hits:hits,duplicate_overlap_pct:overlap};
 const m8=shingles(body,8);
 for(const c of competitorTexts){const theirs=shingles(c,8);for(const x of m8)if(theirs.has(x))return {ok:false,code:'DRAFT_REUSES_COMPETITOR_WORDING',concept_hits:hits,duplicate_overlap_pct:overlap}}
 return {ok:true,concept_hits:hits,duplicate_overlap_pct:overlap};
}
function decideFromEvidence({report,completion,base,sources}){
 const common={publish_allowed:false,requires_editor_approval:true,case_study_unchanged:true};
 const setName=report.reader_task_coverage?.task_set||'INFORMATIONAL_PROCESS';
 const sections=(completion.draft?.sections||[]).filter(s=>s?.h2&&validParagraphs(s).length);
 const destinationText=plainText(sources.destinationHtml||'');
 const competitorTexts=(sources.competitorHtml||[]).map(plainText);
 if(base.decision==='IMPROVE_EXISTING'&&base.improvement_plan){
  const plan=base.improvement_plan,tasks=plan.tasks;
  const rejected=[],accepted=[];
  for(const section of sections){
   let best=null;
   for(const task of tasks){const r=checkDraftSection(section,{task,setName,destinationText,competitorTexts});
    if(r.ok){best={task,r,section};break}rejected.push({heading:section.h2,task:task.code,...r})}
   if(best)accepted.push(best);
  }
  if(!completion.draft||!accepted.length)
   return {...base,...common,copy_ready:false,
    copy_status:!completion.draft?'DRAFT_NOT_AVAILABLE_'+String(completion.status||'UNKNOWN'):'DRAFT_REJECTED_'+String(rejected[0]?.code||'NO_VALID_SECTION'),
    draft_rejections:rejected.slice(0,6),
    next_action:!completion.draft?'Complete owner draft generation (provider status: '+String(completion.status||'UNKNOWN')+'), then review.':
     'The generated text did not meet the evidence conditions; regenerate or write the missing task manually.'};
  const first=accepted[0],place=first.task.placement||{};
  const ev=first.task.competitor_evidence[0]||{};
  return {...base,...common,decision:'IMPROVE_EXISTING',decision_scope:'OWNER_REVIEW_DRAFT_ADDRESSES_OBSERVED_TASK_GAP',
   copy_ready:true,copy_status:'REVIEW_READY',target_url:plan.target_url,
   target_section:place.section_heading||null,placement:place,
   draft_heading:first.section.h2,proposed_text:validParagraphs(first.section).join('\n\n'),
   additional_sections:accepted.slice(1).map(a=>({task:a.task.code,placement:a.task.placement,heading:a.section.h2,text:validParagraphs(a.section).join('\n\n')})),
   existing_passage:first.task.destination_evidence?.[0]?.text||null,
   source_comparison:{competitor_url:ev.url||null,competitor_heading:ev.heading||null,competitor_passage:ev.excerpt||null},
   draft_validation:accepted.map(a=>({task:a.task.code,heading:a.section.h2,concept_hits:a.r.concept_hits,duplicate_overlap_pct:a.r.duplicate_overlap_pct,competitor_wording_reused:false})),
   facts:[...(base.facts||[]),{code:'OWNER_DRAFT_VALIDATED_AGAINST_TASK',source:'OWNER_COMPLETION_ROUTE'}],
   uncertainties:[...(base.uncertainties||[]),'Fact-check every sentence; the validator checks task fit, duplication and wording reuse, not truth.'],
   next_action:'Review the proposed text at the stated placement; approve before any CMS handoff. Nothing is published.'};
 }
 if(base.decision==='NEW_DISTINCT_PAGE'&&base.new_page_plan){
  const usable=sections.filter(s=>validParagraphs(s).length);
  if(!completion.draft||usable.length<2)
   return {...base,...common,copy_ready:false,copy_status:!completion.draft?'DRAFT_NOT_AVAILABLE_'+String(completion.status||'UNKNOWN'):'DRAFT_TOO_THIN_FOR_NEW_PAGE',
    next_action:'Complete owner draft generation; a new page needs at least two substantive sections.'};
  const reuse=usable.some(s=>{const m8=shingles(validParagraphs(s).join(' '),8);return competitorTexts.some(c=>{const t=shingles(c,8);for(const x of m8)if(t.has(x))return true;return false})});
  if(reuse)return {...base,...common,copy_ready:false,copy_status:'DRAFT_REJECTED_DRAFT_REUSES_COMPETITOR_WORDING',next_action:'Regenerate in original wording.'};
  return {...base,...common,copy_ready:true,copy_status:'REVIEW_READY',
   new_page_draft:{working_query:base.new_page_plan.working_query,sections:usable.map(s=>({h2:s.h2,paragraphs:validParagraphs(s)})),
    seo_title:completion.draft?.seo_title||null,meta_description:completion.draft?.meta_description||null,
    facts_source_url:base.new_page_plan.facts_source_url},
   proposed_text:usable.map(s=>'## '+s.h2+'\n\n'+validParagraphs(s).join('\n\n')).join('\n\n'),
   next_action:'Review the new-page draft, the intent evidence and the internal-link plan; approve before any CMS handoff.'};
 }
 // NO_CHANGE and NEEDS_EVIDENCE are final: no copy is forced.
 return {...base,...common,copy_ready:false,copy_status:base.decision==='NO_CHANGE'?'NOT_REQUIRED_NO_CHANGE':'NOT_AVAILABLE_NEEDS_EVIDENCE'};
}
function decideOwnerGrowthEdit({report={},completion={},sources={}}={}){
 const base=report.editorial_decision_gate||{decision:'NEEDS_EVIDENCE',facts:[],uncertainties:[],evidence:[]};
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
module.exports={decideOwnerGrowthEdit,checkDraftSection,validParagraphs,plainText,shingles};
