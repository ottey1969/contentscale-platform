'use strict';
// Reports 39 and 42 (2026-10-29): search intent decisions that need more than "guide vs local service".
// 39 "ai citation tracker": Google shows tool pages; the page is a guide. 42 "craft framework": Google means an AI prompting
// framework; the page is a content framework. Titles/headings come from the reports (fixtures); page bodies are SYNTHETIC.
const test=require('node:test'),assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const {checkQueryMeaning}=require('../src/growth-serp-meaning.cjs');
const {classifyTitle,inferSerpIntent,classifyDestinationIntent}=require('../src/growth-reader-task-coverage.cjs');
const {parseSerperGoogleOrganic}=require('../src/growth-public-search-discovery.cjs');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
const serp39=require('./fixtures/growth-reports-38-41/report-39-serp-titles.json');
const craft=require('./fixtures/growth-reports-42-44/report-42-craft.json');

const html=(title,sections)=>'<html><head><title>'+title+'</title></head><body><h1>'+title+'</h1>'+sections.map(([h,p])=>'<h2>'+h+'</h2><p>'+p+'</p>').join('')+'</body></html>';
const para=(a,b)=>'This section explains '+a+' in detail for readers who compare options, because '+b+' Readers who check this before deciding avoid the most common mistakes, and the examples below show how '+a+' works in practice for a small team.';

function harness({query,pageUrl,pageHtml,leads,pages,inventory=[]}){
 const route={},writes=[],providerCalls=[];
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{async query(sql){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes.push(sql);throw Error('No writes permitted')}
  if(sql.includes('LEFT(html_content'))return {rows:[{id:5,tracker_client_id:4,url:pageUrl,keyword:query,saved_html:pageHtml}]};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:inventory};
  return {rows:[]};
 }},(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:req.params.token==='owner',pages:[{id:5,url:pageUrl,keyword:query,case_study_active:false},...inventory.map(r=>({...r,case_study_active:false}))]};next()},{
  retryDelayMs:0,
  fetchLive:async url=>{const h=url===pageUrl?pageHtml:pages[url];if(!h)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
   return {html:h,final_url:url,retrieved_at:'2026-10-29T08:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async()=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-29T08:00:00Z'}),
  completeOwnerDraft:async({body})=>{providerCalls.push(body);return {statusCode:200,body:{success:false,code:'NO_STUB'}}}});
 const call=async(path,token='client')=>{const req={params:{token},query:{page_id:'5'}},res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const stack=route[path];await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res.body};
 return {call,writes,providerCalls,GET:'/api/tracker-client/:token/growth/auto-research',POST:'/api/tracker-client/:token/growth/auto-research/complete'};
}

// ---------- Report 39: tool search ----------
const leads39=parseSerperGoogleOrganic({organic:serp39.organic},{query:serp39.query,ownUrl:serp39.own_url,limit:10});
const toolPages=Object.fromEntries(leads39.map((l,i)=>[l.url,html(l.title,[['Track citations in AI answers',para('citation tracking in AI answers','AI engines cite different sources each week.')],
 ['Alerts when you lose a citation',para('citation alerts','a lost citation is easy to miss without monitoring.')],['Pricing and plans '+i,para('the plans','teams need different numbers of prompts per month.')]])]));
const guideUrl='https://contentscale.site/what-is-ai-citation-tracker/';
const guideHtml=html('What Is an AI Citation Tracker? Guide 2026',[['What an AI citation tracker measures',para('what is measured','an AI answer can mention a brand without citing its page.')],
 ['Why citations matter for SEO',para('the effect of citations','AI answers send visitors to cited pages.')]]);

test('tool titles are classified; a tool SERP with tool comparisons is one intent (report 39 titles)',()=>{
 assert.equal(classifyTitle('AI Citation Tracker | AI Content Citation Tracking Tool'),'PRODUCT_TOOL');
 assert.equal(classifyTitle('11 Best AI Citation Tracking Tools (2026): Ranked & Compared'),'COMMERCIAL_COMPARISON');
 assert.equal(classifyTitle('How to track (and grow) AI engine citations'),'INFORMATIONAL_GUIDE');
 assert.equal(classifyTitle('Roof Repair in Paterson, NJ | Roofer A'),'LOCAL_SERVICE','local titles are untouched');
 const si=inferSerpIntent({query:serp39.query,leads:leads39,pages:[]});
 assert.equal(si.status,'SERP_INTENT_OBSERVED');assert.equal(si.intent,'PRODUCT_TOOL');assert.equal(si.agreement_basis,'TOOL_PAGES_WITH_COMPARISONS');
 assert.equal(classifyDestinationIntent({query:serp39.query,title:'What Is an AI Citation Tracker? Guide 2026',url:guideUrl,serpIntent:'PRODUCT_TOOL'}).verdict,'DIFFERENT');
 assert.equal(classifyDestinationIntent({query:serp39.query,title:'AI Citation Tracker | Track where AI cites you',url:'https://contentscale.site/ai-citation-tracker/',serpIntent:'PRODUCT_TOOL'}).verdict,'COMPATIBLE');
});

test('report 39: tool search and no tool page on the site: separate tool page, written by the owner, no generated claims',async()=>{
 const h=harness({query:serp39.query,pageUrl:guideUrl,pageHtml:guideHtml,leads:leads39,pages:toolPages});
 const g=await h.call(h.GET),d=g.editorial_decision_gate;
 assert.equal(g.serp_intent.intent,'PRODUCT_TOOL');
 assert.equal(d.decision,'NEW_DISTINCT_PAGE');assert.equal(d.gap_basis,'TOOL_SEARCH_AND_NO_TOOL_PAGE_ON_SITE');
 assert.equal(d.new_page_plan.page_type,'PRODUCT_OR_TOOL_PAGE');assert.equal(d.new_page_plan.requires_owner_product_facts,true);
 assert.equal(d.new_page_plan.keep_existing_page,guideUrl);
 assert.match(d.next_action,/Only if you offer such a tool/);assert.match(d.next_action,/does not write product claims/);
 assert.equal(d.evidence_status.label,'TOOL_PAGE_MISSING_OWNER_PRODUCT_FACTS_REQUIRED');
 assert.equal(d.evidence_status.missing_task_established,false,'a missing page type is not a missing reader task');
 const r=await h.call(h.POST,'owner'),b=r;
 assert.equal(h.providerCalls.length,0,'no AI draft for a product page');
 assert.equal(b.editorial_review_draft.status,'OWNER_PRODUCT_FACTS_REQUIRED');
 assert.equal(b.editorial_decision_gate.copy_status,'OWNER_PRODUCT_FACTS_REQUIRED');assert.equal(b.editorial_decision_gate.copy_ready,false);
 assert.match(b.handoff_package.markdown,/tool \/ product page/);assert.match(b.handoff_package.markdown,/does not generate product claims/);
 assert.equal(h.writes.length,0);
 // Free check wording.
 const s=summarizeFreeGrowth(g,{url:guideUrl,query:serp39.query});
 assert.equal(s.headline,'Google shows tool pages for this search');assert.match(s.steps[0],/Only if you offer such a tool/);
});

const toolUrl='https://contentscale.site/ai-citation-tracker/';
const toolSite={...toolPages,[toolUrl]:html('AI Citation Tracker — Track Where AI Answers Cite You',[['Track citations in AI answers',para('citation tracking in AI answers','AI engines cite different sources each week.')],
 ['Citation history per page',para('the citation history','one week of data says little about a trend.')]])};
test('report 39: a tool page tracked for this search term is the destination; no new page is advised',async()=>{
 const h=harness({query:serp39.query,pageUrl:guideUrl,pageHtml:guideHtml,leads:leads39,pages:toolSite,inventory:[{id:9,tracker_client_id:4,url:toolUrl,keyword:'ai citation tracker'}]});
 const g=await h.call(h.GET),d=g.editorial_decision_gate;
 assert.equal(g.query_selection.destination.url,toolUrl);
 assert.notEqual(d.decision,'NEW_DISTINCT_PAGE');assert.equal(d.target_url,toolUrl);assert.equal(g.destination_intent.class,'PRODUCT_TOOL');
});
test('report 39: a tool page found only as a related page replaces the guide as destination',async()=>{
 const h=harness({query:serp39.query,pageUrl:guideUrl,pageHtml:guideHtml,leads:leads39,pages:toolSite,inventory:[{id:9,tracker_client_id:4,url:toolUrl,keyword:'citation tracker software'}]});
 const g=await h.call(h.GET),d=g.editorial_decision_gate;
 assert.notEqual(d.decision,'NEW_DISTINCT_PAGE','no new page when the site already has a tool page');
 assert.equal(d.target_url,toolUrl);
 assert.equal(g.destination_intent.retargeted_from,guideUrl);assert.equal(g.destination_intent.class,'PRODUCT_TOOL');
});

// ---------- Report 42: another meaning ----------
const craftPage=html('CRAFT Framework: 5 Proven Steps to Dominate AI Overviews in 2026',craft.destination_headings.filter(h=>/^(Step|What|CRAFT|The 5)/.test(h)).slice(0,6)
 .map(h=>[h,para('the editing step','content that is cut, reviewed, illustrated, fact-checked and trusted is cited more often by AI Overviews.')]));
const promptPages=Object.fromEntries(craft.leads.map(l=>[l.url,html(l.title,[['Context and role in a prompt',para('the prompt context','a prompt without context gives a generic answer.')],
 ['Format and tone of the answer',para('the answer format','a prompt that names the format gets usable output.')],['Example prompts',para('example prompts','copying a prompt template saves time.')]])]));

test('meaning check: report 42 differs, earlier production SERPs do not',()=>{
 const m=checkQueryMeaning({query:craft.query,leads:craft.leads,destinationHtml:craftPage});
 assert.equal(m.status,'DIFFERENT_MEANING');assert.deepEqual(m.absent_on_page.map(x=>x.word),['prompts']);
 // Wind damage (report 41): "storm" is in most titles, and the page itself uses it: same meaning.
 const wind=checkQueryMeaning({query:'wind damage roof repair nj',leads:[{url:'https://a.example/',title:'Storm Damage Roof Repair NJ'},{url:'https://b.example/',title:'Storm damage roofing'},
  {url:'https://c.example/',title:'Wind Damage Roof Repair NJ'},{url:'https://d.example/',title:'Roof Storm Damage Repair'}],destinationHtml:html('Storm & Wind Damage Roof Repair in New Jersey',[])});
 assert.equal(wind.status,'SAME_MEANING');
 assert.equal(checkQueryMeaning({query:'x',leads:[{url:'https://a.example/',title:'x'}],destinationHtml:'<p>x</p>'}).status,'NOT_CHECKED');
});

test('report 42: Google means something else: blocked with that reason, never rewritten toward the other subject',async()=>{
 const h=harness({query:craft.query,pageUrl:craft.url,pageHtml:craftPage,leads:craft.leads,pages:promptPages});
 const g=await h.call(h.GET),d=g.editorial_decision_gate;
 assert.equal(g.serp_meaning.status,'DIFFERENT_MEANING');
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'QUERY_MEANS_SOMETHING_ELSE');
 assert.match(d.reason,/"prompts" \(4 of 5 titles\)/);assert.match(d.next_action,/do not rewrite it toward the other meaning/);
 assert.equal(d.evidence_status.label,'SEARCH_TERM_HAS_ANOTHER_MEANING_NO_COMPARISON');
 const r=await h.call(h.POST,'owner');
 assert.equal(h.providerCalls.length,0,'no draft is generated');assert.equal(r.editorial_decision_gate.decision,'DATA_BLOCKED');
 const s=summarizeFreeGrowth(g,{url:craft.url,query:craft.query});
 assert.equal(s.headline,'Google means something else by this search term');assert.match(s.explanation,/“prompts”/);
});
