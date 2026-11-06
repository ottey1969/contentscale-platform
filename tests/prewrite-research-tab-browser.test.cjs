'use strict';
// Verify the real Tracker Pre-Write modal shows one clear user journey while the research prompt stays internal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) {}
const research = require('../src/prewrite-ai-answer-research.cjs');
const serverModule = require('../src/prewrite-brief-research.cjs');
const { prepare } = require('../scripts/prepare-canonical-production.cjs');

function realModalMarkup() {
  const built = prepare(fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8'));
  const page = built.slice(built.indexOf('const _CLIENT_TRACKER_HTML = `'));
  const start = page.indexOf('<div class="cs-modal" id="prewriteBriefModal">');
  const end = page.indexOf('<div id="pwbStatus"', start);
  assert.ok(start >= 0 && end > start);
  const block = page.slice(start, end);
  assert.doesNotMatch(block, /\$\{/);
  return block.replace(/\\\\/g, '\\');
}
test('Pre-Write AI collection is one visible action, prompt stays behind the scenes',
  { skip: !chromium && 'Playwright not installed' }, async () => {
    const modal = realModalMarkup();
    const html = '<!doctype html><html><head><meta charset="utf-8">' +
      '<script>window.csComboOpen=window.csComboFilter=window.csComboToggle=function(){};</script>' +
      '<script defer src="/prewrite-ai-answer-research.js"></script>' +
      '<script defer src="/prewrite-research-tab.js"></script></head><body style="background:#0f172a;color:#e2e8f0">' +
      modal.replace('class="cs-modal"', 'class="cs-modal" style="display:block;padding:16px"') + '</body></html>';
    const server = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const file = path.join(__dirname, '../public', path.basename(u));
      if (fs.existsSync(file)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(file)); }
      res.statusCode = 404; res.end();
    });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/');
      await page.waitForSelector('#cs-research-ask-copy');
      // Simulate the Tracker restoring an existing keyword through .value after
      // the research UI initialized. The parent app does not emit an input event.
      await page.evaluate(() => {
        document.getElementById('pwbKeyword').value = 'seo content optimalisatie';
      });
      await page.waitForFunction(() => {
        const status = document.querySelector('#cs-research-ask .cs-rp-status');
        return status && status.textContent.includes('0 of 5 AI answers ready.');
      }, {timeout: 2500});
      assert.equal(await page.isDisabled('#cs-research-ask-copy'), false);

      assert.equal(await page.isVisible('#cs-research-tabs'), false, 'No two-tab choice');
      assert.equal(await page.isVisible('#cs-research-prompt-panel'), false, 'Internal prompt not exposed');
      assert.equal(await page.isVisible('#pwbAioText'), true, 'Answer fields remain available');
      assert.match(await page.textContent('#cs-research-ask .cs-ask-note'), /Copy the keyword.*Paste that system/);
      await page.fill('#pwbKeyword', 'seo content optimalisatie');
      assert.match(await page.textContent('#cs-research-ask .cs-rp-status'), /0 of 5 AI answers ready/);
      await page.click('#cs-research-ask-copy');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'seo content optimalisatie');
      await page.selectOption('#pwbGoogleSource', 'gemini');
      await page.fill('#pwbAioText', 'SEO-contentoptimalisatie begint bij het beantwoorden van de vraag van een bezoeker en duidelijke uitleg.');
      assert.match(await page.textContent('#cs-research-ask .cs-rp-status'), /1 of 5 AI answers ready/);
      assert.equal(await page.isVisible('#pwbAioText-cs-invalid'), false);
      const savedPrompt = await page.inputValue('#cs-research-prompt-panel textarea');
      const manual = { google_aio: await page.inputValue('#pwbAioText'), chatgpt:'', perplexity:'', claude:'', copilot:'' };
      const rejected = serverModule.screenManualAnswers(manual, 'seo content optimalisatie', 'gemini');
      const generated = serverModule.researchForRequest({ keyword:'seo content optimalisatie', language:await page.inputValue('#pwbLanguage'), region:await page.inputValue('#pwbRegion'), manualAi:manual, perplexityEvidenceText:'', rejected, googleSource:'gemini' });
      // The unseen text is still built by the exact shared research implementation.
      assert.equal(savedPrompt, research.buildPrewriteResearchPrompt(research.makePrewriteAiAnswerResearch({
        query:'seo content optimalisatie', language:await page.inputValue('#pwbLanguage'),
        market:await page.inputValue('#pwbRegion'), require_google_source:true,
        answers:[{engine:'google_aio',answer:manual.google_aio,google_source:'gemini'},
          {engine:'chatgpt',answer:''},{engine:'perplexity',answer:''},{engine:'claude',answer:''},{engine:'copilot',answer:''}]
      })));
      assert.ok(generated.prompt.includes('SEO-contentoptimalisatie'), 'Server receives answer data');
      await page.fill('#pwbAioText', 'AI ANSWER RESEARCH — WRITE FOR CITATION POTENTIAL. This is NOT citation tracking. Research the five answers to the target query. EDITORIAL REQUIREMENTS:');
      assert.match(await page.textContent('#cs-research-ask .cs-rp-status'), /1 answer needs correction/);
      assert.equal(await page.isVisible('#pwbAioText-cs-invalid'), true);
      assert.equal(await page.isVisible('#cs-research-prompt-tab'), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await new Promise(ok => server.close(ok)); }
  });
