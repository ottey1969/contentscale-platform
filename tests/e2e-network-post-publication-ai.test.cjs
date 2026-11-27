'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const { registerNetwork, ensureNetworkTables } = require('../src/network/register-network.js');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('post-publication AI observations are private, exact, replay-safe and append to existing review history', {
  skip: !isolated && 'requires local disposable PostgreSQL',
  timeout: 20000
}, async () => {
  const schema = 'network_ai_' + crypto.randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  let server;
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await ensureNetworkTables(pool);
    // Exercise both the new schema and upgrade from the original review-event constraint.
    await pool.query(`ALTER TABLE network_placement_review_events
      DROP CONSTRAINT network_placement_review_events_event_type_check,
      ADD CONSTRAINT network_placement_review_events_event_type_check
      CHECK (event_type IN ('submitted','resubmitted','precheck_passed','precheck_needs_review','needs_changes','rejected','verified'))`);
    await pool.query(`CREATE TABLE prewrite_briefs (id bigint PRIMARY KEY, brief_json jsonb);
      INSERT INTO prewrite_briefs VALUES (1,'{"approved":"original"}');
      INSERT INTO network_websites (id,domain,status) VALUES (1,'publisher.example','approved');
      INSERT INTO network_content (id,title,primary_niche,prewrite_brief_id) VALUES (1,'Edition','marketing',1);
      INSERT INTO network_placements (id,content_id,publisher_website_id,status,published_url,verified_at)
      VALUES (1,1,1,'verified','https://publisher.example/Article/?v=1',NOW()-INTERVAL '1 day');
      INSERT INTO network_publication_versions (id,placement_id,content_id,publisher_website_id,html)
      VALUES (1,1,1,1,'<article>Original edition</article>');
      INSERT INTO network_placement_review_events (placement_id,event_type,published_url,note)
      VALUES (1,'verified','https://publisher.example/Article/?v=1','Original review')`);
    await ensureNetworkTables(pool);

    const app = express();
    app.use(express.json());
    registerNetwork({ app, pool,
      verifyAdmin(req, res, next) {
        if (req.get('x-admin-key') !== 'local-fixture') return res.sendStatus(401);
        req.admin = { id: 'local-admin' };
        next();
      },
      asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next)
    });
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const url = 'http://127.0.0.1:' + server.address().port + '/api/network/admin/publications/1/post-publication-ai';
    const headers = { 'Content-Type': 'application/json', 'x-admin-key': 'local-fixture' };
    const publishedUrl = 'https://publisher.example/Article/?v=1';
    const observedAt = new Date(Date.now() - 60000).toISOString();
    const observation = { published_url: publishedUrl, observed_at: observedAt, engine: 'chatgpt',
      query: 'Which source explains this?', evidence: 'Answer as observed in the isolated fixture.',
      citation_urls: [publishedUrl] };
    const post = (body, options = headers) => fetch(url, { method: 'POST', headers: options, body: JSON.stringify(body) });
    assert.equal((await post(observation, { 'Content-Type': 'application/json' })).status, 401);
    assert.equal((await post({ ...observation, published_url: 'https://publisher.example/article/?v=1' })).status, 409);
    assert.equal((await post({ ...observation, observed_at: '2020-01-01T00:00:00Z' })).status, 422);
    const written = await Promise.all([post(observation), post(observation)]);
    assert.deepEqual(written.map(response => response.status).sort(), [200, 201]);
    assert.equal((await post({ ...observation, engine: 'claude', citation_urls: [] })).status, 201);

    const listed = await fetch(url, { headers });
    assert.equal(listed.status, 200);
    const observations = (await listed.json()).observations;
    assert.equal(observations.length, 2);
    assert.equal(observations.find(item => item.engine === 'chatgpt').exact_page_cited, true);
    assert.equal(observations.find(item => item.engine === 'claude').exact_page_cited, null);
    assert.ok(observations.every(item => item.published_url === publishedUrl));
    assert.equal((await fetch(url)).status, 401);

    let expectedCount = 2;
    if (process.env.NETWORK_POST_AI_BROWSER === '1') {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({ locale: 'nl-NL', timezoneId: 'UTC', viewport: { width: 390, height: 840 } });
        await context.addInitScript(() => localStorage.setItem('admin_id', 'local-fixture'));
        const page = await context.newPage();
        const ui = new URL('/network/publishing/1/post-publication-ai', url).href;
        assert.equal((await page.goto(ui)).status(), 200);
        await page.getByLabel('AI-systeem').selectOption('copilot');
        await page.getByLabel('Tijdstip van waarneming (lokaal)').fill(observedAt.slice(0, 16));
        await page.getByLabel('Exacte zoekvraag').fill('Browserfixture voor Copilot');
        await page.getByLabel('Waargenomen antwoord of resultaat').fill('Een antwoord uit de geïsoleerde test.');
        await page.getByRole('button', { name: 'Waarneming opslaan' }).click();
        await page.getByText('Waarneming opgeslagen.', { exact: true }).waitFor();
        await page.reload();
        await page.locator('#history li').filter({ hasText: 'Browserfixture voor Copilot' }).waitFor();
        expectedCount++;
      } finally { await browser.close(); }
    }
    assert.deepEqual((await pool.query('SELECT brief_json FROM prewrite_briefs')).rows[0].brief_json, { approved: 'original' });
    assert.equal((await pool.query('SELECT html FROM network_publication_versions')).rows[0].html, '<article>Original edition</article>');
    assert.equal((await pool.query("SELECT note FROM network_placement_review_events WHERE event_type='verified'")).rows[0].note, 'Original review');
    await pool.query("UPDATE network_placements SET status='accepted',verified_at=NULL WHERE id=1");
    assert.equal((await post(observation)).status, 409);
    assert.equal((await (await fetch(url, { headers })).json()).observations.length, expectedCount);
    const remove = new URL('/api/network/admin/placements/1/delete-from-publishing', url);
    const removal = await fetch(remove, { method: 'POST', headers, body: '{"confirm":true}' });
    assert.equal(removal.status, 409);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
