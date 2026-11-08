'use strict';
// Free Growth in a browser, when the research has too little evidence to write (only 1 readable ranking page): step 2
// says why AI cannot write, what the visitor can do, and links to a new check for the same page with the form filled in.
// TEST pages and TEST Google results only. Runs only with PREWRITE_E2E_DATABASE_URL (local PostgreSQL) and Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null, chromium = null; try { pg = require('pg'); } catch (e) {} try { ({ chromium } = require('playwright')); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg ? 'pg not installed' : !chromium && 'Playwright not installed';

const URL_ = 'https://acme-roofing.example/roof-repair-lodi-nj-thin/'; // own URL: tests share one database and its 24-hour result cache
const own = '<html><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title></head><body><h1>Roof Repair in Lodi, NJ</h1><h2>Our roof repair services</h2><p>' + 'TEST: our crew repairs leaking roofs in Lodi and nearby towns, and explains every repair first. '.repeat(3) + '</p></body></html>';
const one = '<html><body><article><h1>Roof repair in Paterson, NJ</h1><h2>How a repair estimate is built</h2><p>' + 'TEST: a repair estimate lists materials, labour and access, and explains hidden decking damage. '.repeat(3) + '</p></article></body></html>';
const PAGES = { [URL_]: own, 'https://roofer-a.example/roof-repair-nj/': one };

test('Free Growth: too little evidence to write — the reason, what to do, and a filled-in new check', { skip, timeout: 180000 }, async () => {
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const pool = new pg.Pool({ connectionString: DB });
  const writes = [];
  const engineDeps = { retryDelayMs: 0, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const html = PAGES[url]; if (!html) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html, final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString(),
      leads: [{ url: 'https://roofer-a.example/roof-repair-nj/', title: 'Roof Repair in Paterson, NJ | Roofer A', snippet: 'Local roof repair', source: 'SERPER_GOOGLE_ORGANIC', serp_position: 1 }] }),
    generateDraft: async a => { writes.push(a); return { status: 'AI_DRAFT_REVIEW_REQUIRED', draft: { sections: [] } }; } };
  const app = express(); app.use(express.json({ limit: '5mb' }));
  const service = registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: 'e2e-open-key-2' }), perIp: 50, daily: 20, perEmail: 10 }, engineDeps, fetchImpl: async () => ({ ok: true }) });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ colorScheme: 'dark' })).newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/free-growth?key=e2e-open-key-2');
    await p.fill('#url', URL_); await p.fill('#query', 'roof repair lodi nj');
    // Two addresses (up to five are allowed).
    const emails = 'test-' + crypto.randomBytes(3).toString('hex') + '@acme-roofing.example, test-second@acme-roofing.example';
    await p.fill('#email', emails); await p.check('input[name=consent]');
    await p.click('#f button[type=submit]');
    try { await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 }); } catch (e) { throw Error('form did not start: ' + (await p.textContent('#f'))); }
    await service.idle();
    await p.waitForSelector('#nextWrite', { state: 'attached', timeout: 60000 });
    const box = await p.textContent('#nextWrite');
    assert.match(box, /AI cannot write text for this check yet/);
    assert.match(box, /It is not clear what people searching for this want/, 'the concrete reason, in plain words');
    assert.doesNotMatch(box, /data blocked|serp intent/i, 'no internal codes');
    assert.match(box, /at least 2 pages that Google ranks[^]*\(here: 1\)/);
    assert.match(box, /more specific search term/); assert.match(box, /editor brief/);
    assert.equal(await p.locator('#nextWriteBtn').count(), 0, 'no write button without evidence');
    // Even without advice, what the competitor pages have that this page does not stays visible (the point of Growth).
    assert.match(await p.textContent('#freeNextAction .growth-next-btn'), /See what the competitor pages have that you do not/);
    await p.click('#freeNextAction .growth-next-btn');
    assert.equal(await p.isVisible('#competitors'), true);
    const comp = await p.evaluate(() => { const h = document.getElementById('competitors'); let t = h.textContent, n = h.nextElementSibling; for (let i = 0; i < 3 && n; i++, n = n.nextElementSibling) t += ' ' + n.textContent; return t.replace(/\s+/g, ' '); });
    assert.match(comp, /What the competitor pages have that your page does not \(1\)/);
    assert.match(comp, /Observations only: there was not enough evidence for advice/);
    assert.match(comp, /#1 roofer-a\.example · Read · 1 of 1 heading\(s\) not on your page/);
    assert.match(comp, /How a repair estimate is built · Not on your page/);
    // The new check opens with this page and search term already filled in.
    const href = await p.getAttribute('#nextWriteNewCheck', 'href');
    await p.goto(new URL(href, base).href);
    assert.equal(await p.inputValue('#url'), URL_); assert.equal(await p.inputValue('#query'), 'roof repair lodi nj');
    // This browser remembered the addresses, so the next check does not start from zero.
    assert.equal((await p.inputValue('#email')).replace(/\s+/g, ''), emails.replace(/\s+/g, ''));
    const stored = (await pool.query("SELECT email,emails FROM growth_free_checks WHERE url=$1 ORDER BY id DESC LIMIT 1", [URL_])).rows[0];
    assert.equal(stored.email, emails.split(', ')[0]); assert.deepEqual(stored.emails, emails.split(', '));
    assert.equal(writes.length, 0, 'the writer was never called');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); await pool.end(); }
});
