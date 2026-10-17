'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('./growth-cms-handoff.cjs');
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
const {generateGrowthEditorDraft}=require('./growth-source-grounded-editor.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
async function loadEditablePage(pool,token,pageId,{allowMissingHtml=false}={}){
 const id=Number(pageId);
 if(!Number.isSafeInteger(id)||id<1)return {status:400,code:'VALID_PAGE_ID_REQUIRED'};
 const c=(await pool.query("SELECT id,domain,token,status FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[token])).rows[0];
 if(!c)return {status:403,code:'OWNER_LINK_REQUIRED'};
 if(c.status==='paused'||c.status==='disabled')return {status:403,code:'TRACKER_UNAVAILABLE'};
 const p=(await pool.query("SELECT p.id,p.url,p.html_content,p.keyword, EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_client_id=$1 AND cs.tracker_page_id=p.id AND cs.status='active') AS case_study_active FROM tracker_pages p WHERE p.tracker_client_id=$1 AND p.id=$2 LIMIT 1",[c.id,id])).rows[0];
 if(!p)return {status:404,code:'TRACKER_PAGE_NOT_FOUND'};
 let hostname,home;
 try{
  hostname=new URL(p.url).hostname;
  home=new URL('https://'+String(c.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
 }catch{return {status:409,code:'CANONICAL_DOMAIN_INVALID'}}
 if(hostname!==home)return {status:403,code:'PAGE_DOMAIN_MISMATCH'};
 if(p.case_study_active)return {status:409,code:'CASE_STUDY_BASELINE_LOCKED'};
 if(!String(p.html_content||'').trim()&&!allowMissingHtml)return {status:409,code:'ORIGINAL_PAGE_SNAPSHOT_REQUIRED'};
 // Canonical identity is unique per Tracker client, not globally across other customers.
 // A different client's matching URL never invalidates this owner's page.
 const duplicates=await pool.query("SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 AND tracker_client_id=$2 LIMIT 3",[p.url,c.id]);
 if(duplicates.rows.length!==1||Number(duplicates.rows[0].id)!==id||Number(duplicates.rows[0].tracker_client_id)!==Number(c.id))
  return {status:409,code:'DUPLICATE_CANONICAL_PAGE_IDENTITY'};
 return {status:200,client:c,page:p,source_sha256:String(p.html_content||'').trim()?sha(p.html_content):null,source_mode:String(p.html_content||'').trim()?'TRACKER_SAVED_HTML':'MANUAL_HTML_REQUIRED'};
}
function registerTrackerGrowthCmsExport(app,pool,{fetchLive=fetchPublicGrowthHtml,generateDraft=generateGrowthEditorDraft}={}){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||!pool||typeof pool.query!=='function')
  throw Error('CMS_HANDOFF_DEPENDENCIES_REQUIRED');
 app.get('/track/:token/growth/cms-export',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.query.page_id,{allowMissingHtml:true});
   if(v.status!==200){
    const copy={
     CASE_STUDY_BASELINE_LOCKED:'This tracked page has an active Case Study. Growth research remains available, but publishing and CMS handoff are protected until the measurement cycle is released.',
     DUPLICATE_CANONICAL_PAGE_IDENTITY:'This same URL has more than one page record inside this Tracker account. Review the duplicated records; nothing has been changed.',
     CANONICAL_DOMAIN_INVALID:'The website domain could not be verified against the current Tracker account.',
     PAGE_DOMAIN_MISMATCH:'This page belongs to a different website than the current Tracker.',
     OWNER_LINK_REQUIRED:'Use the Tracker owner link to prepare a CMS package. Shared read-only links can still open Growth research.',
     VALID_PAGE_ID_REQUIRED:'Choose a tracked page from Growth first.',
     ORIGINAL_PAGE_SNAPSHOT_REQUIRED:'The original page source is missing. Choose the manual, explicitly unverified HTML handoff option instead.'
    };
    const msg=copy[v.code]||'This page cannot currently prepare a CMS handoff.';
    const back='/track/'+encodeURIComponent(String(req.params.token||''))+'/growth';
    return res.status(v.status).set('Cache-Control','private, no-store')
     .set('X-Robots-Tag','noindex, nofollow').set('Referrer-Policy','no-referrer')
     .type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Growth handoff status</title><body style="max-width:700px;margin:50px auto;font:16px/1.55 system-ui;padding:20px"><h1>CMS handoff is not available for this page</h1><p>'+msg+'</p><p>Reason: <code>'+v.code+'</code></p><p><a href="'+back+'">← Return to Growth research</a></p><p>No scan, GSC connection or website change was started.</p></body></html>');
   }
   const html=fs.readFileSync(path.resolve(__dirname,'../public/growth-cms-neutral-handoff.html'),'utf8');
   return res.set('Cache-Control','private, no-store').set('X-Robots-Tag','noindex, nofollow')
    .set('Referrer-Policy','no-referrer').type('html').send(html);
  }catch(e){return res.status(503).type('text').send('CMS handoff temporarily unavailable')}
 });
 app.get('/api/tracker-client/:token/growth/cms-export/source',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.query.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   return res.set('Cache-Control','private, no-store').json({success:true,page_id:v.page.id,
    canonical_url:v.page.url,working_keyword:v.page.keyword||null,source_sha256:v.source_sha256,
    source_mode:v.source_mode,manual_source_required:v.source_mode==='MANUAL_HTML_REQUIRED',
    manual_source_not_stored:true,
    cms_options:['wix','wordpress','webflow','squarespace','custom','generic'],
    gsc_required:false,editor_approval_required:true,auto_publishing:false});
  }catch{return res.status(503).json({success:false,code:'SOURCE_SNAPSHOT_UNAVAILABLE'})}
 });
 app.get('/api/tracker-client/:token/growth/cms-export/public-source',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.query.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   if(v.source_mode==='TRACKER_SAVED_HTML')return res.status(409).json({success:false,code:'SAVED_TRACKER_HTML_ALREADY_AVAILABLE'});
   const live=await fetchLive(v.page.url);
   const originalHost=new URL(v.page.url).hostname.replace(/^www\./,'');
   const redirectedHost=new URL(live.final_url||v.page.url).hostname.replace(/^www\./,'');
   if(originalHost!==redirectedHost)return res.status(409).json({success:false,code:'LIVE_SOURCE_REDIRECTED_OFF_DOMAIN'});
   if(typeof live.html!=='string'||live.html.length<120||Buffer.byteLength(live.html,'utf8')>120000||
      !/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(live.html))
    return res.status(409).json({success:false,code:'LIVE_HTML_NEEDS_OWNER_REVIEW'});
   return res.set('Cache-Control','private, no-store').set('X-Robots-Tag','noindex, nofollow')
    .set('Referrer-Policy','no-referrer').json({success:true,page_id:v.page.id,
     canonical_url:v.page.url,html:live.html,source_sha256:sha(live.html),
     retrieved_at:live.retrieved_at||null,source_provenance:'LIVE_PUBLIC_HTML_OBSERVED',
     live_render_verified:false,auto_published:false,stored_in_tracker:false,
     next_action:'OWNER_REVIEW_ORIGINAL_HTML_AND_APPROVE_EDITOR_HANDOFF'});
  }catch(e){console.warn('[growth-cms-public-source]',String(e?.code||'SOURCE_FETCH_FAILED'));
   return res.status(503).json({success:false,code:'PUBLIC_HTML_UNAVAILABLE_USE_MANUAL_SOURCE'})}
 });
 app.post('/api/tracker-client/:token/growth/cms-export/editor-draft',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.body?.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   let original=v.page.html_content;
   if(!String(original||'').trim()){
    const live=await fetchLive(v.page.url);
    if(new URL(live.final_url||v.page.url).hostname.replace(/^www\./,'')!==new URL(v.page.url).hostname.replace(/^www\./,''))
     return res.status(409).json({success:false,code:'PAGE_SOURCE_DOMAIN_MISMATCH'});
    original=live.html;
   }
   const out=await generateDraft({sourceHtml:original,pageUrl:v.page.url,
    focusQuery:String(req.body?.focus_query||v.page.keyword||'').slice(0,160),topics:[]});
   return res.set('Cache-Control','private, no-store').json({success:true,page_id:v.page.id,
    canonical_url:v.page.url,...out,requires_editor_approval:true,
    no_gsc_requirement:true,auto_publishing:false,case_study_protected:true});
  }catch(e){console.warn('[growth-editor-draft]',String(e?.code||'UNAVAILABLE'));
   return res.status(503).json({success:false,code:'EDITOR_DRAFT_TEMPORARILY_UNAVAILABLE'});}
 });
 app.post('/api/tracker-client/:token/growth/cms-export',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.body?.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   let originalHtml=v.page.html_content,originalHash=v.source_sha256,manualSource=false;
   if(v.source_mode==='MANUAL_HTML_REQUIRED'){
    const supplied=req.body?.original_html_override;
    if(req.body?.manual_source_acknowledged!==true||
       typeof supplied!=='string'||supplied.length<120||Buffer.byteLength(supplied,'utf8')>120000||
       !/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(supplied)||!/<p\b/i.test(supplied))
      return res.status(409).json({success:false,code:'MANUAL_ORIGINAL_HTML_AND_APPROVAL_REQUIRED'});
    if(req.body?.source_provenance!=='OWNER_SUPPLIED_UNVERIFIED')
      return res.status(409).json({success:false,code:'MANUAL_SOURCE_PROVENANCE_REQUIRED'});
    originalHtml=supplied;originalHash=sha(supplied);manualSource=true;
    // Do not store or silently overwrite canonical Tracker HTML.
    if(req.body?.source_sha256&&req.body.source_sha256!==originalHash)
      return res.status(409).json({success:false,code:'MANUAL_SOURCE_CHANGED'});
   }else if(String(req.body?.source_sha256||'')!==v.source_sha256){
    return res.status(409).json({success:false,code:'TRACKER_SOURCE_REVISION_CHANGED'});
   }
   const scope=String(req.body?.evidence_scope||'needs_access');
   if(scope==='verified'){
    const q=String(req.body?.focus_query||'').trim();
    if(!q)return res.status(409).json({success:false,code:'VERIFIED_PAGE_QUERY_REQUIRED'});
    let verified=[];
    try{
     verified=(await pool.query("SELECT 1 FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' AND LOWER(TRIM(query))=LOWER($4) LIMIT 1",
      [v.client.id,v.page.id,v.page.url,q])).rows;
    }catch{return res.status(409).json({success:false,code:'VERIFIED_GSC_EVIDENCE_UNAVAILABLE'})}
    if(!verified.length)return res.status(409).json({success:false,code:'VERIFIED_GSC_EVIDENCE_NOT_FOUND'});
   }
   const result=prepareGrowthCmsHandoff({
    canonicalUrl:v.page.url,originalHtml,sourceExpectedSha256:originalHash,
    caseStudyLocked:v.page.case_study_active,editorApproved:req.body?.editor_approved===true,
    cms:req.body?.cms||'generic',pageTitle:req.body?.seo_title,
    metaDescription:req.body?.meta_description,changes:req.body?.approved_changes,
    focusQuery:req.body?.focus_query||'',evidenceScope:scope,
    language:req.body?.language||'en'
   });
   if(result.status!=='HANDOFF_READY_FOR_EDITOR')
    return res.status(409).set('Cache-Control','no-store').json({success:false,code:'EDITOR_REVIEW_REQUIRED',issues:result.issues,warnings:result.warnings,publication_allowed:false});
   if(manualSource){
    result.manifest.source_provenance='OWNER_SUPPLIED_UNVERIFIED';
    result.manifest.source_snapshot_preserved=false;
    result.manifest.saved_tracker_html_available=false;
    result.manifest.manual_html_persisted=false;
    result.warnings.push('MANUAL_HTML_NOT_VERIFIED_LIVE','MANUAL_HTML_NOT_STORED_IN_TRACKER');
    const manifest=result.files.find(f=>f.name==='manifest.json');
    if(manifest)manifest.content=JSON.stringify(result.manifest,null,2)+'\n';
    const delivery=result.files.find(f=>f.name==='01-implementation.md');
    if(delivery)delivery.content+='\nMANUAL HTML SOURCE: editor-supplied, not verified live and not stored in Tracker. Confirm the real live page before applying changes.\n';
   }
   if(req.body?.format==='zip'){
    const zip=packageGrowthZip(result.files);
    return res.set('Cache-Control','private, no-store').set('Content-Type','application/zip')
     .set('Content-Disposition','attachment; filename="contentscale-growth-cms-neutral.zip"').send(zip);
   }
   if(req.body?.format&&req.body.format!=='json')
    return res.status(400).json({success:false,code:'HANDOFF_FORMAT_UNSUPPORTED'});
   return res.set('Cache-Control','private, no-store').json({
    success:true,status:result.status,files:result.files,manifest:result.manifest,
    warnings:result.warnings,publication_allowed:false,no_external_paid_service_required:true
   });
  }catch(e){console.error('[growth-cms-export]',String(e.code||e.message).slice(0,120));
   return res.status(503).json({success:false,code:'CMS_HANDOFF_FAILED'})}
 });
}
module.exports={registerTrackerGrowthCmsExport,loadEditablePage};
