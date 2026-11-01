'use strict';
// CMS-neutral, no external service, no CMS credentials, no AI or paid APIs.
// This package describes a reviewed change to an EXISTING canonical page.
// A website owner can implement it in Wix, WordPress, Webflow, Squarespace,
// or a custom CMS using native SEO-indexable text components.
const {createHash}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const {assessDraftClaims,headingMismatch}=require('./growth-draft-claim-guard.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const clean=x=>String(x==null?'':x).trim();
const asText=html=>String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
 .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isLocalBusiness(html){
 const h=String(html||'');
 return /"@type"\s*:\s*(?:\[[^\]]*)?"[A-Za-z]*LocalBusiness"/.test(h)||
  (/"(?:openingHours|openingHoursSpecification|geo)"\s*:/.test(h)&&/"streetAddress"\s*:/.test(h))||
  (/href=["']tel:/i.test(h)&&/"streetAddress"\s*:|<address\b/i.test(h));
}
function renderChangeMarkdown(html){
 return String(html).replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(_,n,x)=>'\n'+'#'.repeat(Number(n))+' '+asText(x)+'\n\n')
 .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,url,text)=>'['+asText(text)+']('+url+')')
 .replace(/<li\b[^>]*>/gi,'\n- ').replace(/<\/(?:li|p|ul|ol|section|div)>/gi,'\n\n')
 .replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ')
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\n{3,}/g,'\n\n').trim();
}
const PLACEMENT_MODES={EXTEND_SECTION:'Extend the existing section',ADD_AFTER_SECTION:'Add as a new section directly after'};
const placementText=p=>p?PLACEMENT_MODES[p.mode]+' “'+p.section_heading+'”':'Choose a suitable position on the page';
// growthProposal: {id, sections:[{h2,text}]} — the checked Growth proposal this handoff came from (for the audit trail).
// reviewNotes: {needs_fact_check, needs_owner_confirmation, needs_safety_review} — sentences the owner must check before publishing.
function prepareGrowthCmsHandoff({canonicalUrl,originalHtml,changes=[],editorApproved=false,
 cms='generic',pageTitle,metaDescription,focusQuery='',evidenceScope='needs_access',
 caseStudyLocked=false,sourceExpectedSha256,language='en',growthProposal=null,reviewNotes=null,addedProposalIds=[]}={}){
 const issues=[],warnings=[];
 let url;
 try{url=new URL(canonicalUrl)}catch{}
 if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
    !url.hostname||url.port)issues.push('CANONICAL_HTTPS_URL_REQUIRED');
 if(typeof originalHtml!=='string'||!originalHtml.trim())issues.push('ORIGINAL_PAGE_SNAPSHOT_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(String(sourceExpectedSha256||'')))issues.push('SOURCE_REVISION_APPROVAL_REQUIRED');
 else if(typeof originalHtml==='string'&&sha(originalHtml)!==sourceExpectedSha256)issues.push('SOURCE_REVISION_CHANGED');
 if(caseStudyLocked)issues.push('CASE_STUDY_BASELINE_LOCKED');
 if(editorApproved!==true)issues.push('EDITOR_APPROVAL_REQUIRED');
 if(!Array.isArray(changes)||changes.length<1||changes.length>12)issues.push('APPROVED_SECTION_COUNT_REQUIRED');
 // A section that extends an existing section is a sub-section of it: its heading becomes H3 (an H2 would start a new
 // section on the page). Owner 2026-11-01 package: "Extend the existing section" with an H2.
 const approved=(Array.isArray(changes)?changes:[]).map(x=>x&&x.placement&&x.placement.mode==='EXTEND_SECTION'&&typeof x.html==='string'?{...x,html:x.html.replace(/<(\/?)h2\b/gi,'<$1h3')}:x);
 // Local business (address, phone, opening hours or a LocalBusiness type on the page): only then the package speaks of
 // calls, Google Business Profile, jobs and project photos. Read from the original page, never assumed.
 const localBusiness=isLocalBusiness(originalHtml);
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
  if(part.placement!=null){
   const p=part.placement;
   if(!p||!PLACEMENT_MODES[p.mode]||typeof p.section_heading!=='string'||!clean(p.section_heading)||p.section_heading.length>200)issues.push('PLACEMENT_INVALID');
  }
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
 const norm=t=>asText(t).toLowerCase().replace(/\s+/g,' ').trim();
 // A concept with sentences Growth flagged is only packaged when the final text PROVES they were resolved: no flagged
 // sentence is still in it, the text passes the same claim checks against the original page, and no heading still
 // promises reasons while giving steps. A tick in the UI is not proof; this is.
 const flaggedNotes=reviewNotes&&Array.isArray(reviewNotes.flagged)?reviewNotes.flagged.filter(Boolean):[];
 const blockedDetails=[];
 if(flaggedNotes.length&&approved.length){
  const finalText=norm(approved.map(x=>String(x.html||'')).join(' '));
  for(const f of flaggedNotes)if(f.sentence&&finalText.includes(norm(f.sentence)))blockedDetails.push({code:'FLAGGED_SENTENCE_STILL_IN_TEXT',sentence:clean(f.sentence).slice(0,300),reason:clean(f.reason).slice(0,200)});
  const recheck=assessDraftClaims({text:approved.map(x=>asText(x.html)).join(' '),destinationText:asText(String(originalHtml||''))});
  for(const v of recheck.violations)if(!blockedDetails.some(b=>b.sentence&&norm(b.sentence)===norm(v.sentence)))
   blockedDetails.push({code:'UNRESOLVED_'+v.code,sentence:clean(v.sentence).slice(0,300),reason:clean(v.reason).slice(0,200)});
  for(const x of approved){const h=(String(x.html||'').match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/i)||[])[2];
   const mm=h&&headingMismatch(asText(h),asText(String(x.html).replace(/<h([23])\b[^>]*>[\s\S]*?<\/h\1>/i,' ')));
   if(mm)blockedDetails.push({code:'UNRESOLVED_'+mm.code,sentence:null,reason:'“'+asText(h)+'”: '+mm.reason})}
  if(blockedDetails.length)issues.push('FLAGGED_CONTENT_NOT_RESOLVED');
 }
 if(issues.length)return {status:'BLOCKED',issues:[...new Set(issues)],warnings:[...new Set(warnings)],files:[],publication_allowed:false,
  ...(blockedDetails.length?{blocked_details:blockedDetails.slice(0,20)}:{})};
 const fragments=approved.map(x=>x.html.trim()).join('\n\n');
 // New sections that share one anchor are a chain in package order: the second goes directly after the first, never
 // also "directly after" the same existing heading (which would reverse or interleave them).
 const where=(x,i)=>{const prev=approved[i-1];
  return prev&&x.placement&&prev.placement&&x.placement.mode==='ADD_AFTER_SECTION'&&prev.placement.mode==='ADD_AFTER_SECTION'&&
   x.placement.section_heading===prev.placement.section_heading?'Add as a new section directly after Change '+i+' (both follow “'+x.placement.section_heading+'”)':placementText(x.placement)};
 const allMarkdown=approved.map((x,i)=>'### Approved change '+(i+1)+'\nEvidence: '+x.evidence_ref+'\nPlacement: '+where(x,i)+'\n\n'+renderChangeMarkdown(x.html)).join('\n\n');
 const placementSteps=approved.map((x,i)=>'   - Change '+(i+1)+': '+where(x,i)+'.').join('\n');
 // Audit trail: was the checked Growth text published as proposed, or edited by the editor?
 const proposal=growthProposal&&Array.isArray(growthProposal.sections)?{id:growthProposal.id,
  // Sections the editor added from an earlier stored concept carry that concept's evidence_ref and are compared there.
  editor_changed_text:(own=>own.length!==growthProposal.sections.length||own.some((x,i)=>{const s=growthProposal.sections[i]||{};return norm(x.html)!==norm('<h2>'+s.h2+'</h2>'+String(s.text||''))}))
   (approved.filter(x=>!/^growth_proposal:\d+$/.test(String(x.evidence_ref||''))||x.evidence_ref==='growth_proposal:'+growthProposal.id))}:null;
 // Review notes belong to the Growth text: a sentence the editor removed or rewrote is no longer listed, and new
 // editor text is marked as not checked by Growth instead of inheriting checks written for other sentences.
 const approvedText=norm(approved.map(x=>x.html).join(' '));
 const listOf=k=>(reviewNotes&&Array.isArray(reviewNotes[k])?reviewNotes[k]:[]).map(x=>clean(x).slice(0,400)).filter(Boolean)
  .filter(x=>approvedText.includes(norm(x))).slice(0,20);
 const review={fact_check:listOf('needs_fact_check'),owner_confirmation:listOf('needs_owner_confirmation'),safety_review:listOf('needs_safety_review'),
  // Sentences Growth flagged in a selection concept: the package exists only when they are resolved (checked above), so
  // they are listed as a record of what was removed or rewritten, not as open items.
  flagged:(reviewNotes&&Array.isArray(reviewNotes.flagged)?reviewNotes.flagged:[]).filter(Boolean)
   .slice(0,30).map(f=>(f.sentence?'“'+clean(f.sentence).slice(0,300)+'” — ':'“'+clean(f.h2).slice(0,140)+'” (whole section) — ')+clean(f.reason).slice(0,200))};
 // What each approved Growth section rests on; a section the editor removed is no longer listed.
 review.basis=(reviewNotes&&Array.isArray(reviewNotes.basis)?reviewNotes.basis:[]).filter(b=>b&&b.h2&&approvedText.includes(norm(b.h2))).slice(0,10)
  .map(b=>'**'+clean(b.h2).slice(0,200)+'** answers “'+clean(b.answers).slice(0,200)+'”. Sources: '+((b.sources||[]).map(x=>clean(x).slice(0,220)).join('; ')||'none')+'.'+(b.warning?' ⚠ '+clean(b.warning).slice(0,300):''));
 const editorText=proposal&&proposal.editor_changed_text;
 const hasReview=editorText||review.fact_check.length+review.owner_confirmation.length+review.safety_review.length+review.flagged.length+review.basis.length>0;
 const delivery='CMS-independent handoff for existing page '+canonicalUrl+'\n'+
 'No autopublishing. Implement in your normal website editor using native, indexable text components.\n'+
 'Platform: '+cms+'. Keep original URL, navigation, design, existing text and images unless explicitly reviewed.\n'+
 '1. Open the ORIGINAL page in the CMS, not a new duplicate URL.\n'+
 '2. Place each approved section exactly as stated, and preserve the existing H1, template, images, mobile styling, and content:\n'+placementSteps+'\n'+
 '3. Set page SEO title and meta description only if the editor supports them; do not paste meta tags into the page body.\n'+
 (localBusiness?'4. Insert and test contextual internal/external links and click-to-call controls.\n':'4. Insert and test the contextual internal link(s) and the way visitors contact you (contact form, booking or contact page link).\n')+
 '5. Use native Wix text elements for SEO (when CMS is Wix); do not treat an HTML iframe/embed as the page content.\n'+
 '6. Check desktop/mobile rendering, H2 answers, duplicate imagery, credibility claims, contact actions, and live canonical URL.\n'+
 '7. Publish only after the website owner/editor approves the final rendered page and documents the actual publication date.\n'+
 '8. Compare Search Console page-specific equivalent non-overlapping dates when accessible; otherwise label visibility as unverified. '+
  (localBusiness?'Track GBP call-button actions separately from connected calls.\n':'Count enquiries from your own contact form, e-mail or CRM for the same periods (Growth measurement page).\n')+
 (localBusiness?'This delivery is not proof of rankings, calls, jobs or paid revenue.\n':'This delivery is not proof of rankings, enquiries or revenue.\n');
 const manifest={
  format:'contentscale-growth-cms-handoff/v1',delivery:'reviewed_manual_changes',cms,
  existing_url:canonicalUrl,source_sha256:sha(originalHtml),focus_query:clean(focusQuery)||null,
  evidence_scope:evidenceScope,editor_approved:true,publication_allowed:false,
  automatic_publishing:false,no_paid_provider_required:true,
  source_snapshot_preserved:true, original_page_is_not_modified:true,
  meta:{title:pageTitle.trim(),description:metaDescription.trim()},
  language:clean(language)||'en',change_count:approved.length,
  change_evidence:approved.map(x=>x.evidence_ref),
  change_placements:approved.map(x=>x.placement||null),
  growth_proposal:proposal,growth_proposals_added:(Array.isArray(addedProposalIds)?addedProposalIds:[]).filter(Number.isSafeInteger).slice(0,10),editor_text_unchecked_by_growth:!!editorText,review_items:{fact_check:review.fact_check.length,owner_confirmation:review.owner_confirmation.length,safety_review:review.safety_review.length,flagged:review.flagged.length},
  links,images:captions,warnings:[...new Set(warnings)]
 };
 const files=[
  {name:'manifest.json',content:JSON.stringify(manifest,null,2)+'\n'},
  {name:'01-implementation.md',content:'# ContentScale Growth — website owner handoff\n\n'+delivery},
  {name:'02-approved-copy.md',content:'# Approved page content\n\n'+allMarkdown+'\n'},
  {name:'03-content-fragments.html',content:'<!-- Paste sections into native SEO-indexable CMS content, not an iframe -->\n'+fragments+'\n'},
  {name:'04-seo-metadata.json',content:JSON.stringify({existing_page_url:canonicalUrl,title:pageTitle.trim(),description:metaDescription.trim(),new_page_required:false},null,2)+'\n'},
  {name:'05-measurement-plan.md',content:'# Baseline and outcome measurement\n\nEvidence: '+evidenceScope+
   '\nBefore publication: capture URL, 28-day page-scoped GSC impressions, clicks, CTR, position (if available)'+(localBusiness?', and current GBP interactions independently':'')+'.\n'+
   'After publication: compare equal, non-overlapping page periods at 14/30/60 days; attribute causality cautiously.\n'+
   'Without Search Console access, label metrics NEEDS ACCESS. Do not insert zeros.\n'+
   (localBusiness?'GBP phone-button taps are not answered calls; call logs, quotes, won jobs require independent information.\n'+
   'Review any real project photos/reviews with the owner; never invent customer experiences.\n':
   'Enquiries: count contact requests for this page from your own form, e-mail or CRM for the same two periods; Growth never estimates them.\n'+
   'Never invent customer experiences, reviews or results.\n')},
  // Why these changes were proposed: the research and sources they rest on, as recorded when the concept was written.
  ...(reviewNotes&&reviewNotes.dossier&&typeof reviewNotes.dossier==='object'?[{name:'07-evidence-dossier.json',content:JSON.stringify(reviewNotes.dossier,null,2)+'\n'}]:[]),
  ...(hasReview?[{name:'06-fact-check-before-publishing.md',content:'# Check before publishing\n\nThe automatic checks test task fit, duplication, wording reuse and claims; they do not prove that a sentence is true.\n'+
   (review.flagged.length?'\n## Flagged by Growth — resolved in this text (checked)\n\nThese sentences were flagged in the concept. The package was only made because none of them is still in the approved text and the text passes the same checks again.\n\n'+review.flagged.map(x=>'- '+x).join('\n')+'\n':'')+
   (review.basis.length?'\n## What each section rests on\n\n'+review.basis.map(x=>'- '+x).join('\n')+'\n':'')+
   (review.fact_check.length?'\n## Fact-check\n\n'+review.fact_check.map(x=>'- [ ] '+x).join('\n')+'\n':'')+
   (review.owner_confirmation.length?'\n## Confirm with the business\n\n'+review.owner_confirmation.map(x=>'- [ ] '+x).join('\n')+'\n':'')+
   (review.safety_review.length?'\n## Safety review by a qualified professional\n\n'+review.safety_review.map(x=>'- [ ] '+x).join('\n')+'\n':'')+
   (editorText?'\n## Text written or changed by the editor\n\nGrowth did not check the sentences the editor wrote or changed. Check every factual statement in them yourself before publishing.\n':'')}]:[])
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
module.exports={prepareGrowthCmsHandoff,packageGrowthZip,renderChangeMarkdown,isLocalBusiness};
