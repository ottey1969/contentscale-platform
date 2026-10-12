'use strict';
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
// Read-only authenticated endpoint exposing actual deployment blockers.
// It does not create WordPress identity mappings or accept content for publishing.
function registerGrowthWordPressPreflightRoute({app,pool,verifyEngineAccess}={}){
 if(typeof app?.get!=='function'||typeof pool?.query!=='function'||typeof verifyEngineAccess!=='function')
  throw Error('GROWTH_ROUTE_DEPENDENCIES_REQUIRED');
 app.get('/api/growth/wordpress/preflight/:clientId/:pageId',verifyEngineAccess,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.status(403).json({success:false,issues:['ADMIN_REVIEW_REQUIRED']});
  try {
   const pageId=Number(req.params.pageId),clientId=Number(req.params.clientId);
   const canonical=await loadGrowthTrackerEvidence(pool,{pageId,clientId});
   const url=canonical.page.url;
   const [matches,profile,mapping]=await Promise.all([
    pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[url]),
    pool.query('SELECT id,wp_url,(length(coalesce(wp_user,\'\'))>0 AND length(coalesce(wp_app_password,\'\'))>0) AS has_credentials FROM content_profiles WHERE id=$1 LIMIT 1',[canonical.page.profile_id]),
    pool.query('SELECT wordpress_post_id,wordpress_url,wordpress_modified_gmt FROM growth_wordpress_page_mapping WHERE tracker_client_id=$1 AND tracker_page_id=$2 LIMIT 1',[clientId,pageId])
   ]);
   const candidates=matches.rows||[],profileRow=profile.rows?.[0],mapped=mapping.rows?.[0];
   const issues=[];
   if(canonical.page.case_study_active)issues.push('CASE_STUDY_LOCK');
   if(candidates.length!==1||Number(candidates[0].id)!==pageId||Number(candidates[0].tracker_client_id)!==clientId)
    issues.push('DUPLICATE_TRACKER_URL_REVIEW_REQUIRED');
   if(!profileRow?.has_credentials)issues.push('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED');
   else {
    try {if(new URL(profileRow.wp_url).origin!==new URL(url).origin)issues.push('WORDPRESS_PROFILE_DOMAIN_MISMATCH');}
    catch {issues.push('WORDPRESS_PROFILE_URL_INVALID');}
   }
   if(!mapped)issues.push('REVIEWED_WORDPRESS_MAPPING_REQUIRED');
   else if(mapped.wordpress_url!==url)issues.push('REVIEWED_WORDPRESS_MAPPING_CONFLICT');
   return res.json({success:issues.length===0,status:issues.length?'BLOCKED':'READY_FOR_WORDPRESS_REVISION_RECHECK',
    issues,tracker:{page_id:pageId,client_id:clientId,url},wordpress:mapped?{post_id:Number(mapped.wordpress_post_id),modified_gmt:mapped.wordpress_modified_gmt}:null,
    publication_allowed:false,draft_write_allowed:false});
  }catch{return res.status(409).json({success:false,status:'BLOCKED',issues:['CANONICAL_PREFLIGHT_FAILED']});}
 });
}
module.exports={registerGrowthWordPressPreflightRoute};
