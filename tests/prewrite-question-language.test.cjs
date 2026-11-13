'use strict';
const test = require('node:test'), assert = require('node:assert');
const { otherLanguage, discoverCustomerQuestions } = require('../src/growth-customer-questions.cjs');
const { registerPrewriteCustomerQuestion } = require('../src/prewrite-customer-question.cjs');

test('English People-also-ask questions are dropped in a Spanish or Dutch market (production 2026-11-13)', () => {
  assert.equal(otherLanguage('How much do ChatGPT optimization services cost for small businesses?', 'es'), true);
  assert.equal(otherLanguage('How to choose an agency for ChatGPT recommendation optimization?', 'es'), true);
  assert.equal(otherLanguage('What is the best GEO agency in Amsterdam?', 'nl'), true);
  assert.equal(otherLanguage('¿Cómo hacer que ChatGPT recomiende mi empresa?', 'es'), false);
  assert.equal(otherLanguage('chatgpt recomiende mi empresa en ingles', 'es'), false);
  assert.equal(otherLanguage('Hoe zorg je dat ChatGPT je bedrijf aanbeveelt?', 'nl'), false);
  assert.equal(otherLanguage('Wat is de beste manier om je bedrijf te laten noemen?', 'nl'), false);
  assert.equal(otherLanguage('How much does a GEO consultant cost?', 'en'), false);
});

test('discoverCustomerQuestions skips other-language Google questions', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ peopleAlsoAsk: [
    { question: 'How much do ChatGPT optimization services cost for small businesses?' },
    { question: '¿Cómo consigo que ChatGPT recomiende mi empresa?' }], relatedSearches: [] }) });
  const out = await discoverCustomerQuestions({ keyword: 'chatgpt recomiende mi empresa', gl: 'es', hl: 'es', key: 'k', fetchImpl, model: null });
  const texts = out.questions.map(q => q.text);
  assert.ok(texts.some(t => /recomiende/.test(t)));
  assert.ok(!texts.some(t => /^How much/.test(t)), texts.join(' | '));
});

function harness(model) {
  const routes = {}, app = { get: (p, h) => { routes[p] = h; } };
  const pool = { query: async () => ({ rows: [{ id: 1 }] }) };
  const discover = async () => ({ questions: [{ text: '¿Cómo consigo que ChatGPT recomiende mi empresa?', label: 'Google' }, { text: '¿Cuánto cuesta aparecer en ChatGPT?', label: 'Google' }],
    best_question: '¿Cómo consigo que ChatGPT recomiende mi empresa?', selection_source: 'OBSERVED_GOOGLE', google: { status: 'OK' }, ai: { status: 'AI_NOT_NEEDED_GOOGLE_MATCH' } });
  registerPrewriteCustomerQuestion(app, pool, { discover, model });
  const call = q => new Promise(resolve => { const res = { set() { return res; }, status() { return res; }, json: resolve };
    routes['/api/tracker-client/:token/prewrite-customer-question']({ params: { token: 't' }, query: q }, res); });
  return call;
}

test('translation is returned next to the questions, in the requested language; questions stay Spanish', async () => {
  let calls = 0;
  const model = { call: async () => { calls++; return JSON.stringify({ texts: ['Hoe zorg ik dat ChatGPT mijn bedrijf aanbeveelt?', 'Wat kost het om in ChatGPT te verschijnen?'] }); } };
  const call = harness(model);
  const d = await call({ keyword: 'chatgpt recomiende mi empresa', region: 'es — Spain', language: 'Spanish', translate: 'nl' });
  assert.equal(d.best_question, '¿Cómo consigo que ChatGPT recomiende mi empresa?');
  assert.equal(d.translation_language, 'nl');
  assert.equal(d.translations['¿Cuánto cuesta aparecer en ChatGPT?'], 'Wat kost het om in ChatGPT te verschijnen?');
  const again = await call({ keyword: 'chatgpt recomiende mi empresa', region: 'es — Spain', language: 'Spanish', translate: 'nl' });
  assert.equal(again.cached, true); assert.ok(again.translations); assert.equal(calls, 1);
});

test('no translation requested, or same language: no model call', async () => {
  let calls = 0; const call = harness({ call: async () => { calls++; return '{}'; } });
  const a = await call({ keyword: 'x y', region: 'es', language: 'Spanish' });
  const b = await call({ keyword: 'x y', region: 'es', language: 'Spanish', translate: 'es' });
  assert.equal(a.translations, null); assert.equal(b.translations, null); assert.equal(calls, 0);
});

test('a failing translation never breaks the question lookup', async () => {
  const call = harness({ call: async () => { throw new Error('quota'); } });
  const d = await call({ keyword: 'a b', region: 'es', language: 'Spanish', translate: 'nl' });
  assert.equal(d.success, true); assert.equal(d.translations, null);
});
