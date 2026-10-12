'use strict';
// Read-only resolver for the existing content_articles WordPress mapping.
// Never infer an ID from slugs, title, WordPress search or an unmatched URL.
// A verified exact URL and unambiguous DB mapping are prerequisites.
async function resolveGrowthWordPressPostId({db,url}={}){
 if(!db||typeof db.query!=='function')throw new Error('DATABASE_CLIENT_REQUIRED');
 if(typeof url!=='string'||!/^https:\/\/[^\s]+\/$/.test(url))throw new Error('CANONICAL_URL_REQUIRED');
 const result=await db.query(
  "SELECT DISTINCT wp_post_id FROM content_articles WHERE wp_url=$1 AND wp_post_id IS NOT NULL AND is_active IS DISTINCT FROM FALSE LIMIT 2",
  [url]);
 const ids=(result.rows||[]).map(r=>Number(r.wp_post_id));
 if(ids.length!==1||!Number.isSafeInteger(ids[0])||ids[0]<=0)
  throw new Error(ids.length>1?'AMBIGUOUS_WORDPRESS_MAPPING':'CANONICAL_WORDPRESS_MAPPING_MISSING');
 return ids[0];
}
module.exports={resolveGrowthWordPressPostId};
