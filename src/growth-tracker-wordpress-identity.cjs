'use strict';
// Direct Tracker-to-WordPress candidate inspection. No content_articles dependency,
// DB mutations or WP writes. Requires an authenticated edit-context WordPress reader.
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {parseFreshWordPressPost}=require('./growth-wordpress-raw-source.cjs');
async function inspectTrackerWordPressIdentity({db,pageId,clientId,fetchWordPressCandidates}={}){
 let canonical;
 try {canonical=await loadGrowthTrackerEvidence(db,{pageId,clientId});}
 catch {return {status:'BLOCKED',issues:['TRACKER_CANONICAL_READ_FAILED'],candidate:null};}
 if(canonical.page.case_study_active)return {status:'BLOCKED',issues:['CASE_STUDY_LOCK'],candidate:null};
 if(typeof fetchWordPressCandidates!=='function')return {status:'BLOCKED',issues:['AUTHENTICATED_WORDPRESS_READER_REQUIRED'],candidate:null};
 let posts;
 try {posts=await fetchWordPressCandidates({url:canonical.page.url});}
 catch {return {status:'BLOCKED',issues:['WORDPRESS_READ_FAILED'],candidate:null};}
 if(!Array.isArray(posts)||posts.length!==1)
  return {status:'BLOCKED',issues:['UNIQUE_WORDPRESS_POST_REQUIRED'],candidate:null};
 const parsed=parseFreshWordPressPost(posts[0],canonical.page.url);
 if(!parsed.valid)return {status:'BLOCKED',issues:parsed.issues,candidate:null};
 // Recheck after external await. Prevent active Case Study and source revision races.
 let latest;
 try {latest=await loadGrowthTrackerEvidence(db,{pageId,clientId});}
 catch {return {status:'BLOCKED',issues:['TRACKER_FINAL_RECHECK_FAILED'],candidate:null};}
 if(latest.page.case_study_active)return {status:'BLOCKED',issues:['CASE_STUDY_LOCK'],candidate:null};
 if(latest.page.url!==canonical.page.url||latest.page.html_content!==canonical.page.html_content)
  return {status:'BLOCKED',issues:['TRACKER_SOURCE_CHANGED'],candidate:null};
 return {status:'REVIEW_REQUIRED',issues:[],candidate:{
  tracker_page_id:Number(pageId),tracker_client_id:Number(clientId),
  wordpress_post_id:parsed.post_id,url:parsed.url,modified_gmt:parsed.modified_gmt,
  wordpress_status:parsed.status},mapping_write_allowed:false,publication_allowed:false};
}
module.exports={inspectTrackerWordPressIdentity};
