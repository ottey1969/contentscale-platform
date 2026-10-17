'use strict';
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
const {snapshotCompetitorLeads}=require('./growth-snapshot-competitors.cjs');
const {analyzeGrowthEvidence,sHtml}=require('./growth-automatic-analysis.cjs');
const {proposeHandoffFromResearch}=require('./growth-research-handoff-suggestions.cjs');
const {discoverGrowthCompetitors}=require('./growth-public-search-discovery.cjs');
const {queryFit}=require('./growth-one-action-decision.cjs');
function registerGrowthAutomaticResearch(app,pool,data,{fetchLive=fetchPublicGrowthHtml,searchLive=discoverGrowthCompetitors}={}){
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
  const fresh=(Array.isArray(discovery.leads)?discovery.leads:[]).slice(0,3);
  const candidates=[...fresh.map(x=>({...x,search_source:'BING_PUBLIC_RSS'})),
   ...historical.filter(x=>!fresh.some(y=>y.url===x.url)&&queryFit(x.serp_title||'',{title:targetQuery,h1:[],h2:[]}).fit)
    .map(x=>({...x,search_source:'HISTORICAL_SERP_TOPIC_MATCH'}))].slice(0,3);
  const comparisons=await Promise.all(candidates.map(async lead=>{
   try{const live=await fetchLive(lead.url);return {url:lead.url,live,search_source:lead.search_source,search_query:targetQuery}}
   catch(e){return {url:lead.url,status:'LIVE_COMPARISON_UNAVAILABLE',reason:String(e?.code||'FETCH_FAILED').slice(0,70),search_source:lead.search_source}}
  }));
  const report=analyzeGrowthEvidence({page,savedHtml:page.saved_html,live:own.live,
   snapshot,aiRows:rows(1),gscRows:rows(2),competitorPages:comparisons,sitePages:rows(3),previousBrief:page.brief_content});
  report.search_discovery={...discovery,leads:(discovery.leads||[]).slice(0,7),target_query:targetQuery,
   fetched_competitor_urls:comparisons.filter(x=>x.live).map(x=>x.url)};
  report.evidence_warnings=[
   ...unavailable.map(x=>'OPTIONAL_'+x.toUpperCase()+'_UNAVAILABLE'),
   ...(own.code?['TARGET_LIVE_'+own.code]:[]),
   ...comparisons.filter(x=>!x.live).map(x=>'COMPETITOR_LIVE_'+(x.reason||'UNAVAILABLE')),
   ...(['PUBLIC_SEARCH_UNAVAILABLE','NO_RELEVANT_PUBLIC_SEARCH_LEADS','QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH'].includes(discovery.status)?['LIVE_SEARCH_'+discovery.status]:[])
  ];
  report.summary.live_checked=!!own.live;
  report.summary.competitor_fetch_attempts=comparisons.length;
  report.summary.optional_evidence_complete=unavailable.length===0;
  report.handoff_suggestions=proposeHandoffFromResearch(report,page.url);
  report.access={can_edit:false,read_only_analysis:true};
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
   '<body><main data-page-id="'+v.id+'"><p><a href="'+back+'">← Growth</a></p>',
   '<h1>Automatic Growth research</h1><p><strong>'+sHtml(v.page.url)+'</strong></p>',
   '<p class="info">Automatic public-page and existing Search/AI intelligence research. GSC, a new scanner, paid API and WordPress are not required. This is a reviewable report, not an automatic publication.</p>',
   '<section><div role="status" id="researchStatus">Analyzing the URL and observed competitor evidence…</div>',
   '<button id="retryResearch" type="button" hidden>Open cached analysis</button> ',
   '<button id="downloadResearch" type="button" hidden>Download research report (JSON)</button></section>',
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
