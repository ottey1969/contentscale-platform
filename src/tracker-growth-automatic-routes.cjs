'use strict';
const {assetVersion}=require('./growth-asset-version.cjs');
const {observeSerpTitles}=require('./growth-serp-titles.cjs');
const {spokeCandidates,readerFunnel}=require('./growth-next-pages.cjs');
const {publicationReadiness}=require('./growth-publication-readiness.cjs');
const {reconcileOutcome}=require('./growth-outcome.cjs');
const {annotateAiVisibility,MAX_AGE_DAYS:AI_MAX_AGE_DAYS}=require('./growth-ai-relevance.cjs');
const aiAnswers=require('./growth-free/ai-answers.cjs');
const storedResearch=require('./growth-research-report-store.cjs');
const {fetchPublicGrowthHtml,RESEARCH_FETCH}=require('./growth-public-html-reader.cjs');
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
const {readRankingPages}=require('./growth-ranking-page-reader.cjs');
const {decideOwnerGrowthEdit}=require('./growth-owner-edit-decision.cjs');
const {resolveGrowthPageIntent}=require('./growth-page-intent-resolver.cjs');
const {renderPublicGrowthPage,needsGrowthRender}=require('./growth-safe-browser-renderer.cjs');
const {analyzeReaderTaskCoverage,inferSerpIntent,classifyDestinationIntent,pageTypeScope,blocks:pageBlocks,groupSections}=require('./growth-reader-task-coverage.cjs');
const {judgeTaskMeaning,applyTaskMeaning,judgeDraftAnswers}=require('./growth-task-meaning.cjs');
const {buildCompetitorOverview}=require('./growth-competitor-overview.cjs');
const {buildGapList}=require('./growth-gap-list.cjs');
const {writeForSelection,planBatch,remapSelection,pageFingerprint,MAX_ITEMS:MAX_WRITE_ITEMS}=require('./growth-selected-writing.cjs');
const {checkQueryMeaning}=require('./growth-serp-meaning.cjs');
const {buildOwnerHandoffPackage,planInternalLinks}=require('./growth-owner-handoff-package.cjs');
const {produceVerifiedEditorialOpportunity}=require('./growth-verified-opportunity.cjs');
const {deriveMarket}=require('./growth-serp-quality.cjs');
const {deriveSearchLocale,validCountries,validLanguage,countryName,languageName,PREWRITE_REGIONS,PREWRITE_LANGUAGES}=require('./growth-search-locale.cjs');
const {resolveMarketSetting}=require('./growth-market-store.cjs');
const {deriveEvidenceStatus}=require('./growth-evidence-status.cjs');
const {identityFromFetch,identityAdvice}=require('./growth-url-identity.cjs');
const excerptOf=html=>require('./growth-automatic-analysis.cjs').excerpt(html||'');
// URL identity: a tracked sibling can redirect to, canonicalise to, or serve the same document as the source page.
const normUrl=u=>{try{const x=new URL(u);return (x.origin+x.pathname.replace(/\/+$/,'')).toLowerCase()}catch{return ''}};
const canonicalOf=html=>{const tag=(String(html||'').match(/<link\b[^>]*\brel=["']?canonical\b[^>]*>/i)||[''])[0];return (tag.match(/\bhref=["']([^"']+)["']/i)||[])[1]||null};
// The opening recommendation (query + where to look) is where research STARTS; the editorial decision is where it ends.
// Both are kept, but the starting point is marked as superseded so no output presents it as the current advice.
function markFinalDecision(report,decision){
 const gd=report.growth_decision;if(!gd||!decision)return;
 gd.final_decision={decision:decision.decision||null,blocker_code:decision.blocker_code||null,target_url:decision.target_url||null,
  copy_ready:decision.copy_ready===true,reason:decision.reason||null,next_action:decision.next_action||null};
 if(gd.primary_next_action)gd.primary_next_action={...gd.primary_next_action,stage:'RESEARCH_STARTING_POINT',superseded_by:'editorial_decision_gate'};
 // One leading decision: earlier interim advice (e.g. DISTINCT_SPOKE_RESEARCH_REQUIRED) is kept for traceability, labelled.
 const ag=report.autonomous_growth_opportunity;
 if(ag&&typeof ag==='object')report.autonomous_growth_opportunity={...ag,stage:'EARLIER_RESEARCH_STEP',superseded_by:'editorial_decision_gate',
  leading_decision:decision.decision||null};
}
// Signals WITHOUT a proven permanent redirect (status unknown, canonical, identical title/H1). They protect a locked source
// page but are never reported as a 301.
function resolveDestinationIdentity({url,source,sourceUrl,sourceSource,sourceProtected}){
 if(!url||!source||normUrl(url)===normUrl(sourceUrl))return null;
 const head=src=>{const e=excerptOf(src?.html);return [e.title,...(e.h1||[])].join(' | ').trim().toLowerCase()};
 let canonical=null;try{canonical=canonicalOf(source.html)?new URL(canonicalOf(source.html),url).href:null}catch{}
 const basis=source.final_url&&normUrl(source.final_url)===normUrl(sourceUrl)?'REDIRECTS_TO_SOURCE_PAGE_STATUS_UNKNOWN':
  canonical&&normUrl(canonical)===normUrl(sourceUrl)?'CANONICAL_POINTS_TO_SOURCE_PAGE':
  sourceSource&&head(source)&&head(source)===head(sourceSource)?'SAME_TITLE_AND_H1_AS_SOURCE_PAGE':null;
 return {url,resolves_to_source:!!basis,basis,source_url:sourceUrl,source_protected:!!basis&&sourceProtected===true,
  final_url:source.final_url||null,canonical};
}
function registerGrowthAutomaticResearch(app,pool,data,{fetchLive=fetchPublicGrowthHtml,searchLive=discoverGrowthCompetitorsWithFallback,completeOwnerDraft=null,renderOwn=renderPublicGrowthPage,retryDelayMs=1500,recordResearchOutcome=null,recordProposal=null,saveAiAnswer=null,loadAiAnswers=null,loadSiteMarkets=null,saveSiteMarkets=null,loadCountryRows=null,loadClaimReviews=null,saveClaimReview=null,judgeTasks=judgeTaskMeaning,judgeAnswers=judgeDraftAnswers,buildOverview=buildCompetitorOverview,recordGapList=null,loadGapList=null,recordSelection=null,recordSelectionProposal=null,loadPageMarkets=null,savePageMarkets=null,loadPrewriteMarket=null,recordWritten=null,loadOpenSelection=null,addToSelection=null,saveCompletedReport=null,loadCompletedReport=null,claimWritingRun=null,storeWritingRun=null,failWritingRun=null,lastStoredRun=null}={}){
 if(typeof app?.get!=='function'||typeof pool?.query!=='function'||typeof data!=='function')
  throw Error('GROWTH_AUTO_RESEARCH_DEPENDENCIES_REQUIRED');
 const cache=new Map(),LIMIT=24,TTL=5*60*1000;
 const check=(req,res)=>{
  const raw=String(req.query?.page_id||'');
  if(!/^[1-9][0-9]{0,12}$/.test(raw)){res.status(400).json({success:false,code:'VALID_TRACKER_PAGE_ID_REQUIRED'});return null}
  const page=req.growth?.pages?.find(x=>String(x.id)===raw);
  if(!page){res.status(404).json({success:false,code:'TRACKER_PAGE_NOT_FOUND'});return null}
  // Every locked Case Study of this client, not only the source page: a destination elsewhere on the site can be locked too.
  const lockedPages=(req.growth?.pages||[]).filter(x=>x&&x.case_study_active===true&&x.url).map(x=>({id:Number(x.id),url:String(x.url)}));
  // One run in another market or for another term, chosen by the Opportunity Finder: the page's own setting is not changed.
  const marketOverride=validCountries([String(req.query?.market||'')])[0]||null;
  const queryOverride=String(req.query?.query||'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||null;
  return {id:Number(raw),page,clientId:req.growthTrackerClientId,lockedPages,canEdit:req.growth?.can_edit===true,marketOverride,queryOverride};
 };
 async function analyze(v){
  const cid=v.clientId,pid=v.id;
  const saved=await pool.query("SELECT id,tracker_client_id,url,keyword,brief_content,LEFT(html_content,120000) AS saved_html FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2 LIMIT 1",[cid,pid]);
  const page=saved.rows[0];
  if(!page||page.url!==v.page.url)throw Object.assign(Error('PAGE_IDENTITY_CHANGED'),{code:'PAGE_IDENTITY_CHANGED'});
  page.case_study_active=v.page.case_study_active;
  const optional=await Promise.allSettled([
   pool.query("SELECT page_id,checked_at,google_competitors,ai_perplexity_competitors FROM tracker_snapshots WHERE page_id=$1 AND (google_competitors IS NOT NULL OR ai_perplexity_competitors IS NOT NULL) ORDER BY checked_at DESC,id DESC LIMIT 1",[pid]),
   pool.query("SELECT page_id,tracker_client_id,engine,evidence_method,brand_recommended,domain_cited,exact_page_cited,citation_urls,verified_at,revision_cycle,LEFT(raw_text,4000) AS raw_text FROM tracker_ai_evidence WHERE tracker_client_id=$1 AND page_id=$2 AND is_cleared IS NOT TRUE ORDER BY verified_at DESC NULLS LAST LIMIT 60",[cid,pid]),
   pool.query("SELECT page_id,tracker_client_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 150",[cid,pid,page.url]),
   pool.query("SELECT id,tracker_client_id,url,keyword FROM tracker_pages WHERE tracker_client_id=$1 AND id<>$2 ORDER BY id LIMIT 500",[cid,pid]),
   // Search Console rows of the other tracked pages: a term another page already answers is not a new page.
   pool.query("SELECT page_id,query,clicks,impressions,position FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id<>$2 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 3000",[cid,pid])
  ]);
  const rows=i=>optional[i].status==='fulfilled'?optional[i].value.rows||[]:[];
  const unavailable=optional.map((x,i)=>x.status==='rejected'?['competitor_snapshots','ai_evidence','gsc_queries','site_inventory','site_gsc_queries'][i]:null).filter(Boolean);
  const snapshot=rows(0)[0]||null,historical=snapshotCompetitorLeads({page,snapshot}).leads;
  const own=await fetchLive(page.url,RESEARCH_FETCH).then(x=>({live:x})).catch(e=>({live:null,code:String(e?.code||'LIVE_FETCH_UNAVAILABLE').slice(0,80)}));
  // Only use the browser if the static public source is too thin to assess.
  // Prevent mock-network tests from launching real Chromium unintentionally.
  let renderStatus=own.live?'STATIC_HTML_USED':'STATIC_HTML_UNAVAILABLE';
  if(own.live&&needsGrowthRender(own.live.html)&&
     (fetchLive===fetchPublicGrowthHtml||renderOwn!==renderPublicGrowthPage)){
   const rendered=await renderOwn(page.url);
   renderStatus=rendered?.status||'RENDER_UNAVAILABLE';
   if(rendered?.live?.html&&
      (rendered.live.html.length>own.live.html.length||/<h1\\b/i.test(rendered.live.html)&&!/<h1\\b/i.test(own.live.html))){
    own.live=rendered.live;
   }else if(renderStatus==='BROWSER_RENDERED_SAME_ORIGIN'){
    renderStatus='BROWSER_NO_ADDITIONAL_READABLE_CONTENT';
   }
  }else if(own.live&&needsGrowthRender(own.live.html)){
   renderStatus='BROWSER_FALLBACK_NOT_CONFIGURED';
  }
  // Determine the chosen exact-page query BEFORE competitor discovery.
  // Historical SERPs may be about another brand/product even on the same URL.
  const seed=analyzeGrowthEvidence({page,savedHtml:page.saved_html,live:own.live,
   snapshot,aiRows:rows(1),gscRows:rows(2),competitorPages:[],sitePages:rows(3),previousBrief:page.brief_content});
  const rawFocus=v.queryOverride||seed.growth_decision?.primary_next_action?.query||String(page.keyword||'').trim()||seed.search?.focus_query||'';
  const intentResolution=resolveGrowthPageIntent({keyword:rawFocus,
   title:seed.page_content?.headings?.title||'',
   h1:seed.page_content?.headings?.h1||[],
   description:seed.page_content?.headings?.description||''});
  // The resolver only sees the keyword string; record where the working query actually came from (GSC row or tracker keyword).
  const selectionSource=seed.growth_decision?.selection?.source;
  if(intentResolution.source==='TRACKER_KEYWORD'&&selectionSource&&selectionSource!=='TRACKER_KEYWORD')intentResolution.source=selectionSource;
  const targetQuery=intentResolution.query||'';
  // Market = the place the SOURCE page serves (its tracked keyword and URL), so a shorter GSC query keeps its locality.
  // Markets the owner set for this page win over anything derived. A US-state market derived from the query, keyword or
  // URL is kept only when there is no setting or the owner's main market is the US (it then adds the state's location).
  // Without a Growth setting, the target market and language of the Pre-Write brief for the same keyword are used.
  // Market and language are inherited separately (an empty Growth field takes the Pre-Write value).
  let growthSet=null,prewrite=null;
  if(targetQuery&&typeof loadPageMarkets==='function')growthSet=await Promise.resolve(loadPageMarkets({clientId:cid,pageId:pid})).catch(()=>null);
  if(targetQuery&&!(growthSet?.countries?.length&&growthSet?.language)&&typeof loadPrewriteMarket==='function')
   prewrite=await Promise.resolve(loadPrewriteMarket({clientId:cid,keywords:[page.keyword,targetQuery]})).catch(()=>null);
  // Still incomplete: the site's default market and language (set once for the whole site in the Cockpit).
  let siteSet=null;
  if(targetQuery&&!((growthSet?.countries?.length||prewrite?.countries?.length)&&(growthSet?.language||prewrite?.language))&&typeof loadSiteMarkets==='function')
   siteSet=await Promise.resolve(loadSiteMarkets({clientId:cid})).catch(()=>null);
  let configured=resolveMarketSetting(growthSet,prewrite,siteSet);
  if(v.marketOverride)configured={...(configured||{}),countries:[v.marketOverride],language:configured?.language||'en',source:'OPPORTUNITY_FINDER',
   language_source:configured?.language_source||'DEFAULT_ENGLISH',brief:null,alternatives:[]};
  const derivedMarket=targetQuery?deriveMarket({query:targetQuery,keyword:page.keyword,url:page.url,
   pageHeadings:[...(seed.page_content?.headings?.h1||[]),...(seed.page_content?.headings?.h2||[])]}):null;
  const market=derivedMarket&&(!configured?.countries?.length||configured.countries[0]==='US')?derivedMarket:null;
  // The country (and language) the page itself states, for pages outside a US-state market; reported with the research.
  // A market the owner set for this page in the Tracker wins; headings, domain and hreflang are evidence only.
  const locale=targetQuery&&!market?deriveSearchLocale({html:own.live?.html||page.saved_html||'',url:page.url,configured}):null;
  const discovery=!targetQuery?{
   status:'AMBIGUOUS_SITE_NAVIGATION_INTENT',source:'NONE',query:rawFocus,leads:[],
   reason:intentResolution.warning||'No search phrase is justified by observed page content.'
  }:await Promise.resolve().then(()=>searchLive({query:targetQuery,ownUrl:page.url,market,locale}))
   .catch(e=>({source:'BING_PUBLIC_RSS',query:targetQuery,leads:[],status:'PUBLIC_SEARCH_UNAVAILABLE',
    reason:String(e?.code||'SEARCH_FAILED').slice(0,60)}));
  // The ranking pages are read by the shared reader (also used for new pages).
  const reader=await readRankingPages({query:targetQuery,discovery,historical,fetchLive,renderOwn,retryDelayMs});
  let comparisons=reader.comparisons,attempted=reader.attempted;const fetchLog=reader.fetchLog,fetchSummaryNow=reader.summary;
  let fetchSummary=reader.fetchSummary;
  const report=analyzeGrowthEvidence({page:targetQuery?{...page,keyword:targetQuery}:page,savedHtml:page.saved_html,live:own.live,
   snapshot,aiRows:rows(1),gscRows:rows(2),competitorPages:comparisons,sitePages:rows(3),previousBrief:page.brief_content});
  report.intent_resolution=intentResolution;
  report.page_content.render_status=renderStatus;
  report.summary.render_status=renderStatus;

  report.original_tracked_keyword=page.keyword;
  report.search.top_gsc_query=report.search.focus_query;
  report.search.focus_query=targetQuery||null;
  // The selection made on the FIRST pass (before the working query was written back as the page keyword) is the truth.
  const sel0=seed.growth_decision||{};
  report.query_selection={status:sel0.selection?.status||null,source:sel0.selection?.source||null,query:targetQuery||null,
   destination:sel0.primary_next_action?.destination||null,source_page_signal:sel0.primary_next_action?.source_page_signal||null,
   brand_queries_excluded:sel0.brand_queries||[],excluded:(sel0.excluded_queries||[]).slice(0,12),protected:(sel0.protected_queries||[]).slice(0,5)};
  if(!targetQuery){
   report.growth_decision.primary_next_action.query=null;
   report.search.focus_query=null;
  }
  report.search_discovery={...discovery,leads:(discovery.leads||[]).slice(0,10),target_query:targetQuery,market,
   search_locale:locale?{...locale,...(configured?.alternatives?.length?{prewrite_alternatives:configured.alternatives}:{})}:locale,
   fetched_competitor_urls:comparisons.filter(x=>x.live).map(x=>x.url),competitor_fetch_log:fetchLog,competitor_fetch_summary:fetchSummary,
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
  // Tracked pages that overlap the query (e.g. an existing tool page for a tool search, possibly a locked Case Study) are read
  // too, so they can be weighed as the home of an intent instead of only being listed as an overlap risk.
  for(const o of report.site_architecture?.intent_overlap_risks||[]){
   if(related.length>=6||!o?.url||o.url===page.url||related.some(x=>x.url===o.url))continue;
   try{if(new URL(o.url).origin===siteOrigin)related.push({url:o.url,tracked_keyword:o.keyword||null})}catch{}
  }
  // The selection layer names the proper home of the chosen query; it is always read, even when keyword overlap ranks it lower.
  const designated=report.growth_decision?.primary_next_action?.destination?.url||null;
  if(designated&&designated!==page.url&&!related.some(x=>x.url===designated)){
   try{if(new URL(designated).origin===siteOrigin)related.push({url:designated,tracked_keyword:report.growth_decision.primary_next_action.destination.keyword||null})}catch{}
  }
  // Same-site pages are read once; each read also yields the URL's HTTP identity. A 301/308 address is an ALIAS of its final
  // page: the final URL is the page identity (and the source page itself when the chain ends there), so one page is never
  // selected or compared twice. Temporary redirects and unreachable chains are reported but never merged.
  const destinationSources=new Map(),urlIdentities=[],aliasOf=new Map();
  const sameSiteReviews=await Promise.all(related.map(async x=>{
   try{
    const fresh=await fetchLive(x.url,RESEARCH_FETCH);
    const id=identityFromFetch(x.url,fresh);urlIdentities.push(id);
    if(id.alias_of)aliasOf.set(x.url,id.alias_of);
    if(id.kind==='PERMANENT_REDIRECT'){
     const fin=id.alias_of;
     if(normUrl(fin)!==normUrl(page.url)&&![...destinationSources.keys()].some(u=>normUrl(u)===normUrl(fin)))destinationSources.set(fin,fresh);
    }else if(id.kind==='NO_REDIRECT'||id.kind==='REDIRECT_STATUS_UNKNOWN')destinationSources.set(x.url,fresh);
    const inspected=require('./growth-automatic-analysis.cjs').excerpt(fresh.html);
    return {url:x.url,tracked_keyword:x.tracked_keyword||null,verified_live:true,
     title:inspected.title,h1:inspected.h1,h2:inspected.h2,
     fetched_at:fresh.retrieved_at||null,
     body_evidence:evaluateExistingBody({html:fresh.html,truncated:fresh.truncated,query:targetQuery})};
   }catch(e){urlIdentities.push(identityFromFetch(x.url,{error:String(e?.code||'PUBLIC_HTML_UNAVAILABLE').slice(0,60),redirect_chain:e?.redirect_chain}));
    return {url:x.url,tracked_keyword:x.tracked_keyword||null,
     verified_live:false,reason:String(e?.code||'PUBLIC_HTML_UNAVAILABLE').slice(0,60)}}
  }));
  const lockedUrls=[...new Set([...(page.case_study_active===true?[page.url]:[]),...(v.lockedPages||[]).map(x=>x.url)])];
  const isLocked=u=>!!u&&lockedUrls.some(l=>normUrl(l)===normUrl(u));
  report.url_identities=urlIdentities.filter(id=>id.kind!=='NO_REDIRECT'||id.canonical_points_elsewhere)
   .map(id=>({...id,advice:identityAdvice(id,{lockedUrls})}));
  // The designated destination is identified by its final URL when it is a permanent alias.
  const designatedAlias=designated&&aliasOf.get(designated)||null;
  const designatedFinal=designatedAlias?(normUrl(designatedAlias)===normUrl(page.url)?page.url:designatedAlias):designated;
  report.autonomous_growth_opportunity=autonomouslyFindGrowthOpportunity({report,discovery,existingPageReviews:sameSiteReviews});
  report.full_section_comparison=compareFullSections({query:targetQuery,ownUrl:page.url,
   ownHtml:own.live?.html||page.saved_html||'',ownTruncated:own.live?.truncated===true,
   competitors:comparisons.filter(x=>x.search_source==='SERPER_GOOGLE_ORGANIC'||x.search_source==='SERPAPI_GOOGLE_ORGANIC'||x.search_source==='BING_PUBLIC_RSS')});
  // Compare the distinct growth intent on its likely existing destination,
  // not only the protected homepage that surfaced the GSC opportunity.
  let proposed=(designatedFinal&&(designatedFinal===page.url||destinationSources.has(designatedFinal))?designatedFinal:null)||report.autonomous_growth_opportunity?.editorial_package?.proposed_target_url||
   (report.growth_decision?.primary_next_action?.metrics?
    report.growth_decision.primary_next_action.related_pages_to_check?.find(u=>destinationSources.has(u)):null)||
   // Without verified GSC, research the selected page itself. Never invent
   // an untracked destination or discard otherwise available live content.
   (!report.growth_decision?.primary_next_action?.metrics?page.url:null);
  // Fragment aliases identify the same document. Use the protected sibling's actual URL
  // (not the #fragment Tracker row) as the final editorial target.
  const lockedSibling=proposed&&(v.lockedPages||[]).find(x=>Number(x.id)!==v.id&&normUrl(x.url)===normUrl(proposed));
  if(lockedSibling)proposed=lockedSibling.url;
  let selectedSource=proposed===page.url?own.live:(proposed?(destinationSources.get(proposed)||
   (normUrl(proposed)===normUrl(page.url)?own.live:null)):null);
  // Intent comes from live organic results and the page's own title/H1, never from word overlap alone.
  let serpIntent=inferSerpIntent({query:targetQuery,leads:discovery.leads,pages:comparisons.filter(x=>x.live?.html).map(x=>({url:x.url,html:x.live.html}))});
  const intentOf=(u,src)=>{const ex=excerptOf(src?.html);
   return classifyDestinationIntent({query:targetQuery,title:ex.title,h1:ex.h1,url:u,serpIntent:serpIntent.intent})};
  let destinationIntent=selectedSource?intentOf(proposed,selectedSource):null;
  // An alternative must match the page type AND the whole topic of the query: a storm page is never the home of a wind query.
  // The source page counts as an existing home of the intent too; when it is a locked Case Study it can block a new page
  // (cannibalisation) but is never chosen as the edit target.
  const fits=x=>x.intent.verdict==='COMPATIBLE'&&!(x.intent.missing_query_roots||[]).length;
  const alternativePool=[...destinationSources].filter(([u])=>u!==proposed).map(([u,src])=>({url:u,intent:intentOf(u,src),...(isLocked(u)?{protected:true}:{})}));
  if(own.live&&proposed&&proposed!==page.url)alternativePool.push({url:page.url,intent:intentOf(page.url,own.live),source_page:true,protected:page.case_study_active===true});
  let compatibleAlternatives=alternativePool.filter(fits);
  const topicMismatches=alternativePool.filter(x=>x.intent.verdict==='COMPATIBLE'&&!fits(x)).map(x=>({url:x.url,missing_query_roots:x.intent.missing_query_roots}));
  const retarget=compatibleAlternatives.find(x=>!x.protected);
  if(destinationIntent?.verdict==='DIFFERENT'&&retarget){
   const from=proposed;
   proposed=retarget.url;selectedSource=retarget.source_page?own.live:destinationSources.get(retarget.url);
   destinationIntent={...retarget.intent,retargeted_from:from};
   compatibleAlternatives=compatibleAlternatives.filter(x=>x!==retarget);
  }
  // Mixed results with the page's own type clearly present: compare the page with that type only, and name which same-site page
  // (if any) serves the other, dominant intent. A protected page is named, never edited.
  let typeScope=null;
  if(selectedSource&&destinationIntent&&destinationIntent.verdict!=='COMPATIBLE'){
   typeScope=pageTypeScope({serpIntent,destinationClass:destinationIntent.class});
   if(typeScope){
    const overallIntent=serpIntent.intent;
    typeScope.other_intent_served_by=overallIntent==='MIXED_OR_INSUFFICIENT'?[]:alternativePool
     .filter(x=>x.intent.verdict==='COMPATIBLE'&&!(x.intent.missing_query_roots||[]).length)
     .map(x=>({url:x.url,page_type:x.intent.class,...(x.protected?{protected_case_study:true}:{})}));
    serpIntent={...serpIntent,status:'SERP_INTENT_OBSERVED',intent:typeScope.page_type,agreement_basis:'MIXED_SERP_PAGE_TYPE_PRESENT',
     agreeing_leads:typeScope.results_of_this_type,compatible_leads:typeScope.results_of_this_type,reason:null,page_type_scope:typeScope};
    destinationIntent=intentOf(proposed,selectedSource);
    // Competitors: only results of the page's own type; read further candidates of that type when fewer than two were read.
    const inScope=x=>typeScope.urls.includes(x.url);
    let scoped=comparisons.filter(inScope);
    if(scoped.length<2){
     const tried=new Set(attempted.map(x=>x.url));
     const extra=reader.candidatePool.filter(c=>inScope(c)&&!tried.has(c.url)).slice(0,3);
     if(extra.length){await reader.readThese(extra);attempted=reader.attempted}
     scoped=attempted.filter(x=>inScope(x)&&x.live&&x.quality?.eligible).slice(0,6);
    }
    comparisons=scoped;
    typeScope.competitors_compared=comparisons.map(x=>x.url);
    fetchSummary=fetchSummaryNow()+'; compared only with results of the page\'s own type ('+typeScope.page_type+')';
   }
  }
  report.site_architecture={...(report.site_architecture||{}),
   compatible_existing_pages:compatibleAlternatives.map(x=>({url:x.url,intent_class:x.intent.class,...(x.protected?{protected_case_study:true}:{})})),
   same_type_pages_on_another_topic:topicMismatches};
  const aliasIdentity=designatedAlias?urlIdentities.find(id=>id.original_url===designated):null;
  const destinationIdentity=aliasIdentity?{url:designated,final_url:aliasIdentity.final_url,kind:aliasIdentity.kind,http_statuses:aliasIdentity.http_statuses,
    resolves_to_source:proposed===page.url,basis:proposed===page.url?'PERMANENT_REDIRECT_TO_SOURCE_PAGE':'PERMANENT_REDIRECT_TO_FINAL_PAGE',
    source_url:page.url,source_protected:proposed===page.url&&page.case_study_active===true,alias_of:aliasIdentity.final_url,
    advice:identityAdvice(aliasIdentity,{lockedUrls})}:
   resolveDestinationIdentity({url:proposed,source:selectedSource,sourceUrl:page.url,sourceSource:own.live,sourceProtected:page.case_study_active===true});
  // A destination that is itself a locked Case Study (another tracked page, not the source) is protected in its own right.
  // A fragment-only Tracker row (#statistics) is the same document as a locked sibling.
  // Do not exempt same-document destinations merely because the source row itself is unlocked.
  const destinationLocked=!!proposed&&isLocked(proposed)&&(
   normUrl(proposed)!==normUrl(page.url)||
   (v.lockedPages||[]).some(x=>Number(x.id)!==v.id&&normUrl(x.url)===normUrl(proposed))
  );
  const finalIdentity=destinationLocked?{...(destinationIdentity||{url:proposed}),destination_locked:true,destination_protected:true,locked_url:proposed}:destinationIdentity;
  report.destination_identity=finalIdentity;
  // One identity everywhere: a destination that is a proven 301/308 alias is reported by its final URL in the selection too;
  // the tracked alias stays visible as tracked_url (no Tracker row, GSC row or Case Study identity is changed).
  if(aliasIdentity){
   // The page id follows the final URL too (the source page, or the tracked row for the final URL); the alias row keeps its own id.
   const finalId=normUrl(designatedFinal)===normUrl(page.url)?v.id:(rows(3).find(r=>normUrl(r.url)===normUrl(designatedFinal))?.id??null);
   const toFinal=d=>d&&d.url===designated?{...d,url:designatedFinal,page_id:finalId===null?null:Number(finalId),tracked_url:designated,tracked_page_id:d.page_id??null,
    url_identity:aliasIdentity.kind,http_statuses:aliasIdentity.http_statuses}:d;
   if(report.query_selection)report.query_selection.destination=toFinal(report.query_selection.destination);
   const pna=report.growth_decision?.primary_next_action;
   if(pna)pna.destination=toFinal(pna.destination);
   for(const q of report.growth_decision?.other_reviewable_queries||[])q.destination=toFinal(q.destination);
  }
  report.serp_intent=serpIntent;report.destination_intent=destinationIntent;
  // Saved AI observations count only for the same search term and when recent; others stay visible, labelled.
  report.ai_visibility=annotateAiVisibility(report.ai_visibility,{rows:rows(1),query:targetQuery});
  // Beyond the page itself, from the owner's own data: possible new pages and the route from information to action.
  report.spoke_candidates=spokeCandidates({pageUrl:page.url,focusQuery:targetQuery,gscRows:rows(2),sitePages:rows(3),siteGsc:rows(4),localMarket:!!market});
  // The route from information to action is judged for the page that answers the search (the destination, e.g.
  // /content-scaling/ for a homepage), with its own HTML; the tracked page itself is one of the site's pages then.
  const funnelUrl=proposed||page.url,funnelHtml=proposed&&proposed!==page.url?selectedSource?.html||'':own.live?.html||page.saved_html||'';
  report.reader_funnel={...readerFunnel({pageUrl:funnelUrl,focusQuery:targetQuery,pageIntent:destinationIntent?.class||null,pageHtml:funnelHtml,
   sitePages:[...rows(3),...(funnelUrl!==page.url?[{id:page.id,url:page.url,keyword:page.keyword}]:[])]}),for_url:funnelUrl};
  // What Google shows by title, including results whose page could not be opened (explanation only, never evidence).
  if(Array.isArray(discovery.organic_titles)){const read=new Set(comparisons.filter(x=>x.live?.html).map(x=>x.url));
   report.serp_titles=observeSerpTitles({query:targetQuery,titles:discovery.organic_titles.map(t=>({...t,page_read:!!t.url&&read.has(t.url)}))})}
  // Checked on the page that will actually be compared (after any retarget).
  report.serp_meaning=checkQueryMeaning({query:targetQuery,leads:discovery.leads,destinationHtml:selectedSource?.html||''});
  report.destination_section_comparison=selectedSource?compareFullSections({
   query:targetQuery,ownUrl:proposed,ownHtml:selectedSource.html,
   ownTruncated:selectedSource.truncated===true,
   competitors:comparisons.filter(x=>['SERPER_GOOGLE_ORGANIC','SERPAPI_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(x.search_source))
  }):{status:'EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE',target_url:proposed,
   verified_gap:false,copy_ready:false,comparisons:[]};
  report.destination_section_comparison.target_url=proposed;
  report.destination_section_comparison.destination_identity=finalIdentity;
  report.destination_section_comparison.protected_source_url=page.url;
  const competitorPages=comparisons.filter(x=>['SERPER_GOOGLE_ORGANIC','SERPAPI_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(x.search_source))
   .map(x=>({url:x.url,html:x.live.html,truncated:x.live.truncated===true}));
  const siblingPages=[...destinationSources].filter(([u])=>u!==proposed).map(([u,src])=>({url:u,html:src.html,truncated:src.truncated===true}));
  if(own.live&&proposed!==page.url)siblingPages.push({url:page.url,html:own.live.html,truncated:own.live.truncated===true});
  const coverageFor=pages=>selectedSource?analyzeReaderTaskCoverage({query:targetQuery,
   serpIntent:serpIntent.intent==='MIXED_OR_INSUFFICIENT'?'INFORMATIONAL_GUIDE':serpIntent.intent,
   destination:{url:proposed,html:selectedSource.html,truncated:selectedSource.truncated===true,capture:selectedSource.capture||null},
   competitors:pages,sitePages:siblingPages}):
   {status:'NO_DESTINATION_SOURCE',tasks:[],competitors_considered:[],destination_truncated:false};
  let coverage=coverageFor(competitorPages);
  // "No shared reader task" is only concluded after the candidates Google already returned are used: when the pages
  // read so far share none and unread candidates remain, one more batch (max three, no new search) is read first.
  if(selectedSource&&!(coverage.supported_task_codes||[]).length&&reader.hasMore()){
   const batch={length:await reader.readMore()};
   attempted=reader.attempted;
   const before=comparisons.length;
   comparisons=attempted.filter(x=>x.live&&x.quality?.eligible).slice(0,6);
   const searchPages=comparisons.filter(x=>['SERPER_GOOGLE_ORGANIC','SERPAPI_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(x.search_source));
   competitorPages.splice(0,competitorPages.length,...searchPages.map(x=>({url:x.url,html:x.live.html,truncated:x.live.truncated===true})));
   coverage=coverageFor(competitorPages);
   report.destination_section_comparison={...compareFullSections({query:targetQuery,ownUrl:proposed,ownHtml:selectedSource.html,
    ownTruncated:selectedSource.truncated===true,competitors:searchPages}),
    target_url:proposed,destination_identity:finalIdentity,protected_source_url:page.url};
   coverage.extended_competitor_reading={reason:'NO_SHARED_TASK_IN_FIRST_PAGES_READ',extra_pages_tried:batch.length,
    extra_pages_readable:comparisons.length-before,competitor_pages_used:competitorPages.length};
   fetchSummary=fetchSummaryNow()+'; read '+batch.length+' more because the first pages shared no reader task';
  }
  // Shared words only propose candidate tasks: the meaning check confirms the reader question and the page verdict.
  if(selectedSource&&(coverage.tasks||[]).some(t=>t.supported_by_competitors)){
   let judgement;
   try{judgement=await judgeTasks({query:targetQuery,coverage,pageSections:groupSections(pageBlocks(selectedSource.html))})}
   catch(e){judgement={status:'JUDGE_UNAVAILABLE',error:String(e?.code||'JUDGE_FAILED').slice(0,40),verdicts:{}}}
   applyTaskMeaning(coverage,judgement||{status:'JUDGE_UNAVAILABLE',verdicts:{}});
  }
  report.reader_task_coverage=coverage;
  // Full comparison with every readable ranking page for the editor: elements and topics this page lacks (no fact check).
  if(selectedSource){
   const position=new Map(fetchLog.map(x=>[x.url,x.serp_position]));
   const ranking=attempted.filter(x=>x.live&&x.quality?.eligible&&['SERPER_GOOGLE_ORGANIC','SERPAPI_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(x.search_source))
    .map(x=>({url:x.url,html:x.live.html,truncated:x.live.truncated===true,serp_position:position.get(x.url)??null}));
   try{report.competitor_overview=await buildOverview({query:targetQuery,ownUrl:proposed,ownHtml:selectedSource.html,competitors:ranking})}
   catch{report.competitor_overview={status:'OVERVIEW_UNAVAILABLE'}}
   // The comparison read the ranking pages and found most of them about another subject: the search term means something
   // else there, even when the result titles did not show it (titles of firms are often just names).
   const sc=report.competitor_overview?.subject_check;
   if(sc?.status==='DIFFERENT_SUBJECT'&&report.serp_meaning?.status!=='DIFFERENT_MEANING'){
    report.serp_meaning={status:'DIFFERENT_MEANING',query:targetQuery,results_considered:sc.of,basis:'AI_SUBJECT_CHECK_OF_READ_RANKING_PAGES',
     absent_on_page:sc.pages.filter(p=>p.same_subject==='NO').map(p=>({word:p.host+(p.reason?' — '+p.reason:''),in_titles:1})),
     note:sc.different+' of '+sc.of+' ranking pages that were read are about another subject than this page.'};
   }
  }
  const attempts=[
   {source:'TARGET_STATIC_HTML',status:renderStatus,detail:own.code||null},
   {source:'SEARCH_PROVIDERS',status:discovery.status||'UNKNOWN',detail:((discovery.provider_attempts||[]).map(a=>typeof a==='string'?a:(a.provider||a.source||'')).join(', ')||discovery.source||'')+
    (discovery.market_query_retry?'; market query "'+discovery.market_query_retry.query+'" added '+discovery.market_query_retry.added_leads+' lead(s)':'')+
    (discovery.next_page_retry?'; result page 2 added '+discovery.next_page_retry.added_leads+' lead(s)':'')+
    (Number.isFinite(discovery.organic_results_received)?'; '+discovery.organic_results_received+' organic result(s) received, '+(discovery.rejected_leads||[]).length+' not used (reasons in search_discovery.rejected_leads)':'')||null},
   {source:'HISTORICAL_SNAPSHOT_LEADS',status:historical.length?'LEADS_AVAILABLE':'NONE',detail:String(historical.length)+' stored leads'},
   {source:'COMPETITOR_HTML_FETCH',status:competitorPages.length>=2?'READABLE':'INSUFFICIENT',
    detail:fetchSummary}];
  report.editorial_decision_gate=decideGrowthEditorialAction({report,destination:report.destination_section_comparison,
   coverage,serpIntent,destinationIntent,attempts});
  markFinalDecision(report,report.editorial_decision_gate);
  report.internal_link_plan=proposed?planInternalLinks({targetUrl:proposed,focusQuery:targetQuery,
   pages:[{url:page.url,html:own.live?.html||page.saved_html,truncated:own.live?.truncated===true},...siblingPages.filter(x=>x.url!==page.url)]}):[];
  Object.defineProperty(report,'__sources',{value:{brandLabel:(()=>{try{return new URL(proposed||page.url).hostname.replace(/^www\./,'').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g,'')}catch{return ''}})(),destinationHtml:selectedSource?.html||'',
   competitorHtml:competitorPages.map(c=>c.html)},enumerable:false});
  // A homepage GSC observation is never evidence about a different editorial URL.
  // Resolve the selected destination to a tracked page owned by this same client,
  // then read only independently page-verified rows for that exact URL and page_id.
  // The original tracked page remains a valid destination when no separate spoke is selected.
  // Do not report NO_TRACKED_DESTINATION merely because target_url equals the source URL.
  const destinationPage=selectedSource&&proposed?
   (proposed===page.url?{id:v.id,url:page.url}:
    rows(3).find(x=>x.url===proposed&&Number.isSafeInteger(Number(x.id)))):null;
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
  // Page-verified Search Console queries of the destination, for the growth-potential view of the gap list (optional).
  report.destination_gsc_queries=destinationGscRows.slice(0,150).map(x=>({query:String(x.query||'').slice(0,160),impressions:Number(x.impressions)||0,
   clicks:Number(x.clicks)||0,position:Number(x.position)||null,imported_at:x.imported_at||null}));
  report.evidence_bound_example=buildGrowthEvidenceExample({report,decision:report.editorial_decision_gate,destinationGscRows});
  report.summary.live_checked=!!own.live;
  report.summary.competitor_fetch_attempts=attempted.length;
  report.summary.optional_evidence_complete=unavailable.length===0&&!(discovery.provider_attempts?.length&&!discovery.leads?.length);
  report.summary.live_search_evidence_complete=!!(discovery.leads?.length);
  if(discovery.optional_google_failure_reason)report.evidence_warnings.push('SERPER_GOOGLE_'+discovery.optional_google_failure_reason);
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
 // The AI check for the research's search term, read fresh on every response (pasting an answer never re-runs the paid
 // Google research). Answers count as AI visibility for this search only when at most 14 days old.
 async function withAiCheck(result,v){
  const term=String(result?.editorial_decision_gate?.focus_query||result?.intent_resolution?.query||'').trim();
  if(!result||result.success===false||!term||typeof loadAiAnswers!=='function')return result;
  const check=await aiCheckFor({v,term,target:result.destination_gsc_evidence?.target_url||result.url,
   googleUrls:(result.search_discovery?.leads||[]).map(l=>l&&l.url).filter(Boolean)}).catch(()=>null);
  if(!check)return result;
  const ai=result.ai_visibility&&typeof result.ai_visibility==='object'?{...result.ai_visibility,
   usable_for_this_search:(Number(result.ai_visibility.usable_for_this_search)||0)+check.summary.checked,
   pasted_for_this_search:check.summary.checked}:result.ai_visibility;
  return {...result,ai_visibility:ai,ai_check:check};
 }
 async function aiCheckFor({v,term,target,googleUrls=[]}){
  const answers=await loadAiAnswers({clientId:v.clientId,pageId:v.id,query:term});
  const fresh=answers.filter(a=>Date.now()-Date.parse(a.created_at)<=AI_MAX_AGE_DAYS*86400000);
  return {search_term:term,page_url:target,prompt:aiAnswers.directPrompt(term),engines:aiAnswers.ENGINES,max_paste:aiAnswers.MAX_PASTE,
   can_paste:v.canEdit===true,older_answers_not_counted:answers.length-fresh.length,max_age_days:AI_MAX_AGE_DAYS,
   summary:aiAnswers.summarizeAiAnswers(fresh,{pageUrl:target,googleUrls})};
 }
 // The AI check before the research has finished: for the page's tracked keyword, optional, never running research.
 app.get('/api/tracker-client/:token/growth/ai-check',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  const term=String(v.queryOverride||v.page.keyword||'').trim();
  if(!term||typeof loadAiAnswers!=='function')return res.set('Cache-Control','private, no-store').json({success:true,ai_check:null});
  try{res.set('Cache-Control','private, no-store').json({success:true,ai_check:{...(await aiCheckFor({v,term,target:v.page.url})),basis:'TRACKED_KEYWORD_BEFORE_RESEARCH'}})}
  catch{res.status(503).json({success:false,code:'AI_CHECK_UNAVAILABLE'})}
 });
 // Read-only resume: no Serper, browser fetch or editor writing; keyed to owner, page, URL, market and query.
 app.get('/api/tracker-client/:token/growth/auto-research/saved',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  if(req.growth?.can_edit!==true)return res.status(403).json({success:false,code:'OWNER_ONLY_SAVED_REPORT'});
  try{const row=await (typeof loadCompletedReport==='function'?loadCompletedReport({v}):storedResearch.load(pool,v));
   if(!row)return res.set('Cache-Control','private, no-store').json({success:true,found:false});
   const report={...row.report,restored_from_database:true,saved_at:row.saved_at};
   if(typeof loadAiAnswers==='function'){const term=String(v.queryOverride||v.page.keyword||'').trim();
    if(term)report.ai_check=await aiCheckFor({v,term,target:v.page.url}).catch(()=>report.ai_check)}
   return res.set('Cache-Control','private, no-store').json({success:true,found:true,report});
  }catch(e){return res.status(503).json({success:false,code:'SAVED_REPORT_UNAVAILABLE'})}
 });
 app.get('/api/tracker-client/:token/growth/auto-research',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  // Never serve a recently cached unlocked result after Case Study activation.
  const key=v.clientId+':'+v.id+':'+(v.page.case_study_active?'locked':'unlocked')+':'+v.page.url+':'+(v.marketOverride||'')+':'+(v.queryOverride||''),stored=cache.get(key);
  if(stored?.result&&Date.now()-stored.created<TTL)
   return res.set('Cache-Control','private, no-store').json(await withAiCheck(stored.result,v));
  if(stored?.promise){
   try{return res.set('Cache-Control','private, no-store').json(await withAiCheck(await stored.promise,v))}
   catch{return res.status(503).json({success:false,code:'AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE'})}
  }
  const promise=analyze(v);cache.set(key,{created:Date.now(),promise});
  try{
   const result=await promise;
   cache.set(key,{created:Date.now(),result});
   while(cache.size>LIMIT)cache.delete(cache.keys().next().value);
   return res.set('Cache-Control','private, no-store').json(await withAiCheck(result,v));
  }catch(e){
   cache.delete(key);console.warn('[growth-auto-research]',String(e?.code||'RESEARCH_ERROR'),e&&e.stack?String(e.stack).split('\n').slice(0,3).join(' | '):'');
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
  const key=v.clientId+':'+v.id+':'+(v.page.case_study_active?'locked':'unlocked')+':'+v.page.url+':'+(v.marketOverride||'')+':'+(v.queryOverride||'');
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
  const gateDecision=report.editorial_decision_gate?.decision;
  const gate=report.editorial_decision_gate||{};
  if(['NO_CHANGE','DATA_BLOCKED'].includes(gateDecision)){
   // Final outcomes: no provider call and no forced copy.
   completion={...base,status:'NOT_REQUIRED_FOR_DECISION',decision:gateDecision,draft:null,error_code:null};
  }else if(gate.new_page_plan?.page_type==='PRODUCT_OR_TOOL_PAGE'){
   // A product page is written from the owner's real product facts; no provider call, no generated feature or price claims.
   completion={...base,status:'OWNER_PRODUCT_FACTS_REQUIRED',decision:gateDecision,draft:null,error_code:null};
  }else if(!Number.isSafeInteger(targetId)||targetId<1){
   completion={...base,status:'DESTINATION_TRACKER_PAGE_REQUIRED',draft:null};
  }else if(req.body?.write===false){
   // Hybrid flow: research and the full gap list first; text is written only for what the owner selects (/write).
   completion={...base,status:'WRITING_ON_SELECTION',decision:gateDecision,draft:null,error_code:null};
  }else if(String(process.env.GROWTH_AI_DRAFTS||'').toLowerCase()==='off'){
   // Owner setting: research and confirmed reader questions only; the editor writes the text (CMS handoff takes own text).
   completion={...base,status:'EDITOR_WRITES',decision:gateDecision,draft:null,error_code:null};
  }else{
   const query=String(report.editorial_decision_gate?.focus_query||
    report.growth_decision?.primary_next_action?.query||'').slice(0,160);
   const researchContext={
    target_url:targetUrl,focus_query:query,
    observations:(report.destination_section_comparison?.comparisons||[]).filter(c=>
     c.competitor_url&&c.competitor_heading&&String(c.competitor_excerpt||'').length>=75)
     .slice(0,3).map(c=>({competitor_url:c.competitor_url,
      competitor_heading:c.competitor_heading,competitor_excerpt:String(c.competitor_excerpt).slice(0,600)})),
    reader_task:gate.improvement_plan?{mode:'SECTION_IMPROVEMENT',
     tasks:gate.improvement_plan.tasks.map(t=>({code:t.code,label:t.label,...(t.reader_question?{reader_question:t.reader_question}:{}),placement_mode:t.placement?.mode,
      placement_heading:t.placement?.section_heading,destination_status:t.destination_status,core_words:t.match?.core_words})),
     existing_headings:report.reader_task_coverage?.destination_section_headings||[]}:
     gate.new_page_plan?{mode:'NEW_DISTINCT_PAGE',tasks:gate.new_page_plan.tasks.slice(0,2).map(t=>({code:t.code,label:t.label})),
      existing_headings:report.reader_task_coverage?.destination_section_headings||[]}:null
   };
   // Competitor passages are context only; with a verified task the observations are not required.
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
     generator_rejections:validIdentity&&Array.isArray(detail.rejected_sections)?detail.rejected_sections.slice(0,6).map(x=>({h2:String(x.h2||'').slice(0,140),reason:String(x.reason||'').slice(0,80)})):null,
     source_type:validIdentity?detail.draft_source_type||null:null,
     source_warning:validIdentity?detail.draft_source_warning||null:null,
     source_retrieved_at:validIdentity?detail.draft_source_retrieved_at||null:null,
     gsc_context:validIdentity?detail.gsc_context||{status:'NO_VERIFIED_GSC',gsc_required:false}:null,
     competitor_research_passages_used:validIdentity?Number(detail.live_competitor_observations_used||0):0};
    // An unconfigured or unreachable AI provider is an explicit blocker, never a silent empty draft.
    if(['OPTIONAL_AI_NOT_CONFIGURED','OPTIONAL_AI_UNAVAILABLE'].includes(completion.status))
     completion={...completion,provider_status:completion.status,error_code:completion.status,status:'BLOCKED_PROVIDER'};
   }catch{completion={...base,status:'DRAFT_UNAVAILABLE',error_code:'OWNER_DRAFT_FAILED',draft:null}}
  }
  // A section written for a confirmed reader question must answer that question (checked by meaning, not by shared words).
  if(completion.draft&&gate.improvement_plan&&gate.improvement_plan.tasks.some(t=>t.reader_question)){
   try{completion={...completion,answer_check:await judgeAnswers({sections:completion.draft.sections||[],tasks:gate.improvement_plan.tasks})}}
   catch(e){completion={...completion,answer_check:{status:'JUDGE_UNAVAILABLE',error:String(e?.code||'JUDGE_FAILED').slice(0,40),verdicts:{}}}}
  }
  // Producer -> gate -> owner decision: the gate's existing verified_editorial_opportunity branch now has a real producer.
  const produced=produceVerifiedEditorialOpportunity({report,completion,sources:report.__sources||{}});
  // The provider's raw output stays visible, but every section says whether it was accepted, so rejected text is never
  // mistaken for the validated proposal.
  // Decisions run on the raw provider output; every OUTPUT uses completionOut, where rejected text is withheld.
  let completionOut=completion;
  if(completion.draft&&Array.isArray(completion.draft.sections)){
   const ok=new Set(produced.accepted_headings||[]);
   const why=h=>(produced.rejections||[]).filter(x=>x.heading===h).map(x=>({task:x.task,code:x.code,reason:x.reason||null,claim_violations:(x.claim_violations||[]).map(v=>v.code)}));
   completionOut={...completion,draft:{...completion.draft,raw_provider_output:true,
    // Rejected provider text is withheld from every output (JSON, packet, export, UI): only its heading and the reasons remain.
    sections:completion.draft.sections.map(sec=>ok.has(sec.h2)?{...sec,review_status:'ACCEPTED_FOR_OWNER_REVIEW'}:
     {h2:sec.h2,paragraphs:[],body_withheld:true,review_status:'REJECTED_NOT_PART_OF_PROPOSAL',rejection_reasons:why(sec.h2)})}};
  }
  const finalGate=produced.opportunity?decideGrowthEditorialAction({
   report:{...report,verified_editorial_opportunity:produced.opportunity},destination:report.destination_section_comparison,
   coverage:report.reader_task_coverage,serpIntent:report.serp_intent,destinationIntent:report.destination_intent,
   attempts:report.editorial_decision_gate?.attempted_sources||[]}):report.editorial_decision_gate;
  const ownerDecision=decideOwnerGrowthEdit({report:{...report,editorial_decision_gate:finalGate},completion,sources:report.__sources||{}});
  // The final decision's evidence ladder is the single source for every output below (packet, package, completion, UI).
  const evidenceStatus=deriveEvidenceStatus({decision:ownerDecision,serpIntent:report.serp_intent,coverage:report.reader_task_coverage});
  const completeDecision={...ownerDecision,verified_gap:evidenceStatus.verified_gap,copy_ready:evidenceStatus.copy_ready,evidence_status:evidenceStatus};
  // copy_ready means "ready for human review". Publication needs more: every unverified statement checked by the owner and,
  // where Search Console is available, a baseline of the target page itself (GSC stays optional: the owner can confirm
  // publishing without one). Rows of the tracked page are never used as the target page's baseline.
  // The Search Console import per country also gives the target page's own starting point (dated, this page only).
  let countryRows=[];if(typeof loadCountryRows==='function'){try{countryRows=await loadCountryRows({clientId:v.clientId})}catch{}}
  // The owner's KEEP/REMOVE per unverified statement of this target page (read only here).
  let claimReviews=[];if(typeof loadClaimReviews==='function'&&Number.isSafeInteger(targetId)){try{claimReviews=await loadClaimReviews({clientId:v.clientId,targetPageId:targetId})}catch{}}
  completeDecision.publication_readiness=publicationReadiness({decision:completeDecision,destinationGsc:report.destination_gsc_evidence,countryRows,claimReviews});
  completeDecision.publication_readiness.target_page_id=Number.isSafeInteger(targetId)?targetId:null;
  const handoffPackage=buildOwnerHandoffPackage({report,decision:completeDecision,completion:completionOut,linkPlan:report.internal_link_plan||[]});
  // Package the actual observed passages with the draft. A reader can now
  // inspect precisely which source supports each proposed editorial review.
  const workPacket={
   status:completion.draft?'DRAFT_AND_SOURCE_COMPARISON_FOR_REVIEW':'SOURCE_COMPARISON_ONLY',
   target_url:completion.target_url||report.destination_section_comparison?.target_url||report.url,
   focus_query:report.editorial_decision_gate?.focus_query||null,
   generated_draft:completionOut.draft||null,
   editorial_decision:completeDecision,
   evidence_verified:evidenceStatus.draft_checked,evidence_status:evidenceStatus.label,evidence_ladder:evidenceStatus,
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
  markFinalDecision(report,completeDecision);
  // Optional Cockpit memory (owner route only): remember the outcome so the
  // Cockpit does not suggest the same research again and can follow it up.
  if(typeof recordResearchOutcome==='function')
   Promise.resolve().then(()=>recordResearchOutcome({clientId:v.clientId,pageId:v.id,targetPageId:targetId,
    decision:completeDecision.decision,blocker:completeDecision.blocker_code||null,
    evidenceStatus:evidenceStatus.label,focusQuery:report.editorial_decision_gate?.focus_query||''}))
    .catch(e=>console.warn('[growth-auto-research] recommendation memory not saved',String(e?.code||'unknown')));
  // Optional Cockpit hook (owner route only): a checked edit proposal is stored so the CMS handoff uses exactly this text.
  let proposalRef=null;
  // Never for a protected Case Study page: its content and baseline stay untouched.
  const targetLocked=(targetId===v.id&&v.page.case_study_active===true)||(v.lockedPages||[]).some(x=>x.id===targetId||x.url===targetUrl);
  if(typeof recordProposal==='function'&&!targetLocked&&completeDecision.decision==='IMPROVE_EXISTING'&&completeDecision.copy_ready===true){
   try{proposalRef=await recordProposal({clientId:v.clientId,researchPageId:v.id,targetPageId:targetId,decision:completeDecision})}
   catch(e){console.warn('[growth-auto-research] proposal not saved',String(e?.code||'unknown'))}
  }
  // Every difference with the ranking pages, stored so a later selection writes from exactly this research.
  const gapList=buildGapList(report);
  let gapRef=null;
  if(typeof recordGapList==='function'&&Number.isSafeInteger(targetId)&&targetId>0&&!(v.lockedPages||[]).some(x=>x.id===targetId||x.url===targetUrl)){
   try{gapRef=await recordGapList({clientId:v.clientId,targetPageId:targetId,targetUrl,focusQuery:gapList.focus_query,list:gapList})}
   catch(e){console.warn('[growth-auto-research] gap list not saved',String(e?.code||'unknown'))}
  }
  // The open part of this page's previous selection is carried over by stable item id (pre-ticked, never written by itself).
  let carried=null;
  if(gapRef&&typeof loadOpenSelection==='function'){
   try{const open=await loadOpenSelection({clientId:v.clientId,targetPageId:targetId,beforeId:Number(gapRef.id)});
    if(open&&open.pending.length){const m=remapSelection(open.pending_items||[],gapList.items);
     // Shown ticked only; it becomes the new list's selection when the owner confirms it (the selection is never implied).
     carried={from_gap_list_id:open.gap_list_id,pending_ids:m.carried,needs_confirmation:m.needs_confirmation,needs_remapping:m.needs_remapping,no_longer_found:m.no_longer_found,
      note:'Items you selected earlier and that were not written yet. Ticked again only when the new research still shows the same need; nothing is written until you click.'};}}
   catch(e){console.warn('[growth-auto-research] open selection not loaded',String(e?.code||'unknown'))}
  }
  const enriched=await withAiCheck(report,v);
  const completedReport={...enriched,
   market_setting_url:typeof savePageMarkets==='function'?'/api/tracker-client/'+encodeURIComponent(req.params.token)+'/growth/markets?page_id='+encodeURIComponent(v.id):null,
   gap_list:{...gapList,carried_over:carried,id:gapRef?Number(gapRef.id):null,target_page_id:targetId,write_url:gapRef?'/api/tracker-client/'+encodeURIComponent(req.params.token)+'/growth/auto-research/write?page_id='+encodeURIComponent(v.id):null},
   cms_handoff:proposalRef?{proposal_id:Number(proposalRef.id),target_page_id:targetId,
    url:'/track/'+encodeURIComponent(req.params.token)+'/growth/cms-export?page_id='+encodeURIComponent(targetId)}:null,
   editorial_decision_gate:completeDecision,
   // One outcome when the task check says NO_CHANGE but the topic comparison has topics on 2+ ranking pages.
   outcome_context:reconcileOutcome({decision:completeDecision,gapList,report,aiCheck:enriched.ai_check||null}),
   access:{can_edit:true,read_only_analysis:false,owner_report:true},
   editorial_review_draft:completionOut,
   editorial_work_packet:workPacket,
   handoff_package:handoffPackage,
   verified_opportunity_status:{producer:'GROWTH_VERIFIED_OPPORTUNITY_PRODUCER',status:produced.status,rejections:produced.rejections,verified:!!produced.opportunity},
   report_completion:{status:
     completeDecision.decision==='NO_CHANGE'?'NO_CHANGE_CLOSURE_REPORT':
     completeDecision.decision==='DATA_BLOCKED'?'DATA_BLOCKED_REPORT':
     completeDecision.copy_ready===true?(completeDecision.decision==='NEW_DISTINCT_PAGE'?'NEW_PAGE_DRAFT_FOR_OWNER_REVIEW':'CONCRETE_EDIT_FOR_OWNER_REVIEW'):
     'RESEARCH_COMPLETE_DRAFT_NOT_READY',
    evidence_gate:completeDecision.decision||'UNVERIFIED',
    verified_gap:completeDecision.verified_gap===true,
    copy_ready:completeDecision.copy_ready===true,
    draft_provider_status:completion.status,evidence_status:evidenceStatus,
    owner_only:true,automatic_publishing:false,case_study_unchanged:true}};
  // Persist before responding, so closing the browser never loses the completed owner report.
  try{await (typeof saveCompletedReport==='function'?saveCompletedReport({v,report:completedReport}):storedResearch.save(pool,v,completedReport))}
  catch(e){return res.status(503).set('Cache-Control','private, no-store').json({success:false,code:'GROWTH_REPORT_NOT_SAVED'})}
  return res.set('Cache-Control','private, no-store').json(completedReport);
 });
 // The owner sets the page's target markets (ordered, the first is the main one). An empty list removes the setting.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/markets',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  const no=(status,code)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code});
  if(req.growth?.can_edit!==true||typeof savePageMarkets!=='function')return no(403,'OWNER_ONLY_MARKET_SETTING');
  // Each entry like the Pre-Write region picker ("nl — Netherlands"), a code or a country name; split on commas only.
  const entries=(Array.isArray(req.body?.countries)?req.body.countries:String(req.body?.countries||'').split(/[,;]+/)).map(x=>String(x).trim()).filter(Boolean);
  const countries=validCountries(entries);
  if(entries.length&&countries.length<entries.filter(x=>x).length)return no(400,'UNKNOWN_COUNTRY');
  if(String(req.body?.language||'').trim()&&!validLanguage(req.body.language))return no(400,'UNKNOWN_LANGUAGE');
  let saved;
  try{saved=await savePageMarkets({clientId:v.clientId,pageId:v.id,countries,language:req.body?.language})}catch{return no(503,'MARKET_SETTING_NOT_SAVED')}
  // The next research run uses the new markets.
  for(const k of [...cache.keys()])if(k.startsWith(v.clientId+':'+v.id+':'))cache.delete(k);
  res.set('Cache-Control','private, no-store').json({success:true,markets:saved,research_rerun_required:true});
 });
 // The site's default target market(s) and language (owner): every page without its own setting or Pre-Write brief.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/site-markets',data,async(req,res)=>{
  const no=(status,code)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code});
  if(req.growth?.can_edit!==true||typeof saveSiteMarkets!=='function')return no(403,'OWNER_ONLY_MARKET_SETTING');
  const entries=(Array.isArray(req.body?.countries)?req.body.countries:String(req.body?.countries||'').split(/[,;]+/)).map(x=>String(x).trim()).filter(Boolean);
  const countries=validCountries(entries);
  if(entries.length&&countries.length<entries.length)return no(400,'UNKNOWN_COUNTRY');
  if(String(req.body?.language||'').trim()&&!validLanguage(req.body.language))return no(400,'UNKNOWN_LANGUAGE');
  let saved;
  try{saved=await saveSiteMarkets({clientId:req.growthTrackerClientId,countries,language:req.body?.language})}catch{return no(503,'MARKET_SETTING_NOT_SAVED')}
  // Every page of this site researches with the new default on its next run.
  for(const k of [...cache.keys()])if(k.startsWith(req.growthTrackerClientId+':'))cache.delete(k);
  res.set('Cache-Control','private, no-store').json({success:true,site_markets:saved,research_rerun_required:true});
 });
 // The owner's decision on one unverified statement: KEEP (confirmed for their business) or REMOVE (leaves the text).
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/claim-review',data,async(req,res)=>{
  const no=(status,code)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code});
  if(req.growth?.can_edit!==true||typeof saveClaimReview!=='function')return no(403,'OWNER_ONLY_CLAIM_REVIEW');
  const b=req.body||{},pid=Number(b.target_page_id),statement=String(b.statement||'').replace(/\s+/g,' ').trim(),decision=String(b.decision||'');
  if(!(req.growth.pages||[]).some(p=>Number(p.id)===pid))return no(404,'TARGET_PAGE_NOT_FOUND');
  if(statement.length<8||statement.length>600)return no(400,'STATEMENT_REQUIRED');
  if(!['KEEP','REMOVE','UNDECIDED'].includes(decision))return no(400,'DECISION_KEEP_OR_REMOVE');
  try{await saveClaimReview({clientId:req.growthTrackerClientId,targetPageId:pid,statement,decision})}catch{return no(503,'NOT_SAVED')}
  // The next report of this page shows the decision; cached research is unaffected (the review is read on every complete run).
  res.set('Cache-Control','private, no-store').json({success:true,statement,decision});
 });
 // An AI answer for the research's search term, pasted by the owner (same prompt, checks and parser as the Free check).
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/ai-answer',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  const no=(status,code,error)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code,error});
  if(req.growth?.can_edit!==true||typeof saveAiAnswer!=='function')return no(403,'OWNER_ONLY_AI_ANSWER','Only the Tracker owner can add AI answers.');
  const b=req.body||{},engine=String(b.engine||''),text=String(b.text||''),query=String(b.query||'').trim();
  if(!query||query.length>120)return no(400,'SEARCH_TERM_REQUIRED','The search term of the research is missing.');
  if(!aiAnswers.ENGINE_IDS.has(engine))return no(400,'UNKNOWN_AI_SYSTEM','Choose the AI system you used.');
  if(!text.trim())return no(400,'ANSWER_REQUIRED','Paste the complete answer first.');
  if(text.length>aiAnswers.MAX_PASTE)return no(413,'ANSWER_TOO_LONG','This answer is too long; paste only the answer and its sources.');
  if(aiAnswers.otherPrompt(text))return no(400,'ANSWER_TO_ANOTHER_PROMPT','This is an answer to the company quick-scan prompt (company profile or QUESTION 1–4), not to the prompt for this search term. Copy the prompt shown here and paste that answer.');
  // The page the research targets (a destination on the same site), else the tracked page itself.
  const sameSite=u=>{try{return new URL(u).hostname===new URL(v.page.url).hostname}catch{return false}};
  b.page_url=sameSite(b.page_url)?String(b.page_url):v.page.url;
  const parsed=aiAnswers.parseAiAnswer(text,{pageUrl:b.page_url});
  try{await saveAiAnswer({clientId:v.clientId,pageId:v.id,query,engine,rawText:text,parsed})}catch{return no(503,'AI_ANSWER_NOT_SAVED','The answer could not be saved. Please try again.')}
  // The updated AI check comes back directly, so the page never re-runs the (paid) Google research for it.
  const urls=(Array.isArray(b.google_urls)?b.google_urls:[]).map(String).filter(u=>/^https?:\/\//.test(u)).slice(0,20);
  const ai_check=typeof loadAiAnswers==='function'?await aiCheckFor({v,term:query,target:String(b.page_url||v.page.url),googleUrls:urls}).catch(()=>null):null;
  res.set('Cache-Control','private, no-store').json({success:true,engine,query,sources:parsed.sources.length,resources_status:parsed.resources_status,own_site_cited:parsed.own_site_cited,ai_check});
 });
 // The owner's deliberate selection (the ticks): the only call that replaces the selected items. Written items stay written.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/auto-research/selection',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  const no=(status,code)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code});
  if(req.growth?.can_edit!==true||typeof loadGapList!=='function'||typeof recordSelection!=='function')return no(403,'OWNER_ONLY_SELECTION');
  let list;try{list=await loadGapList({clientId:v.clientId,id:req.body?.gap_list_id})}catch{return no(503,'GAP_LIST_UNAVAILABLE')}
  if(!list)return no(404,'GAP_LIST_NOT_FOUND');
  const ids=Array.isArray(req.body?.item_ids)?[...new Set(req.body.item_ids.map(String))]:[];
  const known=(list.items||[]).filter(x=>ids.includes(String(x.id))).map(x=>x.id);
  if(ids.length&&!known.length)return no(400,'SELECTION_NOT_IN_GAP_LIST');
  try{await recordSelection({clientId:v.clientId,id:list.id,itemIds:known})}catch{return no(503,'SELECTION_NOT_SAVED')}
  const done=new Set((list.written_ids||[]).map(String));
  res.set('Cache-Control','private, no-store').json({success:true,gap_list_id:Number(list.id),selected:known,
   written:known.filter(x=>done.has(String(x))),pending:known.filter(x=>!done.has(String(x)))});
 });
 // Writing for the owner's selection only: items come from the stored gap list (never from the browser), at most four per
 // call, one repair attempt, then a marked concept. The result is stored as a proposal for the CMS handoff. Nothing is published.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/auto-research/write',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  const no=(status,code)=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code});
  if(req.growth?.can_edit!==true||typeof completeOwnerDraft!=='function'||typeof loadGapList!=='function')return no(403,'OWNER_ONLY_WRITING');
  const ids=Array.isArray(req.body?.item_ids)?[...new Set(req.body.item_ids.map(String))].slice(0,200):[];
  if(!ids.length)return no(400,'SELECT_AT_LEAST_ONE_ITEM');
  let list;
  try{list=await loadGapList({clientId:v.clientId,id:req.body?.gap_list_id})}catch{return no(503,'GAP_LIST_UNAVAILABLE')}
  if(!list)return no(404,'GAP_LIST_NOT_FOUND');
  const target=(req.growth?.pages||[]).find(p=>Number(p.id)===Number(list.target_page_id));
  if(!target||target.url!==list.target_url)return no(409,'GAP_LIST_PAGE_CHANGED');
  if(target.case_study_active===true)return no(409,'CASE_STUDY_BASELINE_LOCKED');
  const items=(list.items||[]).filter(x=>ids.includes(String(x.id)));
  if(!items.length)return no(400,'SELECTION_NOT_IN_GAP_LIST');
  if(!items.some(x=>x.writable))return no(400,'ONLY_PAGE_ELEMENTS_SELECTED');
  // One outcome: research without enough evidence proposes nothing, so nothing is written from it either.
  if(list.research?.evidence_status==='INSUFFICIENT_EVIDENCE')return no(409,'NOT_ENOUGH_EVIDENCE_TO_WRITE');
  // The list belongs to the page as researched: a changed page needs new research, never old advice (checked before any AI call).
  if(list.source_fingerprint){
   let live=null;try{live=await fetchLive(list.target_url)}catch{}
   if(!live||typeof live.html!=='string')return no(409,'PAGE_NOT_READABLE_NOW_RERUN_RESEARCH');
   if(pageFingerprint(live.html)!==list.source_fingerprint)return no(409,'PAGE_CHANGED_SINCE_RESEARCH_RERUN_RESEARCH');
  }
  // Writing never removes anything from the owner's selection: items it names are added (a deliberate change of the
  // selection goes through the selection endpoint). The stored selection is what is written, in list order.
  const stored=new Set((list.selected||[]).map(String));
  if(typeof addToSelection==='function')await Promise.resolve(addToSelection({clientId:v.clientId,id:list.id,itemIds:items.map(x=>x.id)})).catch(()=>{});
  else if(typeof recordSelection==='function'&&!stored.size)await Promise.resolve(recordSelection({clientId:v.clientId,id:list.id,itemIds:items.map(x=>x.id)})).catch(()=>{});
  const selectedItems=(list.items||[]).filter(x=>stored.has(String(x.id))||ids.includes(String(x.id)));
  // The whole selection is kept; this run writes the next four not yet written, the rest stays pending (said, not cut).
  const plan=planBatch(selectedItems,req.body?.rewrite===true?[]:list.written_ids||[]);
  if(!plan.batch.length){
   const last=typeof lastStoredRun==='function'?await Promise.resolve(lastStoredRun({gapListId:list.id})).catch(()=>null):null;
   return res.status(409).set('Cache-Control','private, no-store').json({success:false,code:'SELECTION_ALREADY_WRITTEN',
    last_run:last?{run_id:Number(last.id),proposal_id:last.proposal_id?Number(last.proposal_id):null,
     cms_url:last.proposal_id?'/track/'+encodeURIComponent(req.params.token)+'/growth/cms-export?page_id='+encodeURIComponent(list.target_page_id):null}:null});
  }
  // One active run per list: a repeated or parallel request gets the running one back, no second AI call.
  let run=null;
  if(typeof claimWritingRun==='function'){
   let claim;try{claim=await claimWritingRun({clientId:v.clientId,gapListId:list.id,itemIds:plan.batch.map(x=>x.id)})}catch{return no(503,'WRITING_RUN_NOT_STARTED')}
   if(claim.conflict)return res.status(409).set('Cache-Control','private, no-store').json({success:false,code:'WRITING_IN_PROGRESS',
    run:{run_id:Number(claim.conflict.id),item_ids:claim.conflict.item_ids,started_at:claim.conflict.started_at}});
   run=claim.run;
  }
  const generate=async research_context=>{
   const outcome=await completeOwnerDraft({token:req.params.token,body:{page_id:Number(list.target_page_id),focus_query:list.focus_query||'',
    growth_source_page_id:v.id,research_context,flag_fallback:true}});
   const d=outcome?.body||{};
   if(outcome.statusCode!==200||d.success!==true||d.canonical_url!==list.target_url||Number(d.page_id)!==Number(list.target_page_id))
    return {status:d.code||'WRITER_UNAVAILABLE'};
   return {status:d.status,draft:d.draft||null,flags:d.flags||[],source_text:d.source_text||''};
  };
  let written;
  try{written=await writeForSelection({items:plan.batch,targetUrl:list.target_url,focusQuery:list.focus_query||'',generate,
   research:list.research||null,sourceFingerprint:list.source_fingerprint||null})}
  catch(e){if(run&&typeof failWritingRun==='function')await Promise.resolve(failWritingRun({runId:run.id,error:'WRITER_ERROR'})).catch(()=>{});throw e}
  // The editor's choice in the AI pop-up (no current AI answers: continue without), kept with the concepts.
  const aiChoice=['WITH_AI','WITHOUT_AI'].includes(String(req.body?.ai_check_choice||''))?String(req.body.ai_check_choice):'NOT_ASKED';
  let aiCounted=0;if(typeof loadAiAnswers==='function'&&list.focus_query){try{aiCounted=(await loadAiAnswers({clientId:v.clientId,pageId:v.id,query:list.focus_query})).filter(a=>Date.now()-Date.parse(a.created_at)<=AI_MAX_AGE_DAYS*86400000).length}catch{}}
  written.ai_check={choice:aiCounted?'WITH_AI':aiChoice,answers_counted:aiCounted};
  // An item is done only when its concept AND evidence dossier are stored as a proposal, in the same transaction.
  const linked=(written.sections||[]).map(s=>s.item_id);
  let proposalRef=null,storageError=null;
  if(linked.length){
   const proposal={researchPageId:v.id,targetPageId:Number(list.target_page_id),targetUrl:list.target_url,focusQuery:list.focus_query,written};
   if(typeof storeWritingRun==='function'){
    try{proposalRef=(await storeWritingRun({clientId:v.clientId,runId:run?.id||null,gapListId:list.id,itemIds:linked,proposal})).proposal}
    catch(e){storageError=String(e?.code||'STORE_FAILED').slice(0,60);console.warn('[growth-auto-research] selection concept not stored',storageError)}
   }else if(typeof recordSelectionProposal==='function'){
    // Without the transactional store (tests, older wiring): store first, mark written only after it succeeded.
    try{proposalRef=await recordSelectionProposal({clientId:v.clientId,...proposal});
     if(proposalRef&&typeof recordWritten==='function')await recordWritten({clientId:v.clientId,id:list.id,itemIds:linked})}
    catch(e){storageError=String(e?.code||'STORE_FAILED').slice(0,60);console.warn('[growth-auto-research] selection concept not stored',storageError)}
   }
  }
  if(run&&!proposalRef&&typeof failWritingRun==='function')await Promise.resolve(failWritingRun({runId:run.id,error:storageError||written.writer_status||'NOT_WRITTEN'})).catch(()=>{});
  const done=proposalRef?linked:[];
  const pending=[...plan.batch.filter(x=>!done.includes(x.id)),...plan.pending].map(x=>({item_id:x.id,title:x.title}));
  if(storageError)written.storage_error='CONCEPT_NOT_STORED_NOTHING_MARKED_WRITTEN';
  res.set('Cache-Control','private, no-store').json({success:true,...written,gap_list_id:Number(list.id),selected:selectedItems.map(x=>x.id),
   run_id:run?Number(run.id):null,stored:!!proposalRef,
   batch:plan.batch.map(x=>x.id),already_written:plan.already_written,pending,
   batch_note:pending.length?pending.length+' selected item(s) are kept for the next run (at most '+MAX_WRITE_ITEMS+' per run).':null,
   published:false,copy_ready:false,
   cms_handoff:proposalRef?{proposal_id:Number(proposalRef.id),target_page_id:Number(list.target_page_id),
    url:'/track/'+encodeURIComponent(req.params.token)+'/growth/cms-export?page_id='+encodeURIComponent(list.target_page_id)}:null});
 });
 app.get('/track/:token/growth/auto-research',data,async(req,res)=>{
  const v=check(req,res);if(!v)return;
  // Target market(s) and language at the top, before the research runs (owner only). Same lists as the Pre-Write brief;
  // without a Growth setting, the Pre-Write brief of the same keyword is shown and used.
  let marketBox='';
  if(req.growth?.can_edit===true&&typeof savePageMarkets==='function'){
   let current=null,prewrite=null;
   if(typeof loadPageMarkets==='function')current=await Promise.resolve(loadPageMarkets({clientId:v.clientId,pageId:v.id})).catch(()=>null);
   if(!(current?.countries?.length&&current?.language)&&typeof loadPrewriteMarket==='function'){
    const kw=await pool.query('SELECT keyword FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2',[v.clientId,v.id]).then(r=>r.rows[0]?.keyword).catch(()=>null);
    prewrite=await Promise.resolve(loadPrewriteMarket({clientId:v.clientId,keywords:[kw]})).catch(()=>null);
   }
   let siteDefault=null;
   if(typeof loadSiteMarkets==='function')siteDefault=await Promise.resolve(loadSiteMarkets({clientId:v.clientId})).catch(()=>null);
   const url='/api/tracker-client/'+encodeURIComponent(req.params.token)+'/growth/markets?page_id='+encodeURIComponent(v.id);
   const regionLabel=c=>c.toLowerCase()+' — '+countryName(c);
   const day=d=>{try{return new Date(d).toISOString().slice(0,10)}catch{return ''}};
   const opts=(id,list)=>'<datalist id="'+id+'">'+list.map(x=>'<option value="'+sHtml(x)+'">').join('')+'</datalist>';
   const briefRef=prewrite?'Pre-Write brief #'+prewrite.brief_id+' (“'+sHtml(prewrite.keyword)+'”, '+day(prewrite.created_at)+')':'';
   const fieldSource=(own,fromBrief,label)=>own?'set in Growth':fromBrief?'from '+briefRef:label;
   const siteC=siteDefault?.countries?.length?siteDefault.countries:null,siteL=siteDefault?.language||null;
   const marketLine='Market: '+(current?.countries?.length?sHtml(current.countries.map(regionLabel).join(', ')):prewrite?sHtml(prewrite.countries.map(regionLabel).join(', ')):siteC?sHtml(siteC.map(regionLabel).join(', ')):'derived from the page')+
    ' — '+fieldSource(current?.countries?.length,prewrite&&!current?.countries?.length,siteC?'site default (set in the Growth Cockpit)':'not confirmed');
   const languageLine='Language: '+(current?.language?sHtml(languageName(current.language)):prewrite?.language?sHtml(languageName(prewrite.language)):siteL?sHtml(languageName(siteL)):'from the page (html lang)')+
    ' — '+fieldSource(current?.language,prewrite?.language&&!current?.language,siteL?'site default (set in the Growth Cockpit)':'not set');
   const alternatives=(prewrite?.alternatives||[]).length?'<p class="error">There are other Pre-Write briefs for this keyword with another market or language: '+
    prewrite.alternatives.map(a=>'#'+a.brief_id+' '+sHtml(regionLabel(a.country))+(a.language?' · '+sHtml(languageName(a.language)):'')+' ('+day(a.created_at)+')').join('; ')+'. The newest is used; set the market here to choose.</p>':'';
   marketBox='<section id="marketSetting" data-url="'+sHtml(url)+'"><h2>Target market and language</h2>'+
    '<p class="info">As in the Pre-Write brief. Main market first; add more markets separated by commas (for example <strong>nl — Netherlands, gb — United Kingdom</strong>). Growth searches the main market and the next one; the others are reported as not researched. Each field is separate: leave one empty and it comes from the Pre-Write brief of this keyword, then from the site default (Growth Cockpit), then from the page.</p>'+
    '<p><label for="marketInput">Target market(s): </label><input id="marketInput" type="text" list="marketRegions" value="'+sHtml(current?.countries?.length?current.countries.map(regionLabel).join(', '):'')+'" placeholder="'+sHtml(prewrite?prewrite.countries.map(regionLabel).join(', '):siteC?siteC.map(regionLabel).join(', '):'nl — Netherlands')+'"> '+
    '<label for="marketLanguage">Language: </label><input id="marketLanguage" type="text" list="marketLanguages" value="'+sHtml(current?.language?languageName(current.language):'')+'" placeholder="'+sHtml(prewrite?.language?languageName(prewrite.language):siteL?languageName(siteL):'English')+'"> '+
    '<button id="marketSave" type="button">Save and run the research again</button></p>'+opts('marketRegions',PREWRITE_REGIONS)+opts('marketLanguages',PREWRITE_LANGUAGES)+
    '<small id="marketSaid">'+marketLine+'<br>'+languageLine+'</small>'+alternatives+'</section>';
  }
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
   '#researchStatus.working{position:relative;padding-left:30px}#researchStatus.working::before{content:"";position:absolute;left:4px;top:50%;width:14px;height:14px;margin-top:-9px;border:2px solid #c7d2fe;border-top-color:#1d4ed8;border-radius:50%;animation:growthSpin .8s linear infinite}@media(prefers-reduced-motion:reduce){#researchStatus.working::before{animation:none;border-color:#1d4ed8}}#marketSave[data-state=working],#marketSave[data-state=saved]{background:#1d4ed8;position:relative;padding-right:42px}#marketSave[data-state=working]::after{content:\"\";position:absolute;right:15px;top:50%;width:13px;height:13px;margin-top:-8px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:growthSpin .7s linear infinite}#marketSave[data-state=saved]{background:#15803d}#marketSaid[data-state=saved]{color:#166534}#marketSaid[data-state=error]{color:#b42318}@keyframes growthSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#marketSave[data-state=working]::after{animation:none}}',
   '#marketSetting input{font:inherit;padding:6px 8px;border:1px solid #c8d2e0;border-radius:6px;margin:4px 0;box-sizing:border-box}#marketInput{width:min(100%,560px)}#marketLanguage{width:min(100%,200px)}',
   '</style><script defer src="/tracker-growth-ui.js?v='+assetVersion()+'"></script><script defer src="/growth-competitor-overview.js?v='+assetVersion()+'"></script><script defer src="/growth-gap-checklist.js?v='+assetVersion()+'"></script><script defer src="/growth-market-controls.js?v='+assetVersion()+'"></script><script defer src="/growth-edit-copy.js?v='+assetVersion()+'"></script><script defer src="/growth-automatic-report-ui.js?v='+assetVersion()+'"></script></head>',
   '<body><main data-page-id="'+v.id+'" data-owner-draft="'+(req.growth?.can_edit===true?'true':'false')+'"><p><a href="'+back+'">← Growth</a></p>',
   '<h1>Automatic Growth research</h1><p><strong>'+sHtml(v.page.url)+'</strong></p>',
   '<p class="info">Automatic public-page and existing Search/AI intelligence research. GSC, a new scanner, paid API and WordPress are not required. This is a reviewable report, not an automatic publication.</p>',
   marketBox,
   '<section><div role="status" id="researchStatus">Loading saved research…</div>',
   '<button id="retryResearch" type="button" hidden>Run research again</button> ',
   '<button id="downloadResearch" type="button" hidden>'+(req.growth?.can_edit===true?
    'Download complete Growth report (JSON)':'Download research-only data (JSON)')+'</button></section>',
   '<div id="growthAiEarly"></div><div id="growthAutomaticReport"></div>',
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
