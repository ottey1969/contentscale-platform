'use strict';
// Integrates the existing Tracker, exact-page GSC writer and WordPress identity
// into ONE admin-only readiness endpoint. No parallel Growth database model.
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
function registerGrowthLiveRoutes({app,pool,verifyEngineAccess,fetchExactGsc}={}){
 if(!app||!pool||typeof verifyEngineAccess!=='function'||typeof fetchExactGsc!=='function')
  throw Error('GROWTH_ROUTE_DEPENDENCIES_REQUIRED');
 const adminOnly=(req,res,next)=>req.engineUser?.isAdmin===true?next():res.status(403).json({success:false,code:'GROWTH_ADMIN_ONLY'});
 const ids=req=>({pageId:Number(req.params.pageId),clientId:Number(req.query.client_id||req.body?.client_id)});
 const validIds=x=>Number.isSafeInteger(x.pageId)&&x.pageId>0&&Number.isSafeInteger(x.clientId)&&x.clientId>0;
 app.get('/api/growth/admin/pages/:pageId/readiness',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try {
   const state=await loadGrowthTrackerEvidence(pool,identity);
   const url=state.page.url;
   const [dups,mapping,profiles]=await Promise.all([
    pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[url]),
    pool.query('SELECT wordpress_post_id,wordpress_url FROM growth_wordpress_page_mapping WHERE tracker_page_id=$1 AND tracker_client_id=$2 LIMIT 2',[identity.pageId,identity.clientId]),
    pool.query("SELECT id,wp_url FROM content_profiles WHERE NULLIF(BTRIM(wp_user),'') IS NOT NULL AND NULLIF(BTRIM(wp_app_password),'') IS NOT NULL")
   ]);
   const site=new URL(url).origin;
   const credentialsConfigured=profiles.rows.some(p=>{try{return new URL(p.wp_url).origin===site;}catch{return false;}});
   const issues=[];
   if(state.page.case_study_active)issues.push('CASE_STUDY_LOCK');
   if(dups.rows.length!==1)issues.push('DUPLICATE_TRACKER_URL');
   if(!state.gscRows.length)issues.push('EXACT_PAGE_GSC_QUERIES_REQUIRED');
   if(mapping.rows.length!==1||mapping.rows[0].wordpress_url!==url||!Number.isSafeInteger(Number(mapping.rows[0].wordpress_post_id)))issues.push('REVIEWED_WORDPRESS_MAPPING_REQUIRED');
   if(!credentialsConfigured)issues.push('WORDPRESS_CREDENTIALS_REQUIRED');
   if(!state.page.html_content)issues.push('TRACKER_HTML_MISSING');
   const nextAction=issues.includes('CASE_STUDY_LOCK')?'PRESERVE_CASE_STUDY_BASELINE':
    issues.includes('WORDPRESS_CREDENTIALS_REQUIRED')?'CONFIGURE_WORDPRESS_PROFILE':
    issues.includes('REVIEWED_WORDPRESS_MAPPING_REQUIRED')?'REVIEW_WORDPRESS_MAPPING':
    issues.includes('EXACT_PAGE_GSC_QUERIES_REQUIRED')?'VERIFY_EXACT_PAGE_GSC':
    issues.length?'RESOLVE_VERIFICATION_ISSUES':'REVIEW_GROWTH_DRAFT';
   return res.json({success:true,status:issues.length?'BLOCKED':'READY_FOR_EDITOR_VERIFICATION',
    next_action:nextAction,
    page_id:identity.pageId,client_id:identity.clientId,url,
    gsc_verified_queries:state.gscRows.length,
    search_spy_present:!!state.page.serp_spy,
    ai_evidence_count:state.aiEvidence.length,
    mapping_present:mapping.rows.length===1,
    wordpress_credentials_configured:credentialsConfigured,
    issues,publication_allowed:false});
  }catch(error){return res.status(503).json({success:false,code:'GROWTH_READINESS_UNAVAILABLE'});}
 });
 app.get('/api/growth/admin/pages/:pageId/click-opportunities',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try{
   const state=await loadGrowthTrackerEvidence(pool,identity);
   const rows=state.gscRows.filter(r=>r.source_page_url===state.page.url&&r.evidence_scope==='page_verified');
   const commercial=/\b(roof|roofing|replacement|repair|installation|install|leak|storm|damage|emergency|contractor|estimate|quote)\b/i;
   const brand=new URL(state.page.url).hostname.toLowerCase().includes('perfectroofingteam.com')?/perfect\s*roofing\s*team/i:/(?!)/;
   const opportunities=rows.map(r=>({query:String(r.query||'').trim(),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||null,imported_at:r.imported_at||null}))
    .filter(r=>r.query&&r.impressions>0&&!brand.test(r.query))
    .map(r=>({...r,commercial_intent_signal:commercial.test(r.query)}))
    .sort((a,b)=>Number(b.commercial_intent_signal)-Number(a.commercial_intent_signal)||b.impressions-a.impressions);
   const lastImport=rows.reduce((latest,r)=>{const time=Date.parse(r.imported_at||'');return Number.isFinite(time)&&time>latest?time:latest;},0);
   const ageDays=lastImport?Math.max(0,Math.floor((Date.now()-lastImport)/86400000)):null;
   const stale=ageDays===null||ageDays>3;
   const status=state.page.case_study_active?'CASE_STUDY_LOCKED':
    !opportunities.length?'NEEDS_EXACT_PAGE_GSC':stale?'GSC_REFRESH_REQUIRED':'VERIFIED_QUERIES_REVIEW';
   return res.json({success:true,page_id:identity.pageId,url:state.page.url,
    status,case_study_locked:state.page.case_study_active,
    metric_scope:'page_verified_only',historical_page_aggregate_excluded:true,
    gsc_last_imported_at:lastImport?new Date(lastImport).toISOString():null,gsc_age_days:ageDays,
    fresh_for_planning:!stale,
    next_action:state.page.case_study_active?'PRESERVE_CASE_STUDY_BASELINE':stale?'REFRESH_EXACT_PAGE_GSC':'REVIEW_CLICK_OPPORTUNITIES',
    queries:opportunities,publication_allowed:false});
  }catch(error){return res.status(503).json({success:false,code:'GROWTH_CLICK_OPPORTUNITIES_UNAVAILABLE'});}
 });
 app.post('/api/growth/admin/pages/:pageId/refresh-gsc',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try {
   const state=await loadGrowthTrackerEvidence(pool,identity);
   if(state.page.case_study_active)return res.status(409).json({success:false,code:'CASE_STUDY_LOCK'});
   const result=await fetchExactGsc(identity.clientId,identity.pageId,state.page.url);
   if(result.page_checked!==true)return res.status(409).json({success:false,code:result.reason||'GSC_PAGE_NOT_VERIFIED'});
   return res.json({success:true,page_id:identity.pageId,verified_page_url:state.page.url,verified_queries:result.saved,page_checked:true});
  }catch(error){return res.status(503).json({success:false,code:'GSC_EXACT_PAGE_FETCH_FAILED'});}
 });
}
module.exports={registerGrowthLiveRoutes};
