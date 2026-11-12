'use strict';
// Rank tracker admin (owner 2026-11-12: "put the admin that was in Growth in the rank tracker"). Real PostgreSQL, TEST data.
const test = require('node:test'), assert = require('node:assert/strict');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';
process.env.RANK_FREE_SECRET = process.env.RANK_FREE_SECRET || 'test-secret-for-rank-free-links';

test('rank tracker admin: login, contacts per country with website and keywords, CSV, delete one, delete selection', { skip, timeout: 60000 }, async () => {
  const pool = new pg.Pool({ connectionString: DB });
  const express = require('express');
  const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
  const rank = require('../src/rank-free/store.cjs').pgStore(pool);
  try {
    await rank.findAccountByEmail('x@x.example');
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@rank-admin-test.example'");
    const add = (email, gl, consent, host, kw) => rank.upsertSignup({ email, lang: 'es', ipHash: 'h', consent, verifyHash: 'v-' + email, host, gl, hl: 'es', keywords: kw });
    await add('ana@rank-admin-test.example', 'es', true, 'ana.example', ['consultor geo', 'agencia geo']);
    await add('bea@rank-admin-test.example', 'es', false, 'bea.example', ['dentista madrid']);
    await add('cor@rank-admin-test.example', 'nl', true, 'cor.example', ['dakdekker']);
    for (const e of ['ana', 'bea', 'cor']) await pool.query('UPDATE rank_free_accounts SET verified_at=NOW() WHERE email=$1', [e + '@rank-admin-test.example']);
    const app = express(); app.use(express.json());
    registerRankFree(app, pool, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'rank-admin-key-0123456789' }, sendEmail: async () => true });
    const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
    const req = async (method, p, body, h = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; return { status: r.status, body: t.includes('json') ? await r.json() : await r.text(), headers: r.headers }; };
    try {
      assert.equal((await req('GET', '/api/rank-free/admin/contacts?country=ES')).status, 404, 'owner only');
      assert.equal((await req('POST', '/api/rank-free/admin/login', { key: 'wrong' })).status, 401);
      const login = await req('POST', '/api/rank-free/admin/login', { key: 'rank-admin-key-0123456789' });
      const jar = { cookie: login.headers.get('set-cookie').split(';')[0] }, w = { ...jar, 'X-Requested-With': 'rank-free-admin' };
      const mine = rows => rows.filter(r => /@rank-admin-test\.example$/.test(r.email));
      let r = (await req('GET', '/api/rank-free/admin/contacts?country=ES', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email).sort(), ['ana@rank-admin-test.example', 'bea@rank-admin-test.example']);
      const ana = mine(r.rows).find(x => x.email.startsWith('ana'));
      assert.deepEqual([ana.country, ana.tips, ana.host, ana.keywords], ['ES', true, 'ana.example', ['consultor geo', 'agencia geo']]);
      r = (await req('GET', '/api/rank-free/admin/contacts?country=ES&tips=1', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email), ['ana@rank-admin-test.example']);
      const csv = (await req('GET', '/api/rank-free/admin/contacts.csv?country=ES', null, jar)).body;
      assert.match(csv, /"ES","ana@rank-admin-test\.example","yes","ana\.example","consultor geo \| agencia geo"/);
      assert.equal((await req('POST', '/api/rank-free/admin/contacts/delete', { id: ana.id }, jar)).status, 404, 'cookie alone cannot delete');
      assert.equal((await req('POST', '/api/rank-free/admin/contacts/delete', { id: ana.id }, w)).body.deleted, 1);
      assert.equal((await req('POST', '/api/rank-free/admin/contacts/delete-all', { country: 'ES' }, w)).status, 400, 'typed DELETE needed');
      assert.ok((await req('POST', '/api/rank-free/admin/contacts/delete-all', { country: 'ES', confirm: 'DELETE' }, w)).body.deleted >= 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='cor@rank-admin-test.example'")).rows[0].n, 1, 'another country is kept');
      const page = await req('GET', '/rank-tracker/admin', null, jar);
      assert.match(page.body, /Contacts per country/);
      for (const m of page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(m[1]);
      assert.match((await req('GET', '/rank-tracker/admin')).body, /Admin key/, 'without a session: the login form');
      assert.equal((await req('GET', '/api/rank-free/admin/session-stats', null, jar)).body.success, true);
    } finally { srv.close(); }
  } finally {
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@rank-admin-test.example'").catch(() => {});
    await pool.end();
  }
});
