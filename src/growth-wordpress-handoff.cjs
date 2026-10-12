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
 return {status:issues.length?'BLOCKED':'SAFE_TO_PASS_TO_EXISTING_DRAFT_HANDLER',
  issues,payload:issues.length?null:{...draftPayload.payload,status:'draft'},publication_allowed:false};
}
module.exports={growthWordPressHandoff};
