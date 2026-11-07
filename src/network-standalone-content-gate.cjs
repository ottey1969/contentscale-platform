'use strict';
// Publication-grade standalone content: exact, previously verified URLs only.
// Distinct from a Publisher Edition: "internal" always means the owner's domain.
function canonical(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol!=='https:'||u.username||u.password)return '';
  u.hash='';return u.href;
 }catch{return ''}
}
function host(raw){try{return new URL(raw).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function articleLinks(html){
 const out=[];const re=/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;let m;
 while((m=re.exec(String(html||''))))out.push({href:m[2],key:canonical(m[2]),anchor:m[3].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()});
 return out;
}
function checkStandaloneLinks({html,ownerDomain,internalCandidates=[],externalCandidates=[]}={}){
 const owner=String(ownerDomain||'').toLowerCase().replace(/^www\./,''),allowedInternal=new Set(internalCandidates.map(canonical).filter(u=>u&&host(u)===owner));
 const allowedExternal=new Set(externalCandidates.map(x=>canonical(typeof x==='string'?x:x&&x.final_url||x&&x.url)).filter(u=>u&&host(u)!==owner));
 const links=articleLinks(html),internal=new Set(),external=new Set(),invalid=[];
 for(const l of links){
  if(!l.key||l.anchor.length<4){invalid.push({href:l.href,reason:'not_a_descriptive_https_link'});continue}
  const h=host(l.key),isInternal=!!owner&&h===owner;
  if(isInternal&&allowedInternal.has(l.key))internal.add(l.key);
  else if(!isInternal&&allowedExternal.has(l.key))external.add(l.key);
  else invalid.push({href:l.href,reason:'not_in_verified_prewrite_candidates'});
 }
 const missing=[];
 if(!owner)missing.push('owner_website_required');
 if(allowedInternal.size<1)missing.push('verified_internal_candidate_required');
 if(allowedExternal.size<3)missing.push('three_verified_external_candidates_required');
 if(internal.size<1)missing.push('at_least_one_verified_internal_link_required');
 if(external.size<3)missing.push('three_unique_verified_external_links_required');
 return {passed:missing.length===0,missing,internal_count:internal.size,external_count:external.size,
  internal_candidate_count:allowedInternal.size,external_candidate_count:allowedExternal.size,invalid_links:invalid};
}
module.exports={checkStandaloneLinks};
