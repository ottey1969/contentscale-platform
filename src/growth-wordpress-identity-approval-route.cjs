'use strict';
const {createHash}=require('node:crypto');
const {createGrowthWordPressEditReader}=require('./growth-wordpress-edit-reader.cjs');
const {fingerprintWordPressRevision}=require('./growth-wordpress-revision.cjs');
const sha256=html=>createHash('sha256').update(html).digest('hex');
function registerGrowthWordPressApprovalRoute({app,pool,verifyGrowthAdmin,fetchImpl=globalThis.fetch}={}){
 if(typeof app?.post!=='function'||typeof pool?.connect!=='function'||typeof pool.query!=='function'||
  typeof verifyGrowthAdmin!=='function')throw Error('GROWTH_APPROVAL_DEPENDENCIES_REQUIRED');
 app.post('/api/growth/wordpress/mapping/:clientId/:pageId/approve',verifyGrowthAdmin,async(req,res)=>{
  const deny=(code,issue)=>res.status(code).json({success:false,status:'BLOCKED',issues:[issue],publication_allowed:false});
  if(req.engineUser?.isAdmin!==true||!Number.isSafeInteger(req.engineUser.adminId)||req.engineUser.adminId<=0)
   return deny(403,'VERIFIED_ADMIN_REQUIRED');
  const clientId=Number(req.params.clientId),pageId=Number(req.params.pageId),
   postId=Number(req.body?.wordpress_post_id),expectedSourceHash=req.body?.expected_source_sha256,
   expectedModified=req.body?.expected_modified_gmt;
  if(![clientId,pageId,postId].every(n=>Number.isSafeInteger(n)&&n>0)||
   typeof expectedSourceHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedSourceHash)||
   typeof expectedModified!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(expectedModified)||
   req.body?.confirm_identity_reviewed!==true)return deny(400,'EXPLICIT_CANONICAL_REVIEW_REQUIRED');
  let page,profile;
  try {
   const found=await pool.query(
    'SELECT p.id,p.tracker_client_id,p.profile_id,p.url,p.html_content,cp.wp_url,cp.wp_user,cp.wp_app_password FROM tracker_pages p JOIN content_profiles cp ON cp.id=p.profile_id WHERE p.id=$1 AND p.tracker_client_id=$2 LIMIT 1',
    [pageId,clientId]);
   page=found.rows?.[0];
   if(!page||typeof page.html_content!=='string'||sha256(page.html_content)!==expectedSourceHash)
    return deny(409,'TRACKER_SOURCE_CHANGED_OR_NOT_FOUND');
   if(!page.wp_url||!page.wp_user||!page.wp_app_password)return deny(409,'WORDPRESS_PROFILE_CREDENTIALS_REQUIRED');
   if(new URL(page.wp_url).origin!==new URL(page.url).origin)return deny(409,'WORDPRESS_PROFILE_DOMAIN_MISMATCH');
  }catch{return deny(409,'CANONICAL_PROFILE_CHECK_FAILED');}
  let latest,wpRevision;
  try {
   const read=createGrowthWordPressEditReader({siteUrl:new URL(page.wp_url).origin+'/',
    username:page.wp_user,applicationPassword:page.wp_app_password,fetchImpl});
   latest=await read({postId,url:page.url});
   wpRevision=fingerprintWordPressRevision(latest,page.url);
   if(!wpRevision.valid||wpRevision.modified_gmt!==expectedModified)
    return deny(409,'WORDPRESS_REVISION_CHANGED_OR_UNVERIFIED');
  }catch{return deny(409,'AUTHENTICATED_WORDPRESS_SOURCE_CHECK_FAILED');}
  let db;
  try {
   db=await pool.connect();
   await db.query('BEGIN');
   const locked=await db.query(
    'SELECT id,tracker_client_id,url,html_content FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2 FOR UPDATE',
    [pageId,clientId]);
   const current=locked.rows?.[0];
   if(!current||current.url!==page.url||sha256(current.html_content||'')!==expectedSourceHash)
    throw Error('TRACKER_SOURCE_CHANGED');
   const [active,duplicates]=await Promise.all([
    db.query("SELECT id FROM tracker_case_studies WHERE tracker_page_id=$1 AND tracker_client_id=$2 AND status='active' LIMIT 1",[pageId,clientId]),
    db.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 2',[page.url])
   ]);
   if(active.rows?.length)throw Error('CASE_STUDY_LOCK');
   if(duplicates.rows?.length!==1||Number(duplicates.rows[0].id)!==pageId||
     Number(duplicates.rows[0].tracker_client_id)!==clientId)throw Error('DUPLICATE_TRACKER_URL');
   const inserted=await db.query(
    'INSERT INTO growth_wordpress_page_mapping (tracker_client_id,tracker_page_id,wordpress_post_id,wordpress_url,wordpress_modified_gmt,wordpress_raw_sha256,source_sha256,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id',
    [clientId,pageId,postId,page.url,expectedModified,wpRevision.raw_sha256,expectedSourceHash,'admin:'+req.engineUser.adminId]);
   if(inserted.rows?.length!==1)throw Error('MAPPING_ALREADY_EXISTS_OR_CONFLICT');
   await db.query('COMMIT');
   return res.json({success:true,status:'MAPPING_REVIEWED',tracker_page_id:pageId,
    wordpress_post_id:postId,publication_allowed:false,draft_write_allowed:false});
  }catch(error){
   if(db)try{await db.query('ROLLBACK')}catch{}
   return deny(409,['TRACKER_SOURCE_CHANGED','CASE_STUDY_LOCK','DUPLICATE_TRACKER_URL',
    'MAPPING_ALREADY_EXISTS_OR_CONFLICT'].includes(error.message)?error.message:'MAPPING_SAVE_FAILED');
  }finally{if(db)db.release();}
 });
}
module.exports={registerGrowthWordPressApprovalRoute};
