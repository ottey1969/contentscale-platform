'use strict';
const test = require('node:test'), assert = require('node:assert');
const { backfillEvidencePages, perSourceChars } = require('../src/prewrite-evidence-backfill.cjs');
const urls = n => Array.from({ length: n }, (_, i) => 'https://s' + i + '.example/p');
const page = u => ({ url: u, text: 'x'.repeat(300) });

test('one blocked page of the first 8 no longer fails coverage (production: checked 7/28)', async () => {
  const c = urls(28), corpus = new Map();
  c.slice(0, 8).forEach((u, i) => { if (i !== 3) corpus.set(u, page(u)); }); // initial fetch: s3 blocked
  const seen = [];
  const r = await backfillEvidencePages({ candidates: new Set(c), corpus, required: 8, maxAttempts: 8, attempted: c.slice(0, 8), fetchPage: async u => { seen.push(u); return page(u); } });
  assert.equal(r.read, 8); assert.equal(r.required, 8); assert.equal(r.extra_attempts, 1);
  assert.deepEqual(seen, [c[8]]); // the blocked page is not retried; only the shortfall is fetched
});
test('stops at the cap and never retries a failed page', async () => {
  const c = urls(30), corpus = new Map(), seen = [];
  const r = await backfillEvidencePages({ candidates: c, corpus, required: 8, maxAttempts: 8, fetchPage: async u => { seen.push(u); return null; } });
  assert.equal(r.read, 0); assert.equal(r.extra_attempts, 8); assert.equal(new Set(seen).size, seen.length);
});
test('nothing to do when coverage is met; fewer candidates than required lowers the requirement', async () => {
  const c = urls(5), corpus = new Map(c.map(u => [u, page(u)]));
  let calls = 0;
  const r = await backfillEvidencePages({ candidates: c, corpus, required: 8, maxAttempts: 8, fetchPage: async () => { calls++; return null; } });
  assert.equal(calls, 0); assert.equal(r.required, 5); assert.equal(r.read, 5);
});
test('a throwing fetch does not break the run', async () => {
  const c = urls(12), corpus = new Map();
  const r = await backfillEvidencePages({ candidates: c, corpus, required: 3, maxAttempts: 6, fetchPage: async u => { if (u.includes('s0')) throw new Error('x'); return page(u); } });
  assert.equal(r.read, 3);
});
test('extraction budget is spread over every read page, same total as before', () => {
  assert.equal(perSourceChars(10), 3000); assert.equal(perSourceChars(14), 3000);
  assert.equal(perSourceChars(21), 2000); assert.equal(perSourceChars(40), 1500);
  assert.ok(perSourceChars(21) * 21 <= 14 * 3000);
});
test('index.js wires the backfill before the first extraction and reads every corpus page', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  const bf = s.indexOf('backfillEvidencePages({candidates:_pwbStatCandidateUrls'), ex = s.indexOf("_pwbExtractEvidence(Array.from(_pwbCorpusMap.values()),'pass1')");
  assert.ok(bf > 0 && ex > bf);
  assert.ok(!s.includes('corpus.slice(0,14).map'));
});
