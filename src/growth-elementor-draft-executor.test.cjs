'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {executeGrowthElementorDraft}=require('./growth-elementor-draft-executor.cjs');
const {prepareGrowthElementorDraft}=require('./growth-elementor-draft.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const original=JSON.stringify([{id:'x',elType:'widget',widgetType:'html',settings:{html:'<article><h1>Roofing in Bergen County</h1><p>Current useful copy and a roof image.</p><img src="/roof.jpg"></article>'}}]);
const prepared=prepareGrowthElementorDraft({
 sourceJson:original,sourceSha256:hash(original),approved:true,
 edits:[{widget_id:'x',before:'Current useful copy and a roof image.',after:'Current useful copy and a roof image. Please call to discuss roof repair and inspection availability.',approved:true,evidence_ref:'research:1'}]
});
assert.equal(prepared.status,'DRAFT_FOR_REVIEW');
(async()=>{
 let draftMeta='',createdCount=0;
 const opts={approvedCandidate:prepared,sourcePostId:3269,sourcePostType:'pages',
  readOriginalPost:async()=>({id:3269,type:'pages',status:'publish',elementor_data:original}),
  checkCanonicalState:async()=>({wordpress_post_id:3269,case_study_active:false,allow_draft:true}),
  createDraft:async req=>{createdCount++;assert.equal(req.status,'draft');assert.equal(req.type,'pages');return{id:6001,status:'draft'};},
  writeDraftElementorMeta:async req=>{assert.equal(req.id,6001);draftMeta=req.elementor_data;},
  readDraft:async req=>({id:req.id,status:'draft',type:'pages',elementor_edit_mode:'builder',elementor_data:draftMeta})
 };
 let result=await executeGrowthElementorDraft(opts);
 assert.equal(result.status,'ELEMENTOR_DRAFT_VERIFIED',JSON.stringify(result.issues));
 assert.equal(result.published,false);
 assert.equal(result.draft.source_post_id,3269);
 assert.equal(createdCount,1);
 result=await executeGrowthElementorDraft({...opts,readOriginalPost:async()=>({id:3269,type:'pages',status:'publish',elementor_data:'[]'})});
 assert.equal(result.status,'BLOCKED');assert.equal(createdCount,1);
 result=await executeGrowthElementorDraft({...opts,checkCanonicalState:async()=>({wordpress_post_id:3269,case_study_active:true,allow_draft:true})});
 assert.equal(result.status,'BLOCKED');assert.equal(createdCount,1);
 result=await executeGrowthElementorDraft({...opts,writeDraftElementorMeta:undefined});
 assert.equal(result.status,'BLOCKED');assert.equal(createdCount,1);
 result=await executeGrowthElementorDraft({...opts,readDraft:async req=>({id:req.id,status:'publish',type:'pages',elementor_edit_mode:'builder',elementor_data:draftMeta})});
 assert.equal(result.status,'BLOCKED');assert(result.issues.includes('ELEMENTOR_META_OR_STATUS_MISMATCH'));
 result=await executeGrowthElementorDraft({...opts,readDraft:async req=>({id:req.id,status:'draft',type:'pages',elementor_edit_mode:'builder',elementor_data:'[]'})});
 assert.equal(result.status,'BLOCKED');assert(result.issues.includes('ELEMENTOR_META_OR_STATUS_MISMATCH'));
 console.log('PASS: Elementor unpublished draft roundtrip, metadata hash, no original overwrite, and fail-closed bridge errors');
})().catch(e=>{console.error(e);process.exitCode=1});
