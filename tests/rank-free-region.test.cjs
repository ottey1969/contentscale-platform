'use strict';
// Owner 2026-11-14: "waar is NJ op de eerste ranktracker page? land alleen is wellicht niet voldoende".
// Normal results can be measured for a state, region or city instead of the whole country. All sites, places and
// results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const engine = require('../src/rank-free/engine.cjs');
const { memoryStore } = require('../src/rank-free/store.cjs');
const { runDue, sendDigests } = require('../src/rank-free/runner.cjs');
const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
const links = require('../src/rank-free/links.cjs');
const { changeText, t } = require('../src/rank-free/texts.cjs');

function fakeSerper(organic, log) {
  return async (url, opts) => {
    const b = JSON.parse(opts.body); log.push({ url: String(url), body: b });
    if (String(url).endsWith('/maps')) return { ok: true, status: 200, json: async () => ({ places: [] }) };
    return { ok: true, status: 200, json: async () => ({ organic: (organic[b.q] || []).map((link, i) => ({ link, title: 't', position: i + 1 })) }) };
  };
}
function app(store, sent) {
  const a = express(); a.use(express.json());
  registerRankFree(a, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'admin-key-1234567890' }, store, sendEmail: async m => { sent.push(m); return true; } });
  return a;
}

test('the region is written the way Google names places: US state written out, country added', () => {
  assert.equal(engine.searchLocationOf('Lodi, NJ', 'us'), 'Lodi, New Jersey, United States');
  assert.equal(engine.searchLocationOf('New Jersey', 'us'), 'New Jersey, United States');
  assert.equal(engine.searchLocationOf('nj', 'us'), 'New Jersey, United States');
  assert.equal(engine.searchLocationOf('Lodi, New Jersey, United States', 'us'), 'Lodi, New Jersey, United States');
  assert.equal(engine.searchLocationOf('Amsterdam', 'nl'), 'Amsterdam, Netherlands');
  assert.equal(engine.searchLocationOf('', 'us'), null);
  assert.ok(engine.readRegion('https://evil.example').error);
  assert.deepEqual(engine.readRegion('  New   Jersey '), { region: 'New Jersey' });
});

test('with a region the normal search is sent with that location; without, the whole country as before', async () => {
  const log = [];
  await engine.checkRank({ keyword: 'roofer', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', location: 'New Jersey, United States', maxPages: 1, fetchImpl: fakeSerper({ roofer: ['https://acme.example/'] }, log) });
  assert.equal(log[0].body.location, 'New Jersey, United States');
  const log2 = [];
  await engine.checkRank({ keyword: 'roofer', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', maxPages: 1, fetchImpl: fakeSerper({ roofer: ['https://acme.example/'] }, log2) });
  assert.equal('location' in log2[0].body, false);
});

test('sign-up with a region: stored, used in the weekly round, shown on the dashboard and in the e-mail, changeable', async () => {
  const store = memoryStore(), sent = [], a = app(store, sent);
  const bad = await request(a).post('/api/rank-free/signup').send({ email: 'o@acme.example', site: 'acme.example', country: 'us', language: 'en', keywords: 'roofer', region: 'https://x', lang: 'nl' });
  assert.equal(bad.status, 400);
  const r = await request(a).post('/api/rank-free/signup').send({ email: 'o@acme.example', site: 'acme.example', country: 'us', language: 'en', keywords: 'roofer', region: 'New Jersey', lang: 'nl' });
  assert.equal(r.body.success, true);
  assert.equal(store.db.projects[0].search_location, 'New Jersey');
  await request(a).get('/rank-tracker/v/' + /\/rank-tracker\/v\/([^"]+)"/.exec(sent[0].html)[1]);
  const log = [], now = new Date(Date.now() + 1000);
  await runDue({ store, key: 'k', now, monthlyCap: 100, fetchImpl: fakeSerper({ roofer: ['https://acme.example/'] }, log) });
  const organicCalls = log.filter(x => x.url.endsWith('/search'));
  assert.ok(organicCalls.length >= 1 && organicCalls.every(x => x.body.location === 'New Jersey, United States'));
  const res = store.db.results[0].result;
  assert.equal(res.location, 'New Jersey, United States', 'the result remembers where it was measured');
  const tok = links.linkToken(store.db.accounts[0].dashboard_nonce);
  const dash = await request(a).get('/rank-tracker/d/' + tok);
  assert.match(dash.text, /Verenigde Staten · New Jersey · Engels/);
  assert.match(dash.text, /id="rgv"[^>]*value="New Jersey"/);
  const mails = []; await sendDigests({ store, send: async m => { mails.push(m); return true; }, baseUrl: 'https://app.example', now: new Date(now.getTime() + 60000) });
  if (mails.length) assert.match(mails[0].html, /New Jersey/);
  // Change and clear from the dashboard.
  const set = await request(a).post('/api/rank-free/d/' + tok + '/region').send({ region: 'Lodi, NJ' });
  assert.equal(set.body.success, true); assert.equal(store.db.projects[0].search_location, 'Lodi, NJ');
  assert.equal((await request(a).post('/api/rank-free/d/' + tok + '/region').send({ region: 'www.x.com' })).status, 400);
  const off = await request(a).post('/api/rank-free/d/' + tok + '/region').send({ region: '' });
  assert.equal(off.body.success, true); assert.equal(store.db.projects[0].search_location, null);
});

test('a new region is a new starting point, never "up" or "down" against another place', () => {
  const prev = { status: 'FOUND', position: 30, url: 'https://acme.example/', location: null };
  const curr = { status: 'FOUND', position: 2, url: 'https://acme.example/', location: 'New Jersey, United States' };
  const c = engine.changeOf(prev, curr);
  assert.equal(c.kind, 'NEW_REGION');
  assert.equal(changeText(c, t('nl')), 'eerste meting in deze regio');
  assert.equal(engine.changeOf({ ...curr, position: 9 }, curr).kind, 'UP');
});

test('the sign-up page asks for the region right under the country', async () => {
  const a = app(memoryStore(), []);
  const pg = await request(a).get('/rank-tracker?lang=nl');
  const html = pg.text;
  assert.ok(html.indexOf('id="gl"') < html.indexOf('id="region"') && html.indexOf('id="region"') < html.indexOf('id="hl"'));
  assert.match(html, /Staat, regio of stad/);
  assert.match(html, /Ja, mijn Google Bedrijfsprofiel linkt naar deze website\./);
  assert.doesNotMatch(html, /je website als website/);
});
