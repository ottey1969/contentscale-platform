'use strict';

/**
 * Pre-Write Brief: research answers, not rank/mention/citation monitoring.
 * An answer is an untrusted observation. It may inform an editorial hypothesis,
 * but neither an AI-generated assertion nor a URL automatically becomes a fact.
 */
const ENGINES=Object.freeze([
  {id:'google',label:'Google AI Overviews / Gemini'},
  {id:'chatgpt',label:'ChatGPT Search'},
  {id:'perplexity',label:'Perplexity'},
  {id:'claude',label:'Claude'},
  {id:'copilot',label:'Microsoft Copilot'}
]);
const ALIASES={aio:'google',gemini:'google',google_aio:'google',google_ai:'google',chatgpt_search:'chatgpt',microsoft_copilot:'copilot'};
const MAX_ANSWER=16000;
function cleanText(v,n=MAX_ANSWER){return typeof v==='string'?v.trim().slice(0,n):''}
function cleanUrl(value){
  if(typeof value!=='string')return null;
  try{const u=new URL(value.trim());return ['https:','http:'].includes(u.protocol)?u.toString():null}catch{return null}
}
function normalizeAnswer(row){
  const raw=cleanText(row?.engine||row?.system||row?.id,60).toLowerCase().replace(/[\s-]+/g,'_');
  const engine=ALIASES[raw]||raw;
  if(!ENGINES.some(x=>x.id===engine))return null;
  const answer=cleanText(row?.answer||row?.text||row?.response);
  const citations=Array.isArray(row?.sources||row?.citations)
    ?[...new Set((row.sources||row.citations).map(x=>cleanUrl(typeof x==='string'?x:x?.url)).filter(Boolean))].slice(0,30)
    :[];
  return {engine,answer,citations,checked_at:cleanText(row?.checked_at||row?.checkedAt,50)||null};
}
function makePrewriteAiAnswerResearch({query,answers}={}){
  const q=cleanText(query,350);
  const inputs=Array.isArray(answers)?answers:[];
  const byEngine=new Map();
  for(const raw of inputs){const n=normalizeAnswer(raw);if(n&&n.answer)byEngine.set(n.engine,n)}
  const observations=ENGINES.map(({id,label})=>{
    const row=byEngine.get(id);
    return {engine:id,label,checked:!!row,answer_excerpt:row?row.answer.slice(0,2800):null,
      source_urls:row?row.citations:[],source_verification:'not_verified',
      editorial_use:row?'Review how this answer frames the query, identify missing qualifications, verify every material claim against independent original sources, and write a distinct useful explanation.':'Not checked: never infer an answer, citation, or gap.'};
  });
  const checked=observations.filter(x=>x.checked);
  const sourceUrls=[...new Set(checked.flatMap(x=>x.source_urls))];
  const instructions=[
    'This research is PRE-PUBLICATION editorial input, not a check whether this website is cited.',
    'Compare the actual answers to the same target query; identify differing explanations, unanswered questions and unsupported assertions.',
    'Use source URLs as leads only. Fetch and verify original material before citing, quoting or presenting a statement as fact.',
    'Create a direct accurate answer, supporting context, genuine expert insight if supplied, and reader-focused examples; do not copy AI answers.',
    'Separate verifiable evidence from hypotheses and unknowns. Missing engines are explicitly incomplete.',
    'Never promise fast AI citation, ranking, traffic or revenue. Publishing is not proof of citation.',
    'Keep the brief aligned with the page intent and avoid creating duplicate pages or cannibalizing existing URLs.'
  ];
  return {
    contract:'prewrite_ai_answer_research_v1',query:q,mode:'pre_publication_answer_research',
    purpose:'Write a clearer, more original, better-sourced answer with citation potential',
    systems_total:ENGINES.length,systems_researched:checked.length,
    research_complete:checked.length===ENGINES.length,
    observations,source_candidates:sourceUrls,
    verified_sources:[], // Must only be populated by independent provenance verification.
    writing_instructions:instructions,
    required_brief_outputs:['direct_answer','distinctive_expert_insights','source_verification_tasks',
      'missing_questions','limitations','proposed_outline','original_examples','fact_check_before_publishing'],
    citation_tracking:{performed:false,reason:'Citation/mention monitoring belongs to Free AI Citations Tracker.'},
    readiness:checked.length?'REVIEW_EVIDENCE_BEFORE_WRITING':'RESEARCH_NOT_CAPTURED'
  };
}
function buildPrewriteResearchPrompt(research){
  if(!research||research.contract!=='prewrite_ai_answer_research_v1')throw Error('invalid_prewrite_ai_answer_research');
  return [
    'PRE-WRITE BRIEF AI ANSWER RESEARCH. This is NOT citation tracking.',
    'Target query: '+research.query,
    'AI answers researched: '+research.systems_researched+'/'+research.systems_total,
    ...research.observations.map(x=>x.checked
      ?'SYSTEM: '+x.label+'\nObserved answer (unverified): '+x.answer_excerpt+
        '\nCandidate source URLs (NOT verified): '+(x.source_urls.join(', ')||'none')
      :'SYSTEM: '+x.label+' — NOT CHECKED. Do not invent results.'),
    'EDITORIAL REQUIREMENTS:\n'+research.writing_instructions.map((s,i)=>(i+1)+'. '+s).join('\n'),
    'Produce: '+research.required_brief_outputs.join(', '),
    'Do not claim that any answer or source establishes that the target domain is cited.'
  ].join('\n\n');
}
module.exports={ENGINES,normalizeAnswer,makePrewriteAiAnswerResearch,buildPrewriteResearchPrompt};
