'use strict';
// Regressions built from production reports 11 (ContentScale /international-seo/) and 12 (PRT /wind-damage-roof-repair-nj/),
// both generated 2026-10-28. Fixtures are verbatim subsets (tests/fixtures/growth-reports-11-12/*). Anything synthetic is
// labelled SYNTHETIC in place. Root causes proven here:
//  R1 classifyTitle tested `best` (commercial) before `best practices` (informational): 2 of 9 informational SERP results
//     became COMMERCIAL_COMPARISON, agreement fell to 5/9 < 60% and the whole decision was DATA_BLOCKED (SERP_INTENT_EVIDENCE).
//  R2 the raw-byte cap (120 KB) of the public reader cut CMS pages inside their inline CSS/JS, so the destination was "truncated"
//     and every decision on it was DATA_BLOCKED (COMPLETE_DESTINATION_HTML), even where every task was observed.
//  R3 query selection ranked a locked topical page's GSC rows by impressions only, so a broader neighbour query
//     ("storm damage roof repair", avg. position 87) moved research off the wind-damage topic to another page.
//  R4 the market came from the query alone; a GSC query without "nj" lost the New Jersey scope, so Michigan pages were
//     read as competitors.
const test=require('node:test'),assert=require('node:assert/strict');
const r11=require('./fixtures/growth-reports-11-12/report-11-contentscale-international-seo.json');
const r12=require('./fixtures/growth-reports-11-12/report-12-prt-wind-damage.json');
const {inferSerpIntent,classifyTitle,classifyDestinationIntent}=require('../src/growth-reader-task-coverage.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const {selectGrowthQuery}=require('../src/growth-query-selection.cjs');
const {deriveMarket,rejectLead,marketRelevance}=require('../src/growth-serp-quality.cjs');
const {optionalGoogleOrganicDiscovery,parseSerperGoogleOrganic}=require('../src/growth-public-search-discovery.cjs');
const {fetchPublicGrowthHtml,compactPublicHtml}=require('../src/growth-public-html-reader.cjs');
const {renderPublicGrowthPage}=require('../src/growth-safe-browser-renderer.cjs');
const {deriveEvidenceStatus}=require('../src/growth-evidence-status.cjs');
const {decideOwnerGrowthEdit}=require('../src/growth-owner-edit-decision.cjs');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {EventEmitter}=require('node:events');

const gate=(r,over={})=>{
 const serpIntent=over.serpIntent||inferSerpIntent({query:r.search_discovery.target_query,leads:r.search_discovery.leads});
 return decideGrowthEditorialAction({report:r,destination:r.destination_section_comparison,coverage:over.coverage||r.reader_task_coverage,
  serpIntent,destinationIntent:over.destinationIntent||r.destination_intent,attempts:r.editorial_decision_gate.attempted_sources});
};

// ---------- Report 11: an informational query without GSC ----------
test('R11 production outcome is documented by the real report',()=>{
 assert.equal(r11.editorial_decision_gate.decision,'DATA_BLOCKED');assert.equal(r11.editorial_decision_gate.blocker_code,'SERP_INTENT_EVIDENCE');
 assert.equal(r11.serp_intent.agreeing_leads,5);assert.equal(r11.serp_intent.organic_leads_considered,9);
 assert.equal(r11.serp_intent.leads[0].class,'COMMERCIAL_COMPARISON','the old classifier read "Best Practices" as a product comparison');
 assert.equal(r11.query_selection.source,'TRACKER_KEYWORD');assert.deepEqual(r11.search.verified_queries,[],'no GSC');
});
test('1. R11 real SERP: "best practices", "getting started" and "quick reference" are informational; intent is established without GSC',()=>{
 for(const t of ['International SEO Best Practices','International SEO: Best Practices for Global Online Success','Getting Started In International SEO: A Quick Reference ...'])
  assert.equal(classifyTitle(t),'INFORMATIONAL_GUIDE',t);
 assert.equal(classifyTitle('Best CRM Software vs Rivals'),'COMMERCIAL_COMPARISON','a real comparison stays commercial');
 assert.equal(classifyTitle('Top 10 Invoice Tools Compared'),'COMMERCIAL_COMPARISON');
 const serp=inferSerpIntent({query:'international seo',leads:r11.search_discovery.leads});
 assert.equal(serp.status,'SERP_INTENT_OBSERVED');assert.equal(serp.intent,'INFORMATIONAL_GUIDE');
 assert(serp.agreeing_leads/serp.organic_leads_considered>=0.6);
 // Not a query exception: a SYNTHETIC SaaS SERP with the same title shapes gives the same result.
 const saas=inferSerpIntent({query:'invoice automation',leads:['Invoice Automation Best Practices','Invoice Automation: Best Practices for Finance Teams','Getting Started With Invoice Automation','What Is Invoice Automation?'].map((title,i)=>({url:'https://s'+i+'.example/a',title}))});
 assert.equal(saas.intent,'INFORMATIONAL_GUIDE');
});
test('1b. A title the patterns cannot read is classified from the H1 of the page that was actually read',()=>{
 const leads=[{url:'https://a.example/x',title:'International SEO'},{url:'https://b.example/y',title:'International SEO'},{url:'https://c.example/z',title:'What is international SEO?'}];
 const without=inferSerpIntent({query:'international seo',leads});
 assert.equal(without.status,'SERP_INTENT_NOT_ESTABLISHED');assert.match(without.reason,/No intent reaches 60% of 3/);
 const pages=[{url:'https://a.example/x',html:'<h1>How to plan international SEO</h1>'},{url:'https://b.example/y',html:'<h1>International SEO checklist</h1>'}];
 const withPages=inferSerpIntent({query:'international seo',leads,pages});
 assert.equal(withPages.status,'SERP_INTENT_OBSERVED');assert.equal(withPages.pages_used_for_classification,2);
 assert.equal(withPages.method,'TITLE_AND_SNIPPET_PATTERNS_PLUS_H1_OF_READ_PAGES');
});
test('2. R11 real coverage: the measurement task missing on the compatible destination becomes IMPROVE_EXISTING (observed, not yet verified)',()=>{
 const serp=inferSerpIntent({query:'international seo',leads:r11.search_discovery.leads});
 const h=r11.page_content.headings;
 const dest=classifyDestinationIntent({query:'international seo',title:h.title,h1:h.h1,url:r11.url,serpIntent:serp.intent});
 assert.equal(dest.verdict,'COMPATIBLE');
 const d=gate(r11,{serpIntent:serp,destinationIntent:dest});
 assert.equal(d.decision,'IMPROVE_EXISTING');assert.equal(d.target_url,r11.url);
 assert.deepEqual(d.improvement_plan.tasks.map(t=>t.code),['task_analyz']);
 assert(!d.improvement_plan.tasks.some(t=>t.code==='task_cultur'),'a task the page already teaches is not proposed');
 assert.equal(d.gap_observed,true);assert.equal(d.verified_gap,false);assert.equal(d.copy_ready,false,'copy only after a draft passes the checks');
 assert.equal(d.evidence_status.search_intent_confirmed,true);assert.equal(d.evidence_status.missing_task_established,true);
 assert.equal(d.evidence_status.draft_checked,false);assert.equal(d.evidence_status.publication_approved,false);
});
test('2b. A genuinely mixed SERP still blocks, and the blocker states the observed counts instead of a fixed sentence',()=>{
 const leads=['Best CRM Software vs Rivals','What Is a CRM?','CRM Repair in Lodi, NJ','CRM Pricing Plans','How to choose a CRM'].map((title,i)=>({url:'https://m'+i+'.example/',title}));
 const serp=inferSerpIntent({query:'crm',leads});
 assert.equal(serp.status,'SERP_INTENT_NOT_ESTABLISHED');
 const d=gate(r11,{serpIntent:serp});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'SERP_INTENT_EVIDENCE');
 assert.match(d.missing_evidence[0].detail,/classes: COMMERCIAL_COMPARISON 2/);assert.equal(d.missing_evidence[0].observed.considered,5);
});

// ---------- Report 12: destination selection, market and NO_CHANGE ----------
const now=new Date('2026-10-28T06:33:00Z');
const inv=r12.site_architecture.candidates.map((c,i)=>({id:9000+i,url:c.url,keyword:c.tracked_keyword}));
const WIND_SIBLING='https://perfectroofingteam.com/emergency-roofing/wind-damage-roof-repair/';
test('R12 production outcome is documented by the real report',()=>{
 assert.equal(r12.original_tracked_keyword,'wind damage roof repair nj');assert.equal(r12.case_study_locked,true);
 assert.equal(r12.query_selection.query,'storm damage roof repair');assert.equal(r12.query_selection.destination.url,'https://perfectroofingteam.com/emergency-roofing/storm-damage-roof-repair/');
 assert.equal(r12.editorial_decision_gate.blocker_code,'COMPLETE_DESTINATION_HTML');
 assert(r12.search_discovery.leads.some(l=>/Michigan/.test(l.title)),'Michigan pages were read as competitors');
});
test('4. R12 real GSC rows: a locked wind-damage page moves to the wind sibling, not to the broader storm page',()=>{
 const s=selectGrowthQuery({page:{id:r12.page_id,url:r12.url,keyword:r12.original_tracked_keyword,case_study_active:true},queries:r12.search.verified_queries,headings:r12.page_content.headings,inventory:inv,now});
 assert.equal(s.query,'roof wind damage repair');assert.equal(s.destination.url,WIND_SIBLING);
 assert.notEqual(s.destination.url,r12.url,'a locked Case Study is never the edit target');
 assert.equal(s.ranking_basis,'SOURCE_PAGE_TOPIC_ALIGNMENT_THEN_IMPRESSIONS');
 assert.equal(s.surfacing_signal.type,'SOURCE_PAGE_SURFACES_FOR_QUERY_OWNED_BY_ANOTHER_PAGE','source rows are never presented as destination data');
 assert(s.other_candidates.every(x=>x.source_topic_alignment>=0.8),'wind-topic rows rank ahead of the broader storm row');
 assert(!s.excluded.some(x=>x.query==='storm damage roof repair'),'the larger query is ranked lower, not discarded');
});
test('4b. The same page unlocked keeps its own query; the sibling is reported as possible overlap',()=>{
 const s=selectGrowthQuery({page:{id:r12.page_id,url:r12.url,keyword:r12.original_tracked_keyword,case_study_active:false},queries:r12.search.verified_queries,headings:r12.page_content.headings,inventory:inv,now});
 assert.equal(s.destination.url,r12.url);assert.equal(s.destination.basis,'SOURCE_PAGE_TOPIC_COVERS_QUERY');
 assert(s.destination.competing_same_site_pages.includes(WIND_SIBLING));assert.equal(s.surfacing_signal,null);
});
test('4c. A homepage keeps hub behaviour: its GSC query still goes to the dedicated tracked page (SYNTHETIC)',()=>{
 const fresh=new Date(now-2*86400000).toISOString();
 const s=selectGrowthQuery({page:{id:1,url:'https://acme-plumbing.example/',keyword:'acme plumbing'},now,
  queries:[{query:'drain cleaning hoboken nj',impressions:640,clicks:1,position:18,imported_at:fresh}],headings:{title:'Acme Plumbing',h1:['Acme Plumbing']},
  inventory:[{id:2,url:'https://acme-plumbing.example/drain-cleaning-hoboken-nj/',keyword:'drain cleaning hoboken nj'}]});
 assert.equal(s.destination.url,'https://acme-plumbing.example/drain-cleaning-hoboken-nj/');assert.equal(s.ranking_basis,'IMPRESSIONS');
});
test('5. R12 real leads: the source page market (NJ) applies to a query without a place; other-state providers are not competitors',()=>{
 const market=deriveMarket({query:'roof wind damage repair',keyword:r12.original_tracked_keyword,url:r12.url});
 assert.deepEqual(market.states,['NJ']);assert.equal(market.location,'New Jersey, United States');
 const kept=r12.search_discovery.leads.filter(l=>!rejectLead({query:'storm damage roof repair',lead:l,ownHost:'perfectroofingteam.com',marketStates:market.states}));
 assert(!kept.some(l=>/Michigan/i.test(l.title+' '+l.snippet)),'Michigan pages are rejected');
 assert(kept.some(l=>/thisoldhouse/.test(l.url)),'a general guide that names no place stays as a general source');
 assert.equal(marketRelevance(kept.find(l=>/thisoldhouse/.test(l.url)),market.states),'NO_REGION_STATED_GENERAL_SOURCE');
 assert.equal(marketRelevance({title:'Wind Damage Roof Repair in Paterson, NJ'},market.states),'SAME_MARKET');
 assert.equal(deriveMarket({query:'international seo',keyword:'international seo',url:r11.url}),null,'no US place, no market filter');
});
test('5b. Serper.dev is asked for the source page market via its location parameter (no other provider)',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({organic:[
  {title:'Wind Damage Roof Repair in Paterson, NJ',link:'https://nj-roofer.example/wind',position:1},
  {title:'Wind Damage Roof Repair in Detroit, MI',link:'https://mi-roofer.example/wind',position:2},
  {title:'How to Spot Wind Damage on a Roof',link:'https://guide.example/wind',position:3}]})}};
 const market=deriveMarket({query:'roof wind damage repair',keyword:'wind damage roof repair nj',url:r12.url});
 const r=await optionalGoogleOrganicDiscovery({query:'roof wind damage repair',ownUrl:r12.url,market,fetchImpl,key:'test-key'});
 assert.equal(calls[0].url,'https://google.serper.dev/search');assert.equal(calls[0].body.location,'New Jersey, United States');
 // Only two comparable leads survived the market filter: exactly one extra Serper call names the market in the query.
 assert.equal(calls.length,2);assert.equal(calls[1].body.q,'roof wind damage repair New Jersey');assert.equal(r.market_query_retry.query,'roof wind damage repair New Jersey');
 assert.deepEqual(r.leads.map(l=>l.url),['https://nj-roofer.example/wind','https://guide.example/wind']);
 assert.deepEqual(r.leads.map(l=>l.market_relevance),['SAME_MARKET','NO_REGION_STATED_GENERAL_SOURCE']);
 assert(r.rejected_leads.some(x=>x.reason==='DIFFERENT_REGION:MI'));assert.equal(r.scope.location,'New Jersey, United States');
 const noMarket=parseSerperGoogleOrganic({organic:[{title:'Wind Damage Roof Repair in Detroit, MI',link:'https://mi-roofer.example/wind'}]},{query:'roof wind damage repair'});
 assert.equal(noMarket.length,1,'without a market nothing is filtered by place');
});
// Coverage restricted to the competitors a market-scoped run would keep (the Michigan hosts removed): what is left is evidence.
const withoutHosts=(cov,drop)=>{
 const keep=c=>!drop.includes(c.host);
 const tasks=cov.tasks.map(t=>{const support=t.competitor_support.filter(keep);const hosts=new Set(support.map(x=>x.host)).size;
  return {...t,competitor_support:support,independent_sources:hosts,supported_by_competitors:hosts>=2}});
 const cons=cov.competitors_considered.filter(keep);
 return {...cov,competitors_considered:cons,competitor_diagnostics:{...cov.competitor_diagnostics,used:cons.length,distinct_hosts:new Set(cons.map(c=>c.host)).size},tasks};
};
test('3. R12 real coverage: every shared task observed on the destination reaches NO_CHANGE although the capture was cut',()=>{
 const serp=inferSerpIntent({query:'storm damage roof repair',leads:r12.search_discovery.leads});
 assert.equal(serp.status,'SERP_INTENT_OBSERVED');assert.equal(serp.intent,'LOCAL_SERVICE');
 assert.equal(r12.reader_task_coverage.destination_truncated,true);
 const d=gate(r12,{serpIntent:serp});
 assert.equal(d.decision,'NO_CHANGE');assert.match(d.reason,/every task was found before the cut/);
 assert.equal(d.evidence_status.destination_fully_examined,false,'the ladder still says the page was not read completely');
 assert(d.closure_report.tasks_checked.every(t=>t.destination_status==='COVERED'));
});
test('3b. R12 with only same-market evidence: fewer than two readable competitor sites is DATA_BLOCKED, never a silent NO_CHANGE',()=>{
 const serp=inferSerpIntent({query:'storm damage roof repair',leads:r12.search_discovery.leads});
 const cov=withoutHosts(r12.reader_task_coverage,['concraft.com','michigan-roofing.com','schoenherrroofing.com']);
 const d=gate(r12,{serpIntent:serp,coverage:cov});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'READABLE_COMPETITOR_ARTICLES');
});
test('7. An incomplete destination blocks a gap claim but not a proven presence (SYNTHETIC coverage)',()=>{
 const serp={status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE',agreeing_leads:3,organic_leads_considered:3,leads:[]};
 const task=(code,status)=>({code,label:code,match:{key:code,co_terms:[]},supported_by_competitors:true,independent_sources:2,
  competitor_support:[{url:'https://a.example/',host:'a.example',heading:'h',excerpt:'x'.repeat(90)},{url:'https://b.example/',host:'b.example',heading:'h',excerpt:'y'.repeat(90)}],
  destination:{status,passages:status==='COVERED'?[{heading:'h',text:'t'}]:[]},covered_elsewhere_on_site:[],placement:null});
 const cov=tasks=>({destination_truncated:true,destination_sections:[{heading:'h',words:200}],competitors_considered:[{url:'https://a.example/',host:'a.example',partial:false},{url:'https://b.example/',host:'b.example',partial:false}],
  competitor_diagnostics:{distinct_hosts:2},tasks,unverifiable_site_pages:[]});
 const run=c=>decideGrowthEditorialAction({report:{url:'https://own.example/p/',growth_decision:{primary_next_action:{query:'q'},protection:{}}},
  destination:{target_url:'https://own.example/p/',status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},coverage:c,serpIntent:serp,destinationIntent:{verdict:'COMPATIBLE',class:'INFORMATIONAL_GUIDE'}});
 const gap=run(cov([task('task_a','COVERED'),task('task_b','NOT_OBSERVED')]));
 assert.equal(gap.decision,'DATA_BLOCKED');assert.equal(gap.blocker_code,'COMPLETE_DESTINATION_HTML');assert.match(gap.missing_evidence[0].detail,/task_b/);
 assert.equal(run(cov([task('task_a','COVERED')])).decision,'NO_CHANGE');
 const partialComp=cov([task('task_a','COVERED')]);partialComp.competitors_considered[1].partial=true;
 assert.equal(run(partialComp).blocker_code,'COMPLETE_COMPETITOR_HTML','NO_CHANGE needs two complete competitor captures');
});

// ---------- Reading pages: inline CSS/JS no longer hides the article ----------
const bigPage=()=>'<!doctype html><html><head><title>Wind Damage Roof Repair NJ</title><link rel="canonical" href="https://own.example/wind/"><link rel="stylesheet" href="/a.css">'+
 '<style>'+'.x{color:red}'.repeat(30000)+'</style><script>'+'var a=1;'.repeat(20000)+'</script><script type="application/ld+json">{"@type":"Article"}</script></head>'+
 '<body><svg>'+'<path d="M0 0"/>'.repeat(5000)+'</svg><h1 style="color:red">Wind damage roof repair</h1><h2>Insurance claim help</h2><p>Article text that a reader actually sees on the page.</p></body></html>';
const mockHttps=body=>({request(url,opts,cb){const req=new EventEmitter();req.end=()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};
 res.resume=()=>{};res.destroy=()=>{};cb(res);const buf=Buffer.from(body);for(let i=0;i<buf.length;i+=65536)res.emit('data',buf.subarray(i,i+65536));res.emit('end')};req.destroy=()=>{};return req}});
const lookup=async()=>[{address:'93.184.216.34',family:4}];
test('6a. Research reads compact inline CSS/JS/SVG: the article after 400 KB of page furniture is read completely',async()=>{
 const body=bigPage();assert(body.length>400000);
 const raw=await fetchPublicGrowthHtml('https://own.example/wind/',{lookup,httpsModule:mockHttps(body)});
 assert.equal(raw.truncated,true,'the default (CMS export) read is unchanged: raw cap');assert(!/Insurance claim help/.test(raw.html));
 const research=await fetchPublicGrowthHtml('https://own.example/wind/',{lookup,httpsModule:mockHttps(body),compact:true,limit:300000});
 assert.equal(research.truncated,false);assert.match(research.html,/<h2>Insurance claim help<\/h2>/);
 assert.match(research.html,/rel="canonical"/);assert.match(research.html,/application\/ld\+json/);assert(!/stylesheet|<style|var a=1/.test(research.html));
 assert(compactPublicHtml('<p data-x="1" style="a">Hi</p>')==='<p>Hi</p>');
});
test('6b. A JavaScript page rendered in the restricted browser is compacted the same way before the cap',async()=>{
 const body=bigPage();
 const fakePuppeteer={launch:async()=>({newPage:async()=>({setRequestInterception:async()=>{},on(){},goto:async()=>{},content:async()=>body,url:()=>'https://own.example/wind/'}),close:async()=>{}})};
 const r=await renderPublicGrowthPage('https://own.example/wind/',{puppeteer:fakePuppeteer,lookup});
 assert.equal(r.status,'BROWSER_RENDERED_SAME_ORIGIN');assert.equal(r.live.truncated,false);assert.match(r.live.html,/Insurance claim help/);
});

// ---------- Safety, protection and one evidence status ----------
test('8. A locked Case Study with a winning protected query stays NO_CHANGE and nothing is publishable',()=>{
 const report={...r11,growth_decision:{primary_next_action:{query:'international seo'},protection:{case_study_locked:true},
  protected_queries:[{query:'international seo',position:2,clicks:40,impressions:900}]}};
 const d=decideGrowthEditorialAction({report,destination:{target_url:r11.url},coverage:r11.reader_task_coverage,serpIntent:inferSerpIntent({query:'international seo',leads:r11.search_discovery.leads}),destinationIntent:r11.destination_intent});
 assert.equal(d.decision,'NO_CHANGE');assert.equal(d.decision_scope,'PROTECTED_WINNING_QUERY');assert.equal(d.publish_allowed,false);assert.equal(d.case_study_locked,true);
});
test('9. Unproven business and safety claims are rejected by the claim guard',()=>{
 const r=assessDraftClaims({text:'Our licensed and insured crew arrives within 30 minutes anywhere in Bergen County, and a sagging roof is always safe to leave until Monday.',
  destinationText:'We repair wind damaged roofs in New Jersey.',query:'wind damage roof repair',brandLabel:'perfectroofingteam'});
 const codes=r.violations.map(v=>v.code);
 for(const c of ['UNSUPPORTED_SAFETY_ASSURANCE','UNSOURCED_CREDENTIAL_CLAIM','UNSOURCED_NUMBER'])assert(codes.includes(c),c);
});
test('10. copy_ready follows the producer: a draft the producer did not verify is never reviewable copy',()=>{
 const base={decision:'IMPROVE_EXISTING',focus_query:'international seo',target_url:r11.url,verified_gap:false,gap_observed:true,facts:[],uncertainties:[],evidence:[],
  improvement_plan:{target_url:r11.url,tasks:[{code:'task_analyz',label:'x',match:{key:'analyz',co_terms:['traffi'],concepts:['analyz','traffi','measur','perfor']},placement:{mode:'ADD_AFTER_SECTION',section_heading:'s'},competitor_evidence:[],destination_evidence:[]}]}};
 const section={h2:'Analyze traffic by country',task_code:'task_analyz',paragraphs:['Analyze the traffic each country sends before and after launch: measure organic visits, track performance per market and compare how traffic from each market changes over time.']};
 const d=decideOwnerGrowthEdit({report:{reader_task_coverage:{},editorial_decision_gate:base},completion:{draft:{sections:[section]}},sources:{destinationHtml:'<p>Hreflang tells search engines which page targets which country.</p>'}});
 assert.equal(d.copy_ready,false);assert.equal(d.copy_status,'DRAFT_NOT_VERIFIED_BY_PRODUCER');
 const st=deriveEvidenceStatus({decision:d,serpIntent:{status:'SERP_INTENT_OBSERVED'},coverage:r11.reader_task_coverage});
 assert.equal(st.draft_checked,false);assert.equal(st.copy_ready,false);assert.equal(st.verified_gap,false);assert.equal(st.label,'TASK_GAP_OBSERVED_DRAFT_NOT_VERIFIED');
 const ok=deriveEvidenceStatus({decision:{decision:'IMPROVE_EXISTING',gap_observed:true,verified_gap:true,copy_ready:true},serpIntent:{status:'SERP_INTENT_OBSERVED'},coverage:r11.reader_task_coverage});
 assert.equal(ok.draft_checked,true);assert.equal(ok.factual_claims_confirmed,false);assert.equal(ok.publication_approved,false);
 const blocked=deriveEvidenceStatus({decision:{decision:'DATA_BLOCKED',copy_ready:true,verified_gap:true}});
 assert.equal(blocked.copy_ready,false,'a blocked decision can never carry copy_ready');
});

// ---------- Real GET route (SYNTHETIC local site): market reaches search, same-market pages are read first, reads are compacted ----------
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
test('5c. GET route: the source page market is passed to search, same-market competitors are fetched first, research reads are compacted',async()=>{
 const SRC='https://acme-roofing.example/wind-damage-roof-repair-nj/';
 const route={},searchArgs=[],fetchCalls=[];
 const db={async query(sql){
  if(/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))throw Error('no writes');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:7,tracker_client_id:4,url:SRC,keyword:'wind damage roof repair nj',saved_html:''}]};
  return {rows:[]};
 }};
 const page=(h1,secs)=>'<html><head><title>'+h1+'</title></head><body><h1>'+h1+'</h1>'+secs.map(([h,p])=>'<h2>'+h+'</h2><p>'+p+'</p>').join('')+'</body></html>';
 const filler='Inspect the shingles, flashing and ridge after every strong wind event and write down what changed since the previous inspection.';
 const html={[SRC]:page('Wind Damage Roof Repair NJ',[['Signs of wind damage',filler+' '+filler]])};
 const fetchLive=async(url,opts)=>{fetchCalls.push({url,opts});const body=html[url]||page('Wind damage roof repair',[['Insurance claim documentation',filler+' '+filler]]);
  return {html:body,final_url:url,retrieved_at:'2026-10-28T06:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}};
 const searchLive=async args=>{searchArgs.push(args);return {status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:args.query,checked_at:'2026-10-28T06:00:00Z',provider_attempts:['SERPER_GOOGLE_ORGANIC'],leads:[
  {url:'https://guide.example/wind',title:'How to Spot Wind Damage on a Roof',source:'SERPER_GOOGLE_ORGANIC',serp_position:1,market_relevance:'NO_REGION_STATED_GENERAL_SOURCE'},
  {url:'https://nj-one.example/wind',title:'Wind Damage Roof Repair in Paterson, NJ',source:'SERPER_GOOGLE_ORGANIC',serp_position:2,market_relevance:'SAME_MARKET'},
  {url:'https://nj-two.example/wind',title:'Wind Damage Roof Repair in Newark, NJ',source:'SERPER_GOOGLE_ORGANIC',serp_position:3,market_relevance:'SAME_MARKET'},
  {url:'https://nj-three.example/wind',title:'Wind Damage Roof Repair in Trenton, NJ',source:'SERPER_GOOGLE_ORGANIC',serp_position:4,market_relevance:'SAME_MARKET'}]}};
 const mw=(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:false,pages:[{id:7,url:SRC,keyword:'wind damage roof repair nj',case_study_active:false}]};next()};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(){}},db,mw,{fetchLive,searchLive,renderOwn:async()=>({status:'RENDER_UNAVAILABLE',live:null})});
 const res={statusCode:200,set(){return this},status(x){this.statusCode=x;return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'],req={params:{token:'t'},query:{page_id:'7'}};
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.equal(res.statusCode,200,JSON.stringify(res.body));
 assert.deepEqual(searchArgs[0].market.states,['NJ']);assert.equal(searchArgs[0].market.location,'New Jersey, United States');
 assert.deepEqual(res.body.search_discovery.market.states,['NJ']);
 const competitorFetches=fetchCalls.filter(c=>c.url!==SRC).map(c=>c.url);
 assert.deepEqual(competitorFetches.slice(0,3),['https://nj-one.example/wind','https://nj-two.example/wind','https://nj-three.example/wind'],'same-market pages are read before a general guide');
 assert(fetchCalls.every(c=>c.opts&&c.opts.compact===true),'every research read uses the compacted reader');
 assert.equal(res.body.intent_resolution.source,'TRACKER_KEYWORD');
 assert(res.body.editorial_decision_gate.evidence_status,'GET decision carries the evidence ladder');
 assert.equal(res.body.editorial_decision_gate.copy_ready,false);
});

// ---------- Report 14 (production run after PR #191): the route retargeted a wind query to a storm page ----------
const r14=require('./fixtures/growth-reports-11-12/report-14-prt-wind-damage-after-191.json');
test('R14 production outcome: market and selection were right, then retargeting jumped to a page on another topic',()=>{
 assert.equal(r14.query_selection.query,'roof wind damage repair');assert.equal(r14.query_selection.destination.url,WIND_SIBLING);
 assert.deepEqual(r14.search_discovery.market.states,['NJ']);
 assert.equal(r14.destination_intent.retargeted_from,WIND_SIBLING);assert.equal(r14.destination_intent.url,'https://perfectroofingteam.com/storm-damage-roof-repair-nj/');
 assert.equal(r14.editorial_decision_gate.blocker_code,'COMPLETE_DESTINATION_HTML');
});
test('11. The storm page lacks the topic root "wind": it is never a compatible home for the wind query',()=>{
 const storm=classifyDestinationIntent({query:'roof wind damage repair',title:'Storm Damage Roof Repair NJ: 7 Steps to Avoid Costly Damage',h1:['Storm Damage Roof Repair NJ — 7 Steps to Restore Your Home Fast'],
  url:'https://perfectroofingteam.com/storm-damage-roof-repair-nj/',serpIntent:'INFORMATIONAL_GUIDE'});
 assert.equal(storm.verdict,'COMPATIBLE','same page type…');assert.deepEqual(storm.missing_query_roots,['wind'],'…but another topic');
 const wind=classifyDestinationIntent({query:'roof wind damage repair',title:'Wind Damage Roof Repair: 5 Steps',h1:['Repairing wind damage'],url:'https://x.example/wind-damage-roof-repair/',serpIntent:'INFORMATIONAL_GUIDE'});
 assert.deepEqual(wind.missing_query_roots,[]);
});
// SYNTHETIC route run shaped like report 14: locked wind source, wind service sibling (designated), storm guide, optional wind guide.
async function runPrtLike({withWindGuide=false}={}){
 const SRC='https://roofer.example/wind-damage-roof-repair-nj/',SIB='https://roofer.example/emergency-roofing/wind-damage-roof-repair/',
  STORM='https://roofer.example/storm-damage-roof-repair-nj/',GUIDE='https://roofer.example/wind-damage-roof-guide/';
 const route={};const fresh=new Date(Date.now()-3*86400000).toISOString();
 const inventory=[{id:21,url:SIB,keyword:'roof wind damage repair'},{id:22,url:STORM,keyword:'storm damage roof repair nj'},...(withWindGuide?[{id:23,url:GUIDE,keyword:'wind damage roof guide'}]:[])];
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))throw Error('no writes');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:7,tracker_client_id:4,url:SRC,keyword:'wind damage roof repair nj',saved_html:''}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:args[1]===7?[{page_id:7,tracker_client_id:4,source_page_url:SRC,evidence_scope:'page_verified',query:'roof wind damage repair',impressions:291,clicks:0,position:44,imported_at:fresh}]:[]};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:inventory};
  return {rows:[]};
 }};
 const pg=(title,h1,secs)=>'<html><head><title>'+title+'</title></head><body><h1>'+h1+'</h1>'+secs.map(([h,p])=>'<h2>'+h+'</h2><p>'+p+'</p>').join('')+'</body></html>';
 const para='Walk around the house after the storm passes and note lifted shingles, bent flashing and granules collecting in the gutters before calling anyone.';
 const html={[SRC]:pg('Wind Damage Roof Repair NJ | 2-Hour Emergency Response','Storm & Wind Damage Roof Repair in New Jersey',[['Wind damage signs',para]]),
  [SIB]:pg('Wind Damage Roof Repair NJ | Emergency Roofing Company','Wind Damage Roof Repair Company',[['Our wind repair service',para]]),
  [STORM]:pg('Storm Damage Roof Repair NJ: 7 Steps to Avoid Costly Damage','Storm Damage Roof Repair NJ — 7 Steps',[['Types of storm damage',para]]),
  [GUIDE]:pg('Wind Damage Roof Repair Guide: Steps for Homeowners','How to repair wind damage on a roof',[['Wind damage signs',para]])};
 const fetchLive=async url=>{const body=html[url]||pg('Wind damage roof repair guide','How to repair wind damage',[['Insurance documentation',para+' '+para]]);
  return {html:body,final_url:url,retrieved_at:'2026-10-28T20:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}};
 const searchLive=async args=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:args.query,provider_attempts:['SERPER_GOOGLE_ORGANIC'],leads:
  ['How to Fix Wind Damage on a Roof','Wind Damage Roof Repair Guide','Signs of Wind Damage: A Checklist'].map((title,i)=>({url:'https://g'+i+'.example/w',title,source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}))});
 const mw=(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:false,pages:[{id:7,url:SRC,keyword:'wind damage roof repair nj',case_study_active:true}]};next()};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(){}},db,mw,{fetchLive,searchLive,renderOwn:async()=>({status:'RENDER_UNAVAILABLE',live:null})});
 const res={statusCode:200,set(){return this},status(x){this.statusCode=x;return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'],req={params:{token:'t'},query:{page_id:'7'}};
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.equal(res.statusCode,200,JSON.stringify(res.body));
 return {b:res.body,SRC,SIB,STORM,GUIDE};
}
test('11b. Route: a service-type wind destination is not retargeted to a storm guide; the storm page is reported as another topic',async()=>{
 const {b,SIB,STORM}=await runPrtLike();
 assert.equal(b.query_selection.destination.url,SIB);
 assert.notEqual(b.editorial_decision_gate.target_url,STORM);assert.notEqual(b.destination_intent.url,STORM);
 assert(b.site_architecture.same_type_pages_on_another_topic.some(x=>x.url===STORM&&x.missing_query_roots.includes('wind')));
 assert(!b.site_architecture.compatible_existing_pages.some(x=>x.url===STORM));
});
test('11c. Route: when a same-topic wind guide exists it is the retarget; a locked source is never the edit target',async()=>{
 const {b,SIB,GUIDE,SRC}=await runPrtLike({withWindGuide:true});
 assert.equal(b.destination_intent.retargeted_from,SIB);assert.equal(b.destination_intent.url,GUIDE);assert.equal(b.editorial_decision_gate.target_url,GUIDE);
 assert.notEqual(b.editorial_decision_gate.target_url,SRC);
});
test('6c. Page-builder attribute soup and data URIs are removed; an incomplete capture names its cause',async()=>{
 const soup='<html><head><title>T</title></head><body>'+('<div class="'+'elementor-col-50 e-con '.repeat(40)+'" data-settings="{&quot;a&quot;:1}" aria-hidden="false"><img src="data:image/png;base64,'+'A'.repeat(3000)+'" srcset="a.jpg 1x, b.jpg 2x"></div>').repeat(400)+
  '<h2 id="claims">Insurance claim help</h2><p>Readable text after the page-builder markup.</p></body></html>';
 assert(soup.length>1500000);
 const r=await fetchPublicGrowthHtml('https://own.example/p/',{lookup,httpsModule:mockHttps(soup),compact:true,limit:600000});
 assert.equal(r.truncated,false);assert.match(r.html,/<h2 id="claims">Insurance claim help<\/h2>/);assert.equal(r.capture.cause,null);
 const cut=await fetchPublicGrowthHtml('https://own.example/p/',{lookup,httpsModule:mockHttps('<p>'+'word '.repeat(200000)+'</p>'),compact:true,limit:600000});
 assert.equal(cut.truncated,true);assert.equal(cut.capture.cause,'READABLE_HTML_EXCEEDED_LIMIT');
 const d=decideGrowthEditorialAction({report:{url:'https://own.example/p/',growth_decision:{primary_next_action:{query:'q'},protection:{}}},destination:{target_url:'https://own.example/p/'},
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE'},destinationIntent:{verdict:'COMPATIBLE'},
  coverage:{destination_truncated:true,destination_capture:cut.capture,competitors_considered:[{host:'a.example'},{host:'b.example'}],competitor_diagnostics:{distinct_hosts:2},
   tasks:[{code:'task_x',label:'x',supported_by_competitors:true,independent_sources:2,competitor_support:[],destination:{status:'NOT_OBSERVED',passages:[]},covered_elsewhere_on_site:[]}]}});
 assert.equal(d.blocker_code,'COMPLETE_DESTINATION_HTML');assert.match(d.missing_evidence[0].detail,/readable HTML \d+ characters/);
});

// ---------- Report 16 (production run after PR #192): a new page without shared tasks, and a sibling that IS the source ----------
const r16=require('./fixtures/growth-reports-11-12/report-16-prt-wind-damage-after-192.json');
const {produceVerifiedEditorialOpportunity}=require('../src/growth-verified-opportunity.cjs');
test('R16 production outcome: NEW_DISTINCT_PAGE with zero shared tasks, producer "verified" but gate ignored it',()=>{
 assert.equal(r16.editorial_decision_gate.decision,'NEW_DISTINCT_PAGE');assert.deepEqual(r16.reader_task_coverage.tasks,[]);
 assert.equal(r16.verified_opportunity_status.status,'VERIFIED_NEW_DISTINCT_PAGE');assert.equal(r16.editorial_decision_gate.copy_ready,false);
 assert.equal(r16.destination_intent.url,'https://perfectroofingteam.com/emergency-roofing/wind-damage-roof-repair/');
 const srcHead=[r16.page_content.headings.title,...r16.page_content.headings.h1].join(' | ').toLowerCase();
 assert.equal(r16.destination_intent.observed_head,srcHead,'the "sibling" served the locked source page title and H1');
});
test('12. R16 real coverage: without a task shared by two competitors no new page is proposed (DATA_BLOCKED with diagnosis)',()=>{
 const d=decideGrowthEditorialAction({report:r16,destination:r16.destination_section_comparison,coverage:r16.reader_task_coverage,
  serpIntent:r16.serp_intent,destinationIntent:r16.destination_intent,attempts:r16.editorial_decision_gate.attempted_sources});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
 assert.match(d.missing_evidence[0].detail,/reconroof\.com/);assert.equal(d.evidence_status.missing_task_established,false);
});
test('12b. The producer never calls a new-page draft verified without shared-task evidence',()=>{
 const gate={decision:'NEW_DISTINCT_PAGE',focus_query:'roof wind damage repair',target_url:'https://x.example/a/',new_page_plan:{working_query:'q',facts_source_url:'https://x.example/a/',tasks:[]}};
 const para='Walk the property after high winds and photograph every lifted shingle, bent flashing strip and gutter full of granules before anything is moved.';
 const r=produceVerifiedEditorialOpportunity({report:{editorial_decision_gate:gate},completion:{draft:{sections:[{h2:'Signs',paragraphs:[para]},{h2:'Next steps',paragraphs:[para.replace('Walk','Then walk')]}]}},sources:{destinationHtml:'<p>x</p>'}});
 assert.equal(r.opportunity,null);assert.equal(r.status,'NEW_PAGE_WITHOUT_SHARED_TASK_EVIDENCE');
});
// SYNTHETIC route run: the tracked sibling serves the locked source page (redirect or identical title/H1) and a real gap exists.
async function runIdentity({mode='same',locked=true}={}){
 const SRC='https://roofer.example/wind-damage-roof-repair-nj/',SIB='https://roofer.example/emergency-roofing/wind-damage-roof-repair/';
 const route={};const fresh=new Date(Date.now()-3*86400000).toISOString();
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))throw Error('no writes');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:7,tracker_client_id:4,url:SRC,keyword:'wind damage roof repair nj',saved_html:''}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:args[1]===7?[{page_id:7,tracker_client_id:4,source_page_url:SRC,evidence_scope:'page_verified',query:'roof wind damage repair',impressions:291,clicks:0,position:44,imported_at:fresh}]:[]};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:[{id:21,url:SIB,keyword:'roof wind damage repair'}]};
  return {rows:[]};
 }};
 const para='Walk around the house after the wind drops and note lifted shingles, bent flashing and granules in the gutters before calling anyone.';
 const srcHtml='<html><head><title>Wind Damage Roof Repair Guide: 5 Steps</title></head><body><h1>How to handle wind damage on a roof</h1><h2>Signs of wind damage</h2><p>'+para+'</p></body></html>';
 const comp=(h)=>'<html><head><title>Wind damage roof repair guide</title></head><body><h1>Wind damage roof repair</h1><h2>'+h+'</h2><p>Keep every insurance claim photo, insurance adjuster note and insurance claim number together; the insurance claim moves faster when the insurance documentation is complete and dated.</p><p>'+para+'</p></body></html>';
 const fetchLive=async url=>{
  if(url===SRC)return {html:srcHtml,final_url:SRC,truncated:false};
  if(url===SIB){
   if(mode==='loop')throw Object.assign(Error('REDIRECT_LOOP'),{code:'REDIRECT_LOOP',redirect_chain:[{url:SIB,status:301,location:SIB+'x/'},{url:SIB+'x/',status:301,location:SIB}]});
   const hop=mode==='301'||mode==='308'||mode==='302'?[{url:SIB,status:Number(mode),location:SRC}]:[];
   return {html:srcHtml,final_url:mode==='same'?SIB:SRC,requested_url:SIB,redirect_chain:hop,truncated:false};
  }
  return {html:comp(url.includes('g0')?'Insurance claim documentation':'Documenting the insurance claim'),final_url:url,truncated:false};
 };
 const searchLive=async args=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:args.query,provider_attempts:['SERPER_GOOGLE_ORGANIC'],leads:
  ['How to Fix Wind Damage on a Roof','Wind Damage Roof Repair Guide','Signs of Wind Damage: A Checklist'].map((title,i)=>({url:'https://g'+i+'.example/w',title,source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}))});
 const mw=(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:false,pages:[{id:7,url:SRC,keyword:'wind damage roof repair nj',case_study_active:locked}]};next()};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(){}},db,mw,{fetchLive,searchLive,renderOwn:async()=>({status:'RENDER_UNAVAILABLE',live:null})});
 const res={statusCode:200,set(){return this},status(x){this.statusCode=x;return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'],req={params:{token:'t'},query:{page_id:'7'}};
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.equal(res.statusCode,200,JSON.stringify(res.body));
 return {b:res.body,SRC,SIB};
}
test('13. Route: a sibling that only LOOKS like the locked Case Study (same title/H1, or moved with unknown status) is never edited and never called a 301',async()=>{
 for(const mode of ['same','unknown']){
  const {b,SRC,SIB}=await runIdentity({mode});
  assert.equal(b.query_selection.destination.url,SIB);
  assert.equal(b.destination_identity.resolves_to_source,true);
  assert.equal(b.destination_identity.basis,mode==='same'?'SAME_TITLE_AND_H1_AS_SOURCE_PAGE':'REDIRECTS_TO_SOURCE_PAGE_STATUS_UNKNOWN');
  assert.equal(b.destination_identity.source_url,SRC);
  const g=b.editorial_decision_gate;
  assert.equal(g.decision,'DATA_BLOCKED',JSON.stringify({d:g.decision,m:g.missing_evidence}));assert.equal(g.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
  assert(!(b.url_identities||[]).some(x=>x.kind==='PERMANENT_REDIRECT'||/^30[18] redirect detected/.test(x.advice||'')),'never labelled as a proven 301');
  assert(!/^30[18] redirect detected/.test(String(b.destination_identity.advice||'')));
 }
});
test('14. Route: a 301/308 alias of the locked source is one page: final URL is the identity, edits are blocked, advice says keep the redirect',async()=>{
 for(const mode of ['301','308']){
  const {b,SRC,SIB}=await runIdentity({mode});
  const di=b.destination_identity;
  assert.equal(di.kind,'PERMANENT_REDIRECT');assert.equal(di.basis,'PERMANENT_REDIRECT_TO_SOURCE_PAGE');assert.equal(di.alias_of,SRC);assert.deepEqual(di.http_statuses,[Number(mode)]);
  assert.equal(b.editorial_decision_gate.target_url,SRC,'the final URL is the page identity');
  assert.equal(b.query_selection.destination.url,SRC,'selection reports the same final URL');assert.equal(b.query_selection.destination.tracked_url,SIB,'the tracked alias is kept, not deleted');
  assert.equal(b.growth_decision.primary_next_action.destination.url,SRC);
  assert.equal(b.editorial_decision_gate.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');assert.equal(b.editorial_decision_gate.copy_ready,false);
  assert.match(di.advice,new RegExp('^'+mode+' redirect detected: '+SIB.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+' → '));
  assert.match(di.advice,/This is one page, not duplicate content\. Keep the working redirect; no website change is required\./);
  assert.match(di.advice,/locked Case Study: edits to it are blocked/);
  assert(b.url_identities.some(x=>x.kind==='PERMANENT_REDIRECT'&&x.original_url===SIB&&x.final_url===SRC));
  assert(!b.site_architecture.compatible_existing_pages.some(x=>x.url===SIB),'an alias is never a second candidate page');
 }
});
test('14b. Route: the same alias with an UNLOCKED source: the source keeps its own query and stays editable',async()=>{
 const {b,SRC}=await runIdentity({mode:'301',locked:false});
 assert.equal(b.query_selection.destination.url,SRC);assert.equal(b.editorial_decision_gate.target_url,SRC);
 assert.notEqual(b.editorial_decision_gate.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
});
test('14c. Route: temporary redirects and loops are reported as such and never merged',async()=>{
 const t=await runIdentity({mode:'302'});
 const tid=t.b.url_identities.find(x=>x.original_url===t.SIB);
 assert.equal(tid.kind,'TEMPORARY_REDIRECT');assert.equal(tid.alias_of,null);assert.match(tid.advice,/^Temporary redirect detected \(302\)/);
 assert.notEqual(t.b.editorial_decision_gate.target_url,t.SRC,'a temporary redirect never makes the source the destination');
 assert.equal(t.b.editorial_decision_gate.decision,'DATA_BLOCKED');assert.equal(t.b.editorial_decision_gate.copy_ready,false);
 const l=await runIdentity({mode:'loop'});
 const lid=l.b.url_identities.find(x=>x.original_url===l.SIB);
 assert.equal(lid.kind,'REDIRECT_LOOP');assert.equal(lid.final_url,null);assert.match(lid.advice,/Redirect loop detected/);
});
const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
const {identityFromFetch,identityAdvice}=require('../src/growth-url-identity.cjs');
// SYNTHETIC HTTPS server per URL: {status, location} for a hop, or an HTML body.
const routedHttps=routes=>({request(url,opts,cb){const req=new EventEmitter();req.end=()=>{const r=routes[url.href]||{status:404};const res=new EventEmitter();
 res.statusCode=r.status;res.headers=r.location?{location:r.location}:{'content-type':'text/html'};res.resume=()=>{};res.destroy=()=>{};cb(res);
 if(r.status===200){res.emit('data',Buffer.from(r.body||'<h1>x</h1>'));res.emit('end')}};req.destroy=()=>{};return req}});
test('15. Reader records every hop: 301/308 chain, temporary hop, loop, chain limit, and a redirect to a private network is refused',async()=>{
 const A='https://p.example/old/',B='https://p.example/mid/',C='https://p.example/new/';
 const ok=await fetchPublicGrowthHtml(A,{lookup,httpsModule:routedHttps({[A]:{status:301,location:B},[B]:{status:308,location:'/new/'},[C]:{status:200,body:'<link rel="canonical" href="'+C+'"><h1>New</h1>'}}),compact:true});
 assert.equal(ok.final_url,C);assert.deepEqual(ok.redirect_chain.map(h=>h.status),[301,308]);assert.equal(ok.requested_url,A);
 const id=identityFromFetch(A,ok);assert.equal(id.kind,'PERMANENT_REDIRECT');assert.equal(id.alias_of,C);assert.equal(id.canonical_points_elsewhere,false);
 const tmp=await fetchPublicGrowthHtml(A,{lookup,httpsModule:routedHttps({[A]:{status:301,location:B},[B]:{status:302,location:C},[C]:{status:200}})});
 assert.equal(identityFromFetch(A,tmp).kind,'TEMPORARY_REDIRECT','one temporary hop makes the whole chain temporary');
 await assert.rejects(fetchPublicGrowthHtml(A,{lookup,httpsModule:routedHttps({[A]:{status:301,location:B},[B]:{status:301,location:A}})}),e=>e.code==='REDIRECT_LOOP'&&e.redirect_chain.length===2);
 await assert.rejects(fetchPublicGrowthHtml(A,{lookup,httpsModule:routedHttps({[A]:{status:301,location:B},[B]:{status:301,location:C},[C]:{status:301,location:'https://p.example/x/'}})}),e=>e.code==='REDIRECT_LIMIT'&&e.redirect_chain.length===3);
 const priv=async h=>h==='internal.example'?[{address:'10.0.0.5',family:4}]:[{address:'93.184.216.34',family:4}];
 await assert.rejects(fetchPublicGrowthHtml(A,{lookup:priv,httpsModule:routedHttps({[A]:{status:301,location:'https://internal.example/admin'}})}),
  e=>e.code==='PUBLIC_IPV4_UNAVAILABLE'&&e.redirect_chain[0].status===301,'a redirect hop to a private address is never requested');
 await assert.rejects(fetchPublicGrowthHtml(A,{lookup,httpsModule:routedHttps({[A]:{status:301,location:'http://p.example/plain/'}})}),e=>e.code==='PUBLIC_HTTPS_URL_REQUIRED');
 const gone=identityFromFetch(A,{error:'HTTP_404',redirect_chain:[{url:A,status:301,location:C}]});
 assert.equal(gone.kind,'REDIRECT_DESTINATION_UNAVAILABLE');assert.match(identityAdvice(gone),/could not be read \(HTTP_404\)/);
});
test('15b. Owner package shows the same URL-identity advice as the JSON, once',()=>{
 const advice=identityAdvice(identityFromFetch('https://p.example/old/',{final_url:'https://p.example/new/',redirect_chain:[{url:'https://p.example/old/',status:301,location:'https://p.example/new/'}]}),{lockedUrls:['https://p.example/new/']});
 const report={url:'https://p.example/new/',destination_identity:{advice,resolves_to_source:true},url_identities:[{advice}]};
 const md=buildOwnerHandoffPackage({report,decision:{decision:'DATA_BLOCKED',missing_evidence:[]}}).markdown;
 assert.match(md,/## URL identity/);assert.equal(md.split('This is one page, not duplicate content').length-1,1);
 assert.match(md,/Keep the working redirect; no website change is required/);assert.match(md,/edits to it are blocked/);
});

// ---------- Report 18 (production run after PR #194): 301 recognised; geo leak via URL, a time-word "task", blocker order ----------
const r18=require('./fixtures/growth-reports-11-12/report-18-prt-wind-damage-after-194.json');
const {deriveReaderTasksDetailed}=require('../src/growth-derived-reader-tasks.cjs');
test('R18 production outcome: 301 recognised, but a Colorado page passed the NJ filter and SERP evidence blocked first',()=>{
 assert.equal(r18.destination_identity.kind,'PERMANENT_REDIRECT');assert.equal(r18.destination_identity.source_protected,true);
 assert.equal(r18.editorial_decision_gate.blocker_code,'SERP_INTENT_EVIDENCE');
 assert(r18.search_discovery.leads.some(l=>/colorado-spring/.test(l.url)));
 assert.deepEqual(r18.reader_task_coverage.tasks.map(t=>t.code),['task_recent']);
});
test('16. A place named only in the URL path is still another market; "near you" is local, "what to do" is a guide',()=>{
 const co=r18.search_discovery.leads.find(l=>/colorado-spring/.test(l.url));
 assert.equal(rejectLead({query:'roof wind damage repair',lead:co,marketStates:['NJ']}),'DIFFERENT_REGION:CO');
 const sd=r18.search_discovery.leads.find(l=>/sundownexteriors/.test(l.url));
 assert.equal(rejectLead({query:'roof wind damage repair',lead:sd,marketStates:['NJ']}),null,'no place named: a general source');
 assert.equal(classifyTitle(co.title,co.snippet),'LOCAL_SERVICE');assert.equal(classifyTitle(sd.title,sd.snippet),'INFORMATIONAL_GUIDE');
 assert.equal(rejectLead({query:'roof repair',lead:{url:'https://x.example/roof-repair-colorado/',title:'Roof repair'}}),null,'no market: no place filter');
});
test('16b. A time word shared by two headings ("recent storm") is not a reader task (SYNTHETIC sections shaped like report 18)',()=>{
 const sec=(h,t)=>({heading:h,text:t,words:t.split(/\s+/).length});
 const filler='Homeowners should document visible shingle damage with dated photos, then compare the photos with the inspection report before any contractor visit.';
 const competitors=[
  {host:'a.example',url:'https://a.example/x',sections:[sec('What to do after a recent storm','A recent storm can loosen flashing. After the recent storm, walk the yard and note recent debris near gutters and flashing. '+filler),sec('Insurance paperwork','Keep the claim number and adjuster notes together with every invoice and photo so paperwork stays complete. '+filler),sec('Choosing materials','Architectural shingles and synthetic underlayment resist uplift better than three-tab shingles in exposed locations. '+filler)]},
  {host:'b.example',url:'https://b.example/y',sections:[sec('No damage from the recent ice storm?','Even without visible damage from the recent ice storm, recent freeze cycles can lift flashing; recent debris in gutters is a sign. '+filler),sec('Gutter care','Clear gutters twice a year so water does not back up under the first shingle course near the eaves. '+filler),sec('Attic ventilation','Balanced intake and exhaust ventilation keeps the attic dry and reduces ice dam formation along the eaves. '+filler)]}];
 const keys=deriveReaderTasksDetailed({query:'roof wind damage repair',competitors}).tasks.map(x=>x.key);
 assert(!keys.includes('recent'),keys.join(','));
});
test('17. R18: the protected Case Study is the primary outcome; missing SERP evidence is a separate research limitation',()=>{
 const serp=inferSerpIntent({query:'roof wind damage repair',leads:r18.search_discovery.leads});
 assert.equal(serp.status,'SERP_INTENT_NOT_ESTABLISHED');
 const d=decideGrowthEditorialAction({report:r18,destination:r18.destination_section_comparison,coverage:r18.reader_task_coverage,
  serpIntent:serp,destinationIntent:r18.destination_intent,attempts:r18.editorial_decision_gate.attempted_sources});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
 assert.match(d.missing_evidence[0].detail,/permanently redirects \(301\) to the locked Case Study page .*no website change is required/);
 assert.deepEqual(d.research_limitations.map(x=>x.code),['SERP_INTENT_EVIDENCE']);
 assert.match(d.reason,/no website change is required now\. Separately, research evidence was incomplete: SERP_INTENT_EVIDENCE/);
 assert.equal(d.evidence_status.label,'CASE_STUDY_PROTECTED_NO_CHANGE_REQUIRED');assert.equal(d.copy_ready,false);
});
test('18. Route: the opening recommendation is marked as the starting point and the final decision is recorded next to it',async()=>{
 const {b}=await runIdentity({mode:'301'});
 assert.equal(b.growth_decision.primary_next_action.stage,'RESEARCH_STARTING_POINT');
 assert.equal(b.growth_decision.final_decision.decision,b.editorial_decision_gate.decision);
 assert.equal(b.growth_decision.final_decision.blocker_code,b.editorial_decision_gate.blocker_code);
 assert.equal(b.growth_decision.final_decision.target_url,b.editorial_decision_gate.target_url);
});

// ---------- Report 22 (PRT homepage, after PR #197): 301 alias resolved, but a FAQ block + a contact block became a "task" ----------
const r22=require('./fixtures/growth-reports-11-12/report-22-prt-home-after-197.json');
const {isFurnitureHeading}=require('../src/growth-derived-reader-tasks.cjs');
test('R22 production outcome: 301 alias used as final URL; the only task was built from "Common questions" + "Contact Us"',()=>{
 assert.equal(r22.destination_identity.kind,'PERMANENT_REDIRECT');assert.equal(r22.query_selection.destination.url,'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/');
 assert.deepEqual(r22.reader_task_coverage.tasks[0].competitor_support.map(x=>x.heading),['Common questions','Contact Us']);
 assert.equal(r22.editorial_decision_gate.copy_ready,true);assert.match(r22.editorial_decision_gate.proposed_text,/under your service title/);
});
test('19. FAQ containers and contact/quote blocks are page furniture, never reader tasks; real question headings stay',()=>{
 for(const h of r22.reader_task_coverage.tasks[0].competitor_support.map(x=>x.heading))assert.equal(isFurnitureHeading(h),true,h);
 for(const h of ['📞 Contact Us Today','Get a Free Quote','FAQ','Frequently Asked Questions','Request a Free Inspection'])assert.equal(isFurnitureHeading(h),true,h);
 for(const h of ['Is storm damage covered by homeowners insurance in NJ?','Insurance claim documentation','Temporary tarping'])assert.equal(isFurnitureHeading(h),false,h);
 // SYNTHETIC sections shaped like report 22 (the production excerpts are cut at 420 characters).
 const sec=(h,t)=>({heading:h,text:t,words:t.split(/\s+/).length});
 const other='Tarping a damaged section keeps rain out until permanent repairs; crews secure the tarp past the ridge and weigh the edges with battens to resist wind.';
 const competitors=[
  {host:'precision.example',url:'https://precision.example/e',sections:[sec('Common questions','Is this actually an emergency, or can it wait until morning? Common questions answered: what counts as an emergency question, how fast is the response, and which question to ask first. Each question has a short answer, and the questions below cover contact details, the title of your request and a short description. '+other),sec('Temporary tarping',other+' '+other)]},
  {host:'rhino.example',url:'https://rhino.example/e',sections:[sec('Contact Us','Contact us with any question. Point of contact, title and a short description help our team answer your question quickly; every question gets an answer from a real person and contact is answered day and night. '+other),sec('Storm tarps',other+' '+other)]}];
 const keys=deriveReaderTasksDetailed({query:'emergency roof repair nj',competitors}).tasks.map(t=>t.key);
 assert(!keys.includes('questi')&&!keys.includes('contac'),keys.join(','));assert(keys.includes('tarp'),'a real shared task is still found');
});
