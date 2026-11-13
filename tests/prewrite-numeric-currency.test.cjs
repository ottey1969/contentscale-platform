'use strict';
const test = require('node:test'), assert = require('node:assert');
const m = require('../src/prewrite-numeric-claims.cjs');
test('an amount is supported only in the same currency (production 2026-11-13: €175 "verified" by $175)', () => {
  assert.equal(m.currencyOf('$175'), 'USD'); assert.equal(m.currencyOf('175 €'), 'EUR'); assert.equal(m.currencyOf('12,50 euro'), 'EUR'); assert.equal(m.currencyOf('£90'), 'GBP');
  const eur = { opening_passage: { direct_answer: 'Reken op €175 tot €450 per uur.' }, competitor_table: [{ has: 'charges $175–$450 per hour' }] };
  assert.deepEqual(m.unverifiedNumbers(eur).map(x => [x.number, x.currency]), [['175', 'EUR'], ['450', 'EUR']]);
  const usd = { opening_passage: { direct_answer: 'Rates run $175 to $450 per hour.' }, competitor_table: [{ has: 'charges $175–$450 per hour' }] };
  assert.deepEqual(m.unverifiedNumbers(usd), []);
  // A plain number without any currency in the evidence still supports it, as before.
  assert.deepEqual(m.unverifiedNumbers({ opening_passage: { direct_answer: 'Desde 297 € al mes.' }, fact_safety: { verified_business_facts_used: ['Plan 297 per month'] } }), []);
});
test('verification on a source page requires the same currency next to the number', () => {
  assert.equal(m.findOnPage('A consultant charges $175–$450 per hour', '175', 'EUR'), null);
  assert.ok(m.findOnPage('A consultant charges $175–$450 per hour', '175', 'USD'));
  assert.ok(m.findOnPage('Tarief 175 euro per uur', '175', 'EUR'));
  const r = m.verifyOnPages([{ number: '175', text: '€175', currency: 'EUR' }], [{ url: 'https://x.test', text: 'charges $175 per hour' }]);
  assert.equal(r.verified.length, 0); assert.equal(r.left.length, 1);
});
