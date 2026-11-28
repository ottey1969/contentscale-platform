'use strict';
// Owner 2026-11-28: "kun je free growth nakijken op verbeteringen". A walk through the Dutch and Spanish Free Growth pages
// with every section opened found about 50 English texts (the "Result from earlier today" note with a US date, the AI
// research box, the owner report, the limitations, the evidence lists, the owner sign-in). Spanish is Spanish, Dutch is
// Dutch (owner 2026-11-12). This test opens every section of the form and of the result in nl and es and compares each
// visible text with the English page: a text that is still the same English text fails, unless it is a name or page data.
// Also: the mixed-results limitation said the same thing twice.
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
const est = 'A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property and its roof.';
const PAGES = { [URL_]: ownHtml,
  'https://roofer-a.example/roof-repair-nj/': comp('Roof repair in Paterson, NJ', [['How a repair estimate is built', est], ['Emergency tarping', est.replace(/estimate/g, 'tarp')]]),
  'https://roofer-b.example/services/roof-repair/': comp('Roof repairs in Bergen County, NJ', [['What goes into an estimate', est]]) };
const LEADS = [['https://roofer-a.example/roof-repair-nj/', 'Roof Repair in Paterson, NJ | Roofer A'], ['https://roofer-b.example/services/roof-repair/', 'Roof Repairs in Bergen County NJ - Roofer B']]
  .map(([url, title], i) => ({ url, title, snippet: 'Local roof repair', source: 'SERPER_GOOGLE_ORGANIC', serp_position: i + 1 }));
// Names and data stay as they are: product and system names, the author, and the words of the pages that were read.
const NAMES = new Set(['Search Console', 'Google Search Console', 'GRAAF ContentScore', 'ChatGPT Search', 'Microsoft Copilot', 'Perplexity', 'Claude',
  'Gemini / Google AI Overview (identify exact source)', 'Ottmar J.G. Francisca · ContentScale', 'ContentScale', 'Firecrawl', 'Download JSON']);
const DATA = /acme|roof|estimate|tarp|lodi|paterson|bergen|homeowners|example|https?:|@/i;

test('Free Growth in Dutch and Spanish: no English text left on the form or the result, every section opened', { skip, timeout: 300000 }, async () => {
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const pool = new pg.Pool({ connectionString: DB });
  await pool.query("DELETE FROM free_tool_usage WHERE tool='FREE_GROWTH'").catch(() => {});
  const engineDeps = { retryDelayMs: 0, aiGapModel: null, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const html = PAGES[url]; if (!html) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html, status: 200, redirect_chain: [], final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, leads: LEADS, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString() }),
    metaModel: { call: async () => JSON.stringify({ title: 'Roof Repair in Lodi, NJ | Acme Roofing', description: 'Acme Roofing repairs leaking roofs in Lodi, NJ.' }) },
    questionFetch: async () => ({ ok: true, json: async () => ({ peopleAlsoAsk: [], relatedSearches: [] }) }), questionModel: null,
    styleModel: { call: async () => JSON.stringify({ fixes: [] }) },
    generateDraft: async () => ({ status: 'AI_DRAFT_REVIEW_REQUIRED', draft: { sections: [] } }) };
  const app = express(); app.use(express.json({ limit: '1mb' }));
  const baseCfg = freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: 'e2e-open-key-1' });
  const service = registerFreeGrowth(app, pool, { config: { ...baseCfg, accessKeys: baseCfg.accessKeys.map(k => ({ ...k, hosts: ['127.0.0.1'] })), writing: 'admin', adminKey: 'e2e-owner-secret-0123456789', writeLimit: 2, perIp: 50, daily: 20, perEmail: 10 },
    engineDeps, fetchImpl: async () => ({ ok: true }), sendEmail: async () => true });
  const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const texts = async p => { await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await p.waitForTimeout(600);
    return p.evaluate(() => { const out = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const e = n.parentElement; if (!e || e.closest('script,style,textarea,blockquote,code,pre,[data-no-translate]')) continue; const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) out.add(t); }
      document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(e => ['placeholder', 'aria-label', 'title'].forEach(a => { const v = e.getAttribute(a); if (v) out.add(v); }));
      return [...out]; }); };
  const pages = {};
  try {
    for (const lang of ['en', 'nl', 'es']) {
      const ctx = await browser.newContext(); const p = await ctx.newPage(); const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await ctx.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
      await p.goto(base + '/free-growth?key=e2e-open-key-1&lang=' + lang);
      const form = await texts(p);
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = false; }));
      await p.fill('#url', URL_); await p.fill('#query', 'roof repair lodi nj');
      await p.fill('#market', 'us — United States'); await p.fill('#language', 'English'); await p.fill('#search_location', 'New Jersey, United States');
      await p.fill('#email', 'TEST-' + lang + crypto.randomBytes(3).toString('hex') + '@acme-roofing.example');
      await p.check('#consent'); await p.check('#noGsc');
      await p.click('#f button[type=submit]');
      await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 });
      await service.idle(); await p.reload(); await p.locator('#growthResearchNav').waitFor({ timeout: 30000 });
      pages[lang] = { form, result: await texts(p), html: await p.locator('#out').innerText() };
      assert.deepEqual(errors, [], lang);
      await ctx.close();
    }
    const left = {};
    for (const lang of ['nl', 'es']) for (const page of ['form', 'result']) {
      const en = new Set(pages.en[page]);
      const same = pages[lang][page].filter(t => en.has(t) && /[A-Za-z]{3,}\W+[A-Za-z]{3,}/.test(t) && !NAMES.has(t) && !DATA.test(t));
      if (same.length) left[lang + ' ' + page] = same;
    }
    assert.deepEqual(left, {}, 'English text left on a Dutch or Spanish page');
    // The repeat check is announced in the page language, with a date in that language.
    assert.match(pages.nl.html, /Resultaat van eerder vandaag/); assert.match(pages.es.html, /Resultado de hoy/);
    assert.doesNotMatch(pages.nl.html, /\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M/, 'no US date on the Dutch page');
    // The mixed-results limitation says once that the page was compared only with its own type.
    const once = pages.en.html.split('compared only with the local service pages').length - 1;
    assert.equal(once, 1, 'mixed-results note is not repeated');
  } finally { await browser.close(); srv.close(); await pool.end(); }
});
