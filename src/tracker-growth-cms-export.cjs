'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('./growth-cms-handoff.cjs');
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
const {generateGrowthEditorDraft,sourceFacts}=require('./growth-source-grounded-editor.cjs');
const {normalizeGrowthResearchContext}=require('./growth-editorial-research-context.cjs');
const {loadGrowthOptionalGsc}=require('./growth-optional-gsc-draft-evidence.cjs');
const {recentProposals,combineProposals,proposalById}=require('./growth-proposal-store.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
async function loadEditablePage(pool,token,pageId,{allowMissingHtml=false,allowLockedResearchDraft=false}={}){
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
 if(p.case_study_active&&!allowLockedResearchDraft)return {status:409,code:'CASE_STUDY_BASELINE_LOCKED'};
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
 // Reuse source-identity-bound editorial drafts to avoid repeated optional AI charges.
 const draftCache=new Map(),DRAFT_TTL=10*60*1000;
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
   const html=require('./growth-asset-version.cjs').versioned(fs.readFileSync(path.resolve(__dirname,'../public/growth-cms-neutral-handoff.html'),'utf8'));
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
 const ownerDraftHandler=async(req,res)=>{
  try{
   // Research-only draft: Case Study baseline remains strictly unchanged.
   const v=await loadEditablePage(pool,req.params.token,req.body?.page_id,{allowMissingHtml:true,allowLockedResearchDraft:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   // A review-only draft must be based on today's public page when obtainable,
   // not a possibly old Tracker HTML baseline. Never save the refreshed source.
   let original=null,sourceOrigin='LIVE_PUBLIC_HTML',sourceWarning=null,sourceRetrievedAt=null;
   try{
    const live=await fetchLive(v.page.url),expected=new URL(v.page.url),actual=new URL(live.final_url||v.page.url);
    const sameHost=expected.hostname.replace(/^www\./,'')===actual.hostname.replace(/^www\./,'');
    const samePath=(expected.pathname.replace(/\/+$/,'')||'/')===(actual.pathname.replace(/\/+$/,'')||'/');
    if(actual.protocol!=='https:'||!sameHost||!samePath)throw Error('LIVE_SOURCE_IDENTITY_MISMATCH');
    if(sourceFacts(live.html).text.length<120)throw Error('LIVE_SOURCE_NOT_SUBSTANTIVE');
    original=live.html;
    sourceRetrievedAt=live.retrieved_at||null;
   }catch{
    sourceWarning='LIVE_SOURCE_UNAVAILABLE_OR_INCOMPLETE';
   }
   if(!original){
    if(sourceFacts(v.page.html_content).text.length<120)
     return res.status(409).json({success:false,code:'CURRENT_ORIGINAL_SOURCE_UNAVAILABLE'});
    original=v.page.html_content;
    sourceOrigin='TRACKER_SAVED_HTML_FALLBACK';
   }
   // Historical Search Intelligence is optional context, not a live ranking claim.
   let topics=[],snapshotCheckedAt=null;
   const focus=String(req.body?.focus_query||v.page.keyword||'').slice(0,160);
   const liveResearch=normalizeGrowthResearchContext(req.body?.research_context,{targetUrl:v.page.url,focusQuery:focus});
   // GSC is never a prerequisite. If imported for either page, read it independently
   // with exact client+page+source URL verification; never map source clicks to target.
   const gscContext=await loadGrowthOptionalGsc(pool,{clientId:v.client.id,targetPage:v.page,
    sourcePageId:req.body?.growth_source_page_id,focusQuery:focus});
   const wrongProductTitle=title=>require('./growth-intent-signals.cjs').differsFromQuery(title,focus).length>0;
   if(liveResearch.observations.length)topics=liveResearch.observations.map(x=>x.competitor_heading);
   else try{
    const prior=await pool.query('SELECT checked_at,google_competitors,ai_perplexity_competitors FROM tracker_snapshots WHERE page_id=$1 AND (google_competitors IS NOT NULL OR ai_perplexity_competitors IS NOT NULL) ORDER BY checked_at DESC,id DESC LIMIT 1',[v.page.id]);
    const row=prior.rows?.[0];
    snapshotCheckedAt=row?.checked_at||null;
    for(const entry of [...(Array.isArray(row?.google_competitors)?row.google_competitors:[]),
       ...(Array.isArray(row?.ai_perplexity_competitors)?row.ai_perplexity_competitors:[])]){
     const title=typeof entry==='object'&&entry&&typeof entry.title==='string'?entry.title.trim():'';
     if(title&&title.length<150&&!topics.includes(title)&&!wrongProductTitle(title))topics.push(title);
     if(topics.length>=4)break;
    }
   }catch(_err){topics=[];}
   const draftKey=[v.client.id,v.page.id,sourceOrigin,v.page.case_study_active?'locked':'unlocked',
    sha(String(original||'')),focus,topics.join('|'),sha(JSON.stringify(liveResearch.observations)),sha(JSON.stringify(liveResearch.reader_task||null)),
    sha(JSON.stringify(gscContext)),req.body?.flag_fallback===true?'flag':'strict'].join(':');
   const cached=draftCache.get(draftKey);
   let out;
   if(cached&&Date.now()-cached.created<DRAFT_TTL)out=await cached.promise;
   else{
    const promise=Promise.resolve().then(()=>generateDraft({sourceHtml:original,pageUrl:v.page.url,focusQuery:focus,topics,
     researchObservations:liveResearch.observations,gscContext,readerTask:liveResearch.reader_task||null,
     fallbackFlagged:req.body?.flag_fallback===true}));
    draftCache.set(draftKey,{created:Date.now(),promise});
    try{out=await promise;
     if(out?.status!=='AI_DRAFT_REVIEW_REQUIRED')draftCache.delete(draftKey);
    }catch(error){draftCache.delete(draftKey);throw error}
    while(draftCache.size>30)draftCache.delete(draftCache.keys().next().value);
   }
   return res.set('Cache-Control','private, no-store').json({success:true,page_id:v.page.id,
    canonical_url:v.page.url,...out,draft_source_type:sourceOrigin,draft_source_warning:sourceWarning,
    draft_source_retrieved_at:sourceRetrievedAt,requires_editor_approval:true,
    no_gsc_requirement:true,auto_publishing:false,case_study_protected:true,
    case_study_locked:v.page.case_study_active===true,review_only:true,
    historical_competitor_titles_used:liveResearch.observations.length?0:topics.length,
    historical_snapshot_checked_at:snapshotCheckedAt,
    live_competitor_observations_used:liveResearch.observations.length,
    research_context_scope:liveResearch.scope,
    research_context_status:liveResearch.status,gsc_context:gscContext,
    // Writing for an owner selection checks the text against the same page source the writer used.
    ...(req.body?.flag_fallback===true?{source_text:sourceFacts(original).text}:{})});
  }catch(e){console.warn('[growth-editor-draft]',String(e?.code||'UNAVAILABLE'));
   return res.status(503).json({success:false,code:'EDITOR_DRAFT_TEMPORARILY_UNAVAILABLE'});}
 };
 app.post('/api/tracker-client/:token/growth/cms-export/editor-draft',ownerDraftHandler);
 // The checked Growth proposal for this page (owner link only; never for a locked Case Study page).
 app.get('/api/tracker-client/:token/growth/cms-export/proposal',async(req,res)=>{
  try{
   const v=await loadEditablePage(pool,req.params.token,req.query?.page_id,{allowMissingHtml:true});
   if(v.status!==200)return res.status(v.status).json({success:false,code:v.code});
   const {latest:p,earlier}=combineProposals(await recentProposals(pool,{clientId:v.client.id,targetPageId:v.page.id,targetUrl:v.page.url}));
   const shape=x=>({id:Number(x.id),created_at:x.created_at,focus_query:x.focus_query,sections:x.sections,review:x.review,evidence_label:x.evidence_label,intent_note:x.intent_note});
   // earlier: the other proposals and written concepts for this page (last 30 days), with only the sections that a newer
   // one does not already contain. The editor adds them to the same package; nothing is merged without that choice.
   res.set('Cache-Control','private, no-store').json({success:true,proposal:p?shape(p):null,earlier:earlier.map(shape)});
  }catch(e){console.warn('[growth-cms-proposal]',String(e?.code||'UNAVAILABLE'));res.status(503).json({success:false,code:'GROWTH_PROPOSAL_UNAVAILABLE'})}
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
   let growthProposal=null;
   if(req.body?.growth_proposal_id!=null){
    if(!Number.isSafeInteger(Number(req.body.growth_proposal_id))||Number(req.body.growth_proposal_id)<1)
     return res.status(400).json({success:false,code:'GROWTH_PROPOSAL_ID_INVALID'});
    const p=await proposalById(pool,{clientId:v.client.id,id:req.body.growth_proposal_id});
    if(!p||Number(p.target_page_id)!==Number(v.page.id)||p.target_url!==v.page.url)
     return res.status(409).json({success:false,code:'GROWTH_PROPOSAL_NOT_FOR_THIS_PAGE'});
    growthProposal={id:Number(p.id),sections:p.sections};
   }
   // Earlier concepts the editor added to this package: each must belong to this page and URL.
   const added=Array.isArray(req.body?.added_growth_proposal_ids)?[...new Set(req.body.added_growth_proposal_ids.map(Number))].slice(0,10):[];
   for(const id of added){
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({success:false,code:'GROWTH_PROPOSAL_ID_INVALID'});
    const p=await proposalById(pool,{clientId:v.client.id,id});
    if(!p||Number(p.target_page_id)!==Number(v.page.id)||p.target_url!==v.page.url)
     return res.status(409).json({success:false,code:'GROWTH_PROPOSAL_NOT_FOR_THIS_PAGE'});
   }
   const result=prepareGrowthCmsHandoff({growthProposal,reviewNotes:req.body?.review_notes||null,addedProposalIds:added,
    canonicalUrl:v.page.url,originalHtml,sourceExpectedSha256:originalHash,
    caseStudyLocked:v.page.case_study_active,editorApproved:req.body?.editor_approved===true,
    cms:req.body?.cms||'generic',pageTitle:req.body?.seo_title,
    metaDescription:req.body?.meta_description,changes:req.body?.approved_changes,
    focusQuery:req.body?.focus_query||'',evidenceScope:scope,
    language:req.body?.language||'en'
   });
   if(result.status!=='HANDOFF_READY_FOR_EDITOR')
    return res.status(409).set('Cache-Control','no-store').json({success:false,code:'EDITOR_REVIEW_REQUIRED',issues:result.issues,warnings:result.warnings,
     ...(result.blocked_details?{blocked_details:result.blocked_details}:{}),publication_allowed:false});
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
 // Compose owner-only Growth reports using exactly the same authorization and
 // draft handler as the existing POST endpoint. No DB writes or CMS publication.
 return {completeOwnerDraft:async({token,body})=>{
  const outcome={statusCode:200,body:null};
  const response={
   status(code){outcome.statusCode=code;return this},
   set(){return this},
   json(value){outcome.body=value;return value}
  };
  await ownerDraftHandler({params:{token},body},response);
  return outcome;
 }};
}
module.exports={registerTrackerGrowthCmsExport,loadEditablePage};
