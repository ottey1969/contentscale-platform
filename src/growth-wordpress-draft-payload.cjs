'use strict';
// Pure WordPress handoff preparation. No HTTP calls, no credentials, no DB writes.
// Caller must revalidate authorisation and source freshness before any WP draft creation.
function createGrowthWordPressDraftPayload(preparation={},options={}){
 const issues=[];
 if(preparation.status!=='READY_FOR_HUMAN_REVIEW'||preparation.review?.ready!==true)issues.push('GROWTH_REVIEW_NOT_READY');
 if(preparation.assembly?.status!=='DRAFT_FOR_REVIEW'||!preparation.assembly?.html)issues.push('APPROVED_HTML_DRAFT_MISSING');
 if(preparation.review?.status!=='READY_FOR_HUMAN_REVIEW')issues.push('GROWTH_REVIEW_STATUS_MISMATCH');
 if(preparation.review?.opportunity_plan?.automatic_draft_allowed!==false)issues.push('UNEXPECTED_AUTOMATION_STATE');
 if(preparation.review?.edit_instructions?.auto_publish!==false)issues.push('UNEXPECTED_PUBLICATION_STATE');
 if(!options||options.editor_approved!==true)issues.push('HUMAN_APPROVAL_REQUIRED');
 if(typeof options.title!=='string'||!options.title.trim())issues.push('WORDPRESS_TITLE_REQUIRED');
 if(issues.length)return {status:'BLOCKED',issues,payload:null,dispatch_allowed:false};
 return {status:'OFFLINE_WORDPRESS_DRAFT_PAYLOAD',issues:[],dispatch_allowed:false,
  payload:{title:options.title.trim(),content:preparation.assembly.html,status:'draft'},
  notes:['Payload only: no WordPress API call made','Preview and final WordPress rendering still require verification']};
}
module.exports={createGrowthWordPressDraftPayload};
