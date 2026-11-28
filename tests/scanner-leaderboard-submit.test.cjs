'use strict';
// Owner 2026-11-28: "in de scanner waren gebruikers mogelijk om hun score toe te voegen, dat werd in admin getoond en ik
// kon het accepteren, voor single page en voor sitemap. Werkt nu niet." The single-page result lost its submit button
// (the function stayed, nothing called it). And an e-mail address typed as URL ("andrede@heystraetus.nl") was scanned
// as https://andrede@heystraetus.nl instead of being refused.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {scanUrlProblem}=require('../src/scan-url-input.cjs');

test('an e-mail address or a URL with a user name is not a page to scan',()=>{
 for(const bad of ['andrede@heystraetus.nl','https://andrede@heystraetus.nl','https://user:pw@example.com/page','mailto:a@b.nl','https:///nohost','ftp://example.com/'])
  assert.ok(scanUrlProblem(bad),bad);
 for(const good of ['https://replit.com','namecheap.com','https://contentscale.site/graaf-framework','http://example.com/a?b=c@d'])
  assert.equal(scanUrlProblem(good),null,good);
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
// Owner 2026-11-28 (later the same day): the offer is a pop-up with e-mail and consent; a confirmation e-mail follows.
test('single page: a score of 70+ opens the leaderboard pop-up (e-mail + consent, then a confirmation e-mail); below 70 nothing; EN, NL, ES',{skip:!chromium&&'Playwright not installed',timeout:120000},async()=>{
 const express=require('express');
 const app=express();
 for(const [prefix,dir] of [['/','public'],['/nl/','public/nl'],['/es/','public/es']])
  app.get(prefix,(req,res)=>res.sendFile(path.join(__dirname,'..',dir,'index.html')));
 const srv=app.listen(0);const base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const {CONSENT}=require('../src/leaderboard-confirm.cjs');
  for(const [prefix,button,email,lang] of [['/','Add to the Leaderboard','Enter a web page address','en'],['/nl/','Toevoegen aan het leaderboard','Vul het adres van een webpagina in','nl'],['/es/','Añadir a la clasificación','Introduce la dirección de una página web','es']]){
   for(const score of [82,64]){
    const page=await browser.newPage();
    const submitted=[],scanned=[];
    await page.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.origin!==base)return route.fulfill({status:204,body:''});
     if(u.pathname==='/api/scan'){scanned.push(JSON.parse(route.request().postData()).url);return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,url:'https://example.com/service/',score,quality:'good',metrics:{},content_stats:{},recommendations:{all:[]}})})}
     if(u.pathname==='/api/leaderboard/request'){submitted.push(JSON.parse(route.request().postData()));return route.fulfill({contentType:'application/json',body:'{"success":true,"sent":true}'})}
     if(u.pathname==='/api/leaderboard')return route.fulfill({contentType:'application/json',body:'{"success":true,"entries":[]}'});
     return route.continue();
    });
    page.on('dialog',d=>d.dismiss());
    await page.goto(base+prefix);
    await page.evaluate(()=>{if(typeof switchPageSection==='function')switchPageSection('scanner');if(typeof switchMode==='function')switchMode('single')});
    // An e-mail address is refused in the page itself.
    await page.evaluate(()=>{document.getElementById('singleUrlInput').value='andrede@heystraetus.nl';scanSingleURL()});
    await page.waitForFunction(t=>document.getElementById('singleResult').textContent.includes(t),email);
    assert.deepEqual(scanned,[],prefix+' no scan for an e-mail address');
    await page.evaluate(()=>{document.getElementById('singleUrlInput').value='https://example.com/service/';scanSingleURL()});
    await page.waitForFunction(()=>!document.getElementById('singleResult').classList.contains('hidden')&&/\d/.test(document.getElementById('singleResult').textContent));
    await page.waitForTimeout(300);
    const btn=page.locator('#singleLbBtn');
    if(score<70){assert.equal(await btn.count(),0,prefix+' no submit below 70');assert.equal(await page.locator('#lbPopup').count(),0);await page.close();continue}
    assert.match(await btn.textContent(),new RegExp(button),prefix);
    await page.locator('#lbPopup').waitFor();
    assert.match(await page.textContent('#lbPopupTitle'),/82\/100/);
    assert.equal(await page.textContent('#lbConsentText'),CONSENT[lang],prefix+' the same consent text as stored and e-mailed');
    assert.equal(await page.textContent('#lbNoPromo'),require('../src/leaderboard-confirm.cjs').NO_PROMO[lang],prefix+' never for promotion');
    await page.fill('#lbCompany','Example Services');
    await page.click('#lbSend');
    await page.waitForFunction(()=>document.getElementById('lbStatus').textContent.length>0);
    assert.equal(submitted.length,0,prefix+' nothing is sent without e-mail and consent');
    await page.fill('#lbEmail','info@example.com');await page.check('#lbConsent');await page.click('#lbSend');
    await page.waitForFunction(()=>document.getElementById('lbSend').style.display==='none');
    assert.deepEqual(submitted.map(s=>[s.kind,s.url,s.company_name,s.email,s.consent,s.lang,'score' in s]),[['page','https://example.com/service/','Example Services','info@example.com',true,lang,false]],prefix);
    await page.close();
   }
  }
 }finally{await browser.close();srv.close()}
});

test('the server refuses an e-mail address as scan URL before opening a browser',()=>{
 const src=require('node:fs').readFileSync(require.resolve('../src/index.js'),'utf8');
 assert.match(src,/app\.post\('\/api\/scan', async \(req, res\) => \{\s*const \{ url \} = req\.body;\s*if \(!url\) return res\.status\(400\)[^\n]*\n\s*const _scanInputProblem = require\('\.\/scan-url-input\.cjs'\)\.scanUrlProblem\(url\);\s*if \(_scanInputProblem\) return res\.status\(400\)/);
});
