'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const gsc = require('../src/gsc-report/store.cjs');
const growth = require('../src/growth-free/store.cjs');
const { auditUpload } = require('../src/growth-free/gsc-audit-handoff.cjs');
const { growthFor } = require('../src/gsc-report/published.cjs');
const { sharedHistory, forReport } = require('../src/growth-free/contentscore.cjs');

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
    assert.deepEqual((await sharedHistory(pool, invited)).map(row => row.score), [45, 55]);
    assert.equal((await forReport(pool, affiliated, false))[url].score, 55);
    assert.equal((await forReport(pool, unrelated, true))[url].score, 97);

    const linked = await createCheck(url, 'admin', null, 65, 'explicitly linked');
    const source = auditUpload(affiliated, { url, owner: true });
    await growth.saveGscUpload(pool, { checkId: linked.id, ...source });
    const owner = await growthFor(pool, [url], { ...options, owner: true });
    assert.ok(owner.get(url)?.owner_result?.includes(linked.public_id));
    assert.equal((await growthFor(pool, [url], options)).get(url)?.note, 'invited change');
    assert.deepEqual((await sharedHistory(pool, linked)).map(row => row.score), [45]);
    await gsc.revokeReport(pool, affiliated.id);
    assert.deepEqual(await sharedHistory(pool, linked), []);
  } finally {
    await pool.end();
    await db.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await db.end();
  }
});
