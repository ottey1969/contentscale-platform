'use strict';
// Pure, bounded observations of SAVED HTML. Does not fetch URLs or claim freshness.
const LIMIT=120000;
function inspectSavedGrowthHtml(raw,url){
 if(typeof raw!=='string'||!raw.trim())return {
  available:false,evidence_scope:'NO_SAVED_HTML',live_verified:false,
  caution:'No saved HTML was available. Do not assume a missing title, heading, link or word count.'
 };
 const sample=raw.slice(0,LIMIT);
 const clean=sample.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi,' ')
  .replace(/<!--[\s\S]*?-->/g,' ');
 const title=/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(clean);
 const headingCount=n=>(clean.match(new RegExp('<h'+n+'\\b[^>]*>','gi'))||[]).length;
 const meta=[...clean.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
 const metaDescription=meta.some(t=>/\bname\s*=\s*["']description["']/i.test(t)&&
  /\bcontent\s*=\s*["'][^"']{3,}/i.test(t));
 const robotsNoindex=meta.some(t=>/\bname\s*=\s*["']robots["']/i.test(t)&&
  /noindex/i.test(t));
 const canonical=[...clean.matchAll(/<link\b[^>]*>/gi)].some(m=>/\brel\s*=\s*["']canonical["']/i.test(m[0]));
 let internal=0,external=0;
 let origin=null;try{origin=new URL(url).origin}catch{}
 for(const m of clean.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
  const href=m[1];if(!href||href[0]==='#')continue;
  try{
   const target=new URL(href,url);
   if(!['http:','https:'].includes(target.protocol))continue;
   if(target.origin===origin)internal++;else external++;
  }catch{}
 }
 const images=[...clean.matchAll(/<img\b[^>]*>/gi)];
 const noAlt=images.filter(x=>!/\balt\s*=\s*["'][^"']+["']/i.test(x[0])).length;
 const stripped=clean.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi,' ')
  .replace(/\s+/g,' ').trim();
 const words=(stripped.match(/[\p{L}\p{N}]+/gu)||[]).length;
 return {available:true,evidence_scope:'SAVED_HTML_EXCERPT_OBSERVED',live_verified:false,
  excerpt_truncated:raw.length>LIMIT,title_observed:!!title&&!!title[1].trim(),
  h1_count_observed:headingCount(1),h2_count_observed:headingCount(2),
  meta_description_observed:metaDescription,canonical_tag_observed:canonical,
  noindex_directive_observed:robotsNoindex,internal_links_observed:internal,
  external_links_observed:external,images_observed:images.length,images_missing_alt_observed:noAlt,
  approx_excerpt_words:words,
  caution:'These counts come from a saved, possibly partial HTML snapshot. Check the live rendered page and current SERP before acting. No GSC, ranking or traffic claim has been verified.'};
}
module.exports={inspectSavedGrowthHtml,LIMIT};
