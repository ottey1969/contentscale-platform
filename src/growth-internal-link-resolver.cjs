'use strict';
// Do not recommend or package a redirecting internal URL. An old 301 must
// remain working for external traffic, but internal links should use the final
// responding 200 page directly. Unsafe, off-site, looping and unreadable links
// are withheld rather than guessed.
const {fetchPublicGrowthHtml,validateUrl}=require('./growth-public-html-reader.cjs');
async function resolveGrowthInternalLink(input,pageUrl,{fetchLive=fetchPublicGrowthHtml}={}){
 let original,page;try{original=validateUrl(input);page=validateUrl(pageUrl)}catch{return {status:'INVALID_URL',url:null}}
 if(original.origin!==page.origin)return {status:'OFF_SITE',url:null};
 if(original.href===page.href)return {status:'SELF_LINK',url:null};
 try{
  const result=await fetchLive(original.href,{timeout:6500,limit:24000,compact:true,redirects:5});
  const final=validateUrl(String(result.final_url||''));
  if(final.origin!==page.origin)return {status:'REDIRECTED_OFF_SITE',url:null};
  if(final.href===page.href)return {status:'REDIRECT_TO_SELF',url:null};
  if(result.status!==200)return {status:'NOT_200',url:null};
  const redirected=final.href!==original.href||!!(result.redirect_chain||[]).length;
  return {status:redirected?'RESOLVED_REDIRECT':'DIRECT_200',
   url:final.href,original_url:original.href,redirected,
   source:'LIVE_PUBLIC_HTTPS',redirect_chain:result.redirect_chain||[]};
 }catch(e){
  return {status:'UNVERIFIED',url:null,reason:String(e&&e.code||'UNAVAILABLE').slice(0,90)};
 }
}
module.exports={resolveGrowthInternalLink};
