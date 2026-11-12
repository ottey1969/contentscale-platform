'use strict';
// The translation layer of the Free Growth result page (owner 2026-11-12: "Spanish is Spanish"): known texts are
// translated with their numbers, quotes, sites, dates and AI system names kept; data and text fields are never touched.
const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../src/growth-free/ui-texts.cjs');
test('every text has a Dutch and a Spanish version with the same placeholders',()=>{
 const ph=s=>(s.match(/\{[a-z]\}/g)||[]).sort().join('');
 for(const [en,nl,es] of ui.ROWS){assert.ok(nl&&es,en);
  // A translation may leave out a quoted UI word it translates itself, never a number, site, address, date or AI name.
  const strip=s=>ph(s).replace(/\{q\}/g,'');assert.equal(strip(nl),strip(en),'nl: '+en);assert.equal(strip(es),strip(en),'es: '+en)}
 const keys=ui.ROWS.map(r=>r[0]);assert.equal(new Set(keys).size,keys.length,'no duplicate English texts');
});
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
test('in the browser: translated with the data kept; text fields and quotes of other sites untouched',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const b=await chromium.launch();
 try{const p=await b.newPage();
  await p.setContent('<html><body><p id="a">Not on your page (3)</p><p id="b">· cited by ChatGPT Search, Perplexity · Read · 2 of 15 heading(s) not on your page</p><textarea id="c">Not on your page (3)</textarea><blockquote id="d">What not to do</blockquote><p id="e">How to read a repair estimate</p><div id="f"></div></body></html>');
  await p.addScriptTag({content:ui.clientScript('nl')});await p.waitForTimeout(50);
  const t=id=>p.textContent('#'+id);
  assert.equal(await t('a'),'Niet op je pagina (3)');
  assert.equal(await t('b'),'· genoemd door ChatGPT Search, Perplexity · Gelezen · 2 van 15 kop(pen) niet op je pagina');
  assert.equal(await p.inputValue('#c'),'Not on your page (3)','a text field is never translated');
  assert.equal(await t('d'),'What not to do','a quote of another site is never translated');
  assert.equal(await t('e'),'How to read a repair estimate','unknown text (data) stays as it is');
  const tr=x=>p.evaluate(s=>window.__uiTranslate(s),x);
  assert.equal(await tr('On the pages AI cites (abbys-roofing-site.pages.dev), not on your page. Not in the Google list, so Growth does not write it: add it yourself if it fits. “Text”'),
   'Op de pagina\'s die AI noemt (abbys-roofing-site.pages.dev), niet op je pagina. Niet in de Google-lijst, dus Growth schrijft het niet: voeg het zelf toe als het past. “Text”');
  assert.equal(await tr('ChatGPT Search does not cite you. ChatGPT Search and Microsoft Copilot find pages through the Bing index.'),'ChatGPT Search noemt je niet. ChatGPT Search en Microsoft Copilot vinden pagina\'s via de index van Bing.');
  assert.equal(await tr('Published on 10 november 2026.'),'Gepubliceerd op 10 november 2026.');
  assert.equal(await tr('Structured data: Service (3 of 5)'),'Gestructureerde gegevens: Service (3 van 5)');
  // Text added later (a status line while writing) is translated as well.
  await p.evaluate(()=>{document.getElementById('f').textContent='Checking the package…'});await p.waitForTimeout(50);
  assert.equal(await t('f'),'Het pakket wordt gecontroleerd…');
  const q=await b.newPage();await q.setContent('<html><body><p id="a">Choose what to add to your page</p></body></html>');await q.addScriptTag({content:ui.clientScript('es')});
  assert.equal(await q.textContent('#a'),'Elige qué añadir a tu página');
 }finally{await b.close()}
});
