'use strict';
// Browser-supplied live research is always untrusted editorial context, NOT
// verified content gaps, factual sources, measured positions, or publication rights.
function normalizeGrowthResearchContext(payload,{targetUrl='',focusQuery=''}={}){
 const blank={status:'NO_ALIGNED_RESEARCH_CONTEXT',observations:[],scope:'UNTRUSTED_RESEARCH_QUESTIONS_ONLY'};
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return blank;
 if(String(payload.target_url||'')!==String(targetUrl||'')||
    String(payload.focus_query||'').trim().toLowerCase()!==String(focusQuery||'').trim().toLowerCase())return blank;
 const observations=[],seen=new Set();
 const clean=v=>String(typeof v==='string'?v:'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 for(const raw of (Array.isArray(payload.observations)?payload.observations:[]).slice(0,8)){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const url=clean(raw.competitor_url),heading=clean(raw.competitor_heading).slice(0,140),
   excerpt=clean(raw.competitor_excerpt).slice(0,600);
  let parsed;
  try{parsed=new URL(url)}catch{continue}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!parsed.hostname.includes('.'))continue;
  let ownHost;try{ownHost=new URL(targetUrl).hostname}catch{continue}
  if(parsed.hostname===ownHost)continue;
  if(!heading||excerpt.length<75||seen.has(parsed.origin+'|'+heading.toLowerCase()))continue;
  seen.add(parsed.origin+'|'+heading.toLowerCase());
  observations.push({competitor_url:parsed.origin+parsed.pathname,competitor_heading:heading,
   competitor_excerpt:excerpt,evidence_scope:'UNTRUSTED_PUBLIC_HTML_OBSERVATION_NOT_A_PROVEN_GAP'});
  if(observations.length>=3)break;
 }
 return {status:observations.length?'ALIGNED_UNTRUSTED_RESEARCH_CONTEXT':'NO_ALIGNED_RESEARCH_CONTEXT',
  observations,scope:'UNTRUSTED_RESEARCH_QUESTIONS_ONLY'};
}
module.exports={normalizeGrowthResearchContext};
