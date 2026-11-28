'use strict';
// Owner 2026-11-28: "zie hoe de vragen gesteld worden in Pre-Write Tracker: als ik de vraag invul, automatisch met al
// deze tekst, zodat ik alleen hoef te kopiëren en te plakken." Free Pre-Write shows the exact Tracker research prompt for
// the question (or, empty, the topic), with a copy button, in EN, NL and ES, on the intake and on the correction form.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const request=require('supertest');
const {buildCustomerResearchPrompt}=require('../public/prewrite-ai-answer-research.js');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}

test('the page loads the same prompt builder as the Tracker and has a prompt box with a copy button, EN/NL/ES',async()=>{
 const a=app();
 for(const [lang,copy] of [['en','Copy prompt'],['nl','Kopieer prompt'],['es','Copiar prompt']]){
  for(const p of ['/free-pre-write','/free-pre-write/r']){
   const html=(await request(a).get(p+'?lang='+lang).expect(200)).text;
   assert.match(html,/<script src="\/prewrite-ai-answer-research\.js" defer><\/script>\s*<script src="\/free-prewrite\.js" defer>/,p);
   assert.match(html,/<textarea class="ai-prompt" rows="12" readonly/,p);
   assert.ok(html.includes('>'+copy+'</button>'),p+' '+lang);
  }
 }
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
test('typing the question fills the exact Tracker prompt; empty question uses the topic; copy puts it on the clipboard',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/free-pre-write?lang=es');
  await page.fill('[name=keyword]','seo checker');
  assert.equal(await page.inputValue('#intake .ai-prompt'),buildCustomerResearchPrompt('seo checker'),'without a question: the topic');
  const q='¿Qué seo checker gratis analiza el SEO de mi web?';
  await page.fill('[name=ai-question]',q);
  const prompt=await page.inputValue('#intake .ai-prompt');
  assert.equal(prompt,buildCustomerResearchPrompt(q));
  assert.match(prompt,/^Answer this exact customer question as an independent user would receive it:\n\nQUERY:\n\n¿Qué seo checker gratis analiza el SEO de mi web\?\n\nInstructions:/);
  await page.click('#intake .ai-prompt-copy');
  await page.waitForFunction(()=>document.querySelector('#intake .ai-prompt-status').textContent.length>0);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),buildCustomerResearchPrompt(q));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close()}
});
