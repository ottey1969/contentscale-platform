'use strict';
// Offline adapter only. No WordPress write, dispatch or publish.
const {prepareGrowthWordPressHandoff}=require('./growth-wordpress-preparation.cjs');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {toExistingWordPressDraftRequest}=require('./growth-wordpress-existing-handler.cjs');
const {verifyGrowthWritePrecondition}=require('./growth-wordpress-handoff.cjs');
const {parseFreshWordPressPost}=require('./growth-wordpress-raw-source.cjs');
const {resolveGrowthWordPressPostId}=require('./growth-wordpress-canonical-id.cjs');
async function prepareVerifiedGrowthWordPressRequest(input={}){
 const handoff=await prepareGrowthWordPressHandoff(input);
 if(handoff.status!=='SAFE_TO_PASS_TO_EXISTING_DRAFT_HANDLER')
  return {status:'BLOCKED',stage:handoff.stage||'GROWTH_HANDOFF',issues:handoff.issues||[],request:null,dispatch_allowed:false};
 // Check the canonical record again after editorial preparation; never trust caller-supplied case study state.
 const latest=await loadGrowthTrackerEvidence(input.db,{pageId:input.pageId,clientId:input.clientId});
 if(latest.page.case_study_active)return {status:'BLOCKED',stage:'CASE_STUDY',issues:['CASE_STUDY_LOCK'],request:null,dispatch_allowed:false};
 if(latest.page.url!==handoff.source_precondition?.url)return {status:'BLOCKED',stage:'PAGE_IDENTITY',issues:['PAGE_IDENTITY_MISMATCH'],request:null,dispatch_allowed:false};
 // The Tracker snapshot alone cannot prove that live WordPress still matches.
 // Require independently refreshed WordPress HTML at this handoff boundary.
 if(typeof input.fetchFreshWordPressHtml!=='function')
  return {status:'BLOCKED',stage:'WORDPRESS_SOURCE_FRESHNESS',issues:['FRESH_WORDPRESS_READER_REQUIRED'],request:null,dispatch_allowed:false};
 let live;
 try {live=await input.fetchFreshWordPressHtml({url:latest.page.url,pageId:input.pageId,clientId:input.clientId});}
 catch {return {status:'BLOCKED',stage:'WORDPRESS_SOURCE_FRESHNESS',issues:['FRESH_WORDPRESS_READ_FAILED'],request:null,dispatch_allowed:false};}
 const parsed=parseFreshWordPressPost(live,latest.page.url);
 if(!parsed.valid)
  return {status:'BLOCKED',stage:'WORDPRESS_SOURCE_FRESHNESS',issues:['FRESH_WORDPRESS_RESPONSE_INVALID'],request:null,dispatch_allowed:false};
 // The caller must resolve the WP post identity from a trusted canonical mapping.
 // URL equality alone is insufficient when content has been migrated/recreated.
 let mappedPostId;
 try {mappedPostId=await resolveGrowthWordPressPostId({db:input.db,url:latest.page.url,pageId:input.pageId,clientId:input.clientId});}
 catch {return {status:'BLOCKED',stage:'WORDPRESS_IDENTITY',issues:['CANONICAL_WORDPRESS_POST_ID_LOOKUP_FAILED'],request:null,dispatch_allowed:false};}
 if(!Number.isSafeInteger(mappedPostId)||mappedPostId<=0)
  return {status:'BLOCKED',stage:'WORDPRESS_IDENTITY',issues:['CANONICAL_WORDPRESS_POST_ID_REQUIRED'],request:null,dispatch_allowed:false};
 if(parsed.post_id!==mappedPostId)
  return {status:'BLOCKED',stage:'WORDPRESS_IDENTITY',issues:['WORDPRESS_POST_ID_MISMATCH'],request:null,dispatch_allowed:false};
 // A slow WP read can race with a Tracker update or a newly activated Case Study.
 // Re-read canonical state after the external await, then fail closed.
 let finalState;
 try {finalState=await loadGrowthTrackerEvidence(input.db,{pageId:input.pageId,clientId:input.clientId});}
 catch {return {status:'BLOCKED',stage:'FINAL_CANONICAL_RECHECK',issues:['CANONICAL_RECHECK_FAILED'],request:null,dispatch_allowed:false};}
 if(finalState.page.case_study_active)
  return {status:'BLOCKED',stage:'CASE_STUDY',issues:['CASE_STUDY_LOCK'],request:null,dispatch_allowed:false};
 if(finalState.page.url!==latest.page.url)
  return {status:'BLOCKED',stage:'FINAL_CANONICAL_RECHECK',issues:['PAGE_IDENTITY_MISMATCH'],request:null,dispatch_allowed:false};
 const finalProof=verifyGrowthWritePrecondition({source_precondition:handoff.source_precondition,
  currentHtml:finalState.page.html_content,currentUrl:finalState.page.url});
 if(!finalProof.valid)return {status:'BLOCKED',stage:'FINAL_CANONICAL_RECHECK',issues:finalProof.issues,request:null,dispatch_allowed:false};
 const checked=toExistingWordPressDraftRequest(handoff,{
  authorized:input.authorized===true,
  currentHtml:parsed.html,
  currentUrl:finalState.page.url,
  caseStudyLocked:finalState.page.case_study_active
 });
 return {...checked,stage:'OFFLINE_WORDPRESS_REQUEST',
  note:'Not a write transaction. WP target revision and authorization must be reverified at actual write boundary.',
  wordpress_source:{post_id:parsed.post_id,modified_gmt:parsed.modified_gmt,status:parsed.status},
  publication_allowed:false,dispatch_allowed:false};
}
module.exports={prepareVerifiedGrowthWordPressRequest};
