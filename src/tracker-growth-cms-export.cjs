'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('./growth-cms-handoff.cjs');
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
 const duplicates=await pool.query("SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 3",[p.url]);
 if(duplicates.rows.length!==1||Number(duplicates.rows[0].id)!==id||Number(duplicates.rows[0].tracker_client_id)!==Number(c.id))
  return {status:409,code:'DUPLICATE_CANONICAL_PAGE_IDENTITY'};
 return {status:200,client:c,page:p,source_sha256:String(p.html_content||'').trim()?sha(p.html_content):null,source_mode:String(p.html_content||'').trim()?'TRACKER_SAVED_HTML':'MANUAL_HTML_REQUIRED'};
}
function registerTrackerGrowthCmsExport(app,pool){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||!pool||typeof pool.query!=='function')
  throw Error('CMS_HANDOFF_DEPENDENCIES_REQUIRED');
 app.get('/track/:token/growth/cms-export',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.query.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).type('text').send(v.code);
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
