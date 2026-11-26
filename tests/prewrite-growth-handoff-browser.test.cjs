'use strict';
// End-to-end browser regression for the owner's URL-scoped Pre-Write ↔ Growth journey.
// All account data comes from a deterministic same-origin stub; no real customer URLs or API calls.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
const TRACKED='https://roof.example/24-hour-emergency-roof-repair-nj/';
const OTHER='https://roof.example/different-page/';
const html='<!doctype html><html><head><meta charset="utf-8"><script defer src="/prewrite-ai-answer-research.js"></script><script defer src="/prewrite-research-tab.js"></script></head>'+
  '<body><div id="prewriteBriefModal" style="display:block"><input id="pwbKeyword" value="24 Hour Emergency Roof Repair NJ"><input id="pwbLanguage" value="English"><input id="pwbRegion" value="us">'+
  '<select id="pwbGoogleSource"><option value="gemini">Gemini</option></select>'+
  '<p>AI Answer Research — Write for Citation Potential</p><div class="pwb-ai-five-grid">'+
  ['pwbAioText','pwbChatgptText','pwbPerplexityText','pwbClaudeText','pwbCopilotText'].map(id=>'<textarea id="'+id+'"></textarea>').join('')+
  '</div><div id="pwbWhatToDo"></div></div></body></html>';
function serve() {
 const hits=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/track/OWNER/' || url.pathname==='/track/OWNER')return res.end(html);
  if(url.pathname==='/api/tracker-client/OWNER/growth') {
    hits.push(req.url);res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({success:true,can_edit:true,pages:[{id:42,url:TRACKED}]}));
  }
  const f=url.pathname.split('/').pop();
  if(f==='prewrite-ai-answer-research.js'||f==='prewrite-research-tab.js'){
    res.setHeader('Content-Type','text/javascript');
    return res.end(fs.readFileSync(path.join(__dirname,'../public',f)));
  }
  res.statusCode=404;res.setHeader('Content-Type','application/json');res.end('{}');
 });
 return {server,hits};
}
test('Pre-Write links only exact tracked URLs; fallback preserves full URL for Free Growth',{skip:!chromium&&'Playwright unavailable'},async()=>{
 const {server,hits}=serve();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/track/OWNER/');
  await page.waitForSelector('#cs-research-ask-copy');
  await page.evaluate(url=>{
    window._pwbCurrentBrief={keyword:'24 Hour Emergency Roof Repair NJ',language:'English',region:'us',
      content_decision:{recommended_treatment:'EXPAND_EXISTING_PAGE',closest_existing_url:url}};
    document.getElementById('pwbWhatToDo').appendChild(document.createElement('span'));
  },TRACKED);
  await page.waitForSelector('#cs-prewrite-to-growth a[href*="/growth/from-brief"]');
  const exact=await page.locator('#cs-prewrite-to-growth a').first().getAttribute('href');
  assert.ok(exact.includes('/growth/from-brief'));assert.equal(new URL(exact,'http://local').searchParams.get('url'),TRACKED);
  assert.match(await page.locator('#cs-prewrite-to-growth').innerText(),/roof.example\/24-hour-emergency-roof-repair-nj/);
  await page.evaluate(url=>{
    window._pwbCurrentBrief.content_decision.closest_existing_url=url;
    document.getElementById('pwbWhatToDo').appendChild(document.createElement('span'));
  },OTHER);
  await page.waitForSelector('#cs-prewrite-to-growth a[href^="/free-growth"]');
  const fallback=await page.locator('#cs-prewrite-to-growth a').first().getAttribute('href');
  assert.equal(new URL(fallback,'http://local').searchParams.get('url'),OTHER);
  assert.equal(await page.locator('#cs-prewrite-to-growth a[href*="/growth/from-brief"]').count(),0);
  assert.ok(hits.length>=2);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});
test('Growth → Pre-Write validates account page ID AND URL before pre-filling',{skip:!chromium&&'Playwright unavailable'},async()=>{
 const {server}=serve();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const browser=await chromium.launch();
 try{
  const base='http://127.0.0.1:'+server.address().port+'/track/OWNER/';
  const bad=await browser.newPage();
  await bad.goto(base+'?prewrite=1&page_id=42&url='+encodeURIComponent(OTHER)+'&keyword=wrong');
  await bad.waitForSelector('#cs-research-ask-copy');await bad.waitForTimeout(400);
  assert.equal(await bad.inputValue('#pwbKeyword'),'24 Hour Emergency Roof Repair NJ','cross-URL is refused');
  const ok=await browser.newPage();
  await ok.goto(base+'?prewrite=1&page_id=42&url='+encodeURIComponent(TRACKED)+'&keyword=emergency+roof+repair');
  await ok.waitForFunction(()=>document.getElementById('pwbKeyword').value==='emergency roof repair');
  assert.equal(await ok.isVisible('#prewriteBriefModal'),true);
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});

test('Proof & History links an existing Quick Scan from each supported browser locale', {
 skip: !chromium && 'Playwright unavailable'
}, async () => {
 const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
 const start = source.indexOf('function openCaseStudy(pageId,caseId)');
 const end = source.indexOf('function csPosHist(pageId)', start);
 assert.ok(start >= 0 && end > start);
 // The Tracker emits this script from its HTML template literal.
 const script = require('node:vm').runInNewContext('`' + source.slice(start, end) + '`');
 const browser = await chromium.launch();
 try {
  for (const [locale, label, width] of [
   ['en-US', 'Link a research result', 1200],
   ['nl-NL', 'Koppel een onderzoeksresultaat', 390],
   ['es-ES', 'Vincular un resultado de investigación', 390]
  ]) {
   const page = await browser.newPage({ locale, viewport: { width, height: 840 } });
   const scanKey = 'ab'.repeat(locale === 'en-US' ? 32 : 8);
   const scanPath = (locale === 'en-US' ? '/quick-scan/' : '/scan/') + scanKey;
   const requests = [];
   const errors = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.evaluate(() => {
    window._csEscH = value => String(value ?? '');
    window.api = async (path, method, body) => {
     if (method === 'POST') {
      window.proofLink = { path, body };
      return { success: true };
     }
     return { success: true, page_url: 'https://fixture.example/Service/',
      proof_sources: { quick_scan: window.proofLink ? [{ score: 0, scanned_at: '2026-01-02T00:00:00Z' }] : [] } };
    };
   });
   await page.addScriptTag({ content: script });
   await page.evaluate(() => openCaseStudy(42));
   page.on('dialog', async dialog => {
    requests.push(dialog.type());
    await dialog.accept('https://app.example' + scanPath);
   });
   await page.getByRole('button', { name: label }).click();
   await page.waitForFunction(() => window.proofLink);
   assert.deepEqual(await page.evaluate(() => window.proofLink), {
    path: '/pages/42/proof-sources', body: { type: 'quick_scan', key: scanKey }
   });
   await page.locator('summary').getByText('Quick Scan', { exact: true }).click();
   assert.equal(await page.getByText(/ContentScore 0$/).isVisible(), true);
   assert.deepEqual(requests, ['prompt']);
   assert.deepEqual(errors, []);
   await page.close();
  }
 } finally {
  await browser.close();
 }
});
