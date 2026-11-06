'use strict';
// Free Growth check, end to end: the real Free routes, the real Growth research engine, the real Postgres store and the
// real result page in a browser. Only the outside world is replaced (TEST pages, TEST Google results, TEST writer).
// A visitor: opens the form, enters page + search term + market + language + email, waits for the result, pastes an AI
// answer, selects topics, lets AI write concepts, downloads the editor brief and the JSON. Checks: no browser error, the
// rows are in the Free tables only, and no Tracker table is created or written.
// Runs only with PREWRITE_E2E_DATABASE_URL (a local, disposable PostgreSQL) and Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null, chromium = null; try { pg = require('pg'); } catch (e) {} try { ({ chromium } = require('playwright')); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg ? 'pg not installed' : !chromium && 'Playwright not installed';

const URL_ = 'https://acme-roofing.example/roof-repair-lodi-nj/';
const ownHtml = '<html><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title></head><body><h1>Roof Repair in Lodi, NJ</h1>' +
  '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p>' +
  '<h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const comp = (h, rows) => '<html><body><article><h1>' + h + '</h1>' + rows.map(([a, b]) => '<h2>' + a + '</h2><p>' + b + '</p>').join('') + '</article></body></html>';
const estimateA = 'A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, so you understand every line.';
const estimateB = 'Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate is easier to compare.';
const PAGES = { [URL_]: ownHtml,
  'https://roofer-a.example/roof-repair-nj/': comp('Roof repair in Paterson, NJ', [['How a repair estimate is built', estimateA]]),
  'https://roofer-b.example/services/roof-repair/': comp('Roof repairs in Bergen County, NJ', [['What goes into an estimate', estimateB]]) };
const LEADS = [['https://roofer-a.example/roof-repair-nj/', 'Roof Repair in Paterson, NJ | Roofer A'], ['https://roofer-b.example/services/roof-repair/', 'Roof Repairs in Bergen County NJ - Roofer B']]
  .map(([url, title], i) => ({ url, title, snippet: 'Local roof repair', source: 'SERPER_GOOGLE_ORGANIC', serp_position: i + 1 }));

test('Free Growth: a visitor goes through every step in a browser, against Postgres, without touching the Tracker', { skip, timeout: 240000 }, async () => {
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const pool = new pg.Pool({ connectionString: DB });
  const writes = [];
  const engineDeps = { retryDelayMs: 0, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const html = PAGES[url]; if (!html) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html, final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, leads: LEADS, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString() }),
    // TEST writer stand-in: one section per selected task.
    generateDraft: async args => { writes.push(args); return { status: 'AI_DRAFT_REVIEW_REQUIRED', draft: { sections: (args.readerTask?.tasks || []).map(x => ({ task_code: x.code, h2: 'How to read a repair estimate',
      paragraphs: ['Ask for a written estimate that lists materials, labour and access separately before you approve any work on the roof.'] })) } }; } };
  const app = express(); app.use(express.json({ limit: '1mb' }));
  const service = registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: 'e2e-open-key-1' }), writing: 'all', writeLimit: 2, perIp: 50, daily: 20, perEmail: 10 }, engineDeps, fetchImpl: async () => ({ ok: true }) });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    const before = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'tracker\\_%'")).rows.map(r => r.table_name).sort();
    const ctx = await browser.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // 1. The form: page, search term, market, language, email.
    await p.goto(base + '/free-growth?key=e2e-open-key-1');
    await p.fill('#url', URL_); await p.fill('#query', 'roof repair lodi nj'); await p.fill('#market', 'us — United States'); await p.fill('#language', 'English');
    const email = 'TEST-' + crypto.randomBytes(3).toString('hex') + '@acme-roofing.example';
    await p.fill('#email', email); await p.check('input[name=consent]');
    await p.click('#f button[type=submit]');
    await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 });
    // 2. The result (Google research done by the real engine).
    await service.idle();
    await p.waitForSelector('#google', { timeout: 60000 });
    assert.match(await p.textContent('h1'), /Your page in Google and in AI answers/);
    // 3. An AI answer for the exact search term (validated with the shared contract).
    const prompt = await p.inputValue('#aiPrompt'); assert.match(prompt, /roof repair lodi nj/);
    await p.selectOption('#aiEngine', 'perplexity');
    await p.fill('#aiText', 'ANSWER:\nTEST: For roof repair in Lodi NJ, ask for a written estimate and check the licence of the roofer.\n\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/');
    await p.click('#aiSave');
    await p.waitForFunction(() => /1 of 5/.test(document.body.textContent), null, { timeout: 30000 });
    // 4. Select topics and let AI write concepts.
    const picks = await p.$$('.gapPick'); assert.ok(picks.length >= 1, 'at least one topic to select');
    await picks[0].check();
    await p.click('#gapWrite');
    await p.waitForFunction(() => /How to read a repair estimate/.test(document.body.textContent), null, { timeout: 30000 });
    assert.equal(writes.length, 1);
    // 5. Downloads: the editor brief and the JSON.
    const [brief] = await Promise.all([p.waitForEvent('download'), p.click('#gapDownload')]);
    assert.equal(brief.suggestedFilename(), 'editor-brief.md');
    const jsonUrl = await p.getAttribute('a[download][href*="report.json"]', 'href');
    const report = await (await fetch(new URL(jsonUrl, base))).json();
    assert.ok(report && typeof report === 'object');
    assert.deepEqual(errors, [], 'no browser error on the way');
    // Database: the check and the AI answer are in the Free tables; no Tracker table was created or written.
    const row = (await pool.query('SELECT id,status,email FROM growth_free_checks WHERE lower(email)=lower($1)', [email])).rows[0];
    assert.equal(row.status, 'DONE');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM growth_free_ai_answers WHERE check_id=$1', [row.id])).rows[0].n, 1);
    const after = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'tracker\\_%'")).rows.map(r => r.table_name).sort();
    assert.deepEqual(after, before, 'no Tracker table created');
  } finally { await browser.close(); srv.close(); await pool.end(); }
});
