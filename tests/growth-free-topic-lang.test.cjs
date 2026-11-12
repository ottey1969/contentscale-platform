'use strict';
// Phase 2 of "Spanish is Spanish, English is English" (owner 2026-11-12): AI-written topic names in the language of the
// check; headings of other pages are quotes and stay; the stored research never changes; a bad model answer changes nothing.
const test = require('node:test'), assert = require('node:assert/strict');
const tl = require('../src/growth-free/topic-lang.cjs');

const summary = () => ({ explanation: 'The topic comparison found 1 topic: “Customer reviews and discounts”. Choose it only if it fits.',
  gaps: { note: 'n', items: [
    { id: 't-1', ai: 'AI-grouped topic', title: 'Customer reviews and discounts', examples: [{ heading: 'Great Roof Replacement' }] },
    { id: 'h-1', title: 'Roof Leaking in Winter? What to Do', examples: [{ heading: 'Roof Leaking in Winter? What to Do' }] }] },
  outcome_context: { note: 'x', topics: [{ title: 'Customer reviews and discounts' }] } });
const aiGap = () => ({ topics_basis: 'TOPICS_COMPARED', missing_topics: [
  { topic: 'Financing for 24 hour repairs', examples: [{ heading: 'Monthly payment options' }] },
  { topic: 'Storm Damage', examples: [{ heading: 'Storm Damage' }] }] });
const fake = answer => { const calls = []; return { calls, call: async p => { calls.push(p); return typeof answer === 'function' ? answer(p) : answer; } }; };

test('only AI-written names are collected; quoted headings are not', () => {
  assert.deepEqual(tl.collectTexts(summary(), aiGap()), ['Customer reviews and discounts', 'Financing for 24 hour repairs']);
});

test('names are replaced in the shown result, the original kept, sentences quoting them follow', async () => {
  const model = fake(JSON.stringify({ texts: ['Reseñas de clientes y descuentos', 'Financiación para reparaciones 24 horas'] }));
  const map = await tl.translateTexts(tl.collectTexts(summary(), aiGap()), 'es', { model });
  assert.match(model.calls[0], /Spanish/);
  const s0 = summary(), g0 = aiGap(), { summary: s, aiGap: g } = tl.applyTexts(s0, g0, map);
  assert.equal(s.gaps.items[0].title, 'Reseñas de clientes y descuentos'); assert.equal(s.gaps.items[0].title_original, 'Customer reviews and discounts');
  assert.equal(s.gaps.items[1].title, 'Roof Leaking in Winter? What to Do', 'a heading of another page is a quote');
  assert.match(s.explanation, /“Reseñas de clientes y descuentos”/);
  assert.equal(s.outcome_context.topics[0].title, 'Reseñas de clientes y descuentos');
  assert.equal(g.missing_topics[0].topic, 'Financiación para reparaciones 24 horas'); assert.equal(g.missing_topics[1].topic, 'Storm Damage');
  assert.equal(s0.gaps.items[0].title, 'Customer reviews and discounts', 'the stored research is not changed');
});

test('a model answer that does not hold up changes nothing', async () => {
  const texts = tl.collectTexts(summary(), aiGap());
  for (const bad of ['not json', JSON.stringify({ texts: ['één'] }), JSON.stringify({ texts: ['a', 'Financiación 48 horas'] }), JSON.stringify({ texts: ['<b>x</b>', 'y 24'] })])
    assert.equal(await tl.translateTexts(texts, 'es', { model: fake(bad) }), null, bad);
  assert.equal(await tl.translateTexts(texts, 'es', { model: null }), null, 'no model: original names');
  assert.equal(await tl.translateTexts(texts, 'de', { model: fake('{}') }), null, 'only the check languages');
});

test('cached per check and language; a second view makes no model call', async () => {
  const q = []; const pool = { query: async (sql, p) => { q.push(p); return { rows: [] }; } };
  const model = fake(JSON.stringify({ texts: ['Reseñas', 'Financiación 24 horas'] }));
  const row = { id: 7 };
  const map = await tl.topicTextsFor({ pool, row, lang: 'es', summary: summary(), aiGap: aiGap(), model });
  assert.equal(map['Customer reviews and discounts'], 'Reseñas'); assert.equal(q.length, 1); assert.equal(q[0][1], 'es');
  row.topic_texts = { es: JSON.parse(q[0][2]) };
  await tl.topicTextsFor({ pool, row, lang: 'es', summary: summary(), aiGap: aiGap(), model });
  assert.equal(model.calls.length, 1);
});
