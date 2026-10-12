'use strict';
const assert=require('node:assert/strict');
const {resolveGrowthWordPressPostId}=require('./growth-wordpress-canonical-id.cjs');
const url='https://contentscale.site/example/';
const db=rows=>({query:async(sql,params)=>{
 assert.match(sql,/FROM content_articles/);
 assert.match(sql,/wp_url=\$1/);
 assert.deepEqual(params,[url]);
 return {rows};
}});
(async()=>{
 assert.equal(await resolveGrowthWordPressPostId({db:db([{wp_post_id:42}]),url}),42);
 await assert.rejects(resolveGrowthWordPressPostId({db:db([]),url}),/CANONICAL_WORDPRESS_MAPPING_MISSING/);
 await assert.rejects(resolveGrowthWordPressPostId({db:db([{wp_post_id:42},{wp_post_id:43}]),url}),/AMBIGUOUS_WORDPRESS_MAPPING/);
 await assert.rejects(resolveGrowthWordPressPostId({db:db([{wp_post_id:'bad'}]),url}),/CANONICAL_WORDPRESS_MAPPING_MISSING/);
 await assert.rejects(resolveGrowthWordPressPostId({db:db([]),url:'https://other.test/page?x=1'}),/CANONICAL_URL_REQUIRED/);
 console.log('PASS: exact URL canonical mapping only, missing/ambiguous mappings fail closed');
})().catch(e=>{console.error(e);process.exitCode=1});
