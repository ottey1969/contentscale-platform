'use strict';
// One canonical Growth handoff: original-page improvement + optional intent/revenue CTA.
// Existing page is never modified and WordPress/Wix/custom CMS all receive the same deliverables.
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('./growth-cms-handoff.cjs');
const {planIntentToRevenue}=require('./growth-intent-revenue.cjs');
function buildUnifiedGrowthHandoff(input={}){
 const editorial=prepareGrowthCmsHandoff(input);
 const revenue=planIntentToRevenue({
  canonicalUrl:input.canonicalUrl,title:input.pageTitle,query:input.focusQuery,
  contentSummary:input.contentSummary,offers:input.offers||{},
  evidenceScope:input.evidenceScope||input.evidence_scope||'needs_access',
  primaryGoal:input.primaryGoal||'qualified_lead'
 });
 if(editorial.status!=='HANDOFF_READY_FOR_EDITOR'){
  return {status:'BLOCKED',editorial,revenue,files:[],zip:null,publication_allowed:false};
 }
 const files=editorial.files.map(f=>({name:f.name,content:f.content}));
 // No invented lead funnel. The CTA is included only after an approved, verified offer.
 const offerReady=revenue.status==='READY_FOR_EDITOR';
 const revenueManifest={schema:'contentscale-growth-unified/v1',existing_url:input.canonicalUrl,
  source_sha256:editorial.manifest.source_sha256,
  cms:editorial.manifest.cms,
  search_growth:{status:editorial.status,evidence_scope:editorial.manifest.evidence_scope,
   source_snapshot_preserved:true,requires_editor_approval:true},
  revenue_growth:{status:revenue.status,match:revenue.match,cta:revenue.cta,
   warnings:revenue.warnings,errors:revenue.errors,measurement:revenue.measurement},
  publication_allowed:false,requires_live_url_qa:true,automatic_publishing:false,
  no_paid_provider_required:true};
 files.push({name:'06-revenue-cta.html',content:offerReady?
  '<!-- Reviewed, contextual optional CTA: insert AFTER the complete answer. Do not replace primary content. -->\n'+revenue.html+'\n':
  '<!-- NOT APPROVED: no verified offer. Do not publish a placeholder CTA. -->\n'});
 files.push({name:'07-revenue-instructions.md',content:'# Revenue Growth handoff\n\n'+
  'Offer status: '+revenue.status+'\nMatch: '+(revenue.match||'none')+'\n'+
  'Only use a URL for an offer whose real destination and service availability were verified.\n'+
  'Place no more than one contextual CTA after the first complete search-intent answer.\n'+
  'Preserve the original SEO content, headings, internal links, image order and page canonical.\n'+
  'For Wix: add as native Wix text and button elements, not an iframe.\n'+
  'For WordPress/Elementor: add semantic text and a real button to the original page, no duplicate draft URL.\n'+
  'For any other CMS: use the same content and link with scoped styles.\n'+
  'Before launch: confirm URL, mobile layout, form or phone delivery, consent and tracking event.\n'+
  'Record organic landing sessions, CTA click, scan start/completion, qualified leads and won customers separately.\n'+
  'Missing CRM information is UNKNOWN, not zero. Keep original content readable without the CTA.\n'+
  'Warnings: '+revenue.warnings.join(', ')+'\nErrors: '+revenue.errors.join(', ')+'\n'});
 files.push({name:'08-unified-manifest.json',content:JSON.stringify(revenueManifest,null,2)+'\n'});
 return {status:offerReady?'UNIFIED_HANDOFF_READY_FOR_EDITOR':'EDITORIAL_HANDOFF_READY_REVENUE_NEEDS_EVIDENCE',
  editorial,revenue,manifest:revenueManifest,files,zip:packageGrowthZip(files),
  publication_allowed:false,next_action:offerReady?'REVIEW_BOTH_CHANGES_ON_ORIGINAL_PAGE':'VERIFY_REAL_OFFER'};
}
module.exports={buildUnifiedGrowthHandoff};
