'use strict';
// Read-only SERP inspection for a specific, verified prospect domain.
// A small top-results sample is not exhaustive editorial acceptance verification.
const words=s=>new Set(String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
 .filter(w=>w.length>3&&!['that','with','from','their','this','your','about','through','guide','beyond','build'].includes(w)));
const similarity=(a,b)=>{
 const A=words(a),B=words(b);if(!A.size||!B.size)return 0;
 let common=0;for(const w of A)if(B.has(w))common++;
 return common/Math.min(A.size,B.size);
};
async function inspectEditorialOverlap({domain,title,apiKey,fetchImpl=globalThis.fetch}={}){
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain||'')||!apiKey)
  return {status:'RESEARCH_UNAVAILABLE',sources:[],review_required:true};
 const query='site:'+domain+' '+Array.from(words(title)).slice(0,5).join(' ');
 const url=new URL('https://serpapi.com/search.json');
 url.searchParams.set('engine','google');url.searchParams.set('q',query);
 url.searchParams.set('num','8');url.searchParams.set('api_key',apiKey);
 try{
  const resp=await fetchImpl(url.toString(),{method:'GET',redirect:'error',signal:AbortSignal.timeout(14000)});
  if(!resp.ok)return {status:'SEARCH_PROVIDER_UNAVAILABLE',sources:[],review_required:true};
  const data=await resp.json();
  if(data.error)return {status:'SEARCH_PROVIDER_UNAVAILABLE',sources:[],review_required:true};
  const sources=(Array.isArray(data.organic_results)?data.organic_results:[]).flatMap(item=>{
   try{
    const u=new URL(item.link),host=u.hostname.toLowerCase().replace(/^www\./,'');
    if(u.protocol!=='https:'||!(host===domain.toLowerCase()||host.endsWith('.'+domain.toLowerCase())))return [];
    const pageTitle=String(item.title||'').trim().slice(0,180);
    return pageTitle?[{title:pageTitle,url:u.href,similarity:Number(similarity(title,pageTitle).toFixed(2))}]:[];
   }catch{return [];}
  }).slice(0,8);
  return {status:sources.length?'INDEXED_CONTENT_SAMPLE':'NO_INDEXED_MATCHES_FOUND',
   sources,review_required:sources.some(s=>s.similarity>=0.55),
   sample_only:true,publication_acceptance_verified:false,
   research_note:'Search result titles are a limited sample. Review full content and editorial policies before sending.'};
 }catch{return {status:'SEARCH_PROVIDER_UNAVAILABLE',sources:[],review_required:true};}
}
module.exports={inspectEditorialOverlap,similarity};
