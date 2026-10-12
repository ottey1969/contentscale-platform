'use strict';
// Read-only pre-write revision proof. Do not grant publication rights.
// The writer must run this using a fresh authenticated GET immediately before
// a draft write; WordPress REST itself has no atomic compare-and-swap here.
const {createHash}=require('node:crypto');
const {parseFreshWordPressPost}=require('./growth-wordpress-raw-source.cjs');
function fingerprintWordPressRevision(post,expectedUrl){
 const parsed=parseFreshWordPressPost(post,expectedUrl);
 if(!parsed.valid)return {valid:false,issues:parsed.issues};
 return {valid:true,post_id:parsed.post_id,url:parsed.url,
  modified_gmt:parsed.modified_gmt,status:parsed.status,
  raw_sha256:createHash('sha256').update(post.content.raw).digest('hex')};
}
function compareWordPressRevision(expected,post){
 if(!expected||!Number.isSafeInteger(expected.post_id)||!expected.url||!expected.raw_sha256)
  return {valid:false,issues:['EXPECTED_WORDPRESS_REVISION_REQUIRED']};
 const current=fingerprintWordPressRevision(post,expected.url);
 if(!current.valid)return current;
 const issues=[];
 if(current.post_id!==expected.post_id)issues.push('WORDPRESS_POST_ID_CHANGED');
 if(current.modified_gmt!==expected.modified_gmt)issues.push('WORDPRESS_REVISION_CHANGED');
 if(current.raw_sha256!==expected.raw_sha256)issues.push('WORDPRESS_CONTENT_CHANGED');
 if(current.status!==expected.status)issues.push('WORDPRESS_STATUS_CHANGED');
 return {valid:issues.length===0,issues,current};
}
module.exports={fingerprintWordPressRevision,compareWordPressRevision};
