'use strict';
const {URL}=require('node:url');
const {inspectSavedGrowthHtml}=require('./tracker-growth-snapshot-signals.cjs');
const {registerTrackerGrowthCmsExport}=require('./tracker-growth-cms-export.cjs');
const {registerGrowthAutomaticResearch}=require('./tracker-growth-automatic-routes.cjs');
const {registerGrowthNewPage}=require('./tracker-growth-new-page-routes.cjs');
const {assessGrowthCandidates}=require('./tracker-growth-best-candidate.cjs');
const {loadMemory,recordAction,recordResearchOutcome}=require('./tracker-growth-recommendation-memory.cjs');
const {saveProposal,saveSelectionProposal}=require('./growth-proposal-store.cjs');
const {saveGapList,getGapList,saveSelection,addToSelection,saveWritten,getOpenSelection}=require('./growth-selection-store.cjs');
const writingRuns=require('./growth-writing-runs.cjs');
const {getPageMarkets,setPageMarkets,getPrewriteMarket}=require('./growth-market-store.cjs');
const escapeHtml=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function bucket(q,brand){
 const k=norm(q);
 if(!k)return 'unknown';
 const stem=norm(brand||'').replace(/ /g,'');
 const n=k.replace(/ /g,'');
 if(n.includes('contentscale')||n.includes('contentatscale')||k.includes('content scale')||k.includes('content at scale')||k==='content scaling'||k==='scale content'||k==='sites at scale')
  return 'brand_or_ambiguous';
 if(stem.length>=6&&n.includes(stem))return 'brand_or_ambiguous';
 return 'non_brand';
}
function host(url){try{return new URL(url).hostname.toLowerCase()}catch{return ''}}
function computeGrowth(rows,queries,domain,now=new Date()){
 const expected=host('https://'+String(domain||'').replace(/^https?:\/\//,'').split('/')[0]);
 const pages=rows.filter(p=>host(p.url)===expected).map(p=>{
  const impressions=Number(p.gsc_impressions)||0,clicks=Number(p.gsc_clicks)||0,position=Number(p.gsc_position)||0;
  const ctr=impressions?100*clicks/impressions:0;
  const completed=p.brief_content&&typeof p.brief_content==='object'&&Number(p.brief_content.outstanding_actions)===0;
  const gscPresent=[p.gsc_clicks,p.gsc_impressions,p.gsc_position].some(v=>v!==null&&v!==undefined&&v!=='');
  const opportunity=!gscPresent?'CONTENT_RESEARCH':(impressions>=300&&position>20&&clicks<=Math.max(2,impressions*0.002))?'RANKING_GAP':
    (impressions>=200&&position>0&&position<=20&&ctr<0.5)?'CTR_REVIEW':'MEASURE';
  const priority=opportunity==='RANKING_GAP'?Math.round(impressions*Math.min(2,position/20)):
    opportunity==='CTR_REVIEW'?impressions:0;
  return {id:p.id,url:p.url,keyword:p.keyword||'',impressions,clicks,position,ctr:Number(ctr.toFixed(3)),
   opportunity,priority,gsc_present:gscPresent,case_study_active:!!p.case_study_active,brief_complete:completed,
   next_action:opportunity==='CONTENT_RESEARCH'?'Research page intent, factual quality, content coverage and internal links; GSC is optional for starting this review':
    opportunity==='RANKING_GAP'?'Inspect page-query intent, relevant ranking competitors, content distinction and internal linking':
    opportunity==='CTR_REVIEW'?'Inspect non-brand exact-page queries, SERP layout and snippet suitability':'Collect comparable fresh GSC evidence'};
 }).sort((a,b)=>b.priority-a.priority);
 const ids=new Set(pages.map(p=>String(p.id)));
 const latest=new Map();
 for(const q of queries.filter(x=>ids.has(String(x.page_id))&&x.evidence_scope==='page_verified')){
  const key=String(q.page_id)+'|'+norm(q.query);
  const at=Date.parse(q.imported_at)||0;
  if(!latest.has(key)||at>latest.get(key).at)latest.set(key,{...q,at});
 }
 const classified=[...latest.values()].filter(q=>q.at&&q.at<=now.getTime()&&now.getTime()-q.at<=75*86400000)
  .map(q=>({...q,classification:bucket(q.query,domain)}));
 const nonBrand=classified.filter(q=>q.classification==='non_brand');
 const brand=classified.filter(q=>q.classification==='brand_or_ambiguous');
 // Prioritize click opportunities from verified non-branded PAGE queries, not
 // property-wide figures or guessed CTR increases. One row per page/query.
 const queryOpportunities=nonBrand.filter(q=>Number(q.impressions)>=80&&Number(q.position)>0)
  .map(q=>{
   const page=pages.find(p=>String(p.id)===String(q.page_id));
   const pos=Number(q.position),impressions=Number(q.impressions),clicks=Number(q.clicks)||0;
   const ctr=impressions?clicks/impressions:0;
   const type=pos<=10&&ctr<0.01?'SNIPPET_AND_INTENT_REVIEW':
    pos>10&&pos<=20?'STRIKING_DISTANCE':
    pos>20&&pos<=50?'RANKING_AND_CONTENT':'LONG_TERM_VISIBILITY';
   const score=impressions*(pos<=20?1.5:pos<=50?1:0.35)*(clicks<=2?1.15:1);
   const checklist=type==='SNIPPET_AND_INTENT_REVIEW'
    ? ['Open Google results for this exact query and confirm whether the user intent matches the page','Check the real title/snippet shown and compare the three leading results','Improve the page title and introductory answer only if evidence shows a mismatch','Record publish date and compare equivalent page-query GSC periods']
    : type==='STRIKING_DISTANCE'
    ? ['Compare the top-ranking results and their search intent against this exact page','Identify factual information, first-hand examples or helpful sections genuinely missing','Add relevant contextual internal links from existing related pages','Publish only verified improvements and measure page-query clicks after indexing']
    : ['Verify the exact query intent against the current page and live search results','Compare competitor coverage and identify real, non-duplicative gaps','Improve the existing page and connect relevant hub/spoke internal links','Capture a comparable 28-day GSC baseline before publication and review again after'];
   return {page_id:q.page_id,url:page?.url||'',query:String(q.query),impressions,clicks,
    position:Number(pos.toFixed(1)),ctr:Number((ctr*100).toFixed(2)),type,priority_score:Math.round(score),
    case_study_locked:!!page?.case_study_active,checklist,
    action:type==='SNIPPET_AND_INTENT_REVIEW'?'Review the actual SERP appearance, search intent, title and description; do not promise snippet CTR gains':
      type==='STRIKING_DISTANCE'?'Compare top-10 competitor evidence, page content and contextual internal links':
      type==='RANKING_AND_CONTENT'?'Verify intent match, competitive content gaps and internal-link support before changing this page':
      'Research whether this query fits the page before investing in new content'};
  }).filter(x=>x.url).sort((a,b)=>b.priority_score-a.priority_score).slice(0,30);
 const sum=arr=>arr.reduce((acc,x)=>({impressions:acc.impressions+(Number(x.impressions)||0),clicks:acc.clicks+(Number(x.clicks)||0)}),{impressions:0,clicks:0});
 return {domain:expected,mode:'GROWTH_READ_ONLY',generated_at:now.toISOString(),
  scope:'Latest verified exact-page GSC query rows (up to 75 days old), not a fixed 28-day trend',
  non_brand:sum(nonBrand),brand_or_ambiguous:sum(brand),
  evidence_queries:classified.length,query_opportunities:queryOpportunities,pages,case_study_policy:'READ_ONLY_NO_SCAN_NO_BASELINE_MUTATION'};
}
// deps: optional injection of the network/AI boundaries (tests run the real chain without the internet).
function registerGrowthCockpit(app,pool,deps={}){
 const ownerDraftService=typeof app.post==='function'?registerTrackerGrowthCmsExport(app,pool,deps.cms||{}):null;
 async function data(req,res,next){
  try{
   const cr=await pool.query("SELECT id,name,domain,token,status FROM tracker_clients WHERE (token=$1 OR readonly_token=$1) AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token]);
   if(!cr.rows.length)return res.status(404).json({success:false,error:'Tracker not found'});
   const client=cr.rows[0];
   if(client.status==='paused'||client.status==='disabled')return res.status(403).json({success:false,error:'Tracker unavailable'});
   // Page access is independent of optional exact-page Search Console evidence.
   // Keep page-query claims unknown if GSC is absent or temporarily unavailable.
   const p=await pool.query(`SELECT p.id,p.url,p.keyword,p.redirects_to,p.gsc_impressions,p.gsc_clicks,p.gsc_position,p.brief_content,
      EXISTS(SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=p.id AND cs.tracker_client_id=$1 AND cs.status='active') AS case_study_active
      FROM tracker_pages p WHERE p.tracker_client_id=$1 ORDER BY p.gsc_impressions DESC NULLS LAST LIMIT 1000`,[client.id]);
   let evidenceRows=[],gscAvailable=true;
   try {
    const q=await pool.query(`SELECT q.page_id,q.query,q.clicks,q.impressions,q.position,q.imported_at,q.evidence_scope
      FROM tracker_gsc_queries q WHERE q.tracker_client_id=$1 AND q.evidence_scope='page_verified'
      ORDER BY q.imported_at DESC LIMIT 5000`,[client.id]);
    evidenceRows=q.rows||[];
   } catch(error) {
    gscAvailable=false;
    console.warn('[tracker-growth] optional GSC evidence unavailable',String(error.code||'unknown'));
   }
   req.growth=computeGrowth(p.rows,evidenceRows,client.domain);
   // Optional, read-only: recorded publications let the Cockpit skip pages that
   // were just changed and show what was measured afterwards.
   let publications=[],windows=[];
   try{
    publications=(await pool.query(`SELECT g.id,g.tracker_page_id,g.query,g.notes,g.published_at
      FROM tracker_growth_publications g WHERE g.tracker_client_id=$1 ORDER BY g.published_at DESC,g.id DESC LIMIT 200`,[client.id])).rows||[];
    if(publications.length)windows=(await pool.query(`SELECT publication_id,period,start_date::text,end_date::text,clicks,impressions
      FROM tracker_growth_gsc_windows WHERE tracker_client_id=$1 ORDER BY recorded_at DESC LIMIT 500`,[client.id])).rows||[];
   }catch(error){if(error.code!=='42P01')console.warn('[tracker-growth] optional publication evidence unavailable',String(error.code||'unknown'))}
   const memory=await loadMemory(pool,client.id);
   Object.assign(req.growth,assessGrowthCandidates(req.growth,{publications,windows,pageRows:p.rows,memory}));
   req.growth.gsc_evidence_status=gscAvailable?(evidenceRows.length?'AVAILABLE':'NEEDS_ACCESS'):'UNAVAILABLE';
   req.growth.gsc_connected_required_for_access=false;
   req.growth.can_edit=client.token===req.params.token;
   req.growthTrackerClientId=client.id;
   next();
  }catch(e){res.status(503).json({success:false,error:'Verified growth evidence temporarily unavailable'})}
 }
 registerGrowthAutomaticResearch(app,pool,data,{completeOwnerDraft:ownerDraftService?.completeOwnerDraft,
  recordResearchOutcome:args=>recordResearchOutcome(pool,args),
  recordProposal:args=>saveProposal(pool,args),
  recordGapList:args=>saveGapList(pool,args),loadGapList:args=>getGapList(pool,args),
  recordSelection:args=>saveSelection(pool,args),recordSelectionProposal:args=>saveSelectionProposal(pool,args),
  recordWritten:args=>saveWritten(pool,args),loadOpenSelection:args=>getOpenSelection(pool,args),addToSelection:args=>addToSelection(pool,args),
  claimWritingRun:args=>writingRuns.claimRun(pool,args),storeWritingRun:args=>writingRuns.storeRun(pool,args),
  failWritingRun:args=>writingRuns.failRun(pool,args),lastStoredRun:args=>writingRuns.lastStoredRun(pool,args),
  loadPageMarkets:args=>getPageMarkets(pool,args),savePageMarkets:args=>setPageMarkets(pool,args),loadPrewriteMarket:args=>getPrewriteMarket(pool,args),...(deps.research||{})});
 // New pages from a Pre-Write brief: the same research, selection, writing and storage, without a tracked URL.
 const r=deps.research||{};
 registerGrowthNewPage(app,pool,data,{fetchLive:r.fetchLive,searchLive:r.searchLive,renderOwn:r.renderOwn,retryDelayMs:r.retryDelayMs,buildOverview:r.buildOverview,
  generateDraft:deps.cms?.generateDraft,
  recordGapList:args=>saveGapList(pool,args),loadGapList:args=>getGapList(pool,args),recordSelection:args=>saveSelection(pool,args),
  addToSelection:args=>addToSelection(pool,args),loadOpenSelection:args=>getOpenSelection(pool,args),
  claimWritingRun:args=>writingRuns.claimRun(pool,args),storeWritingRun:args=>writingRuns.storeRun(pool,args),failWritingRun:args=>writingRuns.failRun(pool,args),
  loadConcepts:args=>writingRuns.getNewPageConcepts(pool,args),loadPageMarkets:args=>getPageMarkets(pool,args),savePageMarkets:args=>setPageMarkets(pool,args),...(deps.newPage||{})});
 // Owner-only memory of the Cockpit's advice: started, skipped or restored.
 // The snapshot is taken from server-side evidence, never from the browser.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/recommendation',data,async(req,res)=>{
  try{
   if(req.growth.can_edit!==true)return res.status(403).json({success:false,error:'Only the Tracker owner link can change Growth advice'});
   const body=req.body||{},action=String(body.action||''),pageId=String(body.page_id||''),query=String(body.query||'').slice(0,300);
   if(!['start','skip','restore'].includes(action))return res.status(400).json({success:false,error:'Unknown action'});
   if(!/^[1-9][0-9]{0,12}$/.test(pageId))return res.status(400).json({success:false,error:'Select an existing tracked page'});
   const page=req.growth.pages.find(p=>String(p.id)===pageId);
   if(!page)return res.status(404).json({success:false,error:'Tracked page not found for this website'});
   const row=query?req.growth.query_opportunities.find(q=>String(q.page_id)===pageId&&norm(q.query)===norm(query)):null;
   if(query&&!row)return res.status(404).json({success:false,error:'Verified opportunity not found'});
   const best=req.growth.best_candidate;
   const systemChoice=!!best&&String(best.page_id)===pageId&&norm(best.query||'')===norm(query);
   const src=row||page;
   const snapshot={impressions:src.impressions,clicks:src.clicks,position:src.position,
    priority_score:row?row.priority_score:page.priority,status:src.eligibility?.status||null,
    basis:systemChoice?best.basis:null,reasons:systemChoice?best.reasons:[],recorded_from:'GROWTH_COCKPIT'};
   const saved=await recordAction(pool,{clientId:req.growthTrackerClientId,pageId:Number(pageId),query,action,reason:body.reason,snapshot,systemChoice});
   if(!saved)return res.status(404).json({success:false,error:'Nothing to restore'});
   res.set('Cache-Control','no-store').json({success:true,status:saved.status,system_choice:systemChoice,
    research_url:`/track/${encodeURIComponent(req.params.token)}/growth/auto-research?page_id=${pageId}`});
  }catch(e){console.error('[growth-recommendation]',e.message);res.status(503).json({success:false,error:'Growth advice memory temporarily unavailable'})}
 });
 app.get('/api/tracker-client/:token/growth',data,(req,res)=>res.json({success:true,...req.growth}));
 app.get('/api/tracker-client/:token/growth/brief',data,(req,res)=>{
  const id=String(req.query&&req.query.page_id||'');
  const query=norm(req.query&&req.query.query);
  const choice=req.growth.query_opportunities.find(q=>String(q.page_id)===id&&norm(q.query)===query);
  if(!choice)return res.status(404).type('text').send('Verified opportunity not found');
  const lines=[
    'CONTENTSCALE — EVIDENCE-BASED GROWTH EXECUTION BRIEF',
    'Page: '+choice.url,
    'Exact query: '+choice.query,
    'Verified GSC query evidence: '+choice.impressions+' impressions; '+choice.clicks+' clicks; average position '+choice.position,
    'Source: latest saved page-verified GSC rows; not a fixed 28-day period or traffic forecast',
    'Diagnosis: '+choice.type,
    'Research objective: '+choice.action,
    'Case Study restriction: '+(choice.case_study_locked?'RESEARCH ONLY — do not publish or alter a locked baseline':'Publish only after human review'),
    '',
    'CHECKLIST',
    ...choice.checklist.map((step,i)=>(i+1)+'. '+step),
    '',
    'BEFORE PUBLISHING',
    '- Compare the actual page content and competing search results; do not invent findings.',
    '- Do not redirect, canonicalize, shorten or add spokes without evidence of a conflicting search intent.',
    '- Record the actual edit and publication timestamp separately from the Case Study baseline.',
    '- Capture an equal-length GSC comparison window after enough data becomes available.',
    '',
    'STATUS: research proposal; no scan, publication, or customer-site change performed.'
  ];
  res.set('Cache-Control','no-store').type('text/plain; charset=utf-8').send(lines.join('\n'));
 });
 app.get('/api/tracker-client/:token/growth/research-brief',data,async(req,res)=>{
  const id=String(req.query&&req.query.page_id||'');
  if(!/^[1-9][0-9]{0,12}$/.test(id))return res.status(400).type('text').send('Select an existing tracked page');
  const page=req.growth.pages.find(p=>String(p.id)===id);
  if(!page)return res.status(404).type('text').send('Tracked page not found for this website');
  // Optional saved snapshot evidence: no network fetch, scanner or Google account.
  let observations=inspectSavedGrowthHtml(null,page.url);
  try{
   const saved=(await pool.query('SELECT LEFT(html_content,120000) AS saved_html, LENGTH(html_content)>120000 AS excerpt_truncated FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2 LIMIT 1',[req.growthTrackerClientId,Number(id)])).rows[0];
   observations=inspectSavedGrowthHtml(saved?.saved_html||null,page.url);
   if(observations.available)observations.excerpt_truncated=!!saved?.excerpt_truncated;
  }catch(e){console.warn('[growth-research] optional saved snapshot unavailable',String(e.code||'unknown'))}
  const observed=observations.available?[
   'Saved HTML evidence: OBSERVED HISTORICAL EXCERPT, NOT VERIFIED LIVE',
   'HTML excerpt truncated: '+observations.excerpt_truncated,
   'Title observed: '+observations.title_observed+'; meta description observed: '+observations.meta_description_observed,
   'H1 count observed: '+observations.h1_count_observed+'; H2 count observed: '+observations.h2_count_observed,
   'Canonical tag observed: '+observations.canonical_tag_observed+'; noindex directive observed: '+observations.noindex_directive_observed,
   'Links observed: '+observations.internal_links_observed+' internal, '+observations.external_links_observed+' external',
   'Images in excerpt: '+observations.images_observed+'; missing alt in excerpt: '+observations.images_missing_alt_observed,
   'Approximate words in excerpt: '+observations.approx_excerpt_words,
   observations.caution
  ]:[
   'Saved HTML evidence: NOT AVAILABLE — no conclusion about missing headings, metadata or content',
   observations.caution
  ];
  const lines=[
   'CONTENTSCALE — GROWTH RESEARCH BRIEF (NO GSC REQUIRED)',
   'Tracked page: '+page.url,
   'Working keyword (not a verified ranking query): '+(page.keyword||'Not specified'),
   'Evidence status: '+(page.gsc_present?'Some saved page-level GSC fields; fresh exact-page query validation still needed':'GSC not supplied — clicks, impressions and rankings UNKNOWN'),
   'Opportunity: '+page.opportunity,
   ...observed,
   '',
   'Proposal only. No competitor findings, Google positions or click uplift are claimed as verified.',
   'Case Study policy: '+(page.case_study_active?'LOCKED — research only, do not publish or change the existing baseline':'Changes need human review and actual publication evidence'),
   '',
   'RESEARCH STEPS — EVIDENCE TO COLLECT',
   '1. Open the actual live URL and verify HTTP status, intent, title, main heading and usefulness. Do not assume the content is current.',
   '2. Search the working topic in the target market and record real ranking competitors, SERP intent and publication dates before making claims.',
   '3. Compare facts, first-hand proof, helpful sections, internal links and page differentiation against those observed results.',
   '4. Decide KEEP, OPTIMIZE, EXPAND or CREATE SPOKE only after confirming whether a distinct search intent exists; protect active Case Studies.',
   '5. Produce a CMS-neutral edit brief or reviewed HTML for WordPress, Wix, or any other CMS. Do not publish or edit a site automatically.',
   '6. If GSC becomes available later, record real same-page, same-query before/after 28-day windows; missing evidence is never zero clicks.',
   '',
   'STATE: RESEARCH PROPOSAL — NO SCAN, NO PUBLISH, NO BASELINE MUTATION'
  ];
  res.set('Cache-Control','no-store').type('text/plain; charset=utf-8').send(lines.join('\n'));
 });
 app.get('/track/:token/growth',data,(req,res)=>{
  const g=req.growth;
  const measured=x=>g.evidence_queries?Number(x).toLocaleString():'Needs access';
  const tok=encodeURIComponent(req.params.token);
  const research=id=>`/track/${tok}/growth/auto-research?page_id=${encodeURIComponent(id)}`;
  const badge=e=>`<span class="badge ${escapeHtml(String(e.status).toLowerCase())}">${escapeHtml({CANDIDATE:'Can be improved',PROTECTED:'Protected — do not change',OLD_ADDRESS:'Old address (redirect)',PAGE_GONE:'Page not found',JUST_CHANGED:'Just changed — wait',WORKING:'Working — leave it',SKIPPED_BY_OWNER:'Skipped by you',NO_CHANGE_FOUND:'Researched — no change needed',RESEARCH_BLOCKED:'Research blocked — retry later',IMPROVEMENT_FOUND:'Improvement found — not published'}[e.status]||e.status)}</span><small>${escapeHtml(e.label)}</small>${e.status==='OLD_ADDRESS'&&e.final_page_id?`<small><a href="${research(e.final_page_id)}">Research the final page instead</a></small>`:''}`;
  const measureNote=m=>m?`<small class="measure">📏 ${escapeHtml(m.label)}</small>`:'';
  const b=g.best_candidate,ms=g.measurement_summary,tr=g.track_record||{};
  // Owner links record the start server-side first (see script); without JS they still open the research.
  const startLink=(id,query,text,cls)=>`<a class="${cls||''}${g.can_edit?' start-rec':''}" href="${research(id)}" data-page="${escapeHtml(id)}" data-query="${escapeHtml(query||'')}">${text}</a>`;
  const skipForm=(id,query)=>g.can_edit?`<details class="skip"><summary>Not relevant for my business? Skip it</summary><form class="rec-form" data-action="skip" data-page="${escapeHtml(id)}" data-query="${escapeHtml(query||'')}"><label>Why (optional) <input name="reason" maxlength="300" placeholder="e.g. we do not offer this service"></label><button type="submit">Skip — suggest something else</button><small role="status"></small></form></details>`:'';
  const restoreForm=(id,query)=>g.can_edit?`<form class="rec-form" data-action="restore" data-page="${escapeHtml(id)}" data-query="${escapeHtml(query||'')}"><button type="submit">Restore this suggestion</button><small role="status"></small></form>`:'';
  const rowControls=(e,id,query)=>e.status==='SKIPPED_BY_OWNER'?restoreForm(id,query):e.status==='CANDIDATE'?skipForm(id,query):'';
  const start=b?`<section class="start"><p class="kicker">Start here — the system's choice</p><h2>${b.query||b.label?'“'+escapeHtml(b.query||b.label)+'”':'This page'}</h2><p><a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.url)}</a></p><h3>Why this one first</h3><ol>${b.reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ol><p>${startLink(b.page_id,b.query,b.basis==='FINISH_STARTED_WORK'?'Continue: open the research result →':'Start Growth research for this page →','go')}</p>${b.basis==='FINISH_STARTED_WORK'?'':skipForm(b.page_id,b.query)}<h3>What happens next</h3><ol><li>The research compares this page with the pages Google shows for the search. It may conclude that no change is needed — that is a valid outcome.</li><li>If it finds a real gap, review the suggested text, check the facts, and publish it yourself. Nothing is published automatically.</li><li>${g.can_edit?'After publishing, use the publication form in the row below.':'After publishing, the Tracker owner records the publication date.'} After 28 days this Cockpit shows the measured before/after clicks.</li></ol>${measureNote(b.measurement)}<details><summary>How the score works</summary><p>${escapeHtml(b.score_rule)} This is a priority order, not a promise of more clicks.</p></details></section>`:`<section class="start"><p class="kicker">Start here</p><h2>No page needs work first right now</h2><p>${escapeHtml(g.no_candidate_reason)}</p></section>`;
  // One visible next action. This is a navigation guide, not a claim that downstream work was completed.
  // The existing server-side research, selection, writing, evidence and publication gates remain authoritative.
  const guidedSteps=['Choose a page','Confirm market and language','Research competitors','Select improvements','Write selected topics','Review the evidence','Prepare CMS package','Record publication','Measure results'];
  const guidedRows=guidedSteps.map((label,i)=>'<li class="'+(i===0?'guide-done':i===1?'guide-next':'guide-wait')+'"><span aria-hidden="true">'+(i===0?'✓':i===1?'→':'○')+'</span> '+escapeHtml(label)+(i===0?' — page identified':i===1?' — review on the research screen':' — not verified here')+'</li>').join('');
  const guidedNext=b?startLink(b.page_id,b.query,'Continue with this page →','guide-primary'):null;
  const guide='<section class="growth-guide" aria-labelledby="guideTitle"><p class="kicker">Your next action</p>'+
   '<h2 id="guideTitle">'+(b?'Continue Growth for '+escapeHtml(b.query||b.label||b.url):'Choose what to work on')+'</h2>'+
   '<p>Growth takes you through one step at a time. Green means confirmed; blue means the next action. Other steps are not marked complete until the underlying work is saved.</p>'+
   '<ol class="guide-steps">'+guidedRows+'</ol>'+
   (guidedNext?'<p>'+guidedNext+'</p>':'<p>No existing page needs work first right now. Open the page list in Details or start from a Pre-Write brief.</p>')+
   '<details><summary>Start a different project</summary><p><a href="/track/'+tok+'/growth/new-page">New page from Pre-Write →</a></p><p>Or choose a tracked page in Detailed opportunities below.</p></details>'+
   '<p class="info">Research, writing and CMS export never publish to your website. Case Study locks remain in force.</p></section>';
  const memorySection=`<h2>What the system remembers</h2><p>Every suggestion you start or skip, what the research concluded and what was measured afterwards is saved on the server, so the Cockpit does not suggest the same work twice and can show whether its advice paid off.</p><div class="stats"><section>Research started<strong>${tr.started||0}</strong><small>${tr.system_choices_started||0} chosen by the system</small></section><section>Improvement found<strong>${tr.improvement_found||0}</strong><small>${tr.no_change||0} researched with no change needed</small></section><section>Published<strong>${tr.published||0}</strong><small>${tr.skipped||0} skipped by you</small></section><section>System's choices measured<strong>${tr.system_choices_measured||0}</strong><small>${tr.system_choices_measured?(tr.system_choices_click_change>=0?'+':'')+tr.system_choices_click_change+' clicks, 28 days before vs after':'Needs 28 days after publication and before/after numbers'}</small></section></div>${(g.history||[]).length?`<table><thead><tr><th>Page / query</th><th>Chosen by</th><th>Started</th><th>What happened</th></tr></thead><tbody>${g.history.slice(0,25).map(h=>`<tr><td>${h.query?'<strong>'+escapeHtml(h.query)+'</strong>':''}<small><a href="${escapeHtml(h.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.url)}</a></small></td><td>${h.system_choice?'System':'You'}</td><td>${escapeHtml(h.date)}${h.snapshot&&h.snapshot.impressions!=null?`<small>then: ${escapeHtml(h.snapshot.impressions)} impressions, ${escapeHtml(h.snapshot.clicks)} clicks${h.snapshot.position?', position '+escapeHtml(h.snapshot.position):''}</small>`:''}</td><td>${escapeHtml(h.outcome)}</td></tr>`).join('')}</tbody></table>`:'<p class="note">Nothing remembered yet. Start the suggested research above; the outcome is saved automatically.</p>'}`;
  const skippedText=Object.entries(g.skipped||{}).map(([k,n])=>n+' '+({PROTECTED:'protected Case Study',OLD_ADDRESS:'old redirected address',PAGE_GONE:'missing page',JUST_CHANGED:'recently changed',WORKING:'already working',SKIPPED_BY_OWNER:'skipped by you',NO_CHANGE_FOUND:'researched, no change needed',RESEARCH_BLOCKED:'research blocked',IMPROVEMENT_FOUND:'improvement waiting for publication'}[k]||k)+(n===1?' row':' rows')).join(', ');
  const row=x=>`<tr${b&&String(b.page_id)===String(x.id)&&!b.query?' class="best"':''}><td><a href="${escapeHtml(x.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(x.url)}</a><small>${escapeHtml(x.keyword)}</small></td><td>${x.gsc_present?x.impressions.toLocaleString():'Needs access'}</td><td>${x.gsc_present?x.clicks:'—'}</td><td>${x.gsc_present?x.ctr.toFixed(2)+'%':'—'}</td><td>${x.gsc_present?x.position.toFixed(1):'—'}</td><td>${badge(x.eligibility)}${x.eligibility.status==='SKIPPED_BY_OWNER'?restoreForm(x.id,''):''}${measureNote(x.measurement)}<small>${escapeHtml(x.opportunity)}${x.case_study_active?' · Case Study locked':''}</small><small>${escapeHtml(x.next_action)}</small><small><a href="/track/${encodeURIComponent(req.params.token)}/growth/auto-research?page_id=${encodeURIComponent(x.id)}">Run automatic Growth research · Search / AI / Content</a></small><small><a href="/api/tracker-client/${encodeURIComponent(req.params.token)}/growth/research-brief?page_id=${encodeURIComponent(x.id)}" target="_blank" rel="noopener noreferrer">Open research brief · no GSC required</a></small>${g.can_edit?(x.case_study_active?`<small>Case Study protected — research is available; CMS export remains locked during the active baseline.</small>`:`<small><a href="/track/${encodeURIComponent(req.params.token)}/growth/cms-export?page_id=${encodeURIComponent(x.id)}">Prepare reviewed CMS handoff · Wix / WordPress / other</a></small>`):''}</td></tr>`;
  res.set('Cache-Control','no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Growth Cockpit</title><style>body{font:15px/1.5 system-ui;background:#f6f8fc;color:#172337;max-width:1150px;margin:auto;padding:24px}h1{font-size:27px}.stats{display:flex;gap:14px;flex-wrap:wrap}.stats section{background:#fff;border:1px solid #d9e0eb;border-radius:12px;padding:16px;min-width:190px}.stats strong{display:block;font-size:25px}table{background:white;border-collapse:collapse;width:100%;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #e0e5ef;padding:12px}small{display:block;color:#64748b}a{color:#1d4ed8;overflow-wrap:anywhere}.note{background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:10px}th{background:#eaf0fa}label{display:block;margin:8px 0}input,textarea{display:block;width:100%;max-width:550px;padding:9px;margin:4px 0;border:1px solid #cbd5e1;border-radius:7px}button{background:#2563eb;color:white;border:0;border-radius:7px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5}.start{background:#fff;border:2px solid #168347;border-radius:14px;padding:18px 22px;margin:18px 0}.start h2{margin:.2em 0}.kicker{color:#168347;font-weight:700;text-transform:uppercase;font-size:13px;margin:0}.go{display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600}.badge{display:inline-block;border-radius:999px;padding:2px 9px;font-size:13px;font-weight:600;background:#e2e8f0}.badge.candidate{background:#dcfce7;color:#14532d}.badge.protected{background:#fee2e2;color:#7f1d1d}.badge.old_address,.badge.page_gone{background:#fef3c7;color:#78350f}.badge.just_changed{background:#e0e7ff;color:#312e81}.badge.working{background:#e0f2fe;color:#0c4a6e}tr.best{outline:2px solid #168347}.badge.skipped_by_owner,.badge.no_change_found{background:#f1f5f9;color:#334155}.badge.research_blocked{background:#fef3c7;color:#78350f}.badge.improvement_found{background:#fde68a;color:#713f12}.growth-guide{background:#fff;border:1px solid #d9e0eb;border-radius:14px;padding:22px;margin:18px 0}.growth-guide h2{margin:8px 0}.growth-guide .kicker{color:#1d4ed8}.guide-steps{list-style:none;padding:0;margin:18px 0;display:grid;gap:8px}.guide-steps li{padding:10px 12px;border-radius:9px;background:#f1f5f9;color:#475569}.guide-steps li span{display:inline-block;width:25px;font-weight:bold}.guide-steps .guide-done{background:#dcfce7;color:#166534}.guide-steps .guide-next{background:#dbeafe;color:#1d4ed8;font-weight:700}.guide-primary{display:inline-block;background:#2563eb;color:#fff;border-radius:9px;padding:13px 18px;text-decoration:none;font-weight:700}.growth-details{margin:20px 0;padding:16px;background:#fff;border:1px solid #d9e0eb;border-radius:12px}.growth-details>summary{cursor:pointer;font-weight:700}details.skip{margin-top:10px}.rec-form button{background:#475569}.measure{color:#334155}@media(max-width:680px){table{display:block;overflow-x:auto}.start{padding:14px}}</style><script defer src="/tracker-growth-ui.js"></script></head><body><p><a href="/track/${encodeURIComponent(req.params.token)}">← Tracker</a></p><h1>Growth Cockpit</h1><p>${escapeHtml(g.domain)} · ${g.can_edit?'Owner access: full Growth research and review-only draft export':'Shared read-only access: research only; full Growth draft requires the Tracker owner link'} · no automatic scans or publishing</p>${g.can_edit?guide:"<p>This is shared read-only access. Ask the owner to continue Growth.</p>"}<details class="growth-details"><summary>Detailed opportunities, measurements and research history</summary>${start}<div class="stats"><section>Non-brand verified clicks<strong>${measured(g.non_brand.clicks)}</strong></section><section>Non-brand impressions<strong>${measured(g.non_brand.impressions)}</strong></section><section>Brand / ambiguous clicks<strong>${measured(g.brand_or_ambiguous.clicks)}</strong></section><section>Verified query rows<strong>${g.evidence_queries}</strong></section><section>Changes measured<strong>${ms.measured} of ${ms.recorded}</strong><small>${ms.measured?(ms.measured_click_change>=0?'+':'')+ms.measured_click_change+' clicks across measured changes':ms.waiting?ms.waiting+' waiting for 28 days':ms.recorded?'Add before/after numbers':'No published change recorded yet'}</small></section></div><p class="note">${g.evidence_queries?'':'GSC: Needs access. Tracker and Growth remain available without a Search Console connection; absent evidence is not zero clicks. '}These are latest saved query-level records, not a period-over-period growth claim. Brand-ambiguous phrases are excluded from non-brand totals. Case Study baselines remain untouched. Improve existing pages before approving a new spoke.</p><p><a href="/track/${encodeURIComponent(req.params.token)}/growth/measurement" target="_blank" rel="noopener noreferrer">View publication measurement readiness</a> — checks whether published changes can be measured honestly. Missing GSC date ranges are never treated as proof of click growth.</p>${g.evidence_queries?'':'<h2>Research opportunities without GSC</h2><p>Run automatic URL research below to analyze the public page, existing competitor sources, AI evidence and content findings now. These are research proposals, not verified rankings or predictions. No scan, OpenBrief or Google account is required.</p>'}<h2>Top click opportunities — verified non-brand queries</h2><p>Priorities are based on impressions, position and low clicks. Ranking and CTR changes are not predicted results. Select a row, compare real search results, then improve the existing page.${skippedText?' Not chosen first: '+escapeHtml(skippedText)+'.':''}</p><table><thead><tr><th>Query / page</th><th>Impressions</th><th>Clicks</th><th>Position</th><th>Diagnosis and action</th></tr></thead><tbody>${g.query_opportunities.map(q=>`<tr${b&&b.query&&String(b.page_id)===String(q.page_id)&&b.query===q.query?' class="best"':''}><td>${b&&b.query&&String(b.page_id)===String(q.page_id)&&b.query===q.query?'<span class="badge candidate">★ Start here</span>':''}<strong>${escapeHtml(q.query)}</strong><small><a href="${escapeHtml(q.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(q.url)}</a></small></td><td>${q.impressions.toLocaleString()}</td><td>${q.clicks}</td><td>${q.position}</td><td>${badge(q.eligibility)}${measureNote(q.measurement)}<small>${escapeHtml(q.type)}${q.case_study_locked?' · Case Study locked':''}</small><small>${escapeHtml(q.action)}</small><p>${['PROTECTED','OLD_ADDRESS','PAGE_GONE'].includes(q.eligibility.status)?'':`${startLink(q.page_id,q.query,'Run Growth research')} · `}<a href="/api/tracker-client/${encodeURIComponent(req.params.token)}/growth/brief?page_id=${encodeURIComponent(q.page_id)}&query=${encodeURIComponent(q.query)}" target="_blank" rel="noopener noreferrer">Open / copy execution brief</a></p>${rowControls(q.eligibility,q.page_id,q.query)}${q.case_study_locked||!g.can_edit||['OLD_ADDRESS','PAGE_GONE'].includes(q.eligibility.status)?'':`<details><summary>Record actual publication</summary><form class="growth-log-form" data-page="${q.page_id}" data-query="${escapeHtml(q.query)}"><label>Publication date and time <input name="published_at" type="datetime-local" required></label><label>What actually changed? <textarea name="notes" required maxlength="3000" rows="3" placeholder="Describe verified changes and links actually published"></textarea></label><button type="submit">Save publication checkpoint</button><small role="status"></small></form></details>`}<details><summary>Action plan · 4 steps</summary><ol>${q.checklist.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol><p>${q.case_study_locked?'Case Study: research only; do not change this protected page during the measurement cycle.':'No automatic site edits. Review and publish changes deliberately.'}</p></details></td></tr>`).join('')}</tbody></table>${memorySection}<h2>Prioritized page opportunities</h2><table><thead><tr><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th><th>Next step</th></tr></thead><tbody>${g.pages.map(row).join('')}</tbody></table></details><script>(function(){var tok=encodeURIComponent(location.pathname.split('/')[2]);function rec(body){return fetch('/api/tracker-client/'+tok+'/growth/recommendation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()})}document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.start-rec');if(!a||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();var go=function(){location.href=a.href};rec({action:'start',page_id:Number(a.dataset.page),query:a.dataset.query}).then(go,go)});document.addEventListener('submit',function(e){var f=e.target;if(!f.classList.contains('rec-form'))return;e.preventDefault();var b=f.querySelector('button'),out=f.querySelector('[role=status]');b.disabled=true;rec({action:f.dataset.action,page_id:Number(f.dataset.page),query:f.dataset.query,reason:f.elements.reason?f.elements.reason.value:''}).then(function(r){if(r.success){location.reload()}else{out.textContent=r.error||'Not saved';b.disabled=false}},function(){out.textContent='Not saved. Check the connection.';b.disabled=false})})})();</script><script>document.addEventListener('submit',async function(e){var f=e.target;if(!f.classList.contains('growth-log-form'))return;e.preventDefault();var b=f.querySelector('button'),out=f.querySelector('[role=status]');b.disabled=true;b.textContent='Saving…';out.textContent='';try{var x=await fetch('/api/tracker-client/'+encodeURIComponent(location.pathname.split('/')[2])+'/growth/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page_id:Number(f.dataset.page),query:f.dataset.query,notes:f.elements.notes.value,published_at:new Date(f.elements.published_at.value).toISOString()})});var r=await x.json();out.textContent=r.success?'Recorded. Awaiting comparable GSC measurements.':(r.error||'Not saved');}catch(err){out.textContent='Not saved. Check the date and connection.'}finally{b.disabled=false;b.textContent='Save publication checkpoint'}});</script></body></html>`);
 });
}
module.exports={registerGrowthCockpit,computeGrowth,bucket};
