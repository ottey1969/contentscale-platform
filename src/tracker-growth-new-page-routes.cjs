'use strict';
// Growth for a page that does not exist yet: research starts from a Pre-Write brief (keyword, target market, language)
// instead of a tracked URL. One Growth system: the same market settings (Growth setting > Pre-Write brief), the same
// search and ranking-page reading, the same competitor overview and gap list (in new-page mode), the same selection,
// writing rounds, claim checks, flags, evidence dossier and transactional storage as the existing-page research.
// What is different: there is no page to compare with, so every topic is "to cover on the new page"; the site's
// tracked pages are checked so the new page does not compete with one (cannibalisation); the facts about the business
// come from the site's homepage; the result is a new-page concept package (not a CMS change to an existing page).
// After publication, the page is added to the Tracker and continues in the existing-page research.
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
const {discoverGrowthCompetitorsWithFallback}=require('./growth-public-search-discovery.cjs');
const {renderPublicGrowthPage}=require('./growth-safe-browser-renderer.cjs');
const {readRankingPages}=require('./growth-ranking-page-reader.cjs');
const {buildCompetitorOverview}=require('./growth-competitor-overview.cjs');
const {buildGapList}=require('./growth-gap-list.cjs');
const {checkNewPageOverlap}=require('./growth-new-page-overlap.cjs');
const {deriveSearchLocale,validCountries,validLanguage,countryName,languageName}=require('./growth-search-locale.cjs');
const {resolveMarketSetting}=require('./growth-market-store.cjs');
const {writeForSelection,planBatch,remapSelection,MAX_ITEMS}=require('./growth-selected-writing.cjs');
const {generateGrowthEditorDraft,sourceFacts}=require('./growth-source-grounded-editor.cjs');
const {sHtml}=require('./growth-automatic-analysis.cjs');

const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
// Market settings of a new page are kept per brief, in the same table as page settings, under page id = -brief id
// (tracked page ids are positive, so the two never meet).
const briefKey=id=>-Math.abs(Number(id));
const slugOf=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);

function registerGrowthNewPage(app,pool,data,{fetchLive=fetchPublicGrowthHtml,searchLive=discoverGrowthCompetitorsWithFallback,renderOwn=renderPublicGrowthPage,
 retryDelayMs=1500,buildOverview=buildCompetitorOverview,generateDraft=generateGrowthEditorDraft,
 recordGapList=null,loadGapList=null,recordSelection=null,addToSelection=null,loadOpenSelection=null,
 claimWritingRun=null,storeWritingRun=null,failWritingRun=null,loadConcepts=null,loadPageMarkets=null,savePageMarkets=null,loadSiteMarkets=null}={}){
 if(typeof app?.get!=='function'||typeof pool?.query!=='function'||typeof data!=='function')throw Error('GROWTH_NEW_PAGE_DEPENDENCIES_REQUIRED');
 const api=t=>'/api/tracker-client/'+encodeURIComponent(t)+'/growth/new-page';
 const no=(res,status,code,extra={})=>res.status(status).set('Cache-Control','private, no-store').json({success:false,code,...extra});
 const owner=req=>req.growth?.can_edit===true;
 async function briefs(clientId){
  try{return (await pool.query('SELECT id,keyword,working_title,language,region,created_at FROM prewrite_briefs WHERE client_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[clientId])).rows}
  catch(e){if(e.code==='42P01')return [];throw e}
 }
 async function brief(clientId,id){
  if(!/^[1-9][0-9]{0,12}$/.test(String(id||'')))return null;
  try{return (await pool.query('SELECT id,keyword,working_title,language,region,created_at FROM prewrite_briefs WHERE client_id=$1 AND id=$2',[clientId,Number(id)])).rows[0]||null}
  catch(e){if(e.code==='42P01')return null;throw e}
 }
 async function site(clientId){
  const c=(await pool.query('SELECT domain FROM tracker_clients WHERE id=$1',[clientId])).rows[0];
  const domain=String(c?.domain||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
  const pages=(await pool.query('SELECT id,url,keyword FROM tracker_pages WHERE tracker_client_id=$1 ORDER BY id LIMIT 500',[clientId])).rows;
  return {domain,home:domain?'https://'+domain+'/':null,pages};
 }
 // Market and language: the Growth setting for this brief, field by field, else the brief itself.
 async function marketFor(clientId,b){
  const own=typeof loadPageMarkets==='function'?await Promise.resolve(loadPageMarkets({clientId,pageId:briefKey(b.id)})).catch(()=>null):null;
  const fromBrief={countries:validCountries([b.region]),language:validLanguage(b.language),brief:{id:Number(b.id),keyword:b.keyword,created_at:b.created_at}};
  // Then the site default, field by field (a brief normally names both).
  const site=typeof loadSiteMarkets==='function'&&!((own?.countries?.length||fromBrief.countries.length)&&(own?.language||fromBrief.language))?
   await Promise.resolve(loadSiteMarkets({clientId})).catch(()=>null):null;
  return {own,configured:resolveMarketSetting(own,fromBrief.countries.length||fromBrief.language?fromBrief:null,site)};
 }
 const plannedUrl=(home,b,pages)=>{if(!home)return null;let u=home+(slugOf(b.keyword)||'new-page')+'/';
  return {url:u,taken:pages.some(p=>String(p.url).replace(/\/$/,'')===u.replace(/\/$/,''))}};

 // Research for a new page from a brief. Nothing is written.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/new-page/research',data,async(req,res)=>{
  if(!owner(req))return no(res,403,'OWNER_ONLY');
  const cid=req.growthTrackerClientId,b=await brief(cid,req.body?.brief_id).catch(()=>null);
  if(!b)return no(res,404,'PREWRITE_BRIEF_NOT_FOUND');
  try{
   const {home,pages}=await site(cid);
   const query=clip(b.keyword,160);
   const {configured}=await marketFor(cid,b);
   const locale=deriveSearchLocale({html:'',url:home||'https://example.invalid/',configured});
   const discovery=await Promise.resolve().then(()=>searchLive({query,ownUrl:home,market:null,locale}))
    .catch(e=>({source:'BING_PUBLIC_RSS',query,leads:[],status:'PUBLIC_SEARCH_UNAVAILABLE',reason:String(e?.code||'SEARCH_FAILED').slice(0,60)}));
   const reader=await readRankingPages({query,discovery,historical:[],fetchLive,renderOwn,retryDelayMs});
   const pos=new Map((discovery.leads||[]).map(l=>[l.url,l.serp_position??null]));
   const overview=await Promise.resolve(buildOverview({query,ownUrl:null,ownHtml:'',newPage:true,
    competitors:reader.comparisons.map(x=>({url:x.url,html:x.live.html,truncated:x.live.truncated===true,serp_position:pos.get(x.url)??null}))}))
    .catch(()=>({status:'OVERVIEW_UNAVAILABLE'}));
   const report={generated_at:new Date().toISOString(),url:null,new_page:true,
    brief:{id:Number(b.id),keyword:b.keyword,working_title:b.working_title||null,region:b.region||null,language:b.language||null,created_at:b.created_at},
    search_discovery:{...discovery,leads:(discovery.leads||[]).slice(0,10),target_query:query,search_locale:{...locale,
      ...(configured?.brief?{brief:configured.brief}:{})},competitor_fetch_log:reader.fetchLog,fetch_summary:reader.fetchSummary},
    competitor_overview:overview};
   const gapList=buildGapList(report);
   const overlap=checkNewPageOverlap({keyword:query,sitePages:pages,items:gapList.items});
   gapList.recommended=gapList.items.filter(x=>x.recommended).map(x=>x.id);
   const planned=plannedUrl(home,b,pages);
   gapList.research={...gapList.research,page_url:planned?.url||null,overlap:{status:overlap.status,exact:overlap.exact,possible:overlap.possible}};
   let ref=null;
   if(typeof recordGapList==='function')ref=await Promise.resolve(recordGapList({clientId:cid,prewriteBriefId:Number(b.id),targetUrl:planned?.url||'new-page:'+b.id,focusQuery:query,list:gapList})).catch(e=>{console.warn('[growth-new-page] gap list not saved',String(e?.code||'unknown'));return null});
   let carried=null;
   if(ref&&typeof loadOpenSelection==='function'){
    const open=await Promise.resolve(loadOpenSelection({clientId:cid,prewriteBriefId:Number(b.id),beforeId:Number(ref.id)})).catch(()=>null);
    if(open&&open.pending.length){const m=remapSelection(open.pending_items||[],gapList.items);
     carried={from_gap_list_id:open.gap_list_id,pending_ids:m.carried,needs_confirmation:m.needs_confirmation,needs_remapping:m.needs_remapping,no_longer_found:m.no_longer_found,
      note:'Items you selected earlier and that were not written yet. Ticked again only when the new research still shows the same need; nothing is written until you click.'}}
   }
   res.set('Cache-Control','private, no-store').json({success:true,...report,new_page_research:{planned_url:planned?.url||null,planned_url_taken:!!planned?.taken,
     overlap,market_coverage:discovery.market_coverage||null,home_url:home},
    gap_list:{...gapList,target_url:planned?.url||null,carried_over:carried,id:ref?Number(ref.id):null,
     write_url:ref?api(req.params.token)+'/write':null,selection_url:ref?api(req.params.token)+'/selection':null},
    published:false,access:{can_edit:true,owner_report:true}});
  }catch(e){console.warn('[growth-new-page] research failed',String(e?.code||e?.message||'unknown').slice(0,80));return no(res,503,'NEW_PAGE_RESEARCH_TEMPORARILY_UNAVAILABLE')}
 });

 async function ownList(req,res){
  if(!owner(req)||typeof loadGapList!=='function'){no(res,403,'OWNER_ONLY');return null}
  let list;try{list=await loadGapList({clientId:req.growthTrackerClientId,id:req.body?.gap_list_id??req.query?.gap_list_id})}catch{no(res,503,'GAP_LIST_UNAVAILABLE');return null}
  if(!list||list.page_kind!=='NEW_PAGE'||!list.prewrite_brief_id){no(res,404,'NEW_PAGE_GAP_LIST_NOT_FOUND');return null}
  return list;
 }
 // The owner's deliberate selection (the ticks), as for existing pages.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/new-page/selection',data,async(req,res)=>{
  const list=await ownList(req,res);if(!list)return;
  const ids=Array.isArray(req.body?.item_ids)?[...new Set(req.body.item_ids.map(String))]:[];
  const known=(list.items||[]).filter(x=>ids.includes(String(x.id))).map(x=>x.id);
  if(ids.length&&!known.length)return no(res,400,'SELECTION_NOT_IN_GAP_LIST');
  try{await recordSelection({clientId:req.growthTrackerClientId,id:list.id,itemIds:known})}catch{return no(res,503,'SELECTION_NOT_SAVED')}
  const done=new Set((list.written_ids||[]).map(String));
  res.set('Cache-Control','private, no-store').json({success:true,gap_list_id:Number(list.id),selected:known,written:known.filter(x=>done.has(String(x))),pending:known.filter(x=>!done.has(String(x)))});
 });
 // Writing the selected topics as sections of the new page: rounds of four, one run at a time, stored with the dossier
 // in one transaction, flagged sentences marked. A brief whose keyword a tracked page already targets needs confirmation.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/new-page/write',data,async(req,res)=>{
  const list=await ownList(req,res);if(!list)return;
  const cid=req.growthTrackerClientId,b=await brief(cid,list.prewrite_brief_id).catch(()=>null);
  if(!b)return no(res,404,'PREWRITE_BRIEF_NOT_FOUND');
  if(list.research?.evidence_status==='INSUFFICIENT_EVIDENCE')return no(res,409,'NOT_ENOUGH_EVIDENCE_TO_WRITE');
  const ov=list.research?.overlap;
  if(ov?.status==='EXISTING_PAGE_TARGETS_THIS_KEYWORD'&&req.body?.confirm_new_page!==true)
   return no(res,409,'EXISTING_PAGE_TARGETS_THIS_KEYWORD',{existing_pages:ov.exact||[],note:'Improve the existing page instead, or confirm that a separate new page is intended (confirm_new_page).'});
  const ids=Array.isArray(req.body?.item_ids)?[...new Set(req.body.item_ids.map(String))].slice(0,200):[];
  const named=(list.items||[]).filter(x=>ids.includes(String(x.id)));
  if(ids.length&&!named.length)return no(res,400,'SELECTION_NOT_IN_GAP_LIST');
  const stored=new Set((list.selected||[]).map(String));
  if(named.length&&typeof addToSelection==='function')await Promise.resolve(addToSelection({clientId:cid,id:list.id,itemIds:named.map(x=>x.id)})).catch(()=>{});
  const selectedItems=(list.items||[]).filter(x=>stored.has(String(x.id))||ids.includes(String(x.id)));
  if(!selectedItems.length)return no(res,400,'SELECT_AT_LEAST_ONE_ITEM');
  if(!selectedItems.some(x=>x.writable))return no(res,400,'ONLY_PAGE_ELEMENTS_SELECTED');
  const plan=planBatch(selectedItems,req.body?.rewrite===true?[]:list.written_ids||[]);
  if(!plan.batch.length)return no(res,409,'SELECTION_ALREADY_WRITTEN',{package_url:api(req.params.token)+'/package?gap_list_id='+list.id});
  let run=null;
  if(typeof claimWritingRun==='function'){
   let claim;try{claim=await claimWritingRun({clientId:cid,gapListId:list.id,itemIds:plan.batch.map(x=>x.id)})}catch{return no(res,503,'WRITING_RUN_NOT_STARTED')}
   if(claim.conflict)return no(res,409,'WRITING_IN_PROGRESS',{run:{run_id:Number(claim.conflict.id),item_ids:claim.conflict.item_ids,started_at:claim.conflict.started_at}});
   run=claim.run;
  }
  const fail=async e=>{if(run&&typeof failWritingRun==='function')await Promise.resolve(failWritingRun({runId:run.id,error:e})).catch(()=>{})};
  // The facts about the business come from the site itself (its homepage), never from the competitors.
  const {home}=await site(cid).catch(()=>({home:null}));
  let homeHtml='';try{homeHtml=home?String((await fetchLive(home))?.html||''):''}catch{}
  const planned=list.target_url&&/^https:\/\//.test(list.target_url)?list.target_url:home;
  let written;
  try{written=await writeForSelection({items:plan.batch,targetUrl:planned,focusQuery:list.focus_query||b.keyword,mode:'NEW_DISTINCT_PAGE',
   research:list.research||null,sourceFingerprint:null,
   generate:async ctx=>({...(await generateDraft({sourceHtml:homeHtml,pageUrl:planned,focusQuery:list.focus_query||b.keyword,readerTask:ctx.reader_task,
    researchObservations:ctx.observations,fallbackFlagged:true})),source_text:sourceFacts(homeHtml).text})})}
  catch(e){await fail('WRITER_ERROR');return no(res,503,'WRITER_UNAVAILABLE')}
  if(!written.sections?.length&&written.writer_status==='INSUFFICIENT_PAGE_SOURCE')
   written.reason='Growth needs facts about the business from your site: the homepage ('+(home||'unknown')+') could not be read. Write these sections yourself, or try again.';
  const linked=(written.sections||[]).map(s=>s.item_id);
  let ref=null,storageError=null;
  if(linked.length&&typeof storeWritingRun==='function'){
   try{ref=(await storeWritingRun({clientId:cid,runId:run?.id||null,gapListId:list.id,itemIds:linked,
     newPageConcept:{briefId:Number(b.id),keyword:b.keyword,plannedUrl:planned,title:b.working_title||b.keyword,written}})).proposal}
   catch(e){storageError=String(e?.code||'STORE_FAILED').slice(0,60);console.warn('[growth-new-page] concept not stored',storageError)}
  }
  if(!ref)await fail(storageError||written.writer_status||'NOT_WRITTEN');
  const done=ref?linked:[];
  const pending=[...plan.batch.filter(x=>!done.includes(x.id)),...plan.pending].map(x=>({item_id:x.id,title:x.title}));
  if(storageError)written.storage_error='CONCEPT_NOT_STORED_NOTHING_MARKED_WRITTEN';
  res.set('Cache-Control','private, no-store').json({success:true,...written,page_kind:'NEW_PAGE',gap_list_id:Number(list.id),run_id:run?Number(run.id):null,stored:!!ref,
   batch:plan.batch.map(x=>x.id),already_written:plan.already_written,pending,
   batch_note:pending.length?pending.length+' selected item(s) are kept for the next run (at most '+MAX_ITEMS+' per run).':null,
   new_page_package:ref?{concept_id:Number(ref.id),url:api(req.params.token)+'/package?gap_list_id='+list.id}:null,
   cms_handoff:null,published:false,copy_ready:false});
 });
 // The new-page package: every concept of this research (latest per topic), its basis, flags, fact-check list and the
 // evidence dossiers. Markdown for the editor, or JSON. Nothing is published.
 app.get('/api/tracker-client/:token/growth/new-page/package',data,async(req,res)=>{
  const list=await ownList(req,res);if(!list)return;
  const concepts=typeof loadConcepts==='function'?await Promise.resolve(loadConcepts({clientId:req.growthTrackerClientId,gapListId:list.id})).catch(()=>[]):[];
  if(!concepts.length)return no(res,404,'NO_CONCEPT_WRITTEN_YET');
  const latest=new Map();for(const c of concepts)for(const s of c.sections||[])latest.set(s.item_id||s.h2,{...s,concept_id:Number(c.id),written_at:c.created_at});
  const first=concepts[0],last=concepts[concepts.length-1];
  const review={flagged:concepts.flatMap(c=>c.review?.flagged||[]),fact:[...new Set(concepts.flatMap(c=>c.review?.needs_fact_check||[]))],
   owner:[...new Set(concepts.flatMap(c=>c.review?.needs_owner_confirmation||[]))],safety:[...new Set(concepts.flatMap(c=>c.review?.needs_safety_review||[]))]};
  const pkg={kind:'NEW_PAGE_CONCEPT',keyword:first.keyword,title:last.title,planned_url:last.planned_url,prewrite_brief_id:Number(first.prewrite_brief_id),
   overlap:list.research?.overlap||null,market:list.research?.market||null,sections:[...latest.values()],review,
   dossiers:concepts.map(c=>c.review?.dossier).filter(Boolean),published:false,
   next_steps:['Check every statement; rewrite or remove every flagged sentence.','Publish the page yourself at the planned URL (or another free URL).',
    'Link to it from related pages of the site.','Add the published URL to the Tracker: it then continues in the existing-page research and measurement.']};
  if(String(req.query.format||'')==='json')return res.set('Cache-Control','private, no-store').json({success:true,package:pkg});
  const L=['# New page concept: '+(pkg.title||pkg.keyword),'','Keyword: '+pkg.keyword,'Planned URL: '+(pkg.planned_url||'—')+' (not published)',
   'From Pre-Write brief #'+pkg.prewrite_brief_id+(pkg.market?.country?' · market '+pkg.market.country+(pkg.market.language?' · language '+pkg.market.language:''):''),
   ...(pkg.overlap&&pkg.overlap.status!=='NO_OVERLAP_FOUND'?['','> Overlap check: '+pkg.overlap.status+' — '+[...(pkg.overlap.exact||[]),...(pkg.overlap.possible||[])].map(p=>p.url).join(', ')]:[]),'',
   ...pkg.sections.flatMap(s=>['## '+s.h2,'',s.text,'',
    '_Answers: '+(s.basis?.answers||s.task||'—')+' · basis: '+String(s.basis?.evidence_level||'—').toLowerCase().replace(/_/g,' ')+
    ((s.basis?.competitor_evidence||[]).length?' · sources: '+s.basis.competitor_evidence.map(e=>e.site).join(', '):'')+'_',
    ...(s.basis?.warning?['','> '+s.basis.warning]:[]),'']),
   ...(review.flagged.length?['## Flagged by Growth: rewrite or remove','',...review.flagged.map(f=>'- [ ] '+(f.sentence?'“'+f.sentence+'” — ':'“'+f.h2+'” (whole section) — ')+f.reason),'']:[]),
   ...(review.fact.length?['## Fact-check','',...review.fact.map(x=>'- [ ] '+x),'']:[]),
   ...(review.owner.length?['## Confirm with the business','',...review.owner.map(x=>'- [ ] '+x),'']:[]),
   ...(review.safety.length?['## Safety review by a qualified professional','',...review.safety.map(x=>'- [ ] '+x),'']:[]),
   '## Next steps','',...pkg.next_steps.map(x=>'- '+x),'','## Evidence dossier','','```json',JSON.stringify(pkg.dossiers,null,2),'```',''];
  res.set('Cache-Control','private, no-store').set('Content-Disposition','attachment; filename="new-page-'+(slugOf(pkg.keyword)||'concept')+'.md"').type('text/markdown').send(L.join('\n'));
 });
 // Market and language for a new page: the same setting as for existing pages, kept per brief.
 if(typeof app.post==='function')app.post('/api/tracker-client/:token/growth/new-page/markets',data,async(req,res)=>{
  if(!owner(req)||typeof savePageMarkets!=='function')return no(res,403,'OWNER_ONLY');
  const b=await brief(req.growthTrackerClientId,req.body?.brief_id).catch(()=>null);if(!b)return no(res,404,'PREWRITE_BRIEF_NOT_FOUND');
  const entries=(Array.isArray(req.body?.countries)?req.body.countries:String(req.body?.countries||'').split(/[,;]+/)).map(x=>String(x).trim()).filter(Boolean);
  const countries=validCountries(entries);
  if(entries.length&&countries.length<entries.length)return no(res,400,'UNKNOWN_COUNTRY');
  if(String(req.body?.language||'').trim()&&!validLanguage(req.body.language))return no(res,400,'UNKNOWN_LANGUAGE');
  try{const saved=await savePageMarkets({clientId:req.growthTrackerClientId,pageId:briefKey(b.id),countries,language:req.body?.language});
   res.set('Cache-Control','private, no-store').json({success:true,markets:saved,research_rerun_required:true})}
  catch{return no(res,503,'MARKET_SETTING_NOT_SAVED')}
 });
 // The page: the client's Pre-Write briefs, and the research for one of them.
 app.get('/track/:token/growth/new-page',data,async(req,res)=>{
  const t=req.params.token,base='/track/'+encodeURIComponent(t)+'/growth';
  const head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
   '<title>Growth · New page from a Pre-Write brief</title><style>body{font:15px/1.55 system-ui;color:#172337;background:#f6f8fc;margin:0;padding:24px}main{max-width:1120px;margin:auto}h1{font-size:28px}h2{font-size:21px}'+
   'a{color:#1d4ed8}section{background:white;border:1px solid #d9e1ec;border-radius:12px;padding:18px;margin:14px 0}small{color:#53637a;display:block}.info{color:#5b6475;font-size:13px}.error{color:#b42318}'+
   'button{background:#1d4ed8;color:white;border:0;padding:10px 14px;border-radius:8px;font:inherit;cursor:pointer}button:disabled{opacity:.5}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5eaf2;padding:8px;text-align:left}'+
   '#marketSetting input{font:inherit;padding:6px 8px;border:1px solid #c8d2e0;border-radius:6px;margin:4px 0;box-sizing:border-box}#marketInput{width:min(100%,560px)}#marketLanguage{width:min(100%,200px)}'+
   '@media(max-width:600px){body{padding:12px}section{padding:12px}}</style>'+
   '<script defer src="/growth-gap-checklist.js"></script><script defer src="/growth-new-page-ui.js"></script></head><body><main>';
  const send=html=>res.set('Cache-Control','private, no-store').set('X-Robots-Tag','noindex,nofollow').set('Referrer-Policy','no-referrer').type('html').send(head+html+'</main></body></html>');
  if(!owner(req))return send('<p><a href="'+base+'">← Growth</a></p><h1>New page from a Pre-Write brief</h1><p>Only the account owner can research and write new pages.</p>');
  const cid=req.growthTrackerClientId;
  if(!req.query.brief_id){
   const list=await briefs(cid).catch(()=>[]);
   return send('<p><a href="'+base+'">← Growth</a></p><h1>New page from a Pre-Write brief</h1>'+
    '<p class="info">For a page that does not exist yet. Growth researches the brief\'s keyword in its target market and language, compares the ranking pages, checks your tracked pages so the new page does not compete with one, and writes only the topics you select. Nothing is published.</p>'+
    (list.length?'<section><table><thead><tr><th>Keyword</th><th>Market</th><th>Language</th><th>Brief</th><th></th></tr></thead><tbody>'+list.map(x=>
     '<tr><td><strong>'+sHtml(x.keyword)+'</strong>'+(x.working_title?'<small>'+sHtml(x.working_title)+'</small>':'')+'</td><td>'+sHtml(validCountries([x.region]).map(c=>c.toLowerCase()+' — '+countryName(c)).join('')||'—')+'</td><td>'+sHtml(x.language||'—')+
     '</td><td>#'+Number(x.id)+'<small>'+sHtml(new Date(x.created_at).toISOString().slice(0,10))+'</small></td><td><a href="'+base+'/new-page?brief_id='+Number(x.id)+'">Research as a new page</a></td></tr>').join('')+'</tbody></table></section>':
     '<section><p>No Pre-Write brief yet. Create one in Pre-Write first (keyword, target market and language); it then appears here.</p></section>'));
  }
  const b=await brief(cid,req.query.brief_id).catch(()=>null);
  if(!b)return send('<p><a href="'+base+'/new-page">← Pre-Write briefs</a></p><h1>Brief not found</h1>');
  const {own,configured}=await marketFor(cid,b);
  const regionLabel=c=>c.toLowerCase()+' — '+countryName(c);
  const from=(o,label)=>o?'set in Growth':label;
  const day=d=>{try{return new Date(d).toISOString().slice(0,10)}catch{return ''}};
  return send('<p><a href="'+base+'/new-page">← Pre-Write briefs</a></p><h1>New page: '+sHtml(b.keyword)+'</h1>'+
   '<p class="info">From Pre-Write brief #'+Number(b.id)+' ('+day(b.created_at)+')'+(b.working_title?' · working title “'+sHtml(b.working_title)+'”':'')+'. Research and concepts only; nothing is published.</p>'+
   '<section id="marketSetting" data-url="'+sHtml(api(t)+'/markets')+'" data-brief-id="'+Number(b.id)+'"><h2>Target market and language</h2>'+
   '<p class="info">From the Pre-Write brief unless you set them here (each field separately). Main market first; more markets separated by commas.</p>'+
   '<p><label for="marketInput">Target market(s): </label><input id="marketInput" type="text" value="'+sHtml(own?.countries?.length?own.countries.map(regionLabel).join(', '):'')+'" placeholder="'+sHtml((configured?.countries||[]).map(regionLabel).join(', ')||'nl — Netherlands')+'"> '+
   '<label for="marketLanguage">Language: </label><input id="marketLanguage" type="text" value="'+sHtml(own?.language?languageName(own.language):'')+'" placeholder="'+sHtml(configured?.language?languageName(configured.language):'English')+'"> '+
   '<button id="marketSave" type="button">Save and run the research again</button></p>'+
   '<small id="marketSaid">Market: '+sHtml((configured?.countries||[]).map(regionLabel).join(', ')||'not set (US / English default)')+' — '+from(own?.countries?.length,'from the Pre-Write brief')+'<br>Language: '+
   sHtml(configured?.language?languageName(configured.language):'not set')+' — '+from(own?.language,'from the Pre-Write brief')+'</small></section>'+
   '<section><div role="status" id="newPageStatus" data-research-url="'+sHtml(api(t)+'/research')+'" data-brief-id="'+Number(b.id)+'">Researching the ranking pages for this keyword…</div>'+
   '<button id="newPageDownload" type="button" hidden>Download research (JSON)</button></section><div id="newPageReport"></div>');
 });
}
module.exports={registerGrowthNewPage,briefKey};
