/**
 * gsc-client.test.js
 * Run: node gsc-client.test.js
 * Uses a mock fetch (no network, no auth) to test the transforms + pagination,
 * and proves the GSC data makes brief-quality's cannibalization check authoritative.
 */
'use strict';
const assert = require('node:assert');
const G = require('./gsc-client.js');
const Q = require('./brief-quality.js');

let pass = 0, fail = 0;
function test(name, fn) {
  Promise.resolve().then(fn).then(() => { pass++; console.log('  \u2713', name); })
    .catch((e) => { fail++; console.error('  \u2717', name, '\n     ', e.message); });
}
// mock fetch keyed by "<dimensions>|<startRow>"
function mockFetch(map) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const key = `${(body.dimensions || []).join(',')}|${body.startRow}`;
    return { ok: true, status: 200, json: async () => ({ rows: map[key] || [] }), text: async () => '' };
  };
}

console.log('cannibalizationFromRows (pure)');
test('flags a query served by >1 page, sorted by impressions', () => {
  const rows = [
    { query: 'emergency roof repair nj', url: '/a', impressions: 8000, position: 5 },
    { query: 'emergency roof repair nj', url: '/b', impressions: 1200, position: 9 },
    { query: 'roof leak nj', url: '/c', impressions: 500, position: 3 },
  ];
  const c = G.cannibalizationFromRows(rows);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].query, 'emergency roof repair nj');
  assert.strictEqual(c[0].pages.length, 2);
  assert.strictEqual(c[0].pages[0].url, '/a'); // highest impressions first
});
test('respects minImpressions threshold', () => {
  const rows = [
    { query: 'x', url: '/a', impressions: 3 },
    { query: 'x', url: '/b', impressions: 2 },
  ];
  assert.strictEqual(G.cannibalizationFromRows(rows, { minImpressions: 10 }).length, 0);
});

console.log('getQueryPages (mock fetch + pagination)');
test('maps keys to {query,url,...} and paginates', async () => {
  const fetchImpl = mockFetch({
    'query,page|0': [
      { keys: ['erc nj', 'https://s/a'], clicks: 8, impressions: 8000, position: 5 },
      { keys: ['erc nj', 'https://s/b'], clicks: 1, impressions: 1200, position: 9 },
    ],
    'query,page|2': [
      { keys: ['leak nj', 'https://s/c'], clicks: 5, impressions: 500, position: 3 },
    ],
  });
  const rows = await G.getQueryPages('sc-domain:s', { rowLimit: 2, minImpressions: 1 }, 'tok', fetchImpl);
  assert.strictEqual(rows.length, 3);            // 2 from page 1 + 1 from page 2 (pagination worked)
  assert.deepStrictEqual(rows[0], { query: 'erc nj', url: 'https://s/a', clicks: 8, impressions: 8000, position: 5 });
});

console.log('getPageMetrics (mock fetch)');
test('returns aggregate metrics + top queries for a URL', async () => {
  const fetchImpl = mockFetch({
    '|0': [{ clicks: 2, impressions: 73, ctr: 0.0274, position: 7.1 }],
    'query|0': [{ keys: ['ottmar francisca'], clicks: 1, impressions: 40, position: 4 }],
  });
  const m = await G.getPageMetrics('sc-domain:s', 'https://s/about/', { days: 28 }, 'tok', fetchImpl);
  assert.strictEqual(m.impressions, 73);
  assert.strictEqual(m.position, 7.1);
  assert.strictEqual(m.topQueries[0].query, 'ottmar francisca');
});

console.log('buildScanInputs + brief-quality integration');
test('GSC query->pages makes detectCannibalization authoritative (source=gsc)', async () => {
  const fetchImpl = mockFetch({
    '|0': [{ clicks: 8, impressions: 8678, ctr: 0.0009, position: 5.7 }],
    'query|0': [{ keys: ['emergency roof repair nj'], clicks: 8, impressions: 8678, position: 5.7 }],
    'query,page|0': [
      { keys: ['emergency roof repair nj', 'https://s/'], clicks: 8, impressions: 8000, position: 5.7 },
      { keys: ['emergency roof repair nj', 'https://s/24-hour-emergency-roof-repair-nj/'], clicks: 0, impressions: 900, position: 8 },
    ],
  });
  const inputs = await G.buildScanInputs({ siteUrl: 'sc-domain:s', pageUrl: 'https://s/', keyword: 'emergency roof repair nj', token: 'tok', fetchImpl });
  assert.strictEqual(inputs.gsc.impressions, 8678);
  assert.ok(inputs.gscQueryPages.length >= 2);
  // feed into brief-quality — should report source 'gsc' and cannibalized true
  const c = Q.detectCannibalization({
    keyword: 'emergency roof repair nj',
    page: { url: 'https://s/' },
    site: { gscQueryPages: inputs.gscQueryPages },
  });
  assert.strictEqual(c.source, 'gsc');
  assert.strictEqual(c.cannibalized, true);
  assert.strictEqual(c.pages.length, 2);
});

process.on('exit', () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
});
