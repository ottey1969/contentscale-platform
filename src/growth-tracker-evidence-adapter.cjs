'use strict';
// Read-only adapter for the existing tracker_gsc_queries canonical schema.
// Does not create evidence, infer missing Spy findings or mutate tracker records.
const {growthEvidenceContract}=require('./growth-evidence-contract.cjs');
const {inspectGrowthDraft}=require('./growth-evidence-render-gate.cjs');
function trackerGrowthReview({page={},gscRows=[],searchSpy,aiSpy,originalHtml='',draftHtml='',templateMarkers,claims,renderProof}={}){
 const pageId=Number(page.id);
 const url=String(page.url||'');
 const rows=Array.isArray(gscRows)?gscRows:[];
 const validPage=Number.isSafeInteger(pageId)&&pageId>0&&/^https:\/\/[^/]+\//i.test(url);
 const pageQueries=rows.filter(r=>validPage&&Number(r.page_id)===pageId&&(!r.page_url||r.page_url===url)&&(!r.url||r.url===url)&&r.evidence_scope==='page_verified'&&String(r.query||'').trim())
   .map(r=>({page_url:url,evidence_scope:'page_verified',query:r.query,
      clicks:r.clicks,impressions:r.impressions,position:r.position,imported_at:r.imported_at}));
 const verifiedZeroQueries=validPage&&pageQueries.length===0&&page.gsc_query_evidence_status==='exact_page_fetch_zero_queries'&&Boolean(page.gsc_autofetch_checked_at||page.gsc_query_fetch_at);
 const contract=growthEvidenceContract({url,pageQueries,searchSpy,aiSpy,originalHtml,templateMarkers});
 const result=inspectGrowthDraft({url,html:draftHtml,originalHtml,templateMarkers,evidence:{
   pageQueries:contract.pageQueries,searchSpy:contract.searchSpy,aiSpy:contract.aiSpy},
   claims,competitiveGaps:contract.competitiveGaps,renderProof,caseStudyLocked:page.case_study_active===true});
 const problems=contract.problems.map(code=>({code,message:'Required page-scoped research evidence missing or incomplete.'}));
 const issues=[...(!validPage?[{code:'TRACKER_PAGE_INVALID',message:'A valid canonical Tracker page ID and absolute HTTPS page URL are required.'}]:[]),...problems,...result.issues];
 return {ready:issues.length===0,status:page.case_study_active===true?'BLOCKED_CASE_STUDY':verifiedZeroQueries?'BLOCKED_VERIFIED_ZERO_QUERIES':issues.length?'BLOCKED':'READY_FOR_HUMAN_REVIEW',
   gsc_query_evidence_status:verifiedZeroQueries?'exact_page_fetch_zero_queries':pageQueries.length?'page_verified_queries':'not_verified',
   page_id:pageId,url,query_count:pageQueries.length,issues,warnings:result.warnings,
   evidence_status:contract.evidence_status,image_count:result.image_count};
}
module.exports={trackerGrowthReview};
