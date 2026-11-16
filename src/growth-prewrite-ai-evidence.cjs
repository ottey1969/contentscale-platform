'use strict';
// Pre-Write -> Growth: reuse original answers only for the same account, canonical page,
// customer question and market. Pre-Write's editorial inputs are NOT automatically
// measurements of citations; only a complete, parseable source-backed answer can
// enter the existing Growth AI comparison. Other answers remain editorial leads.
const {sameUrl}=require('./prewrite-existing-page.cjs');
const ai=require('./growth-free/ai-answers.cjs');
const AGE_DAYS=14;
const ENGINES=[['google_aio','google'],['chatgpt','chatgpt'],['perplexity','perplexity'],['claude','claude'],['copilot','copilot']];
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const locale=s=>{const v=String(s||'').trim().toLowerCase().split(/[^a-z]/)[0];return ({english:'en',dutch:'nl',nederlands:'nl',spanish:'es',espanol:'es',french:'fr',german:'de',united:'us',unitedstates:'us'})[v]||v};
const time=x=>{const n=Date.parse(x||'');return Number.isFinite(n)?n:null};
function exactQuestion(brief){
 const r=brief?.prewrite_ai_answer_research||{};
 return String(r.ai_question?.text||brief?.customer_question?.text||r.query||brief?.keyword||'').trim();
}
function answerOf(brief,key,alias){
 const ae=brief.ai_system_evidence||{};
 const record=ae[key]||ae[alias]||{};
 const research=brief.prewrite_ai_answer_research||{};
 const observation=(research.observations||[]).find(x=>x?.engine===alias||x?.engine===key)||{};
 return {
  raw:typeof record==='string'?record:String(record.text||record.answer||''),
  at:record.checked_at||observation.observed_at||null,
  source:record.google_source||observation.google_source||null,
  fallback_excerpt:observation.answer_excerpt||'',
  observation_status:observation.validation_status||null
 };
}
async function loadPrewriteGrowthAnswers(pool,{clientId,pageUrl,query,market,language='',now=Date.now(),limit=60}={}){
 const empty={status:'NO_MATCH',brief_id:null,original_query:null,items:[],rows:[],note:'No matching Pre-Write AI research was found for this exact page and question.'};
 if(!Number.isSafeInteger(Number(clientId))||Number(clientId)<=0||!pageUrl||!query)return empty;
 // tenant restriction is part of SQL, never supplied by the browser.
 const {rows:briefs}=await pool.query(
  'SELECT id, keyword, region, language, brief_json, created_at FROM prewrite_briefs WHERE client_id=$1 ORDER BY created_at DESC LIMIT $2',
  [Number(clientId),Math.min(100,Math.max(1,Number(limit)||60))]);
 let selected=null;
 for(const r of briefs||[]){
  const b=r.brief_json||{};
  const linked=b.content_decision?.closest_existing_url||b.published_url||'';
  if(!linked||!sameUrl(linked,pageUrl))continue;
  const asked=exactQuestion(b);
  if(norm(asked)!==norm(query))continue;
  const savedMarket=locale(r.region||b.prewrite_ai_answer_research?.market);
  if(!market||!savedMarket||locale(market)!==savedMarket)continue;
  const briefLang=locale(r.language||b.prewrite_ai_answer_research?.language);
  if(language&&briefLang&&locale(language)!==briefLang)continue;
  selected={record:r,brief:b,asked};break;
 }
 if(!selected)return empty;
 const {record,brief,asked}=selected;
 const items=[],rows=[],writing_inputs=[];
 for(const [key,alias] of ENGINES){
  const o=answerOf(brief,key,alias);
  const at=time(o.at||record.created_at);
  const fresh=at!==null&&at<=now&&now-at<=AGE_DAYS*86400000;
  const item={engine:key,label:ai.ENGINES.find(e=>e.id===key)?.label||key,checked_at:at?new Date(at).toISOString():null,
   source:'PREWRITE_BRIEF',origin_verified:false,imported:false,status:'NOT_CHECKED',sources:0};
  if(o.observation_status==='invalid'){item.status='INVALID';items.push(item);continue}
  if(!o.raw.trim()){item.status=o.fallback_excerpt?'EXCERPT_ONLY':'NOT_CHECKED';items.push(item);continue}
  if(!fresh){item.status='OUTDATED';items.push(item);continue}
  // Valid prose supports editorial comparison even without a RESOURCES section.
  // It is unverified writing input only, never a claim of brand citation or source truth.
  const editorial=ai.parseAiAnswer(o.raw,{pageUrl,query});
  if(editorial.validation_status!=='invalid'){
   writing_inputs.push({engine:key,answer_excerpt:String(editorial.answer||'').slice(0,1800),
    observed_at:item.checked_at,provenance:'PREWRITE_MANUAL_UNVERIFIED',
    editorial_only:true,verified_claims:false});
  }
  // The Pre-Write writing prompt accepts prose and source leads, unlike Growth's
  // citation-analysis prompt. Never fabricate a RESOURCES block from those leads.
  // Only an actual RESOURCES section from the original answer is eligible.
  const parsed=ai.parseAiAnswer(o.raw,{pageUrl,query});
  if(parsed.validation_status==='invalid'){item.status='INVALID';items.push(item);continue}
  if(!parsed.sources_verifiable){item.status='EDITORIAL_ONLY';items.push(item);continue}
  item.status='REUSED_SOURCE_BACKED';item.imported=true;item.sources=parsed.sources.length;
  rows.push({engine:key,raw_text:o.raw,parsed,created_at:new Date(at).toISOString(),origin:'PREWRITE_BRIEF',brief_id:Number(record.id)});
  items.push(item);
 }
 return {status:'MATCHED',brief_id:Number(record.id),original_query:asked,
  items,rows,writing_inputs,editorial_count:items.filter(x=>x.status==='EDITORIAL_ONLY').length,
  reused_count:rows.length,source:'Pre-Write (manual answers: origin not independently verified)',
  note:'Reused answers were re-validated for this exact question. Pre-Write editorial evidence without a genuine RESOURCES section remains writing input only, not an AI citation observation.'};
}
module.exports={loadPrewriteGrowthAnswers,exactQuestion,answerOf,AGE_DAYS};
