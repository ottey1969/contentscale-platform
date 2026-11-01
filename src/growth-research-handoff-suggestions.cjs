'use strict';
// Deterministic suggestions from an authenticated canonical Growth research result.
// Never fabricate page facts, competitor advantages, rankings, or publication consent.
// A tracked keyword ("ai content quality checker") as link text: first letter capital, two-letter abbreviations in
// capitals ("AI content quality checker"); common two-letter words stay as they are.
const SMALL=new Set(['of','in','on','to','at','by','or','an','as','is','it','be','we','us','my','me','no','so','up','de','en','op','te','je','ik','om','la','le','du','et','am','im','zu']);
const labelCase=t=>String(t||'').split(' ').map((w,i)=>/^[a-z]{2}$/.test(w)&&!SMALL.has(w)?w.toUpperCase():i===0?w.charAt(0).toUpperCase()+w.slice(1):w).join(' ');
function proposeHandoffFromResearch(report,canonicalUrl){
 if(!report||report.success!==true||report.url!==canonicalUrl)
  return {status:'RESEARCH_EVIDENCE_IDENTITY_MISMATCH',safe:false};
 const source=report.page_content||{},headings=source.headings||{},search=report.search||{};
 const verified=Array.isArray(search.verified_queries)?search.verified_queries:[];
 const selected=report.growth_decision?.primary_next_action?.query;
 const phrase=typeof selected==='string'&&selected.trim()?selected:
   verified.length&&typeof verified[0].query==='string'?verified[0].query:
   typeof search.focus_query==='string'?search.focus_query:'';
 const clean=x=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,' ').trim():'';
 const ownOrigin=(()=>{try{return new URL(canonicalUrl).origin}catch{return null}})();
 const linkCandidates=(report.site_architecture?.candidates||[]);
 const scopedUrls=report.growth_decision?.primary_next_action?.related_pages_to_check;
 const eligibleUrls=Array.isArray(scopedUrls)?new Set(scopedUrls):null;
 const differentIntent=require('./growth-intent-signals.cjs').OFF_INTENT_RE;
 const link=linkCandidates.find(x=>{
  try{
   const u=new URL(x.url),candidateIntent=[x.tracked_keyword||'',u.pathname.replace(/[\/_-]+/g,' ')].join(' ');
   return ownOrigin&&u.protocol==='https:'&&u.origin===ownOrigin&&u.href!==canonicalUrl&&
    x.status==='CONTEXTUAL_INTERNAL_LINK_CANDIDATE'&&(!eligibleUrls||eligibleUrls.has(x.url))&&
    !differentIntent.test(candidateIntent);
  }catch{return false}
 });
 // No contextual candidate in the site inventory: the reader route of this research (information → action) names the
 // next page for the reader; its own anchor when it is real link text, else the page's tracked keyword.
 const step=!link&&report.reader_funnel?.for_url===canonicalUrl?(report.reader_funnel.stages||[]).find(x=>{
  try{const u=new URL(x.url);return x.stage==='ACTION'&&ownOrigin&&u.protocol==='https:'&&u.origin===ownOrigin&&u.href!==canonicalUrl}catch{return false}}):null;
 const stepLabel=step?(step.link&&step.link.status==='LINK_CANDIDATE_FOR_REVIEW'&&String(step.link.anchor_text||'').trim().split(/\s+/).length>=2?step.link.anchor_text:step.keyword):'';
 const candidates=(report.editorial?.candidate_sections||[]).filter(x=>x&&typeof x.proposed_topic==='string').slice(0,4);
 const findings=(report.findings||[]).filter(x=>x&&x.priority!=='INFO').slice(0,6);
 return {status:'SOURCE_BACKED_EDITOR_START',safe:true,
  query:clean(phrase).slice(0,300),title:clean(headings.title).slice(0,100),
  meta:clean(headings.description).slice(0,220),
  internal_url:link?.url||step?.url||null,
  // Words that already stand in a paragraph stay exactly as written (they are wrapped, not retyped); a keyword is written as link text.
  internal_label:(link?labelCase(clean(link.tracked_keyword)):stepLabel===step?.keyword?labelCase(clean(stepLabel)):clean(stepLabel)).slice(0,100),
  internal_basis:link?'CONTEXTUAL_INTERNAL_LINK_CANDIDATE':step?'READER_ROUTE_NEXT_STEP':null,
  internal_reason:link?null:step?clean('Next step for the reader after this page (information → action): '+step.url+(step.link&&step.link.action?'. '+step.link.action:'')).slice(0,400):null,
  existing_h1:(headings.h1||[]).filter(x=>typeof x==='string').slice(0,3),
  existing_h2:(headings.h2||[]).filter(x=>typeof x==='string').slice(0,8),
  existing_excerpt:(headings.paragraph_samples||[]).filter(x=>typeof x==='string').slice(0,2),
  candidate_headings:candidates.map(x=>({text:clean(x.proposed_topic).slice(0,140),
   source_url:x.derived_from,requires_editor_verification:true})),
  findings:findings.map(x=>({priority:x.priority,code:x.code,action:clean(x.action).slice(0,420)})),
  source_type:report.summary?.primary_source||'UNKNOWN',
  // Only a verified Search Console row for THIS working query counts (the package checks exactly that); a row for
  // another query of the page does not (owner 2026-11-01: VERIFIED_GSC_EVIDENCE_NOT_FOUND after an automatic "Verified").
  verified_queries:verified.map(v=>typeof v.query==='string'?v.query.trim().toLowerCase():'').filter(Boolean).slice(0,50),
  verified_query:verified.some(v=>typeof v.query==='string'&&v.query.trim().toLowerCase()===clean(phrase).toLowerCase()),
  editor_approval_required:true,
  copy_requires_real_checked_facts:true,
  publication_allowed:false
 };
}
module.exports={proposeHandoffFromResearch};