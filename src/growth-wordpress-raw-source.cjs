'use strict';
// Normalize only WordPress's explicit single Custom HTML Gutenberg wrapper.
// Never strip unknown blocks, rewrite content, or silently equate different HTML.
function canonicalWordPressHtml(value){
 if(typeof value!=='string'||!value.trim())return null;
 const raw=value.trim();
 const match=/^<!-- wp:html -->\s*([\s\S]*?)\s*<!-- \/wp:html -->$/.exec(raw);
 if(!match)return raw;
 return match[1].trim();
}
function parseFreshWordPressPost(post,expectedUrl){
 if(!post||typeof post!=='object'||!Number.isSafeInteger(post.id)||post.id<=0||
  post.link!==expectedUrl||typeof post.content?.raw!=='string'||!post.content.raw.trim()||
  !['publish','draft','private','pending','future'].includes(post.status)||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(post.modified_gmt||'')){
  return {valid:false,issues:['WORDPRESS_POST_IDENTITY_OR_RAW_CONTENT_MISSING']};
 }
 return {valid:true,url:post.link,post_id:post.id,modified_gmt:post.modified_gmt,
  status:post.status,html:canonicalWordPressHtml(post.content.raw),issues:[]};
}
module.exports={canonicalWordPressHtml,parseFreshWordPressPost};
