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
  // No saved report: one visible start button after the setup (#489), and no CMS preparation before any research.
  await p.waitForSelector('#growthFirstStart');assert.equal(await p.locator('#growthFinalActions').isVisible(),false);
  await p.click('#growthFirstStart');
  await p.waitForFunction(()=>/^Research ready/.test((document.getElementById('researchStatus')||{}).textContent||''),null,{timeout:60000});
  // One complete brief with priorities and the full content inventory; nothing has to be ticked first (#489).
  await p.waitForSelector('#growthAiContentTasks',{state:'visible'});
  assert.match(await p.textContent('#growthAiContentTasks'),/Complete Growth AI Research & Writing Brief/);
  assert.equal(await p.locator('#growthBriefPriorities').isVisible(),true);
  assert.equal(await p.getByRole('button',{name:'Download full AI brief (.md)'}).count(),1);
  assert.doesNotMatch(await p.textContent('body'),/STEP \d OF 3/,'no old three-step bar');
  // Manual tasks need business or account action; the facts come from the research, not invented.
  await p.waitForFunction(()=>/Manual website \/ business actions \(\d+ open\)/.test(document.getElementById('growthSelfDo').textContent),null,{timeout:30000});
  const self=await p.textContent('#growthSelfDo');assert.match(self,/State on your page: a price or price range/);assert.match(self,/Get the page into Bing/);
  // AI research is visible before the brief, not hidden in a closed evidence tab.
  assert.equal(await p.locator('#growthAiEarly').isVisible(),true);
  assert.ok(await p.evaluate(()=>{const a=document.getElementById('growthAiEarly'),b=document.getElementById('growthAiContentTasks');
   return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)}),'AI research comes before the brief');
  // CMS preparation is optional and nothing is written or published automatically; publishing and measuring follow.
  assert.match(await p.textContent('#growthFinalActions h2'),/Optional CMS preparation/);
  assert.equal(await p.locator('#growthEditorHandoff').isVisible(),false);
  assert.equal(await p.locator('#growthPublishWizard').count(),1);
  assert.deepEqual(errs,[]);
 }finally{await b.close();srv.close()}
});

test('AI content tasks go to external AI briefing, not manual Do it yourself completion',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const ui=fs.readFileSync(path.join(__dirname,'../public/growth-automatic-report-ui.js'),'utf8');
 const manual=ui.slice(ui.indexOf('function selfItems(d)'),ui.indexOf('function aiContentTasks(d)'));
 assert.doesNotMatch(manual,/missing_topics|aitopic:/);
 assert.match(manual,/missing_facts/);
 assert.match(ui,/function externalAiContentBrief\(d,topics\)/);
 assert.match(ui,/function renderAiContentTasks\(d,choice\)/);
 assert.match(ui,/Copy FULL AI research \+ writing brief/);
 const builder=fs.readFileSync(path.join(__dirname,'../public/growth-complete-ai-brief.js'),'utf8');
 assert.match(builder,/Do not infer cities, counties, licensing/);
 assert.match(ui,/Manual website \/ business actions/);
 assert.match(ui,/renderAiContentTasks\(last,document\.getElementById\('growthGapChoice'\)\)/);
});
