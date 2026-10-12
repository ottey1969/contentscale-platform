'use strict';
const {createHash}=require('node:crypto');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {createGrowthWordPressCandidateReader}=require('./growth-wordpress-candidate-reader.cjs');
// Live, admin-only candidate discovery. No WP writes and no DB mutations.
function registerGrowthWordPressPreflightRoute({app,pool,verifyEngineAccess,fetchImpl=globalThis.fetch}={}){
 if(typeof app?.get!=='function'||typeof pool?.query!=='function'||typeof verifyEngineAccess!=='function')
  throw Error('GROWTH_ROUTE_DEPENDENCIES_REQUIRED');
 app.get('/api/growth/wordpress/preflight/:clientId/:pageId',verifyEngineAccess,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.status(403).json({success:false,issues:['ADMIN_REVIEW_REQUIRED']});
  try {
   const pageId=Number(req.params.pageId),clientId=Number(req.params.clientId);
   const canonical=await loadGrowthTrackerEvidence(pool,{pageId,clientId});
   const url=canonical.page.url;
   const sourceHash=createHash('sha256').update(canonical.page.html_content||'').digest('hex');
   const [matches,profile,mapping]=await Promise.all([
    pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[url]),
    pool.query("SELECT id,wp_url,wp_user,wp_app_password,(length(coalesce(wp_user,''))>0 AND length(coalesce(wp_app_password,''))>0) AS has_credentials FROM content_profiles WHERE id=$1 LIMIT 1",[canonical.page.profile_id]),
    pool.query('SELECT wordpress_post_id,wordpress_url,wordpress_modified_gmt,wordpress_raw_sha256,source_sha256 FROM growth_wordpress_page_mapping WHERE tracker_client_id=$1 AND tracker_page_id=$2 LIMIT 1',[clientId,pageId])
   ]);
   const records=matches.rows||[],profileRow=profile.rows?.[0],mapped=mapping.rows?.[0],issues=[];
   if(canonical.page.case_study_active)issues.push('CASE_STUDY_LOCK');
   if(records.length!==1||Number(records[0].id)!==pageId||Number(records[0].tracker_client_id)!==clientId)
    issues.push('DUPLICATE_TRACKER_URL_REVIEW_REQUIRED');
   if(!profileRow?.has_credentials)issues.push('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED');
   else {
    try {if(new URL(profileRow.wp_url).origin!==new URL(url).origin)issues.push('WORDPRESS_PROFILE_DOMAIN_MISMATCH');}
    catch {issues.push('WORDPRESS_PROFILE_URL_INVALID');}
   }
   let candidate=null;
   if(issues.length===0){
    try {
     const read=createGrowthWordPressCandidateReader({siteUrl:profileRow.wp_url,
      username:profileRow.wp_user,applicationPassword:profileRow.wp_app_password,fetchImpl});
     candidate=await read({url});
    }catch(error){issues.push(error.message||'WORDPRESS_CANDIDATE_READ_FAILED');}
   }
   if(!mapped)issues.push('REVIEWED_WORDPRESS_MAPPING_REQUIRED');
   else {
    if(mapped.wordpress_url!==url)issues.push('REVIEWED_WORDPRESS_MAPPING_CONFLICT');
    if(mapped.source_sha256!==sourceHash)issues.push('TRACKER_SOURCE_CHANGED_REVIEW_REQUIRED');
    if(candidate&&Number(mapped.wordpress_post_id)!==candidate.post_id)issues.push('REVIEWED_WORDPRESS_POST_ID_CONFLICT');
    if(candidate&&mapped.wordpress_raw_sha256&&mapped.wordpress_raw_sha256!==candidate.raw_sha256)
     issues.push('WORDPRESS_REVISION_CHANGED_REVIEW_REQUIRED');
   }
   const nextAction=issues.includes('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED')?'CONFIGURE_WORDPRESS_PROFILE':
    issues.length===1&&issues[0]==='REVIEWED_WORDPRESS_MAPPING_REQUIRED'&&candidate?'APPROVE_VERIFIED_WORDPRESS_MAPPING':
    issues.length===0?'REVIEW_GROWTH_DRAFT':'RESOLVE_VERIFICATION_ISSUES';
   return res.json({success:issues.length===0,status:nextAction==='APPROVE_VERIFIED_WORDPRESS_MAPPING'?'REVIEW_REQUIRED':issues.length?'BLOCKED':'READY_FOR_GROWTH_DRAFT_REVIEW',
    issues,next_action:nextAction,tracker:{page_id:pageId,client_id:clientId,url,source_sha256:sourceHash},
    wordpress:mapped?{post_id:Number(mapped.wordpress_post_id),modified_gmt:mapped.wordpress_modified_gmt}:null,
    candidate:candidate?{post_id:candidate.post_id,modified_gmt:candidate.modified_gmt,status:candidate.status,raw_sha256:candidate.raw_sha256}:null,
    publication_allowed:false,draft_write_allowed:false});
  }catch{return res.status(409).json({success:false,status:'BLOCKED',issues:['CANONICAL_PREFLIGHT_FAILED']});}
 });
}
module.exports={registerGrowthWordPressPreflightRoute};
