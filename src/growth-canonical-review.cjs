'use strict';
// Explicit read-only bridge. Evidence supplied by the existing research workflow;
// no simulated Spy discoveries and no database mutations.
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {trackerGrowthReview}=require('./growth-tracker-evidence-adapter.cjs');
const {buildGrowthOpportunityPlan}=require('./growth-opportunity-plan.cjs');
const {summarizeGrowthAiVisibility}=require('./growth-ai-visibility-summary.cjs');
async function reviewCanonicalGrowthDraft({db,pageId,clientId,searchSpy,aiSpy,draftHtml,templateMarkers,claims,renderProof}={}){
 const canonical=await loadGrowthTrackerEvidence(db,{pageId,clientId});
 const review=trackerGrowthReview({
  page:canonical.page,
  gscRows:canonical.gscRows,
  searchSpy,aiSpy,
  originalHtml:canonical.page.html_content||'',
  draftHtml,templateMarkers,claims,renderProof
 });
 return {...review,ai_visibility:summarizeGrowthAiVisibility({page:canonical.page,rows:canonical.aiEvidence}),opportunity_plan:buildGrowthOpportunityPlan({page:canonical.page,gscRows:canonical.gscRows,searchSpy,aiSpy})};
}
module.exports={reviewCanonicalGrowthDraft};
