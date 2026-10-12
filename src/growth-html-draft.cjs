'use strict';
// Conservative HTML draft assembly: append explicitly editor-approved additions
// before the closing article; never replace or silently regenerate original HTML.
function assembleGrowthHtmlDraft({originalHtml='',additions=[],caseStudyLocked=false}={}){
 const issues=[];
 if(caseStudyLocked)issues.push('CASE_STUDY_LOCK');
 if(typeof originalHtml!=='string'||!originalHtml.trim())issues.push('ORIGINAL_HTML_MISSING');
 if(!Array.isArray(additions))issues.push('ADDITIONS_INVALID');
 const approved=Array.isArray(additions)?additions.filter(x=>x&&x.approved===true):[];
 for(const item of approved){
  if(typeof item.html!=='string'||!item.html.trim()||!item.evidence_ref||typeof item.evidence_ref!=='string')
   issues.push('APPROVED_ADDITION_INCOMPLETE');
  else if(/<\/?(?:script|iframe|object|embed|form|style)\b|\bon\w+\s*=|javascript\s*:/i.test(item.html))
   issues.push('UNSAFE_ADDITION_HTML');
 }
 if(issues.length)return {status:'BLOCKED',issues:[...new Set(issues)],html:null,inserted:0};
 if(!approved.length)return {status:'NO_APPROVED_EDITS',issues:[],html:originalHtml,inserted:0};
 const close=/<\/article\s*>\s*$/i.exec(originalHtml);
 if(!close)return {status:'BLOCKED',issues:['ARTICLE_BOUNDARY_NOT_FOUND'],html:null,inserted:0};
 const content=approved.map(x=>x.html).join('\n');
 return {status:'DRAFT_FOR_REVIEW',issues:[],html:originalHtml.slice(0,close.index)+ '\n'+content+'\n'+originalHtml.slice(close.index),inserted:approved.length};
}
module.exports={assembleGrowthHtmlDraft};
