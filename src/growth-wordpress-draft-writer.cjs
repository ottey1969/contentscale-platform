'use strict';
// Create a new editorial draft, never PUT/PATCH an existing published page.
// Caller supplies approved handoff; server independently rechecks identity,
// content revision, authorization, and active Case Study state.
const {compareWordPressRevision}=require('./growth-wordpress-revision.cjs');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
async function createGuardedGrowthDraft({db,pageId,clientId,approvedHandoff,readOriginalPost,createDraft,authorization}={}){
 const blocked=(issue)=>({status:'BLOCKED',issues:[issue],draft:null});
 if(authorization!==true||!approvedHandoff||approvedHandoff.status!=='OFFLINE_REQUEST_ONLY'||
  approvedHandoff.dispatch_allowed!==false||approvedHandoff.request?.status!=='draft'||
  !Number.isSafeInteger(approvedHandoff.wordpress_source?.post_id))
  return blocked('EDITOR_APPROVAL_AND_GUARDED_HANDOFF_REQUIRED');
 if(typeof readOriginalPost!=='function'||typeof createDraft!=='function')
  return blocked('WORDPRESS_IO_REQUIRED');
 let state;
 try {state=await loadGrowthTrackerEvidence(db,{pageId,clientId});}
 catch{return blocked('TRACKER_RECHECK_FAILED');}
 if(state.page.case_study_active)return blocked('CASE_STUDY_LOCK');
 if(state.page.url!==approvedHandoff.source_precondition?.url)return blocked('TRACKER_URL_CHANGED');
 const {verifyGrowthWritePrecondition}=require('./growth-wordpress-handoff.cjs');
 const proof=verifyGrowthWritePrecondition({source_precondition:approvedHandoff.source_precondition,
  currentHtml:state.page.html_content,currentUrl:state.page.url});
 if(!proof.valid)return blocked('TRACKER_SOURCE_CHANGED');
 let original;
 try {original=await readOriginalPost({postId:approvedHandoff.wordpress_source.post_id,url:state.page.url});}
 catch{return blocked('WORDPRESS_FRESH_READ_FAILED');}
 const expected=approvedHandoff.wordpress_revision;
 const revision=compareWordPressRevision(expected,original);
 if(!revision.valid)return {status:'BLOCKED',issues:revision.issues,draft:null};
 if(original.status!=='publish')return blocked('ORIGINAL_IS_NOT_PUBLISHED');
 // WP REST create only. Prevent callers supplying an update path or publish status.
 const request={title:approvedHandoff.request.title,status:'draft',content:approvedHandoff.request.content};
 if(!request.title?.trim()||!request.content?.trim())return blocked('EMPTY_DRAFT');
 // Second canonical read protects changes during WP fetch.
 let final;
 try {final=await loadGrowthTrackerEvidence(db,{pageId,clientId});}
 catch{return blocked('FINAL_TRACKER_READ_FAILED');}
 if(final.page.case_study_active)return blocked('CASE_STUDY_LOCK');
 const recheck=verifyGrowthWritePrecondition({source_precondition:approvedHandoff.source_precondition,
  currentHtml:final.page.html_content,currentUrl:final.page.url});
 if(!recheck.valid)return blocked('TRACKER_SOURCE_CHANGED');
 // No automatic retry: ambiguous WP creates may succeed despite a network error.
 let written;
 try {written=await createDraft(request);}
 catch{return blocked('WORDPRESS_DRAFT_WRITE_UNCONFIRMED');}
 if(!written||!Number.isSafeInteger(written.id)||written.id<=0||written.status!=='draft')
  return blocked('WORDPRESS_DRAFT_CONFIRMATION_FAILED');
 return {status:'DRAFT_CREATED',issues:[],draft:{id:written.id,status:written.status,link:written.link||null}};
}
module.exports={createGuardedGrowthDraft};
