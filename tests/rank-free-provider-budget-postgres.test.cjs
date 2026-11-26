'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { pgStore, hash } = require('../src/rank-free/store.cjs');
const { runDue } = require('../src/rank-free/runner.cjs');

const database = process.env.PREWRITE_E2E_DATABASE_URL || process.env.DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_(?:e2e|test))$/.test(database);

test('Parallel Rank Tracker workers cannot overspend the shared provider budget', {
  skip: !local && 'requires disposable PostgreSQL', timeout: 12000
}, async () => {
  const { Pool } = require('pg');
  const schema = 'rank_budget_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    const store = pgStore(pool), other = pgStore(pool);
    const verifyHash = hash('fixture-verification');
    const { project } = await store.upsertSignup({
      email: 'budget@example.invalid', lang: 'en', ipHash: 'fixture', consent: false, verifyHash,
      host: 'example.invalid', gl: 'us', hl: 'en', keywords: ['first keyword', 'second keyword']
    });
    const now = new Date('2026-11-05T00:00:00Z');
    await store.verify(verifyHash, 'n'.repeat(32), now);
    let calls = 0, signal, release;
    const entered = new Promise(resolve => { signal = resolve; });
    const inFlight = new Promise(resolve => { release = resolve; });
    const result = () => ({status: 'FOUND', checked_at: now, position: 7, calls: 1});
    const first = runDue({ store, now, key: 'fixture', monthlyCap: 3, batch: 1, check: async () => {
      calls++; signal(); await inFlight; return result();
    } });
    await entered;
    let second;
    try {
      second = await runDue({ store: other, now, key: 'fixture', monthlyCap: 3,
        check: async () => { calls++; return result(); } });
      assert.equal(await store.usage(now), 0, 'outstanding reservations are not reported as completed calls');
    } finally { release(); await first; }
    assert.equal(calls, 1);
    assert.equal(second.budget_reached, true);
    assert.equal(second.postponed, 1);
    assert.equal(await store.usage(now), 1, 'only the actual attempted call remains charged');
    const keywords = await store.keywords(project.id);
    assert.equal(keywords.filter(keyword => keyword.last_checked_at).length, 1);
    const nextDay = new Date('2026-11-06T00:00:00Z');
    const unknown = await runDue({ store: other, now: nextDay, key: 'fixture', monthlyCap: 4,
      check: async () => { calls++; throw new Error('Provider outcome unknown'); } });
    assert.equal(unknown.errors, 1);
    const afterRestart = await runDue({ store: pgStore(pool), now: new Date('2026-11-07T00:00:00Z'),
      key: 'fixture', monthlyCap: 4, check: async () => { calls++; return result(); } });
    assert.equal(afterRestart.budget_reached, true);
    assert.equal(calls, 2);
    assert.equal(await store.usage(nextDay), 1);
  } finally {
    await pool.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
