'use strict';
// Owner 2026-11-14, real PRT dashboard: "not found in the 9 results Google showed" for almost every keyword. Google
// often shows 8 or 9 normal results on a page (the map block takes space); the tracker took that for the end of the
// results and never looked at page 2 and 3. All sites and results below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const engine = require('../src/rank-free/engine.cjs');

const fake = pages => async (url, opts) => { const b = JSON.parse(opts.body), p = pages[(b.page || 1) - 1] || [];
  return { ok: true, status: 200, json: async () => ({ organic: p.map((link, i) => ({ link, title: 't', position: i + 1 })) }) }; };
const n = (pfx, k) => Array.from({ length: k }, (_, i) => 'https://' + pfx + i + '.example/');

test('a page with 9 results is not the end: the site on page 2 is found, at its real place', async () => {
  const r = await engine.checkRank({ keyword: 'roofer', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', fetchImpl: fake([n('a', 9), ['https://b.example/', 'https://acme.example/roofer/']]) });
  assert.equal(r.status, 'FOUND');
  assert.equal(r.position, 11, 'second result on page 2, counted after the 9 on page 1');
  assert.equal(r.calls, 2);
});

test('not found after three short pages: the depth is what Google really showed', async () => {
  const r = await engine.checkRank({ keyword: 'roofer', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', fetchImpl: fake([n('a', 9), n('b', 8), n('c', 9)]) });
  assert.equal(r.status, 'NOT_IN_RESULTS'); assert.equal(r.depth, 26); assert.equal(r.calls, 3);
});

test('a clearly short page is the end of the results: no extra paid call', async () => {
  const r = await engine.checkRank({ keyword: 'rare', host: 'acme.example', gl: 'us', hl: 'en', key: 'k', fetchImpl: fake([n('a', 3)]) });
  assert.equal(r.status, 'NOT_IN_RESULTS'); assert.equal(r.all_results_shown, true); assert.equal(r.depth, 3); assert.equal(r.calls, 1);
});
