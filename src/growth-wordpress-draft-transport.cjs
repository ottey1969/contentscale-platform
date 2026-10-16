'use strict';
// Isolated WordPress draft transport. Caller explicitly authorizes every call.
// No PUT/PATCH, published-post overwrite, auto-publish, or redirects allowed.
function createGrowthWordPressDraftTransport({siteUrl,username,applicationPassword,postType='posts',fetchImpl=globalThis.fetch}={}){
 let base;
 try {base=new URL(siteUrl);} catch {throw Error('WP_WRITER_CONFIGURATION_REQUIRED');}
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||
  !username||!applicationPassword||typeof fetchImpl!=='function')
  throw Error('WP_WRITER_CONFIGURATION_REQUIRED');
 if(!['posts','pages'].includes(postType))throw Error('WORDPRESS_POST_TYPE_REVIEW_REQUIRED');
 const endpoint=base.origin+'/wp-json/wp/v2/'+postType;
 return async function createDraft(payload){
  if(!payload||payload.status!=='draft'||typeof payload.title!=='string'||!payload.title.trim()||
   typeof payload.content!=='string'||!payload.content.trim()||
   Object.keys(payload).some(key=>!['title','content','status'].includes(key)))
   throw Error('DRAFT_ONLY_PAYLOAD_REQUIRED');
  const auth=Buffer.from(username+':'+applicationPassword).toString('base64');
  const response=await fetchImpl(endpoint,{
   method:'POST',redirect:'error',
   headers:{Authorization:'Basic '+auth,Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({status:'draft',title:payload.title,content:payload.content})
  });
  if(!response.ok)throw Error('WORDPRESS_DRAFT_CREATE_FAILED');
  const created=await response.json();
  if(!Number.isSafeInteger(created?.id)||created.id<=0||created.status!=='draft')
   throw Error('WORDPRESS_DRAFT_RESPONSE_NOT_VERIFIED');
  return {id:created.id,status:'draft',link:created.link||null};
 };
}
module.exports={createGrowthWordPressDraftTransport};
