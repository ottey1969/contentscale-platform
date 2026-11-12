'use strict';
// Owner 2026-11-12: Spanish page, Spanish market, but English topics and reader questions; "What is the best GEO tool?" as
// the customer question of a consultant page; "Expand this page in Growth" did nothing for an unsaved Brief; "Research:
// consultor geo" offered as a new page on the consultor geo page.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

test('topic names and reader questions are asked in the page language', async () => {
  const ov = require('../src/growth-competitor-overview.cjs');
  assert.equal(ov.pageLanguage('<html lang="es-ES"><body></body></html>'), 'es');
  assert.match(ov.topicPrompt({ query: 'consultor geo', competitors: [], page: [], language: 'es' }), /Write every "topic" in Spanish, the language of the page/);
  assert.doesNotMatch(ov.topicPrompt({ query: 'x', competitors: [], page: [] }), /Write every "topic"/);
  const prompts = [];
  const model = { call: async p => { prompts.push(p); return '{"topics":[]}'; } };
  const html = '<html lang="es"><body><h2>Qué es GEO</h2><p>' + 'texto '.repeat(60) + '</p></body></html>';
  await ov.buildCompetitorOverview({ query: 'consultor geo', ownUrl: 'https://es.example/consultor-geo/', ownHtml: html,
    competitors: [{ url: 'https://a.example/x', html: '<html lang="en"><body><h2>Best GEO tools</h2><p>' + 'text '.repeat(60) + '</p></body></html>' }], model });
  assert.match(prompts[0] || '', /in Spanish, the language of the page/, 'derived from the page HTML');
  const tm = require('../src/growth-task-meaning.cjs'); const seen = [];
  await tm.judgeTaskMeaning({ query: 'consultor geo', language: 'es', pageSections: [{ heading: 'Qué es GEO', text: 'x' }],
    coverage: { tasks: [{ code: 't1', supported_by_competitors: true, label: 'Precio', competitor_evidence: [{ host: 'a.example', heading: 'Precio', excerpt: 'x' }, { host: 'b.example', heading: 'Coste', excerpt: 'y' }] }] },
    model: { model: 'stub', call: async p => { seen.push(p); return '{"tasks":[]}'; } } });
  assert.match(seen[0] || '', /Write every reader_question in Spanish/);
  const routes = fs.readFileSync(path.join(__dirname, '../src/tracker-growth-automatic-routes.cjs'), 'utf8');
  assert.match(routes, /judgeTasks\(\{query:targetQuery,coverage,pageSections:groupSections\(pageBlocks\(selectedSource\.html\)\),language:/);
});

test('a consultant keyword never gets a tool question as its customer question', () => {
  const { rankQuestions } = require('../src/growth-customer-questions.cjs');
  const items = ['What is the best GEO tool?', '¿Cuánto cuesta un consultor GEO?'].map(text => ({ text, source: 'GOOGLE_PEOPLE_ALSO_ASK' }));
  const r = rankQuestions(items, { offer: { h1: ['Consultor GEO'], h2: [], title: 'Consultor GEO' }, seed: 'consultor geo' });
  assert.equal(r.best.text, '¿Cuánto cuesta un consultor GEO?');
  assert.equal(r.questions.find(q => /tool/.test(q.text)).priority, 'NOT_A_CUSTOMER_QUESTION');
  assert.equal(rankQuestions([items[0]], { offer: { h1: [], h2: [], title: '' }, seed: 'best geo tools' }).best.text, 'What is the best GEO tool?', 'a tool keyword keeps tool questions');
});

test('"Expand this page in Growth" always opens Growth; variants of the tracked keyword are no new page', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(src, /\/growth\/from-brief\?url='\+encodeURIComponent\(url\)\+'&keyword='\+encodeURIComponent\(kw\)/);
  const routes = fs.readFileSync(path.join(__dirname, '../src/tracker-growth-automatic-routes.cjs'), 'utf8');
  assert.match(routes, /const direct=!req\.query\?\.brief_id&&!req\.query\?\.job_id/);
  const ui = fs.readFileSync(path.join(__dirname, '../public/growth-automatic-report-ui.js'), 'utf8');
  assert.match(ui, /!variantOfThis\(c\.query\)/);
});
