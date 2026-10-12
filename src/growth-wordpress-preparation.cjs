'use strict';
// One read-only preparation flow. The caller must supply *fresh* WordPress HTML;
// no write handler or network request is invoked by this module.
const {prepareCanonicalGrowthDraft}=require('./growth-draft-preparation.cjs');
const {createGrowthWordPressDraftPayload}=require('./growth-wordpress-draft-payload.cjs');
const {growthWordPressHandoff}=require('./growth-wordpress-handoff.cjs');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
async function prepareGrowthWordPressHandoff(input={}){
 const preparation=await prepareCanonicalGrowthDraft(input);
 if(preparation.status!=='READY_FOR_HUMAN_REVIEW')
  return {status:'BLOCKED',stage:'GROWTH_REVIEW',issues:preparation.review?.issues||preparation.assembly?.issues||[],payload:null,publication_allowed:false};
 const payload=createGrowthWordPressDraftPayload(preparation,{editor_approved:input.editor_approved,title:input.title});
 if(!payload.payload)return {status:'BLOCKED',stage:'EDITOR_APPROVAL',issues:payload.issues,payload:null,publication_allowed:false};
 // Repeat canonical check immediately before handoff. Still not a transaction or write.
 const canonical=await loadGrowthTrackerEvidence(input.db,{pageId:input.pageId,clientId:input.clientId});
 if(canonical.page.case_study_active)return {status:'BLOCKED',stage:'CASE_STUDY',issues:['CASE_STUDY_LOCK'],payload:null,publication_allowed:false};
 const guarded=growthWordPressHandoff({draftPayload:payload,originalHtml:canonical.page.html_content,
  currentHtml:input.currentWordPressHtml,authorized:input.authorized===true,
  sourcePageUrl:canonical.page.url,expectedPageUrl:input.expectedPageUrl});
 return {...guarded,stage:'WORDPRESS_HANDOFF',publication_allowed:false};
}
module.exports={prepareGrowthWordPressHandoff};
