'use strict';
// Free and Tracker use the same live redirect and final-200 validation.
// A sitemap, anchor or canonical is discovery evidence, NOT evidence of HTTP status.
const {resolveGrowthInternalLink}=require('../growth-internal-link-resolver.cjs');
async function resolveFreeCmsLink(url,pageUrl,{resolve=resolveGrowthInternalLink}={}){
 const result=await resolve(url,pageUrl);
 return result&&typeof result.url==='string'&&result.url.startsWith('https://')?
  result:{status:result?.status||'UNVERIFIED',url:null};
}
async function verifyFreeCmsSuggestions(src,{pageUrl,maxChecks=12,resolve=resolveGrowthInternalLink}={}){
 const candidates=(src.internal_links||[]).slice(0,Math.max(0,Math.min(maxChecks,30)));
 const suggested=src.suggested_link||null;
 if(suggested?.url&&!candidates.some(x=>x.url===suggested.url)&&candidates.length<maxChecks)candidates.unshift(suggested);
 const checks=await Promise.all(candidates.map(async x=>({original:x,verification:await resolveFreeCmsLink(x.url,pageUrl,{resolve})})));
 const links=[],used=new Set();
 for(const {original,verification} of checks){
  if(!verification.url||used.has(verification.url))continue;
  used.add(verification.url);
  links.push({...original,url:verification.url,redirect_resolved:!!verification.redirected,
   verification_status:verification.status});
 }
 const picked=suggested&&checks.find(x=>x.original.url===suggested.url&&x.verification.url);
 const pickedUrl=picked?.verification.url||null;
 return {internal_links:links,suggested_link:pickedUrl?{...suggested,url:pickedUrl,
  redirect_resolved:!!picked.verification.redirected}:null,checked:checks.length};
}
module.exports={resolveFreeCmsLink,verifyFreeCmsSuggestions};
