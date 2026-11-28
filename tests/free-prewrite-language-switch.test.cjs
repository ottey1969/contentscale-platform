'use strict';
// Owner 2026-11-29: "als ik taal wil switchen verdwijnt deze page, zou switchbaar moeten zijn en blijven". The EN/NL/ES
// links on a brief keep the brief (its page and private key); on the form they keep what was filled in.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
let chromium=null;try{({chromium}=require('playwright'))}catch{}
const KEY='d'.repeat(64);
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}
test('switching language keeps the brief, and keeps a half-filled form',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'open',language:'es',region:'es',
   website:'https://es.contentscale.site/',keyword:'seo checker',target:{mode:'CREATE',url:'https://es.contentscale.site/seo-checker/'},instructions:'CREATE',brief:{search_intent:{primary:'transactional'}}})}));
  await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:{}})}));
  await page.goto(base+'/free-pre-write/r?lang=en#'+KEY);
  await page.locator('#decision').waitFor({state:'visible'});
  await page.click('nav[aria-label=Language] >> text=NL');
  await page.waitForURL(u=>u.searchParams.get('lang')==='nl');
  const u=new URL(page.url());
  assert.equal(u.pathname,'/free-pre-write/r');assert.equal(u.hash,'#'+KEY);
  await page.locator('#decision').waitFor({state:'visible'});
  assert.equal(await page.locator('html').getAttribute('lang'),'nl');
  await page.goto(base+'/free-pre-write?lang=en');
  await page.fill('[name=website]','https://es.contentscale.site/');
  await page.fill('[name=keyword]','seo checker');
  await page.fill('[name=ai-chatgpt]','Pasted answer');
  await page.click('nav[aria-label=Language] >> text=ES');
  await page.waitForURL(u=>u.searchParams.get('lang')==='es');
  assert.equal(new URL(page.url()).pathname,'/free-pre-write');
  assert.equal(await page.inputValue('[name=keyword]'),'seo checker');
  assert.equal(await page.inputValue('[name=website]'),'https://es.contentscale.site/');
  assert.equal(await page.inputValue('[name=ai-chatgpt]'),'Pasted answer');
 }finally{await browser.close();srv.close()}
});
