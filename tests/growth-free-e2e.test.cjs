'use strict';
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
  const writes = [], mails = [];
  const engineDeps = { retryDelayMs: 0, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const html = PAGES[url]; if (!html) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html, final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, leads: LEADS, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString() }),
    // TEST writer stand-in: one section per selected task.
    generateDraft: async args => { writes.push(args); return { status: 'AI_DRAFT_REVIEW_REQUIRED', draft: { sections: (args.readerTask?.tasks || []).map(x => ({ task_code: x.code, h2: 'How to read a repair estimate',
      paragraphs: ['Ask for a written estimate that lists materials, labour and access separately before you approve any work on the roof.'] })) } }; } };
  const app = express(); app.use(express.json({ limit: '1mb' }));
  // The key's site domain (here 127.0.0.1): e-mail links open on the domain the visitor used, without extra settings.
  const baseCfg = freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: 'e2e-open-key-1' });
  const service = registerFreeGrowth(app, pool, { config: { ...baseCfg, accessKeys: baseCfg.accessKeys.map(k => ({ ...k, hosts: ['127.0.0.1'] })), writing: 'admin', adminKey: 'e2e-owner-secret-0123456789', writeLimit: 2, perIp: 50, daily: 20, perEmail: 10 }, engineDeps, fetchImpl: async () => ({ ok: true }), sendEmail: async m => { mails.push(m); return true; } });
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
    // Optional Search Console export (TEST data), filtered on exactly this page.
    const { zip } = require('./helpers/zip.cjs');
    await p.setInputFiles('#gscFile', { name: 'Performance-export.zip', mimeType: 'application/zip', buffer: zip({
      'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\nroof repair lodi nj,2,310,0.65%,14.2\nroof leak repair lodi,1,120,0.8%,9.5\n',
      'Dates.csv': 'Date,Clicks,Impressions,CTR,Position\n2026-10-01,1,200,0.5%,13.0\n2026-10-02,2,230,0.9%,12.0\n',
      'Filters.csv': 'Filter,Value\nSearch type,Web\nPage,' + URL_ + '\n' }) });
    await p.click('#f button[type=submit]');
    await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 });
    // 2. The result (Google research done by the real engine).
    await service.idle();
    await p.waitForSelector('#freeNextAction', { timeout: 60000 });
    assert.equal(await p.locator('details.journey-section').count(), 4, 'four clear workflow steps');
    await p.click('#stepResearch > summary');
    await p.waitForSelector('#google', { timeout: 60000 });
    assert.match(await p.textContent('h1'), /Your page in Google and in AI answers/);
    await p.waitForSelector('#freeNextAction .growth-next-btn');
    assert.match(await p.textContent('#freeNextAction'), /FREE GROWTH · ACTION PLAN/);
    assert.equal(await p.locator('#freeNextAction .growth-flow span').count(), 4);
    assert.equal(await p.locator('#freeNextAction .growth-next-btn').isVisible(), true);
    assert.ok((await p.locator('#freeNextAction .growth-next-btn').getAttribute('href')).startsWith('#'));

    // Search Console: verified for this page, used in the research, the search term found in it.
    assert.match(await p.textContent('#gsc + p'), /^Verified for this page\./);
    assert.match(await p.textContent('body'), /Your search term “roof repair lodi nj”: 310 impressions, 2 clicks, position 14\.2\./);
    // 3. An AI answer for the exact search term (validated with the shared contract).
    const prompt = await p.inputValue('#aiPrompt'); assert.match(prompt, /roof repair lodi nj/);
    await p.selectOption('#aiEngine', 'perplexity');
    await p.fill('#aiText', 'ANSWER:\nTEST: For roof repair in Lodi NJ, ask for a written estimate and check the licence of the roofer.\n\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/');
    await p.click('#aiSave');
    await p.waitForFunction(() => /1 of 5/.test(document.body.textContent), null, { timeout: 30000 });
    // 4. Select topics and let AI write concepts.
    await p.locator('#stepReview > summary').click();
    const picks = await p.$$('.gapPick'); assert.ok(picks.length >= 1, 'at least one topic to select');
    await picks[0].check();
    await p.waitForFunction(() => /selected · saved/.test(document.getElementById('gapStatus').textContent));
    const chosenId = await picks[0].getAttribute('value');
    await p.reload();
    await p.waitForSelector('#ownerUnlockForm');
    assert.equal(await p.locator('#gapWrite').count(),0,'ordinary visitors cannot use AI writing');
    assert.equal(await p.locator('.gapPick[value="' + chosenId + '"]').isChecked(), true, 'selection survives a page reload');
    await p.locator('#stepPrepare > summary').click();
    await p.fill('#ownerUnlockKey','e2e-owner-secret-0123456789');
    await p.click('#ownerUnlockButton');
    await p.waitForSelector('#gapWrite');
    assert.equal(await p.locator('#ownerUnlockKey').count(),0,'the owner password field disappears after login');
    assert.match(await p.textContent('#stepPrepare'),/Owner mode enabled/);
    assert.equal(await p.locator('.gapPick[value="' + chosenId + '"]').isChecked(),true,'unlock preserves the original H2 selection');
    const storedSelection = await (await fetch(new URL((await p.getAttribute('a[download][href*="report.json"]', 'href')), base))).json();
    assert.ok(storedSelection.selected_item_ids.includes(chosenId), 'selection is saved in the report');
    // Step 4 works without AI writing: the chosen item is an empty section the editor writes.
    await p.waitForFunction(() => /Open the package editor for your selection \(1\)/.test(document.getElementById('pkgOpen').textContent));
    if (!(await p.locator('#stepPrepare').evaluate(el => el.open))) await p.locator('#stepPrepare > summary').click();
    await p.click('#pkgOpen');
    assert.match(await p.getAttribute('.pkgText', 'placeholder'), /Only enter/);
    assert.equal(await p.locator('.pkg-edit').evaluate(el => el.open), false, 'unsupported text entry stays collapsed');
    await p.click('#pkgIncludeAll');
    assert.equal(await p.locator('.pkgUse:checked').count(), 0, 'no empty H2 gets included as invented copy');
    assert.match(await p.textContent('#pkgBulkStatus'), /No H2 has prepared text yet/);
    assert.equal(await p.isChecked('.pkgUse'), false);
    await p.click('#gapWrite');
    await p.waitForFunction(() => /How to read a repair estimate/.test(document.body.textContent), null, { timeout: 30000 });
    assert.equal(writes.length, 1);
    await p.click('#pkgIncludeAll');
    assert.equal(await p.locator('.pkgUse:checked').count(), 1, 'one-click include all prepared H2s');
    assert.match(await p.textContent('#pkgBulkStatus'), /1 of 1 H2s included/);
    // 5. Downloads: the editor brief and the JSON.
    if (!(await p.locator('#stepReview').evaluate(el => el.open))) await p.locator('#stepReview > summary').click();
    await p.locator('#gapDownload').locator('xpath=ancestor::details[1]/summary').click();
    const [brief] = await Promise.all([p.waitForEvent('download'), p.click('#gapDownload')]);
    assert.equal(brief.suggestedFilename(), 'editor-brief.md');
    const jsonUrl = await p.getAttribute('a[download][href*="report.json"]', 'href');
    const report = await (await fetch(new URL(jsonUrl, base))).json();
    assert.equal(report.search_console.latest.used_in_research, true);
    assert.match(report.disclaimer, /A Search Console export verified for this exact page was used/);
    assert.ok((report.report.destination_gsc_queries || []).some(q => q.query === 'roof repair lodi nj'), 'the research used the uploaded terms');
    // 5b. The CMS package (same ZIP as the Tracker): the original page is read, the editor must approve, then the ZIP downloads.
    if (!(await p.locator('#stepPrepare').evaluate(el => el.open))) await p.locator('#stepPrepare > summary').click();
    await p.waitForFunction(() => /Original page read now: “Roof Repair in Lodi, NJ \| Acme Roofing”/.test(document.body.textContent), null, { timeout: 30000 });
    assert.equal(await p.inputValue('#pkgTitle'), 'Roof Repair in Lodi, NJ | Acme Roofing');
    await p.fill('#pkgMeta', 'Roof repair in Lodi, NJ: leaks, tiles and flashing, with a written estimate before any work starts.');
    await p.selectOption('#pkgCms', 'wordpress');
    await p.click('#pkgDownload');
    await p.waitForFunction(() => /Tick that you reviewed the page/.test(document.getElementById('pkgIssues').textContent), null, { timeout: 30000 });
    await p.check('#pkgApprove');
    const [pkg] = await Promise.all([p.waitForEvent('download'), p.click('#pkgDownload')]);
    assert.equal(pkg.suggestedFilename(), 'cms-package.zip');
    const zipNames = [...require('node:fs').readFileSync(await pkg.path()).toString('latin1').matchAll(/(0\d-[a-z-]+\.(?:md|html|json)|manifest\.json)/g)].map(m => m[1]);
    for (const n of ['manifest.json', '01-implementation.md', '02-approved-copy.md', '03-content-fragments.html', '04-seo-metadata.json', '05-measurement-plan.md']) assert.ok(zipNames.includes(n), n);
    assert.match(require('node:fs').readFileSync(await pkg.path()).toString('utf8'), /Evidence: verified/);
    // 6. A later export (one CSV, not page-filtered): stored with the check, shown as not verified, research not re-run.
    await p.locator('#stepResearch > summary').click();
    await p.locator('#gscUpload > summary').click();
    await p.setInputFiles('#gscLater', { name: 'Queries.csv', mimeType: 'text/csv', buffer: Buffer.from('Top queries,Clicks,Impressions,CTR,Position\nroof repair lodi nj,3,340,0.9%,13.1\n') });
    await p.click('#gscSave');
    await p.waitForFunction(() => /Not verified for this page\./.test(document.body.textContent), null, { timeout: 30000 });
    assert.match(await p.textContent('body'), /2 exports uploaded for this check/);
    // 7. After publication: the date, a confirmation e-mail, two exports (4 weeks before and after) side by side, one
    // reminder e-mail with the result link, and the stop link.
    const { windowsOf } = require('../src/growth-free/reminders.cjs');
    const published = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10), w = windowsOf(published);
    assert.equal(await p.isVisible('#pubDate'), false, 'step 5 waits until the change is live');
    await p.locator('#stepPublish > summary').click();
    await p.click('#pubOpen summary');
    await p.fill('#pubDate', published); await p.click('#pubSave');
    await p.waitForFunction(() => /One e-mail on .* to t\*\*\*@acme-roofing\.example/i.test(document.getElementById('pubBox').textContent), null, { timeout: 30000 });
    assert.equal(mails.length, 1); assert.deepEqual(mails[0].to, [email.toLowerCase()]); assert.match(mails[0].subject, /Reminder set/);
    const days = (a, b) => { const out = []; for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
    const period = (win, imp) => zip({ 'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\nroof repair lodi nj,2,' + imp + ',0.5%,12.0\n',
      'Dates.csv': 'Date,Clicks,Impressions,CTR,Position\n' + days(win.start, win.end).map(d => d + ',1,' + Math.round(imp / 28) + ',0.5%,12.0').join('\n') + '\n',
      'Filters.csv': 'Filter,Value\nPage,' + URL_ + '\n' });
    for (const [win, imp, n] of [[w.before, 280, 3], [w.after, 560, 4]]) {
      if (!(await p.locator('#stepResearch').evaluate(el => el.open))) await p.locator('#stepResearch > summary').click();
      if (!(await p.locator('#gscUpload').evaluate(el => el.open))) await p.locator('#gscUpload > summary').click();
      await p.setInputFiles('#gscLater', { name: 'Performance-' + win.start + '.zip', mimeType: 'application/zip', buffer: period(win, imp) });
      await p.click('#gscSave');
      await p.waitForFunction(k => new RegExp(k + ' exports uploaded').test(document.body.textContent), String(n), { timeout: 30000 });
    }
    const latest = await (await fetch(new URL((await p.getAttribute('a[download][href*="report.json"]', 'href')), base))).json();
    assert.equal(latest.search_console.latest.status, 'VERIFIED_FOR_PAGE');
    assert.equal(latest.search_console.latest.used_in_research, false, 'a late verified GSC export is not falsely claimed as research evidence');
    const cmp = await p.textContent('#pubBox');
    assert.match(cmp, /Before and after in Google/); assert.doesNotMatch(cmp, /No export yet/);
    assert.match(cmp, /280 shown · 28 clicks[^]*560 shown · 28 clicks/); assert.doesNotMatch(cmp, /not exactly the 4 weeks/);
    const due = await service.sendDueReminders({ now: new Date() });
    assert.deepEqual(due, { sent: 1, failed: 0 });
    const reminder = mails[1]; assert.match(reminder.subject, /Four weeks after your update/); assert.deepEqual(reminder.to, [email.toLowerCase()]);
    const resultLink = /href="([^"]*\/free-growth\/r\/[^"]*)"/.exec(reminder.html)[1], stopLink = /href="([^"]*\/free-growth\/stop\/[^"]*)"/.exec(reminder.html)[1];
    assert.equal(new URL(resultLink).pathname, new URL(p.url()).pathname, 'the e-mail links to this result');
    assert.equal(new URL(resultLink).origin, 'https://127.0.0.1', 'the link uses the domain the visitor used');
    assert.deepEqual(await service.sendDueReminders({ now: new Date() }), { sent: 0, failed: 0 }, 'sent once');
    assert.match(await (await fetch(base + new URL(stopLink).pathname)).text(), /Reminder stopped/);
    // Completed AI research: five saved answers must not leave the large input form open.
    for (const engine of ['google_aio', 'chatgpt', 'claude', 'copilot']) {
      if (!(await p.locator('#stepResearch').evaluate(el => el.open))) await p.locator('#stepResearch > summary').click();
      if (!(await p.locator('#aiRecheck').evaluate(el => el.open))) await p.locator('#aiRecheck > summary').click();
      await p.selectOption('#aiEngine', engine);
      await p.fill('#aiText', 'ANSWER:\nRoof repair Lodi NJ advice includes checking written estimates and leak repair procedures.\n\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/');
      await p.click('#aiSave');
      await p.waitForFunction(value => document.getElementById('ai').textContent.includes(value + ' of 5'), ['google_aio', 'chatgpt', 'claude', 'copilot'].indexOf(engine) + 2);
    }
    assert.equal(await p.locator('#aiRecheck').evaluate(el => el.open), false, 'five completed AI answers collapse the entry form');
    assert.equal(await p.locator('#aiText').isVisible(), false);
    assert.match(await p.textContent('#aiRecheck > summary'), /All five AI systems checked/);
    await p.locator('#aiRecheck > summary').click();
    assert.equal(await p.locator('#aiText').isVisible(), true, 'user can deliberately recheck an answer');
    assert.deepEqual(errors, [], 'no browser error on the way');
    // Database: the check and the AI answer are in the Free tables; no Tracker table was created or written.
    const row = (await pool.query('SELECT id,status,email FROM growth_free_checks WHERE lower(email)=lower($1)', [email])).rows[0];
    assert.equal(row.status, 'DONE');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM growth_free_ai_answers WHERE check_id=$1', [row.id])).rows[0].n, 5);
    assert.deepEqual((await pool.query('SELECT status FROM growth_free_gsc_uploads WHERE check_id=$1 ORDER BY id', [row.id])).rows.map(r => r.status), ['VERIFIED_FOR_PAGE', 'NOT_VERIFIED_FOR_PAGE', 'VERIFIED_FOR_PAGE', 'VERIFIED_FOR_PAGE']);
    assert.ok((await pool.query('SELECT reminder_opt_out_at FROM growth_free_checks WHERE id=$1', [row.id])).rows[0].reminder_opt_out_at, 'the stop link stopped the reminder');
    const after = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'tracker\\_%'")).rows.map(r => r.table_name).sort();
    assert.deepEqual(after, before, 'no Tracker table created');
  } finally { await browser.close(); srv.close(); await pool.end(); }
});
