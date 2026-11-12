'use strict';
// Tracker Growth in a browser (TEST pages, TEST Google results, a stored TEST AI answer): one clear flow, as Free Growth
// (owner 2026-11-12: "something must be done, then the answer appears; what was done goes under a tab").
const test=require('node:test'),assert=require('node:assert/strict');
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
test('Tracker Growth: do this now, three steps, do it yourself, evidence in tabs, next action follows the page',{skip:!chromium&&'Playwright not installed',timeout:120000},async()=>{
// Local harness: the real Tracker Growth page with TEST pages, TEST Google results and stored TEST AI answers.
 const R=require('path').join(__dirname,'..')+'/';
 const express=require(R+'node_modules/express');const path=require('path');
 const {registerGrowthAutomaticResearch}=require(R+'src/tracker-growth-automatic-routes.cjs');
 const ai=require(R+'src/growth-free/ai-answers.cjs');
 
 const URL_='https://acme-roofing.example/emergency-roof-repair-nj/',QUERY='emergency roof repair nj';
 const para=t=>'<p>'+(t+' ').repeat(6)+'</p>';
 const own='<html><head><title>Emergency Roof Repair NJ</title></head><body><h1>Emergency Roof Repair in NJ</h1><h2>Our emergency roof repair service</h2>'+para('Our crew repairs leaking roofs in New Jersey after storms, day and night.')+'<h2>What counts as an emergency</h2>'+para('An active leak during a storm or a tree on the roof is an emergency for the house.')+'</body></html>';
 const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(([a,b])=>'<h2>'+a+'</h2>'+para(b)).join('')+'</article></body></html>';
 const pages={[URL_]:own,
  'https://roofer-a.example/emergency/':comp('Emergency roofing NJ',[['How much does emergency roof repair cost','Emergency repairs usually cost $300 to $1,500 depending on the damage that the crew finds on site.'],['How a tarp is installed','A tarp is anchored with battens over the damaged area until the permanent repair can be done safely.']]),
  'https://roofer-b.example/storm/':comp('Storm damage roof repair',[['Emergency roof repair cost','A tarp starts at $250 and the repair is quoted after the inspection of the roof by the crew.'],['Insurance claims after a storm','Photograph the damage and keep the receipts for your insurer before any permanent repair is done.']]),
  'https://roofer-c.example/tarp/':comp('Emergency tarping',[['What we tarp','Trees through the roof, wind-stripped shingles and torn membranes are covered the same night.'],['Arrival time after a call','Arrival within 60 minutes is typical in most of the county after a call at night.']])};
 const leads=['https://roofer-a.example/emergency/','https://roofer-b.example/storm/'].map((url,i)=>({url,title:'Emergency Roof Repair NJ '+i,snippet:'Emergency roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
 const stored=[];const now=new Date().toISOString();
 const t1='ANSWER: TEST emergency roof repair answer.\nRESOURCES:\nhttps://roofer-c.example/tarp/\nhttps://roofer-b.example/storm/';
 stored.push({engine:'chatgpt',query:QUERY,raw_text:t1,parsed:ai.parseAiAnswer(t1,{pageUrl:URL_,query:QUERY}),created_at:now});
 const app=express();app.use(express.json());
 app.use(express.static(R+'public'));
 const data=(req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:true,pages:[{id:7,url:URL_,keyword:QUERY,case_study_active:false}]};next()};
 const pool={query:async q=>{if(q.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(q))return {rows:[{id:7,tracker_client_id:3,url:URL_,keyword:QUERY,brief_content:null,saved_html:null}]};return {rows:[]}}};
 registerGrowthAutomaticResearch(app,pool,data,{completeOwnerDraft:async()=>({statusCode:200,body:{}}),retryDelayMs:0,aiGapModel:null,autoGroundedAnswer:async()=>({status:'NOT_CONFIGURED'}),judgeTasks:require(R+'tests/helpers/meaning-check-stand-in.cjs').judgeTasks,
  fetchLive:async url=>{const html=pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});return {html,final_url:url,retrieved_at:now,truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async({query})=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:now}),
  saveAiAnswer:async a=>{stored.push({...a,raw_text:a.rawText,created_at:new Date().toISOString()})},loadAiAnswers:async({query})=>stored.filter(x=>x.query.toLowerCase()===query.toLowerCase())});
 
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;const b=await chromium.launch();
 try{const p=await b.newPage({viewport:{width:1200,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base+'/track/t/growth/auto-research?page_id=7&query='+encodeURIComponent(QUERY));
  // No saved report: a visible start button (not hidden under Advanced), and no "concepts are saved" before any research.
  await p.waitForSelector('#growthStartResearch');assert.equal(await p.locator('#growthFinalActions').isVisible(),false);
  await p.click('#growthStartResearch');
  await p.waitForSelector('#trackerNextAction',{timeout:60000});
  assert.match(await p.textContent('#trackerNextAction'),/STEP 1 OF 3 · DO THIS NOW[^]*Choose what to add to your page/);
  assert.match(await p.textContent('#researchStatus'),/^Research ready/);
  assert.match(await p.textContent('#growthGapChoice h2'),/Step 1 · Choose what to add/);
  assert.match(await p.textContent('#growthFinalActions h2'),/Step 2 · Write and prepare the CMS package/);
  assert.match(await p.textContent('#growthFinalActions'),/Nothing written yet/);assert.equal(await p.locator('#growthEditorHandoff').isVisible(),false);
  // The evidence is closed, in tabs; the AI comparison feeds "Do it yourself" (facts, topics, Bing, listings).
  assert.equal(await p.locator('#growthEvidenceAll').evaluate(e=>e.open),false);
  await p.waitForFunction(()=>/Do it yourself \((?:[3-9]|\d\d) open\)/.test(document.getElementById('growthSelfDo').textContent),null,{timeout:30000});
  const self=await p.textContent('#growthSelfDo');assert.match(self,/State on your page: a price or price range/);assert.match(self,/Get the page into Bing/);
  // Ticking a topic far down updates the next action, and the bar at the bottom carries it.
  const pick=p.locator('#growthGapChoice input[type=checkbox]').first();await pick.scrollIntoViewIfNeeded();await pick.check();
  assert.match(await p.textContent('#trackerActionTitle'),/1 chosen topic/);
  await p.waitForFunction(()=>!document.getElementById('trNowBar').hidden);
  const target=(await p.getAttribute('#trNowBar .tg-go','href')).slice(1);
  assert.ok(await p.evaluate(t=>!!document.getElementById(t),target),'the next action never points at a missing element ('+target+')');
  await p.click('#trNowBar .tg-go');await p.waitForTimeout(300);
  assert.ok(Math.abs(await p.evaluate(t=>document.getElementById(t).getBoundingClientRect().top,target))<5,'the bar button scrolls to its target');
  // "See the evidence" opens the closed section; the AI tab shows the AI answers.
  await p.evaluate(()=>window.scrollTo(0,0));await p.click('.tg-found a[href="#growthEvidenceAll"]');
  assert.equal(await p.locator('#growthEvidenceAll').evaluate(e=>e.open),true);
  await p.click('.tg-tabs button[data-tab=ai]');assert.equal(await p.locator('#growthAiCheck').isVisible(),true);
  assert.deepEqual(errs,[]);
 }finally{await b.close();srv.close()}
});
