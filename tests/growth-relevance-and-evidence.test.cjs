'use strict';
// Owner review of report 61 and of a Free Growth check (homepage, "content at scale", a DAM topic proposed):
//  1. Google redirect links (google.com/goto, seen with gl=nl) were dropped as "search infrastructure": 12 relevant
//     articles lost. They are now resolved, or reported as unresolved results.
//  2. Without enough evidence (fewer than two readable ranking pages, or a "data blocked" research decision) nothing
//     is proposed, recommended or written; the list stays visible.
//  3. A topic the AI judges not to serve the search is "probably not relevant": shown, no section, not written.
//     One ranking page and no word in common with the search term: weak evidence, no section proposed.
//  4. The Free check takes target market and language like the Tracker, and the writing routes follow the evidence.
// Real data: report 61's organic results (5 direct links, 12 Google redirect links with their titles) and its
// AI-grouped topics. LABELLED SYNTHETIC: the redirect targets (Google's encrypted links cannot be resolved offline),
// the AI fit judgements (MODEL_ANSWER), the DAM-like topic and the minimal pages.
const test=require('node:test'),assert=require('node:assert/strict');
const {optionalGoogleOrganicDiscovery,unwrapGoogleLinks}=require('../src/growth-public-search-discovery.cjs');
const {buildGapList}=require('../src/growth-gap-list.cjs');
const {validateTopics}=require('../src/growth-competitor-overview.cjs');
const real=require('./fixtures/growth-report-61/serp-and-topics.json');
const payload=()=>({organic:[...real.direct,...real.wrapped].map((x,i)=>({title:x.title,link:x.link,snippet:'',position:i+1}))});

test('Google redirect links are real results: resolved when Google forwards them, otherwise reported as unresolved',async()=>{
 const asked=[];
 const fetchImpl=async(url,opts)=>{
  if(String(url).startsWith('https://google.serper.dev/')){return {ok:true,json:async()=>payload()}}
  asked.push(url);
  const i=real.wrapped.findIndex(w=>w.link===url);
  // SYNTHETIC targets for the first eight; the rest do not answer.
  if(i>=0&&i<8)return {status:302,headers:{get:k=>k==='location'?'https://scaling-guide-'+i+'.example/content-scaling/':null}};
  throw Object.assign(Error('timeout'),{code:'TIMEOUT'});
 };
 const r=await optionalGoogleOrganicDiscovery({query:real.query,ownUrl:real.own_url,locale:{country:'NL',gl:'nl',hl:'en'},key:'k',fetchImpl});
 assert.deepEqual(r.google_redirect_links,{received:12,resolved:8,unresolved:4,unresolved_reasons:{REQUEST_FAILED:4}});
 assert(asked.every(u=>/^https:\/\/www\.google\.com\/goto\?url=/.test(u)),'only the redirect links are followed');
 assert(r.leads.some(l=>/scaling-guide-\d\.example/.test(l.url)),'resolved results become usable leads');
 assert(!r.rejected_leads.some(x=>x.reason==='SEARCH_OR_SOCIAL_INFRASTRUCTURE'&&/google\.com\/goto/.test(x.url)),'never called infrastructure again');
 assert(r.rejected_leads.filter(x=>/google\.com\/goto/.test(x.url)).every(x=>x.reason==='GOOGLE_REDIRECT_LINK_NOT_RESOLVED'));
 // With only the unresolved ones left (no direct results), they are logged as such.
 const only=await optionalGoogleOrganicDiscovery({query:real.query,ownUrl:real.own_url,key:'k',fetchImpl:async url=>{
  if(String(url).startsWith('https://google.serper.dev/'))return {ok:true,json:async()=>({organic:real.wrapped.map(w=>({title:w.title,link:w.link}))})};
  throw Error('no answer')}});
 assert.equal(only.rejected_leads.filter(x=>x.reason==='GOOGLE_REDIRECT_LINK_NOT_RESOLVED').length>=12,true);assert.equal(only.leads.length,0);
 assert.equal(only.rejected_reasons.GOOGLE_REDIRECT_LINK_NOT_RESOLVED,12,'counted per reason, also beyond the 20 logged examples');
});

test('a plain redirect link (/url?q=) is unwrapped without any request',async()=>{
 const p={organic:[{title:'Guide',link:'https://www.google.com/url?q=https://example.org/guide/&sa=U'}]};
 const s=await unwrapGoogleLinks(p,{fetchImpl:async()=>{throw Error('no request expected')}});
 assert.deepEqual(s,{received:1,resolved:1,unresolved:0});assert.equal(p.organic[0].link,'https://example.org/guide/');
});

const sectionsOf=t=>t.hosts.map(h=>({host:h,heading:t.headings[0],excerpt:''}));
function overview({readable=3,topics}){
 return {status:'OBSERVED',ranking_pages_read:readable,topics_status:'GROUPED',ungrouped_sections:[],
  topics,elements_they_have_and_this_page_lacks:[],structured_data_they_have_and_this_page_lacks:[],length:{},ranking_pages:[],this_page_sections:[]};
}
const realTopics=()=>real.topics.map(t=>({topic:t.topic,this_page:t.this_page,this_page_heading:null,ranking_pages:t.hosts.length,sections:sectionsOf(t)}));

test('one readable ranking page: nothing is proposed, recommended or written; the list stays visible',()=>{
 const g=buildGapList({competitor_overview:overview({readable:1,topics:realTopics()}),search_discovery:{target_query:real.query}});
 assert.equal(g.evidence.status,'INSUFFICIENT_EVIDENCE');assert.equal(g.writing_allowed,false);assert.match(g.evidence.reason,/Only 1 readable ranking page/);
 assert.deepEqual(g.recommended,[]);
 const w=g.items.filter(x=>x.writable);assert(w.length>5,'still visible and choosable for the brief');
 assert(w.every(x=>/^No section proposed: only 1 readable ranking page/.test(x.priority.suggested_action)));
 assert.equal(g.research.evidence_status,'INSUFFICIENT_EVIDENCE');
});

test('a "data blocked" research decision blocks proposals in the list too (one outcome)',()=>{
 const g=buildGapList({competitor_overview:overview({topics:realTopics()}),search_discovery:{target_query:real.query},editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'SERP_INTENT_UNCLEAR'}});
 assert.equal(g.writing_allowed,false);assert.match(g.evidence.reason,/data blocked.*serp intent unclear/);
 assert(g.items.filter(x=>x.writable).every(x=>/data blocked/.test(x.priority.suggested_action)));
});

test('a topic the AI judges not to serve the search: probably not relevant, no section, not written; weak evidence otherwise',()=>{
 // MODEL_ANSWER on report 61's real topics, plus a SYNTHETIC DAM-like topic from one vendor page.
 const topics=[...realTopics(),{topic:'Workflow changes when moving from shared drives to Digital Asset Management',this_page:'NO',this_page_heading:null,ranking_pages:1,
  sections:[{host:'aprimo.com',heading:'Workflow changes when transitioning from shared drives to DAM',excerpt:''}],fits_search:'NO',fits_reason:'about a DAM product, not about scaling content'}];
 const g=buildGapList({competitor_overview:overview({topics}),search_discovery:{target_query:'content at scale'}});
 const dam=g.items.find(x=>/Digital Asset Management/.test(x.title));
 assert.equal(dam.group,'NOT_RELEVANT');assert.equal(dam.writable,false);assert.equal(dam.recommended,undefined);
 assert.match(dam.priority.suggested_action,/^No section proposed: the AI judged that this topic does not serve someone searching this term \(about a DAM product/);
 assert(g.groups.some(x=>x.id==='NOT_RELEVANT'));
 // Real topic from one page that shares no word with the search term: weak evidence, no section proposed, still choosable.
 const lone=g.items.find(x=>x.title==='Diversifying content formats');
 assert.equal(lone.relevance?.status,undefined,'shares "content" with the search term');
 const weak=g.items.find(x=>x.relevance?.status==='WEAK_EVIDENCE');
 if(weak){assert.equal(weak.writable,true);assert.match(weak.priority.suggested_action,/^No section proposed/)}
 assert(g.items.filter(x=>x.recommended).every(x=>!x.relevance&&x.priority.sources>=2));
});

test('the topic grouping returns the AI fit per topic (ids, MODEL_ANSWER)',()=>{
 const competitors=[{host:'aprimo.com',url:'https://www.aprimo.com/x',sections:[{heading:'Content Scaling: Everything You Need To Know',excerpt:''},{heading:'Workflow changes when transitioning from shared drives to DAM',excerpt:''}]}];
 const v=validateTopics(JSON.stringify({topics:[{topic:'Scaling content',sections:['c1'],page_covers:'PARTLY',page_section:null,fits_search:'YES'},
  {topic:'DAM workflow',sections:['c2'],page_covers:'NO',page_section:null,fits_search:'no',fits_reason:'about a DAM product'}]}),competitors,[]);
 assert.equal(v.topics.find(t=>t.topic==='DAM workflow').fits_search,'NO');assert.equal(v.topics.find(t=>t.topic==='DAM workflow').fits_reason,'about a DAM product');
 assert.equal(v.topics.find(t=>t.topic==='Scaling content').fits_reason,undefined);
});

test('the Tracker writing route refuses research without enough evidence',async()=>{
 const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
 const route={};let calls=0;
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:true,pages:[{id:1,url:real.own_url,case_study_active:false}]};next()},{
  fetchLive:async()=>({html:'<p>x</p>'}),completeOwnerDraft:async()=>{calls++;return {statusCode:200,body:{}}},
  loadGapList:async()=>({id:3,target_page_id:1,target_url:real.own_url,items:[{id:'t-1',writable:true,title:'x'}],research:{evidence_status:'INSUFFICIENT_EVIDENCE'}})});
 const req={params:{token:'t'},query:{page_id:'1'},body:{gap_list_id:3,item_ids:['t-1']}},res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research/write'];
 await new Promise(ok=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()})};at(0)});
 assert.equal(res.statusCode,409);assert.equal(res.body.code,'NOT_ENOUGH_EVIDENCE_TO_WRITE');assert.equal(calls,0);
});

test('a Google redirect notice page (HTTP 200) is read for its target; a consent redirect is reported as such',async()=>{
 const [a,b,c]=real.wrapped;
 const p={organic:[a,b,c].map(w=>({title:w.title,link:w.link}))};
 // SYNTHETIC answers: a notice page with the target link, an EU consent redirect, and a refusal.
 const s=await unwrapGoogleLinks(p,{fetchImpl:async url=>{
  if(url===a.link)return {status:200,headers:{get:()=>null},text:async()=>'<html><body>Redirect Notice <a href="https://www.google.com/">Google</a> <a href="https://guide.example/content-scaling/?a=1&amp;b=2">guide</a></body></html>'};
  if(url===b.link)return {status:302,headers:{get:k=>k==='location'?'https://consent.google.com/ml?continue=x':null}};
  return {status:429,headers:{get:()=>null}};
 }});
 assert.equal(p.organic[0].link,'https://guide.example/content-scaling/?a=1&b=2');
 assert.deepEqual(s,{received:3,resolved:1,unresolved:2,unresolved_reasons:{REDIRECTED_TO_GOOGLE_CONSENT:1,HTTP_429:1}});
});

test('Free check mAOlLCrU07Jv (real): only 2 usable Google results; the result says of how many and why the rest was not used',()=>{
 const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
 const live=require('./fixtures/growth-free-mAOlLCrU07Jv/search.json');
 const s=summarizeFreeGrowth(live.report,{query:live.query,url:live.url});
 assert.equal(s.decision,'DATA_BLOCKED');
 assert.match(s.explanation,/Only 2 Google result\(s\) could be used \(of 9 received\)/);
 assert.match(s.explanation,/11 × Google link that could not be opened/);
 assert.match(s.steps[0],/11 result\(s\) came as Google redirect links/);
 assert.deepEqual(s.checked.results_not_used.map(x=>x.code+':'+x.count),
  ['GOOGLE_REDIRECT_LINK_NOT_RESOLVED:11','QUERY_TERMS_NOT_IN_TITLE:2','SEARCH_OR_SOCIAL_INFRASTRUCTURE:2','OWN_SITE:1','DIFFERENT_PRODUCT_OR_NAVIGATION_INTENT:1']);
 assert(s.limitations.some(x=>/only answers you paste below are analysed/.test(x)));
});

test('Free check 5M0tfxjeQawH (real): ranking pages that do not agree get comparison steps, not "check that your page opens"',()=>{
 const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
 const live=require('./fixtures/growth-free-5M0tfxjeQawH/check.json');
 const s=summarizeFreeGrowth(live.report,{query:live.query,url:live.url});
 assert.equal(s.decision,'DATA_BLOCKED');assert.match(s.explanation,/do not agree on what a good answer needs/);
 assert.match(s.steps[0],/what each ranking page covers/);assert(!s.steps.some(x=>/private browser window/.test(x)));
 assert.equal(s.checked.google_redirect_links.unresolved_reasons.NO_TARGET_ON_GOOGLE_PAGE,11);
 // A page that cannot be opened keeps the access steps.
 const own=summarizeFreeGrowth({editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'TARGET_HTML_UNAVAILABLE'}},{query:'x'});
 assert.match(own.steps[0],/private browser window/);
 const {otherPrompt}=require('../src/growth-free/ai-answers.cjs');
 assert.equal(otherPrompt(live.ai_paste_claude),'QUICK_SCAN_PROMPT');
 assert.equal(otherPrompt('ANSWER: QUESTION 1 is about scale. QUESTION 2 too.\nRESOURCES:\nhttps://example.org/a'),null,'an answer with a RESOURCES list is analysed normally');
});

test('Google redirect page: a script redirect with escapes is read; otherwise the report gets a sample of what the page was',async()=>{
 const link=real.wrapped[0].link,page=html=>async()=>({status:200,headers:{get:()=>null},text:async()=>html});
 // SYNTHETIC page bodies (the production pages for 5M0tfxjeQawH had no target in a link or meta refresh).
 const p1={organic:[{title:'t',link}]};
 const s1=await unwrapGoogleLinks(p1,{fetchImpl:page('<script>window.location.replace("https:\\/\\/www.vectoron.ai\\/blog\\/content-scaling\\/content-at-scale-meaning?a\\x3d1\\x26b\\x3d2")</script>')});
 assert.equal(p1.organic[0].link,'https://www.vectoron.ai/blog/content-scaling/content-at-scale-meaning?a=1&b=2');assert.equal(s1.resolved,1);
 const p2={organic:[{title:'t',link}]};
 const s2=await unwrapGoogleLinks(p2,{fetchImpl:page('<html><head><title>Before you continue to Google</title></head><body><script>x()</script><a href="https://policies.google.com/">p</a><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>')});
 assert.equal(s2.resolved,0,'a URL outside a redirect construct is never taken as the target');
 assert.deepEqual(s2.sample,{status:200,bytes:s2.sample.bytes,title:'Before you continue to Google',has_script:true,consent:true,unusual_traffic:false});
});
