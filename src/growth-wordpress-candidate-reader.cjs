'use strict';
const {fingerprintWordPressRevision}=require('./growth-wordpress-revision.cjs');
// Discover a unique WP post or page by slug, then independently require exact permalink
// identity and authenticated editor raw content. Never resolve from search results alone.
function createGrowthWordPressCandidateReader({siteUrl,username,applicationPassword,fetchImpl=globalThis.fetch}={}){
 let site;
 try{site=new URL(siteUrl)}catch{throw Error('WORDPRESS_DISCOVERY_CONFIGURATION_REQUIRED')}
 if(site.protocol!=='https:'||site.username||site.password||site.search||site.hash||
  !username||!applicationPassword||typeof fetchImpl!=='function')
  throw Error('WORDPRESS_DISCOVERY_CONFIGURATION_REQUIRED');
 const base=site.href.replace(/\/$/,'');
 const auth='Basic '+Buffer.from(username+':'+applicationPassword).toString('base64');
 return async function findCandidate({url}={}){
  let target;
  try{target=new URL(url)}catch{throw Error('CANONICAL_URL_REQUIRED')}
  if(target.protocol!=='https:'||target.origin!==site.origin||target.search||target.hash)
   throw Error('WORDPRESS_TARGET_DOMAIN_MISMATCH');
  const parts=target.pathname.split('/').filter(Boolean);
  if(parts.length===0)throw Error('WORDPRESS_POST_SLUG_REQUIRED');
  const slug=parts.at(-1);
  const matches=[];
  for(const kind of ['posts','pages']){
   const endpoint=base+'/wp-json/wp/v2/'+kind+'?slug='+encodeURIComponent(slug)+'&context=edit&per_page=2';
   const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',headers:{Authorization:auth,Accept:'application/json'}});
   if(!response.ok)throw Error('WORDPRESS_CANDIDATE_READ_FAILED');
   const rows=await response.json();
   if(!Array.isArray(rows))throw Error('WORDPRESS_CANDIDATE_RESPONSE_INVALID');
   for(const post of rows){
    if(post.link===url){
     const revision=fingerprintWordPressRevision(post,url);
     if(!revision.valid)throw Error('WORDPRESS_CANDIDATE_RAW_NOT_VERIFIABLE');
     matches.push({...revision,type:kind});
    }
   }
  }
  if(matches.length!==1)throw Error(matches.length>1?'AMBIGUOUS_WORDPRESS_POST':'NO_EXACT_WORDPRESS_POST');
  return matches[0];
 };
}
module.exports={createGrowthWordPressCandidateReader};
