'use strict';
// Read-only adapter for the existing tracker_gsc_queries canonical schema.
// Does not create evidence, infer missing Spy findings or mutate tracker records.
const {growthEvidenceContract}=require('./growth-evidence-contract.cjs');
const {inspectGrowthDraft}=require('./growth-evidence-render-gate.cjs');
function trackerGrowthReview({page={},gscRows=[],searchSpy,aiSpy,originalHtml='',draftHtml='',templateMarkers,claims,renderProof}={}){
 const pageId=Number(page.id);
 const url=String(page.url||'');
 const rows=Array.isArray(gscRows)?gscRows:[];
 const pageQueries=rows.filter(r=>Number.isSafeInteger(pageId)&&pageId>0&&Number(r.page_id)===pageId&&r.evidence_scope==='page_verified'&&String(r.query||'').trim())
   .map(r=>({page_url:url,evidence_scope:'page_verified',query:r.query,
      clicks:r.clicks,impressions:r.impressions,position:r.position,imported_at:r.imported_at}));
 const contract=growthEvidenceContract({url,pageQueries,searchSpy,aiSpy,originalHtml,templateMarkers});
 const result=inspectGrowthDraft({url,html:draftHtml,originalHtml,templateMarkers,evidence:{
   pageQueries:contract.pageQueries,searchSpy:contract.searchSpy,aiSpy:contract.aiSpy},
   claims,competitiveGaps:contract.competitiveGaps,renderProof,caseStudyLocked:page.case_study_active===true});
 const problems=contract.problems.map(code=>({code,message:'Required page-scoped research evidence missing or incomplete.'}));
 const issues=[...problems,...result.issues];
 return {ready:issues.length===0,status:issues.length?'BLOCKED':'READY_FOR_HUMAN_REVIEW',
   page_id:pageId,url,query_count:pageQueries.length,issues,warnings:result.warnings,
   evidence_status:contract.evidence_status,image_count:result.image_count};
}
module.exports={trackerGrowthReview};
