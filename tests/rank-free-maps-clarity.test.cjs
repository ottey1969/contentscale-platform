'use strict';
// Owner feedback 2026-11-14 on the Maps section: "niet in top 1" is confusing, what do the colours (red) mean,
// the grid must say which place it is about, the explanation is too complicated, and help to find good keywords.
// All sites, places and results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const { mapsCell, gridTable, gridText, posColor, t } = require('../src/rank-free/texts.cjs');
const { mapsKeywordIdeas, dashboardPage } = require('../src/rank-free/routes.cjs');

const pts = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) pts.push({ row, col, position: row === 2 ? 12 : 2 });
const grid = { status: 'OK', size: 3, spacing_km: 1.6, place: 'Lodi, NJ', points: pts, measured: 9, found: 9, top3: 6, average: 5.3 };

test('a business that is not on the map says "not found", never "not in top 1"', () => {
  assert.equal(mapsCell({ status: 'NOT_IN_RESULTS', depth: 1 }, t('nl')), 'niet gevonden');
  assert.equal(mapsCell({ status: 'NOT_IN_RESULTS', depth: 20 }, t('en')), 'not found');
  assert.equal(mapsCell({ status: 'FOUND', position: 2 }, t('nl')), '2');
});

test('one colour scale for the Maps table and the grid: green 1-3, orange 4-10, red 11+, grey not found', () => {
  assert.equal(posColor(1), posColor(3));
  assert.notEqual(posColor(3), posColor(4));
  assert.equal(posColor(4), posColor(10));
  assert.notEqual(posColor(10), posColor(11));
  assert.notEqual(posColor(null), posColor(11));
});

test('the grid names its place and marks the middle as the business', () => {
  assert.match(gridText({ grid }, t('nl')), /Lodi, NJ/);
  const html = gridTable({ grid }, t('nl'));
  assert.match(html, /Lodi, NJ/);
  assert.match(html, /noord/i);
  assert.match(html, /het midden is je bedrijf/);
});

test('keyword ideas for Google Maps come from the site\'s own data, without the town (we add the place ourselves)', () => {
  const data = { keywords: [{ keyword: 'roofer', history: [{ result: { status: 'FOUND', position: 1, suggestions: ['roof repair lodi nj', 'roofer'] } }] }],
    gsc: { queries: [{ query: 'flat roof repair lodi', impressions: 40 }, { query: 'roofer near me', impressions: 90 }, { query: 'gutter cleaning hackensack nj', impressions: 5 }, { query: 'best roofing blog', impressions: 300 }] } };
  const ideas = mapsKeywordIdeas(data, ['Lodi, NJ', 'Hackensack, NJ']);
  assert.ok(ideas.includes('flat roof repair'));
  assert.ok(ideas.includes('roof repair'));
  assert.ok(ideas.includes('gutter cleaning'));
  assert.ok(!ideas.includes('roofer'), 'already tracked');
  assert.ok(!ideas.includes('best roofing blog'), 'no place in the search: not a Maps idea');
});

test('the dashboard explains the colours in plain words and shows the ideas as chips', () => {
  const data = { host: 'acme.example', gl: 'us', hl: 'en', country: 'US', language: 'en', provider_ready: true, maps_location: 'Lodi, NJ', maps_grid: ['roofer'], gsc: { queries: [{ query: 'flat roof repair lodi', impressions: 40 }] },
    keywords: [{ keyword: 'roofer', history: [{ result: { status: 'FOUND', position: 1, checked_at: '2026-11-14T00:00:00Z', url: 'https://acme.example/', maps_places: [{ location: 'Lodi, NJ', status: 'FOUND', position: 2 }], grid } }] }] };
  const html = dashboardPage('nl', data, 'tok', { maxKeywords: 10 });
  assert.match(html, /Rood/);
  assert.match(html, /Groen/);
  assert.match(html, /id="mk"[\s\S]*data-k="flat roof repair"/);
  assert.match(html, /background:#16a34a[^"]*">2</, 'the Maps cell carries the colour of its position');
});
