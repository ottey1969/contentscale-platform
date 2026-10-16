'use strict';
// Draft-only Elementor JSON edit. Original widgets, IDs, CSS, image references,
// locations and headings are left intact except for explicit editor-approved edits.
// No WordPress publication or remote write is performed by this module.
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function prepareGrowthElementorDraft({sourceJson,sourceSha256,edits=[],approved=false}={}){
 const fail=(code)=>({status:'BLOCKED',issues:[code],elementor_json:null,publish_allowed:false});
 if(!approved||!Array.isArray(edits)||!edits.length)return fail('EDITOR_APPROVAL_AND_EDITS_REQUIRED');
 if(typeof sourceJson!=='string'||!/^[a-f0-9]{64}$/.test(String(sourceSha256||''))||hash(sourceJson)!==sourceSha256)
  return fail('FRESH_ELEMENTOR_SOURCE_HASH_REQUIRED');
 let nodes;
 try{nodes=JSON.parse(sourceJson)}catch{return fail('ELEMENTOR_JSON_INVALID')}
 if(!Array.isArray(nodes)||nodes.length===0)return fail('ELEMENTOR_WIDGET_TREE_REQUIRED');
 const source=JSON.stringify(nodes);
 const updated=structuredClone(nodes);
 const widgets=new Map(),ids=new Set();
 function walk(value){
  if(!value||typeof value!=='object')return;
  if(typeof value.id==='string'){
   if(ids.has(value.id))throw Error('DUPLICATE_ELEMENTOR_WIDGET_ID');
   ids.add(value.id);
   if(value.elType==='widget'&&value.widgetType==='html'&&typeof value.settings?.html==='string')widgets.set(value.id,value);
  }
  for(const child of Object.values(value))if(typeof child==='object'&&child) {
   if(Array.isArray(child))child.forEach(walk);else walk(child);
  }
 }
 try{walk(updated)}catch{return fail('DUPLICATE_ELEMENTOR_WIDGET_ID')}
 const edited=new Set(),results=[];
 for(const edit of edits){
  if(!edit||edit.approved!==true||!String(edit.evidence_ref||'').trim())return fail('EDIT_EVIDENCE_REQUIRED');
  const id=String(edit.widget_id||'');
  const widget=widgets.get(id);
  if(!widget||edited.has(id))return fail('UNIQUE_HTML_WIDGET_REQUIRED');
  const oldHtml=widget.settings.html;
  if(typeof edit.before!=='string'||!edit.before||typeof edit.after!=='string'||!edit.after.trim()||oldHtml.split(edit.before).length!==2)
   return fail('EXACT_UNIQUE_HTML_SEGMENT_REQUIRED');
  if(/<script\b|javascript:|<iframe\b|<form\b|<object\b|<embed\b/i.test(edit.after))
   return fail('UNSAFE_ELEMENTOR_HTML');
  const candidate=oldHtml.replace(edit.before,edit.after);
  const sourceImages=[...oldHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(x=>x[1]);
  const candidateImages=[...candidate.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(x=>x[1]);
  if(sourceImages.some((src,i)=>candidateImages[i]!==src))
   return fail('ELEMENTOR_IMAGE_REMOVED_OR_REORDERED');
  const sourceHeadings=[...oldHtml.matchAll(/<h1\b/gi)].length,candidateHeadings=[...candidate.matchAll(/<h1\b/gi)].length;
  if(sourceHeadings!==candidateHeadings)return fail('ELEMENTOR_H1_STRUCTURE_CHANGED');
  widget.settings.html=candidate;
  edited.add(id);
  results.push({widget_id:id,evidence_ref:edit.evidence_ref,before_sha256:hash(oldHtml),after_sha256:hash(candidate)});
 }
 const candidateJson=JSON.stringify(updated);
 // Defensive check that the proposed changes are limited to approved widget HTML.
 for(const id of edited){
  const w=widgets.get(id);
  if(!w||!w.settings?.html)return fail('ELEMENTOR_WIDGET_RECHECK_FAILED');
 }
 if(source===candidateJson)return fail('NO_EFFECTIVE_ELEMENTOR_CHANGES');
 return {status:'DRAFT_FOR_REVIEW',issues:[],elementor_json:candidateJson,
  original_sha256:sourceSha256,candidate_sha256:hash(candidateJson),
  changed_widgets:results,publish_allowed:false,
  next_action:'CREATE_UNPUBLISHED_ELEMENTOR_DRAFT_THEN_VERIFY_BUILDER_META'};
}
module.exports={prepareGrowthElementorDraft};
