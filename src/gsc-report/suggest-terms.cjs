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
// The brand is the site's own name: not a subdomain such as "web" or "www" (web.derayah.com → derayah), and not the
// country or company suffix of the domain (derayah.com.sa → derayah).
const GENERIC_SUB=new Set(['www','web','app','m','mobile','en','ar','es','nl','fr','de','it','pt','shop','store','blog','my','portal','online','home','site','new','beta']);
const SECOND_LEVEL=new Set(['com','co','net','org','gov','edu','ac','or','ne','go']);
function brandOf(host){
 const labels=String(host||'').toLowerCase().split('.').filter(Boolean);
 labels.pop();if(labels.length>1&&SECOND_LEVEL.has(labels[labels.length-1]))labels.pop();
 while(labels.length>1&&GENERIC_SUB.has(labels[0]))labels.shift();
 const label=labels[labels.length-1]||'';
 return {whole:label.replace(/[^a-z0-9]/gi,''),parts:label.split('-').filter(x=>x.length>=3),names:new Set()};
}
const scriptOf=t=>/[\u0600-\u06FF]/.test(t)?'ARABIC':/[a-z]/i.test(t)?'LATIN':'OTHER';
const wantedScript=l=>!l?null:['ar','fa','ur'].includes(l)?'ARABIC':['zh','ja','ko','ru','uk','el','he','hi','th'].includes(l)?null:'LATIN';
const readable=u=>{try{const x=new URL(u),p=x.pathname+x.search;try{return decodeURI(p)}catch{return p}}catch{return u}};
const isBrandWord=(w,b)=>w===b.whole||b.parts.includes(w)||b.names.has(w);
// What is left once the brand is taken out must say something a person would search for.
function usable(term,b,{minWords=1}={}){
 if(b.names.has(term))return false;
 const rest=words(term).filter(w=>!isBrandWord(w.replace(/[^a-z0-9]/gi,''),b)&&!b.names.has(w));
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
// A week or date label from a page series ("Oct WK5 2026") is not something people search for.
const MONTH=/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/;
const dateLike=t=>{const w=words(t);const d=w.filter(x=>/\d/.test(x)||MONTH.test(x)||/^wk\d*$/.test(x)||x==='week');return d.length*2>=w.length};
const segmentsOf=title=>String(title||'').split(/\s+[|–—:·•-]\s+|\s*[|–—·•]\s*/).map(x=>x.trim()).filter(Boolean);
async function fromSite(domain,{fetchImpl,language}){
 const crawl=await crawlSite({domain,fetchImpl,max:30,maxSitemaps:3}),b=brandOf(crawl.host),out=[],want=wantedScript(language);
 // A title part that comes back on many pages ("| Derayah", "| دراية") is the site's name, in whatever script.
 const audits=crawl.pages.map(u=>[u,crawl.audits.get(u)]).filter(x=>x[1]),count=new Map();
 for(const [,a] of audits)for(const seg of new Set(segmentsOf(a.title).map(x=>x.toLowerCase())))count.set(seg,(count.get(seg)||0)+1);
 for(const [seg,n] of count)if(n>=Math.max(3,audits.length*0.3))b.names.add(seg);
 for(const [url,a] of audits){
  const cands=[...a.h1.map(x=>({x,source:'PAGE_H1'})),...segmentsOf(a.title).map(x=>({x,source:'PAGE_TITLE'}))];
  for(const c of cands){const t=cleanTerm(c.x);
   // At least two words: one word ("steps") is a label, not a search.
   if(!t||words(t).length<2||dateLike(t)||!usable(t,b)||(want&&scriptOf(t)!==want)||out.some(o=>o.term===t))continue;
   out.push({term:t,source:c.source,page:url,page_label:readable(url)});break}
  if(out.length>=MAX)break;
 }
 return out;
}
async function suggestTerms({files=[],domain='',language='',fetchImpl}={}){
 let host='';if(domain)host=siteOrigin(domain).host;
 const gsc=fromSearchConsole(files,host);
 if(gsc.length)return {source:'SEARCH_CONSOLE',terms:gsc};
 if(!domain)return {source:'NONE',terms:[]};
 return {source:'SITE',terms:await fromSite(domain,{language:String(language||'').toLowerCase(),...(fetchImpl?{fetchImpl}:{})})};
}
module.exports={suggestTerms,MAX};
