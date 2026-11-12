'use strict';
// Contacts per country (owner 2026-11-12): the free rank tracker and Free Growth only, per country, tips consent, website
// and keywords; delete one and delete a whole selection (typed DELETE); owner-only. Real PostgreSQL, TEST data only.
const test = require('node:test'), assert = require('node:assert/strict');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';

test('contacts per country: list, filter, CSV, delete one, delete selection — rank tracker and Free Growth', { skip, timeout: 60000 }, async () => {
  const pool = new pg.Pool({ connectionString: DB });
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const rank = require('../src/rank-free/store.cjs').pgStore(pool), growth = require('../src/growth-free/store.cjs');
  try {
    await rank.findAccountByEmail('x@x.example'); await growth.ensureTables(pool);
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@contacts-test.example'");
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE '%@contacts-test.example'");
    const add = (email, gl, consent, host, kw) => rank.upsertSignup({ email, lang: 'en', ipHash: 'h', consent, verifyHash: 'v-' + email, host, gl, hl: 'en', keywords: kw });
    await add('ann@contacts-test.example', 'nl', true, 'ann.example', ['dakreparatie amsterdam', 'lekkage dak']);
    await add('bob@contacts-test.example', 'us', false, 'bob.example', ['roof repair nj']);
    await add('cas@contacts-test.example', 'nl', false, 'cas.example', ['schilder utrecht']);
    await add('dan@contacts-test.example', 'nl', true, 'dan.example', ['dakgoot']);
    // Confirmed e-mail addresses (ann, bob, cas); dan never confirmed: wanted tips, but is not counted as "tips".
    for (const e of ['ann', 'bob', 'cas']) await pool.query('UPDATE rank_free_accounts SET verified_at=NOW() WHERE email=$1', [e + '@contacts-test.example']);
    const check = (email, countries, consent, url, query) => pool.query(`INSERT INTO growth_free_checks(public_id,access_key,email,ip_hash,url,host,query,status,marketing_consent,market)
      VALUES($1,'k',$2,'h',$3,'h.example',$4,'DONE',$5,$6)`, ['c' + Math.random().toString(36).slice(2, 12), email, url, query, consent, countries ? JSON.stringify({ countries, language: 'en' }) : null]);
    await check('dee@contacts-test.example', ['es'], true, 'https://dee.example/a/', 'reparacion tejado');
    await check('dee@contacts-test.example', ['es'], false, 'https://dee.example/b/', 'goteras madrid');
    await check('eve@contacts-test.example', null, false, 'https://eve.example/', 'roof leak');

    const app = express(); app.use(express.json());
    registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({}), adminKey: 'admin-secret-0123456789' } });
    const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
    const req = async (method, p, body, h = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; return { status: r.status, body: t.includes('json') ? await r.json() : await r.text() }; };
    try {
      assert.equal((await req('GET', '/api/free-growth/admin/contacts?source=rank')).status, 404, 'owner only');
      const login = await fetch(base + '/api/free-growth/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'admin-secret-0123456789' }) });
      const jar = { cookie: login.headers.get('set-cookie').split(';')[0] }, w = { ...jar, 'X-Requested-With': 'growth-free-admin' };
      const mine = rows => rows.filter(r => /@contacts-test\.example$/.test(r.email));
      // Rank tracker: per country, tips, website and keywords.
      let r = (await req('GET', '/api/free-growth/admin/contacts?source=rank&country=NL', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email).sort(), ['ann@contacts-test.example', 'cas@contacts-test.example', 'dan@contacts-test.example']);
      assert.equal(mine(r.rows).find(x => x.email.startsWith('dan')).tips, false, 'unconfirmed address: no tips');
      const ann = mine(r.rows).find(x => x.email.startsWith('ann'));
      assert.equal(ann.country, 'NL'); assert.equal(ann.tips, true); assert.equal(ann.host, 'ann.example'); assert.deepEqual(ann.keywords, ['dakreparatie amsterdam', 'lekkage dak']);
      assert.ok(r.countries.some(c => c.country === 'NL' && c.contacts >= 2 && c.tips >= 1));
      r = (await req('GET', '/api/free-growth/admin/contacts?source=rank&country=NL&tips=1', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email), ['ann@contacts-test.example'], 'tips only');
      const csv = (await req('GET', '/api/free-growth/admin/contacts.csv?source=rank&country=NL', null, jar)).body;
      assert.match(csv, /^country,email,tips,website,keywords/); assert.match(csv, /"NL","ann@contacts-test\.example","yes","ann\.example","dakreparatie amsterdam \| lekkage dak"/);
      // Free Growth: one row per e-mail, country from the chosen market, latest page and search term; unknown country.
      r = (await req('GET', '/api/free-growth/admin/contacts?source=growth&country=ES', null, jar)).body;
      const dee = mine(r.rows)[0]; assert.equal(dee.email, 'dee@contacts-test.example'); assert.equal(dee.checks, 2); assert.equal(dee.tips, true); assert.equal(dee.query, 'goteras madrid');
      r = (await req('GET', '/api/free-growth/admin/contacts?source=growth&country=NONE', null, jar)).body;
      assert.ok(mine(r.rows).some(x => x.email === 'eve@contacts-test.example'), 'no market chosen and no research yet: unknown country');
      // Delete one: CSRF header required; all data of that person in that source.
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'rank', id: ann.id }, jar)).status, 404, 'cookie alone cannot delete');
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'rank', id: ann.id }, w)).body.deleted, 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='ann@contacts-test.example'")).rows[0].n, 0);
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'growth', id: 'dee@contacts-test.example' }, w)).body.deleted, 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM growth_free_checks WHERE email='dee@contacts-test.example'")).rows[0].n, 0, 'both checks gone');
      // Delete a selection: only with the typed confirmation, and only that country.
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete-all', { source: 'rank', country: 'NL' }, w)).status, 400);
      const del = (await req('POST', '/api/free-growth/admin/contacts/delete-all', { source: 'rank', country: 'NL', confirm: 'DELETE' }, w)).body;
      assert.ok(del.deleted >= 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='cas@contacts-test.example'")).rows[0].n, 0);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='bob@contacts-test.example'")).rows[0].n, 1, 'another country is kept');
      // The owner page renders the section and its script compiles.
      const page = await req('GET', '/free-growth/admin', null, jar);
      assert.match(page.body, /Contacts per country/);
      for (const m of page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(m[1]);
    } finally { srv.close(); }
  } finally {
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@contacts-test.example'").catch(() => {});
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE '%@contacts-test.example'").catch(() => {});
    await pool.end();
  }
});
