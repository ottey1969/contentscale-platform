'use strict';
// ONE integrated contract: owner GET research -> owner POST completion -> HTML render -> downloads.
// Inputs are derived from real export 27 (captured text only, see fixtures/growth-export-27).
// The AI provider is an ISOLATION STUB (labelled below). Nothing here is production evidence;
// live crawl, real provider and Railway are verified separately and reported as such.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fx=require('./fixtures/growth-export-27/captured.json');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const HOME=fx.tracked_page.url,DEST=fx.destination.url,BRAND=fx.sibling_pages[0].url;
const homepageHtml='<html><head><title>'+esc(fx.homepage.title)+'</title><meta name="description" content="'+esc(fx.homepage.description)+'"></head><body><h1>'+
 esc(fx.homepage.h1[0])+'</h1>'+fx.homepage.h2.map(h=>'<h2>'+esc(h)+'</h2>').join('')+fx.homepage.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+'</body></html>';
const destHtml=(extra=[])=>'<html><head><title>'+esc(fx.destination.h1)+'</title></head><body><h1>'+esc(fx.destination.h1)+'</h1>'+
 [...fx.destination.paragraphs,...extra].map(p=>'<p>'+esc(p)+'</p>').join('')+'</body></html>';
const brandHtml='<html><head><title>'+esc(fx.sibling_pages[0].title)+'</title></head><body><h1>'+esc(fx.sibling_pages[0].h1[0])+'</h1>'+
 fx.sibling_pages[0].observed_paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+'</body></html>';
const byUrl={};for(const c of fx.competitor_sections)(byUrl[c.url]=byUrl[c.url]||[]).push(c);
const competitorHtml=url=>byUrl[url]?'<html><body><article>'+byUrl[url].map(x=>'<h2>'+esc(x.heading)+'</h2><p>'+esc(x.excerpt)+'</p>').join('')+'</article></body></html>':
 '<html><body><div id="app"></div><script>window.__shell=1</script></body></html>'; // JS shell: unreadable, as in the export
const gscRows=pageId=>fx.gsc_homepage_rows.map(r=>({page_id:pageId,tracker_client_id:4,source_page_url:HOME,evidence_scope:'page_verified',...r}));

function harness({pageId=fx.tracked_page.id,pageUrl=HOME,keyword='content at scale',saved=homepageHtml,withGsc=true,
 locked=true,inventory=fx.site_inventory_test_ids.rows,pages={},leads=fx.serp_leads,drafts=[],truncateCompetitors=false,truncateDestination=false}={}){
 const route={},writes=[],providerCalls=[];
 const html={[HOME]:homepageHtml,[DEST]:destHtml(),[BRAND]:brandHtml,...pages};
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes.push(sql);throw Error('No writes permitted')}
  if(sql.includes('LEFT(html_content'))return {rows:[{id:pageId,tracker_client_id:4,url:pageUrl,keyword,saved_html:saved}]};
  if(sql.includes('FROM tracker_snapshots')||sql.includes('FROM tracker_ai_evidence'))return {rows:[]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:withGsc&&args[1]===pageId&&args[2]===HOME?gscRows(pageId):[]};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:inventory.filter(r=>r.id!==pageId)};
  throw Error('Unexpected database access '+sql.slice(0,100));
 }};
 const middleware=(req,res,next)=>{req.growthTrackerClientId=4;
  req.growth={can_edit:req.params.token==='owner-token',pages:[{id:pageId,url:pageUrl,keyword,case_study_active:locked}]};next()};
 const fetchLive=async url=>{
  const body=html[url]??(byUrl[url]||/jasper|optimizely/.test(url)?competitorHtml(url):null);
  if(body==null)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
  const isComp=!!byUrl[url]||/jasper|optimizely/.test(url);
  return {html:body,final_url:url,retrieved_at:'2026-10-21T10:00:00Z',truncated:(truncateCompetitors&&isComp)||(truncateDestination&&url===DEST),source:'LIVE_PUBLIC_HTTPS'};
 };
 const searchLive=async()=>({status:leads.length?'FRESH_GOOGLE_ORGANIC_LEADS':'NO_RELEVANT_PUBLIC_SEARCH_LEADS',source:'SERPER_GOOGLE_ORGANIC',
  query:'content scaling',leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-21T10:00:00Z'});
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},db,middleware,{fetchLive,searchLive,
  // ISOLATION_STUB_NOT_PRODUCTION_EVIDENCE: stands in for the AI provider only.
  completeOwnerDraft:async({token,body})=>{providerCalls.push({token,body});
   const next=drafts.shift();
   return {statusCode:200,body:next?{success:true,page_id:body.page_id,...next(body)}:{success:false,code:'NO_STUB'}}}});
 async function invoke(path,token='readonly-client-token',page_id=String(pageId)){
  const req={params:{token},query:{page_id}},res={statusCode:200,headers:{},status(x){this.statusCode=x;return this},
   set(k,v){this.headers[k]=v;return this},type(){return this},json(x){this.body=x;return this},send(x){this.body=x;return this}};
  const stack=route[path];assert(stack,'route '+path);
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
  return res;
 }
 return {invoke,writes,providerCalls,GET:'/api/tracker-client/:token/growth/auto-research',POST:'/api/tracker-client/:token/growth/auto-research/complete'};
}
const draftFor=(h2,paras,url=DEST)=>body=>({canonical_url:url,status:'AI_DRAFT_REVIEW_REQUIRED',
 draft:{seo_title:null,meta_description:null,sections:[{h2,paragraphs:paras}]},
 draft_source_type:'LIVE_PUBLIC_HTML',live_competitor_observations_used:3,gsc_context:{status:'NO_VERIFIED_GSC',gsc_required:false}});
// Test-authored isolation text (no figures, no competitor wording). 'never' is softened by the claim guard.
const GOOD=['Before commissioning anything new, decide which existing pages are worth repurposing: list the pages that still answer a live question, then repurpose the strongest guide into a checklist or a short explainer for another channel.',
 'Keep a note of which original page each repurposed piece came from, so the refreshed versions never contradict each other and every update has one clear owner.'];
const GOOD_SAFE=[GOOD[0],GOOD[1].replace('never contradict','rarely contradict')];

test('GET research is research-only and already carries the evidence-based decision for the exact destination',async()=>{
 const h=harness(),r=await h.invoke(h.GET);
 assert.equal(r.statusCode,200);const b=r.body;
 assert.equal(b.case_study_locked,true);
 assert.equal(b.editorial_review_draft.status,'RESEARCH_ONLY_OWNER_COMPLETION_NOT_RUN');assert.equal(b.editorial_review_draft.draft,null);
 assert.equal(b.serp_intent.status,'SERP_INTENT_OBSERVED');assert.equal(b.serp_intent.intent,'INFORMATIONAL_GUIDE');
 assert.equal(b.destination_intent.verdict,'COMPATIBLE');
 assert.equal(b.editorial_decision_gate.decision,'IMPROVE_EXISTING');
 assert.equal(b.editorial_decision_gate.target_url,DEST);assert.equal(b.editorial_decision_gate.protected_url,HOME);
 assert.equal(b.editorial_decision_gate.copy_ready,false,'no copy before owner completion');
 const task=b.editorial_decision_gate.improvement_plan.tasks[0];
 assert.equal(task.code,'task_repurp');assert.equal(task.match.key,'repurp');assert(task.placement.section_heading||task.placement.mode);
 assert(task.competitor_evidence.length>=2,'two independent competitor sources');
 assert.equal(new Set(task.competitor_evidence.map(x=>new URL(x.url).hostname)).size,2);
 // Homepage GSC never becomes destination performance.
 assert.equal(b.destination_gsc_evidence.status,'NO_VERIFIED_DESTINATION_ROWS');assert.equal(b.destination_gsc_evidence.metrics,null);
 assert.equal(b.destination_gsc_evidence.target_page_id,2298);
 assert.equal(h.writes.length,0);assert.equal(h.providerCalls.length,0,'GET must not call the provider');
});

test('owner POST: draft is validated against the missing task and exported with placement, sources and links',async()=>{
 const h=harness({drafts:[draftFor('Repurpose what you already published',GOOD)]});
 const r=await h.invoke(h.POST,'owner-token');
 assert.equal(r.statusCode,200);const b=r.body;
 assert.equal(h.providerCalls.length,1);const call=h.providerCalls[0].body;
 assert.equal(call.page_id,2298,'drafts the selected destination, never the homepage');assert.equal(call.growth_source_page_id,2320);
 assert.equal(call.research_context.reader_task.mode,'SECTION_IMPROVEMENT');
 assert.equal(call.research_context.reader_task.tasks[0].code,'task_repurp');
 const d=b.editorial_work_packet.editorial_decision;
 assert.equal(d.decision,'IMPROVE_EXISTING');assert.equal(d.copy_ready,true);assert.equal(d.publish_allowed,false);
 assert.equal(d.target_url,DEST);assert.equal(d.proposed_text,GOOD_SAFE.join('\n\n'),'claim guard softened exactly one absolute word and logged it');
 assert.equal(d.safe_rewrites.length,1);assert.match(d.safe_rewrites[0].before,/never contradict/);assert.match(d.safe_rewrites[0].after,/rarely contradict/);
 assert.equal(b.verified_opportunity_status.verified,true,'producer ran inside the owner POST');
 assert.equal(b.verified_opportunity_status.producer,'GROWTH_VERIFIED_OPPORTUNITY_PRODUCER');
 assert.equal(d.verified_by,'GROWTH_TASK_COVERAGE_PLUS_DRAFT_VALIDATION','the gate released copy through its verified_editorial_opportunity branch');
 assert.equal(b.editorial_decision_gate.verified_gap,true);
 assert.equal(d.draft_validation[0].competitor_wording_reused,false);
 assert.equal(b.editorial_decision_gate.decision,'IMPROVE_EXISTING');
 assert.equal(b.report_completion.status,'CONCRETE_EDIT_FOR_OWNER_REVIEW');
 assert.equal(b.report_completion.case_study_unchanged,true);assert.equal(b.report_completion.automatic_publishing,false);
 const md=b.handoff_package.markdown;
 assert.match(md,/\*\*IMPROVE_EXISTING\*\*/);assert.match(md,new RegExp(DEST.replace(/[./]/g,'\\$&')));
 assert.match(md,/Placement:/);assert.match(md,/Proposed text/);assert.match(md,/aprimo\.com/);assert.match(md,/textbroker\.com/);
 assert.match(md,/No verified Search Console rows for the target page/);
 assert.doesNotMatch(md,/3943|12\.7/,'homepage GSC numbers are never presented as destination data');
 assert.equal(b.handoff_package.publication_allowed,false);
 assert.equal(h.writes.length,0,'no database write, Case Study untouched');
});

test('draft guard: competitor wording, off-task text, duplicates, unsupported claims and provider blockers never become copy',async()=>{
 const copied=byUrl['https://www.textbroker.com/create-scalable-content'].find(x=>/recycled or repurposed/.test(x.excerpt)).excerpt.split(/\s+/).slice(0,14).join(' ');
 const cases=[
  [draftFor('Repurpose what you already published',[GOOD[0]+' '+copied+' to keep working smarter every single month for the whole team.',GOOD[1]]),/DRAFT_REJECTED_DRAFT_REUSES_COMPETITOR_WORDING/],
  [draftFor('Tool pricing',['Pricing pages should list every plan next to its monthly cost and show a clear comparison table for buyers.','Add a short note on how to contact sales for custom quotes and volume discounts.']),/DRAFT_REJECTED_DRAFT_OFF_TASK/],
  [draftFor('Repurpose what you already published',[fx.destination.paragraphs[2],fx.destination.paragraphs[3]]),/DRAFT_REJECTED_(?:DRAFT_DUPLICATES_DESTINATION|DRAFT_OFF_TASK)/],
  [draftFor('Repurpose your best guide',['Repurpose your best guide and it guarantees higher rankings within 30 days, because search engines always reward repurposed pages.','Repurposing also proves ChatGPT will cite your page, and our award-winning team repurposes content for every client.']),/DRAFT_REJECTED_DRAFT_UNSUPPORTED_CLAIMS/]
 ];
 for(const [make,expect] of cases){
  const h=harness({drafts:[make]}),r=await h.invoke(h.POST,'owner-token'),d=r.body.editorial_work_packet.editorial_decision;
  assert.equal(d.decision,'IMPROVE_EXISTING');assert.equal(d.copy_ready,false);assert.equal(d.proposed_text,undefined);assert.match(d.copy_status,expect);
  assert.equal(r.body.report_completion.status,'RESEARCH_COMPLETE_DRAFT_NOT_READY');
  assert.equal(r.body.verified_opportunity_status.verified,false,'producer refuses unverified drafts');
 }
 // The rejection names the exact claims so the owner sees why.
 const h2=harness({drafts:[cases[3][0]]}),r2=await h2.invoke(h2.POST,'owner-token');
 const codes=r2.body.editorial_work_packet.editorial_decision.draft_rejections.flatMap(x=>(x.claim_violations||[]).map(v=>v.code));
 for(const c of ['ABSOLUTE_CLAIM','UNPROVEN_OUTCOME_CLAIM','UNSOURCED_NUMBER'])assert(codes.includes(c),'expected '+c+' in '+codes);
 const h=harness({drafts:[()=>({canonical_url:DEST,status:'OPTIONAL_AI_NOT_CONFIGURED',draft:null})]});
 const r=await h.invoke(h.POST,'owner-token');
 assert.equal(r.body.editorial_review_draft.status,'BLOCKED_PROVIDER');assert.equal(r.body.editorial_review_draft.draft,null);
 assert.match(r.body.editorial_work_packet.editorial_decision.copy_status,/BLOCKED_PROVIDER/);
});

test('NO_CHANGE is reachable with evidence and makes no provider call (synthetic path test)',async()=>{
 const taught='Repurpose before you replace. Review the pages you already have, and repurpose the strongest guide into a checklist so the repurposed version reuses the same research instead of repeating it.';
 const h=harness({pages:{[DEST]:destHtml([taught,taught.replace('Refresh before you replace','Reuse what already works')])}});
 const r=await h.invoke(h.POST,'owner-token'),b=r.body;
 assert.equal(b.editorial_decision_gate.decision,'NO_CHANGE');assert.equal(b.editorial_decision_gate.closure_report.tasks_checked[0].code,'task_repurp');
 assert.equal(b.report_completion.status,'NO_CHANGE_CLOSURE_REPORT');assert.equal(h.providerCalls.length,0);
 assert.match(b.handoff_package.markdown,/Closure report/);
});

test('DATA_BLOCKED names what is missing and which automatic sources were already tried',async()=>{
 const h=harness({leads:[]}),r=await h.invoke(h.POST,'owner-token'),d=r.body.editorial_decision_gate;
 assert.equal(d.decision,'DATA_BLOCKED');
 assert(d.missing_evidence.some(x=>x.code==='SERP_INTENT_EVIDENCE'));
 assert(['TARGET_STATIC_HTML','SEARCH_PROVIDERS','COMPETITOR_HTML_FETCH'].every(s=>d.attempted_sources.some(a=>a.source===s)));
 assert.equal(h.providerCalls.length,0);assert.match(r.body.handoff_package.markdown,/Automatic sources already tried/);
});

test('NEW_DISTINCT_PAGE only for a verified different intent with no compatible same-site page (synthetic path test)',async()=>{
 const brandRow={id:9001,url:BRAND,keyword:'content scaling'};
 const h=harness({pageId:9001,pageUrl:BRAND,keyword:'content scaling',saved:brandHtml,withGsc:false,locked:false,inventory:[brandRow],
  pages:{[BRAND]:brandHtml},drafts:[body=>({canonical_url:BRAND,status:'AI_DRAFT_REVIEW_REQUIRED',draft_source_type:'LIVE_PUBLIC_HTML',live_competitor_observations_used:2,
   draft:{seo_title:'Content scaling: build a repeatable process',meta_description:'A practical process for scaling content.',sections:[
    {h2:'Audit what you already have',paragraphs:['Begin with a content audit: list every page, note the question it answers and mark the ones that are stale or overlap with each other.']},
    {h2:'Plan a repeatable workflow',paragraphs:['Write the workflow down as steps with an owner for each, so briefs, drafting, editing and approval happen the same way every time.']}]}})]});
 const r=await h.invoke(h.POST,'owner-token'),b=r.body,d=b.editorial_work_packet.editorial_decision;
 assert.equal(b.destination_intent.verdict,'DIFFERENT');assert.equal(d.decision,'NEW_DISTINCT_PAGE');assert.equal(d.copy_ready,true);
 assert.equal(h.providerCalls[0].body.research_context.reader_task.mode,'NEW_DISTINCT_PAGE');
 assert.equal(d.new_page_draft.sections.length,2);assert.equal(b.report_completion.status,'NEW_PAGE_DRAFT_FOR_OWNER_REVIEW');
 assert.match(b.handoff_package.markdown,/New page proposal/);
});

// ---- Browser contract: the page the owner sees and the files they download match the server JSON ----
class Stub{constructor(t){this.tagName=t;this.children=[];this.handlers={};this.attrs={};this._text='';this.hidden=false;this.disabled=false}
 appendChild(c){this.children.push(c);return c}remove(){}click(){this.handlers.click&&this.handlers.click()}
 addEventListener(e,f){this.handlers[e]=f}getAttribute(n){return this.attrs[n]??null}
 set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text}}
const allText=n=>[n._text,...n.children.map(allText)].join('\n');
const findAll=(n,pred,out=[])=>{if(pred(n))out.push(n);n.children.forEach(c=>findAll(c,pred,out));return out};
async function runUi(h,owner){
 const code=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
 const main=new Stub('main');main.attrs={'data-page-id':String(fx.tracked_page.id),'data-owner-draft':owner?'true':'false'};
 const el={};for(const id of ['growthAutomaticReport','researchStatus','retryResearch','downloadResearch'])el[id]=new Stub('div');
 const blobs=[],requests=[];
 class U extends URL{}U.createObjectURL=b=>{blobs.push(b);return 'blob:t'};U.revokeObjectURL=()=>{};
 const token=owner?'owner-token':'readonly-client-token';
 const ctx={document:{body:new Stub('body'),querySelector:()=>main,getElementById:i=>el[i]||null,createElement:t=>new Stub(t)},
  location:{pathname:'/track/'+token+'/growth/auto-research'},URL:U,Blob,encodeURIComponent,console,setTimeout:()=>{},
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async(url,opts={})=>{requests.push({url,method:opts.method||'GET'});
   const path=url.includes('/complete')?h.POST:h.GET,res=await h.invoke(path,token);
   return {ok:res.statusCode===200,json:async()=>res.body}}};
 vm.runInNewContext(code,ctx,{timeout:3000});
 for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));
 return {el,blobs,requests};
}
test('browser contract: owner sees decision, placement and proposed text; downloads equal the server result',async()=>{
 const h=harness({drafts:[draftFor('Repurpose what you already published',GOOD)]});
 const ui=await runUi(h,true);
 assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].method,'POST','owner flow starts the completion route directly, no client-only completion');
 const shown=allText(ui.el.growthAutomaticReport);
 assert.match(shown,/IMPROVE EXISTING/);assert.match(shown,/Placement:/);assert.match(shown,/Repurpose what you already published|Before commissioning anything new/);
 assert.match(shown,/NOT a proven ranking gain/);
 ui.el.downloadResearch.click();
 const json=JSON.parse(await ui.blobs[0].text());
 assert.equal(json.editorial_decision_gate.decision,'IMPROVE_EXISTING');assert.equal(json.editorial_decision_gate.copy_ready,true);
 assert.equal(json.editorial_review_draft.draft.sections[0].paragraphs[0],GOOD[0],'raw provider draft is preserved untouched');
 assert.equal(json.editorial_work_packet.editorial_decision.proposed_text,GOOD_SAFE.join('\n\n'),'the reviewed text is the guarded one');
 assert.equal(json.report_completion.status,'CONCRETE_EDIT_FOR_OWNER_REVIEW');
 const dl=findAll(ui.el.growthAutomaticReport,n=>n.tagName==='button'&&/owner package/.test(n._text))[0];
 assert(dl,'owner package download exists');dl.click();
 assert.equal(await ui.blobs[1].text(),json.handoff_package.markdown,'markdown download equals the server package');
 const ro=await runUi(harness(),false);
 assert.equal(ro.requests[0].method,'GET');ro.el.downloadResearch.click();
 const roJson=JSON.parse(await ro.blobs[0].text());assert.equal(roJson.editorial_review_draft.draft,null,'read-only export never contains a draft');
});
if(process.env.GROWTH_DUMP)test('dump (isolation-stub draft, offline fixture run)',async()=>{
 const h=harness({drafts:[draftFor('Repurpose what you already published',GOOD)]});
 const g=await h.invoke(h.GET),p=await h.invoke(h.POST,'owner-token');
 fs.writeFileSync(process.env.GROWTH_DUMP+'/fixture-run-decision.json',JSON.stringify({NOTE:'OFFLINE FIXTURE RUN derived from export 27 captured text; AI draft is an isolation stub; NOT live production evidence.',
  get_decision:g.body.editorial_decision_gate,serp_intent:g.body.serp_intent,coverage:g.body.reader_task_coverage},null,1));
 fs.writeFileSync(process.env.GROWTH_DUMP+'/fixture-run-owner-package.md','> OFFLINE FIXTURE RUN (export-27 captured text, isolation-stub draft). Not live, not production evidence.\n\n'+p.body.handoff_package.markdown);
});

test('real-world truncation: competitor captures cut at the 120 kB fetch limit still count as evidence of what they teach',async()=>{
 const h=harness({truncateCompetitors:true,drafts:[draftFor('Repurpose what you already published',GOOD)]});
 const g=await h.invoke(h.GET),cov=g.body.reader_task_coverage;
 assert.notEqual(g.body.editorial_decision_gate.decision,'DATA_BLOCKED','truncated competitors must not block the decision: '+JSON.stringify(g.body.editorial_decision_gate.missing_evidence)+JSON.stringify(cov.competitor_diagnostics));
 assert.equal(cov.competitor_diagnostics.used_partial_capture,2);assert.equal(cov.competitor_diagnostics.distinct_hosts,2);
 assert(cov.competitors_considered.every(c=>c.partial===true));
 assert.equal(g.body.editorial_decision_gate.decision,'IMPROVE_EXISTING');
 const p=await h.invoke(h.POST,'owner-token');
 assert.equal(p.body.report_completion.status,'CONCRETE_EDIT_FOR_OWNER_REVIEW');assert.equal(p.body.editorial_work_packet.editorial_decision.copy_ready,true);
});
test('a truncated DESTINATION still cannot support an absence claim and says exactly why',async()=>{
 const h=harness({truncateDestination:true}),g=await h.invoke(h.GET),d=g.body.editorial_decision_gate;
 assert.equal(d.decision,'DATA_BLOCKED');assert(d.missing_evidence.some(x=>x.code==='COMPLETE_DESTINATION_HTML'));
 assert.equal(h.providerCalls.length,0);
});

test('raw provider sections are labelled accepted or rejected everywhere they appear; rejected text never enters the proposal or the package',async()=>{
 const off=['Pricing pages should list every plan next to its monthly cost and show a clear comparison table for buyers.','Add a short note on how to contact sales for custom quotes and volume discounts.'];
 const make=body=>({canonical_url:DEST,status:'AI_DRAFT_REVIEW_REQUIRED',draft_source_type:'LIVE_PUBLIC_HTML',live_competitor_observations_used:3,
  draft:{seo_title:null,meta_description:null,sections:[{h2:'Tool pricing',paragraphs:off},{h2:'Repurpose what you already published',paragraphs:GOOD}]}});
 const h=harness({drafts:[make]}),r=await h.invoke(h.POST,'owner-token'),b=r.body;
 const raw=b.editorial_review_draft.draft.sections,packet=b.editorial_work_packet.generated_draft.sections;
 for(const list of [raw,packet]){
  assert.equal(list.find(s=>s.h2==='Tool pricing').review_status,'REJECTED_NOT_PART_OF_PROPOSAL');
  assert.equal(list.find(s=>s.h2==='Repurpose what you already published').review_status,'ACCEPTED_FOR_OWNER_REVIEW');
  assert(list.find(s=>s.h2==='Tool pricing').rejection_reasons.some(x=>x.code==='DRAFT_OFF_TASK'));
 }
 assert.equal(b.editorial_review_draft.draft.raw_provider_output,true);
 const d=b.editorial_work_packet.editorial_decision;
 assert.equal(d.copy_ready,true);assert(!d.proposed_text.includes('monthly cost'));assert.equal(d.improvement_plan.tasks.length,1,'only the verified task remains in the final decision');
 const md=b.handoff_package.markdown;
 assert.match(md,/Generated but rejected[\s\S]*Tool pricing[\s\S]*DRAFT_OFF_TASK/);assert(!md.includes('monthly cost'));
 assert.match(md,/### Change 1: Competitors teach “[^”]*[Rr]epurpos/);
});
