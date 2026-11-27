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
    const publisherToken = crypto.randomBytes(32).toString('hex');
    await pool.query(`CREATE TABLE prewrite_briefs (id bigint PRIMARY KEY, brief_json jsonb, keyword text, working_title text);
      INSERT INTO prewrite_briefs (id,brief_json) VALUES (1,'{"approved":"original"}');
      INSERT INTO network_websites (id,domain,status) VALUES (1,'publisher.example','approved');
      INSERT INTO network_content (id,title,primary_niche,prewrite_brief_id) VALUES (1,'Edition','marketing',1);
      INSERT INTO network_placements (id,content_id,publisher_website_id,status,published_url,verified_at)
      VALUES (1,1,1,'verified','https://publisher.example/Article/?v=1',NOW()-INTERVAL '1 day');
      INSERT INTO network_publication_versions (id,placement_id,content_id,publisher_website_id,html)
      VALUES (1,1,1,1,'<article>Original edition</article>');
      INSERT INTO network_credit_wallets (website_id,balance,reserved) VALUES (1,10,0);
      INSERT INTO network_placement_review_events (placement_id,event_type,published_url,note)
      VALUES (1,'verified','https://publisher.example/Article/?v=1','Original review')`);
    await pool.query(`CREATE TABLE tracker_clients (id INT PRIMARY KEY, token TEXT, status TEXT);
      CREATE TABLE tracker_pages (id INT PRIMARY KEY,tracker_client_id INT,url TEXT);
      CREATE TABLE tracker_case_studies (id INT PRIMARY KEY,tracker_client_id INT,tracker_page_id INT);
      CREATE TABLE tracker_case_study_events (id BIGSERIAL,case_study_id INT,tracker_page_id INT,tracker_client_id INT,
        event_type TEXT,event_at TIMESTAMPTZ DEFAULT NOW(),source TEXT,event_data JSONB);
      INSERT INTO tracker_clients VALUES (1,'tracker-owner','active'),(2,'other-owner','active');
      INSERT INTO tracker_pages VALUES (1,1,'https://publisher.example/Article/?v=1'),
        (2,2,'https://publisher.example/Article/?v=1'),(3,1,'https://publisher.example/article/?v=1');`);
    await ensureNetworkTables(pool);
    await pool.query(`INSERT INTO network_publisher_accounts (website_id,email,access_token,status)
      VALUES (1,'fixture@publisher.example',$1,'active')`, [publisherToken]);

    const app = express();
    app.use(express.json());
    require('../src/tracker-proof-sources.cjs').registerProofSourceRoutes(app, pool);
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
    const initialEdition = (await pool.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision
      FROM network_publication_versions WHERE id=1`)).rows[0];
    const prepared = await (await fetch(url, { headers })).json();
    assert.equal(prepared.can_record, true);
    assert.equal(prepared.edition.publication_version_id, '1');
    assert.equal(prepared.edition.publication_revision, initialEdition.revision);
    assert.equal(prepared.edition.publisher_website_id, '1');
    const preparedObservation = { ...observation, edition: prepared.edition };
    assert.equal((await post({ ...preparedObservation, published_url: 'https://publisher.example/article/?v=1' })).status, 409);
    assert.equal((await post({ ...preparedObservation, observed_at: '2020-01-01T00:00:00Z' })).status, 422);
    const written = await Promise.all([post(preparedObservation), post(preparedObservation)]);
    assert.deepEqual(written.map(response => response.status).sort(), [200, 201]);
    assert.equal((await post({ ...preparedObservation, engine: 'claude', citation_urls: [] })).status, 201);

    const listed = await fetch(url, { headers });
    assert.equal(listed.status, 200);
    const observations = (await listed.json()).observations;
    assert.equal(observations.length, 2);
    assert.equal(observations.find(item => item.engine === 'chatgpt').exact_page_cited, true);
    assert.equal(observations.find(item => item.engine === 'claude').exact_page_cited, null);
    assert.ok(observations.every(item => item.published_url === publishedUrl));
    assert.ok(observations.every(item => item.observation_source === 'manual_admin'));
    assert.equal((await fetch(url)).status, 401);
    const publisherPackage = await fetch(new URL('/api/network/publisher/' + publisherToken + '/placements/1/package', url));
    assert.equal(publisherPackage.status, 200);
    const publisherHistory = (await publisherPackage.json()).review_history;
    assert.deepEqual(publisherHistory.map(item => item.event_type), ['verified']);

    let expectedCount = 2;
    if (process.env.NETWORK_POST_AI_BROWSER === '1') {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        for (const [locale, width, labels] of [
          ['en-US', 1280, ['AI system', 'Observation time (local)', 'Exact query', 'Observed answer or result', 'Save observation', 'Observation saved.', 'Manual observation']],
          ['nl-NL', 390, ['AI-systeem', 'Tijdstip van waarneming (lokaal)', 'Exacte zoekvraag', 'Waargenomen antwoord of resultaat', 'Waarneming opslaan', 'Waarneming opgeslagen.', 'Handmatige waarneming']],
          ['es-ES', 390, ['Sistema de IA', 'Hora de la observación (local)', 'Consulta exacta', 'Respuesta o resultado observado', 'Guardar observación', 'Observación guardada.', 'Observación manual']]
        ]) {
          const [engineLabel, timeLabel, queryLabel, answerLabel, saveLabel, savedLabel, manualLabel] = labels;
          const context = await browser.newContext({ locale, timezoneId: 'UTC', viewport: { width, height: 840 } });
          try {
            await context.addInitScript(() => localStorage.setItem('admin_id', 'local-fixture'));
            const page = await context.newPage();
            const ui = new URL('/network/publishing/1/post-publication-ai', url).href;
            const query = 'Copilot fixture ' + locale;
            assert.equal((await page.goto(ui)).status(), 200);
            await page.getByLabel(engineLabel).selectOption('copilot');
            await page.getByLabel(timeLabel).fill(observedAt.slice(0, 16));
            await page.getByLabel(queryLabel).fill(query);
            await page.getByLabel(answerLabel).fill('Observed answer from the isolated fixture.');
            await page.getByRole('button', { name: saveLabel }).click();
            await page.getByText(savedLabel, { exact: true }).waitFor();
            await page.reload();
            await page.locator('#history li').filter({ hasText: query }).getByText(manualLabel, { exact: false }).waitFor({ timeout: 2500 });
            expectedCount++;
          } finally { await context.close(); }
        }
      } finally { await browser.close(); }
    }
    assert.deepEqual((await pool.query('SELECT brief_json FROM prewrite_briefs')).rows[0].brief_json, { approved: 'original' });
    assert.equal((await pool.query('SELECT html FROM network_publication_versions')).rows[0].html, '<article>Original edition</article>');
    assert.equal((await pool.query("SELECT note FROM network_placement_review_events WHERE event_type='verified'")).rows[0].note, 'Original review');
    await pool.query("UPDATE network_placements SET status='accepted',verified_at=NULL WHERE id=1");
    assert.equal((await post(preparedObservation)).status, 409);
    assert.equal((await (await fetch(url, { headers })).json()).observations.length, expectedCount);
    await pool.query(`UPDATE network_publication_versions SET html='<article>Revised edition</article>',updated_at=clock_timestamp() WHERE id=1;
      UPDATE network_placements SET status='verified',submitted_at=NOW()-INTERVAL '30 seconds',verified_at=NOW()-INTERVAL '20 seconds' WHERE id=1`);
    const revisedEdition = (await (await fetch(url, { headers })).json()).edition;
    assert.equal(revisedEdition.publication_version_id, prepared.edition.publication_version_id);
    assert.notEqual(revisedEdition.publication_revision, prepared.edition.publication_revision);
    const newObservation = { ...observation, observed_at: new Date().toISOString() };
    assert.equal((await post({ ...newObservation, edition: prepared.edition })).status, 409);
    assert.equal((await post(newObservation)).status, 409, 'omitting the edition must not bypass revision checking');
    for (const edition of [null, {}, [], { ...revisedEdition, publisher_website_id: '2' }]) {
      assert.equal((await post({ ...newObservation, edition })).status, 409);
    }
    assert.equal((await (await fetch(url, { headers })).json()).observations.length, expectedCount);
    assert.equal((await post({ ...newObservation, edition: revisedEdition })).status, 201);
    const revisedHistory = (await (await fetch(url, { headers })).json()).observations;
    assert.equal(revisedHistory.length, expectedCount + 1);
    assert.equal(revisedHistory[0].publication_revision, revisedEdition.publication_revision);
    assert.ok(revisedHistory.slice(1).every(item => item.publication_revision === initialEdition.revision));
    const release = new URL(url + '/tracker-proof');
    const grant = (body, options = headers) => fetch(release, { method: 'POST', headers: options, body: JSON.stringify(body) });
    const proof = (owner, page) => fetch(new URL('/api/tracker-client/' + owner + '/pages/' + page + '/proof-sources', url));
    const binding = { tracker_token: 'tracker-owner', tracker_page_id: 1, edition: revisedEdition };
    assert.equal((await grant(binding, { 'Content-Type': 'application/json' })).status, 401);
    assert.equal((await grant({ ...binding, tracker_token: 'wrong-owner' })).status, 404);
    assert.equal((await grant({ ...binding, tracker_page_id: 3 })).status, 409);
    assert.equal((await grant({ ...binding, edition: prepared.edition })).status, 409);
    if (process.env.NETWORK_POST_AI_BROWSER === '1') {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({ locale: 'nl-NL', viewport: { width: 390, height: 840 } });
        await context.addInitScript(() => localStorage.setItem('admin_id', 'local-fixture'));
        const page = await context.newPage();
        await page.goto(new URL('/network/publishing/1/post-publication-ai', url).href);
        await page.getByLabel('Privélink van Tracker').fill(new URL('/track/tracker-owner', url).href);
        await page.getByLabel('Tracker-pagina-ID').fill('1');
        await page.getByRole('button', { name: 'Bewijs delen' }).click();
        await page.getByText('Bewijs gedeeld.', { exact: true }).waitFor({ timeout: 5000 });
      } finally { await browser.close(); }
    } else assert.equal((await grant(binding)).status, 200);
    assert.equal((await grant(binding)).status, 200);
    assert.equal((await pool.query("SELECT count(*)::int AS total FROM tracker_case_study_events WHERE event_type='proof_source_released'")).rows[0].total, 1);
    assert.equal((await grant({ ...binding, tracker_token: 'other-owner', tracker_page_id: 2 })).status, 409);
    const ownerEvidence = (await (await proof('tracker-owner', 1)).json()).proof_sources.network_ai;
    assert.equal(ownerEvidence.length, expectedCount + 1);
    assert.equal(ownerEvidence[0].observation_source, 'manual_admin');
    assert.ok(ownerEvidence.some(item => item.exact_page_cited === null));
    assert.ok(ownerEvidence.every(item => item.published_url === publishedUrl && item.query === undefined && item.evidence === undefined));
    assert.deepEqual((await (await proof('other-owner', 2)).json()).proof_sources.network_ai, []);
    assert.equal((await proof('other-owner', 1)).status, 404);
    assert.equal((await post({ ...newObservation, query: 'Still private', edition: revisedEdition })).status, 201);
    assert.equal((await (await proof('tracker-owner', 1)).json()).proof_sources.network_ai.length, expectedCount + 1);

    assert.equal((await fetch(release, { method: 'DELETE', headers })).status, 200);
    assert.deepEqual((await (await proof('tracker-owner', 1)).json()).proof_sources.network_ai, []);
    assert.equal((await (await fetch(url, { headers })).json()).observations.length, expectedCount + 2);
    assert.deepEqual((await pool.query('SELECT balance,reserved FROM network_credit_wallets WHERE website_id=1')).rows[0],
      { balance: 10, reserved: 0 });
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
