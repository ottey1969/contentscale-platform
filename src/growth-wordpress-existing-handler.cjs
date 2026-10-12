'use strict';
// Exact formatting convention found in the canonical /api/content/rewrites/:id/publish-wp
// handler in src/index.js. No network access and no DB writes.
function toExistingWordPressDraftRequest(handoff={}){
 const issues=[];
 if(handoff.status!=='SAFE_TO_PASS_TO_EXISTING_DRAFT_HANDLER'||handoff.publication_allowed!==false||handoff.write_boundary_revalidation_required!==true)
  issues.push('REVIEWED_HANDOFF_REQUIRED');
 if(!handoff.source_precondition?.sha256||!handoff.source_precondition?.url)
  issues.push('SOURCE_PRECONDITION_REQUIRED');
 const p=handoff.payload;
 if(!p||p.status!=='draft'||typeof p.title!=='string'||!p.title.trim()||typeof p.content!=='string'||!p.content.trim())
  issues.push('WORDPRESS_DRAFT_CONTENT_REQUIRED');
 if(issues.length)return {status:'BLOCKED',issues,request:null};
 return {status:'OFFLINE_REQUEST_ONLY',issues:[],request:{
  title:p.title.trim(),status:'draft',
  content:'<!-- wp:html -->\n'+p.content.trim()+'\n<!-- /wp:html -->'},
  source_precondition:handoff.source_precondition,
  existing_handler_routes:['/api/content/articles/:id/publish-wp','/api/content/rewrites/:id/publish-wp'],
  handler_caveat:'Existing endpoints load saved content_articles/content_rewrites rows, not this payload. Integration is not complete.',
  expected_internal_status:'draft',
  dispatch_allowed:false};
}
module.exports={toExistingWordPressDraftRequest};
