'use strict';
// Verify the real Tracker Pre-Write modal exposes the exact shared Research Prompt on demand while answers remain the default.
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
test('Pre-Write AI collection defaults to answers and exposes the shared Research Prompt on demand',
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
      }, null, {timeout: 5000});
      assert.equal(await page.isDisabled('#cs-research-ask-copy'), false);

      assert.equal(await page.isVisible('#cs-research-tabs'), true, 'Research Prompt is discoverable, not hidden');
      assert.equal(await page.isVisible('#cs-research-prompt-panel'), false, 'Answers are the default tab');
      await page.click('#cs-research-prompt-tab');
      assert.equal(await page.isVisible('#cs-research-prompt-panel'), true, 'The owner can inspect the actual generator prompt');
      assert.match(await page.inputValue('#cs-research-prompt-panel textarea'), /seo content optimalisatie/);
      await page.click('#cs-research-inputs-tab');
      assert.equal(await page.isVisible('#pwbAioText'), true);
      assert.equal(await page.isVisible('#pwbAioText'), true, 'Answer fields remain available');
      assert.match(await page.textContent('#cs-research-ask .cs-ask-note'), /Copy the question.*Paste that system/);
      // Outside a Tracker (no token) no customer question can be looked up: the keyword itself is the question to copy.
      await page.waitForFunction(() => document.getElementById('cs-ai-question').value === 'seo content optimalisatie', null, { timeout: 4000 });
      await page.fill('#pwbKeyword', 'seo content optimalisatie');
      assert.match(await page.textContent('#cs-research-ask .cs-rp-status'), /0 of 5 AI answers ready/);
      await page.click('#cs-research-ask-copy');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'seo content optimalisatie');
      // Visible confirmation on each click (owner 2026-11-10): green "Copied ✓" with a short animation, then back.
      assert.equal(await page.textContent('#cs-research-ask-copy'), 'Copied ✓');
      assert.equal(await page.evaluate(() => document.getElementById('cs-research-ask-copy').classList.contains('cs-copied')), true);
      await page.waitForFunction(() => document.getElementById('cs-research-ask-copy').textContent === 'Copy search question', null, { timeout: 4000 });
      await page.click('#cs-research-ask-copy');
      await page.waitForFunction(() => document.getElementById('cs-research-ask-copy').textContent === 'Copied ✓', null, { timeout: 4000 });
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
      assert.equal(await page.isVisible('#cs-research-prompt-tab'), true);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await new Promise(ok => server.close(ok)); }
  });

// Owner 2026-11-12: "the keyword must be a real search question, the best match". The tab picks Google's question for the
// keyword, keeps where it came from, checks pasted answers against it and puts it in the research prompt the Brief uses.
test('Pre-Write: the best real Google question is chosen, carried into the research prompt and the answer check',
  { skip: !chromium && 'Playwright not installed' }, async () => {
    const modal = realModalMarkup();
    const html = '<!doctype html><html><head><meta charset="utf-8">' +
      '<script>window.csComboOpen=window.csComboFilter=window.csComboToggle=function(){};</script>' +
      '<script defer src="/prewrite-ai-answer-research.js"></script>' +
      '<script defer src="/prewrite-research-tab.js"></script></head><body>' +
      modal.replace('class="cs-modal"', 'class="cs-modal" style="display:block;padding:16px"') + '</body></html>';
    const asked = [];
    const server = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/track/TESTTOKEN/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      if (u === '/api/tracker-client/TESTTOKEN/prewrite-customer-question') {
        asked.push(new URL(req.url, 'http://x').searchParams.get('keyword'));
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, keyword: 'dakreparatie amsterdam', best_question: 'Wat kost dakreparatie in Amsterdam?', best_label: 'Google · People also ask',
          questions: [{ text: 'Wat kost dakreparatie in Amsterdam?', label: 'Google · People also ask' }, { text: 'dakdekker amsterdam spoed', label: 'Google · Related search' }] }));
      }
      const file = path.join(__dirname, '../public', path.basename(u));
      if (fs.existsSync(file)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(file)); }
      res.statusCode = 404; res.end();
    });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/track/TESTTOKEN/');
      await page.waitForSelector('#cs-ai-question');
      await page.fill('#pwbKeyword', 'dakreparatie amsterdam');
      await page.dispatchEvent('#pwbKeyword', 'change');
      await page.waitForFunction(() => document.getElementById('cs-ai-question').value === 'Wat kost dakreparatie in Amsterdam?', null, { timeout: 5000 });
      assert.deepEqual(asked, ['dakreparatie amsterdam']);
      assert.equal(await page.getAttribute('#cs-ai-question', 'data-source'), 'Google · People also ask');
      await page.waitForFunction(() => /Customer question asked to the AI systems: "Wat kost dakreparatie in Amsterdam\?" \(Google · People also ask\)/.test(document.querySelector('#cs-research-prompt-panel textarea').value), null, { timeout: 5000 });
      // The question pasted back is not an answer; a real answer to it counts.
      await page.fill('#pwbChatgptText', 'Wat kost dakreparatie in Amsterdam?');
      await page.dispatchEvent('#pwbChatgptText', 'input');
      await page.waitForSelector('#pwbChatgptText-cs-invalid.cs-ai-invalid');
      assert.match(await page.textContent('#pwbChatgptText-cs-invalid'), /INVALID/);
      // Owner 2026-11-12: questions the AI systems raise in their answers become choices; a long question is not cut off.
      await page.fill('#pwbPerplexityText', 'Un consultor GEO revisa cómo aparece tu marca en las respuestas de IA.\n\nPreguntas relacionadas:\n- ¿Cómo vas a medir si mi marca aparece, se cita y se recomienda en ChatGPT, Gemini, Perplexity y Google AI Overviews para las preguntas que realmente hacen mis clientes antes de comprar?\n- ¿Cuánto tarda en notarse una consultoría GEO?');
      await page.dispatchEvent('#pwbPerplexityText', 'input');
      await page.waitForSelector('#cs-ai-question-from-answers button');
      const fromAnswers = await page.$$eval('#cs-ai-question-from-answers button', b => b.map(x => [x.textContent, x.title]));
      assert.equal(fromAnswers.length, 2);
      assert.match(fromAnswers[0][1], /Perplexity · question in its answer/);
      await page.click('#cs-ai-question-from-answers button');
      const long = await page.inputValue('#cs-ai-question');
      assert.ok(long.length > 160 && /antes de comprar\?$/.test(long), 'the whole question: ' + long);
      assert.match(await page.getAttribute('#cs-ai-question', 'data-source'), /Perplexity/);
      // Picking the keyword itself: no customer question in the prompt.
      await page.click('#cs-ai-question-options button:last-child');
      await page.waitForFunction(() => !/Customer question asked/.test(document.querySelector('#cs-research-prompt-panel textarea').value), null, { timeout: 5000 });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
