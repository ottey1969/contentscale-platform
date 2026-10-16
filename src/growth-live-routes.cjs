'use strict';
// Integrates the existing Tracker, exact-page GSC writer and WordPress identity
// into ONE admin-only readiness endpoint. No parallel Growth database model.
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {compareGrowthGscWindows}=require('./growth-gsc-window-comparison.cjs');
const {evaluateDailyClickBreakthrough}=require('./growth-click-breakthrough.cjs');
const {readVerifiedDailyGrowthGsc}=require('./growth-daily-gsc-reader.cjs');
const {importVerifiedDailyGrowthGsc}=require('./growth-daily-gsc-import.cjs');
const {growthServiceAccountToken}=require('./growth-gsc-service-token.cjs');
const {registerGrowthCommercialOutcomeRoutes}=require('./growth-commercial-outcome-routes.cjs');
const {classifyGrowthSearchIntent}=require('./growth-search-intent.cjs');
const {bucket: classifyGrowthBrand}=require('./tracker-growth-cockpit.cjs');
const {registerGrowthCmsHandoffRoute}=require('./growth-cms-handoff-route.cjs');
function registerGrowthLiveRoutes({app,pool,verifyEngineAccess,fetchExactGsc,fetchVerifiedDailyGsc,resolveGrowthGscToken}={}){
 if(!app||!pool||typeof verifyEngineAccess!=='function')
  throw Error('GROWTH_ROUTE_DEPENDENCIES_REQUIRED');
 const adminOnly=(req,res,next)=>req.engineUser?.isAdmin===true?next():res.status(403).json({success:false,code:'GROWTH_ADMIN_ONLY'});
 // Company-wide funnel stages remain private and independent of page-specific GSC rankings.
 registerGrowthCommercialOutcomeRoutes({app,pool,verifyEngineAccess});
 // Universal reviewed handoff is NOT dependent on CMS credentials, GSC access or paid providers.
 registerGrowthCmsHandoffRoute({app,pool,verifyEngineAccess});
 const ids=req=>({pageId:Number(req.params.pageId),clientId:Number(req.query.client_id||req.body?.client_id)});
 const validIds=x=>Number.isSafeInteger(x.pageId)&&x.pageId>0&&Number.isSafeInteger(x.clientId)&&x.clientId>0;
 app.get('/api/growth/admin/pages/:pageId/readiness',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try {
   const state=await loadGrowthTrackerEvidence(pool,identity);
   const url=state.page.url;
   const dups=await pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[url]);
   // WordPress identity tables are OPTIONAL for Wix and manual handoff. A missing
   // CMS mapping must never make universal Growth readiness unavailable.
   const [mappingLookup,profileLookup]=await Promise.allSettled([
    pool.query('SELECT wordpress_post_id,wordpress_url FROM growth_wordpress_page_mapping WHERE tracker_page_id=$1 AND tracker_client_id=$2 LIMIT 2',[identity.pageId,identity.clientId]),
    pool.query("SELECT id,wp_url FROM content_profiles WHERE NULLIF(BTRIM(wp_user),'') IS NOT NULL AND NULLIF(BTRIM(wp_app_password),'') IS NOT NULL")
   ]);
   const mapping=mappingLookup.status==='fulfilled'?mappingLookup.value:{rows:[]};
   const profiles=profileLookup.status==='fulfilled'?profileLookup.value:{rows:[]};
   const site=new URL(url).origin;
   const credentialsConfigured=profiles.rows.some(p=>{try{return new URL(p.wp_url).origin===site;}catch{return false;}});
   const issues=[];
   if(state.page.case_study_active)issues.push('CASE_STUDY_LOCK');
   if(dups.rows.length!==1||Number(dups.rows[0]?.id)!==identity.pageId||Number(dups.rows[0]?.tracker_client_id)!==identity.clientId)issues.push('DUPLICATE_TRACKER_URL');
   const exactPageGscRows=(state.gscRows||[]).filter(r=>r.source_page_url===url&&r.evidence_scope==='page_verified');
   if(!exactPageGscRows.length)issues.push('EXACT_PAGE_GSC_QUERIES_REQUIRED');
   if(mapping.rows.length!==1||mapping.rows[0].wordpress_url!==url||!Number.isSafeInteger(Number(mapping.rows[0].wordpress_post_id)))issues.push('REVIEWED_WORDPRESS_MAPPING_REQUIRED');
   if(!credentialsConfigured)issues.push('WORDPRESS_CREDENTIALS_REQUIRED');
   if(mappingLookup.status==='rejected')issues.push('WORDPRESS_MAPPING_SCHEMA_OPTIONAL');
   if(profileLookup.status==='rejected')issues.push('WORDPRESS_PROFILE_READ_OPTIONAL');
   if(!state.page.html_content)issues.push('TRACKER_HTML_MISSING');
   const handoffIssues=issues.filter(x=>['CASE_STUDY_LOCK','DUPLICATE_TRACKER_URL','TRACKER_HTML_MISSING'].includes(x));
   const handoffReady=handoffIssues.length===0;
   const wpIssues=issues.filter(x=>['REVIEWED_WORDPRESS_MAPPING_REQUIRED','WORDPRESS_CREDENTIALS_REQUIRED','WORDPRESS_MAPPING_SCHEMA_OPTIONAL','WORDPRESS_PROFILE_READ_OPTIONAL'].includes(x));
   const wpReady=issues.length===0;
   const nextAction=state.page.case_study_active?'PRESERVE_CASE_STUDY_BASELINE':
    handoffReady&&!wpReady?'PREPARE_CMS_NEUTRAL_HANDOFF':
    wpReady?'REVIEW_GROWTH_DRAFT': 'RESOLVE_PAGE_SOURCE_ISSUES';
   return res.json({success:true,status:wpReady?'READY_FOR_EDITOR_VERIFICATION':
    handoffReady?'READY_FOR_CMS_NEUTRAL_HANDOFF':'BLOCKED',
    next_action:nextAction,
    page_id:identity.pageId,client_id:identity.clientId,url,
    gsc_verified_queries:exactPageGscRows.length,
    search_spy_present:!!state.page.serp_spy,
    ai_evidence_count:state.aiEvidence.length,
    mapping_present:mapping.rows.length===1,
    wordpress_credentials_configured:credentialsConfigured,
    cms_neutral:{ready:handoffReady,requires_wordpress:false,requires_paid_provider:false,
     supported:['wix','wordpress','webflow','squarespace','custom','generic'],
     blockers:handoffIssues,requires_gsc:false,evidence_scope:exactPageGscRows.length?'verified':'needs_access'},
    wordpress_draft:{ready:wpReady,issues:wpIssues},
    issues:handoffReady?handoffIssues:issues,
    warnings:handoffReady?issues:[],
    publication_allowed:false});
  }catch(error){return res.status(503).json({success:false,code:'GROWTH_READINESS_UNAVAILABLE'});}
 });
 app.get('/api/growth/admin/pages/:pageId/click-opportunities',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try{
   const state=await loadGrowthTrackerEvidence(pool,identity);
   const rows=state.gscRows.filter(r=>r.source_page_url===state.page.url&&r.evidence_scope==='page_verified');
   const commercial=/\b(roof|roofing|replacement|repair|installation|install|leak|storm|damage|emergency|contractor|estimate|quote|chimney|flashing|gutter|gutters|siding|skylight|waterproofing)\b/i;
   const brandDomain=new URL(state.page.url).hostname.toLowerCase();
   const opportunities=rows.map(r=>({query:String(r.query||'').trim(),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||null,imported_at:r.imported_at||null}))
    .filter(r=>r.query&&r.impressions>0&&classifyGrowthBrand(r.query,brandDomain)==='non_brand')
    .map(r=>{const match=classifyGrowthSearchIntent(r.query);return {...r,commercial_intent_signal:commercial.test(r.query),search_intent:match.intent,conversion_goal:match.goal,intent_next_action:match.next_action,assumed_sales_probability:null};})
    .sort((a,b)=>Number(b.commercial_intent_signal)-Number(a.commercial_intent_signal)||b.impressions-a.impressions);
   const lastImport=rows.reduce((latest,r)=>{const time=Date.parse(r.imported_at||'');return Number.isFinite(time)&&time>latest?time:latest;},0);
   const ageDays=lastImport?Math.max(0,Math.floor((Date.now()-lastImport)/86400000)):null;
   const stale=ageDays===null||ageDays>3;
   const status=state.page.case_study_active?'CASE_STUDY_LOCKED':
    !opportunities.length?(rows.length?'NO_NONBRAND_CANDIDATES_REVIEW':'NEEDS_EXACT_PAGE_GSC'):stale?'GSC_REFRESH_REQUIRED':'VERIFIED_QUERIES_REVIEW';
   return res.json({success:true,page_id:identity.pageId,url:state.page.url,
    status,case_study_locked:state.page.case_study_active,
    metric_scope:'page_verified_only',historical_page_aggregate_excluded:true,
    gsc_last_imported_at:lastImport?new Date(lastImport).toISOString():null,gsc_age_days:ageDays,
    fresh_for_planning:!stale,
    brand_classification:'heuristic_domain_stem',branded_or_ambiguous_queries_excluded:rows.filter(r=>r.query&&classifyGrowthBrand(r.query,brandDomain)!=='non_brand').length,
    nonbrand_click_totals_verified:false,
    next_action:state.page.case_study_active?'PRESERVE_CASE_STUDY_BASELINE':!opportunities.length&&rows.length?'REVIEW_BRAND_OR_AMBIGUOUS_QUERIES':stale?'REFRESH_EXACT_PAGE_GSC':'REVIEW_CLICK_OPPORTUNITIES',
    queries:opportunities,publication_allowed:false});
  }catch(error){return res.status(503).json({success:false,code:'GROWTH_CLICK_OPPORTUNITIES_UNAVAILABLE'});}
 });
 app.get('/api/growth/admin/pages/:pageId/outcomes',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);
  if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  let state;
  try {state=await loadGrowthTrackerEvidence(pool,identity);}
  catch {return res.status(503).json({success:false,code:'GROWTH_CANONICAL_PAGE_UNAVAILABLE'});}
  try {
   const runs=await pool.query(
    'SELECT page_url,gsc_property,start_date,end_date,clicks,impressions,position,query_count,imported_at FROM growth_gsc_page_import_runs WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND page_url=$3 ORDER BY end_date DESC,imported_at DESC LIMIT 100',
    [identity.clientId,identity.pageId,state.page.url]);
   const comparison=compareGrowthGscWindows({pageUrl:state.page.url,runs:runs.rows||[]});
   return res.json({success:true,page_id:identity.pageId,client_id:identity.clientId,
    case_study_locked:state.page.case_study_active===true,
    publication_allowed:false,metric_scope:'gsc_exact_page_import_runs',
    ...comparison});
  }catch(error){
   const missing=error?.code==='42P01';
   return res.status(503).json({success:false,status:missing?'GSC_HISTORY_SCHEMA_REQUIRED':'GSC_HISTORY_UNAVAILABLE',
    code:missing?'GSC_HISTORY_SCHEMA_REQUIRED':'GSC_HISTORY_UNAVAILABLE',
    page_id:identity.pageId,publication_allowed:false,
    next_action:missing?'VERIFY_EXISTING_GSC_IMPORT_MIGRATION':'RETRY_READ_ONLY_GSC_HISTORY'});
  }
 });
 app.get('/api/growth/admin/pages/:pageId/daily-breakthrough',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);
  if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  const publishedOn=String(req.query.published_on||'');
  if(!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(publishedOn))return res.status(400).json({success:false,code:'VERIFIED_PUBLICATION_DATE_REQUIRED'});
  try{
   const state=await loadGrowthTrackerEvidence(pool,identity);
   const source=typeof fetchVerifiedDailyGsc==='function'?
    await fetchVerifiedDailyGsc(identity.clientId,identity.pageId,state.page.url):
    await readVerifiedDailyGrowthGsc(pool,{clientId:identity.clientId,pageId:identity.pageId,pageUrl:state.page.url});
   if(source?.status==='NO_VERIFIED_DAILY_GSC')return res.set('Cache-Control','private, no-store')
    .json({success:true,status:'NO_VERIFIED_DAILY_GSC',confirmed:false,page_id:identity.pageId,
     next_action:'IMPORT_VERIFIED_EXACT_PAGE_GSC_DAYS',publication_allowed:false});
   if(source?.status==='MULTIPLE_GSC_PROPERTIES_REVIEW_REQUIRED')return res.status(409)
    .json({success:false,code:'MULTIPLE_GSC_PROPERTIES_REVIEW_REQUIRED',publication_allowed:false});
   if(source?.page_url!==state.page.url||!source?.gsc_property||!Array.isArray(source.rows))
    return res.status(409).json({success:false,code:'EXACT_PAGE_DAILY_GSC_REQUIRED'});
   const outcome=evaluateDailyClickBreakthrough({pageUrl:state.page.url,
    gscProperty:source.gsc_property,publishedOn,asOf:new Date().toISOString().slice(0,10),rows:source.rows});
   return res.set('Cache-Control','private, no-store').json({success:true,page_id:identity.pageId,
    case_study_locked:state.page.case_study_active===true,publication_allowed:false,
    source:'verified_exact_page_daily_gsc',...outcome,
    // The query-string publication date is a user claim, not proof of when content changed.
    status:outcome.confirmed?'PUBLICATION_DATE_VERIFICATION_REQUIRED':outcome.status,
    confirmed:false,publication_date_verified:false,
    measured_click_lift_candidate:outcome.confirmed===true});
  }catch(error){const missing=error?.code==='42P01';return res.status(503).json({success:false,code:missing?'DAILY_GSC_SCHEMA_REQUIRED':'DAILY_GSC_UNAVAILABLE',publication_allowed:false});}
 });
 app.post('/api/growth/admin/pages/:pageId/import-daily-gsc',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);
  if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  const growthTokenResolver=typeof resolveGrowthGscToken==='function'?resolveGrowthGscToken:
   process.env.GSC_SERVICE_ACCOUNT_JSON?growthServiceAccountToken:null;
  if(typeof growthTokenResolver!=='function')return res.status(409).json({
   success:false,code:'AUTHORIZED_GSC_TOKEN_RESOLVER_REQUIRED',publication_allowed:false});
  const startDate=String(req.body?.start_date||''),endDate=String(req.body?.end_date||'');
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(startDate)||
     !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endDate))
   return res.status(400).json({success:false,code:'DAILY_GSC_DATES_REQUIRED'});
  try{
   const state=await loadGrowthTrackerEvidence(pool,identity);
   if(state.page.case_study_active)return res.status(409).json({success:false,code:'CASE_STUDY_LOCK'});
   const client=await pool.query('SELECT id,gsc_property FROM tracker_clients WHERE id=$1 LIMIT 1',[identity.clientId]);
   const property=client.rows?.[0]?.gsc_property;
   if(!property)return res.status(409).json({success:false,code:'REGISTERED_GSC_PROPERTY_REQUIRED'});
   const token=await growthTokenResolver(identity.clientId,property);
   if(!token)return res.status(409).json({success:false,code:'AUTHORIZED_GSC_CONNECTION_REQUIRED'});
   const result=await importVerifiedDailyGrowthGsc({db:pool,clientId:identity.clientId,
    pageId:identity.pageId,pageUrl:state.page.url,gscProperty:property,
    accessToken:token,startDate,endDate});
   return res.set('Cache-Control','private, no-store').json({success:true,
    page_id:identity.pageId,publication_allowed:false,...result});
  }catch(error){
   const schemaMissing=error?.code==='42P01';
   const invalid=/^(VERIFIED_GSC_PAGE_IDENTITY_REQUIRED|SETTLED_DAILY_DATE_WINDOW_REQUIRED|GSC_DAILY_RESPONSE_REJECTED|TRACKER_CANONICAL_PAGE_CHANGED)$/.test(error?.message||'');
   return res.status(schemaMissing?503:invalid?409:503).json({success:false,
    code:schemaMissing?'DAILY_GSC_SCHEMA_REQUIRED':invalid?error.message:'DAILY_GSC_IMPORT_UNAVAILABLE',
    publication_allowed:false});
  }
 });
 app.post('/api/growth/admin/pages/:pageId/refresh-gsc',verifyEngineAccess,adminOnly,async(req,res)=>{
  const identity=ids(req);if(!validIds(identity))return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try {
   const state=await loadGrowthTrackerEvidence(pool,identity);
   if(state.page.case_study_active)return res.status(409).json({success:false,code:'CASE_STUDY_LOCK'});
   if(typeof fetchExactGsc!=='function')return res.status(409).json({success:false,code:'GSC_CONNECTION_OPTIONAL',next_action:'CONTINUE_WITH_CMS_NEUTRAL_HANDOFF'});
   const result=await fetchExactGsc(identity.clientId,identity.pageId,state.page.url);
   if(result.page_checked!==true)return res.status(409).json({success:false,code:result.reason||'GSC_PAGE_NOT_VERIFIED'});
   return res.json({success:true,page_id:identity.pageId,verified_page_url:state.page.url,verified_queries:result.saved,page_checked:true});
  }catch(error){return res.status(503).json({success:false,code:'GSC_EXACT_PAGE_FETCH_FAILED'});}
 });
}
module.exports={registerGrowthLiveRoutes};
