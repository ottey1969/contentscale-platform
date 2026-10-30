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
  const seen=new Set();
  const unique=marks.filter(m=>{const k=m.code+'|'+(m.sentence||'');if(seen.has(k))return false;seen.add(k);return true});
  return {item_id:item.id,item_title:item.title,h2:s.h2,paragraphs:s.paragraphs,placement:item.placement||null,
   status:unique.length?'FLAGGED_FOR_EDITOR':'CONCEPT_FOR_REVIEW',flags:unique,
   needs_fact_check:(claims.claim_review||[]).filter(r=>r.class==='GENERAL_STATEMENT_UNVERIFIED').map(r=>r.sentence),
   needs_owner_confirmation:(claims.claim_review||[]).filter(r=>r.confirm_with_owner).map(r=>r.sentence),
   needs_safety_review:(claims.claim_review||[]).filter(r=>r.safety_review).map(r=>r.sentence)};
 });
 return {status:out.length?'WRITTEN_FOR_REVIEW':'NOT_WRITTEN',sections:out,unlinked_sections:unlinked,
  not_written:request.items.filter(x=>!used.has(x.id)).map(x=>({item_id:x.id,title:x.title})),
  note:'Concepts for the selected items. Every statement still needs your check; flagged sentences must be rewritten or removed. Nothing is published.'};
}

// generate(researchContext) -> {status, draft, flags, source_text}: the Tracker passes the owner draft handler (live page,
// identity checks), the standalone passes the generator with the public page it already read.
async function writeForSelection({items,targetUrl,focusQuery,existingHeadings,generate}){
 const request=writingRequest(items||[],{targetUrl,focusQuery,existingHeadings});
 if(!request.items.length)return {status:'NOTHING_TO_WRITE',sections:[],not_written:[],reason:'Select at least one topic or question (page elements are added by the editor, not written).'};
 let out;
 try{out=await generate(request.research_context)}catch(e){out={status:'WRITER_UNAVAILABLE'}}
 if(!out||!out.draft)return {status:'NOT_WRITTEN',writer_status:out?.status||'WRITER_UNAVAILABLE',sections:[],
  not_written:request.items.map(x=>({item_id:x.id,title:x.title})),reason:'The writer returned no usable text ('+(out?.status||'unavailable')+'). Write these items yourself; the research and your selection are kept.'};
 return {...reviewWritten(out,request,{sourceText:out.source_text||'',focusQuery}),writer_status:out.status};
}

module.exports={writeForSelection,writingRequest,reviewWritten,pageFingerprint,MAX_ITEMS};
