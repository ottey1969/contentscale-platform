'use strict';
// Deterministic suggestions from an authenticated canonical Growth research result.
// Never fabricate page facts, competitor advantages, rankings, or publication consent.
function proposeHandoffFromResearch(report,canonicalUrl){
 if(!report||report.success!==true||report.url!==canonicalUrl)
  return {status:'RESEARCH_EVIDENCE_IDENTITY_MISMATCH',safe:false};
 const source=report.page_content||{},headings=source.headings||{},search=report.search||{};
 const verified=Array.isArray(search.verified_queries)?search.verified_queries:[];
 const phrase=verified.length&&typeof verified[0].query==='string'?verified[0].query:
   typeof search.focus_query==='string'?search.focus_query:'';
 const clean=x=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,' ').trim():'';
 const ownOrigin=(()=>{try{return new URL(canonicalUrl).origin}catch{return null}})();
 const linkCandidates=(report.site_architecture?.candidates||[]);
 const link=linkCandidates.find(x=>{
  try{const u=new URL(x.url);return ownOrigin&&u.protocol==='https:'&&u.origin===ownOrigin&&u.href!==canonicalUrl&&x.status==='CONTEXTUAL_INTERNAL_LINK_CANDIDATE'}catch{return false}
 });
 const candidates=(report.editorial?.candidate_sections||[]).filter(x=>x&&typeof x.proposed_topic==='string').slice(0,4);
 const findings=(report.findings||[]).filter(x=>x&&x.priority!=='INFO').slice(0,6);
 return {status:'SOURCE_BACKED_EDITOR_START',safe:true,
  query:clean(phrase).slice(0,300),title:clean(headings.title).slice(0,100),
  meta:clean(headings.description).slice(0,220),
  internal_url:link?.url||null,
  internal_label:clean(link?.tracked_keyword).slice(0,100),
  existing_h1:(headings.h1||[]).filter(x=>typeof x==='string').slice(0,3),
  existing_h2:(headings.h2||[]).filter(x=>typeof x==='string').slice(0,8),
  existing_excerpt:(headings.paragraph_samples||[]).filter(x=>typeof x==='string').slice(0,2),
  candidate_headings:candidates.map(x=>({text:clean(x.proposed_topic).slice(0,140),
   source_url:x.derived_from,requires_editor_verification:true})),
  findings:findings.map(x=>({priority:x.priority,code:x.code,action:clean(x.action).slice(0,420)})),
  source_type:report.summary?.primary_source||'UNKNOWN',
  verified_query:verified.length>0,
  editor_approval_required:true,
  copy_requires_real_checked_facts:true,
  publication_allowed:false
 };
}
module.exports={proposeHandoffFromResearch};