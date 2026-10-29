'use strict';
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
const {decideOwnerGrowthEdit}=require('./growth-owner-edit-decision.cjs');
const {resolveGrowthPageIntent}=require('./growth-page-intent-resolver.cjs');
const {renderPublicGrowthPage,needsGrowthRender}=require('./growth-safe-browser-renderer.cjs');
const {analyzeReaderTaskCoverage,inferSerpIntent,classifyDestinationIntent}=require('./growth-reader-task-coverage.cjs');
const {buildOwnerHandoffPackage,planInternalLinks}=require('./growth-owner-handoff-package.cjs');
const {produceVerifiedEditorialOpportunity}=require('./growth-verified-opportunity.cjs');
const {deriveMarket}=require('./growth-serp-quality.cjs');
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
function registerGrowthAutomaticResearch(app,pool,data,{fetchLive=fetchPublicGrowthHtml,searchLive=discoverGrowthCompetitorsWithFallback,completeOwnerDraft=null,renderOwn=renderPublicGrowthPage,retryDelayMs=1500}={}){
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
  return {id:Number(raw),page,clientId:req.growthTrackerClientId,lockedPages};
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
  const rawFocus=seed.growth_decision?.primary_next_action?.query||String(page.keyword||'').trim()||seed.search?.focus_query||'';
  const intentResolution=resolveGrowthPageIntent({keyword:rawFocus,
   title:seed.page_content?.headings?.title||'',
   h1:seed.page_content?.headings?.h1||[],
   description:seed.page_content?.headings?.description||''});
  // The resolver only sees the keyword string; record where the working query actually came from (GSC row or tracker keyword).
  const selectionSource=seed.growth_decision?.selection?.source;
  if(intentResolution.source==='TRACKER_KEYWORD'&&selectionSource&&selectionSource!=='TRACKER_KEYWORD')intentResolution.source=selectionSource;
  const targetQuery=intentResolution.query||'';
  // Market = the place the SOURCE page serves (its tracked keyword and URL), so a shorter GSC query keeps its locality.
  const market=targetQuery?deriveMarket({query:targetQuery,keyword:page.keyword,url:page.url}):null;
  const discovery=!targetQuery?{
   status:'AMBIGUOUS_SITE_NAVIGATION_INTENT',source:'NONE',query:rawFocus,leads:[],
   reason:intentResolution.warning||'No search phrase is justified by observed page content.'
  }:await Promise.resolve().then(()=>searchLive({query:targetQuery,ownUrl:page.url,market}))
   .catch(e=>({source:'BING_PUBLIC_RSS',query:targetQuery,leads:[],status:'PUBLIC_SEARCH_UNAVAILABLE',
    reason:String(e?.code||'SEARCH_FAILED').slice(0,60)}));
  // Discussion listings remain in SERP evidence but should not displace readable
  // long-form articles in the limited content-comparison budget.
  const editorialHost=url=>{try{const host=new URL(url).hostname.toLowerCase();
   return !/(^|\.)(?:reddit\.com|quora\.com)$/.test(host)}
   catch{return false}};
  // Same-market pages are read first; general sources that name no place follow (stable within each group).
  const marketRank=x=>x.market_relevance==='SAME_MARKET'?0:1;
  const fresh=(Array.isArray(discovery.leads)?discovery.leads:[])
   .filter(x=>x.url&&editorialHost(x.url)).map((x,i)=>({x,i})).sort((a,b)=>marketRank(a.x)-marketRank(b.x)||a.i-b.i).map(o=>o.x).slice(0,10);
  const candidates=[...fresh.map(x=>({...x,search_source:x.source==='SERPAPI_GOOGLE_ORGANIC'?'SERPAPI_GOOGLE_ORGANIC':x.source==='SERPER_GOOGLE_ORGANIC'?'SERPER_GOOGLE_ORGANIC':'BING_PUBLIC_RSS'})),
   ...historical.filter(x=>editorialHost(x.url)&&!fresh.some(y=>y.url===x.url)&&queryFit(x.serp_title||'',{title:targetQuery,h1:[],h2:[]}).fit)
    .map(x=>({...x,search_source:'HISTORICAL_SERP_TOPIC_MATCH'}))].slice(0,10);
  const fetchCompetitorOnce=async lead=>{
   try{const live=await fetchLive(lead.url,RESEARCH_FETCH);
    return {url:lead.url,live,quality:assessGrowthCompetitorContent({html:live.html,query:targetQuery,truncated:live.truncated}),
     search_source:lead.search_source,search_query:targetQuery}}
   catch(e){return {url:lead.url,status:'LIVE_COMPARISON_UNAVAILABLE',reason:String(e?.code||'FETCH_FAILED').slice(0,70),search_source:lead.search_source}}
  };
  // HTTP 202 means 'accepted, not ready yet' (seen on a real competitor). Retry exactly once, then report it as unavailable.
  const fetchCompetitor=async lead=>{
   const first=await fetchCompetitorOnce(lead);
   if(first.reason!=='HTTP_202')return first;
   await new Promise(done=>setTimeout(done,Math.max(0,retryDelayMs)));
   const second=await fetchCompetitorOnce(lead);
   return {...second,retried_after_http_202:true};
  };
  // A site that refuses automated access (401/403/406/429) is respected, not bypassed: the next candidate is tried.
  const explain=code=>/^HTTP_(401|403|406|429)$/.test(code)?'BLOCKED_BY_SITE_RESPECTED':/^HTTP_(404|410)$/.test(code)?'PAGE_NOT_FOUND':/^HTTP_5/.test(code)?'SITE_ERROR':
   /TIMEOUT/.test(code)?'TIMEOUT':/^HTTP_202$/.test(code)?'NOT_READY_AFTER_ONE_RETRY':'FETCH_FAILED';
  const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
  // Candidates are tried in batches of three, one page per site first, until three readable articles exist or the list is exhausted.
  const candidatePool=[];const seenHosts=new Set();
  for(const c of candidates){const h=hostOf(c.url);if(seenHosts.has(h))continue;seenHosts.add(h);candidatePool.push(c)}
  for(const c of candidates)if(!candidatePool.includes(c))candidatePool.push(c);
  let attempted=[];const fetchLog=[];
  // A page that answered (HTTP 200) but holds no static text is rendered in the restricted browser, at most three per run and
  // only while fewer than three readable articles exist. A page that REFUSED access (403 etc.) is never rendered: that would bypass the block.
  let renderBudget=3;const renderNotes={};
  const canRender=fetchLive===fetchPublicGrowthHtml||renderOwn!==renderPublicGrowthPage;
  const eligible=items=>items.filter(x=>x.live&&x.quality?.eligible).slice(0,3);
  let comparisons=[];let cursor=0;
  while(cursor<candidatePool.length&&comparisons.length<3){
   const batch=candidatePool.slice(cursor,cursor+3);cursor+=3;
   const results=await Promise.all(batch.map(fetchCompetitor));
   for(let i=0;i<results.length;i++){const x=results[i];
    const have=comparisons.length+results.filter(y=>y.live&&y.quality?.eligible).length;
    if(canRender&&renderBudget>0&&have<3&&x.live&&!x.quality?.eligible&&['JS_RENDERED_PAGE_NO_STATIC_TEXT','NO_PARAGRAPH_TEXT'].includes(x.quality?.reason_code)){
     renderBudget--;const rendered=await Promise.resolve().then(()=>renderOwn(x.url)).catch(()=>({status:'RENDER_UNAVAILABLE'}));
     renderNotes[x.url]=rendered?.status||'RENDER_UNAVAILABLE';
     if(rendered?.live?.html){const q=assessGrowthCompetitorContent({html:rendered.live.html,query:targetQuery,truncated:rendered.live.truncated});
      if(q.eligible)results[i]={...x,live:rendered.live,quality:q,rendered_fallback:true}}
    }
   }
   results.forEach((x,i)=>{
    const lead=batch[i];
    fetchLog.push({url:x.url,host:hostOf(x.url),serp_position:lead.serp_position??null,source:lead.search_source,
     outcome:x.live?(x.quality?.eligible?'READABLE':'NOT_READABLE'):'FETCH_FAILED',
     code:x.live?(x.quality?.reason_code||null):(x.reason||'FETCH_FAILED'),
     explanation:x.live?(x.quality?.eligible?null:x.quality?.reason_code):explain(x.reason||''),
     partial_capture:x.live?.truncated===true,retried_after_http_202:x.retried_after_http_202===true,
     rendered_fallback:x.rendered_fallback===true,render_status:renderNotes[x.url]||null,
     readable_words:x.quality?.readable_words??null});
   });
   attempted=attempted.concat(results);comparisons=eligible(attempted);
  }
  const fetchSummary=(()=>{const c=k=>fetchLog.filter(x=>x.outcome===k).length;
   const blocked=fetchLog.filter(x=>x.explanation==='BLOCKED_BY_SITE_RESPECTED').length,timeouts=fetchLog.filter(x=>x.explanation==='TIMEOUT').length;
   return fetchLog.length+' tried: '+c('READABLE')+' readable, '+blocked+' blocked by the site (respected), '+timeouts+' timed out, '+c('NOT_READABLE')+' fetched but not readable'+
    (fetchLog.filter(x=>x.outcome==='NOT_READABLE').length?' ('+[...new Set(fetchLog.filter(x=>x.outcome==='NOT_READABLE').map(x=>x.code))].join(', ')+')':'')+
    (fetchLog.some(x=>x.rendered_fallback)?'; '+fetchLog.filter(x=>x.rendered_fallback).length+' read after rendering in the restricted browser':'')+
    '; '+Math.max(0,candidatePool.length-cursor)+' further candidate(s) untried'})();
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
  let selectedSource=proposed===page.url?own.live:(proposed?destinationSources.get(proposed):null);
  // Intent comes from live organic results and the page's own title/H1, never from word overlap alone.
  const serpIntent=inferSerpIntent({query:targetQuery,leads:discovery.leads,pages:comparisons.filter(x=>x.live?.html).map(x=>({url:x.url,html:x.live.html}))});
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
  const destinationLocked=!!proposed&&normUrl(proposed)!==normUrl(page.url)&&isLocked(proposed);
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
  const coverage=selectedSource?analyzeReaderTaskCoverage({query:targetQuery,
   serpIntent:serpIntent.intent==='MIXED_OR_INSUFFICIENT'?'INFORMATIONAL_GUIDE':serpIntent.intent,
   destination:{url:proposed,html:selectedSource.html,truncated:selectedSource.truncated===true,capture:selectedSource.capture||null},
   competitors:competitorPages,sitePages:siblingPages}):
   {status:'NO_DESTINATION_SOURCE',tasks:[],competitors_considered:[],destination_truncated:false};
  report.reader_task_coverage=coverage;
  const attempts=[
   {source:'TARGET_STATIC_HTML',status:renderStatus,detail:own.code||null},
   {source:'SEARCH_PROVIDERS',status:discovery.status||'UNKNOWN',detail:((discovery.provider_attempts||[]).map(a=>typeof a==='string'?a:(a.provider||a.source||'')).join(', ')||discovery.source||'')+
    (discovery.market_query_retry?'; market query "'+discovery.market_query_retry.query+'" added '+discovery.market_query_retry.added_leads+' lead(s)':'')+
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
  const gateDecision=report.editorial_decision_gate?.decision;
  const gate=report.editorial_decision_gate||{};
  if(['NO_CHANGE','DATA_BLOCKED'].includes(gateDecision)){
   // Final outcomes: no provider call and no forced copy.
   completion={...base,status:'NOT_REQUIRED_FOR_DECISION',decision:gateDecision,draft:null,error_code:null};
  }else if(!Number.isSafeInteger(targetId)||targetId<1){
   completion={...base,status:'DESTINATION_TRACKER_PAGE_REQUIRED',draft:null};
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
     tasks:gate.improvement_plan.tasks.map(t=>({code:t.code,label:t.label,placement_mode:t.placement?.mode,
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
  return res.set('Cache-Control','private, no-store').json({...report,
   editorial_decision_gate:completeDecision,
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
