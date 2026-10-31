// The text the editor copies from a Growth proposal: every change with its placement, its new H2 and its text, the pages
// it was compared with (not a factual source) and what still needs a fact check. Shared by the browser and the tests.
(function(root){
 'use strict';
 var PLACE={ADD_AFTER_SECTION:'Add as a new section directly after',EXTEND_SECTION:'Expand the existing section',REPLACE_PASSAGE:'Replace a passage in'};
 function placementLine(p,fallback){
  var mode=p&&p.mode,h=(p&&p.section_heading)||fallback||'';
  if(PLACE[mode]&&h)return PLACE[mode]+' “'+h+'”';
  return h?'Section: “'+h+'”':'Placement: where it fits best (choose yourself)';
 }
 // Statements the owner removed leave the copied text (sentence by sentence, whitespace-insensitive).
 function withoutRemoved(text,o){
  var gone=((o.publication_readiness&&o.publication_readiness.statements)||[]).filter(function(x){return x.decision==='REMOVE'}).map(function(x){return x.text});
  var t=String(text||'');
  gone.forEach(function(g){var re=new RegExp('\\s*'+g.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+'));t=t.replace(re,'')});
  return t.replace(/\n{3,}/g,'\n\n').trim();
 }
 function growthEditCopyText(o){
  o=o||{};
  var changes=[{placement:o.placement,section:o.target_section,heading:o.draft_heading,text:o.proposed_text,existing:o.existing_passage}]
   .concat((o.additional_sections||[]).map(function(a){return {placement:a.placement,heading:a.heading,text:a.text}}));
  var ready=o.publication_readiness,blockers=(ready&&ready.blockers)||[];
  var out=[];
  // Reviewable is not publishable: the copied text says so first, with what is still required.
  if(ready&&ready.status==='NOT_READY_FOR_PUBLICATION')out.push('DRAFT FOR REVIEW — NOT READY FOR PUBLICATION\n'+blockers.map(function(b){return (b.required?'Required: ':'Recommended: ')+b.detail}).join('\n'));
  out.push('Target page: '+String(o.target_url||''));
  changes.forEach(function(c,i){
   if(!c.text)return;
   var part=['— Change '+(i+1)+' of '+changes.length+' —',placementLine(c.placement,c.section)];
   if(c.heading)part.push('New H2: '+c.heading);
   if(c.existing)part.push('Existing passage:\n'+c.existing);
   part.push('Proposed text:\n'+withoutRemoved(c.text,o));
   out.push(part.join('\n'));
  });
  var cmp=o.source_comparison&&o.source_comparison.competitor_url;
  if(cmp)out.push('Compared with (a ranking page, not a factual source): '+cmp);
  var rb=(blockers.filter(function(b){return b.code==='UNVERIFIED_STATEMENTS'})[0]||null);
  var n=ready?(rb?rb.count:0):(o.claim_review&&o.claim_review.counts&&o.claim_review.counts.general_statement_unverified);
  if(n)out.push('Fact-check: '+n+' statement(s) are not verified by any source. Check each before publishing.');
  var kept=((ready&&ready.statements)||[]).filter(function(x){return x.decision==='KEEP'}).length;
  if(kept)out.push('Confirmed by the owner: '+kept+' statement(s).');
  out.push('Editor approval required. No automatic publication.');
  return out.join('\n\n');
 }
 if(typeof module==='object'&&module.exports)module.exports={growthEditCopyText:growthEditCopyText};
 else root.growthEditCopyText=growthEditCopyText;
})(this);
