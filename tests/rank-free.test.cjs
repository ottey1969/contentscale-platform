'use strict';
// Free rank tracker (src/rank-free). All sites, keywords, e-mails and Google results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const engine = require('../src/rank-free/engine.cjs');
const { memoryStore } = require('../src/rank-free/store.cjs');
const { runDue, sendDigests } = require('../src/rank-free/runner.cjs');
const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
const links = require('../src/rank-free/links.cjs');

// A fake Google (Serper) that returns `pages[n]` as organic results for result page n.
function fakeSerper(pagesByKeyword, log = []) {
  return async (url, opts) => {
    if (!String(url).includes('serper.dev')) throw new Error('unexpected fetch ' + url);
    const b = JSON.parse(opts.body); log.push(b);
    const pages = pagesByKeyword[b.q] || [[]];
    const organic = (pages[(b.page || 1) - 1] || []).map((link, i) => ({ link, title: 't', position: i + 1 }));
    return { ok: true, status: 200, json: async () => ({ organic }) };
  };
}
const ten = (host, from) => Array.from({ length: 10 }, (_, i) => `https://${host}${from + i}.example/p`);

test('website, keywords and market are read strictly', () => {
  assert.equal(engine.readSite('www.Acme.example/page?x=1').host, 'acme.example');
  assert.ok(engine.readSite('http://localhost/').error);
  const k = engine.readKeywords('Consultor GEO\nconsultor geo\nhttps://spam.example\n' + Array.from({ length: 12 }, (_, i) => 'kw ' + i).join(','), 10);
  assert.equal(k.keywords[0], 'consultor geo');
  assert.equal(k.keywords.length, 10);
  assert.deepEqual(k.invalid, ['https://spam.example']);
  assert.ok(k.over_limit > 0);
  assert.deepEqual([engine.readMarket('es').gl, engine.readMarket('es').hl], ['es', 'es']);
  assert.equal(engine.readMarket('xx').error, 'Choose a country from the list.');
  assert.equal(engine.readMarket('ru').other_engine, 'Yandex');
});

test('position is found across result pages, also for a subdomain; not found is "not in top N", never a number', async () => {
  const log = [];
  const fetchImpl = fakeSerper({ 'consultor geo': [ten('other', 0), ['https://x.example/', 'https://es.acme.example/consultor-geo/', 'https://y.example/']],
    'que es geo': [ten('o', 0), ten('p', 10), ten('q', 20)] }, log);
  const r = await engine.checkRank({ keyword: 'consultor geo', host: 'acme.example', gl: 'es', hl: 'es', key: 'k', fetchImpl });
  assert.equal(r.status, 'FOUND'); assert.equal(r.position, 12); assert.equal(r.calls, 2);
  assert.equal(r.url, 'https://es.acme.example/consultor-geo/');
  assert.deepEqual(log.map(b => [b.gl, b.hl, b.page || 1]), [['es', 'es', 1], ['es', 'es', 2]]);
  const n = await engine.checkRank({ keyword: 'que es geo', host: 'acme.example', gl: 'es', hl: 'es', key: 'k', fetchImpl });
  assert.equal(n.status, 'NOT_IN_RESULTS'); assert.equal(n.depth, 30); assert.equal(n.position, undefined); assert.equal(n.calls, 3);
  // A look-alike domain does not count as the site.
  const x = await engine.checkRank({ keyword: 'z', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', fetchImpl: fakeSerper({ z: [['https://notacme.example/']] }) });
  assert.equal(x.status, 'NOT_IN_RESULTS');
  const e = await engine.checkRank({ keyword: 'z', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal(e.status, 'PROVIDER_ERROR');
});

test('not found: "not in top 30" after the full depth, "not found in the N results Google showed" when Google showed fewer', () => {
  const { positionText, t } = require('../src/rank-free/texts.cjs');
  assert.equal(positionText({ status: 'NOT_IN_RESULTS', depth: 30 }, t('nl')), 'niet in top 30');
  assert.equal(positionText({ status: 'NOT_IN_RESULTS', depth: 19, all_results_shown: true }, t('nl')), 'niet gevonden in de 19 resultaten die Google toonde');
  assert.equal(positionText({ status: 'NOT_IN_RESULTS', depth: 19 }, t('es')), 'no aparece en los 19 resultados que mostró Google', 'older results without the flag');
  assert.equal(positionText({ status: 'NOT_IN_RESULTS', depth: 7, all_results_shown: true }, t('en')), 'not found in the 7 results Google showed');
  assert.equal(positionText({ status: 'NOT_IN_RESULTS', depth: 0, all_results_shown: true }, t('nl')), 'Google toonde geen resultaten');
});

test('changes: page one gained and lost, big moves, small moves are not news', () => {
  const f = p => ({ status: 'FOUND', position: p, url: 'https://a.example/x' });
  assert.equal(engine.changeOf(f(14), f(8)).kind, 'ENTERED_PAGE_ONE');
  assert.equal(engine.changeOf(f(7), f(12)).kind, 'LEFT_PAGE_ONE');
  assert.equal(engine.changeOf(f(25), f(18)).kind, 'UP');
  assert.equal(engine.changeOf(f(3), f(5)), null);
  assert.equal(engine.changeOf({ status: 'NOT_IN_RESULTS' }, f(22)).kind, 'ENTERED_RESULTS');
  assert.equal(engine.changeOf(null, f(4)).kind, 'FIRST');
});

async function confirmedAccount(store, { email = 'owner@acme.example', keywords = ['consultor geo', 'que es geo'] } = {}) {
  const { account, project } = await store.upsertSignup({ email, lang: 'es', ipHash: 'ip', consent: false, verifyHash: 'v-' + email, host: 'acme.example', gl: 'es', hl: 'es', keywords });
  await store.verify('v-' + email, links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  return { account, project };
}

test('the runner checks due keywords weekly, respects the monthly budget and never turns an error into a position', async () => {
  const store = memoryStore(); await confirmedAccount(store);
  const fetchImpl = fakeSerper({ 'consultor geo': [['https://acme.example/consultor-geo/']], 'que es geo': [[]] });
  const now = new Date('2026-11-11T10:05:00Z');
  const r1 = await runDue({ store, key: 'k', fetchImpl, now, monthlyCap: 100 });
  assert.equal(r1.checked, 2);
  assert.equal(store.db.results.find(x => x.status === 'FOUND').position, 1);
  assert.equal(store.db.results.find(x => x.status === 'NOT_IN_RESULTS').position, null);
  // Nothing is due again until a week later.
  assert.equal((await runDue({ store, key: 'k', fetchImpl, now: new Date('2026-11-12T10:00:00Z'), monthlyCap: 100 })).checked, 0);
  // Budget used up: postponed one day, nothing saved.
  const later = new Date('2026-11-18T10:06:00Z'); await store.addUsage(later, 99);
  const r3 = await runDue({ store, key: 'k', fetchImpl, now: later, monthlyCap: 100 });
  assert.equal(r3.budget_reached, true); assert.equal(r3.postponed, 2); assert.equal(store.db.results.length, 2);
  // Provider error: retried later, no result row.
  const store2 = memoryStore(); await confirmedAccount(store2);
  const r4 = await runDue({ store: store2, key: 'k', fetchImpl: async () => ({ ok: false, status: 500 }), now, monthlyCap: 100 });
  assert.equal(r4.errors, 2); assert.equal(store2.db.results.length, 0);
  assert.equal(store2.db.keywords[0].last_error, 'HTTP_500', 'the reason is kept for the dashboard');
  // Without a provider key nothing runs.
  assert.equal((await runDue({ store: store2, key: '', now })).skipped, 'PROVIDER_NOT_CONFIGURED');
});

test('one weekly e-mail per project, in the account language, with a working dashboard link and stop link', async () => {
  const store = memoryStore(); await confirmedAccount(store);
  const now = new Date('2026-11-11T10:05:00Z');
  await runDue({ store, key: 'k', fetchImpl: fakeSerper({ 'consultor geo': [['https://acme.example/a/']], 'que es geo': [[]] }), now, monthlyCap: 100 });
  const sent = [];
  const out = await sendDigests({ store, send: async m => { sent.push(m); return true; }, baseUrl: 'https://app.example', now });
  assert.equal(out.sent, 1); assert.match(sent[0].subject, /Tus posiciones en Google para acme\.example/);
  assert.match(sent[0].html, /Google no mostró resultados/); assert.match(sent[0].html, /primera comprobación/);
  const tok = /\/rank-tracker\/d\/([^"]+)"/.exec(sent[0].html)[1];
  assert.ok(links.readToken(tok));
  assert.equal((await sendDigests({ store, send: async m => { sent.push(m); return true; }, baseUrl: 'https://app.example', now })).sent, 0, 'not twice for the same round');
});

function app(store, sent, extra = {}) {
  const a = express(); a.use(express.json());
  registerRankFree(a, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'admin-key-1234567890', ...extra }, store, sendEmail: async m => { sent.push(m); return true; } });
  return a;
}

test('sign-up → confirm → dashboard; a confirmed address cannot be changed from the public form', async () => {
  const store = memoryStore(), sent = [], a = app(store, sent);
  const bad = await request(a).post('/api/rank-free/signup').send({ email: 'x', site: 'acme.example', country: 'es', keywords: 'a' });
  assert.equal(bad.status, 400);
  const r = await request(a).post('/api/rank-free/signup').send({ email: 'Owner@Acme.example', site: 'https://www.acme.example/', country: 'es', language: 'es', keywords: 'consultor geo\nque es geo', lang: 'es' });
  assert.equal(r.status, 200); assert.equal(r.body.success, true); assert.match(r.body.message, /Revisa tu bandeja/);
  const verifyLink = /\/rank-tracker\/v\/([^"]+)"/.exec(sent[0].html)[1];
  assert.equal(store.db.accounts[0].verify_hash.length, 64, 'only a fingerprint of the link is stored');
  const v = await request(a).get('/rank-tracker/v/' + verifyLink);
  assert.equal(v.status, 302);
  const dash = v.headers.location; assert.match(dash, /^\/rank-tracker\/d\//);
  const d = await request(a).get(dash); assert.equal(d.status, 200); assert.match(d.text, /consultor geo/); assert.match(d.text, /primera comprobación en curso/);
  // Without a provider key the dashboard says so instead of waiting forever; names are in the account's language.
  assert.match(d.text, /no está configurada en el servidor/); assert.match(d.text, /España · español/);
  const withKey = express(); withKey.use(express.json());
  registerRankFree(withKey, null, { config: { ...rankFreeConfig({}), serperKey: 'k', scheduler: false }, store, fetchImpl: async () => ({ ok: false, status: 500 }), sendEmail: async () => true });
  const d2 = await request(withKey).get(dash); assert.match(d2.text, /location\.reload\(\),15000/); assert.doesNotMatch(d2.text, /no está configurada/);
  assert.equal((await request(a).get('/rank-tracker/v/' + verifyLink)).status, 404, 'a confirmation link works once');
  // Someone else types the same address with other keywords: nothing changes, the owner gets the link by e-mail.
  const r2 = await request(a).post('/api/rank-free/signup').send({ email: 'owner@acme.example', site: 'evil.example', country: 'us', keywords: 'spam' });
  assert.equal(r2.body.success, true);
  assert.equal(store.db.projects[0].host, 'acme.example');
  assert.deepEqual(store.db.keywords.filter(k => k.active).map(k => k.keyword), ['consultor geo', 'que es geo']);
  assert.match(sent[1].subject, /El enlace a tu rastreador de posiciones/);
  // The owner changes keywords on the dashboard (limit 10).
  const tok = dash.split('/').pop();
  const k = await request(a).post('/api/rank-free/d/' + tok + '/keywords').send({ keywords: 'consultor geo\nconsultoría geo' });
  assert.equal(k.body.success, true);
  assert.deepEqual(store.db.keywords.filter(x => x.active).map(x => x.keyword).sort(), ['consultor geo', 'consultoría geo']);
  // A forged or altered token is refused.
  assert.equal((await request(a).get('/api/rank-free/d/' + tok.slice(0, -2) + 'AA')).status, 404);
  // Stop and forget.
  assert.equal((await request(a).get('/rank-tracker/stop/' + tok)).status, 200);
  assert.ok(store.db.accounts[0].opted_out_at);
  assert.equal((await request(a).post('/api/rank-free/d/' + tok + '/forget')).body.success, true);
  assert.equal(store.db.accounts.length, 0);
});

test('limits: sign-ups per connection, e-mail off, admin stats behind a key', async () => {
  const store = memoryStore(), sent = [], a = app(store, sent, { signupsPerIpPerDay: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await request(a).post('/api/rank-free/signup').send({ email: `u${i}@x.example`, site: 'x.example', country: 'nl', keywords: 'a' })).status, 200);
  assert.equal((await request(a).post('/api/rank-free/signup').send({ email: 'u9@x.example', site: 'x.example', country: 'nl', keywords: 'a' })).status, 429);
  assert.equal((await request(a).get('/api/rank-free/admin/stats')).status, 401);
  const s = await request(a).get('/api/rank-free/admin/stats').set('x-admin-key', 'admin-key-1234567890');
  assert.equal(s.body.accounts, 2); assert.equal(s.body.monthly_cap, 3000);
  const off = express(); off.use(express.json());
  registerRankFree(off, null, { config: { ...rankFreeConfig({}), scheduler: false }, store: memoryStore(), sendEmail: null });
  const saved = process.env.BREVO_API_KEY; delete process.env.BREVO_API_KEY;
  try { assert.equal((await request(off).post('/api/rank-free/signup').send({ email: 'a@b.example', site: 'b.example', country: 'nl', keywords: 'a' })).status, 503); }
  finally { if (saved) process.env.BREVO_API_KEY = saved; }
  assert.equal(registerRankFree(express(), null, { config: { ...rankFreeConfig({ RANK_FREE_ENABLED: 'false' }) } }), null);
});

test('the sign-up page offers the Pre-Write countries and names markets where Google is not the main engine', async () => {
  const a = app(memoryStore(), []);
  const r = await request(a).get('/rank-tracker?lang=nl');
  assert.equal(r.status, 200); assert.match(r.text, /Gratis rank tracker/); assert.match(r.text, /<option value="es">Spain<\/option>/);
  assert.match(r.text, /noindex/);
});

test('page 1 gives the top 3 and Google\'s own related searches and questions, at no extra call', async () => {
  const fetchImpl = async (url, opts) => ({ ok: true, status: 200, json: async () => ({
    organic: ['https://a.example/x', 'https://b.example/y', 'https://c.example/z', 'https://acme.example/geo/'].map((link, i) => ({ link, title: 'T' + i, position: i + 1 })),
    relatedSearches: [{ query: 'Consultor GEO precio' }, { query: 'consultor geo' }, { query: 'https://spam.example' }],
    peopleAlsoAsk: [{ question: '¿Qué hace un consultor GEO?' }] }) });
  const r = await engine.checkRank({ keyword: 'consultor geo', host: 'acme.example', gl: 'es', hl: 'es', key: 'k', fetchImpl });
  assert.equal(r.position, 4); assert.equal(r.calls, 1);
  assert.deepEqual(r.top.map(x => [x.position, x.host]), [[1, 'a.example'], [2, 'b.example'], [3, 'c.example']]);
  // The tracked keyword itself and anything that is not a keyword are left out; question marks are dropped.
  assert.deepEqual(r.suggestions, ['consultor geo precio', 'qué hace un consultor geo']);
});

test('dashboard: trend line, top 3, Growth link filled in, and Google suggestions that add with one click up to the limit', async () => {
  const store = memoryStore(), sent = [];
  const { project } = await confirmedAccount(store, { keywords: ['consultor geo'] });
  const res = (p, d) => ({ status: 'FOUND', position: p, url: 'https://acme.example/geo/', top: [{ position: 1, host: 'a.example', url: 'https://a.example/x' }], suggestions: ['consultor geo precio', 'qué hace un consultor geo'], checked_at: d });
  const kid = store.db.keywords[0].id;
  await store.saveResult(kid, { status: 'NOT_IN_RESULTS', depth: 30, checked_at: '2026-10-28T10:00:00.000Z' }, new Date('2026-11-04T10:00:00Z'));
  await store.saveResult(kid, res(18, '2026-11-04T10:00:00.000Z'), new Date('2026-11-11T10:00:00Z'));
  await store.saveResult(kid, res(9, '2026-11-11T10:00:00.000Z'), new Date('2026-11-18T10:00:00Z'));
  const a = app(store, sent, { maxKeywords: 2 });
  const tok = links.linkToken(store.db.accounts[0].dashboard_nonce);
  const d = await request(a).get('/rank-tracker/d/' + tok);
  assert.match(d.text, /aria-label="Evolución: – → 18 → 9"/); assert.match(d.text, /mejor 9/);
  assert.match(d.text, /Top 3 en Google: <a href="https:\/\/a\.example\/x"/);
  const g = /href="([^"]*free-growth[^"]*)">Mejora esta página/.exec(d.text);
  const q = new URL(g[1].replace(/&amp;/g, '&')).searchParams;
  assert.deepEqual([q.get('url'), q.get('query'), q.get('market'), q.get('language')], ['https://acme.example/geo/', 'consultor geo', 'es — Spain', 'Spanish']);
  assert.match(d.text, /Palabras clave que sugiere Google/); assert.match(d.text, /data-k="consultor geo precio"/);
  // The weekly e-mail names the suggestions that are not tracked yet.
  const mails = [];
  await sendDigests({ store, send: async m => { mails.push(m); return true; }, baseUrl: 'https://app.example', now: new Date('2026-11-11T10:05:00Z') });
  assert.match(mails[0].html, /Google también sugiere estas búsquedas; añádelas con un clic en tu panel: consultor geo precio, qué hace un consultor geo/);
  // Add one suggestion: tracked, due now; then the limit (2 here) is reached and the next is refused, not dropped silently.
  const add = await request(a).post('/api/rank-free/d/' + tok + '/keywords/add').send({ keyword: 'consultor geo precio' });
  assert.equal(add.body.success, true);
  assert.deepEqual(store.db.keywords.filter(k => k.active).map(k => k.keyword), ['consultor geo', 'consultor geo precio']);
  const over = await request(a).post('/api/rank-free/d/' + tok + '/keywords/add').send({ keyword: 'qué hace un consultor geo' });
  assert.equal(over.status, 409); assert.match(over.body.error, /el máximo/);
  const d2 = await request(a).get('/rank-tracker/d/' + tok);
  assert.doesNotMatch(d2.text, /data-k="consultor geo precio"/, 'a tracked keyword is no longer suggested');
  assert.match(d2.text, /data-k="qué hace un consultor geo" disabled/);
  assert.equal((await request(a).post('/api/rank-free/d/' + tok + '/keywords/add').send({ keyword: 'https://x.example' })).status, 400);
  void project;
});
