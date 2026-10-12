'use strict';
// Deterministic opportunity plan from existing exact-page verified GSC evidence.
// No predicted uplift, invented queries, inferred search intent or competitor claims.
function buildGrowthOpportunityPlan({page={},gscRows=[],searchSpy,aiSpy}={}){
 const pageId=Number(page.id),clientId=Number(page.tracker_client_id),url=String(page.url||'');
 const valid=Number.isSafeInteger(pageId)&&pageId>0&&Number.isSafeInteger(clientId)&&clientId>0&&/^https:\/\/[^/]+\//i.test(url);
 const rows=(Array.isArray(gscRows)?gscRows:[]).filter(r=>valid&&Number(r.page_id)===pageId&&Number(r.tracker_client_id)===clientId&&r.source_page_url===url&&r.evidence_scope==='page_verified'&&String(r.query||'').trim());
 const queries=rows.map(r=>{
  const clicks=Number(r.clicks),impressions=Number(r.impressions),position=Number(r.position);
  return {query:String(r.query).trim(),clicks:Number.isFinite(clicks)&&clicks>=0?clicks:null,impressions:Number.isFinite(impressions)&&impressions>=0?impressions:null,position:r.position!=null&&Number.isFinite(position)&&position>0?position:null};
 }).sort((a,b)=>(b.impressions??-1)-(a.impressions??-1));
 const blockers=[];
 if(!valid)blockers.push('TRACKER_PAGE_INVALID');
 if(!queries.length)blockers.push('GSC_EXACT_PAGE_MISSING');
 if(!Array.isArray(searchSpy))blockers.push('SEARCH_SPY_NOT_MAPPED');
 if(!Array.isArray(aiSpy))blockers.push('AI_SPY_NOT_MAPPED');
 if(page.case_study_active===true)blockers.push('CASE_STUDY_LOCK');
 const actions=queries.filter(q=>q.impressions!==null&&q.impressions>0).map(q=>({
  type:'REVIEW_SEARCH_INTENT',query:q.query,evidence:{clicks:q.clicks,impressions:q.impressions,position:q.position},
  recommendation:'Verify the SERP intent for this exact query and evaluate whether the existing page answers it; do not rewrite before evidence review.',
  priority_basis:'observed_impressions',expected_clicks:null
 }));
 return {page_id:pageId,tracker_client_id:clientId,url,status:blockers.length?'RESEARCH_INCOMPLETE':'EVIDENCE_READY_FOR_PLANNING',blockers,actions,
  search_spy_status:Array.isArray(searchSpy)?'SUPPLIED_UNVERIFIED_SHAPE':'NOT_MAPPED',
  ai_spy_status:Array.isArray(aiSpy)?'SUPPLIED_UNVERIFIED_SHAPE':'NOT_MAPPED',automatic_draft_allowed:false};
}
module.exports={buildGrowthOpportunityPlan};
