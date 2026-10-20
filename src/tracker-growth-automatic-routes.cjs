'use strict';
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
const {snapshotCompetitorLeads}=require('./growth-snapshot-competitors.cjs');
const {analyzeGrowthEvidence,sHtml}=require('./growth-automatic-analysis.cjs');
const {proposeHandoffFromResearch}=require('./growth-research-handoff-suggestions.cjs');
const {discoverGrowthCompetitorsWithFallback}=require('./growth-public-search-discovery.cjs');
const {queryFit}=require('./growth-one-action-decision.cjs');
const {autonomouslyFindGrowthOpportunity}=require('./growth-autonomous-opportunity.cjs');
const {evaluateExistingBody}=require('./growth-existing-body-evidence.cjs');
const {compareFullSections}=require('./growth-full-section-comparison.cjs');
const {decideGrowthEditorialAction}=require('./growth-editorial-decision-gate.cjs');
const {buildGrowthEvidenceExample}=require('./growth-evidence-bound-example.cjs');
const {assessGrowthCompetitorContent}=require('./growth-competitor-quality-gate.cjs');
function registerGrowthAutomaticResearch(app,pool,data,{fetchLive=fetchPublicGrowthHtml,searchLive=discoverGrowthCompetitorsWithFallback,completeOwnerDraft=null}={}){
 if(typeof app?.get!=='function'||typeof pool?.query!=='function'||typeof data!=='function')
  throw Error('GROWTH_AUTO_RESEARCH_DEPENDENCIES_REQUIRED');
 const cache=new Map(),LIMIT=24,TTL=5*60*1000;
 const check=(req,res)=>{
  const raw=String(req.query?.page_id||'');
  if(!/^[1-9][0-9]{0,12}$/.test(raw)){res.status(400).json({success:false,code:'VALID_TRACKER_PAGE_ID_REQUIRED'});return null}
  const page=req.growth?.pages?.find(x=>String(x.id)===raw);
  if(!page){res.status(404).json({success:false,code:'TRACKER_PAGE_NOT_FOUND'});return null}
  return {id:Number(raw),page,clientId:req.growthTrackerClientId};
 };
 async function analyze(v){
  const cid=v.clientId,pid=v.id;
  const saved=await pool.query("SELECT id,tracker_client_id,url,keyword,brief_content,LEFT(html_content,120000) AS saved_html FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2 LIMIT 1",[cid,pid]);
  const page=saved.rows[0];
  if(!page||page.url!==v.page.url)throw Object.assign(Error('PAGE_IDENTITY_CHANGED'),{code:'PAGE_IDENTITY_CHANGED'});
  page.case_study_active=v.page.case_study_active;
  const optional=await Promise.allSettled([
   pool.query("SELECT page_id,checked_at,google_competitors,ai_perplexity_competitors FROM tracker_snapshots WHERE page_id=$1 AND (google_competitors IS NOT NULL OR ai_perplexity_competitors IS NOT NULL) ORDER BY checked_at DESC,id DESC LIMIT 1",[pid]),
   pool.query("SELECT page_id,tracker_client_id,engine,evidence_method,brand_recommended,domain_cited,exact_page_cited,citation_urls,verified_at,revision_cycle FROM tracker_ai_evidence WHERE tracker_client_id=$1 AND page_id=$2 AND is_cleared IS NOT TRUE ORDER BY verified_at DESC NULLS LAST LIMIT 60",[cid,pid]),
   pool.query("SELECT page_id,tracker_client_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 150",[cid,pid,page.url]),
   pool.query("SELECT id,tracker_client_id,url,keyword FROM tracker_pages WHERE tracker_client_id=$1 AND id<>$2 ORDER BY id LIMIT 500",[cid,pid])
  ]);
  const rows=i=>optional[i].status==='fulfilled'?optional[i].value.rows||[]:[];
  const unavailable=optional.map((x,i)=>x.status==='rejected'?['competitor_snapshots','ai_evidence','gsc_queries','site_inventory'][i]:null).filter(Boolean);
  const snapshot=rows(0)[0]||null,historical=snapshotCompetitorLeads({page,snapshot}).leads;
  const own=await fetchLive(page.url).then(x=>({live:x})).catch(e=>({live:null,code:String(e?.code||'LIVE_FETCH_UNAVAILABLE').slice(0,80)}));
  // Determine the chosen exact-page query BEFORE competitor discovery.
  // Historical SERPs may be about another brand/product even on the same URL.
  const seed=analyzeGrowthEvidence({page,savedHtml:page.saved_html,live:own.live,
   snapshot,aiRows:rows(1),gscRows:rows(2),competitorPages:[],sitePages:rows(3),previousBrief:page.brief_content});
  const targetQuery=seed.growth_decision?.primary_next_action?.query||String(page.keyword||'').trim()||seed.search?.focus_query||'';
  const discovery=await Promise.resolve().then(()=>searchLive({query:targetQuery,ownUrl:page.url}))
   .catch(e=>({source:'BING_PUBLIC_RSS',query:targetQuery,leads:[],status:'PUBLIC_SEARCH_UNAVAILABLE',reason:String(e?.code||'SEARCH_FAILED').slice(0,60)}));
  // Discussion listings remain in SERP evidence but should not displace readable
  // long-form articles in the limited content-comparison budget.
  const editorialHost=url=>{try{const host=new URL(url).hostname.toLowerCase();
   return !/(^|\.)(?:reddit\.com|quora\.com)$/.test(host)}
   catch{return false}};
  const fresh=(Array.isArray(discovery.leads)?discovery.leads:[])
   .filter(x=>x.url&&editorialHost(x.url)).slice(0,6);
  const candidates=[...fresh.map(x=>({...x,search_source:x.source==='SERPAPI_GOOGLE_ORGANIC'?'SERPAPI_GOOGLE_ORGANIC':x.source==='SERPER_GOOGLE_ORGANIC'?'SERPER_GOOGLE_ORGANIC':'BING_PUBLIC_RSS'})),
   ...historical.filter(x=>editorialHost(x.url)&&!fresh.some(y=>y.url===x.url)&&queryFit(x.serp_title||'',{title:targetQuery,h1:[],h2:[]}).fit)
    .map(x=>({...x,search_source:'HISTORICAL_SERP_TOPIC_MATCH'}))].slice(0,6);
  const fetchCompetitor=async lead=>{
   try{const live=await fetchLive(lead.url);
    return {url:lead.url,live,quality:assessGrowthCompetitorContent({html:live.html,query:targetQuery,truncated:live.truncated}),
     search_source:lead.search_source,search_query:targetQuery}}
   catch(e){return {url:lead.url,status:'LIVE_COMPARISON_UNAVAILABLE',reason:String(e?.code||'FETCH_FAILED').slice(0,70),search_source:lead.search_source}}
  };
  let attempted=await Promise.all(candidates.slice(0,3).map(fetchCompetitor));
  const eligible=items=>items.filter(x=>x.live&&x.quality?.eligible).slice(0,3);
  let comparisons=eligible(attempted);
  if(comparisons.length<3&&candidates.length>3){
   // Try later already-discovered results only when initial HTML was unreadable.
   const extra=candidates.slice(3,3+Math.min(3,4-comparisons.length));
   attempted=attempted.concat(await Promise.all(extra.map(fetchCompetitor)));
   comparisons=eligible(attempted);
  }
  const report=analyzeGrowthEvidence({page,savedHtml:page.saved_html,live:own.live,
   snapshot,aiRows:rows(1),gscRows:rows(2),competitorPages:comparisons,sitePages:rows(3),previousBrief:page.brief_content});
  report.search_discovery={...discovery,leads:(discovery.leads||[]).slice(0,7),target_query:targetQuery,
   fetched_competitor_urls:comparisons.filter(x=>x.live).map(x=>x.url),
   discarded_unreadable_article_count:attempted.filter(x=>x.live&&!x.quality?.eligible).length};
  report.evidence_warnings=[
   ...unavailable.map(x=>'OPTIONAL_'+x.toUpperCase()+'_UNAVAILABLE'),
   ...(own.code?['TARGET_LIVE_'+own.code]:[]),
   ...attempted.filter(x=>!x.live).map(x=>'COMPETITOR_LIVE_'+(x.reason||'UNAVAILABLE')),
   ...attempted.filter(x=>x.live&&!x.quality?.eligible).map(()=>'COMPETITOR_HTML_INSUFFICIENT_READABLE_ARTICLE'),
   ...(['PUBLIC_SEARCH_UNAVAILABLE','NO_RELEVANT_PUBLIC_SEARCH_LEADS','QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH'].includes(discovery.status)?['LIVE_SEARCH_'+discovery.status]:[])
  ];
  const siteOrigin=new URL(page.url).origin;
  const related=(report.site_architecture?.candidates||[]).filter(x=>{
   try{return new URL(x.url).origin===siteOrigin&&x.url!==page.url}catch{return false}
  }).slice(0,4);
  const destinationSources=new Map();
  const sameSiteReviews=await Promise.all(related.map(async x=>{
   try{
    const fresh=await fetchLive(x.url);
    destinationSources.set(x.url,fresh);
    const inspected=require('./growth-automatic-analysis.cjs').excerpt(fresh.html);
    return {url:x.url,tracked_keyword:x.tracked_keyword||null,verified_live:true,
     title:inspected.title,h1:inspected.h1,h2:inspected.h2,
     fetched_at:fresh.retrieved_at||null,
     body_evidence:evaluateExistingBody({html:fresh.html,truncated:fresh.truncated,query:targetQuery})};
   }catch(e){return {url:x.url,tracked_keyword:x.tracked_keyword||null,
     verified_live:false,reason:String(e?.code||'PUBLIC_HTML_UNAVAILABLE').slice(0,60)}}
  }));
  report.autonomous_growth_opportunity=autonomouslyFindGrowthOpportunity({report,discovery,existingPageReviews:sameSiteReviews});
  report.full_section_comparison=compareFullSections({query:targetQuery,ownUrl:page.url,
   ownHtml:own.live?.html||page.saved_html||'',ownTruncated:own.live?.truncated===true,
   competitors:comparisons.filter(x=>x.search_source==='SERPER_GOOGLE_ORGANIC'||x.search_source==='SERPAPI_GOOGLE_ORGANIC'||x.search_source==='BING_PUBLIC_RSS')});
  // Compare the distinct growth intent on its likely existing destination,
  // not only the protected homepage that surfaced the GSC opportunity.
  const proposed=report.autonomous_growth_opportunity?.editorial_package?.proposed_target_url||
   report.growth_decision?.primary_next_action?.related_pages_to_check?.find(u=>destinationSources.has(u))||null;
  const selectedSource=proposed?destinationSources.get(proposed):null;
  report.destination_section_comparison=selectedSource?compareFullSections({
   query:targetQuery,ownUrl:proposed,ownHtml:selectedSource.html,
   ownTruncated:selectedSource.truncated===true,
   competitors:comparisons.filter(x=>['SERPER_GOOGLE_ORGANIC','SERPAPI_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(x.search_source))
  }):{status:'EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE',target_url:proposed,
   verified_gap:false,copy_ready:false,comparisons:[]};
  report.destination_section_comparison.target_url=proposed;
  report.destination_section_comparison.protected_source_url=page.url;
  report.editorial_decision_gate=decideGrowthEditorialAction({report,destination:report.destination_section_comparison});
  // A homepage GSC observation is never evidence about a different editorial URL.
  // Resolve the selected destination to a tracked page owned by this same client,
  // then read only independently page-verified rows for that exact URL and page_id.
  const destinationPage=selectedSource&&proposed!==page.url?
   rows(3).find(x=>x.url===proposed&&Number.isSafeInteger(Number(x.id))):null;
  let destinationGscRows=[],destinationGscStatus='NO_TRACKED_DESTINATION';
  if(destinationPage){
   try{
    const evidence=await pool.query(
     "SELECT page_id,tracker_client_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 150",
     [cid,destinationPage.id,proposed]);
    destinationGscRows=(evidence.rows||[]).filter(x=>
     String(x.page_id)===String(destinationPage.id)&&String(x.tracker_client_id)===String(cid)&&x.source_page_url===proposed&&x.evidence_scope==='page_verified');
    destinationGscStatus=destinationGscRows.length?'PAGE_VERIFIED_ROWS_AVAILABLE':'NO_VERIFIED_DESTINATION_ROWS';
   }catch{
    destinationGscStatus='DESTINATION_GSC_LOOKUP_UNAVAILABLE';
    report.evidence_warnings.push('DESTINATION_GSC_LOOKUP_UNAVAILABLE');
   }
  }
  const exactTargetRow=destinationGscRows.find(x=>{
   const impressions=Number(x.impressions),clicks=Number(x.clicks),position=Number(x.position);
   return String(x.query||'').trim().toLowerCase()===targetQuery.trim().toLowerCase()&&
    Number.isFinite(impressions)&&impressions>0&&Number.isFinite(clicks)&&clicks>=0&&
    clicks<=impressions&&Number.isFinite(position)&&position>0;
  });
  report.destination_gsc_evidence={
   status:exactTargetRow?'EXACT_QUERY_VERIFIED':destinationGscRows.some(x=>String(x.query||'').trim().toLowerCase()===targetQuery.trim().toLowerCase())?'INVALID_EXACT_QUERY_METRICS':destinationGscStatus,
   target_url:proposed,target_page_id:destinationPage?Number(destinationPage.id):null,focus_query:targetQuery,
   exact_query_verified:!!exactTargetRow,
   // Never copy homepage clicks or infer a measurement window for this destination.
   metrics:exactTargetRow?{impressions:Number(exactTargetRow.impressions),clicks:Number(exactTargetRow.clicks),
    average_position:Number(exactTargetRow.position),imported_at:exactTargetRow.imported_at||null,
    measurement_window:'UNKNOWN',source_url:proposed}:null
  };
  report.evidence_bound_example=buildGrowthEvidenceExample({report,decision:report.editorial_decision_gate,destinationGscRows});
  report.summary.live_checked=!!own.live;
  report.summary.competitor_fetch_attempts=attempted.length;
  report.summary.optional_evidence_complete=unavailable.length===0&&!(discovery.provider_attempts?.length&&!discovery.leads?.length);
  report.summary.live_search_evidence_complete=!!(discovery.leads?.length);
  if(discovery.optional_google_failure_reason)report.evidence_warnings.push('SERPAPI_GOOGLE_'+discovery.optional_google_failure_reason);
  report.handoff_suggestions=proposeHandoffFromResearch(report,page.url);
  // This object is always the research-only GET response, regardless of
  // the caller's actual owner permission. Do not misrepresent its access
  // metadata as an authorization decision or as a completed Growth report.
  report.access={can_edit:false,read_only_analysis:true,
   report_mode:'RESEARCH_ONLY',editor_permissions_not_evaluated:true};
  report.editorial_review_draft={status:'RESEARCH_ONLY_OWNER_COMPLETION_NOT_RUN',auto_started:false,
   draft:null,published:false,case_study_unchanged:true};
  report.report_completion={status:'RESEARCH_ONLY_NO_EDITORIAL_DRAFT',
   owner_only_completion_route_required:true};
  return report;
 }
 app.get('/api/tracker-client/:token/growth/auto-research',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  // Never serve a recently cached unlocked result after Case Study activation.
  const key=v.clientId+':'+v.id+':'+(v.page.case_study_active?'locked':'unlocked')+':'+v.page.url,stored=cache.get(key);
  if(stored?.result&&Date.now()-stored.created<TTL)
   return res.set('Cache-Control','private, no-store').json(stored.result);
  if(stored?.promise){
   try{return res.set('Cache-Control','private, no-store').json(await stored.promise)}
   catch{return res.status(503).json({success:false,code:'AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE'})}
  }
  const promise=analyze(v);cache.set(key,{created:Date.now(),promise});
  try{
   const result=await promise;
   cache.set(key,{created:Date.now(),result});
   while(cache.size>LIMIT)cache.delete(cache.keys().next().value);
   return res.set('Cache-Control','private, no-store').json(result);
  }catch(e){
   cache.delete(key);console.warn('[growth-auto-research]',String(e?.code||'RESEARCH_ERROR'));
   return res.status(503).json({success:false,code:'AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE'});
  }
 });
 // The old GET remains a research-only, read-only-safe endpoint. The complete
 // owner report is assembled server-side so downloaded JSON cannot silently omit
 // the editorial draft just because client JavaScript was not executed.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/auto-research/complete',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  if(req.growth?.can_edit!==true||typeof completeOwnerDraft!=='function')
   return res.status(403).set('Cache-Control','private, no-store')
    .json({success:false,code:'OWNER_ONLY_COMPLETION_REQUIRED'});
  const key=v.clientId+':'+v.id+':'+(v.page.case_study_active?'locked':'unlocked')+':'+v.page.url;
  let report;
  try{
   const stored=cache.get(key);
   report=stored&&Date.now()-stored.created<TTL?
    (stored.result||await stored.promise):await analyze(v);
   if(!stored||Date.now()-stored.created>=TTL)
    cache.set(key,{created:Date.now(),result:report});
  }catch{
   return res.status(503).json({success:false,code:'GROWTH_RESEARCH_UNAVAILABLE'});
  }
  const target=report.destination_gsc_evidence||{},targetUrl=target.target_url||report.url;
  const targetId=targetUrl===report.url?v.id:Number(target.target_page_id);
  const base={auto_started:true,target_url:targetUrl,source_page_id:targetId,
   published:false,case_study_unchanged:true,requires_editor_approval:true};
  let completion;
  if(!Number.isSafeInteger(targetId)||targetId<1){
   completion={...base,status:'DESTINATION_TRACKER_PAGE_REQUIRED',draft:null};
  }else{
   const query=String(report.editorial_decision_gate?.focus_query||
    report.growth_decision?.primary_next_action?.query||'').slice(0,160);
   const researchContext={
    target_url:targetUrl,focus_query:query,
    observations:(report.destination_section_comparison?.comparisons||[]).filter(c=>
     c.competitor_url&&c.competitor_heading&&String(c.competitor_excerpt||'').length>=75)
     .slice(0,3).map(c=>({competitor_url:c.competitor_url,
      competitor_heading:c.competitor_heading,competitor_excerpt:String(c.competitor_excerpt).slice(0,600)}))
   };
   try{
    const outcome=await completeOwnerDraft({token:req.params.token,body:{
     page_id:targetId,focus_query:query,growth_source_page_id:v.id,
     research_context:researchContext
    }});
    const detail=outcome?.body||{};
    const validIdentity=detail.canonical_url===targetUrl&&Number(detail.page_id)===targetId;
    // Never label a generated response complete unless there is actual reviewable body content.
    const sections=Array.isArray(detail.draft?.sections)?detail.draft.sections:[];
    const hasSubstantiveDraft=sections.some(section=>
     typeof section?.h2==='string'&&section.h2.trim().length>2&&
     Array.isArray(section.paragraphs)&&section.paragraphs.some(p=>typeof p==='string'&&p.trim().length>=80));
    completion={...base,status:outcome.statusCode===200&&detail.success===true&&validIdentity?
     detail.status==='AI_DRAFT_REVIEW_REQUIRED'&&!hasSubstantiveDraft?'DRAFT_CONTENT_INCOMPLETE':detail.status||'DRAFT_STATUS_UNKNOWN':'DRAFT_UNAVAILABLE',
     error_code:outcome.statusCode===200&&detail.success===true&&validIdentity?
      null:(!validIdentity&&detail.success===true?'DRAFT_SOURCE_IDENTITY_MISMATCH':detail.code||'OWNER_DRAFT_FAILED'),
     draft:validIdentity&&detail.status==='AI_DRAFT_REVIEW_REQUIRED'&&hasSubstantiveDraft?detail.draft:null,
     source_type:validIdentity?detail.draft_source_type||null:null,
     source_warning:validIdentity?detail.draft_source_warning||null:null,
     source_retrieved_at:validIdentity?detail.draft_source_retrieved_at||null:null,
     gsc_context:validIdentity?detail.gsc_context||{status:'NO_VERIFIED_GSC',gsc_required:false}:null,
     competitor_research_passages_used:validIdentity?Number(detail.live_competitor_observations_used||0):0};
   }catch{completion={...base,status:'DRAFT_UNAVAILABLE',error_code:'OWNER_DRAFT_FAILED',draft:null}}
  }
  // Package the actual observed passages with the draft. A reader can now
  // inspect precisely which source supports each proposed editorial review.
  const workPacket={
   status:completion.draft?'DRAFT_AND_SOURCE_COMPARISON_FOR_REVIEW':'SOURCE_COMPARISON_ONLY',
   target_url:completion.target_url||report.destination_section_comparison?.target_url||report.url,
   focus_query:report.editorial_decision_gate?.focus_query||null,
   generated_draft:completion.draft||null,
   evidence_verified:report.editorial_decision_gate?.verified_gap===true,
   case_study_locked:report.case_study_locked===true,
   publication_allowed:false,
   source_comparisons:(report.destination_section_comparison?.comparisons||[]).slice(0,6).map(x=>({
    competitor_url:x.competitor_url,
    competitor_heading:x.competitor_heading,
    competitor_observed_excerpt:x.competitor_excerpt,
    competitor_word_count:x.competitor_word_count,
    destination_url:report.destination_section_comparison?.target_url||null,
    destination_heading:x.nearest_existing_section?.heading||null,
    destination_observed_excerpt:x.nearest_existing_section?.excerpt||null,
    match_status:x.match_status,
    source_scope:x.source_scope,
    finding:'UNVERIFIED_READER_NEED',
    editorial_check:x.nearest_existing_section?
     'Check whether the observed destination section already answers the same reader task. Retain existing useful text and record a distinct missing answer only if supported.':
     'No reliable matching destination section was observed. Check the complete page before treating this as a missing answer.'
   })),
   next_action:'Review linked source passages against the generated draft; approve only distinct factual improvements. Do not infer a ranking advantage or missing content from term overlap.'
  };
  return res.set('Cache-Control','private, no-store').json({...report,
   access:{can_edit:true,read_only_analysis:false,owner_report:true},
   editorial_review_draft:completion,
   editorial_work_packet:workPacket,
   report_completion:{status:completion.status!=='AI_DRAFT_REVIEW_REQUIRED'?'RESEARCH_COMPLETE_DRAFT_NOT_READY':
     report.editorial_decision_gate?.verified_gap===true&&report.editorial_decision_gate?.copy_ready===true?
     'COMPLETE_FOR_OWNER_REVIEW':'REVIEW_DRAFT_AVAILABLE_EVIDENCE_PENDING',
    evidence_gate:report.editorial_decision_gate?.decision||'UNVERIFIED',
    verified_gap:report.editorial_decision_gate?.verified_gap===true,
    copy_ready:report.editorial_decision_gate?.copy_ready===true,
    owner_only:true,automatic_publishing:false,case_study_unchanged:true}});
 });
 app.get('/track/:token/growth/auto-research',data,(req,res)=>{
  const v=check(req,res);if(!v)return;
  const back='/track/'+encodeURIComponent(req.params.token)+'/growth';
  const base='/track/'+encodeURIComponent(req.params.token)+'/growth';
  const allowHandoff=req.growth?.can_edit===true&&!v.page.case_study_active;
  const handoff='/track/'+encodeURIComponent(req.params.token)+'/growth/cms-export?page_id='+encodeURIComponent(v.id);
  const html=[
   '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
   '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">',
   '<title>Growth · Automatic URL research</title>',
   '<style>body{font:15px/1.55 system-ui;color:#172337;background:#f6f8fc;margin:0;padding:24px}main{max-width:1120px;margin:auto}h1{font-size:28px}h2{font-size:21px}',
   'a{color:#1d4ed8}section{background:white;border:1px solid #d9e1ec;border-radius:12px;padding:18px;margin:14px 0}',
   '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}',
   'small{color:#53637a;display:block}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5eaf2;padding:8px;text-align:left}',
   'button{background:#1d4ed8;color:white;border:0;padding:10px 14px;border-radius:8px;font:inherit;cursor:pointer}',
   'button:disabled{opacity:.5}.info{color:#5b6475;font-size:13px}.error{color:#b42318}',
   'pre{white-space:pre-wrap;overflow-wrap:anywhere}li{margin:8px 0}@media(max-width:600px){body{padding:12px}section{padding:12px}}',
   '</style><script defer src="/tracker-growth-ui.js"></script><script defer src="/growth-automatic-report-ui.js"></script></head>',
   '<body><main data-page-id="'+v.id+'" data-owner-draft="'+(req.growth?.can_edit===true?'true':'false')+'"><p><a href="'+back+'">← Growth</a></p>',
   '<h1>Automatic Growth research</h1><p><strong>'+sHtml(v.page.url)+'</strong></p>',
   '<p class="info">Automatic public-page and existing Search/AI intelligence research. GSC, a new scanner, paid API and WordPress are not required. This is a reviewable report, not an automatic publication.</p>',
   '<section><div role="status" id="researchStatus">Analyzing the URL and observed competitor evidence…</div>',
   '<button id="retryResearch" type="button" hidden>Open cached analysis</button> ',
   '<button id="downloadResearch" type="button" hidden>'+(req.growth?.can_edit===true?
    'Download complete Growth report (JSON)':'Download research-only data (JSON)')+'</button></section>',
   '<div id="growthAutomaticReport"></div>',
   '<details id="growthNextAction"><summary>Later: reviewed CMS handoff and measurement</summary>',
   allowHandoff?'<p><a id="growthEditorHandoff" href="'+handoff+'">Prepare reviewed Wix / WordPress / other CMS package</a> — original URL preserved, editor approval required.</p>':
    v.page.case_study_active?'<p>Active Case Study baseline is protected. Research and measurement remain available; no publishing package until unlocked.</p>':
    '<p>Shared read-only access: research and measurement only. The account owner approves a CMS package.</p>',
   '<p><a id="growthMeasurementLink" href="'+base+'/measurement">Review publication measurement readiness</a> — GSC is optional for research and required only for verified Google measurements.</p></details>',
   '</main></body></html>'
  ].join('');
  return res.set('Cache-Control','private, no-store').set('X-Robots-Tag','noindex,nofollow')
   .set('Referrer-Policy','no-referrer').type('html').send(html);
 });
}
module.exports={registerGrowthAutomaticResearch};
