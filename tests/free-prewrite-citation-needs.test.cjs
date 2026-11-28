'use strict';
// Owner 2026-11-28 (review of #625): "Jouw site geciteerd" said "ja" when an AI answer cited a competitor page, and per AI
// system the brief must say what this page needs to be cited by that system (ChatGPT, Perplexity, Claude, Copilot too,
// not only the Google AI Overview). Also: the real aio_citation_gap is a list, and internal links carry "why".
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const express=require('express');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
let chromium=null;try{({chromium}=require('playwright'))}catch{}

const SRC=fs.readFileSync(path.join(__dirname,'..','src','index.js'),'utf8');
const fn=name=>{const i=SRC.indexOf('function '+name+'(');assert.ok(i>0,name);let d=0;const j=SRC.indexOf('{',i);for(let k=j;k<SRC.length;k++){if(SRC[k]==='{')d++;else if(SRC[k]==='}'&&--d===0)return SRC.slice(i,k+1);}throw Error(name)};

test('Generator: every AI system in the brief schema has citation_needs, and the evidence step asks for it',()=>{
 const schemaAt=SRC.indexOf('"ai_systems_analysis":{"google_aio":{"checked":false');assert.ok(schemaAt>0);
 const schema=SRC.slice(schemaAt,SRC.indexOf('"competitor_table"',schemaAt));
 const keys=['google_aio','chatgpt','perplexity','claude','copilot'];
 keys.forEach((k,i)=>{const a=schema.indexOf('"'+k+'":{"checked"'),z=i<keys.length-1?schema.indexOf('"'+keys[i+1]+'":{"checked"'):schema.length;
  assert.ok(a>=0&&z>a,k);assert.match(schema.slice(a,z),/"citation_needs":\[/,k+' has citation_needs in the schema');});
 assert.match(SRC,/ai_systems_analysis: object keyed google_aio, chatgpt, perplexity, claude, copilot; each has [^\n]*citation_needs/);
 assert.match(SRC,/Also per AI system: citation_needs = at most 3 concrete things THIS page must contain/,"the writing research explains citation_needs");
});

test('Generator: citation_needs is kept for a checked system (max 3, plain text) and dropped for one not checked',()=>{
 const ctx={_prewriteBriefResearch:{isValidAnswer:()=>true},_PWB_AI_ENGINES_V506:['google_aio','chatgpt','perplexity','claude','copilot']};
 vm.runInNewContext([fn('_pwbBriefQueryV506'),fn('_pwbAiEvidenceStateV506'),fn('_pwbExtractHttpsV506'),fn('_pwbCanonicalizeAiAnalysisV506'),'this.canon=_pwbCanonicalizeAiAnalysisV506;'].join('\n'),ctx);
 const b={keyword:'k',ai_system_evidence:{chatgpt:{checked:true,text:'ANSWER: test https://a.example/x'}},
  ai_systems_analysis:{chatgpt:{citation_needs:[' A numbered method. ','',null,{x:1},'Own test results.','A date.','Fourth.']},claude:{citation_needs:['Invented for a system nobody checked.']}}};
 ctx.canon(b);
 assert.deepEqual(Array.from(b.ai_systems_analysis.chatgpt.citation_needs),['A numbered method.','Own test results.','A date.']);
 assert.deepEqual(Array.from(b.ai_systems_analysis.claude.citation_needs),[]);
});

const KEY='f'.repeat(64);
const BRIEF={language:'en',keyword:'how to know if chatgpt mentions my company',
 content_decision:{recommended_treatment:'CREATE_NEW_PAGE'},
 meta_package:{h1:'How to know if ChatGPT mentions your company'},
 ai_systems_analysis:{
  google_aio:{checked:true,answer_summary:'Google lists three checks.',domain_citations:[],exact_page_citations:[],citation_sources:[],citation_needs:['Google: a numbered checklist in the first screen.']},
  chatgpt:{checked:true,answer_summary:'ChatGPT suggests prompt tests.',domain_citations:['rival.example'],exact_page_citations:['https://rival.example/check/'],citation_sources:[{source_name:'rival.example',exact_url:'https://rival.example/check/'}],citation_needs:['ChatGPT: a dated test log with screenshots.']},
  perplexity:{checked:true,answer_summary:'Perplexity cites our guide.',domain_citations:[],exact_page_citations:['https://www.contentscale.site/guide/'],citation_sources:[],citation_needs:['Perplexity: keep the guide current.']},
  claude:{checked:false,citation_needs:['Never shown: not researched.']},
  copilot:{checked:true,answer_summary:'Copilot names Bing tools.',domain_citations:[],exact_page_citations:[],citation_sources:[],citation_needs:['Copilot: name Bing Webmaster Tools.']}},
 aio_citation_gap:[{source:'rival.example',url:'https://rival.example/check/',is_us:false,what_they_do_well:'A step list.',our_gap:'No step list yet.',what_to_do:'Add a 5-step list near the top.'}],
 internal_link_targets:[{anchor_text:'AI visibility',link_to:'https://www.contentscale.site/ai-visibility/',why:'Same topic cluster.'}],
 action_plan:[{step:1,action:'Write the page.'}]};
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}

test('Step 1: own site cited only for the own domain; per AI system what it takes to be cited',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'open',language:'en',region:'us',
   website:'https://contentscale.site/',keyword:BRIEF.keyword,target:{mode:'CREATE',url:'https://contentscale.site/chatgpt-mentions/'},instructions:'CREATE',brief:BRIEF})}));
  await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:{}})}));
  await page.goto(base+'/free-pre-write/r?lang=en#'+KEY);
  const box=page.locator('#brief-readable');await box.waitFor({state:'visible'});
  const text=await box.innerText();
  const block=(from,to)=>{const i=text.indexOf(from);assert.ok(i>=0,from);const j=to?text.indexOf(to,i+1):text.length;return text.slice(i,j<0?text.length:j)};
  const google=block('Google AI Overview / Gemini','ChatGPT Search'),chatgpt=block('ChatGPT Search','Perplexity'),perplexity=block('Perplexity','Claude'),
   claude=block('Claude','Microsoft Copilot'),copilot=block('Microsoft Copilot','Link to these own pages');
  assert.match(chatgpt,/Your site cited: no/,'a competitor page is not your site');
  assert.match(perplexity,/Your site cited: yes/,'your own page (www. or not) counts');
  assert.match(google,/What it takes to be cited[\s\S]*a numbered checklist in the first screen/);
  assert.match(google,/rival\.example: A step list\. Misses on your page: No step list yet\. Do: Add a 5-step list near the top\./,'the real aio_citation_gap list');
  assert.match(chatgpt,/What it takes to be cited[\s\S]*a dated test log with screenshots/);
  assert.match(perplexity,/keep the guide current/);
  assert.match(copilot,/name Bing Webmaster Tools/);
  assert.match(claude,/not researched/);assert.doesNotMatch(claude,/Never shown/);
  assert.match(text,/AI visibility → https:\/\/www\.contentscale\.site\/ai-visibility\/ \(Same topic cluster\.\)/,'internal link reason from "why"');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close()}
});
