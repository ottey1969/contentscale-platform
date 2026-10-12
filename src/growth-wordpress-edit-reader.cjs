'use strict';
// Authenticated read adapter; uses existing WP application-password credentials from
// the invoking integration. No credentials stored/logged and no write requests.
function createGrowthWordPressEditReader({siteUrl,username,applicationPassword,fetchImpl=globalThis.fetch}={}){
 const base=new URL(siteUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||
  !username||!applicationPassword||typeof fetchImpl!=='function')throw Error('WP_READER_CONFIGURATION_REQUIRED');
 const origin=base.origin;
 return async function read({postId,url}={}){
  if(!Number.isSafeInteger(postId)||postId<=0||typeof url!=='string'||new URL(url).origin!==origin)
   throw Error('WORDPRESS_POST_ID_AND_SITE_REQUIRED');
  const endpoint=origin+'/wp-json/wp/v2/posts/'+postId+'?context=edit';
  const auth=Buffer.from(username+':'+applicationPassword).toString('base64');
  const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',headers:{
   Authorization:'Basic '+auth,Accept:'application/json'
  }});
  if(!response.ok)throw Error('WORDPRESS_EDIT_READ_FAILED');
  const post=await response.json();
  if(!post||post.id!==postId||post.link!==url||typeof post.content?.raw!=='string')
   throw Error('WORDPRESS_EDIT_IDENTITY_MISMATCH');
  return post;
 };
}
module.exports={createGrowthWordPressEditReader};
