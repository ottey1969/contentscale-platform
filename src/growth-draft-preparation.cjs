'use strict';
// Review-only composition: assembly is never a publish operation.
const {assembleGrowthHtmlDraft}=require('./growth-html-draft.cjs');
const {reviewCanonicalGrowthDraft}=require('./growth-canonical-review.cjs');
async function prepareCanonicalGrowthDraft(input={}){
 const canonicalInput={...input};
 const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
 const evidence=await loadGrowthTrackerEvidence(input.db,{pageId:input.pageId,clientId:input.clientId});
 const assembly=assembleGrowthHtmlDraft({originalHtml:evidence.page.html_content||'',additions:input.additions,caseStudyLocked:evidence.page.case_study_active===true});
 if(!assembly.html)return {status:'BLOCKED',assembly,review:null,publication_allowed:false};
 const review=await reviewCanonicalGrowthDraft({...canonicalInput,draftHtml:assembly.html});
 return {status:assembly.status==='DRAFT_FOR_REVIEW'&&review.ready?'READY_FOR_HUMAN_REVIEW':'BLOCKED',assembly,review,publication_allowed:false};
}
module.exports={prepareCanonicalGrowthDraft};
