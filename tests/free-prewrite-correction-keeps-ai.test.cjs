'use strict';
// Owner 2026-11-28: "waarom is de ai search leeg als ik alleen de intent moest veranderen? weer handmatig plakken is niet
// slim". The correction form under the brief started empty, so a correction of only the search intent sent no AI answers
// and the corrected brief lost them. Now the form starts with the answers, the Google source and the customer question of
// the brief it corrects; they can still be changed or replaced.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), express = require('express');
const { registerFreePrewrite } = require('../src/free-prewrite.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch {}

const KEY = 'c'.repeat(64);
const ANSWERS = { google_aio: 'ANSWER: Google lists Semrush and Seobility.', chatgpt: 'ANSWER: ChatGPT lists Search Console.', perplexity: 'ANSWER: Perplexity lists Ahrefs.', claude: 'ANSWER: Claude lists AIOSEO.' };
const BRIEF = { language: 'es', keyword: 'seo checker gratis',
  content_decision: { recommended_treatment: 'CREATE_NEW_PAGE', reason: 'Nueva página.' }, meta_package: { h1: 'SEO checker gratis', url_slug: '/seo-checker/' },
  search_intent: { primary: 'transactional' },
  customer_question: { text: '¿Qué seo checker gratis analiza el SEO de mi web?', source: 'free_pre_write_owner' },
  ai_system_evidence: { google_aio: { text: ANSWERS.google_aio, checked: true, google_source: 'gemini' }, chatgpt: { text: ANSWERS.chatgpt, checked: true },
    perplexity: { text: ANSWERS.perplexity, checked: true }, claude: { text: ANSWERS.claude, checked: true }, copilot: { text: '', checked: false } },
  action_plan: [{ step: 1, action: 'Crea la página.' }] };

test('a correction of only the search intent keeps the AI answers of the brief', { skip: !chromium && 'Playwright not installed', timeout: 60000 }, async () => {
  const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, '..', 'public')));
  registerFreePrewrite(app, { query: () => { throw Error('no database'); } });
  const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/free-pre-write/result', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, status: 'open', language: 'es', region: 'es',
      website: 'https://es.example.com/', keyword: BRIEF.keyword, target: { mode: 'CREATE', url: 'https://es.example.com/seo-checker/' }, instructions: 'CREATE', brief: BRIEF }) }));
    await page.route('**/api/free-pre-write/implementation-report', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, history: [], editor_brief: {} }) }));
    let sent = null;
    await page.route('**/api/free-pre-write', r => { if (r.request().method() !== 'POST') return r.continue(); sent = JSON.parse(r.request().postData()); return r.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' }); });
    await page.goto(base + '/free-pre-write/r?lang=es#' + KEY);
    const form = page.locator('#intent-adjust'); await form.waitFor({ state: 'visible' });
    for (const [engine, text] of Object.entries(ANSWERS)) assert.equal(await form.locator('[name="ai-' + engine + '"]').inputValue(), text, engine + ' filled in');
    assert.equal(await form.locator('[name="ai-copilot"]').inputValue(), '', 'a system that was not checked stays empty');
    assert.equal(await form.locator('[name=google-source]').inputValue(), 'gemini');
    assert.equal(await form.locator('[name=ai-question]').inputValue(), BRIEF.customer_question.text);
    // Only the intent changes: the correction sends the same AI answers.
    await form.locator('select[name=intent]').selectOption('commercial');
    await form.locator('button[type=submit]').click();
    await page.waitForFunction(() => true); for (let i = 0; i < 40 && !sent; i++) await page.waitForTimeout(100);
    assert.ok(sent, 'the correction was sent');
    assert.equal(sent.intentOverride, 'commercial'); assert.equal(sent.revisionOf, KEY);
    for (const [engine, text] of Object.entries(ANSWERS)) assert.equal(sent.manualAiEvidence[engine], text, engine + ' sent again');
    assert.equal(sent.manualAiEvidence.google_source, 'gemini');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
