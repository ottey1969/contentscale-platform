'use strict';
// Store a human-reviewed mapping atomically. This does not publish or create drafts.
// A fresh authenticated WP response + explicit approval is mandatory.
const {createHash}=require('node:crypto');
const {parseFreshWordPressPost}=require('./growth-wordpress-raw-source.cjs');
async function approveGrowthWordPressMapping({db,pageId,clientId,reviewedBy,approved,readWordPressPost,postId}={}){
 const blocked=(reason)=>({status:'BLOCKED',issues:[reason],mapping:null});
 if(approved!==true||typeof reviewedBy!=='string'||!reviewedBy.trim())
  return blocked('EXPLICIT_REVIEWER_APPROVAL_REQUIRED');
 if(!Number.isSafeInteger(pageId)||pageId<=0||!Number.isSafeInteger(clientId)||clientId<=0||
  !Number.isSafeInteger(postId)||postId<=0||typeof readWordPressPost!=='function'||
  !db||typeof db.connect!=='function')return blocked('CANONICAL_INPUT_REQUIRED');
 let client;
 try {client=await db.connect();} catch{return blocked('DATABASE_CONNECTION_FAILED');}
 let started=false;
 try {
  await client.query('BEGIN');started=true;
  const result=await client.query('SELECT id,tracker_client_id,url,html_content FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2 FOR UPDATE',[pageId,clientId]);
  if(result.rows.length!==1)throw Error('TRACKER_PAGE_NOT_FOUND');
  const page=result.rows[0];
  if(!page.url?.startsWith('https://')||!page.html_content)throw Error('TRACKER_SOURCE_MISSING');
  const duplicates=await client.query('SELECT id FROM tracker_pages WHERE url=$1 AND id<>$2 LIMIT 1',[page.url,pageId]);
  if(duplicates.rows.length)throw Error('DUPLICATE_TRACKER_URL_REVIEW_REQUIRED');
  const locked=await client.query("SELECT id FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[clientId,pageId]);
  if(locked.rows.length)throw Error('CASE_STUDY_LOCK');
  const wp=await readWordPressPost({postId,url:page.url});
  const checked=parseFreshWordPressPost(wp,page.url);
  if(!checked.valid||checked.post_id!==postId)throw Error('WORDPRESS_IDENTITY_NOT_VERIFIED');
  const existing=await client.query('SELECT wordpress_post_id,wordpress_url FROM growth_wordpress_page_mapping WHERE tracker_client_id=$1 AND tracker_page_id=$2 FOR UPDATE',[clientId,pageId]);
  if(existing.rows.length&&
   (Number(existing.rows[0].wordpress_post_id)!==postId||existing.rows[0].wordpress_url!==page.url))
   throw Error('EXISTING_MAPPING_CONFLICT');
  const sha=createHash('sha256').update(page.html_content).digest('hex');
  const write=await client.query(`INSERT INTO growth_wordpress_page_mapping
   (tracker_client_id,tracker_page_id,wordpress_post_id,wordpress_url,wordpress_modified_gmt,source_sha256,reviewed_by)
   VALUES ($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT (tracker_client_id,tracker_page_id) DO UPDATE SET
    wordpress_modified_gmt=EXCLUDED.wordpress_modified_gmt,
    source_sha256=EXCLUDED.source_sha256,
    reviewed_by=EXCLUDED.reviewed_by, reviewed_at=now()
   RETURNING id,tracker_client_id,tracker_page_id,wordpress_post_id,wordpress_url`,
   [clientId,pageId,postId,page.url,checked.modified_gmt,sha,reviewedBy.trim()]);
  await client.query('COMMIT');started=false;
  return {status:'MAPPING_REVIEWED',issues:[],mapping:write.rows[0],publication_allowed:false};
 } catch(error) {
  if(started)try{await client.query('ROLLBACK');}catch{}
  return blocked(['TRACKER_PAGE_NOT_FOUND','TRACKER_SOURCE_MISSING','DUPLICATE_TRACKER_URL_REVIEW_REQUIRED','CASE_STUDY_LOCK','WORDPRESS_IDENTITY_NOT_VERIFIED','EXISTING_MAPPING_CONFLICT'].includes(error.message)?error.message:'MAPPING_APPROVAL_FAILED');
 } finally {client.release();}
}
module.exports={approveGrowthWordPressMapping};
