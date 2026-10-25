'use strict';
// Regressions built from the TWO real production reports that exposed the root causes:
//  - Perfect Roofing Team (page 2281): specific GSC queries were discarded and Growth researched the brand name.
//  - ContentScale (page 2320): generic tool advice was merged into a product section with unsupported capability claims.
// Fixtures are verbatim (see tests/fixtures/growth-root-cause/*). Anything synthetic is labelled SYNTHETIC in place.
const test=require('node:test'),assert=require('node:assert/strict');
const prt=require('./fixtures/growth-root-cause/prt-report.json');
const cs=require('./fixtures/growth-root-cause/contentscale-report.json');
const {selectGrowthQuery,deriveTopicQuery,brandInfo}=require('../src/growth-query-selection.cjs');
const {assessSectionClaims}=require('../src/growth-owner-edit-decision.cjs');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {parseSerperGoogleOrganic}=require('../src/growth-public-search-discovery.cjs');
const {rejectLead,statesIn}=require('../src/growth-serp-quality.cjs');
const {inferSerpIntent}=require('../src/growth-reader-task-coverage.cjs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const now=new Date();
const fresh=rows=>rows.map(r=>({...r,imported_at:new Date(now-2*86400000).toISOString()})); // real metrics, import date moved so the suite never goes stale
const inv=(f,base=3000)=>f.inventory.map((x,i)=>({id:base+i,...x}));

test('PRT root cause is documented by the real report',()=>{
 assert.equal(prt.production_outcome.intent_query,'perfectroofingteam');assert.equal(prt.production_outcome.competitors_live_reviewed,0);
 assert.equal(prt.production_outcome.decision,'DATA_BLOCKED');assert(prt.gsc.every(q=>q.clicks===0&&q.position>35),'no clicks, positions beyond 35');
 assert.deepEqual(prt.gsc.slice(0,4).map(q=>q.impressions),[559,459,456,393]);
});
test('1. PRT homepage with its real GSC queries: the specific query and its dedicated service page are selected, never the brand',()=>{
 const r=selectGrowthQuery({page:{id:2281,url:prt.page.url,keyword:prt.page.tracker_keyword},queries:fresh(prt.gsc),headings:prt.headings,inventory:inv(prt),now});
 assert.equal(r.status,'QUERY_SELECTED_FROM_VERIFIED_GSC');assert.equal(r.query,'emergency roof repair nj');
 assert.equal(r.destination.url,'https://perfectroofingteam.com/emergency-roofing/emergency-roof-repair-nj/');assert.equal(r.destination.basis,'DEDICATED_TRACKED_PAGE_FOR_THIS_QUERY');
 assert(r.destination.competing_same_site_pages.some(u=>/24-hour-emergency-roof-repair-nj/.test(u)),'a near-duplicate same-site page is reported as cannibalisation risk');
 assert.equal(r.surfacing_signal.type,'SOURCE_PAGE_SURFACES_FOR_QUERY_OWNED_BY_ANOTHER_PAGE');assert.match(r.surfacing_signal.note,/not performance data for the destination/);
 assert.equal(r.chosen.action_class,'VISIBILITY_GAP_COMPARE_WITH_LIVE_COMPETITORS');assert.equal(r.chosen.position>35,true);
 assert(!/perfectroofingteam/.test(r.query));
});
test('2. PRT existing emergency service page (tracked keyword, no GSC): it is its own destination and keeps the geographic intent',()=>{
 const sp=prt.service_pages.find(x=>/emergency-roofing\/emergency-roof-repair-nj/.test(x.url));
 const r=selectGrowthQuery({page:{id:3001,url:sp.url,keyword:sp.keyword},queries:[],headings:{title:sp.title,h1:sp.h1,h2:sp.h2},inventory:inv(prt),now});
 assert.equal(r.query,'emergency roof repair nj');assert.equal(r.source,'TRACKER_KEYWORD');assert.match(r.query,/\bnj\b/);
});
test('3. PRT homepage WITHOUT GSC: a brand tracker keyword is never researched; the non-brand topic of the page is used',()=>{
 const r=selectGrowthQuery({page:{id:2281,url:prt.page.url,keyword:'perfectroofingteam'},queries:[],headings:prt.headings,inventory:inv(prt),now});
 assert.equal(r.status,'QUERY_DERIVED_FROM_PAGE_TOPIC');assert.equal(r.query,'nj roofing contractor');assert.match(r.warning,/not verified search demand/);
 const none=selectGrowthQuery({page:{id:1,url:'https://acme-widgets.example/',keyword:'acmewidgets'},queries:[],headings:{title:'Acme Widgets'},inventory:[],now});
 assert.equal(none.status,'NO_NON_BRAND_QUERY_ESTABLISHED');assert.equal(none.query,null);
});
test('4. A separate local-service industry (SYNTHETIC plumber) gets the same behaviour with no trade vocabulary in the code',()=>{
 const inventory=[{id:11,url:'https://acme-plumbing.example/drain-cleaning-hoboken-nj/',keyword:'drain cleaning hoboken nj'},{id:12,url:'https://acme-plumbing.example/water-heaters/',keyword:'water heater installation'}];
 const gsc=fresh([{query:'drain cleaning hoboken nj',impressions:640,clicks:1,position:18.2},{query:'acme plumbing',impressions:900,clicks:300,position:1.1},{query:'plumber salary',impressions:50,clicks:0,position:70}]);
 const r=selectGrowthQuery({page:{id:10,url:'https://acme-plumbing.example/',keyword:'acme plumbing'},queries:gsc,headings:{title:'Acme Plumbing | Plumbers in Hudson County, NJ',h1:['Acme Plumbing'],h2:['Our services']},inventory,now});
 assert.equal(r.query,'drain cleaning hoboken nj');assert.equal(r.destination.url,inventory[0].url);assert(r.brand_queries.includes('acme plumbing'));
 assert(r.protected.some(x=>x.query==='acme plumbing'),'brand baseline is protected, not researched');
});
test('5. ContentScale homepage: protected rankings stay protected, brand-like queries are excluded, content scaling goes to /content-at-scale/',()=>{
 const r=selectGrowthQuery({page:{id:2320,url:cs.page.url,keyword:cs.page.tracker_keyword},queries:fresh(cs.gsc),headings:cs.headings,inventory:inv(cs),now});
 assert.equal(r.query,'content scaling');assert.equal(r.destination.url,cs.destination_url);
 const protectedNames=r.protected.map(x=>x.query);assert(protectedNames.includes('content at scale')&&protectedNames.includes('content scale'));
 assert(!r.excluded.some(x=>x.query==='content scaling'));assert.equal(r.chosen.action_class,'CLICK_AND_CONTENT_REVIEW');
});
test('6. ContentScale /content-at-scale/ real draft: unsupported capability, outcome and AI-citation claims are rejected, not softened',()=>{
 const opts={destinationText:cs.destination_text,query:'content scaling',brandLabel:'contentscale'};
 const tracker=assessSectionClaims(cs.raw_draft_sections[0],opts),repurpose=assessSectionClaims(cs.raw_draft_sections[1],opts);
 assert.equal(tracker.ok,false);assert.equal(repurpose.ok,false);
 const by=(r,c)=>r.violations.filter(v=>v.code===c);
 assert(by(tracker,'UNSUPPORTED_CAPABILITY_CLAIM').some(v=>/automated citation tracking monitors/.test(v.sentence)),'tracker "monitors how generative search platforms cite"');
 assert(by(tracker,'UNSUPPORTED_CAPABILITY_CLAIM').some(v=>/automated tracking confirms/.test(v.sentence)),'"tracking confirms that specific passage structures win citations"');
 assert(by(tracker,'UNPROVEN_AI_CITATION_CLAIM').length>=1);
 assert(by(repurpose,'UNPROVEN_OUTCOME_CLAIM').some(v=>/maximize its return/.test(v.sentence)),'maximise return');
 assert(by(repurpose,'UNPROVEN_OUTCOME_CLAIM').some(v=>/brand reach|expanding/.test(v.sentence)),'brand reach outcome');
 assert.equal(tracker.paragraphs.join(' ').includes('automated citation tracking monitors'),false);
});
test('7. Softening cannot launder an unsupported capability or performance claim',()=>{
 const dest='The page explains content workflows and how a team reviews a draft before publication.';
 for(const text of ['Tracking identifies exactly which passages are directly quoted in AI answers.','Automated tracking ensures you are cited by AI search.','Our tool provides real-time feedback on how generative platforms use your content.','Pages with this structure demonstrate higher search engagement than other pages.']){
  const r=assessDraftClaims({text,destinationText:dest,query:'content scaling',brandLabel:'contentscale'});
  assert.equal(r.ok,false,text);assert.equal(r.safe_text,'','nothing of the claim survives: '+text);
 }
 // The same capability is allowed only when the destination page itself states it.
 const sourced='The tracker records which AI answers cite your page and keeps a history of each check for the owner.';
 const ok=assessDraftClaims({text:'The tracker records which AI answers cite your page and keeps a history of every check.',destinationText:sourced,query:'x'});
 assert(!ok.violations.some(v=>v.code==='UNSUPPORTED_CAPABILITY_CLAIM'||v.code==='UNPROVEN_AI_CITATION_CLAIM'),JSON.stringify(ok.violations.map(v=>v.code)));
 // Generic advice about tools and measuring is not a capability claim.
 assert.equal(assessDraftClaims({text:'Use a tracking tool to record which pages are cited, then compare the results with last month.',destinationText:dest,query:'x'}).ok,true);
});
test('8. Insufficient competitor evidence is reported with concrete diagnostics (no fabricated research)',()=>{
 const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
 const d=decideGrowthEditorialAction({report:{url:'https://s.example/',growth_decision:{primary_next_action:{query:'emergency roof repair nj'},protection:{}}},destination:{target_url:'https://s.example/e/',status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},
  coverage:{competitors_considered:[],competitor_diagnostics:{received:0,without_html:0,with_no_readable_sections:0,used:0,distinct_hosts:0},tasks:[],destination_truncated:false},
  serpIntent:{status:'SERP_INTENT_NOT_ESTABLISHED',intent:'MIXED_OR_INSUFFICIENT'},destinationIntent:null,attempts:[{source:'SEARCH_PROVIDERS',status:'NO_RELEVANT_GOOGLE_ORGANIC_LEADS',detail:'BING_PUBLIC_RSS, SERPER_GOOGLE_ORGANIC'}]});
 assert.equal(d.decision,'DATA_BLOCKED');assert(d.missing_evidence.some(x=>x.code==='SERP_INTENT_EVIDENCE'));assert(d.missing_evidence.some(x=>x.code==='READABLE_COMPETITOR_ARTICLES'&&/received 0/.test(x.detail)));
 assert(d.attempted_sources.some(a=>/SERPER_GOOGLE_ORGANIC/.test(a.detail)));
});
test('9. Contradictory or irrelevant SERP results are filtered with a stated reason, and a mixed SERP establishes no intent',()=>{
 const organic=[
  {title:'Emergency Roof Repair in Paterson, NJ | Acme Roofing',link:'https://acme-roofing.example/emergency-roof-repair-paterson-nj/',snippet:'24/7 emergency roof repair across Passaic County NJ'},
  {title:'Top 10 Emergency Roofers in New Jersey - Yelp',link:'https://www.yelp.com/biz/acme',snippet:'reviews'},
  {title:'Emergency Roof Repair in Austin, TX',link:'https://texas-roofers.example/emergency-roof-repair/',snippet:'Serving Austin TX homeowners'},
  {title:'Best 7 Emergency Roof Repair Companies Near You',link:'https://directory.example/best-emergency-roof-repair/',snippet:'Find the best local roofers in NJ'},
  {title:'Emergency Roof Repair NJ | 24 Hour Roofer',link:'https://perfectroofingteam.com/emergency-roofing/emergency-roof-repair-nj/',snippet:'own site'},
  {title:'Emergency Roof Repair & Tarping in Bergen County, NJ',link:'https://bergen-roof.example/emergency/',snippet:'Same day tarping'},
  {title:'Emergency roof repair in Portland, OR',link:'https://oregon-roof.example/emergency/',snippet:'Oregon roofing company'}];
 const log=[],leads=parseSerperGoogleOrganic({organic},{query:'emergency roof repair nj',ownUrl:'https://perfectroofingteam.com/',rejectedLog:log});
 assert.deepEqual(leads.map(l=>new URL(l.url).hostname),['acme-roofing.example','bergen-roof.example']);
 assert(log.some(x=>x.reason==='DIFFERENT_REGION:TX')&&log.some(x=>x.reason==='DIFFERENT_REGION:OR')&&log.some(x=>/DIRECTORY_STYLE/.test(x.reason)));
 assert.equal(rejectLead({query:'roof repair',lead:{url:'https://texas-roofers.example/x',title:'Roof repair in Austin, TX'}}),null,'no place in the query: no regional filter');
 assert.deepEqual(statesIn('in the city of Portland or Salem'),[],'the word "or" is not Oregon');
 const mixed=inferSerpIntent({query:'x',leads:[{url:'https://a.example/',title:'Best CRM Software vs Rivals'},{url:'https://b.example/',title:'What Is a CRM?'},{url:'https://c.example/',title:'CRM Repair in Lodi, NJ'}]});
 assert.equal(mixed.status,'SERP_INTENT_NOT_ESTABLISHED');
});

// ---------- Production-style PRT run through the REAL GET route (competitor pages and SERP payload are SYNTHETIC) ----------
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const hp=prt.headings;
const homeHtml='<html><head><title>'+esc(hp.title)+'</title><meta name="description" content="'+esc(hp.description)+'"></head><body>'+hp.h1.map(h=>'<h1>'+esc(h)+'</h1>').join('')+hp.h2.map(h=>'<h2>'+esc(h)+'</h2>').join('')+hp.paragraph_samples.map(p=>'<p>'+esc(p)+'</p>').join('')+'</body></html>';
const svc=prt.service_pages.find(x=>/emergency-roofing\/emergency-roof-repair-nj/.test(x.url));
// SYNTHETIC body: the production report holds only the headings of this page.
const svcHtml='<html><head><title>'+esc(svc.title)+'</title></head><body><h1>'+esc(svc.h1[0])+'</h1>'+svc.h2.map(h=>'<h2>'+esc(h)+'</h2><p>Our crew responds to roof emergencies in New Jersey, inspects the damage and explains the repair options before any work begins on the property or the building.</p>').join('')+'</body></html>';
const para='Emergency tarping protects the roof from rain until a permanent repair is possible, and a tarp should be fitted over the damaged area and secured beyond its edges. Photograph the damage before tarping, because tarping can hide the cause and the photos document the tarping for any claim.';
const comp=(h1,h2)=>'<html><body><article><h1>'+h1+'</h1><h2>'+h2+'</h2><p>'+para+'</p><h2>When to call a roofer</h2><p>Call a roofer when water enters the building, when shingles are missing after a storm or when a tree has landed on the roof, and do not climb onto a wet roof yourself under any circumstances at all.</p></article></body></html>';
const competitorHtml={'https://acme-roofing.example/emergency-roof-repair-paterson-nj/':comp('Emergency Roof Repair in Paterson, NJ','Emergency tarping before the repair'),
 'https://bergen-roof.example/emergency/':comp('Emergency Roof Repair in Bergen County, NJ','How emergency tarping works'),
 'https://hudson-roof.example/storm/':comp('Storm Roof Repair in Hudson County, NJ','Tarping a storm-damaged roof')};
const raw=[{title:'Emergency Roof Repair in Paterson, NJ | Acme Roofing',link:'https://acme-roofing.example/emergency-roof-repair-paterson-nj/',snippet:'24/7'},
 {title:'Top 10 Emergency Roofers in New Jersey - Yelp',link:'https://www.yelp.com/biz/x',snippet:'reviews'},{title:'Emergency Roof Repair in Austin, TX',link:'https://texas-roofers.example/e/',snippet:'Austin TX'},
 {title:'Emergency Roof Repair & Tarping in Bergen County, NJ',link:'https://bergen-roof.example/emergency/',snippet:'Same day'},{title:'Storm Roof Repair in Hudson County, NJ',link:'https://hudson-roof.example/storm/',snippet:'Hudson NJ'},
 {title:'Emergency Roof Repair NJ',link:'https://perfectroofingteam.com/emergency-roofing/emergency-roof-repair-nj/',snippet:'own'}];
function prtHarness({gsc=true}={}){
 const route={},writes=[],queries=[];
 const rows=inv(prt);const svcRow=rows.find(r=>r.url===svc.url);
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes.push(sql);throw Error('No writes permitted')}
  if(sql.includes('LEFT(html_content'))return {rows:[{id:2281,tracker_client_id:7,url:prt.page.url,keyword:prt.page.tracker_keyword,saved_html:homeHtml}]};
  if(sql.includes('FROM tracker_snapshots')||sql.includes('FROM tracker_ai_evidence'))return {rows:[]};
  if(sql.includes('FROM tracker_gsc_queries')){queries.push(args);
   return {rows:gsc&&Number(args[1])===2281?fresh(prt.gsc).map(r=>({page_id:2281,tracker_client_id:7,source_page_url:prt.page.url,evidence_scope:'page_verified',...r})):[]}}
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:rows.map(r=>({id:r.id,tracker_client_id:7,url:r.url,keyword:r.keyword}))};
  throw Error('Unexpected database access '+sql.slice(0,80));
 }};
 const searchCalls=[];
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},db,(req,res,next)=>{req.growthTrackerClientId=7;
  req.growth={can_edit:false,pages:[{id:2281,url:prt.page.url,keyword:prt.page.tracker_keyword,case_study_active:true}]};next()},{
  fetchLive:async url=>{const html=url===prt.page.url?homeHtml:url===svc.url?svcHtml:competitorHtml[url];if(!html)throw Object.assign(new Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
   return {html,final_url:url,retrieved_at:new Date().toISOString(),truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async({query,ownUrl})=>{searchCalls.push(query);const rejected_leads=[];
   const leads=parseSerperGoogleOrganic({organic:raw},{query,ownUrl,limit:7,rejectedLog:rejected_leads});
   return {status:leads.length?'FRESH_GOOGLE_ORGANIC_LEADS':'NO_RELEVANT_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',leads,rejected_leads,query,provider_attempts:['BING_PUBLIC_RSS','SERPER_GOOGLE_ORGANIC'],checked_at:new Date().toISOString()}}});
 return {writes,searchCalls,queries,svcRow,async get(){const res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const req={params:{token:'t'},query:{page_id:'2281'}},stack=route['/api/tracker-client/:token/growth/auto-research'];await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res}};
}
test('PRT production-style run: Serper is queried for the specific local query, relevant local competitors are read, the service page is the destination, homepage metrics are not transferred',async()=>{
 const h=prtHarness(),res=await h.get(),b=res.body;
 assert.equal(res.statusCode,200);
 // one source of truth for the query, everywhere
 assert.deepEqual([b.search.focus_query,b.intent_resolution.query,b.search_discovery.target_query,b.growth_decision.primary_next_action.query,b.editorial_decision_gate.focus_query,b.query_selection.query],Array(6).fill('emergency roof repair nj'));
 assert.deepEqual(h.searchCalls,['emergency roof repair nj'],'never the brand name');
 assert.equal(b.search.top_gsc_query,'emergency roof repair nj');
 assert.equal(b.serp_intent.intent,'LOCAL_SERVICE');
 assert.equal(b.summary.competitors_live_reviewed,3,'local competitors fetched and read');
 assert(b.search_discovery.rejected_leads.some(x=>/DIFFERENT_REGION:TX/.test(x.reason)),'rejected SERP leads are shown with reasons');
 assert(!b.search_discovery.fetched_competitor_urls.some(u=>/yelp|texas|perfectroofingteam/.test(u)));
 assert.equal(b.destination_gsc_evidence.target_url,svc.url);assert.equal(b.destination_gsc_evidence.metrics,null,'homepage rows are never the service page’s metrics');
 assert.equal(b.destination_gsc_evidence.status,'NO_VERIFIED_DESTINATION_ROWS');
 assert.equal(b.query_selection.source_page_signal.type,'SOURCE_PAGE_SURFACES_FOR_QUERY_OWNED_BY_ANOTHER_PAGE');
 assert.equal(b.destination_intent.verdict,'COMPATIBLE');
 const g=b.editorial_decision_gate;assert.equal(g.target_url,svc.url,'one target URL');assert.notEqual(g.decision,'NEW_DISTINCT_PAGE','the existing service page serves the intent');
 assert.notEqual(g.blocker_code,'TOPIC_NOT_RESOLVED');assert.equal(g.publish_allowed,false);assert.equal(b.case_study_locked,true);assert.equal(h.writes.length,0);
});
test('PRT without GSC still researches the page topic (never the brand) and says the query is a working phrase',async()=>{
 const h=prtHarness({gsc:false}),b=(await h.get()).body;
 assert.equal(b.query_selection.query,'nj roofing contractor');assert.deepEqual(h.searchCalls,['nj roofing contractor']);
 assert.equal(b.query_selection.status,'QUERY_DERIVED_FROM_PAGE_TOPIC');assert.equal(b.exact_gsc_queries??b.summary.exact_gsc_queries,0);
});

test('owner package states the query, its destination and filtered SERP results',()=>{
 const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
 const md=buildOwnerHandoffPackage({report:{url:prt.page.url,generated_at:'t',query_selection:{query:'emergency roof repair nj',source:'VERIFIED_EXACT_PAGE_GSC',
  destination:{url:svc.url,basis:'DEDICATED_TRACKED_PAGE_FOR_THIS_QUERY',competing_same_site_pages:['https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/']},
  source_page_signal:{note:'These are the SOURCE page’s rows. They are not performance data for the destination page.',source_page_url:prt.page.url},brand_queries_excluded:['perfectroofingteam']},
  search_discovery:{rejected_leads:[{title:'Emergency Roof Repair in Austin, TX',reason:'DIFFERENT_REGION:TX'}]}},decision:{decision:'DATA_BLOCKED',missing_evidence:[],attempted_sources:[]},completion:{}}).markdown;
 assert.match(md,/Working query: \*\*emergency roof repair nj\*\*/);assert.match(md,/Destination page: https:\/\/perfectroofingteam\.com\/emergency-roofing/);
 assert.match(md,/possible overlap/);assert.match(md,/not performance data for the destination/);assert.match(md,/kept out of competitor research: perfectroofingteam/);assert.match(md,/DIFFERENT_REGION:TX/);
});

if(process.env.GROWTH_DUMP)test('dump production-style outputs (real inputs; competitor pages and SERP payload SYNTHETIC)',async()=>{
 const fs=require('node:fs');
 const h=prtHarness(),b=(await h.get()).body;
 const csSel=selectGrowthQuery({page:{id:2320,url:cs.page.url,keyword:cs.page.tracker_keyword,case_study_active:true},queries:fresh(cs.gsc),headings:cs.headings,inventory:inv(cs),now});
 const claims={tracker:assessSectionClaims(cs.raw_draft_sections[0],{destinationText:cs.destination_text,query:'content scaling',brandLabel:'contentscale'}),
  repurpose:assessSectionClaims(cs.raw_draft_sections[1],{destinationText:cs.destination_text,query:'content scaling',brandLabel:'contentscale'})};
 fs.writeFileSync(process.env.GROWTH_DUMP+'/production-style-outputs.json',JSON.stringify({
  NOTE:'Inputs: verbatim GSC, headings and tracked inventory from the two real production reports. PRT competitor pages and the Serper payload in this run are SYNTHETIC (the production report fetched 0 competitors). Not live production evidence.',
  before_production_prt:{query:prt.production_outcome.intent_query,serper_query:prt.production_outcome.search_discovery_query,competitors_live_reviewed:prt.production_outcome.competitors_live_reviewed,decision:prt.production_outcome.decision},
  after_prt_route_run:{query_selection:b.query_selection,serper_queries:h.searchCalls,serp_intent:b.serp_intent.intent,rejected_leads:b.search_discovery.rejected_leads,competitors_live_reviewed:b.summary.competitors_live_reviewed,
   destination_intent:b.destination_intent,destination_gsc_evidence:b.destination_gsc_evidence,decision:b.editorial_decision_gate.decision,target_url:b.editorial_decision_gate.target_url,case_study_locked:b.case_study_locked,publish_allowed:b.editorial_decision_gate.publish_allowed},
  after_contentscale_selection:{query:csSel.query,destination:csSel.destination,protected:csSel.protected.map(x=>x.query),brand_queries_excluded:csSel.brand_queries},
  contentscale_real_draft_claim_review:Object.fromEntries(Object.entries(claims).map(([k,v])=>[k,{accepted:v.ok,violations:v.violations.map(x=>({code:x.code,sentence:x.sentence.slice(0,140)}))}]))},null,1));
});
