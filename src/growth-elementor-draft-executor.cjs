'use strict';
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
// Never edits the published Elementor source. Must be backed by a *verified*
// Elementor-capable WordPress bridge that can write and reread draft metadata.
// WP REST content alone cannot safely preserve an Elementor page design.
async function executeGrowthElementorDraft({
  approvedCandidate,sourcePostId,sourcePostType,sourceRevisionVerified=false,
  originalCaseStudyUnlocked=false,createDraft,writeDraftElementorMeta,readDraft
}={}){
 const deny=code=>({status:'BLOCKED',issues:[code],published:false,draft:null});
 if(approvedCandidate?.status!=='DRAFT_FOR_REVIEW'||approvedCandidate.publish_allowed!==false||
  typeof approvedCandidate.elementor_json!=='string'||!approvedCandidate.changed_widgets?.length)
  return deny('APPROVED_ELEMENTOR_CANDIDATE_REQUIRED');
 if(!Number.isSafeInteger(sourcePostId)||sourcePostId<=0||!['pages','posts'].includes(sourcePostType)||
  sourceRevisionVerified!==true||originalCaseStudyUnlocked!==true)
  return deny('SOURCE_IDENTITY_AND_CASE_STUDY_RECHECK_REQUIRED');
 if(typeof createDraft!=='function'||typeof writeDraftElementorMeta!=='function'||typeof readDraft!=='function')
  return deny('ELEMENTOR_DRAFT_META_BRIDGE_REQUIRED');
 let created;
 try{created=await createDraft({type:sourcePostType,status:'draft'});}
 catch{return deny('WORDPRESS_DRAFT_CREATE_FAILED');}
 if(!Number.isSafeInteger(created?.id)||created.id<=0||created.id===sourcePostId||created.status!=='draft')
  return deny('WORDPRESS_DRAFT_NOT_CONFIRMED');
 const identity={id:created.id,type:sourcePostType,status:'draft'};
 try{await writeDraftElementorMeta({...identity,elementor_data:approvedCandidate.elementor_json,
    elementor_edit_mode:'builder'});}
 catch{return {status:'BLOCKED',issues:['ELEMENTOR_META_WRITE_FAILED'],published:false,
  draft:{id:created.id,status:'draft',needs_cleanup_review:true}};}
 let current;
 try{current=await readDraft(identity);}
 catch{return {status:'BLOCKED',issues:['ELEMENTOR_META_READBACK_FAILED'],published:false,
  draft:{id:created.id,status:'draft',needs_cleanup_review:true}};}
 if(current?.id!==created.id||current?.status!=='draft'||current?.type!==sourcePostType||
  current.elementor_edit_mode!=='builder'||typeof current.elementor_data!=='string'||
  sha(current.elementor_data)!==approvedCandidate.candidate_sha256)
  return {status:'BLOCKED',issues:['ELEMENTOR_META_OR_STATUS_MISMATCH'],published:false,
   draft:{id:created.id,status:'draft',needs_cleanup_review:true}};
 return {status:'ELEMENTOR_DRAFT_VERIFIED',issues:[],published:false,
  draft:{id:created.id,status:'draft',type:sourcePostType,source_post_id:sourcePostId,
   elementor_sha256:approvedCandidate.candidate_sha256}};
}
module.exports={executeGrowthElementorDraft};
