'use strict';
// Writing ONLY for the differences the owner selected from the gap list. The writer gets one section per selected item
// (its title, a confirmed reader question when there is one, the competitor sections as context, the placement), one
// repair attempt, and then a MARKED concept instead of nothing: sentences that fail a check are flagged for the editor
// to rewrite or remove. A written section is a concept for human review; it is never "checked" or publication-ready.
const {assessDraftClaims,headingMismatch}=require('./growth-draft-claim-guard.cjs');
const {createHash}=require('node:crypto');
// Fingerprint of ALL readable text of a page (headings, paragraphs, list items, table cells), not its raw HTML and not
// capped: scripts, styles or tracking markup changing do not count as a content change; any changed sentence does.
function pageFingerprint(html){
 const body=String(html||'').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi,' ');
 const text=[...body.matchAll(/<(h[1-6]|p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(m=>m[2].replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
 return createHash('sha256').update(text).digest('hex');
}
const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
const MAX_ITEMS=4;
const STOP=new Set('about after again also because being between could does each from have into more most other over same some such than that their them then there these they this through very what when where which while with would your yours page pages ranking'.split(' '));
const coreWords=t=>[...new Set((String(t||'').toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!STOP.has(w)))].slice(0,5);

// Selected items -> the writer's task list (codes the writer must echo back) and its competitor context.
function writingRequest(items,{targetUrl,focusQuery,existingHeadings=[]}={}){
 const chosen=items.filter(x=>x&&x.writable).slice(0,MAX_ITEMS);
 const tasks=chosen.map((it,i)=>({code:'task_sel'+i,label:clip(it.title,140),...(it.reader_question?{reader_question:clip(it.reader_question,200)}:{}),
  placement_mode:it.placement?.mode||'',placement_heading:it.placement?.section_heading||'',destination_status:it.status==='Partly on your page'?'PARTIAL':'NOT_OBSERVED',
  core_words:coreWords(it.reader_question||it.title)}));
 const observations=chosen.flatMap(it=>(it.examples||[]).filter(e=>e.url&&String(e.excerpt||'').length>=75).slice(0,2)
  .map(e=>({competitor_url:e.url,competitor_heading:clip(e.heading,140),competitor_excerpt:clip(e.excerpt,600)}))).slice(0,6);
 return {items:chosen,codeOf:new Map(chosen.map((it,i)=>['task_sel'+i,it])),
  research_context:{target_url:targetUrl,focus_query:focusQuery,observations,
   reader_task:{mode:'SECTION_IMPROVEMENT',tasks,existing_headings:existingHeadings.slice(0,30)}}};
}

// What a written section rests on, shown with it: the question it answers, the competitor fragments behind it, where it
// goes and why the item was in the list. A section behind which there is no competitor TEXT (headings only) and no
// confirmed reader question stays a marked concept: every statement in it is the writer's and must be checked.
function basisOf(item){
 const examples=(item.examples||[]).filter(e=>e&&e.site);
 const level=item.reader_question?'READER_QUESTION_CONFIRMED_BY_AI':examples.some(e=>String(e.excerpt||'').length>=75)?'COMPETITOR_TEXT':'COMPETITOR_HEADINGS_ONLY';
 return {answers:clip(item.reader_question||item.title,200),evidence_level:level,
  competitor_evidence:examples.slice(0,8).map(e=>({site:e.site,url:e.url||null,heading:clip(e.heading,160),has_text:String(e.excerpt||'').length>=75})),
  extends:item.placement?.section_heading||item.your_section||null,why_in_list:item.priority?.why||[],
  ...(level==='COMPETITOR_HEADINGS_ONLY'?{warning:'Only competitor headings are behind this section, no competitor text and no confirmed reader question: every statement in it comes from the writer. Check each one, or write it from your own knowledge.'}:{})};
}

// Checks every written section against the page the writer used; failing sentences become flags, never silent edits.
// A section is linked to a selected item ONLY by the exact task code the writer was given, once per item. A section with
// a missing, unknown or repeated code is reported as not linked (never guessed onto another item or placement).
function reviewWritten({draft,flags=[]},request,{sourceText='',focusQuery=''}={}){
 const sections=(draft?.sections||[]).filter(s=>s&&s.h2&&(s.paragraphs||[]).length);
 const used=new Set(),unlinked=[];
 const linked=sections.filter(s=>{const item=request.codeOf.get(s.task_code);
  if(!item||used.has(item.id)){unlinked.push({h2:s.h2,paragraphs:s.paragraphs,task_code:s.task_code||null,
   reason:!s.task_code?'The writer did not say which selected item this section is for.':!item?'The writer returned an unknown item code.':'A second section for the same item.'});return false}
  used.add(item.id);return true});
 const out=linked.map(s=>{
  const item=request.codeOf.get(s.task_code);
  const text=s.paragraphs.join(' ');
  const claims=assessDraftClaims({text,destinationText:sourceText,query:focusQuery});
  const marks=[...flags.filter(f=>f.h2===s.h2).map(f=>({sentence:f.sentence||null,code:f.code,reason:f.reason})),
   ...claims.violations.map(v=>({sentence:v.sentence,code:v.code,reason:v.reason}))];
  const heading=headingMismatch(s.h2,text);
  if(heading&&!marks.some(m=>m.code===heading.code))marks.push({sentence:null,code:heading.code,reason:heading.reason});
  const basis=basisOf(item);
  const seen=new Set();
  const unique=marks.filter(m=>{const k=m.code+'|'+(m.sentence||'');if(seen.has(k))return false;seen.add(k);return true});
  return {item_id:item.id,item_title:item.title,h2:s.h2,paragraphs:s.paragraphs,placement:item.placement||null,
   status:unique.length?'FLAGGED_FOR_EDITOR':basis.warning?'MARKED_NO_SOURCE_TEXT':'CONCEPT_FOR_REVIEW',flags:unique,basis,
   needs_fact_check:[...(basis.warning?['“'+s.h2+'” (whole section): '+basis.warning]:[]),...(claims.claim_review||[]).filter(r=>r.class==='GENERAL_STATEMENT_UNVERIFIED').map(r=>r.sentence)],
   needs_owner_confirmation:(claims.claim_review||[]).filter(r=>r.confirm_with_owner).map(r=>r.sentence),
   needs_safety_review:(claims.claim_review||[]).filter(r=>r.safety_review).map(r=>r.sentence)};
 });
 return {status:out.length?'WRITTEN_FOR_REVIEW':'NOT_WRITTEN',sections:out,unlinked_sections:unlinked,
  not_written:request.items.filter(x=>!used.has(x.id)).map(x=>({item_id:x.id,title:x.title})),
  note:'Concepts for the selected items. Every statement still needs your check; flagged sentences must be rewritten or removed. Nothing is published.'};
}

// One versioned evidence record per writing run: what the research was (search term, market and coverage, date, ranking
// pages, the fingerprint of this page as researched) and, per selected item, the AI judgement and every competitor
// source with its passage. It lets Growth show later why a change was proposed, even after a competitor edits its page.
function evidenceDossier({items=[],research=null,sourceFingerprint=null,writerStatus=null,now=new Date()}={}){
 const r=research||{};
 return {version:1,created_at:new Date(now).toISOString(),
  research:{focus_query:r.focus_query||null,researched_at:r.researched_at||null,page_url:r.page_url||null,market:r.market||null,
   market_coverage:r.market_coverage?{status:r.market_coverage.status,markets:(r.market_coverage.markets||[]).map(m=>({country:m.country,researched:m.researched,provider:m.provider||null,usable_results:m.usable_results??null}))}:null,
   search_source:r.search_source||null,ranking_pages:(r.ranking_pages||[]).slice(0,10),page_fingerprint:sourceFingerprint||r.page_fingerprint||null},
  items:items.map(it=>({item_id:it.id,title:clip(it.title,200),reader_question:it.reader_question||null,group:it.group||null,
   need_status:it.need?.status||null,ai_judgement:it.ai||null,coverage:it.coverage||null,your_section:it.your_section||null,
   possible_overlap:(it.possible_overlap||[]).map(o=>o.id),
   sources:(it.examples||[]).map(e=>({site:e.site,url:e.url||null,heading:clip(e.heading,160),passage:clip(e.excerpt,400)||null,position:e.position??null}))})),
  writer_status:writerStatus};
}

// generate(researchContext) -> {status, draft, flags, source_text}: the Tracker passes the owner draft handler (live page,
// identity checks), the standalone passes the generator with the public page it already read.
async function writeForSelection({items,targetUrl,focusQuery,existingHeadings,generate,research=null,sourceFingerprint=null}){
 const request=writingRequest(items||[],{targetUrl,focusQuery,existingHeadings});
 if(!request.items.length)return {status:'NOTHING_TO_WRITE',sections:[],not_written:[],reason:'Select at least one topic or question (page elements are added by the editor, not written).'};
 let out;
 try{out=await generate(request.research_context)}catch(e){out={status:'WRITER_UNAVAILABLE'}}
 if(!out||!out.draft)return {status:'NOT_WRITTEN',writer_status:out?.status||'WRITER_UNAVAILABLE',sections:[],
  not_written:request.items.map(x=>({item_id:x.id,title:x.title})),reason:'The writer returned no usable text ('+(out?.status||'unavailable')+'). Write these items yourself; the research and your selection are kept.',
  dossier:evidenceDossier({items:request.items,research,sourceFingerprint,writerStatus:out?.status||'WRITER_UNAVAILABLE'})};
 return {...reviewWritten(out,request,{sourceText:out.source_text||'',focusQuery}),writer_status:out.status,
  dossier:evidenceDossier({items:request.items,research,sourceFingerprint,writerStatus:out.status})};
}

// The owner's selection is kept whole: recommendation (what matters most) and the writer's limit per run (four) are
// different things. Each run writes the next four selected writable items that are not written yet, in list order; the
// rest stays pending for the next run, also after a new session or a failed run (only written sections count as done).
function planBatch(items,doneIds=[]){
 const done=new Set((doneIds||[]).map(String));
 const open=(items||[]).filter(x=>x&&x.writable&&!done.has(String(x.id)));
 return {batch:open.slice(0,MAX_ITEMS),pending:open.slice(MAX_ITEMS),already_written:(items||[]).filter(x=>x&&x.writable&&done.has(String(x.id))).map(x=>x.id)};
}

// The open part of an earlier selection against a NEW research run: an item is carried over (ticked again) only when the
// same id still names the same need: the same title, or at least one of the same competitor sections. Otherwise it is
// listed as needing remapping, with the new items that use its sections, and is not ticked; nothing is guessed.
function remapSelection(pendingItems=[],newItems=[]){
 const norm=t=>String(t||'').toLowerCase().replace(/\s+/g,' ').trim();
 const keys=it=>new Set((it.examples||[]).map(e=>String(e.site||'')+'|'+String(e.heading||'').toLowerCase()));
 const byId=new Map(newItems.filter(x=>x&&x.writable).map(x=>[String(x.id),x]));
 const out={carried:[],needs_remapping:[],no_longer_found:[]};
 for(const old of pendingItems){
  const now=byId.get(String(old.id)),src=new Set(old.sources||[]);
  if(now&&(norm(now.title)===norm(old.title)||[...keys(now)].some(k=>src.has(k)))){out.carried.push(now.id);continue}
  const candidates=[...byId.values()].filter(x=>[...keys(x)].some(k=>src.has(k))).map(x=>({id:x.id,title:x.title}));
  if(candidates.length)out.needs_remapping.push({old_id:old.id,title:old.title,candidates});
  else out.no_longer_found.push({old_id:old.id,title:old.title});
 }
 return out;
}

module.exports={remapSelection,planBatch,evidenceDossier,writeForSelection,writingRequest,reviewWritten,pageFingerprint,basisOf,MAX_ITEMS};
