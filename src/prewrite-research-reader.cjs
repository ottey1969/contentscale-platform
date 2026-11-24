'use strict';
// Standalone Pre-Write content research only. Does not generate or modify approved Network briefs.
const {fetchPublicGrowthHtml,RESEARCH_FETCH,validateUrl}=require('./growth-public-html-reader.cjs');
const {createFreeGrowthFirecrawlReader,extractionReason}=require('./growth-free-firecrawl-reader.cjs');
const {excerpt}=require('./growth-automatic-analysis.cjs');
function createPrewriteResearchReader({env=process.env,original=fetchPublicGrowthHtml,fetchImpl=globalThis.fetch,lookup,maxPages=6}={}){
 const native=new Map();
 const getNative=(url,opts)=>{
  if(!native.has(url))native.set(url,Promise.resolve().then(()=>original(url,opts)));
  return native.get(url);
 };
 const adapter=createFreeGrowthFirecrawlReader({env,original:getNative,fetchImpl,...(lookup?{lookup}:{}),maxPages});
 const read=async(raw)=>{
  const url=validateUrl(raw).href;
  const direct=await getNative(url,RESEARCH_FETCH);
  let chosen=direct;
  if(adapter.stats.enabled&&extractionReason(direct,RESEARCH_FETCH)){
   const enhanced=await adapter.reader(url,RESEARCH_FETCH).catch(()=>null);
   if(enhanced?.source==='FIRECRAWL_HOSTED_API'&&enhanced.final_url=== (direct.final_url||url))chosen=enhanced;
  }
  const headings=excerpt(chosen.html);
  const h3=[...String(chosen.html||'').matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/gi)].slice(0,12).map(m=>m[1].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)).filter(Boolean);
  const technical=excerpt(direct.html);
  return {url,final_url:direct.final_url||url,native:direct,content:chosen,
   headings:{...headings,title:technical.title,description:technical.description,h3},
   provenance:{technical_source:direct.source||'NATIVE',content_source:chosen.source||'NATIVE',retrieved_at:chosen.retrieved_at||null}};
 };
 return {read,stats:adapter.stats};
}
module.exports={createPrewriteResearchReader};
