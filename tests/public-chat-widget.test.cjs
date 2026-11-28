'use strict';
// Owner 2026-11-28: "kun je dit [Tawk.to chat] op alle publieke pagina's plaatsen zodat mensen kunnen chatten met mij".
// Every public page of app.contentscale.site gets one chat launcher (photo + "Chat with Ottmar", in the page language).
// Tawk.to (a third party that sets cookies) loads only after Functional consent, as on the CEO Report and Quick Scan
// pages; a click without consent opens the cookie choice. Admin, owner and internal pages get no chat. A page never
// gets two widgets: its own direct Tawk.to snippet is replaced. One script, so WordPress can use the same line.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {shouldInjectChat,injectChat,CHAT_TAG}=require('../src/public-chat.cjs');

test('public pages get the chat; admin, owner, internal, API and the prospect pages (own chat) do not',()=>{
 for(const p of ['/','/nl/','/es/','/free-pre-write','/free-pre-write/r','/free-growth','/blog/geo-guide','/linkedpod','/leaderboard'])assert.equal(shouldInjectChat(p),true,p);
 for(const p of ['/admin','/owner','/boost-admin','/boost-admin.html','/boost/admin/users','/linkedpod/admin/keys','/network/opportunity-admin',
  '/internal/graaf-preview/abc','/lead-crawler','/leadcrawler','/engine-login','/api/x','/content-engine','/audit/x',
  '/quick-scan/start','/scan/abc','/report/abc','/ceo','/nl-linkedin-ceo'])assert.equal(shouldInjectChat(p),false,p);
});

test('the page\'s own Tawk.to snippet is replaced by the one consent-aware script, once',()=>{
 const page='<html><body><h1>x</h1><!-- Start of Tawk.to Script --><script type="text/javascript">var Tawk_API=Tawk_API||{};(function(){var s1=document.createElement("script");s1.src=\'https://embed.tawk.to/68cac7f84318b419244f3308/default\';})();</script><!-- End of Tawk.to Script --><script>var keep=1</script></body></html>';
 const out=injectChat(page);
 assert.doesNotMatch(out,/embed\.tawk\.to/);
 assert.match(out,/<script>var keep=1<\/script>/);
 assert.equal(out.split(CHAT_TAG).length-1,1);
 assert.equal(injectChat(out),out,'idempotent');
 assert.ok(out.indexOf(CHAT_TAG)<out.lastIndexOf('</body>'));
});

test('the server uses it for every HTML page it sends',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src','index.js'),'utf8');
 assert.match(src,/require\('\.\/public-chat\.cjs'\)/);
 assert.match(src,/shouldInjectChat\(req\.path/);
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
function site(){
 const a=express();
 a.get('/consent-widget.js',(req,res)=>res.type('js').send(fs.readFileSync(path.join(__dirname,'..','src','consent-widget.js'),'utf8')));
 a.use(express.static(path.join(__dirname,'..','public')));
 a.get('/page',(req,res)=>res.type('html').send(injectChat(`<!doctype html><html lang="${req.query.lang||'en'}"><body><h1>Page</h1><script src="/consent-widget.js"></script></body></html>`)));
 return a;
}
const FAKE_TAWK='window.__tawkLoaded=(window.__tawkLoaded||0)+1;window.Tawk_API=window.Tawk_API||{};Tawk_API.maximize=function(){window.__tawkOpened=true};if(typeof Tawk_API.onLoad==="function")setTimeout(Tawk_API.onLoad,0);';
test('browser: launcher without consent, no Tawk.to; a click opens the cookie choice; Functional consent loads the chat and opens it',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=site().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let tawkRequests=0;await page.route('**/embed.tawk.to/**',r=>{tawkRequests++;r.fulfill({contentType:'application/javascript',body:FAKE_TAWK})});
  await page.goto(base+'/page?lang=nl');
  const launcher=page.locator('#cs-chat-launcher');
  await launcher.waitFor({state:'visible'});
  assert.match(await launcher.textContent(),/Chat met Ottmar/);
  assert.equal(await page.locator('#cs-chat-launcher img').getAttribute('src'),base+'/blog/images/ottmar-francisca.jpg');
  // Close the banner without Functional: no chat loads.
  await page.evaluate(()=>{localStorage.setItem('cs_cookie_consent_v1',JSON.stringify({necessary:true,analytics:false,functional:false}))});
  await page.reload();await launcher.waitFor({state:'visible'});
  assert.equal(tawkRequests,0,'no Tawk.to before Functional consent');
  const consent=page.locator('#cs-consent-root');
  assert.equal(await consent.isVisible(),false,'the choice was made, the banner is closed');
  await launcher.click();
  await consent.waitFor({state:'visible'});
  assert.equal(tawkRequests,0,'a click without consent still loads nothing');
  // The visitor allows Functional cookies: the chat loads and opens, the launcher goes.
  await page.evaluate(()=>{const p={necessary:true,analytics:false,functional:true};localStorage.setItem('cs_cookie_consent_v1',JSON.stringify(p));document.dispatchEvent(new CustomEvent('cs:consent',{detail:p}))});
  await page.waitForFunction(()=>window.__tawkOpened===true);
  await launcher.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__tawkLoaded),1);
  await page.reload();
  await page.waitForFunction(()=>window.__tawkLoaded===1);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('script[src*="embed.tawk.to"]').length),1,'one chat, loaded at once with consent');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close()}
});
