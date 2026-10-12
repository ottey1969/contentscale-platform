'use strict';
// Prefer the reviewed Tracker-to-WordPress mapping, preserving read-only legacy fallback
// until the additive migration is deployed. Never infer identity from URL alone.
async function resolveGrowthWordPressPostId({db,url,pageId,clientId}={}){
 if(!db||typeof db.query!=='function')throw new Error('DATABASE_CLIENT_REQUIRED');
 if(typeof url!=='string'||!/^https:\/\/[^\s]+\/$/.test(url))throw new Error('CANONICAL_URL_REQUIRED');
 const pid=Number(pageId),cid=Number(clientId);
 if(!Number.isSafeInteger(pid)||pid<=0||!Number.isSafeInteger(cid)||cid<=0)
  throw new Error('TRACKER_IDENTITY_REQUIRED');
 let reviewed=[];
 try {
  const result=await db.query(
   'SELECT m.wordpress_post_id,m.wordpress_url FROM growth_wordpress_page_mapping m JOIN tracker_pages p ON p.id=m.tracker_page_id AND p.tracker_client_id=m.tracker_client_id AND p.url=m.wordpress_url WHERE m.tracker_page_id=$1 AND m.tracker_client_id=$2 LIMIT 2',
   [pid,cid]);
  reviewed=result.rows||[];
 } catch(error) {
  if(error?.code!=='42P01')throw error; // only the known pre-migration missing-table case
 }
 if(reviewed.length>1)throw new Error('AMBIGUOUS_REVIEWED_WORDPRESS_MAPPING');
 if(reviewed.length===1) {
  const item=reviewed[0],id=Number(item.wordpress_post_id);
  if(item.wordpress_url!==url||!Number.isSafeInteger(id)||id<=0)
   throw new Error('REVIEWED_WORDPRESS_MAPPING_CONFLICT');
  return id;
 }
 const legacy=await db.query(
  "SELECT DISTINCT wp_post_id FROM content_articles WHERE wp_url=$1 AND wp_post_id IS NOT NULL AND is_active IS DISTINCT FROM FALSE LIMIT 2",
  [url]);
 const ids=(legacy.rows||[]).map(r=>Number(r.wp_post_id));
 if(ids.length!==1||!Number.isSafeInteger(ids[0])||ids[0]<=0)
  throw new Error(ids.length>1?'AMBIGUOUS_WORDPRESS_MAPPING':'CANONICAL_WORDPRESS_MAPPING_MISSING');
 return ids[0];
}
module.exports={resolveGrowthWordPressPostId};
