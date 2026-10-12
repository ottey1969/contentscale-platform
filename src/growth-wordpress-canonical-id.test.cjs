'use strict';
const assert=require('node:assert/strict');
const {resolveGrowthWordPressPostId}=require('./growth-wordpress-canonical-id.cjs');
const url='https://contentscale.site/example/';
function db({reviewed=[],legacy=[],missingTable=false}={}){
 return {query:async(sql,args)=>{
  if(sql.includes('FROM growth_wordpress_page_mapping')){
   assert.deepEqual(args,[7,2]);
   if(missingTable){const e=Error('relation missing');e.code='42P01';throw e;}
   return {rows:reviewed};
  }
  assert.match(sql,/FROM content_articles/);assert.deepEqual(args,[url]);
  return {rows:legacy};
 }};
}
const check=(database,options={})=>resolveGrowthWordPressPostId({db:database,url,pageId:7,clientId:2,...options});
(async()=>{
 assert.equal(await check(db({reviewed:[{wordpress_post_id:51,wordpress_url:url}]})),51);
 assert.equal(await check(db({legacy:[{wp_post_id:42}],missingTable:true})),42);
 assert.equal(await check(db({legacy:[{wp_post_id:42}]})),42);
 await assert.rejects(check(db()),/CANONICAL_WORDPRESS_MAPPING_MISSING/);
 await assert.rejects(check(db({reviewed:[{wordpress_post_id:51,wordpress_url:'https://other.test/'}]})),/REVIEWED_WORDPRESS_MAPPING_CONFLICT/);
 await assert.rejects(check(db({reviewed:[{wordpress_post_id:51,wordpress_url:url},{wordpress_post_id:52,wordpress_url:url}]})),/AMBIGUOUS_REVIEWED_WORDPRESS_MAPPING/);
 await assert.rejects(check(db({legacy:[{wp_post_id:42},{wp_post_id:43}]})),/AMBIGUOUS_WORDPRESS_MAPPING/);
 await assert.rejects(check(db(),{pageId:undefined}),/TRACKER_IDENTITY_REQUIRED/);
 await assert.rejects(check(db(),{url:'https://other.test/page?x=1'}),/CANONICAL_URL_REQUIRED/);
 const denied=db();denied.query=async()=>{const e=Error('permission denied');e.code='42501';throw e;};
 await assert.rejects(check(denied),/permission denied/);
 console.log('PASS: reviewed mapping priority, safe pre-migration fallback and fail-closed conflicts');
})().catch(e=>{console.error(e);process.exitCode=1});
