'use strict';
// Owner 2026-11-13: "Dutch data must stay in NL, Spanish in ES" — Pre-Write drafts are kept per keyword + language + market.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const a = src.indexOf('// ── PREWRITE PERSISTENT DRAFTS'), b = src.indexOf('function _pwbAiFiveUiState(){');
const drafts = src.slice(a, b);
const pick = src.slice(src.indexOf('function csComboPick(id, val) {'), src.indexOf('// Delegated pick: mousedown'));

test('each market keeps its own AI answers; switching back restores them', async () => {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { return; }
  const browser = await chromium.launch(); const page = await browser.newPage();
  try {
  const ids = ['pwbKeyword', 'pwbTitle', 'pwbLanguage', 'pwbRegion', 'pwbAioText', 'pwbGoogleSource', 'pwbChatgptText', 'pwbPerplexityText', 'pwbClaudeText', 'pwbCopilotText'];
  // A real origin: about:blank has no localStorage, where the drafts live.
  await page.route('http://drafts.test/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' + ids.map(i => '<input id="' + i + '">').join('') + '</body>' }));
  await page.goto('http://drafts.test/');
  await page.evaluate(code => { window._networkPrewritePlacementId = () => 0; window._pwbUpdateAiFiveCount = () => {}; window._networkPrewriteEmitState = () => {}; window.csComboClose = () => {}; (0, eval)(code); }, drafts + '\n' + pick);
  const type = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const change = id => page.evaluate(id => document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true })), id);
  const val = id => page.evaluate(id => document.getElementById(id).value, id);
  // Spanish market
  await type('pwbKeyword', 'aeo vs geo vs seo'); await page.evaluate(() => { csComboPick('pwbLanguage', 'Spanish'); csComboPick('pwbRegion', 'es — Spain'); }); await change('pwbKeyword');
  await type('pwbChatgptText', 'Respuesta en español de ChatGPT');
  // Same keyword, Dutch market: the Spanish answer must not appear
  await page.evaluate(() => { csComboPick('pwbLanguage', 'Dutch'); csComboPick('pwbRegion', 'nl — Netherlands'); });
  assert.equal(await val('pwbChatgptText'), '');
  await type('pwbChatgptText', 'Nederlands antwoord van ChatGPT');
  // Back to Spain: the Spanish answer is back, the Dutch one is not
  await page.evaluate(() => { csComboPick('pwbLanguage', 'Spanish'); csComboPick('pwbRegion', 'es — Spain'); });
  assert.equal(await val('pwbChatgptText'), 'Respuesta en español de ChatGPT');
  // And Dutch again
  await page.evaluate(() => { csComboPick('pwbLanguage', 'Dutch'); csComboPick('pwbRegion', 'nl — Netherlands'); });
  assert.equal(await val('pwbChatgptText'), 'Nederlands antwoord van ChatGPT');
  // A new keyword in English starts empty, and the earlier English work survives a later switch
  await type('pwbKeyword', 'how to check if chatgpt mentions my business'); await page.evaluate(() => { csComboPick('pwbLanguage', 'English'); csComboPick('pwbRegion', 'us — United States'); }); await change('pwbKeyword');
  assert.equal(await val('pwbChatgptText'), '');
  await type('pwbChatgptText', 'English answer');
  await type('pwbKeyword', 'aeo vs geo vs seo'); await change('pwbKeyword');
  await type('pwbKeyword', 'how to check if chatgpt mentions my business'); await change('pwbKeyword');
  assert.equal(await val('pwbChatgptText'), 'English answer');
  } finally { await browser.close(); }
});

test('the draft key includes language and market, and old keyword-only drafts are reused only for the same market', () => {
  assert.ok(drafts.includes("return k+'||'+l+'||'+r;"));
  assert.ok(drafts.includes('function _pwbDraftFind(st,key){'));
  assert.ok(!/\['pwbTitle','pwbLanguage','pwbRegion'/.test(src), 'typing in language/market must not save into another key');
});
