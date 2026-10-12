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
  const endpoints=['posts','pages'].map(kind=>origin+'/wp-json/wp/v2/'+kind+'/'+postId+'?context=edit');
  const auth=Buffer.from(username+':'+applicationPassword).toString('base64');
  for(const endpoint of endpoints){
   const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',headers:{
    Authorization:'Basic '+auth,Accept:'application/json'
   }});
   if(response.status===404)continue;
   if(!response.ok)throw Error('WORDPRESS_EDIT_READ_FAILED');
   const post=await response.json();
   if(!post||post.id!==postId||post.link!==url||typeof post.content?.raw!=='string')
    throw Error('WORDPRESS_EDIT_IDENTITY_MISMATCH');
   return post;
  }
  throw Error('WORDPRESS_EDIT_POST_OR_PAGE_NOT_FOUND');
 };
}
module.exports={createGrowthWordPressEditReader};
