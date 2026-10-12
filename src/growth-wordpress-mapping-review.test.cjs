'use strict';
const assert=require('node:assert/strict');
const {inspectGrowthWordPressMapping}=require('./growth-wordpress-mapping-review.cjs');
const url='https://contentscale.site/sample/';
const post={id:72,link:url,status:'publish',modified_gmt:'2026-10-12T12:00:00',content:{raw:'<p>Source</p>'}};
const make=(rows,posts=[post])=>({db:{query:async(sql,args)=>{assert.match(sql,/wp_url=\$1/);assert.deepEqual(args,[url]);return {rows};}},url,fetchWordPressCandidates:async()=>posts});
(async()=>{
 let r=await inspectGrowthWordPressMapping(make([{id:8,wp_post_id:null}]));
 assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.candidate.wordpress_post_id,72);assert.equal(r.mapping_write_allowed,false);
 r=await inspectGrowthWordPressMapping(make([]));assert(r.issues.includes('CONTENT_ARTICLE_RECORD_MISSING'));
 r=await inspectGrowthWordPressMapping(make([{id:8},{id:9}]));assert(r.issues.includes('AMBIGUOUS_CONTENT_ARTICLE_MAPPING'));
 r=await inspectGrowthWordPressMapping(make([{id:8,wp_post_id:71}]));assert(r.issues.includes('EXISTING_WORDPRESS_ID_CONFLICT'));
 r=await inspectGrowthWordPressMapping(make([{id:8}],[]));assert(r.issues.includes('WORDPRESS_UNIQUE_CANDIDATE_REQUIRED'));
 r=await inspectGrowthWordPressMapping(make([{id:8}],[post,{...post,id:73}]));assert(r.issues.includes('WORDPRESS_UNIQUE_CANDIDATE_REQUIRED'));
 r=await inspectGrowthWordPressMapping(make([{id:8}],[{...post,link:'https://other.test/'}]));assert.equal(r.status,'BLOCKED');
 console.log('PASS: read-only exact identity mapping review; no writes');
})().catch(err=>{console.error(err);process.exitCode=1});
