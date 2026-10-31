'use strict';
// The search term means something else on Google when the ranking pages that were READ are about another subject, even
// when the result titles (firm names) do not show it. Real data: report 65 ("geo consultant": geotechnical and
// environmental engineering firms for a Generative Engine Optimization page).
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTopics}=require('../src/growth-competitor-overview.cjs');
const {inferSerpIntent}=require('../src/growth-reader-task-coverage.cjs');
const {checkQueryMeaning}=require('../src/growth-serp-meaning.cjs');
const f=require('./fixtures/growth-report-65/serp.json');
const pages=f.read_pages.map(p=>({host:new URL(p.url).hostname.replace(/^www\./,''),url:p.url,serp_position:1,sections:[{heading:p.heading,excerpt:String(p.excerpt).slice(0,220)}]}));
const page=[{heading:f.headings.h1[0],excerpt:''},...f.headings.h2.slice(0,5).map(h=>({heading:h,excerpt:''}))];

test('report 65 (real): titles alone do not show the other meaning, and the provider rules would compare the page with them',()=>{
 assert.equal(checkQueryMeaning({query:f.query,leads:f.leads,destinationHtml:'<title>'+f.headings.title+'</title><h1>'+f.headings.h1[0]+'</h1>'}).status,'SAME_MEANING');
 assert.equal(inferSerpIntent({query:f.query,leads:f.leads}).intent,'SERVICE_PROVIDER','why the subject check is needed');
});

test('report 65 (real pages, answer LABELLED SYNTHETIC): both read pages about another subject → different subject',()=>{
 const answer=JSON.stringify({topics:[],pages:pages.map(p=>({host:p.host,same_subject:'NO',reason:'geotechnical and environmental engineering, not Generative Engine Optimization'}))});
 const r=validateTopics(answer,pages,page);
 assert.equal(r.subject_check.status,'DIFFERENT_SUBJECT');assert.equal(r.subject_check.different,2);assert.equal(r.subject_check.of,2);
 assert.match(r.subject_check.pages[0].reason,/geotechnical/);
});

test('same subject, unclear or a minority off-topic is not "different"; unknown hosts are ignored (LABELLED SYNTHETIC answers)',()=>{
 const ans=list=>validateTopics(JSON.stringify({topics:[],pages:list}),pages,page).subject_check;
 assert.equal(ans([{host:pages[0].host,same_subject:'NO'},{host:pages[1].host,same_subject:'YES'}]).status,'SAME_SUBJECT_OR_UNCLEAR');
 assert.equal(ans([{host:pages[0].host,same_subject:'UNSURE'},{host:pages[1].host,same_subject:'UNSURE'}]).status,'SAME_SUBJECT_OR_UNCLEAR');
 assert.equal(ans([{host:'invented.example',same_subject:'NO'},{host:'other.example',same_subject:'NO'}]).status,'NOT_ANSWERED');
 assert.equal(validateTopics(JSON.stringify({topics:[]}),pages,page).subject_check.status,'NOT_ANSWERED','older answers without pages');
});

test('in the research: a different subject from the read pages becomes "Google means something else" (no comparison, no rewrite)',async()=>{
 const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
 const own='<html><head><title>'+f.headings.title+'</title></head><body><h1>'+f.headings.h1[0]+'</h1>'+f.headings.h2.slice(0,6).map(h=>'<h2>'+h+'</h2><p>'+'We get brands cited in AI answers from Google AI Overviews, Perplexity and ChatGPT by improving pages. '.repeat(3)+'</p>').join('')+'</body></html>';
 // LABELLED SYNTHETIC competitor bodies built from the real excerpts (repeated so the pages are readable articles).
 const body=p=>'<html><body><article><h1>'+p.heading+'</h1>'+[1,2,3,4].map(()=>'<h2>'+p.heading+'</h2><p>'+p.excerpt+' '+p.excerpt+'</p>').join('')+'</article></body></html>';
 const html={[f.url]:own};for(const p of f.read_pages)html[p.url]=body(p);
 const route={};let overviewCalls=0;
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h}},{query:async q=>q.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(q)?{rows:[{id:5,tracker_client_id:3,url:f.url,keyword:f.query,brief_content:null,saved_html:null}]}:{rows:[]}},
  (req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:false,pages:[{id:5,url:f.url,keyword:f.query,case_study_active:false}]};next()},{retryDelayMs:0,
  judgeTasks:require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
  fetchLive:async url=>{if(!html[url])throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});return {html:html[url],final_url:url,retrieved_at:'2026-10-31T11:58:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async({query})=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads:f.leads.map(l=>({...l,source:'SERPER_GOOGLE_ORGANIC'})),checked_at:'2026-10-31T11:58:00Z'}),
  buildOverview:async({competitors})=>{overviewCalls++;return {status:'OBSERVED',ranking_pages_read:competitors.length,ranking_pages:[],topics:[],
   subject_check:{status:'DIFFERENT_SUBJECT',different:competitors.length,of:competitors.length,pages:competitors.map(c=>({host:new URL(c.url).hostname.replace(/^www\./,''),same_subject:'NO',reason:'geotechnical engineering'}))}}}});
 const res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}},req={params:{token:'t'},query:{page_id:'5'}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'];
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 const r=res.body;
 assert.equal(overviewCalls,1);
 assert.equal(r.serp_meaning.status,'DIFFERENT_MEANING');assert.equal(r.serp_meaning.basis,'AI_SUBJECT_CHECK_OF_READ_RANKING_PAGES');
 assert.notEqual(r.editorial_decision_gate.decision,'IMPROVE_EXISTING');
 assert((r.editorial_decision_gate.missing_evidence||[]).some(m=>m.code==='QUERY_MEANS_SOMETHING_ELSE'&&/another subject: .*geotechnical/.test(m.detail)),JSON.stringify(r.editorial_decision_gate).slice(0,600));
});
