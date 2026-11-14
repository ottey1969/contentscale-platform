'use strict';
// Owner 2026-11-14: town keywords ("roofer hackensack nj") next to several Maps places. Without care the tracker
// searched "roofer hackensack nj Lodi, NJ": a nonsense search that costs a call every week. A keyword that names one of
// the project's places is checked in Google Maps for that place only. All sites and results are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const engine = require('../src/rank-free/engine.cjs');
const { memoryStore } = require('../src/rank-free/store.cjs');
const { runDue } = require('../src/rank-free/runner.cjs');
const links = require('../src/rank-free/links.cjs');

const PLACES = ['Lodi, NJ', 'Hackensack, NJ', 'Clifton, NJ'];

test('a keyword that names one of the places is only for that place; others are for all places', () => {
  assert.deepEqual(engine.placesForKeyword('roofer hackensack nj', PLACES), ['Hackensack, NJ']);
  assert.deepEqual(engine.placesForKeyword('Roofer in Clifton', PLACES), ['Clifton, NJ']);
  assert.deepEqual(engine.placesForKeyword('roof repair', PLACES), PLACES);
  assert.deepEqual(engine.placesForKeyword('roofer paterson nj', PLACES), PLACES, 'a town that is not a place: all places, as before');
  assert.deepEqual(engine.placesForKeyword('lodington roofs', PLACES), PLACES, 'whole words only');
});

test('weekly round: no "roofer hackensack nj Lodi, NJ" searches, and the skipped places cost nothing', async () => {
  const store = memoryStore(), log = [];
  await store.upsertSignup({ email: 'o@acme.example', lang: 'en', ipHash: 'ip', consent: false, verifyHash: 'v1', host: 'acme.example', gl: 'us', hl: 'en', keywords: ['roofer hackensack nj', 'roof repair'], mapsLocation: PLACES.join('\n') });
  await store.verify('v1', links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  const fetchImpl = async (url, opts) => { const b = JSON.parse(opts.body); log.push({ url: String(url), q: b.q });
    if (String(url).endsWith('/maps')) return { ok: true, status: 200, json: async () => ({ places: [] }) };
    return { ok: true, status: 200, json: async () => ({ organic: [{ link: 'https://acme.example/', title: 't', position: 1 }] }) }; };
  const now = new Date('2026-11-11T10:05:00Z');
  await runDue({ store, key: 'k', fetchImpl, now, monthlyCap: 100 });
  const mapsQ = log.filter(x => x.url.endsWith('/maps')).map(x => x.q).sort();
  assert.deepEqual(mapsQ, ['roof repair Clifton, NJ', 'roof repair Hackensack, NJ', 'roof repair Lodi, NJ', 'roofer hackensack nj']);
  const kw = store.db.keywords.find(k => k.keyword === 'roofer hackensack nj');
  const res = store.db.results.find(r => r.keyword_id === kw.id).result;
  assert.deepEqual(res.maps_places.map(m => m.location), ['Hackensack, NJ']);
});

test('the colour legend explains the dash for a place that was not measured', () => {
  const { mapsLegendHtml, t } = require('../src/rank-free/texts.cjs');
  assert.match(mapsLegendHtml(t('nl')), /niet gemeten voor deze plaats, omdat het zoekwoord een andere plaats noemt/);
});
