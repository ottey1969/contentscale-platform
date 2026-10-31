'use strict';
// The AI check inside Tracker Growth: the prompt for the research's search term, answers pasted by the owner, stored per
// page + search term + AI system, read fresh on every response without re-running the Google research.
// LABELLED SYNTHETIC: pages, search results and AI answers; the quick-scan paste is the real one from check 5M0tfxjeQawH.
const test=require('node:test'),assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');

const URL_='https://acme-roofing.example/roof-repair-lodi-nj/',QUERY='roof repair lodi nj';
const own='<html><head><title>Roof Repair in Lodi, NJ</title></head><body><h1>Roof Repair in Lodi, NJ</h1><h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p></body></html>';
const para='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property.';
const comp=h=>'<html><body><article><h1>'+h+'</h1><h2>How a repair estimate is built</h2>'+[1,2,3,4].map(()=>'<p>'+para+'</p>').join('')+'</article></body></html>';
const pages={[URL_]:own,'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ'),'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ')};
const leads=Object.keys(pages).slice(1).map((url,i)=>({url,title:'Roof Repair NJ '+i,snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));

function setup({owner=true}={}){
 const route={},post={},stored=[];let searches=0;
 const pool={query:async q=>{if(q.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(q))return {rows:[{id:7,tracker_client_id:3,url:URL_,keyword:QUERY,brief_content:null,saved_html:null}]};return {rows:[]}}};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){post[p]=h}},pool,(req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:owner,pages:[{id:7,url:URL_,keyword:QUERY,case_study_active:false}]};next()},{
  retryDelayMs:0,judgeTasks:require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
  fetchLive:async url=>{const html=pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});return {html,final_url:url,retrieved_at:'2026-10-31T10:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async({query})=>{searches++;return {status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-31T10:00:00Z'}},
  saveAiAnswer:async a=>{const i=stored.findIndex(x=>x.engine===a.engine&&x.query===a.query);const row={...a,raw_text:a.rawText,created_at:new Date().toISOString()};if(i>=0)stored[i]=row;else stored.push(row)},
  loadAiAnswers:async({query})=>stored.filter(x=>x.query.toLowerCase()===query.toLowerCase())});
 const call=async(stack,req)=>{const res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 const get=()=>call(route['/api/tracker-client/:token/growth/auto-research'],{params:{token:'t'},query:{page_id:'7'}});
 const paste=body=>call(post['/api/tracker-client/:token/growth/ai-answer'],{params:{token:'t'},query:{page_id:'7'},body});
 const early=()=>call(route['/api/tracker-client/:token/growth/ai-check'],{params:{token:'t'},query:{page_id:'7'}});
 return {get,paste,early,stored,searches:()=>searches};
}

test('the research offers the AI prompt for its own search term; a pasted answer counts at once without a new Google research',async()=>{
 const s=setup();
 const first=await s.get();assert.equal(first.statusCode,200);
 const c=first.body.ai_check;assert.equal(c.search_term,QUERY);assert.match(c.prompt,/QUERY:\s*roof repair lodi nj/);assert.equal(c.summary.checked,0);assert.equal(c.can_paste,true);
 const n=s.searches();
 const r=await s.paste({engine:'perplexity',query:QUERY,page_url:URL_,google_urls:leads.map(l=>l.url),text:'ANSWER: Get a written estimate.\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/\nhttps://acme-roofing.example/roof-repair-lodi-nj/'});
 assert.equal(r.statusCode,200);assert.equal(r.body.ai_check.summary.checked,1);assert.equal(r.body.ai_check.summary.exact_page_by,1);
 assert.deepEqual(r.body.ai_check.summary.also_in_google,['roofer-a.example']);
 const again=await s.get();assert.equal(again.body.ai_check.summary.checked,1);assert.equal(again.body.ai_visibility.pasted_for_this_search,1);
 assert.equal(s.searches(),n,'pasting and reloading never re-runs the Google research');
});

test('answers to another prompt, other AI systems and non-owners are refused; old answers are not counted',async()=>{
 const s=setup();await s.get();
 const quick=require('./fixtures/growth-free-5M0tfxjeQawH/check.json').ai_paste_claude;
 const q=await s.paste({engine:'claude',query:QUERY,text:quick});assert.equal(q.statusCode,400);assert.equal(q.body.code,'ANSWER_TO_ANOTHER_PROMPT');
 assert.equal((await s.paste({engine:'bard',query:QUERY,text:'x'})).body.code,'UNKNOWN_AI_SYSTEM');
 assert.equal(s.stored.length,0);
 const viewer=setup({owner:false});await viewer.get();
 assert.equal((await viewer.paste({engine:'claude',query:QUERY,text:'ANSWER: x\nRESOURCES:\nhttps://a.example/'})).statusCode,403);
 await s.paste({engine:'copilot',query:QUERY,text:'ANSWER: x\nRESOURCES:\nhttps://a.example/'});
 s.stored[0].created_at=new Date(Date.now()-20*86400000).toISOString();
 const r=await s.get();assert.equal(r.body.ai_check.summary.checked,0);assert.equal(r.body.ai_check.older_answers_not_counted,1);
});

test('the AI check is optional and available before the research has finished (tracked keyword), without running research',async()=>{
 const s=setup();
 const e=await s.early();assert.equal(e.statusCode,200);
 assert.equal(e.body.ai_check.search_term,QUERY);assert.equal(e.body.ai_check.basis,'TRACKED_KEYWORD_BEFORE_RESEARCH');assert.match(e.body.ai_check.prompt,/QUERY:\s*roof repair lodi nj/);
 assert.equal(s.searches(),0,'no Google research for the AI check');
 await s.paste({engine:'chatgpt',query:QUERY,text:'ANSWER: x\nRESOURCES:\nhttps://roofer-b.example/services/roof-repair/'});
 const r=await s.get();assert.equal(r.body.ai_check.summary.checked,1,'the early answer counts in the finished research');
});
