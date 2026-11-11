'use strict';
// The question asked to the AI systems is the best real customer question, chosen automatically (owner 2026-11-11).
// Keywords, questions and trackers below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
const { registerPrewriteCustomerQuestion, readMarket } = require('../src/prewrite-customer-question.cjs');

const pool = { query: async (sql, args) => ({ rows: args[0] === 'tok' ? [{ id: 7 }] : [] }) };

test('market from the Pre-Write fields: region code and language name', () => {
  assert.deepEqual(readMarket('es — Spain', 'Spanish'), { gl: 'es', hl: 'es' });
  assert.deepEqual(readMarket('gb — United Kingdom', 'English'), { gl: 'uk', hl: 'en' });
  assert.deepEqual(readMarket('', ''), { gl: 'us', hl: 'en' });
});

test('Pre-Write: best Google question for the keyword, cached, bounded per hour, unknown tracker refused', async () => {
  const calls = [];
  const discover = async a => { calls.push(a); return { best_question: '¿qué es un rastreador de posiciones seo?', selection_source: 'OBSERVED_GOOGLE',
    questions: [{ text: '¿qué es un rastreador de posiciones seo?', label: 'Google · People also ask', source: 'GOOGLE_PEOPLE_ALSO_ASK' }, { text: 'rastreador de posiciones gratis', label: 'Google · Related search' }] }; };
  const app = express(); registerPrewriteCustomerQuestion(app, pool, { discover, model: null, perHour: 2 });
  const r = await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'Rastreador de posiciones', region: 'es — Spain', language: 'Spanish' });
  assert.equal(r.status, 200); assert.equal(r.body.best_question, '¿qué es un rastreador de posiciones seo?'); assert.equal(r.body.best_label, 'Google · People also ask');
  assert.deepEqual([calls[0].keyword, calls[0].gl, calls[0].hl], ['Rastreador de posiciones', 'es', 'es']);
  const again = await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'rastreador de posiciones', region: 'es — Spain', language: 'Spanish' });
  assert.equal(again.body.cached, true); assert.equal(calls.length, 1, 'same keyword and market: no second search');
  await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'b' });
  assert.equal((await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'c' })).status, 429);
  assert.equal((await request(app).get('/api/tracker-client/nope/prewrite-customer-question').query({ keyword: 'x' })).status, 404);
  assert.equal((await request(app).get('/api/tracker-client/tok/prewrite-customer-question')).status, 400);
});

test('Pre-Write: no Google question → no best question, the keyword stays in use', async () => {
  const app = express(); registerPrewriteCustomerQuestion(app, pool, { discover: async () => ({ questions: [], best_question: null, selection_source: 'NONE' }), model: null });
  const r = await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'zz' });
  assert.equal(r.body.success, true); assert.equal(r.body.best_question, null);
});

test('Pre-Write page script: the copy button copies the chosen question, not the bare keyword', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/prewrite-research-tab.js'), 'utf8');
  assert.match(src, /prewrite-customer-question\?keyword=/);
  assert.match(src, /function askText\(\) \{ return String\(qInput\.value \|\| ''\)\.trim\(\) \|\| val\('pwbKeyword'\); \}/);
  assert.match(src, /var q = askText\(\); if \(!q\) return;/);
});

test('Tracker Growth: without a chosen question the research opens with the best customer question (unless keyword_only)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/tracker-growth-automatic-routes.cjs'), 'utf8');
  assert.match(src, /if\(req\.growth\?\.can_edit===true&&!v\.queryOverride&&req\.query\?\.keyword_only!=='1'\)/);
  assert.match(src, /q\.set\('query',best\.text\);q\.set\('auto_q','1'\)/);
  assert.match(src, /Chosen automatically: the best matching question customers ask in Google/);
});
