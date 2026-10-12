'use strict';
// Offline adapter only. No WordPress write, dispatch or publish.
const {prepareGrowthWordPressHandoff}=require('./growth-wordpress-preparation.cjs');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {toExistingWordPressDraftRequest}=require('./growth-wordpress-existing-handler.cjs');
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
 if(!live||live.url!==latest.page.url||typeof live.html!=='string'||!live.html.trim())
  return {status:'BLOCKED',stage:'WORDPRESS_SOURCE_FRESHNESS',issues:['FRESH_WORDPRESS_RESPONSE_INVALID'],request:null,dispatch_allowed:false};
 const checked=toExistingWordPressDraftRequest(handoff,{
  authorized:input.authorized===true,
  currentHtml:live.html,
  currentUrl:latest.page.url,
  caseStudyLocked:latest.page.case_study_active
 });
 return {...checked,stage:'OFFLINE_WORDPRESS_REQUEST',
  note:'Not a write transaction. WP target revision and authorization must be reverified at actual write boundary.',
  publication_allowed:false,dispatch_allowed:false};
}
module.exports={prepareVerifiedGrowthWordPressRequest};
