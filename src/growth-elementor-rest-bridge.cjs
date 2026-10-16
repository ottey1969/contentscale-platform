'use strict';
// Configured WordPress Application Password only: WordPress must separately have
// contentscale-growth-elementor plugin installed and authenticated routes enabled.
// Never attempt a generic wp/v2 publish/update as a fallback.
function createGrowthElementorRestBridge({siteUrl,username,applicationPassword,fetchImpl=globalThis.fetch}={}){
 let base;
 try{base=new URL(siteUrl);}catch{throw Error('WORDPRESS_SITE_CONFIGURATION_REQUIRED')}
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||
  base.search||base.hash||!username||!applicationPassword||typeof fetchImpl!=='function')
  throw Error('WORDPRESS_SITE_CONFIGURATION_REQUIRED');
 const root=base.origin+'/wp-json/contentscale-growth/v1/elementor';
 const auth='Basic '+Buffer.from(username+':'+applicationPassword).toString('base64');
 async function request(path,{method='GET',body}={}){
  const r=await fetchImpl(root+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:auth,Accept:'application/json','Content-Type':'application/json','Cache-Control':'no-store'},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!r?.ok)throw Error(r?.status===404?'ELEMENTOR_BRIDGE_NOT_INSTALLED':'ELEMENTOR_BRIDGE_REQUEST_FAILED');
  const data=await r.json();if(!data||typeof data!=='object')throw Error('ELEMENTOR_BRIDGE_INVALID_RESPONSE');
  return data;
 }
 return {
  async readOriginalPost({id,type}){
   if(!Number.isSafeInteger(id)||id<1||!['posts','pages'].includes(type))throw Error('SOURCE_IDENTITY_REQUIRED');
   const post=await request('/source/'+id);
   if(post.id!==id||post.type!==type||post.status!=='publish'||post.elementor_edit_mode!=='builder'||
    typeof post.elementor_data!=='string')throw Error('ELEMENTOR_SOURCE_IDENTITY_MISMATCH');
   return post;
  },
  async createDraft({sourcePostId,sourceSha256,type,status}){
   if(status!=='draft'||!Number.isSafeInteger(sourcePostId)||sourcePostId<1||!['pages','posts'].includes(type)||
    !/^[0-9a-f]{64}$/.test(String(sourceSha256||'')))throw Error('ELEMENTOR_DRAFT_SOURCE_REQUIRED');
   const draft=await request('/draft',{method:'POST',body:{source_id:sourcePostId,source_sha256:sourceSha256}});
   if(!Number.isSafeInteger(draft.id)||draft.id<1||draft.id===sourcePostId||draft.status!=='draft'||draft.type!==type)
    throw Error('ELEMENTOR_BRIDGE_DRAFT_IDENTITY_MISMATCH');
   return draft;
  },
  async writeDraftElementorMeta({id,type,status,elementor_data,elementor_edit_mode}){
   if(!Number.isSafeInteger(id)||id<1||!['pages','posts'].includes(type)||status!=='draft'||
    elementor_edit_mode!=='builder'||typeof elementor_data!=='string'||!elementor_data.trim())
    throw Error('ELEMENTOR_DRAFT_WRITE_INVALID');
   const crypto=require('node:crypto');
   const candidate_sha256=crypto.createHash('sha256').update(elementor_data).digest('hex');
   const written=await request('/draft/'+id+'/meta',{method:'POST',body:{elementor_data,candidate_sha256}});
   if(written.id!==id||written.status!=='draft'||written.type!==type||written.candidate_sha256!==candidate_sha256)
    throw Error('ELEMENTOR_DRAFT_META_WRITE_MISMATCH');
   return written;
  },
  async readDraft({id,type,status}){
   if(!Number.isSafeInteger(id)||id<1||!['pages','posts'].includes(type)||status!=='draft')
    throw Error('ELEMENTOR_DRAFT_READ_INVALID');
   const post=await request('/draft/'+id);
   if(post.id!==id||post.type!==type||post.status!=='draft')throw Error('ELEMENTOR_BRIDGE_DRAFT_READ_MISMATCH');
   return post;
  },
  restPluginRequired:true,publishedOverwriteAllowed:false
 };
}
module.exports={createGrowthElementorRestBridge};
