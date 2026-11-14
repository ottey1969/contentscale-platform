'use strict';
// Rank Tracker geo-grid for Google Maps (owner 2026-11-14). All sites, places and results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const engine = require('../src/rank-free/engine.cjs');
const { memoryStore } = require('../src/rank-free/store.cjs');
const { runDue, sendDigests } = require('../src/rank-free/runner.cjs');
const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
const links = require('../src/rank-free/links.cjs');
const { gridText, gridTable, t } = require('../src/rank-free/texts.cjs');
const CENTER = { lat: 40.8823, lng: -74.0832 };
const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// A fake Serper: /search organic; /maps by query (place search) or by `ll` (grid point): position = 1 + row of the point.
function fakeSerper({ organic = {}, places = {}, gridFor = null, failGrid = 0 } = {}, log = []) {
  let fails = failGrid;
  return async (url, opts) => {
    const b = JSON.parse(opts.body); log.push({ url: String(url), body: b });
    if (String(url).endsWith('/maps') && b.ll) {
      if (fails > 0) { fails--; return { ok: false, status: 500 }; }
      return { ok: true, status: 200, json: async () => ({ places: gridFor ? gridFor(b) : [] }) };
    }
    if (String(url).endsWith('/maps')) return { ok: true, status: 200, json: async () => ({ places: places[b.q] || [] }) };
    return { ok: true, status: 200, json: async () => ({ organic: (organic[b.q] || []).map((link, i) => ({ link, title: 't', position: i + 1 })) }) };
  };
}

test('grid points: 3 × 3 around the business, the middle point is the business, neighbours about 1.6 km apart', () => {
  const pts = engine.gridPoints(CENTER);
  assert.equal(pts.length, 9);
  const mid = pts.find(p => p.row === 1 && p.col === 1);
  assert.ok(Math.abs(mid.lat - CENTER.lat) < 1e-6 && Math.abs(mid.lng - CENTER.lng) < 1e-6);
  const right = pts.find(p => p.row === 1 && p.col === 2), up = pts.find(p => p.row === 0 && p.col === 1);
  assert.ok(Math.abs(km(mid, right) - 1.6) < 0.02, 'east neighbour ' + km(mid, right));
  assert.ok(Math.abs(km(mid, up) - 1.6) < 0.02, 'north neighbour ' + km(mid, up));
  assert.ok(up.lat > mid.lat && right.lng > mid.lng, 'row 0 is north, col 2 is east');
});

test('grid check: one Maps call per point, the position of the tracked site at each point, look-alikes never count', async () => {
  const log = [];
  const gridFor = b => { const lat = Number(b.ll.slice(1).split(',')[0]);
    return lat > CENTER.lat + 0.001 ? [{ title: 'Lookalike', website: 'https://notacme.example/', position: 1 }] : [{ title: 'Other', website: 'https://other.example/', position: 1 }, { title: 'Acme', website: 'https://acme.example/', position: lat < CENTER.lat - 0.001 ? 12 : 2 }]; };
  const g = await engine.checkMapsGrid({ keyword: 'roofer', host: 'acme.example', center: CENTER, gl: 'us', hl: 'en', key: 'k', fetchImpl: fakeSerper({ gridFor }, log) });
  assert.equal(g.status, 'OK'); assert.equal(g.calls, 9); assert.equal(log.length, 9);
  assert.match(log[0].body.ll, /^@40\.\d+,-74\.\d+,14z$/); assert.equal(log[0].body.q, 'roofer');
  assert.deepEqual(g.points.filter(p => p.row === 0).map(p => p.position), [null, null, null], 'north row: only a look-alike');
  assert.deepEqual(g.points.filter(p => p.row === 1).map(p => p.position), [2, 2, 2]);
  assert.deepEqual(g.points.filter(p => p.row === 2).map(p => p.position), [12, 12, 12]);
  assert.deepEqual([g.found, g.measured, g.top3, g.best], [6, 9, 3, 2]);
  assert.equal(gridText({ grid: g }, t('en')), 'Geo-grid: found at 6 of 9 points · top 3 at 3 · average position 7');
  const table = gridTable({ grid: g });
  assert.equal((table.match(/<tr>/g) || []).length, 3); assert.equal((table.match(/>×</g) || []).length, 3);
  assert.match(table, /#16a34a[^>]*>2</); assert.match(table, /#dc2626[^>]*>12</);
});

test('grid check: no centre means no grid; too many failed points is an error, never "not found"', async () => {
  assert.equal((await engine.checkMapsGrid({ keyword: 'x', host: 'acme.example', center: null, key: 'k' })).status, 'NO_CENTER');
  const bad = await engine.checkMapsGrid({ keyword: 'x', host: 'acme.example', center: CENTER, key: 'k', fetchImpl: fakeSerper({ failGrid: 4, gridFor: () => [] }) });
  assert.equal(bad.status, 'PROVIDER_ERROR');
  const ok = await engine.checkMapsGrid({ keyword: 'x', host: 'acme.example', center: CENTER, key: 'k', fetchImpl: fakeSerper({ failGrid: 1, gridFor: () => [] }) });
  assert.equal(ok.status, 'OK'); assert.equal(ok.measured, 8); assert.equal(ok.points.filter(p => p.error).length, 1);
  assert.equal(engine.coordOf({ latitude: 0, longitude: 0 }, 'lat'), null, '0,0 is not a real listing location');
  assert.equal(engine.coordOf({ gpsCoordinates: { latitude: 40.1, longitude: -74 } }, 'lng'), -74);
});

async function project(store, extra = {}) {
  await store.upsertSignup({ email: 'o@acme.example', lang: 'en', ipHash: 'ip', consent: false, verifyHash: 'v1', host: 'acme.example', gl: 'us', hl: 'en', keywords: ['roofer', 'gutter repair'], mapsLocation: 'Lodi, NJ', ...extra });
  await store.verify('v1', links.newNonce(), new Date('2026-11-11T10:00:00Z'));
  return store.db.projects[0];
}
const place = (title, website, position, lat = CENTER.lat, lng = CENTER.lng) => ({ title, website, position, latitude: lat, longitude: lng });

test('weekly round: the grid runs only for chosen keywords, centred on the listing found this round, within the budget', async () => {
  const store = memoryStore(), p = await project(store); await store.setMapsGrid(p.id, ['roofer']);
  const log = [], now = new Date('2026-11-11T10:05:00Z');
  const fetchImpl = fakeSerper({ organic: { roofer: ['https://acme.example/'], 'gutter repair': ['https://acme.example/g'] },
    places: { 'roofer Lodi, NJ': [place('Acme', 'https://acme.example/', 3)], 'gutter repair Lodi, NJ': [place('Acme', 'https://acme.example/', 5)] },
    gridFor: () => [place('Acme', 'https://acme.example/', 4)] }, log);
  await runDue({ store, key: 'k', fetchImpl, now, monthlyCap: 1000 });
  const res = kw => store.db.results.find(r => r.keyword_id === store.db.keywords.find(k => k.keyword === kw).id).result;
  assert.equal(res('roofer').grid.status, 'OK'); assert.equal(res('roofer').grid.found, 9);
  assert.equal(res('gutter repair').grid, undefined, 'not chosen for the grid');
  const gridCalls = log.filter(x => x.body.ll);
  assert.equal(gridCalls.length, 9); assert.ok(gridCalls.every(x => x.body.q === 'roofer'));
  assert.equal(await store.usage(now), 2 + 2 + 9, 'organic + Maps + grid calls are all counted');
  // Not found in Maps for the place: no centre, nothing guessed, no grid calls.
  const s2 = memoryStore(), p2 = await project(s2); await s2.setMapsGrid(p2.id, ['roofer']); const log2 = [];
  await runDue({ store: s2, key: 'k', now, monthlyCap: 1000, fetchImpl: fakeSerper({ organic: { roofer: [], 'gutter repair': [] }, gridFor: () => [] }, log2) });
  assert.equal(s2.db.results.find(r => r.result.keyword === undefined && r.result.grid) .result.grid.status, 'NO_CENTER');
  assert.equal(log2.filter(x => x.body.ll).length, 0);
  // Budget: the grid's 9 calls do not fit.
  const s3 = memoryStore(), p3 = await project(s3); await s3.setMapsGrid(p3.id, ['roofer']); await s3.addUsage(now, 990);
  await runDue({ store: s3, key: 'k', now, monthlyCap: 1000, batch: 1, fetchImpl });
  assert.equal(s3.db.results[0].result.grid.status, 'BUDGET_REACHED');
});

test('dashboard: choose up to 3 grid keywords (only tracked ones, only with a place); the grid shows as a 3 × 3 table and in the e-mail', async () => {
  const store = memoryStore(), p = await project(store);
  const a = express(); a.use(express.json());
  registerRankFree(a, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'admin-key-1234567890' }, store, sendEmail: async () => true });
  const tok = links.linkToken(store.db.accounts[0].dashboard_nonce), api = b => request(a).post('/api/rank-free/d/' + tok + '/grid').send(b);
  assert.equal((await api({ keywords: ['roofer', 'gutter repair', 'a', 'b'] })).body.keywords.length, 2, 'untracked keywords are dropped');
  assert.deepEqual(store.db.projects[0].maps_grid, ['roofer', 'gutter repair']);
  await store.setKeywords(p.id, ['roofer', 'gutter repair', 'flat roof', 'roof leak']);
  assert.equal((await api({ keywords: ['roofer', 'gutter repair', 'flat roof', 'roof leak'] })).status, 400, 'at most 3');
  await store.setMapsLocation(p.id, null);
  assert.equal((await api({ keywords: ['roofer'] })).status, 400, 'a place is needed first');
  await store.setKeywords(p.id, ['roofer', 'gutter repair']);
  await store.setMapsLocation(p.id, 'Lodi, NJ'); await api({ keywords: ['roofer'] });
  const now = new Date('2026-11-11T10:05:00Z');
  await runDue({ store, key: 'k', now, monthlyCap: 1000, fetchImpl: fakeSerper({ organic: { roofer: ['https://acme.example/'] }, places: { 'roofer Lodi, NJ': [place('Acme', 'https://acme.example/', 1)] }, gridFor: () => [place('Acme', 'https://acme.example/', 2)] }) });
  const dash = await request(a).get('/rank-tracker/d/' + tok);
  assert.match(dash.text, /🗺️ Geo-grid: found at 9 of 9 points · top 3 at 9 · average position 2/);
  assert.match(dash.text, /aria-label="geo-grid"/);
  assert.match(dash.text, /name="g" value="roofer" checked/);
  const mails = []; await sendDigests({ store, send: async m => { mails.push(m); return true; }, baseUrl: 'https://app.example', now });
  assert.match(mails[0].html, /Geo-grid: found at 9 of 9 points/); assert.match(mails[0].html, /aria-label="geo-grid"/);
});
