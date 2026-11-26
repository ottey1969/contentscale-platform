'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { pgStore, hash } = require('../src/rank-free/store.cjs');
const { sendDigests } = require('../src/rank-free/runner.cjs');

const database = process.env.PREWRITE_E2E_DATABASE_URL || process.env.DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_(?:e2e|test))$/.test(database);

test('Rank Tracker workers deliver one digest and never retry a round with an uncertain outcome', {
  skip: !local && 'requires disposable PostgreSQL', timeout: 12000
}, async () => {
  process.env.RANK_FREE_SECRET ||= 'rank-digest-ci-fixture-secret-only';
  const { Pool } = require('pg');
  const schema = 'rank_digest_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    const firstWorker = pgStore(pool);
    const secondWorker = pgStore(pool);
    const verifyHash = hash('fixture-verification');
    const { project } = await firstWorker.upsertSignup({
      email: 'digest@example.invalid', lang: 'en', ipHash: 'fixture', consent: false, verifyHash,
      host: 'example.invalid', gl: 'us', hl: 'en', keywords: ['tracked keyword']
    });
    const day = offset => new Date(Date.UTC(2026, 10, 1 + offset));
    await firstWorker.verify(verifyHash, 'n'.repeat(32), day(0));
    const [keyword] = await firstWorker.keywords(project.id);
    const complete = now => firstWorker.saveResult(keyword.id, {
      checked_at: now, status: 'FOUND', position: 17, url: 'https://example.invalid/'
    }, null);
    await complete(day(1));
    let sends = 0, enterSend, releaseSend;
    const entered = new Promise(resolve => { enterSend = resolve; });
    const inFlight = new Promise(resolve => { releaseSend = resolve; });
    const run = (store, now, send) => sendDigests({ store, now, send, baseUrl: 'https://app.example' });
    const first = run(firstWorker, day(1), async () => {
      sends++;
      enterSend();
      await inFlight;
      return true;
    });
    await entered;
    const accepted = async () => { sends++; return true; };
    try { await run(secondWorker, day(1), accepted); }
    finally { releaseSend(); await first; }
    assert.equal(sends, 1);

    await complete(day(8));
    await run(firstWorker, day(8), async () => { sends++; throw new Error('Provider reply lost'); });
    await run(secondWorker, day(9), accepted);
    assert.equal(sends, 2);
    assert.equal((await firstWorker.stats(day(9))).digest_delivery_uncertain, 1);
    // A later complete round can send. An uncertain delivery cannot mark the prior digest as delivered.
    assert.equal((await firstWorker.projectOf(project.account_id)).last_digest_at.toISOString(), day(1).toISOString());
    await complete(day(15));
    await run(secondWorker, day(15), accepted);
    assert.equal(sends, 3);
    assert.equal((await firstWorker.stats(day(15))).digest_delivery_uncertain, 0);
    await complete(day(22));
    const claims = await Promise.all([firstWorker.claimDigest(project.id, day(22)), secondWorker.claimDigest(project.id, day(22))]);
    assert.deepEqual(claims.sort(), [false, true]);
    assert.equal((await firstWorker.stats(day(22))).digest_in_progress, 1);
    // A crash after claiming leaves the same durable state even when no callback records the outcome.
    await run(pgStore(pool), day(23), accepted);
    assert.equal(sends, 3);
    assert.equal((await firstWorker.stats(day(23))).digest_delivery_uncertain, 1);
    assert.equal((await firstWorker.projectOf(project.account_id)).last_digest_at.toISOString(), day(15).toISOString());
  } finally {
    await pool.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
