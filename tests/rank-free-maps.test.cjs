'use strict';
// Rank Tracker with Google Maps (owner 2026-11-14). All sites, places and results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const engine = require('../src/rank-free/engine.cjs');
const { memoryStore } = require('../src/rank-free/store.cjs');
const { runDue, sendDigests } = require('../src/rank-free/runner.cjs');
const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
const links = require('../src/rank-free/links.cjs');
const { mapsText, t } = require('../src/rank-free/texts.cjs');

// A fake Serper: /search returns the organic links, /maps returns the places for the query.
function fakeSerper({ organic = {}, places = {} }, log = []) {
  return async (url, opts) => {
    const b = JSON.parse(opts.body); log.push({ url: String(url), body: b });
    if (String(url).endsWith('/maps')) return { ok: true, status: 200, json: async () => ({ places: places[b.q] || [] }) };
    return { ok: true, status: 200, json: async () => ({ organic: (organic[b.q] || []).map((link, i) => ({ link, title: 't', position: i + 1 })) }) };
  };
}
const place = (title, website, position) => ({ title, website, position, address: 'TEST address', rating: 4.8, ratingCount: 12 });

test('the place is read strictly and only added to the search when the keyword does not already name it', () => {
  assert.deepEqual(engine.readMapsLocation(' Lodi,  NJ '), { location: 'Lodi, NJ' });
  assert.deepEqual(engine.readMapsLocation(''), { location: null }, 'empty switches Google Maps off');
  assert.ok(engine.readMapsLocation('https://evil.example').error);
  assert.ok(engine.readMapsLocation('x'.repeat(81)).error);
  assert.equal(engine.mapsQuery('emergency roof repair', 'Lodi, NJ'), 'emergency roof repair Lodi, NJ');
  assert.equal(engine.mapsQuery('roofer lodi nj', 'Lodi, NJ'), 'roofer lodi nj');
});

test('Google Maps position: the listing that links to the tracked site; a look-alike or a missing site is never a position', async () => {
  const log = [];
  const fetchImpl = fakeSerper({ places: { 'roofer Lodi, NJ': [place('Other Roofing', 'https://other.example/', 1), place('Lookalike', 'https://notacme.example/', 2), place('Acme Roofing', 'https://www.acme.example/contact', 3)] } }, log);
  const r = await engine.checkMaps({ keyword: 'roofer', host: 'acme.example', location: 'Lodi, NJ', gl: 'us', hl: 'en', key: 'k', fetchImpl });
  assert.equal(r.status, 'FOUND'); assert.equal(r.position, 3); assert.equal(r.title, 'Acme Roofing'); assert.equal(r.calls, 1);
  assert.deepEqual([log[0].url, log[0].body], ['https://google.serper.dev/maps', { q: 'roofer Lodi, NJ', gl: 'us', hl: 'en' }]);
  const n = await engine.checkMaps({ keyword: 'gutter', host: 'acme.example', location: 'Lodi, NJ', gl: 'us', hl: 'en', key: 'k', fetchImpl: fakeSerper({ places: { 'gutter Lodi, NJ': [place('Lookalike', 'https://notacme.example/', 1)] } }) });
  assert.equal(n.status, 'NOT_IN_RESULTS'); assert.equal(n.depth, 1); assert.equal(n.position, undefined);
  const e = await engine.checkMaps({ keyword: 'x', host: 'acme.example', location: 'Lodi, NJ', gl: 'us', hl: 'en', key: 'k', fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal(e.status, 'PROVIDER_ERROR');
  assert.equal((await engine.checkMaps({ keyword: 'x', host: 'acme.example', location: 'Lodi, NJ', gl: 'us', hl: 'en', key: '' })).status, 'PROVIDER_NOT_CONFIGURED');
});

test('the weekly round adds Google Maps only for projects with a place, counts the extra call and respects the budget', async () => {
  const store = memoryStore();
  const { project } = await store.upsertSignup({ email: 'o@acme.example', lang: 'en', ipHash: 'ip', consent: false, verifyHash: 'v1', host: 'acme.example', gl: 'us', hl: 'en', keywords: ['roofer'], mapsLocation: 'Lodi, NJ' });
  await store.verify('v1', links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  await store.upsertSignup({ email: 'p@other.example', lang: 'en', ipHash: 'ip2', consent: false, verifyHash: 'v2', host: 'other.example', gl: 'us', hl: 'en', keywords: ['plumber'] });
  await store.verify('v2', links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  const log = [], now = new Date('2026-11-11T10:05:00Z');
  const fetchImpl = fakeSerper({ organic: { roofer: ['https://acme.example/'], plumber: ['https://other.example/'] },
    places: { 'roofer Lodi, NJ': [place('Acme Roofing', 'https://acme.example/', 2)] } }, log);
  const out = await runDue({ store, key: 'k', fetchImpl, now, monthlyCap: 100 });
  assert.equal(out.checked, 2);
  assert.equal(log.filter(x => x.url.endsWith('/maps')).length, 1, 'only the project with a place gets a Maps call');
  assert.equal(await store.usage(now), 3, 'two organic calls + one Maps call');
  const kw = store.db.keywords.find(k => k.keyword === 'roofer'), res = store.db.results.find(r => r.keyword_id === kw.id).result;
  assert.equal(res.maps.status, 'FOUND'); assert.equal(res.maps.position, 2);
  assert.equal(mapsText(res, t('nl')), 'Google Maps: 2 voor “roofer Lodi, NJ”');
  // Budget: the organic check fits, the Maps call does not.
  const s2 = memoryStore();
  await s2.upsertSignup({ email: 'o@acme.example', lang: 'en', ipHash: 'ip', consent: false, verifyHash: 'v1', host: 'acme.example', gl: 'us', hl: 'en', keywords: ['roofer'], mapsLocation: 'Lodi, NJ' });
  await s2.verify('v1', links.newNonce(), new Date('2026-11-11T10:00:00Z')); await s2.addUsage(now, 97);
  // The organic check uses its full three calls (97 + 3 = 100): no room is left for the Maps call.
  const check = async () => ({ status: 'FOUND', position: 1, url: 'https://acme.example/', calls: 3, checked_at: now.toISOString() });
  await runDue({ store: s2, key: 'k', fetchImpl, now, monthlyCap: 100, check });
  const r2 = s2.db.results[0].result;
  assert.equal(r2.status, 'FOUND'); assert.equal(r2.maps.status, 'BUDGET_REACHED');
  assert.equal(mapsText(r2, t('en')), 'Google Maps: skipped this week (monthly limit reached)');
  assert.equal(mapsText({ status: 'FOUND', position: 1 }, t('en')), '', 'no place set: nothing about Maps');
});

test('dashboard and e-mail show the Maps position; the place can be set and cleared from the dashboard', async () => {
  const store = memoryStore(), sent = [];
  const { account, project } = await store.upsertSignup({ email: 'o@acme.example', lang: 'en', ipHash: 'ip', consent: false, verifyHash: 'v1', host: 'acme.example', gl: 'us', hl: 'en', keywords: ['roofer'], mapsLocation: 'Lodi, NJ' });
  await store.verify('v1', links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  const now = new Date('2026-11-11T10:05:00Z');
  await runDue({ store, key: 'k', now, monthlyCap: 100, fetchImpl: fakeSerper({ organic: { roofer: ['https://acme.example/'] }, places: { 'roofer Lodi, NJ': [place('Acme Roofing', 'https://acme.example/', 4)] } }) });
  const a = express(); a.use(express.json());
  registerRankFree(a, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'admin-key-1234567890' }, store, sendEmail: async m => { sent.push(m); return true; } });
  const tok = links.linkToken(store.db.accounts[0].dashboard_nonce);
  const dash = await request(a).get('/rank-tracker/d/' + tok);
  assert.equal(dash.status, 200);
  assert.match(dash.text, /📍 Google Maps: 4 for “roofer Lodi, NJ”/);
  assert.match(dash.text, /Checked in Google Maps for: Lodi, NJ/);
  assert.equal((await request(a).post('/api/rank-free/d/' + tok + '/maps').send({ maps_location: 'https://x' })).status, 400);
  const off = await request(a).post('/api/rank-free/d/' + tok + '/maps').send({ maps_location: '' });
  assert.equal(off.body.message, 'Google Maps check switched off.'); assert.equal(store.db.projects[0].maps_location, null);
  const on = await request(a).post('/api/rank-free/d/' + tok + '/maps').send({ maps_location: 'Hackensack, NJ' });
  assert.equal(on.body.maps_location, 'Hackensack, NJ'); assert.equal(store.db.projects[0].maps_location, 'Hackensack, NJ');
  const mails = []; await sendDigests({ store, send: async m => { mails.push(m); return true; }, baseUrl: 'https://app.example', now });
  assert.match(mails[0].html, /Google Maps: 4 for “roofer Lodi, NJ”/);
  const signup = await request(a).get('/rank-tracker');
  assert.match(signup.text, /id="maps"/); assert.match(signup.text, /maps_location:\$\('maps'\)\.value/);
});
