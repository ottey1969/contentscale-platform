'use strict';
// Shared Network ↔ Pre-Write validation; never infer an answer from checked:true alone.
// This module imports the exact validator used by the Pre-Write Research Prompt tab.
const research = require('./prewrite-ai-answer-research.cjs');
const KEYS = ['google_aio','chatgpt','perplexity','claude','copilot'];
const LABELS = {google_aio:'Google AIO / Gemini',chatgpt:'ChatGPT Search',perplexity:'Perplexity',claude:'Claude',copilot:'Microsoft Copilot'};
const obj = x => x&&typeof x==='object'&&!Array.isArray(x)?x:{};
function queryOf(brief, explicit=''){
 const b=obj(brief),r=obj(b.prewrite_ai_answer_research);
 return String(explicit||r.query||r.target_query||b.seed_keyword||b.focus_keyword||b.keyword||'').trim();
}
function textOf(e){
 const v=obj(e);
 return typeof v.text==='string'?v.text:typeof v.answer==='string'?v.answer:typeof v.answer_text==='string'?v.answer_text:'';
}
function sourceOf(e){
 const v=obj(e);
 return String(v.google_source||v.answer_source||v.source_choice||'').trim();
}
function validateNetworkAi(brief, explicitQuery=''){
 const b=obj(brief),ae=obj(b.ai_system_evidence),query=queryOf(b,explicitQuery);
 const checked=[],missing=[],invalid=[],details={};
 for(const key of KEYS){
  const e=obj(ae[key]),raw=textOf(e),source=sourceOf(e);
  // The same semantic checks as the authoritative Pre-Write validator.
  const v=key==='google_aio'
    ?research.validateGoogle(raw,source,query,false)
    :research.validateAnswer(raw,query);
  const isChecked=e.checked===true&&v.valid===true;
  details[key]={checked:isChecked,submitted:e.checked===true,valid:v.valid===true,reason:v.reason||null,
    status:v.status||'not_checked',warnings:v.warnings||[],has_answer:!!raw.trim()};
  if(isChecked)checked.push(key);
  else {missing.push(key);if(e.checked===true)invalid.push({engine:key,reason:v.reason||'no_valid_answer'});}
 }
 return {checked_count:checked.length,checked,missing,missing_labels:missing.map(k=>LABELS[k]),complete:checked.length===5,
  invalid,details,query_validated:!!query,
  rule:'Checked means an actual valid answer checked by the current Pre-Write validator; manually pasted text is observational, not automatically verified provenance.'};
}
module.exports={validateNetworkAi,queryOf,KEYS,LABELS};
