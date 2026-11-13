'use strict';
const test = require('node:test'), assert = require('node:assert');
const { expertQueries, topicOf, langOf, OFFICIAL } = require('../src/prewrite-expert-queries.cjs');
test('the topic drops question words, per language (production 2026-11-13)', () => {
  assert.equal(topicOf('hoe weet ik of chatgpt mijn bedrijf noemt', 'nl'), 'chatgpt bedrijf noemt');
  assert.equal(topicOf('cómo saber si chatgpt menciona mi empresa', 'es'), 'chatgpt menciona empresa');
  assert.equal(topicOf('how to check if chatgpt mentions my business', 'en'), 'chatgpt mentions business');
  assert.equal(topicOf('consultor geo', 'es'), 'consultor geo');
  assert.equal(topicOf('is het', 'nl'), 'is het', 'never empty');
});
test('queries are in the language of the Brief and include one official-source search', () => {
  const nl = expertQueries('hoe weet ik of chatgpt mijn bedrijf noemt', 'Dutch');
  assert.equal(nl.length, 6);
  assert.ok(nl.some(q => /zegt|onderzoeker/.test(q)));
  assert.ok(!nl.some(q => /practitioner|named researcher|transcript/.test(q)));
  assert.equal(nl.filter(q => q.includes(OFFICIAL)).length, 1);
  assert.ok(expertQueries('cómo saber si chatgpt menciona mi empresa', 'Spanish').some(q => /experto|entrevista/.test(q)));
  assert.equal(langOf('Nederlands'), 'nl'); assert.equal(langOf('Español'), 'es'); assert.equal(langOf(''), 'en');
});
test('index.js uses the builder for the expert searches', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(s.includes("require('./prewrite-expert-queries.cjs').expertQueries(keyword,language).map(q=>_pwbEvidenceSearchOne('expert_quotes',q,"));
  assert.ok(!s.includes("' practitioner interview direct quote'"));
});
