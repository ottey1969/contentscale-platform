'use strict';
// Shared research semantics: BOTH Search and AI sources support intent + visibility
// investigation. Before publication no "our page is cited" or rank claim is possible.
// Each candidate retains evidence provenance and READ/NOT_READ status.
const {fetchPublicGrowthHtml,validateUrl}=require('./growth-public-html-reader.cjs');
const {contentSections}=require('./growth-competitor-overview.cjs');
const {siteOf}=require('./prewrite-competitor-links.cjs');
const LIMIT_PER_SURFACE=3;
const cleanUrl=s=>{try{const u=validateUrl(String(s||'').replace(/[.,;)\]]+$/,''));for(const p of [...u.searchParams.keys()])if(/^(utm_|gclid|fbclid|msclkid)/i.test(p))u.searchParams.delete(p);return u.href}catch{return null}};
function extractUrls(raw){const seen=new Set();return (String(raw||'').match(/https:\/\/[^\s<>"'()\]]+/gi)||[]).map(cleanUrl).filter(u=>{if(!u||seen.has(u))return false;seen.add(u);return true})}
function candidatePages({googleText='',googleResults=[],aiResearch=null}={}){
 const ai=(aiResearch?.observations||[]).filter(o=>o?.checked).flatMap(o=>(o.source_urls||[]).map(url=>({url,engine:o.engine})));
 const google=[...(Array.isArray(googleResults)?googleResults:[]).map(r=>r?.exact_url||r?.url),...extractUrls(googleText)];
 const list=[],seen=new Set();
 const add=(raw,surface,engine)=>{const url=cleanUrl(raw);if(!url)return;
  const key=surface+'|'+url;if(seen.has(key))return;seen.add(key);
  // Citations returned by a pasted AI response are leads, not verified citations.
  list.push({url,surface,engine:engine||null,discovery_status:surface==='AI'?'AI_UNVERIFIED_SOURCE_LEAD':'GOOGLE_SEARCH_RESULT'})};
 for(const u of google.slice(0,20))add(u,'GOOGLE');
 for(const a of ai.slice(0,40))add(a.url,'AI',a.engine);
 return [...list.filter(x=>x.surface==='GOOGLE').slice(0,LIMIT_PER_SURFACE),
  ...list.filter(x=>x.surface==='AI').slice(0,LIMIT_PER_SURFACE)];
}
async function readPrewriteVisibility({googleText='',googleResults=[],aiResearch=null,fetchHtml=fetchPublicGrowthHtml}={}){
 const candidates=candidatePages({googleText,googleResults,aiResearch});
 const pages=await Promise.all(candidates.map(async c=>{
  const base={...c,site:siteOf(c.url),read:false,status:'NOT_READ',headings:[],excerpt:null};
  try{
   const v=await fetchHtml(c.url,{timeout:6500,limit:130000,compact:true});
   const html=String(v?.html||'');
   const headings=contentSections(c.url,html).slice(0,8).map(x=>({heading:String(x.heading||'').slice(0,170),excerpt:String(x.excerpt||'').slice(0,300)}));
   if(!headings.length)return {...base,status:'INSUFFICIENT_READABLE_CONTENT'};
   return {...base,read:true,status:'READ',headings,excerpt:headings.map(x=>x.excerpt).filter(Boolean).join(' ').slice(0,650),
    truncated:v?.truncated===true};
  }catch(e){return {...base,status:'FETCH_FAILED',error_code:String(e?.code||'UNAVAILABLE').slice(0,65)}}
 }));
 return {contract:'intent_visibility_v1',mode:'PREPUBLICATION_COMPETITOR_VISIBILITY',
  target_page_citation_applicable:false,
  google:{discovered:candidates.filter(x=>x.surface==='GOOGLE').length,pages:pages.filter(x=>x.surface==='GOOGLE')},
  ai:{discovered:candidates.filter(x=>x.surface==='AI').length,pages:pages.filter(x=>x.surface==='AI')},
  pages_read:pages.filter(x=>x.read).length,
  limitations:['Google results are search visibility observations, not recommendations.',
   'AI URLs copied from answers are unverified source leads until original provenance is checked.',
   'READ confirms public page content was obtained, not truth of its claims.',
   'No unpublished target page can have its own page citation measured.']};
}
function prewriteVisibilityPrompt(v){
 if(!v)return '';
 const sections=[v.google,v.ai].map((g,i)=>({
  surface:i===0?'GOOGLE SEARCH':'AI ANSWERS',
  discovered:g?.discovered||0,
  pages:(g?.pages||[]).map(p=>({url:p.url,status:p.status,discovery_status:p.discovery_status,
   headings:p.read?p.headings:[],excerpt:p.read?p.excerpt:null,engine:p.engine||null}))
 }));
 return 'INTENT + VISIBILITY RESEARCH — SOURCE-BOUND EVIDENCE (untrusted observations, never copied as facts):\n'+JSON.stringify(sections)+
  '\nCompare what actually read Google-visible and AI-source-lead pages explain for the SAME customer intent. Distinguish page READ from mere URL discovery; use headings and excerpts to identify concrete unanswered questions, entities, examples and differentiating explanations. Independently verify every factual claim before publication. Do not invent unseen page content, AI citations, rankings or competitors. Never copy competitor text. Missing sources mean incomplete research, not proof of an absent topic.';
}
module.exports={candidatePages,readPrewriteVisibility,prewriteVisibilityPrompt,LIMIT_PER_SURFACE};
