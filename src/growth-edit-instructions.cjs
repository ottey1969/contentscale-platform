'use strict';
// Edit instructions require independently supplied, page-scoped verified observations.
// These are proposed edits, never completed changes or promised CTR gains.
function buildGrowthEditInstructions({page={},searchSpy,aiSpy}={}){
 const url=String(page.url||'');
 const instructions=[],issues=[];
 for(const [source,items] of [['search',searchSpy],['ai',aiSpy]]){
  if(!Array.isArray(items)){issues.push(source.toUpperCase()+'_EVIDENCE_MISSING');continue;}
  for(const item of items){
   if(!item||item.target_url!==url)continue;
   const observed=String(item.observed||'').trim(),improvement=String(item.improvement||'').trim(),section=String(item.where_in_draft||'').trim();
   let external=false;
   try{const a=new URL(url),b=new URL(item.source_url);external=b.protocol==='https:'&&b.hostname.replace(/^www\./,'')!==a.hostname.replace(/^www\./,'');}catch{}
   if(!external||!observed||!improvement||!section){issues.push(source.toUpperCase()+'_EVIDENCE_INCOMPLETE');continue;}
   instructions.push({source,competitor_url:item.source_url,observed,proposed_change:improvement,target_section:section,source_ref:item.source_ref||null,retrieved_at:item.retrieved_at||null,status:'PROPOSED_NOT_APPLIED',click_uplift_estimate:null});
  }
 }
 if(!instructions.length)issues.push('NO_VERIFIED_EDIT_INSTRUCTIONS');
 if(page.case_study_active===true)issues.push('CASE_STUDY_LOCK');
 return {status:issues.length?'BLOCKED':'PROPOSED_FOR_EDITOR_REVIEW',instructions,issues:[...new Set(issues)],auto_publish:false};
}
module.exports={buildGrowthEditInstructions};
