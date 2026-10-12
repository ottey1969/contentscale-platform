'use strict';
const assert=require('node:assert/strict');
const {inspectTrackerWordPressIdentity}=require('./growth-tracker-wordpress-identity.cjs');
const url='https://contentscale.site/test/', html='<p>Original</p>';
function db({lockAt=Infinity,changeAt=Infinity}={}){let reads=0,locks=0;return {query:async sql=>{
 if(sql.includes('FROM tracker_pages')){reads++;return {rows:[{id:7,tracker_client_id:2,url,html_content:reads>=changeAt?html+' changed':html}]};}
 if(sql.includes('FROM tracker_case_studies')){locks++;return {rows:locks>=lockAt?[{id:1}]:[]};}
 return {rows:[]};
}}}
const post={id:99,link:url,status:'publish',modified_gmt:'2026-10-12T09:00:00',content:{raw:html}};
const input=(database,posts=[post])=>({db:database,pageId:7,clientId:2,fetchWordPressCandidates:async()=>posts});
(async()=>{
 let r=await inspectTrackerWordPressIdentity(input(db()));
 assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.candidate.wordpress_post_id,99);
 assert.equal(r.mapping_write_allowed,false);
 r=await inspectTrackerWordPressIdentity(input(db(),[]));assert(r.issues.includes('UNIQUE_WORDPRESS_POST_REQUIRED'));
 r=await inspectTrackerWordPressIdentity(input(db(),[post,{...post,id:100}]));assert(r.issues.includes('UNIQUE_WORDPRESS_POST_REQUIRED'));
 r=await inspectTrackerWordPressIdentity(input(db(),[{...post,link:'https://other.test/'}]));assert.equal(r.status,'BLOCKED');
 r=await inspectTrackerWordPressIdentity(input(db({lockAt:2})));assert(r.issues.includes('CASE_STUDY_LOCK'));
 r=await inspectTrackerWordPressIdentity(input(db({changeAt:2})));assert(r.issues.includes('TRACKER_SOURCE_CHANGED'));
 console.log('PASS: direct read-only Tracker to WordPress candidate review; safety races blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
