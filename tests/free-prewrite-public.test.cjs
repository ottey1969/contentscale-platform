'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

test('the public Pre-Write entry is available in EN, NL and ES without a Tracker session', async () => {
  const { registerFreePrewrite } = require('../src/free-prewrite.cjs');
  const app = express();
  app.use(express.json());
  registerFreePrewrite(app, { query: () => { throw Error('The public form must not query customer data'); } });
  for (const lang of ['en', 'nl', 'es']) {
    const page = await request(app).get('/free-pre-write?lang=' + lang).expect(200);
    assert.match(page.text, new RegExp('<html lang="' + lang + '"'));
    assert.match(page.text, /name="website"/);
  }
  await request(app).get('/api/free-pre-write/result').expect(404);
  await request(app).post('/api/free-pre-write').send({ website: 'https://localhost/', keyword: 'test' }).expect(400);
});

const database = process.env.PREWRITE_E2E_DATABASE_URL || '';
const disposable = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(database);

test('private public briefs in Chromium use the canonical publication history for CREATE and exact EXPAND', {
  skip: !disposable && 'Requires disposable PostgreSQL and Chromium', timeout: 90000
}, async () => {
  const { randomBytes } = require('node:crypto');
  const { Pool } = require('pg');
  const { chromium } = require('playwright');
  const { registerFreePrewrite, resolveGrowthSource, sourceForGrowth } = require('../src/free-prewrite.cjs');
  const schema = 'free_prewrite_' + randomBytes(8).toString('hex');
  const admin = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  let server, browser;
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE prewrite_briefs (
      id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
      brief_json JSONB, specialist_html TEXT, tracker_page_id INT, approved_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ, published_url TEXT, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
      public_site TEXT, public_access_hash TEXT UNIQUE, implementation_reports JSONB NOT NULL DEFAULT '[]')`);
    const site = 'https://new-prewrite.example/';
    const existingUrl = site + 'existing/';
    const publishedUrl = site + 'planning-guide/';
    const article = 'Start by listing the questions a visitor needs answered before making a decision. Collect the original sources and confirm the publication requirements before choosing headings. Use the information to write clearly and show readers where to verify it.';
    const app = express();
    app.use(express.json());
    app.use(express.static(require('node:path').join(__dirname, '../public')));
    let generationCalls = 0;
    const priceTopic = 'Wat kost SEO advies?';
    const pricePage = '<h1>SEO advies en diensten</h1><p>Prijzen voor SEO advies op aanvraag.</p>';
    registerFreePrewrite(app, pool, {
      dailyLimit: 8,
      // Seven briefs from one browser: the weekly free limit has its own test (free-weekly-limit.test.cjs).
      perWeek: 0,
      discover: async () => ({ site, urls: [existingUrl] }),
      generate: async ({ id, keyword, intentOverride, pricingSource }) => {
        generationCalls++;
        const decision = keyword === 'Existing' ? { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: existingUrl }
          : { recommended_treatment: 'CREATE_NEW_PAGE' };
        await pool.query("UPDATE prewrite_briefs SET status='open',brief_json=$2 WHERE id=$1", [
          id, { keyword, search_intent: { primary: intentOverride || 'transactional', user_override: intentOverride }, pricing_fixture: pricingSource, search_scope: { query: keyword },
            ...(keyword === priceTopic ? { missing_information: { state: 'needs_input', field: 'pricing' } } : {}), content_decision: decision, meta_package: { url_slug: 'planning-guide' }, generation_usage: { tokens: 123 } }
        ]);
      },
      verification: { fetchHtml: async url => ({
        status: 200, final_url: url, retrieved_at: new Date().toISOString(), html: url === existingUrl ? pricePage : '<main>' + article + '</main>'
      }) }
    });
    const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
    const growth = registerFreeGrowth(app, pool, {
      config: freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: JSON.stringify([
        { key: 'public-test-key', label: 'public test', hosts: ['test.example'] }
      ]) }),
      engine: async () => ({ statusCode: 200, report: {
        success: true, editorial_decision_gate: { decision: 'NO_CHANGE' }
      } }),
      engineDeps: { questionFetch: async () => new Response('{}', { status: 200 }), aiGapModel: null }
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const endpoint = '/api/free-pre-write';
    const api = request(app);
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    async function start(lang, topic) {
      const page = await browser.newPage({ viewport: lang === 'en' ? { width: 1280, height: 900 } : { width: 390, height: 844 } });
      await page.goto(origin + '/free-pre-write?lang=' + lang);
      await page.locator('[name=website]').fill(site);
      await page.locator('[name=keyword]').fill(topic);
      await page.locator('[name=email]').fill('visitor-' + lang + '@new-prewrite.example');
      await page.locator('#intake button').click();
      await page.locator('#decision h2').waitFor();
      return page;
    }
    for (const [lang, heading] of [['en', 'Proof & History'], ['nl', 'Bewijs en historie'], ['es', 'Evidencias e historial']]) {
      const page = await start(lang, 'Planning');
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      if (lang === 'en') {
        const original = page.url();
        await page.locator('#intent-adjust select[name=intent]').selectOption('informational');
        await page.locator('#intent-adjust [name=pricing-source]').fill(existingUrl);
        await page.locator('#intent-adjust button[type=submit]').click();
        await page.waitForURL(url => url.href !== original);
        await page.locator('#intent-adjust select[name=intent]').waitFor();
        assert.equal(await page.locator('#intent-adjust select[name=intent]').inputValue(), 'informational');
        const key = new URL(page.url()).hash.slice(1);
        const updated = await api.get(endpoint + '/result').set('Authorization', 'Bearer ' + key).expect(200);
        assert.equal(updated.body.brief.pricing_fixture, existingUrl);
      }
      const privateUrl = page.url();
      assert.match(privateUrl, /#[a-f0-9]{64}$/);
      const auth = 'Bearer ' + new URL(privateUrl).hash.slice(1);
      await api.get(endpoint + '/implementation-report').expect(404);
      await api.get(endpoint + '/result').set('Authorization', 'Bearer ' + randomBytes(32).toString('hex')).expect(404);
      assert.doesNotMatch(await page.locator('#editor').inputValue(), /generation_usage|tokens/);
      await page.locator('#copy').fill(article);
      await page.locator('#approve').click();
      await page.locator('#save:enabled').waitFor();
      const report = { schema: 'contentscale.implementation.v1', url: publishedUrl, status: 'implemented',
        summary: 'Added an editorial planning guide.', change_types: ['content'] };
      await page.locator('#report').fill(JSON.stringify(report));
      await page.locator('#save').click();
      await page.locator('#entries summary').first().waitFor();
      const publication = { ...report, status: 'published', published_at: '2026-01-01T10:00:00Z' };
      await api.post(endpoint + '/publish').set('Authorization', auth).send({ report: { ...publication, url: publishedUrl + 'other' } }).expect(400);
      await page.locator('#report').fill(JSON.stringify(publication));
      await page.locator('#publish').click();
      await page.locator('#verify:enabled').waitFor();
      await page.locator('#verify').click();
      await page.waitForFunction(() => document.querySelector('#entries').textContent.includes('LIVE_PUBLIC_HTTPS'));
      await page.close();
      const reopened = await browser.newPage();
      await reopened.goto(privateUrl);
      await reopened.waitForFunction(() => document.querySelector('#entries').textContent.includes('LIVE_PUBLIC_HTTPS'));
      await reopened.close();
    }
    const expand = await start('nl', 'Existing');
    const link = new URL(await expand.locator('#decision a').getAttribute('href'), origin);
    assert.equal(link.pathname, '/free-growth');
    assert.equal(link.searchParams.get('url'), existingUrl);
    const key = new URLSearchParams(link.hash.slice(1)).get('prewrite');
    const id = await resolveGrowthSource(pool, key, existingUrl, 'Existing');
    assert.ok(id);
    assert.equal(await resolveGrowthSource(pool, key, existingUrl.slice(0, -1), 'Existing'), null);
    assert.equal(await resolveGrowthSource(pool, key, existingUrl, 'Other question'), null);
    assert.equal((await sourceForGrowth(pool, id, existingUrl, 'Existing')).brief.keyword, 'Existing');
    const input = { url: existingUrl, query: 'Existing', consent: true, no_gsc: true, prewrite_ref: key,
      email: 'standalone-grower@new-prewrite.example', key: 'public-test-key', lang: 'nl' };
    await api.post('/api/free-growth/checks').send({ ...input, url: existingUrl + 'other/' }).expect(409);
    const accepted = await api.post('/api/free-growth/checks').send(input).expect(202);
    await growth.idle();
    const growthPath = '/api/free-growth/checks/' + accepted.body.id;
    await api.get(growthPath).expect(404);
    const result = await api.get(growthPath + '?k=' + accepted.body.key).expect(200);
    assert.equal(result.body.status, 'DONE');
    assert.equal(result.body.proof_history.prewrite.target.url, existingUrl);
    assert.equal(result.body.proof_history.prewrite.brief.keyword, 'Existing');
    const report = await api.get(growthPath + '/report.json?k=' + accepted.body.key).expect(200);
    assert.deepEqual(report.body.proof_history.prewrite, result.body.proof_history.prewrite);

    const { rows } = await pool.query('SELECT client_id, tracker_page_id FROM prewrite_briefs');
    assert.equal(rows.length, 5);
    const draft = await start('nl', priceTopic);
    const original = draft.url();
    await draft.locator('#intent-adjust [name=pricing-source]').fill(existingUrl);
    const beforeRepair = generationCalls;
    await draft.locator('#repair-pricing').click();
    await draft.waitForURL(url => url.href !== original);
    await draft.getByRole('heading', { name: /EXPAND/ }).waitFor();
    assert.equal(generationCalls, beforeRepair);
    const oldKey = new URL(original).hash.slice(1), revisedKey = new URL(draft.url()).hash.slice(1);
    const oldAuth = 'Bearer ' + oldKey, revisedAuth = 'Bearer ' + revisedKey;
    const savedOld = await api.get(endpoint + '/result').set('Authorization', oldAuth).expect(200);
    const savedNew = await api.get(endpoint + '/result').set('Authorization', revisedAuth).expect(200);
    assert.equal(savedOld.body.brief.missing_information.state, 'needs_input');
    assert.deepEqual(savedNew.body.brief.search_scope, savedOld.body.brief.search_scope);
    assert.equal(savedNew.body.brief.missing_information.pricing, 'on_request');
    assert.equal(savedNew.body.target.url, existingUrl);
    await api.post(endpoint + '/repair-pricing').set('Authorization', oldAuth)
      .send({ pricingSource: existingUrl, revisionKey: revisedKey }).expect(200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM prewrite_briefs')).rows[0].n, 7);

    assert.ok(rows.every(row => row.client_id === null && row.tracker_page_id === null));
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await admin.end();
  }
});
