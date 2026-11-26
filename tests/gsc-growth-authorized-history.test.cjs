'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const gsc = require('../src/gsc-report/store.cjs');
const growth = require('../src/growth-free/store.cjs');
const { auditUpload } = require('../src/growth-free/gsc-audit-handoff.cjs');
const { growthFor } = require('../src/gsc-report/published.cjs');
const { sharedHistory, forReport } = require('../src/growth-free/contentscore.cjs');
const { reportUploadsFor } = require('../src/growth-free/gsc-report-numbers.cjs');

const dbUrl = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):\d+\/[^?]*(?:test|e2e)/i.test(dbUrl);
test('private research is reusable only through the recorded GSC report or its active invitation and exact page', {
  skip: !local && 'requires a disposable local PostgreSQL database'
}, async () => {
  const { Pool } = require('pg');
  const schema = 'gsc_growth_' + randomBytes(8).toString('hex');
  const db = new Pool({ connectionString: dbUrl, max: 1 });
  const pool = new Pool({ connectionString: dbUrl, options: '-c search_path=' + schema, max: 1 });
  const url = 'https://example.test/Service/?mode=1';
  const measurement = (score, day) => ({ url, score, scanned_at: '2026-01-0' + day + 'T00:00:00Z' });
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await gsc.ensureTables(pool);
    await growth.ensureTables(pool);
    const invitation = await growth.createInvite(pool, { label: 'Test authorized', maxChecks: 5, days: 2 });
    const createReport = (invite, score) => gsc.createReport(pool, { lang: 'en', days: 2, growthInvite: invite,
      report: {
        pages: [{ url, source: 'PAGE_EXPORT', clicks: 0, impressions: 12 }],
        kpis: { period: { start: '2026-01-01', end: '2026-01-02' } },
        contentscores: { [url]: [measurement(score, 1)] }
      } });
    const affiliated = await createReport(invitation.token, 45);
    const unrelated = await createReport(null, 97);
    const createCheck = async (page, accessLabel, inviteId, score, note) => {
      const row = await growth.createCheck(pool, { url: page, host: 'example.test', email: 'test@example.test', query: 'test', accessLabel, inviteId });
      await growth.setStatus(pool, row.id, { status: 'DONE' });
      await growth.appendContentScore(pool, { checkId: row.id, result: measurement(score, 2) });
      await pool.query("UPDATE growth_free_checks SET published_on='2026-01-03', published_note=$2 WHERE id=$1", [row.id, note]);
      return { ...row, url: page, access_label: accessLabel, invite_id: inviteId };
    };
    const unbound = await createCheck(url, 'admin', null, 92, 'unrelated internal note');
    const invited = await createCheck(url, 'invited', invitation.id, 55, 'invited change');
    const variant = url.replace('mode=1', 'mode=2');
    await createCheck(variant, 'invited', invitation.id, 99, 'other query variant');
    const options = { invite: affiliated.growth_invite, reportId: affiliated.id };
    const guest = await growthFor(pool, [url], options);
    assert.equal(guest.get(url)?.note, 'invited change');
    assert.equal(guest.get(url)?.owner_result, null);
    assert.ok(guest.get(url)?.invite_result?.includes(invited.public_id));
    assert.equal((await growthFor(pool, [url], { reportId: unrelated.id, owner: true })).size, 0);
    assert.deepEqual(await sharedHistory(pool, unbound), []);
    assert.deepEqual(await reportUploadsFor(pool, { url, checkId: unbound.id, admin: true }), []);
    assert.deepEqual((await sharedHistory(pool, invited)).map(row => row.score), [45, 55]);
    assert.equal((await forReport(pool, affiliated, false))[url].score, 55);
    assert.equal((await forReport(pool, unrelated, true))[url].score, 97);

    const express = require('express');
    const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
    const app = express();
    app.use(express.json());
    const adminKey = 'test-owner-session-' + randomBytes(8).toString('hex');
    registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({}), adminKey } });
    const browser = require('supertest').agent(app);
    await browser.post('/api/free-growth/admin/login').send({ key: adminKey }).expect(200);
    const form = () => browser.get('/free-growth').query({ url, gsc_audit: unrelated.token }).expect(200);
    await pool.query("UPDATE growth_free_checks SET finished_at=NOW()+interval '1 second' WHERE id=$1", [unbound.id]);
    assert.ok(!(await form()).text.includes('/r/' + unbound.public_id), 'GSC handoff cannot suggest unbound research');

    const linked = await createCheck(url, 'admin', null, 65, 'explicitly linked');
    const source = auditUpload(affiliated, { url, owner: true });
    await growth.saveGscUpload(pool, { checkId: linked.id, ...source });
    await growth.saveGscUpload(pool, { checkId: invited.id, ...source });
    await growth.saveGscUpload(pool, { checkId: linked.id, fileName: 'Independent page export', upload: {
      status: 'VERIFIED_FOR_PAGE', basis: 'PAGE_QUERY_EXPORT', totals: { clicks: 2, impressions: 10 }
    } });
    assert.deepEqual((await growth.listGscUploads(pool, linked.id)).map(upload => upload.totals.clicks), [0, 2]);
    assert.equal((await growth.listGscUploads(pool, invited.id)).length, 1);
    await pool.query("UPDATE growth_free_invites SET expires_at=NOW()-interval '1 second' WHERE id=$1", [invitation.id]);
    assert.deepEqual(await growth.listGscUploads(pool, invited.id), []);
    assert.equal((await growth.listGscUploads(pool, linked.id)).length, 2);
    await pool.query("UPDATE growth_free_invites SET expires_at=NOW()+interval '1 day' WHERE id=$1", [invitation.id]);
    const owner = await growthFor(pool, [url], { ...options, owner: true });
    assert.ok(owner.get(url)?.owner_result?.includes(linked.public_id));
    const scoped = await browser.get('/free-growth').query({ url, gsc_audit: affiliated.token }).expect(200);
    assert.ok(scoped.text.includes('/r/' + linked.public_id) || scoped.text.includes('/r/' + invited.public_id));
    assert.equal((await growthFor(pool, [url], options)).get(url)?.note, 'invited change');
    assert.deepEqual((await sharedHistory(pool, linked)).map(row => row.score), [45]);
    await gsc.setAfter(pool, affiliated.id, { period: { start: '2026-01-04', end: '2026-01-05' }, pages: [{ url, clicks: 3, impressions: 14 }] });
    const numbers = await reportUploadsFor(pool, { url, checkId: linked.id });
    assert.deepEqual(numbers.map(entry => entry.totals.clicks), [0, 3]);
    assert.deepEqual(await reportUploadsFor(pool, { url: variant, checkId: linked.id }), []);

    await pool.query(`
      CREATE TABLE tracker_clients (id INT, token TEXT, status TEXT);
      CREATE TABLE tracker_pages (id INT, tracker_client_id INT, url TEXT);
      CREATE TABLE tracker_case_studies (id INT, tracker_client_id INT, tracker_page_id INT);
      CREATE TABLE tracker_case_study_events (id BIGSERIAL,case_study_id INT NOT NULL,tracker_page_id INT,
        event_type TEXT,event_at TIMESTAMPTZ DEFAULT NOW(),source TEXT,event_data JSONB);
      INSERT INTO tracker_clients VALUES (1,'owner-a',NULL),(2,'owner-b',NULL);
    `);
    await pool.query('INSERT INTO tracker_pages VALUES (41,1,$1),(42,2,$1)', [url]);
    require('../src/tracker-proof-sources.cjs').registerProofSourceRoutes(app, pool);
    const ownerPath = '/api/tracker-client/owner-a/pages/41/proof-sources';
    const otherPath = '/api/tracker-client/owner-b/pages/42/proof-sources';
    const elsewhere = await createCheck(url, 'invited', invitation.id, 75, 'already linked elsewhere');
    await browser.post(otherPath).send({ type: 'free_growth', id: elsewhere.public_id, key: elsewhere.access_key }).expect(200);
    await browser.post(ownerPath).send({ type: 'gsc_audit', key: affiliated.token }).expect(200);
    const trackerScores = async path => (await browser.get(path).expect(200)).body.proof_sources.free_growth
      .flatMap(item => item.contentscore_history.map(scan => scan.score));
    assert.deepEqual(await trackerScores(ownerPath), [55], 'only the authorized report invitation on the exact page travels into Tracker');
    assert.deepEqual(await trackerScores(otherPath), [75], 'the existing other Tracker binding stays separate');
    await browser.post(ownerPath).send({ type: 'free_growth', id: invited.public_id, key: invited.access_key }).expect(200);
    assert.deepEqual(await trackerScores(ownerPath), [55], 'direct and inherited links still show one source');
    const trackerGsc = async () => (await browser.get(ownerPath).expect(200).expect('Cache-Control','no-store')).body.proof_sources.free_growth.flatMap(item => item.gsc);
    assert.equal((await trackerGsc()).length, 1);
    await createCheck(url, 'invited', invitation.id, 69, 'second authorized result');
    assert.deepEqual(await trackerScores(ownerPath), [55, 69]);
    const ambiguous = await createReport(invitation.token, 85);
    assert.deepEqual(await trackerScores(ownerPath), [55], 'a reused invitation cannot grant an inherited Tracker binding');
    await gsc.revokeReport(pool, ambiguous.id);
    assert.deepEqual(await trackerScores(ownerPath), [55, 69]);
    const audited = await createCheck(url, 'admin', null, 66, 'audit-dependent research');
    await growth.saveGscUpload(pool, { checkId: audited.id, ...source });
    await growth.setStatus(pool, audited.id, { status: 'DONE', report: {
      engine_version: 'audit-regression', gsc_audit_evidence: { source: 'GSC_REPORT', report_id: affiliated.id }
    } });
    await pool.query('UPDATE growth_free_checks SET cache_eligible=TRUE WHERE id=$1', [audited.id]);
    assert.ok(await growth.getCheck(pool, audited.public_id, audited.access_key));
    assert.equal(await growth.recentResult(pool, { url, query: 'test', engineVersion: 'audit-regression', accessLabel: 'admin' }), null);
    await gsc.revokeReport(pool, affiliated.id);
    assert.equal(await growth.getCheck(pool, audited.public_id, audited.access_key), null);
    assert.deepEqual((await growth.listGscUploads(pool, linked.id)).map(upload => upload.totals.clicks), [2]);
    assert.deepEqual(await growth.listGscUploads(pool, invited.id), []);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM growth_free_gsc_uploads WHERE check_id=$1', [linked.id])).rows[0].n, 2);
    assert.deepEqual(await sharedHistory(pool, linked), []);
    assert.deepEqual(await reportUploadsFor(pool, { url, checkId: linked.id }), []);
    assert.deepEqual(await trackerScores(ownerPath), [55], 'an independently authorized Free Growth link remains');
    assert.deepEqual(await trackerGsc(), []);
  } finally {
    await pool.end();
    await db.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await db.end();
  }
});
