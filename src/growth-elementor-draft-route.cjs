'use strict';
const crypto=require('node:crypto');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const {prepareGrowthElementorDraft}=require('./growth-elementor-draft.cjs');
const {executeGrowthElementorDraft}=require('./growth-elementor-draft-executor.cjs');
const {createGrowthElementorRestBridge}=require('./growth-elementor-rest-bridge.cjs');
const sha=x=>crypto.createHash('sha256').update(String(x||'')).digest('hex');
const validId=n=>Number.isSafeInteger(n)&&n>0;
function registerGrowthElementorDraftRoute({app,pool,verifyGrowthAdmin,fetchImpl=globalThis.fetch}={}){
 if(typeof app?.post!=='function'||typeof pool?.query!=='function'||typeof verifyGrowthAdmin!=='function')
  throw Error('GROWTH_ELEMENTOR_ROUTE_DEPENDENCIES_REQUIRED');
 app.post('/api/growth/admin/pages/:pageId/elementor-draft',verifyGrowthAdmin,async(req,res)=>{
  const fail=(code,status=409,extra={})=>res.status(status).set('Cache-Control','private, no-store')
   .json({success:false,status:'BLOCKED',issues:[code],publication_allowed:false,...extra});
  if(req.engineUser?.isAdmin!==true)return fail('GROWTH_ADMIN_ONLY',403);
  const pageId=Number(req.params.pageId),clientId=Number(req.body?.client_id);
  const edits=req.body?.edits,approval=req.body?.editor_approved;
  if(!validId(pageId)||!validId(clientId))return fail('CANONICAL_TRACKER_IDS_REQUIRED',400);
  if(approval!==true||!Array.isArray(edits)||edits.length<1||edits.length>8)
   return fail('EXPLICIT_EDITOR_APPROVED_EDITS_REQUIRED',400);
  if(edits.some(x=>!x||x.approved!==true||typeof x.evidence_ref!=='string'||
    !x.evidence_ref.startsWith('gsc:')||typeof x.before!=='string'||typeof x.after!=='string'||
    x.after.length>90000||x.before.length>90000||typeof x.widget_id!=='string'))
   return fail('GSC_GROUNDED_EDIT_DETAILS_REQUIRED',400);
  let state,mapped,profile,dups;
  try {
   state=await loadGrowthTrackerEvidence(pool,{clientId,pageId});
   [mapped,profile,dups]=await Promise.all([
    pool.query('SELECT wordpress_post_id,wordpress_url,source_sha256 FROM growth_wordpress_page_mapping WHERE tracker_client_id=$1 AND tracker_page_id=$2 LIMIT 2',[clientId,pageId]),
    pool.query('SELECT id,wp_url,wp_user,wp_app_password FROM content_profiles WHERE id=$1 LIMIT 1',[state.page.profile_id]),
    pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3',[state.page.url])
   ]);
  }catch{return fail('CANONICAL_TRACKER_OR_SCHEMA_UNAVAILABLE',503)}
  const mapping=mapped.rows||[],prof=profile.rows?.[0];
  if(state.page.case_study_active===true)return fail('CASE_STUDY_LOCK');
  if(dups.rows?.length!==1||Number(dups.rows[0].id)!==pageId||Number(dups.rows[0].tracker_client_id)!==clientId)
   return fail('DUPLICATE_TRACKER_URL');
  if(mapping.length!==1||mapping[0].wordpress_url!==state.page.url||
    !validId(Number(mapping[0].wordpress_post_id))||
    mapping[0].source_sha256!==sha(state.page.html_content))
   return fail('REVIEWED_WORDPRESS_IDENTITY_REQUIRED');
  const supported=new Set(state.gscRows.filter(x=>x.source_page_url===state.page.url&&
    x.evidence_scope==='page_verified').map(x=>'gsc:'+String(x.query||'').toLowerCase().trim()));
  if(edits.some(x=>!supported.has(x.evidence_ref.toLowerCase().trim())))
   return fail('VERIFIED_PAGE_QUERY_EVIDENCE_REQUIRED');
  if(!prof?.wp_user||!prof?.wp_app_password||!prof?.wp_url)
   return fail('WORDPRESS_PROFILE_CREDENTIALS_REQUIRED');
  const sourcePostId=Number(mapping[0].wordpress_post_id);
  let type,bridge;
  try {
   if(new URL(prof.wp_url).origin!==new URL(state.page.url).origin)
    return fail('WORDPRESS_PROFILE_DOMAIN_MISMATCH');
   type=String(req.body?.wordpress_post_type||'');
   if(!['pages','posts'].includes(type))return fail('WORDPRESS_TYPE_REVIEW_REQUIRED',400);
   bridge=createGrowthElementorRestBridge({siteUrl:prof.wp_url,username:prof.wp_user,
    applicationPassword:prof.wp_app_password,fetchImpl});
  }catch{return fail('WORDPRESS_PROFILE_BRIDGE_CONFIGURATION_REQUIRED')}
  let original;
  try{original=await bridge.readOriginalPost({id:sourcePostId,type});}
  catch(error){return fail(error?.message==='ELEMENTOR_BRIDGE_NOT_INSTALLED'?'ELEMENTOR_PLUGIN_REQUIRED':'FRESH_ELEMENTOR_READ_FAILED',503)}
  const candidate=prepareGrowthElementorDraft({
   sourceJson:original.elementor_data,sourceSha256:sha(original.elementor_data),approved:true,edits
  });
  if(candidate.status!=='DRAFT_FOR_REVIEW')return fail(candidate.issues?.[0]||'ELEMENTOR_CANDIDATE_BLOCKED');
  const checkCanonicalState=async()=>{
   const fresh=await loadGrowthTrackerEvidence(pool,{clientId,pageId});
   const m=await pool.query('SELECT wordpress_post_id,wordpress_url,source_sha256 FROM growth_wordpress_page_mapping WHERE tracker_client_id=$1 AND tracker_page_id=$2 LIMIT 2',[clientId,pageId]);
   return {case_study_active:fresh.page.case_study_active,
    allow_draft:m.rows?.length===1&&m.rows[0].wordpress_url===fresh.page.url&&
     m.rows[0].source_sha256===sha(fresh.page.html_content)&&fresh.page.url===state.page.url,
    wordpress_post_id:Number(m.rows?.[0]?.wordpress_post_id)};
  };
  const result=await executeGrowthElementorDraft({
   approvedCandidate:candidate,sourcePostId,sourcePostType:type,
   readOriginalPost:bridge.readOriginalPost,checkCanonicalState,
   createDraft:bridge.createDraft,writeDraftElementorMeta:bridge.writeDraftElementorMeta,
   readDraft:bridge.readDraft
  });
  if(result.status!=='ELEMENTOR_DRAFT_VERIFIED')
   return res.status(409).set('Cache-Control','private, no-store').json({
    success:false,...result,publication_allowed:false,
    next_action:result.draft?.needs_cleanup_review?'REVIEW_UNPUBLISHED_DRAFT':'RECHECK_SOURCE_AND_EDITOR_APPROVAL'});
  return res.status(201).set('Cache-Control','private, no-store').json({
   success:true,status:result.status,client_id:clientId,page_id:pageId,
   draft:result.draft,source_unchanged:true,publication_allowed:false,
   next_action:'REVIEW_ELEMENTOR_DRAFT_VISUALLY_BEFORE_PUBLISHING'
  });
 });
}
module.exports={registerGrowthElementorDraftRoute};
