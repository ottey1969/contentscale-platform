'use strict';
const {createHash}=require('node:crypto');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('./growth-cms-handoff.cjs');
const {registerGrowthCmsHandoffScreen}=require('./growth-cms-handoff-screen.cjs');
function registerGrowthCmsHandoffRoute({app,pool,verifyEngineAccess}={}){
 if(typeof app?.post!=='function'||typeof pool?.query!=='function'||typeof verifyEngineAccess!=='function')
  throw Error('GROWTH_CMS_HANDOFF_DEPENDENCIES_REQUIRED');
 const admin=(req,res,next)=>req.engineUser?.isAdmin===true?next():res.status(403).json({success:false,code:'GROWTH_ADMIN_ONLY'});
 registerGrowthCmsHandoffScreen(app);
 app.get('/api/growth/admin/pages/:pageId/cms-handoff/source',verifyEngineAccess,admin,async(req,res)=>{
  const clientId=Number(req.query?.client_id),pageId=Number(req.params.pageId);
  if(!Number.isSafeInteger(clientId)||clientId<1||!Number.isSafeInteger(pageId)||pageId<1)
   return res.status(400).json({success:false,code:'TRACKER_IDS_REQUIRED'});
  try{
   const state=await loadGrowthTrackerEvidence(pool,{clientId,pageId});
   const page=state.page,dups=await pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[page.url]);
   if(state.page.case_study_active)
    return res.status(409).json({success:false,code:'CASE_STUDY_BASELINE_LOCKED'});
   if(dups.rows?.length!==1||Number(dups.rows[0].id)!==pageId||Number(dups.rows[0].tracker_client_id)!==clientId)
    return res.status(409).json({success:false,code:'DUPLICATE_CANONICAL_PAGE_IDENTITY'});
   if(!page.html_content?.trim())
    return res.status(409).json({success:false,code:'TRACKER_PAGE_SOURCE_REQUIRED'});
   const source_sha256=createHash('sha256').update(page.html_content).digest('hex');
   const queries=[...new Set((state.gscRows||[]).filter(x=>
    x.source_page_url===page.url&&x.evidence_scope==='page_verified')
    .map(x=>String(x.query||'').trim()).filter(Boolean))].slice(0,20);
   return res.set('Cache-Control','private, no-store')
    .json({success:true,client_id:clientId,page_id:pageId,canonical_url:page.url,
     source_sha256,editor_review_required:true,auto_publish:false,
     cms_options:['wix','wordpress','webflow','squarespace','custom','generic'],
     page_verified_query_examples:queries,
     wordpress_required:false,paid_api_required:false,source_snapshot_available:true,
     next_action:'PREPARE_CMS_NEUTRAL_HANDOFF'});
  }catch{return res.status(503).json({success:false,code:'CANONICAL_SOURCE_UNAVAILABLE'});}
 });
 app.post('/api/growth/admin/pages/:pageId/cms-handoff',verifyEngineAccess,admin,async(req,res)=>{
  const clientId=Number(req.body?.client_id),pageId=Number(req.params.pageId);
  if(!Number.isSafeInteger(clientId)||clientId<1||!Number.isSafeInteger(pageId)||pageId<1)
   return res.status(400).json({success:false,status:'BLOCKED',code:'TRACKER_IDS_REQUIRED'});
  const originalExpected=req.body?.source_sha256;
  if(!/^[a-f0-9]{64}$/.test(String(originalExpected||'')))
   return res.status(400).json({success:false,status:'BLOCKED',code:'SOURCE_REVISION_APPROVAL_REQUIRED'});
  let page,duplicated,verifiedRows=[];
  try{
   const state=await loadGrowthTrackerEvidence(pool,{clientId,pageId});page=state.page;verifiedRows=state.gscRows||[];
   duplicated=await pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[page.url]);
  }catch{return res.status(503).json({success:false,status:'BLOCKED',code:'CANONICAL_TRACKER_PAGE_UNAVAILABLE'});}
  if(duplicated.rows?.length!==1||Number(duplicated.rows[0].id)!==pageId||Number(duplicated.rows[0].tracker_client_id)!==clientId)
   return res.status(409).json({success:false,status:'BLOCKED',code:'DUPLICATE_CANONICAL_PAGE_IDENTITY'});
  const sourceHash=createHash('sha256').update(page.html_content||'').digest('hex');
  if(sourceHash!==originalExpected)return res.status(409).json({success:false,status:'BLOCKED',code:'TRACKER_SOURCE_CHANGED'});
  const requestedEvidence=String(req.body?.evidence_scope||'needs_access');
  // Never trust a caller to self-assert a verified Google query.
  if(requestedEvidence==='verified'&&!verifiedRows.some(r=>
    r.evidence_scope==='page_verified'&&r.source_page_url===page.url&&
    String(r.query||'').toLowerCase().trim()===String(req.body?.focus_query||'').toLowerCase().trim()))
   return res.status(409).set('Cache-Control','private, no-store')
    .json({success:false,status:'BLOCKED',code:'VERIFIED_GSC_EVIDENCE_NOT_FOUND',publication_allowed:false});
  const handoff=prepareGrowthCmsHandoff({
   canonicalUrl:page.url,originalHtml:page.html_content,caseStudyLocked:page.case_study_active,
   sourceExpectedSha256:originalExpected,editorApproved:req.body?.editor_approved,
   cms:req.body?.cms||'generic',pageTitle:req.body?.seo_title,
   metaDescription:req.body?.meta_description,changes:req.body?.approved_changes,
   focusQuery:req.body?.focus_query||'',evidenceScope:req.body?.evidence_scope||'needs_access',
   language:req.body?.language||'en'
  });
  if(handoff.status!=='HANDOFF_READY_FOR_EDITOR')
   return res.status(409).set('Cache-Control','private, no-store')
    .json({success:false,status:handoff.status,issues:handoff.issues,warnings:handoff.warnings,publication_allowed:false});
  if(req.body?.format==='zip'){
   let zip;
   try{zip=packageGrowthZip(handoff.files);}catch{return res.status(409).json({success:false,status:'BLOCKED',code:'DELIVERY_PACKAGE_INVALID'});}
   return res.set('Cache-Control','private, no-store')
    .set('Content-Type','application/zip')
    .set('Content-Disposition','attachment; filename="contentscale-growth-cms-handoff.zip"')
    .send(zip);
  }
  if(req.body?.format&&req.body.format!=='json')
   return res.status(400).json({success:false,status:'BLOCKED',code:'HANDOFF_FORMAT_UNSUPPORTED'});
  return res.set('Cache-Control','private, no-store').json({success:true,client_id:clientId,page_id:pageId,
   status:handoff.status,publication_allowed:false,next_action:handoff.next_action,
   warnings:handoff.warnings,manifest:handoff.manifest,files:handoff.files});
 });
}
module.exports={registerGrowthCmsHandoffRoute};
