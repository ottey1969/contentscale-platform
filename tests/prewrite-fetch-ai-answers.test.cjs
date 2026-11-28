'use strict';
// Owner 2026-11-28: "per vraag moet ik de search in AI kunnen opvragen, want nu moet ik het weer handmatig doen."
// Free Pre-Write fetches the answer per AI system for the question, the owner only (the calls cost money):
// - Google: the real AI Overview through SerpApi (with the page_token step); no AI Overview -> Gemini with Google Search.
// - ChatGPT (OpenAI Responses + web search), Perplexity (Sonar), Claude (web search tool), Copilot (SerpApi bing_copilot).
// The sources come only from the provider's own citation data, never from URLs the model wrote itself.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const request=require('supertest');
const {buildCustomerResearchPrompt}=require('../public/prewrite-ai-answer-research.js');
const {fetchAiAnswer,configuredEngines}=require('../src/prewrite-ai-fetch.cjs');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
const {sign}=require('../src/owner-session.cjs');

const Q='¿Qué seo checker gratis analiza el SEO de mi web?';
const json=body=>({ok:true,status:200,json:async()=>body});
function fake(routes){const calls=[];const f=async(url,opt={})=>{calls.push({url:String(url),opt});for(const [re,fn] of routes)if(re.test(String(url)))return fn(String(url),opt);throw Error('unexpected '+url)};f.calls=calls;return f}
const ENV={SERPAPI_KEY:'serp',GEMINI_API_KEY:'gem',OPENAI_API_KEY:'oai',PERPLEXITY_API_KEY:'pplx',ANTHROPIC_API_KEY:'ant'};

test('Google: the real AI Overview, fetched with its page_token, with the cited references',async()=>{
 const f=fake([[/engine=google_ai_overview/,()=>json({ai_overview:{text_blocks:[{type:'paragraph',snippet:'Un SEO checker gratuito analiza tu web.'},{type:'list',list:[{snippet:'Revisa títulos y metadescripciones.'},{snippet:'Detecta errores técnicos.'}]}],references:[{index:0,link:'https://a.example/checker'},{index:1,link:'https://b.example/guia'}]}})],
  [/engine=google&/,()=>json({ai_overview:{page_token:'TOKEN1'}})]]);
 const r=await fetchAiAnswer('google_aio',Q,{env:ENV,fetchImpl:f,language:'es',country:'es'});
 assert.equal(r.status,'SUCCESS');assert.equal(r.google_source,'ai_overview');assert.match(r.provider,/SerpApi/);
 assert.equal(r.text,'ANSWER:\nUn SEO checker gratuito analiza tu web.\n- Revisa títulos y metadescripciones.\n- Detecta errores técnicos.\n\nRESOURCES:\nhttps://a.example/checker\nhttps://b.example/guia');
 const first=new URL(f.calls[0].url);
 assert.equal(first.searchParams.get('q'),Q);assert.equal(first.searchParams.get('hl'),'es');assert.equal(first.searchParams.get('gl'),'es');
 assert.equal(new URL(f.calls[1].url).searchParams.get('page_token'),'TOKEN1');
});

test('Google without an AI Overview: Gemini with Google Search, marked as Gemini; without Gemini: "no AI Overview shown"',async()=>{
 const f=fake([[/serpapi\.com/,()=>json({organic_results:[{link:'https://x.example'}]})],
  [/generativelanguage/,()=>json({candidates:[{content:{parts:[{text:'Puedes usar un SEO checker gratuito.'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://g.example/a'}}]}}]})]]);
 const r=await fetchAiAnswer('google_aio',Q,{env:ENV,fetchImpl:f,language:'es',country:'es'});
 assert.equal(r.status,'SUCCESS');assert.equal(r.google_source,'gemini');assert.match(r.note,/no AI Overview/i);
 assert.match(r.text,/^ANSWER:\nPuedes usar un SEO checker gratuito\.\n\nRESOURCES:\nhttps:\/\/g\.example\/a$/);
 const none=await fetchAiAnswer('google_aio',Q,{env:{SERPAPI_KEY:'serp'},fetchImpl:f,language:'es',country:'es'});
 assert.equal(none.status,'NO_AI_OVERVIEW');assert.equal(none.google_source,'no_ai_overview');assert.equal(none.text,'');
});

test('Perplexity gets the exact Tracker prompt; a URL the model wrote itself is dropped, only its citations count',async()=>{
 const f=fake([[/api\.perplexity\.ai/,()=>json({choices:[{message:{content:'ANSWER:\nPrueba Seobility o un checker gratuito [1].\n\nRESOURCES:\nhttps://invented.example/made-up'}}],citations:['https://p.example/1','https://p.example/2']})]]);
 const r=await fetchAiAnswer('perplexity',Q,{env:ENV,fetchImpl:f});
 assert.equal(JSON.parse(f.calls[0].opt.body).messages[0].content,buildCustomerResearchPrompt(Q));
 assert.equal(r.text,'ANSWER:\nPrueba Seobility o un checker gratuito [1].\n\nRESOURCES:\nhttps://p.example/1\nhttps://p.example/2');
 assert.doesNotMatch(r.text,/invented/);
});

test('Claude (web search tool): the cited pages; ChatGPT (Responses + web search): the url citations',async()=>{
 const f=fake([[/api\.anthropic\.com/,()=>json({content:[{type:'server_tool_use'},{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://c.example/seen'}]},{type:'text',text:'Un checker gratuito ',citations:[{type:'web_search_result_location',url:'https://c.example/cited'}]},{type:'text',text:'revisa tu web.'}]})],
  [/api\.openai\.com\/v1\/responses/,()=>json({output:[{type:'web_search_call'},{type:'message',content:[{type:'output_text',text:'ANSWER:\nUsa un checker gratuito.\n\nRESOURCES:\nhttps://o.example/a',annotations:[{type:'url_citation',url:'https://o.example/a'},{type:'url_citation',url:'https://o.example/b?utm_source=openai'}]}]}]})]]);
 const c=await fetchAiAnswer('claude',Q,{env:ENV,fetchImpl:f});
 assert.equal(c.text,'ANSWER:\nUn checker gratuito revisa tu web.\n\nRESOURCES:\nhttps://c.example/cited');
 const body=JSON.parse(f.calls[0].opt.body);assert.equal(body.messages[0].content,buildCustomerResearchPrompt(Q));assert.equal(body.tools[0].name,'web_search');
 const o=await fetchAiAnswer('chatgpt',Q,{env:ENV,fetchImpl:f});
 assert.equal(o.text,'ANSWER:\nUsa un checker gratuito.\n\nRESOURCES:\nhttps://o.example/a\nhttps://o.example/b');
 assert.equal(JSON.parse(f.calls[1].opt.body).tools[0].type,'web_search');
});

test('Copilot through SerpApi; a system without a key says so and is not called',async()=>{
 const f=fake([[/engine=bing_copilot/,()=>json({header:'Herramientas SEO gratuitas',text_blocks:[{type:'paragraph',snippet:'Un checker revisa el SEO de tu web.'}],references:[{index:0,link:'https://m.example/a'}]})]]);
 const r=await fetchAiAnswer('copilot',Q,{env:ENV,fetchImpl:f});
 assert.equal(r.text,'ANSWER:\nHerramientas SEO gratuitas\nUn checker revisa el SEO de tu web.\n\nRESOURCES:\nhttps://m.example/a');
 assert.equal((await fetchAiAnswer('chatgpt',Q,{env:{},fetchImpl:f})).status,'NOT_CONFIGURED');
 assert.equal(f.calls.length,1);
 assert.deepEqual(configuredEngines({SERPAPI_KEY:'x',PERPLEXITY_API_KEY:'y'}),{google_aio:true,chatgpt:false,perplexity:true,claude:false,copilot:true});
 const fail=await fetchAiAnswer('perplexity',Q,{env:ENV,fetchImpl:async()=>({ok:false,status:429,json:async()=>({})})});
 assert.equal(fail.status,'PROVIDER_UNAVAILABLE');
});

const KEY='k'.repeat(32);
const ownerCookie=()=>{const exp=Date.now()+3600e3;return 'gf_admin='+exp+'.'+sign(KEY,exp)};
function app(fetcher){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));
 registerFreePrewrite(a,{query:()=>{throw Error('no database')}},{fetchAiAnswer:fetcher,aiEnv:{SERPAPI_KEY:'x',PERPLEXITY_API_KEY:'y'}});return a}

test('only the owner may fetch; the question is required; the owner learns which systems are connected',async()=>{
 const prev=process.env.GROWTH_FREE_ADMIN_KEY;process.env.GROWTH_FREE_ADMIN_KEY=KEY;
 try{
  const seen=[];const a=app(async(engine,q,o)=>{seen.push([engine,q,o.language,o.country]);return {status:'SUCCESS',text:'ANSWER:\nx\n\nRESOURCES:\nhttps://a.example',provider:'Perplexity API (Sonar)'}});
  const anon=await request(a).get('/api/free-pre-write/ai-answer/engines').expect(200);
  assert.deepEqual(anon.body,{owner:false});
  await request(a).post('/api/free-pre-write/ai-answer').send({engine:'perplexity',question:Q}).expect(403);
  const eng=await request(a).get('/api/free-pre-write/ai-answer/engines').set('Cookie',ownerCookie()).expect(200);
  assert.deepEqual(eng.body,{owner:true,engines:{google_aio:true,chatgpt:false,perplexity:true,claude:false,copilot:true}});
  await request(a).post('/api/free-pre-write/ai-answer').set('Cookie',ownerCookie()).send({engine:'perplexity',question:' '}).expect(400);
  await request(a).post('/api/free-pre-write/ai-answer').set('Cookie',ownerCookie()).send({engine:'bard',question:Q}).expect(400);
  const ok=await request(a).post('/api/free-pre-write/ai-answer').set('Cookie',ownerCookie()).send({engine:'perplexity',question:Q,language:'es',country:'ES'}).expect(200);
  assert.equal(ok.body.text,'ANSWER:\nx\n\nRESOURCES:\nhttps://a.example');
  assert.deepEqual(seen,[['perplexity',Q,'es','es']]);
 }finally{if(prev===undefined)delete process.env.GROWTH_FREE_ADMIN_KEY;else process.env.GROWTH_FREE_ADMIN_KEY=prev}
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
test('browser: the owner presses "Fetch all" and every connected field fills in; a visitor sees no fetch buttons',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const prev=process.env.GROWTH_FREE_ADMIN_KEY;process.env.GROWTH_FREE_ADMIN_KEY=KEY;
 const a=app(async(engine,q)=>engine==='google_aio'?{status:'SUCCESS',google_source:'ai_overview',text:'ANSWER:\nAIO '+q+'\n\nRESOURCES:\nhttps://g.example',provider:'Google AI Overview (SerpApi)'}
  :{status:'SUCCESS',text:'ANSWER:\n'+engine+' '+q+'\n\nRESOURCES:\nhttps://p.example',provider:'Perplexity API (Sonar)'});
 const srv=a.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const visitor=await browser.newPage();
  await visitor.goto(base+'/free-pre-write?lang=es');
  await visitor.waitForTimeout(300);
  assert.equal(await visitor.locator('.ai-fetch-all').isVisible(),false);
  const ctx=await browser.newContext();
  const [name,value]=ownerCookie().split('=');
  await ctx.addCookies([{name,value,url:base}]);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/free-pre-write?lang=es');
  await page.fill('[name=keyword]','seo checker');
  await page.fill('[name=ai-question]',Q);
  await page.locator('.ai-fetch-all').waitFor({state:'visible'});
  assert.equal(await page.locator('.ai-fetch[data-engine=chatgpt]').isDisabled(),true,'no OpenAI key: not available');
  await page.click('.ai-fetch-all');
  await page.waitForFunction(()=>document.querySelector('[name=ai-perplexity]').value&&document.querySelector('[name=ai-copilot]').value&&document.querySelector('[name=ai-google_aio]').value);
  assert.equal(await page.inputValue('[name=ai-perplexity]'),'ANSWER:\nperplexity '+Q+'\n\nRESOURCES:\nhttps://p.example');
  assert.equal(await page.inputValue('[name=google-source]'),'ai_overview');
  assert.equal(await page.inputValue('[name=ai-chatgpt]'),'');
  assert.match(await page.locator('.ai-fetch-note[data-engine=perplexity]').textContent(),/Perplexity API/);
  await page.reload();
  assert.equal(await page.inputValue('[name=ai-perplexity]'),'ANSWER:\nperplexity '+Q+'\n\nRESOURCES:\nhttps://p.example','remembered like pasted text');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close();if(prev===undefined)delete process.env.GROWTH_FREE_ADMIN_KEY;else process.env.GROWTH_FREE_ADMIN_KEY=prev}
});
