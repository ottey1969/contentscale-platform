'use strict';
// Creates a NEW, unpublished WordPress draft only. Never updates or overwrites
// the published source post. Caller must supply authorized authenticated reader
// and creator; this module has no route registration or automatic execution.
const {fingerprintWordPressRevision,compareWordPressRevision}=require('./growth-wordpress-revision.cjs');
async function executeGrowthWordPressDraft(input={}){
 const deny=(issue)=>({status:'BLOCKED',issues:[issue],draft:null,published:false});
 if(input.authorized!==true||input.editor_approved!==true)return deny('EDITOR_AUTHORIZATION_REQUIRED');
 const gate=input.offlineRequest;
 if(gate?.status!=='OFFLINE_REQUEST_ONLY'||gate.dispatch_allowed!==false||gate.publication_allowed!==false||
  gate.request?.status!=='draft'||typeof gate.request?.content!=='string'||!gate.request.content.trim()||
  typeof gate.request?.title!=='string'||!gate.request.title.trim())return deny('VERIFIED_OFFLINE_DRAFT_REQUIRED');
 const expected=gate.wordpress_revision;
 if(!expected?.valid||!Number.isSafeInteger(expected.post_id)||!expected.url||!expected.raw_sha256)
  return deny('WORDPRESS_SOURCE_REVISION_REQUIRED');
 if(typeof input.readWordPressPost!=='function'||typeof input.createWordPressDraft!=='function'||
  typeof input.checkCanonicalState!=='function')return deny('AUTHENTICATED_READ_WRITE_AND_CANONICAL_CHECK_REQUIRED');
 // This is not an atomic CAS; final checks reduce races, not eliminate them.
 let latest;
 try {latest=await input.readWordPressPost({postId:expected.post_id,url:expected.url});}
 catch {return deny('FRESH_WORDPRESS_READ_FAILED');}
 const revision=compareWordPressRevision(expected,latest);
 if(!revision.valid)return {status:'BLOCKED',issues:revision.issues,draft:null,published:false};
 let canonical;
 try {canonical=await input.checkCanonicalState();}
 catch {return deny('CANONICAL_STATE_CHECK_FAILED');}
 if(canonical?.case_study_active!==false||canonical.url!==expected.url||
  canonical.source_sha256!==gate.source_precondition?.sha256||
  canonical.allowed_to_draft!==true)return deny('CANONICAL_STATE_CHANGED_OR_NOT_AUTHORIZED');
 if(input.dryRun!==false)return {status:'DRY_RUN_VALIDATED',issues:[],draft:null,published:false};
 let created;
 try {created=await input.createWordPressDraft({
  status:'draft',title:gate.request.title,content:gate.request.content
 });}
 catch {return deny('WORDPRESS_DRAFT_CREATE_FAILED');}
 if(!Number.isSafeInteger(created?.id)||created.id<=0||created.status!=='draft'||
  created.id===expected.post_id)return deny('WORDPRESS_DRAFT_RESPONSE_NOT_VERIFIED');
 return {status:'DRAFT_CREATED',issues:[],draft:{id:created.id,status:created.status,link:created.link||null},published:false};
}
module.exports={executeGrowthWordPressDraft};
