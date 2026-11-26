'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const store = require('../src/growth-free/store.cjs');
const { sendDueFreeReminders } = require('../src/growth-free/reminders.cjs');

const database = process.env.PREWRITE_E2E_DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_(?:e2e|test))$/.test(database);

test('concurrent free Growth workers deliver at most one reminder and retry only a known rejection', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, async () => {
  const { Pool } = require('pg');
  const schema = 'reminder_delivery_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database, max: 1 });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema, max: 4 });
  let unblock;
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await store.ensureTables(pool);
    const createDue = async (name, date) => {
      const row = await store.createCheck(pool, { url: 'https://' + name + '.example/', host: name + '.example', email: name + '@example.test', query: 'fixture' });
      await store.setStatus(pool,row.id,{status:'DONE'});
      await store.setPublication(pool,{checkId:row.id,publishedOn:date,dueAt:new Date(date + 'T00:00:00Z')});
      return row.id;
    };
    const links = { result: () => 'https://app.example/result', stop: () => 'https://app.example/stop' };
    const run = (send, day) => sendDueFreeReminders(pool,store,{ send, links, now: new Date(day + 'T12:00:00Z'), model: null });
    await createDue('parallel','2026-01-01');
    let receipts = 0, entered;
    const blocked = new Promise(resolve => { unblock = resolve; });
    const reached = new Promise(resolve => { entered = resolve; });
    const first = run(async () => { receipts++; entered(); await blocked; return true; },'2026-01-01');
    await reached;
    try {
      assert.deepEqual(await run(async () => { receipts++; return true; },'2026-01-01'),{sent:0,failed:0});
    } finally {
      unblock();
      await first;
    }
    assert.equal(receipts,1);

    await createDue('retry','2026-01-02');
    assert.deepEqual(await run(async () => false,'2026-01-02'),{sent:0,failed:1});
    assert.deepEqual(await run(async () => true,'2026-01-02'),{sent:1,failed:0});
    const uncertain = await createDue('uncertain','2026-01-03');
    assert.deepEqual(await run(async () => { throw new Error('response lost'); },'2026-01-03'),{sent:0,failed:1});
    assert.deepEqual(await run(async () => { receipts++; return true; },'2026-01-04'),{sent:0,failed:0});
    assert.equal(receipts,1);
    const pending = (await pool.query('SELECT reminder_dispatch_state,reminder_sent_at FROM growth_free_checks WHERE id=$1',[uncertain])).rows[0];
    assert.deepEqual(pending,{reminder_dispatch_state:'unknown',reminder_sent_at:null});

    const exhausted = await createDue('exhausted','2026-01-05');
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.deepEqual(await run(async () => false,'2026-01-05'),{sent:0,failed:1});
    }
    assert.deepEqual(await run(async () => { receipts++; return true; },'2026-01-06'),{sent:0,failed:0});
    assert.equal((await pool.query('SELECT reminder_attempts FROM growth_free_checks WHERE id=$1',[exhausted])).rows[0].reminder_attempts,3);
    const optedOut = await createDue('opted-out','2026-01-06');
    const optOutToken = (await pool.query('SELECT reminder_token FROM growth_free_checks WHERE id=$1',[optedOut])).rows[0].reminder_token;
    await store.optOutReminder(pool,optOutToken);
    assert.deepEqual(await run(async () => { receipts++; return true; },'2026-01-07'),{sent:0,failed:0});
    assert.equal(receipts,1);
  } finally {
    unblock?.();
    await pool.end();
    await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await control.end();
  }
});
