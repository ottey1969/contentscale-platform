'use strict';
// Read-only candidate inspection; this cannot create or approve a mapping.
// Require the authenticated WordPress edit-context post object.
const {parseFreshWordPressPost}=require('./growth-wordpress-raw-source.cjs');
async function inspectGrowthWordPressMapping({db,url,fetchWordPressCandidates}={}){
 if(!db||typeof db.query!=='function')return {status:'BLOCKED',issues:['DATABASE_CLIENT_REQUIRED'],candidate:null};
 if(typeof url!=='string'||!url.startsWith('https://')||typeof fetchWordPressCandidates!=='function')
  return {status:'BLOCKED',issues:['CANONICAL_URL_AND_WORDPRESS_READER_REQUIRED'],candidate:null};
 let rows;
 try {
  const result=await db.query('SELECT id,wp_post_id,wp_url FROM content_articles WHERE wp_url=$1 AND is_active IS DISTINCT FROM FALSE LIMIT 3',[url]);
  rows=result.rows||[];
 } catch {return {status:'BLOCKED',issues:['EXISTING_MAPPING_READ_FAILED'],candidate:null};}
 if(rows.length>1)return {status:'BLOCKED',issues:['AMBIGUOUS_CONTENT_ARTICLE_MAPPING'],candidate:null};
 if(rows.length===0)return {status:'BLOCKED',issues:['CONTENT_ARTICLE_RECORD_MISSING'],candidate:null};
 let posts;
 try {posts=await fetchWordPressCandidates({url});}
 catch {return {status:'BLOCKED',issues:['WORDPRESS_READ_FAILED'],candidate:null};}
 if(!Array.isArray(posts)||posts.length!==1)return {status:'BLOCKED',issues:['WORDPRESS_UNIQUE_CANDIDATE_REQUIRED'],candidate:null};
 const parsed=parseFreshWordPressPost(posts[0],url);
 if(!parsed.valid)return {status:'BLOCKED',issues:parsed.issues,candidate:null};
 const existing=rows[0].wp_post_id;
 if(existing!=null&&Number(existing)!==parsed.post_id)
  return {status:'BLOCKED',issues:['EXISTING_WORDPRESS_ID_CONFLICT'],candidate:null};
 return {status:'REVIEW_REQUIRED',issues:[],
  candidate:{content_article_id:rows[0].id,wordpress_post_id:parsed.post_id,url,modified_gmt:parsed.modified_gmt,wordpress_status:parsed.status},
  mapping_write_allowed:false,publication_allowed:false};
}
module.exports={inspectGrowthWordPressMapping};
