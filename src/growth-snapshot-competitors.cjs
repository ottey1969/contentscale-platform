'use strict';
// Converts historical snapshot URLs into research leads, never proven content gaps.
function snapshotCompetitorLeads({page={},snapshot=null}={}){
 const url=String(page.url||'');
 let own;
 try{own=new URL(url)}catch{return {status:'INVALID_PAGE_URL',checked_at:null,leads:[],verified_gaps:[]}}
 const candidates=[];
 for(const [kind,field] of [['google','google_competitors'],['perplexity','ai_perplexity_competitors']]){
  const entries=Array.isArray(snapshot?.[field])?snapshot[field]:[];
  for(const entry of entries){
   const candidate=typeof entry==='string'?entry:entry&&typeof entry==='object'?entry.url:null;
   if(typeof candidate!=='string')continue;
   try{
    const parsed=new URL(candidate);
    if(parsed.protocol!=='https:'||parsed.hostname.replace(/^www\./,'')===own.hostname.replace(/^www\./,''))continue;
    candidates.push({source:kind,url:parsed.href,serp_title:typeof entry==='object'&&typeof entry.title==='string'?entry.title:null,serp_snippet:typeof entry==='object'&&typeof entry.snippet==='string'?entry.snippet:null,serp_position:typeof entry==='object'&&Number.isFinite(Number(entry.position))&&Number(entry.position)>0?Number(entry.position):null,status:'SERP_OBSERVATION_NOT_PAGE_CONTENT_VERIFIED'});
   }catch{}
  }
 }
 const unique=[...new Map(candidates.map(c=>[c.source+'|'+c.url,c])).values()];
 return {status:unique.length?'URL_LEADS_ONLY':'NO_COMPETITOR_URL_LEADS',checked_at:snapshot?.checked_at||null,leads:unique,verified_gaps:[]};
}
module.exports={snapshotCompetitorLeads};
