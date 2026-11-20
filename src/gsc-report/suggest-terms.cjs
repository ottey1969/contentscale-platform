'use strict';
// Search terms to check in Google, suggested from a real source only (owner 2026-11-20): the Search Console export
// (what people searched), else the site's own H1 and title (the site's own words). Never invented, never the brand alone.
// The owner reviews them before any paid search.
const {readUploads,analyze}=require('./analysis.cjs');
const {crawlSite,siteOrigin}=require('./site-audit.cjs');
const {readKeyword}=require('../rank-free/engine.cjs');

const MAX=10;
// Words that name a part of a website, not something people search for.
const FURNITURE=new Set(['about','us','home','homepage','contact','login','log','sign','in','up','register','account','blog','news','careers','jobs','privacy','policy','terms','cookies','sitemap','search','page','welcome',
 'over','ons','inloggen','aanmelden','nieuws','vacatures','inicio','acerca','de','nosotros','contacto','noticias','empleo','privacidad','the','a','and','of','our','en','het','la','el','y','página']);
const words=s=>String(s||'').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu)||[];
function brandOf(host){const label=String(host||'').replace(/^www\./,'').split('.')[0]||'';return {whole:label.replace(/[^a-z0-9]/gi,'').toLowerCase(),parts:label.toLowerCase().split('-').filter(x=>x.length>=3)}}
const isBrandWord=(w,b)=>w===b.whole||b.parts.includes(w);
// What is left once the brand is taken out must say something a person would search for.
function usable(term,b,{minWords=1}={}){
 const rest=words(term).filter(w=>!isBrandWord(w.replace(/[^a-z0-9]/gi,''),b));
 return rest.length>=minWords&&rest.some(w=>!FURNITURE.has(w));
}
function cleanTerm(s){const k=readKeyword(String(s||'').replace(/\s+/g,' ').replace(/^[\s\-–—|:·•]+|[\s\-–—|:·•.!]+$/g,'').trim());return k&&k.keyword&&k.keyword.length>=3&&words(k.keyword).length<=10?k.keyword:null}

function fromSearchConsole(files,host){
 const uploads=readUploads(files||[]);
 if(!uploads.files.some(f=>f.kind&&f.kind!=='NOT_READ'))return [];
 const r=analyze({uploads,site:host||''}),b=brandOf(host||r.site);
 // Brand + one more word ("broker login") is someone looking for the site itself; "best broker saudi arabia" is not.
 const all=(r.queries.top||[]).filter(q=>usable(q.query,b,{minWords:words(q.query).some(w=>isBrandWord(w,b))?2:1}));
 const near=all.filter(q=>q.position>3&&q.position<=15).sort((x,y)=>y.impressions-x.impressions);
 const rest=all.filter(q=>!near.includes(q)).sort((x,y)=>y.impressions-x.impressions);
 const out=[];
 for(const q of [...near,...rest]){const t=cleanTerm(q.query);if(t&&!out.some(o=>o.term===t))out.push({term:t,source:'SEARCH_CONSOLE',impressions:q.impressions,position:q.position});if(out.length>=MAX)break}
 return out;
}
async function fromSite(domain,{fetchImpl}){
 const crawl=await crawlSite({domain,fetchImpl,max:15,maxSitemaps:3}),b=brandOf(crawl.host),out=[];
 for(const url of crawl.pages){
  const a=crawl.audits.get(url);if(!a)continue;
  const segs=String(a.title||'').split(/\s+[|–—:·•-]\s+|\s*[|–—·•]\s*/).filter(Boolean);
  const cands=[...a.h1.map(x=>({x,source:'PAGE_H1'})),...segs.map(x=>({x,source:'PAGE_TITLE'}))];
  for(const c of cands){const t=cleanTerm(c.x);if(!t||!usable(t,b)||out.some(o=>o.term===t))continue;out.push({term:t,source:c.source,page:url});break}
  if(out.length>=MAX)break;
 }
 return out;
}
async function suggestTerms({files=[],domain='',fetchImpl}={}){
 let host='';if(domain)host=siteOrigin(domain).host;
 const gsc=fromSearchConsole(files,host);
 if(gsc.length)return {source:'SEARCH_CONSOLE',terms:gsc};
 if(!domain)return {source:'NONE',terms:[]};
 return {source:'SITE',terms:await fromSite(domain,{...(fetchImpl?{fetchImpl}:{})})};
}
module.exports={suggestTerms,MAX};
