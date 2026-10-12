'use strict';
const {createHash}=require('node:crypto');
// Pure handoff guard: no WP request. The existing WordPress flow must supply
// its current source content and authorization at the actual write boundary.
function growthWordPressHandoff({draftPayload,originalHtml,currentHtml,authorized=false,sourcePageUrl,expectedPageUrl}={}){
 const issues=[];
 if(draftPayload?.status!=='OFFLINE_WORDPRESS_DRAFT_PAYLOAD'||draftPayload.dispatch_allowed!==false||draftPayload.payload?.status!=='draft')
  issues.push('DRAFT_ONLY_PAYLOAD_REQUIRED');
 if(authorized!==true)issues.push('WRITE_AUTHORIZATION_REQUIRED');
 if(typeof originalHtml!=='string'||!originalHtml.trim()||typeof currentHtml!=='string'||!currentHtml.trim())
  issues.push('SOURCE_HTML_REQUIRED');
 else if(createHash('sha256').update(originalHtml).digest('hex')!==createHash('sha256').update(currentHtml).digest('hex'))
  issues.push('SOURCE_CHANGED_REVIEW_AGAIN');
 if(!sourcePageUrl||sourcePageUrl!==expectedPageUrl)issues.push('PAGE_IDENTITY_MISMATCH');
 const sourceHash=issues.length?null:createHash('sha256').update(originalHtml).digest('hex');
 return {status:issues.length?'BLOCKED':'SAFE_TO_PASS_TO_EXISTING_DRAFT_HANDLER',
  issues,payload:issues.length?null:{...draftPayload.payload,status:'draft'},
  source_precondition:issues.length?null:{url:sourcePageUrl,sha256:sourceHash},
  write_boundary_revalidation_required:true,publication_allowed:false};
}
// Must be called with fresh source HTML by the real draft writer, immediately before its write.
function verifyGrowthWritePrecondition({source_precondition,currentHtml,currentUrl}={}){
 const issues=[];
 if(!source_precondition||typeof source_precondition.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source_precondition.sha256))issues.push('SOURCE_PRECONDITION_MISSING');
 if(typeof currentHtml!=='string'||!currentHtml.trim())issues.push('CURRENT_SOURCE_MISSING');
 if(!source_precondition?.url||currentUrl!==source_precondition.url)issues.push('PAGE_IDENTITY_MISMATCH');
 if(!issues.length&&createHash('sha256').update(currentHtml).digest('hex')!==source_precondition.sha256)
  issues.push('SOURCE_CHANGED_REVIEW_AGAIN');
 return {valid:issues.length===0,issues};
}
module.exports={growthWordPressHandoff,verifyGrowthWritePrecondition};
