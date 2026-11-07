'use strict';
// Free Growth owner mode (copied set-up of growth-free-e2e): the owner signs in with the admin key on the public form.
// Free Growth check, end to end: the real Free routes, the real Growth research engine, the real Postgres store and the
// real result page in a browser. Only the outside world is replaced (TEST pages, TEST Google results, TEST writer).
// A visitor: opens the form, enters page + search term + market + language + email, waits for the result, pastes an AI
// answer, selects topics, lets AI write concepts, downloads the editor brief, the JSON and the CMS package (ZIP). Checks: no browser error, the
// rows are in the Free tables only, and no Tracker table is created or written.
// Runs only with PREWRITE_E2E_DATABASE_URL (a local, disposable PostgreSQL) and Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null, chromium = null; try { pg = require('pg'); } catch (e) {} try { ({ chromium } = require('playwright')); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg ? 'pg not installed' : !chromium && 'Playwright not installed';

const URL_ = 'https://acme-roofing.example/roof-repair-lodi-nj-owner/'; // own URL: tests share one database and its 24-hour result cache
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


test('Free Growth: the owner signs in on the form — no daily limit, AI writing on; visitors keep their limits', { skip, timeout: 240000 }, async () => {
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const pool = new pg.Pool({ connectionString: DB });
  const engineDeps = { retryDelayMs: 0, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const html = PAGES[url]; if (!html) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html, final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, leads: LEADS, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString() }) };
  const app = express(); app.use(express.json({ limit: '5mb' }));
  // Visitors: one check per e-mail per day and no AI writing (writing=admin), so the difference is visible.
  const service = registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: '[{"key":"e2e-owner-key-1","per_email":1,"per_ip":50,"daily":20}]' }), writing: 'admin', adminKey: 'e2e-owner-secret-0123456789', perIp: 50, daily: 20, perEmail: 1 }, engineDeps, fetchImpl: async () => ({ ok: true }) });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ colorScheme: 'dark' })).newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    const email = 'TEST-owner-' + crypto.randomBytes(3).toString('hex') + '@acme-roofing.example';
    const run = async q => { await p.goto(base + '/free-growth?key=e2e-owner-key-1'); await p.fill('#url', URL_); await p.fill('#query', q);
      await p.fill('#email', email); await p.check('input[name=consent]'); await p.click('#f button[type=submit]'); };
    // Visitor: the second check of the day is refused.
    await run('roof repair lodi nj'); await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 }); await service.idle();
    await run('roof repair lodi new jersey'); await p.waitForFunction(() => { const el = document.getElementById('s'); return el && /checks per day|limit|today/i.test(el.textContent); }, null, { timeout: 30000 });
    // Owner: sign in on the form.
    await p.goto(base + '/free-growth?key=e2e-owner-key-1');
    assert.match(await p.textContent('#ownerBox'), /Owner\? Sign in/);
    await p.click('#ownerBox summary'); await p.fill('#ownerKey', 'wrong-key-0123456789'); await p.click('#ownerIn button');
    await p.waitForFunction(() => /Wrong admin key/.test(document.getElementById('ownerSt').textContent));
    await p.fill('#ownerKey', 'e2e-owner-secret-0123456789'); await p.click('#ownerIn button');
    await p.waitForFunction(() => /Owner mode/.test((document.getElementById('ownerBox') || {}).textContent || ''), null, { timeout: 30000 });
    assert.match(await p.textContent('#f'), /Owner mode: no daily limit/); assert.doesNotMatch(await p.textContent('#f'), /Max 1 free checks per day/);
    // The same e-mail, past the visitor limit: the owner's check starts, and AI writing is offered.
    await p.fill('#url', URL_); await p.fill('#query', 'roof repair lodi new jersey'); await p.fill('#email', email); await p.check('input[name=consent]');
    await p.click('#f button[type=submit]'); await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 }); await service.idle();
    await p.waitForSelector('.gapPick', { state: 'attached', timeout: 60000 });
    if (!(await p.locator('#stepReview').evaluate(el => el.open))) await p.locator('#stepReview > summary').click();
    await p.locator('.gapPick').first().check();
    await p.waitForSelector('#nextWriteBtn', { timeout: 10000 });
    assert.match(await p.textContent('#nextWriteBtn'), /Write the 1 chosen H2\(s\) with AI/);
    const row = (await pool.query("SELECT access_label FROM growth_free_checks WHERE lower(email)=lower($1) ORDER BY id DESC LIMIT 1", [email])).rows[0];
    assert.equal(row.access_label, 'admin');
    // Without the custom header, the session cookie alone never makes a check an owner check (another site cannot send it).
    const cookie = (await p.context().cookies()).map(c => c.name + '=' + c.value).join('; ');
    const plain = await fetch(base + '/api/free-growth/checks', { method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: 'e2e-owner-key-1', url: URL_, query: 'roof repair lodi nj usa', email, consent: true }) });
    assert.notEqual(plain.status, 202, 'cookie without the header: the visitor limit still applies');
    // Signing out returns the normal form.
    await p.goto(base + '/free-growth?key=e2e-owner-key-1'); await p.click('#ownerOut'); await p.waitForFunction(() => /Owner\? Sign in/.test(document.body.textContent));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); await pool.end(); }
});
