/**
 * brief-quality.test.js
 * Run:  node brief-quality.test.js
 * No test framework needed — plain node:assert. Exit code 1 on any failure (CI-friendly).
 * These tests LOCK the brief-quality behaviour so a future prompt change can't silently
 * regress output quality.
 */
'use strict';
const assert = require('node:assert');
const Q = require('./brief-quality.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  \u2713', name); }
  catch (e) { fail++; console.error('  \u2717', name, '\n     ', e.message); }
}

console.log('expectedCtr');
test('monotonic decreasing over positions 1..10', () => {
  for (let p = 1; p < 10; p++) assert.ok(Q.expectedCtr(p) > Q.expectedCtr(p + 1));
});
test('beyond page 1 is low', () => {
  assert.ok(Q.expectedCtr(15) <= 0.012);
  assert.ok(Q.expectedCtr(40) <= 0.005);
});

console.log('computeGscSignals');
test('flags ctr_gap when ranking but barely clicked (real PRT case)', () => {
  const s = Q.computeGscSignals({ clicks: 8, impressions: 8678, position: 5.7 });
  const gap = s.find((x) => x.id === 'ctr_gap');
  assert.ok(gap, 'expected ctr_gap signal');
  assert.strictEqual(gap.priority, 'HIGH');
  assert.match(gap.evidence, /0\.09%/); // real CTR, not a template
});
test('does NOT emit contradictory position bands', () => {
  const s = Q.computeGscSignals({ clicks: 8, impressions: 8678, position: 5.7 });
  const bands = s.filter((x) => x.id.startsWith('pos_'));
  assert.strictEqual(bands.length, 1, 'exactly one position band');
  assert.strictEqual(bands[0].id, 'pos_page1'); // 5.7 => page 1, not top 3
});
test('no ctr_gap when CTR already healthy', () => {
  const s = Q.computeGscSignals({ clicks: 500, impressions: 10000, position: 5 });
  assert.ok(!s.find((x) => x.id === 'ctr_gap'));
});
test('top-3 position yields LOW band only', () => {
  const s = Q.computeGscSignals({ clicks: 300, impressions: 5000, position: 2 });
  assert.strictEqual(s.filter((x) => x.id.startsWith('pos_')).length, 1);
  assert.strictEqual(s.find((x) => x.id.startsWith('pos_')).id, 'pos_top3');
});
test('stale freshness computed from real lastmod', () => {
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  const s = Q.computeGscSignals({ clicks: 1, impressions: 50, position: 8, lastModifiedISO: old });
  assert.ok(s.find((x) => x.id === 'stale'));
});

console.log('detectCannibalization');
test('flags multiple emergency pages from sitemap', () => {
  const r = Q.detectCannibalization({
    keyword: 'emergency roof repair nj',
    page: { url: 'https://x.com/' },
    site: { sitemap: [
      { url: 'https://x.com/' },
      { url: 'https://x.com/24-hour-emergency-roof-repair-nj/' },
      { url: 'https://x.com/emergency-roof-repair/' },
      { url: 'https://x.com/roof-emergency/' },
      { url: 'https://x.com/roof-leak/' },
    ] },
  });
  assert.strictEqual(r.cannibalized, true);
  assert.ok(r.pages.length >= 2);
  assert.ok(!r.pages.includes('https://x.com/roof-leak/')); // different intent, not flagged
});
test('GSC query->pages is authoritative when provided', () => {
  const r = Q.detectCannibalization({
    keyword: 'emergency roof repair nj',
    page: { url: 'https://x.com/' },
    site: { gscQueryPages: [
      { query: 'emergency roof repair nj', url: 'https://x.com/', impressions: 8000 },
      { query: 'emergency roof repair nj', url: 'https://x.com/24-hour-emergency-roof-repair-nj/', impressions: 1200 },
    ] },
  });
  assert.strictEqual(r.source, 'gsc');
  assert.strictEqual(r.cannibalized, true);
  assert.strictEqual(r.pages.length, 2);
});
test('no false positive on a unique keyword', () => {
  const r = Q.detectCannibalization({
    keyword: 'chimney liner installation nj',
    page: { url: 'https://x.com/chimney-liners/' },
    site: { sitemap: [{ url: 'https://x.com/chimney-liners/' }, { url: 'https://x.com/roof-leak/' }] },
  });
  assert.strictEqual(r.cannibalized, false);
});

console.log('fillOrStripPlaceholders');
test('strips unfillable placeholders entirely (no fabrication)', () => {
  const r = Q.fillOrStripPlaceholders('Serving NJ for [X] years with [Y] projects.', {});
  assert.ok(!r.text.includes('['));
  assert.ok(r.text.trim() === '' || !/\d/.test(r.text));
  assert.strictEqual(r.removedSentences.length, 1);
});
test('fills placeholders from verified brand facts', () => {
  const r = Q.fillOrStripPlaceholders('Serving NJ for [X years] with proven crews.', { yearsInBusiness: 8 });
  assert.match(r.text, /Serving NJ for 8 with proven crews\./);
  assert.strictEqual(r.filled.length, 1);
});

console.log('validateInternalLinks');
test('unwraps self-links and unknown internal URLs', () => {
  const html = 'See <a href="https://x.com/">self</a> and <a href="https://x.com/missing/">dead</a> and <a href="https://x.com/roof-leak/">ok</a>.';
  const r = Q.validateInternalLinks(html, {
    page: { url: 'https://x.com/' },
    site: { sitemap: [{ url: 'https://x.com/' }, { url: 'https://x.com/roof-leak/' }] },
  });
  assert.ok(!/href="https:\/\/x\.com\/"/.test(r.text), 'self-link removed');
  assert.ok(!r.text.includes('/missing/'), 'dead link removed');
  assert.ok(r.text.includes('href="https://x.com/roof-leak/"'), 'valid link kept');
  assert.strictEqual(r.issues.length, 2);
});

console.log('suppressRedundant + dedupe');
test('suppresses "add question H2" when page already has them', () => {
  const recs = [{ engine: 'Google', title: 'Add question-based H2 for AIO', action: '## What...' }];
  const page = { html: '<h2>What?</h2><h2>How?</h2><h3>Why?</h3>' };
  assert.strictEqual(Q.suppressRedundant(recs, { page }).length, 0);
});
test('dedupe removes identical actions within same engine', () => {
  const recs = [
    { engine: 'Google', action: 'Replace title and meta' },
    { engine: 'Google', action: 'Replace title and meta' },
    { engine: 'Google', action: 'Add internal link' },
  ];
  assert.strictEqual(Q.dedupe(recs).length, 2);
});

console.log('postProcessBrief (end to end)');
test('produces client-safe brief + change report + cannibalization rec', () => {
  const ctx = {
    gsc: { clicks: 8, impressions: 8678, position: 5.7 },
    page: { url: 'https://x.com/', keyword: 'emergency roof repair nj', html: '<h2>What?</h2><h2>How?</h2><h2>Why?</h2>' },
    site: { sitemap: [
      { url: 'https://x.com/' },
      { url: 'https://x.com/24-hour-emergency-roof-repair-nj/' },
      { url: 'https://x.com/emergency-roof-repair/' },
    ] },
    brand: { serviceArea: 'all 21 NJ counties' },
  };
  const raw = { recommendations: [
    { engine: 'Perplexity', title: 'Add E-E-A-T', action: 'Serving NJ for over [X] years.', impact: 'Better E-E-A-T' },
    { engine: 'Google', title: 'Add question-based H2 for AIO', action: '## What are the signs', impact: 'AIO' },
    { engine: 'Google', title: 'Meta', action: 'Replace title and meta', impact: 'CTR' },
    { engine: 'Google', title: 'Meta', action: 'Replace title and meta', impact: 'CTR' },
  ] };
  const { brief, report } = Q.postProcessBrief(raw, ctx);
  // placeholder sentence removed
  assert.ok(!JSON.stringify(brief).includes('[X]'));
  assert.ok(report.placeholdersRemoved.length >= 1);
  // redundant question-H2 suppressed
  assert.ok(!brief.recommendations.find((r) => /question-based h2/i.test(r.title)));
  // duplicate meta deduped
  assert.strictEqual(brief.recommendations.filter((r) => r.action === 'Replace title and meta').length, 1);
  // cannibalization injected at top, HIGH
  assert.strictEqual(brief.recommendations[0].title, 'Resolve keyword cannibalization');
  assert.strictEqual(brief.recommendations[0].priority, 'HIGH');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
