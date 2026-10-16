'use strict';
// CMS-neutral, no external service, no CMS credentials, no AI or paid APIs.
// This package describes a reviewed change to an EXISTING canonical page.
// A website owner can implement it in Wix, WordPress, Webflow, Squarespace,
// or a custom CMS using native SEO-indexable text components.
const {createHash}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const sha=x=>createHash('sha256').update(x).digest('hex');
const clean=x=>String(x==null?'':x).trim();
const asText=html=>String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
 .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderChangeMarkdown(html){
 return String(html).replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(_,n,x)=>'\n'+'#'.repeat(Number(n))+' '+asText(x)+'\n\n')
 .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,url,text)=>'['+asText(text)+']('+url+')')
 .replace(/<li\b[^>]*>/gi,'\n- ').replace(/<\/(?:li|p|ul|ol|section|div)>/gi,'\n\n')
 .replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ')
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\n{3,}/g,'\n\n').trim();
}
function prepareGrowthCmsHandoff({canonicalUrl,originalHtml,changes=[],editorApproved=false,
 cms='generic',pageTitle,metaDescription,focusQuery='',evidenceScope='needs_access',
 caseStudyLocked=false,sourceExpectedSha256,language='en'}={}){
 const issues=[],warnings=[];
 let url;
 try{url=new URL(canonicalUrl)}catch{}
 if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
    !url.hostname||url.port)issues.push('CANONICAL_HTTPS_URL_REQUIRED');
 if(typeof originalHtml!=='string'||!originalHtml.trim())issues.push('ORIGINAL_PAGE_SNAPSHOT_REQUIRED');
 if(sourceExpectedSha256&&sha(originalHtml)!==sourceExpectedSha256)issues.push('SOURCE_REVISION_CHANGED');
 if(caseStudyLocked)issues.push('CASE_STUDY_BASELINE_LOCKED');
 if(editorApproved!==true)issues.push('EDITOR_APPROVAL_REQUIRED');
 if(!Array.isArray(changes)||changes.length<1||changes.length>12)issues.push('APPROVED_SECTION_COUNT_REQUIRED');
 const approved=Array.isArray(changes)?changes:[];
 if(!['wix','wordpress','webflow','squarespace','custom','generic'].includes(cms))issues.push('CMS_SELECTION_INVALID');
 if(typeof pageTitle!=='string'||!clean(pageTitle)||pageTitle.length>100)issues.push('META_TITLE_REQUIRED');
 if(typeof metaDescription!=='string'||!clean(metaDescription)||metaDescription.length>220)issues.push('META_DESCRIPTION_REQUIRED');
 if(!['verified','observed','needs_access'].includes(evidenceScope))issues.push('EVIDENCE_SCOPE_INVALID');
 const links=[];
 const captions=[];
 for(const part of approved){
  if(!part||part.approved!==true||!clean(part.evidence_ref)||!clean(part.html)){
   issues.push('SECTION_APPROVAL_AND_EVIDENCE_REQUIRED');continue;
  }
  const h=part.html;
  if(typeof h!=='string'||h.length>90000||
   /<(?:\/?)(?:script|style|iframe|form|object|embed|html|head|body|meta|link|svg|math|template|textarea|button|input|select|option|video|audio|source|picture|frame|frameset|base|title|noscript|canvas|applet|portal|plaintext|xmp|dialog)\b/i.test(h)||
   /\s(?:on[\w:-]+|style|srcdoc|formaction|autofocus|contenteditable)\s*=|(?:javascript|vbscript)\s*:|data\s*:/i.test(h))issues.push('UNSAFE_OR_NONINDEXABLE_HTML');
  if(!/<(?:p|h[2-6]|li)\b/i.test(h)||asText(h).length<30)issues.push('SUBSTANTIVE_SECTION_TEXT_REQUIRED');
  for(const m of h.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/gi)){
   if(!asText(m[1]))issues.push('EMPTY_HEADING');
  }
  if(/<a\b[^>]*\bhref\s*=\s*(?!["'])/i.test(h))issues.push('UNQUOTED_LINK_TARGET_NOT_ALLOWED');
  for(const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)){
   const ref=m[1];
   // Entity decoding happens in the browser before navigation.
   if(/&(?:#|colon\b|tab\b|newline\b)/i.test(ref))issues.push('ENCODED_LINK_TARGET_NOT_ALLOWED');
   if(/[\u0000-\u001f\u007f]/.test(ref))issues.push('LINK_TARGET_CONTROL_CHARACTER');
   if(ref.startsWith('#')){links.push({url:ref,type:'in_page'});continue}
   let target;try{target=new URL(ref,canonicalUrl)}catch{}
   if(!target||!['http:','https:','tel:','mailto:'].includes(target.protocol)||
      target.username||target.password)issues.push('LINK_TARGET_INVALID');
   else links.push({url:ref,type:target.protocol==='tel:'?'phone':target.protocol==='mailto:'?'email':
    url&&target.hostname===url.hostname?'same_domain':'external'});
  }
  for(const m of h.matchAll(/<img\b[^>]*>/gi)){
   const alt=m[0].match(/\balt=["']([^"']*)["']/i)?.[1];
   if(!alt||!clean(alt))warnings.push('IMAGE_ALT_REVIEW_REQUIRED');
   captions.push({source:'inline_image',alt:alt||null,owner_must_verify_rights:true});
  }
  if(/(?:Sources?|References?)\s*:\s*(?:industry data|various sources|unspecified research)/i.test(asText(h)))
   issues.push('VAGUE_SOURCE_NOTE');
 }
 if(approved.some(x=>/<h1\b/i.test(x?.html||'')))issues.push('EXISTING_H1_MUST_REMAIN');
 if(evidenceScope!=='verified')warnings.push('NO_VERIFIED_PAGE_GSC_BASELINE');
 if(!links.some(x=>x.type==='same_domain'))warnings.push('CONTEXTUAL_INTERNAL_LINK_REVIEW');
 if(captions.length===0)warnings.push('IMAGES_OPTIONAL_REAL_IMAGE_EVIDENCE_IF_AVAILABLE');
 if(issues.length)return {status:'BLOCKED',issues:[...new Set(issues)],warnings:[...new Set(warnings)],files:[],publication_allowed:false};
 const fragments=approved.map(x=>x.html.trim()).join('\n\n');
 const allMarkdown=approved.map((x,i)=>'### Approved change '+(i+1)+'\nEvidence: '+x.evidence_ref+'\n\n'+renderChangeMarkdown(x.html)).join('\n\n');
 const delivery='CMS-independent handoff for existing page '+canonicalUrl+'\n'+
 'No autopublishing. Implement in your normal website editor using native, indexable text components.\n'+
 'Platform: '+cms+'. Keep original URL, navigation, design, existing text and images unless explicitly reviewed.\n'+
 '1. Open the ORIGINAL page in the CMS, not a new duplicate URL.\n'+
 '2. Add the approved sections in a suitable position. Preserve the existing H1, template, images, mobile styling, and content.\n'+
 '3. Set page SEO title and meta description only if the editor supports them; do not paste meta tags into the page body.\n'+
 '4. Insert and test contextual internal/external links and click-to-call controls.\n'+
 '5. Use native Wix text elements for SEO (when CMS is Wix); do not treat an HTML iframe/embed as the page content.\n'+
 '6. Check desktop/mobile rendering, H2 answers, duplicate imagery, credibility claims, contact actions, and live canonical URL.\n'+
 '7. Publish only after the website owner/editor approves the final rendered page and documents the actual publication date.\n'+
 '8. Compare Search Console page-specific equivalent non-overlapping dates when accessible; otherwise label visibility as unverified. Track GBP call-button actions separately from connected calls.\n'+
 'This delivery is not proof of rankings, calls, jobs or paid revenue.\n';
 const manifest={
  format:'contentscale-growth-cms-handoff/v1',delivery:'reviewed_manual_changes',cms,
  existing_url:canonicalUrl,source_sha256:sha(originalHtml),focus_query:clean(focusQuery)||null,
  evidence_scope:evidenceScope,editor_approved:true,publication_allowed:false,
  automatic_publishing:false,no_paid_provider_required:true,
  source_snapshot_preserved:true, original_page_is_not_modified:true,
  meta:{title:pageTitle.trim(),description:metaDescription.trim()},
  language:clean(language)||'en',change_count:approved.length,
  change_evidence:approved.map(x=>x.evidence_ref),
  links,images:captions,warnings:[...new Set(warnings)]
 };
 const files=[
  {name:'manifest.json',content:JSON.stringify(manifest,null,2)+'\n'},
  {name:'01-implementation.md',content:'# ContentScale Growth — website owner handoff\n\n'+delivery},
  {name:'02-approved-copy.md',content:'# Approved page content\n\n'+allMarkdown+'\n'},
  {name:'03-content-fragments.html',content:'<!-- Paste sections into native SEO-indexable CMS content, not an iframe -->\n'+fragments+'\n'},
  {name:'04-seo-metadata.json',content:JSON.stringify({existing_page_url:canonicalUrl,title:pageTitle.trim(),description:metaDescription.trim(),new_page_required:false},null,2)+'\n'},
  {name:'05-measurement-plan.md',content:'# Baseline and outcome measurement\n\nEvidence: '+evidenceScope+
   '\nBefore publication: capture URL, 28-day page-scoped GSC impressions, clicks, CTR, position (if available), and current GBP interactions independently.\n'+
   'After publication: compare equal, non-overlapping page periods at 14/30/60 days; attribute causality cautiously.\n'+
   'Without Search Console access, label metrics NEEDS ACCESS. Do not insert zeros.\n'+
   'GBP phone-button taps are not answered calls; call logs, quotes, won jobs require independent information.\n'+
   'Review any real project photos/reviews with the owner; never invent customer experiences.\n'}
 ];
 return {status:'HANDOFF_READY_FOR_EDITOR',issues:[],warnings:[...new Set(warnings)],files,manifest,publication_allowed:false,
  downloadable:true,next_action:'HAND_TO_WEBSITE_OWNER_OR_CMS_EDITOR'};
}
// Native, dependency-free ZIP (stored entries); no runtime installs, paid services or network.
const crc32=b=>{let crc=~0;for(const v of b){crc^=v;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return (~crc)>>>0;};
function packageGrowthZip(files){
 if(!Array.isArray(files)||!files.length||files.length>20)throw Error('ZIP_FILES_REQUIRED');
 const chunks=[],central=[];let offset=0;
 for(const f of files){
  const name=String(f.name||'');if(!/^[a-z0-9][a-z0-9._-]*$/i.test(name)||name.length>120)throw Error('UNSAFE_ZIP_FILENAME');
  const filename=Buffer.from(name,'utf8'),data=Buffer.from(String(f.content||''),'utf8');
  if(data.length>900000)throw Error('ZIP_FILE_TOO_LARGE');
  const crc=crc32(data),local=Buffer.alloc(30),entry=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  chunks.push(local,filename,data);
  entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);
  entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);
  entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
  central.push(entry,filename);
  offset+=local.length+filename.length+data.length;
 }
 const table=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(table.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,table,end]);
}
module.exports={prepareGrowthCmsHandoff,packageGrowthZip,renderChangeMarkdown};
