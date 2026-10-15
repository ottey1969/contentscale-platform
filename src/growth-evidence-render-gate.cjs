'use strict';
// Pure pre-publication gate. No mutations, scans, AI calls or external requests.
// Call only with evidence fetched from the canonical existing page workflow.
function inspectGrowthDraft(input={}) {
 const issues=[],warnings=[];
 const fail=(code,message)=>issues.push({code,message});
 const html=String(input.html||'');
 const source=String(input.originalHtml||'');
 const markers=input.templateMarkers;
 if(!html.trim())fail('DRAFT_EMPTY','No article HTML supplied.');
 if(!source.trim())fail('ORIGINAL_MISSING','Cannot verify preservation without original content.');
 if(!Array.isArray(markers)||!markers.length)fail('TEMPLATE_UNDEFINED','Approved template markers must be supplied from the existing WordPress template.');
 else for(const marker of markers){
  if(typeof marker!=='string'||!marker.trim())fail('TEMPLATE_MARKER_INVALID','Template marker must be nonempty.');
  else {if(!source.includes(marker))fail('TEMPLATE_MARKER_NOT_IN_ORIGINAL','Approved template marker cannot be verified in the original page: '+marker); if(!html.includes(marker))fail('TEMPLATE_NOT_PRESERVED','Missing required template marker: '+marker);}
 }
 const visibleText=html.replace(/<!--[^]*?-->/g,'').replace(/<script\b[^]*?<\/script>/gi,'').replace(/<style\b[^]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

 // Editorial defects observed during real PRT Bergen/Hudson reviews.
 // Pure checks: they do not remove source material or modify published WordPress.
 const editorialHtml=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'');
 const headingMatches=[...editorialHtml.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
 const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|hellip|mdash|ndash|#\d+|#x[0-9a-f]+);/gi,' ').replace(/\s+/g,' ').trim();
 for(let i=0;i<headingMatches.length;i++){
  const m=headingMatches[i],title=plain(m[2]),level=Number(m[1]);
  if(!title){fail('HEADING_EMPTY','An H2/H3 is empty.');continue;}
  const end=m.index+m[0].length;
  const next=headingMatches.slice(i+1).find(n=>Number(n[1])<=level);
  const sectionHtml=editorialHtml.slice(end,next?next.index:editorialHtml.length);
  // A following heading is not explanatory content. Tables, images and source notes
  // alone do not answer a commercial H2 or H3 question.
  const withoutHeadings=sectionHtml.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi,' ');
  const withoutSourceNotes=withoutHeadings.replace(/<p\b[^>]*>\s*(?:<[^>]*>\s*)?(?:Sources?|References?)\s*:[\s\S]*?<\/p>/gi,' ');
  const copy=plain(withoutSourceNotes);
  if(copy.length<20)fail('HEADING_WITHOUT_ANSWER','Heading has no substantive text before the next section: '+title);
 }
 const notes=[...editorialHtml.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)];
 for(const m of notes){
  const content=plain(m[0]);
  if(/^(?:Sources?|References?)\s*:/i.test(content)&&/\b(?:industry data|various sources|unspecified research|general industry figures)\b/i.test(content))
   fail('SOURCE_ATTRIBUTION_VAGUE','A source note names untraceable industry data instead of the actual report and evidence URL.');
 }
 const shells=(html.match(/<!doctype\s+html\b/gi)||[]).length;
 const roots=(html.match(/<html\b/gi)||[]).length;
 if(shells>1||roots>1)fail('DUPLICATE_HTML_DOCUMENT','More than one HTML document shell is present in the candidate page.');
 else if(shells||roots)warnings.push({code:'HTML_DOCUMENT_SHELL_REVIEW',message:'Full HTML document inside editor content requires verification that WordPress is not rendering a second head/body.'});
 if(input.wordpress_embedded===true&&(/<!doctype\s+html\b/i.test(html)||/<(?:html|head|body)\b/i.test(html)))
  fail('EMBEDDED_DOCUMENT_SHELL','A WordPress HTML widget must contain an HTML fragment, not another full document.');

 const imageTag=/<img\b[^>]*>/gi;
 const images=[...html.matchAll(imageTag)];
 const seen=new Set();
 const originalImageSources=[...source.matchAll(imageTag)].map(m=>(m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)||[])[1]).filter(Boolean);
 const draftImageSources=new Set(images.map(m=>(m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)||[])[1]).filter(Boolean));
 for(const src of originalImageSources)if(!draftImageSources.has(src))fail('ORIGINAL_IMAGE_REMOVED','Original image is missing from the Growth draft: '+src);
 for(const m of images){
  const src=(m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)||[])[1];
  const alt=(m[0].match(/\balt\s*=\s*["']([^"']*)["']/i)||[])[1];
  if(!src)fail('IMAGE_SOURCE_MISSING','Image tag without source.');
  if(src&&seen.has(src))fail('IMAGE_DUPLICATE','Repeated image source: '+src);
  if(src)seen.add(src);
  if(!alt||!alt.trim())warnings.push({code:'IMAGE_ALT_REVIEW',message:'Image alt text requires review.'});
 }
 // Detect clusters of four or more images with no meaningful intervening text.
 let cluster=0,prevEnd=0;
 for(const m of images){
  const between=html.slice(prevEnd,m.index).replace(/<!--[^]*?-->/g,'').replace(/<[^>]*>/g,'').replace(/&nbsp;|\s|\u00a0/gi,'').trim();
  cluster=(cluster>0&&!between)?cluster+1:1;
  if(cluster===4)fail('IMAGE_STACK','At least four images appear without explanatory text between them.');
  prevEnd=m.index+m[0].length;
 }
 if(visibleText.length<200)fail('CONTENT_TOO_THIN_FOR_REVIEW','No substantial reader-facing text available for inspection.');
 const evidence=input.evidence||{};
 if(!Array.isArray(evidence.pageQueries)||!evidence.pageQueries.some(x=>x&&x.evidence_scope==='page_verified'&&x.query&&x.page_url===input.url))
  fail('GSC_EXACT_PAGE_MISSING','Do not claim verified exact-page search intent without exact-page GSC query evidence.');
 for(const kind of ['searchSpy','aiSpy']){
  if(!Array.isArray(evidence[kind]))fail(kind.toUpperCase()+'_MISSING','Supply '+kind+' findings, even if empty.');
 }
 const claims=Array.isArray(input.claims)?input.claims:[];
 if(!Array.isArray(input.claims))fail('CLAIM_REGISTER_MISSING','Every factual or commercial claim must be inventoried.');
 for(const c of claims){
  if(!c||!c.text||!['verified','qualified','removed'].includes(c.status))
   fail('CLAIM_UNRESOLVED','Claim lacks a disposition: verified, qualified or removed.');
  else if(c.status==='verified'&&(!c.source_url||!/^https:\/\//.test(c.source_url)))
   fail('CLAIM_SOURCE_MISSING','Verified claim must have an HTTPS evidence URL.');
 }
 function isExternalCompetitor(candidate){
  try {const target=new URL(input.url),source=new URL(candidate);
   const hostname=x=>x.hostname.replace(/^www\./,'');
   return target.protocol==='https:'&&source.protocol==='https:'&&hostname(target)!==hostname(source);
  } catch {return false;}
 }
 const gaps=Array.isArray(input.competitiveGaps)?input.competitiveGaps:[];
 if(!gaps.length)fail('COMPETITIVE_DIFFERENTIATION_MISSING','Explain what search/AI competitors have, what is absent, and what the draft adds.');
 for(const g of gaps){
  if(!g||!g.competitor_url||!isExternalCompetitor(g.competitor_url)||!g.observed||!g.improvement||!g.where_in_draft)
   fail('COMPETITIVE_GAP_UNSUPPORTED','Each gap needs a competitor URL, observed finding, improvement and draft location.');
 }
 if(!input.renderProof||input.renderProof.desktop_checked!==true||input.renderProof.mobile_checked!==true)
  fail('RENDER_NOT_REVIEWED','Real desktop and mobile rendered output must be inspected.');
 if(input.caseStudyLocked===true)fail('CASE_STUDY_LOCK','Protected Case Study page may not enter Growth publication.');
 return {ready:issues.length===0,status:issues.length?'BLOCKED':'READY_FOR_HUMAN_REVIEW',issues,warnings,image_count:images.length};
}
module.exports={inspectGrowthDraft};
