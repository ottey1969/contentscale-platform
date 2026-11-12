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

test('owner 2026-11-12 "consultor geo" (Spain): Spanish provider titles establish the SERP intent; the AI question follows the research market', async () => {
  const cov = require('../src/growth-reader-task-coverage.cjs');
  const titles = ['Consultor GEO: visibilidad en ChatGPT y Gemini', 'Consultor GEO en Valencia | Rafa Villaplana', 'Ranking de consultores GEO en España 2026',
    'Cómo ser consultor SEO y GEO: habilidades, herramientas y sueldos', 'Mejor consultor GEO en España (2026): guía y criterios',
    'El Mejor Experto en GEO en España 2026: Consultor Generative Engine Optimization', 'Consultor GEO | Raúl Veneri', 'Consultor GEO: SEO para Inteligencia Artificial'];
  assert.deepEqual(titles.map(t => cov.classifyTitle(t)), ['SERVICE_PROVIDER', 'SERVICE_PROVIDER', 'PROVIDER_LIST', 'INFORMATIONAL_GUIDE', 'PROVIDER_LIST', 'PROVIDER_LIST', 'SERVICE_PROVIDER', 'SERVICE_PROVIDER']);
  const r = cov.inferSerpIntent({ query: 'consultor geo', leads: titles.map((title, i) => ({ url: 'https://s' + i + '.example/x', title })) });
  assert.notEqual(r.status, 'SERP_INTENT_NOT_ESTABLISHED', JSON.stringify(r).slice(0, 300));
  assert.equal(cov.classifyTitle('Wat is GEO? Uitleg'), 'INFORMATIONAL_GUIDE');
  // The AI question: page → Pre-Write Brief → site, as the research does.
  const seen = [], routes = {};
  const app = { get: (p, mw, h) => { routes['GET ' + p] = h; }, post: (p, mw, h) => { routes['POST ' + p] = h; } };
  process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || 'TEST-KEY';
  require('../src/tracker-growth-automatic-routes.cjs').registerGrowthAutomaticResearch(app, { query: async () => ({ rows: [] }) }, (q, s, n) => n && n(), {
    questionFetch: async (u, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ peopleAlsoAsk: [{ question: '¿Cuánto cuesta un consultor GEO?' }] }) }; },
    loadPageMarkets: async () => null, loadSiteMarkets: async () => ({ countries: ['US'], language: 'en' }),
    loadPrewriteMarket: async () => ({ countries: ['ES'], language: 'es', brief: { id: 44 } }), loadAiAnswers: async () => [] });
  const res = await new Promise(resolve => routes['GET /api/tracker-client/:token/growth/ai-check']({ params: { token: 'T' }, query: { page_id: '2538', query: 'consultor geo' },
    growth: { can_edit: true, pages: [{ id: 2538, url: 'https://es.example/consultor-geo/', keyword: 'consultor geo' }] }, growthTrackerClientId: 7 },
    { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() { return this; }, json(b) { resolve(b); } }));
  assert.deepEqual([seen[0].gl, seen[0].hl], ['es', 'es'], 'Spain from the Pre-Write Brief, not the US site default');
  assert.equal(res.ai_check.ai_question.text, '¿Cuánto cuesta un consultor GEO?');
});

test('owner 2026-11-12 Growth package: a Spanish question is searchable; two questions together are searched as the first one', async () => {
  const d = require('../src/growth-public-search-discovery.cjs');
  const two = 'Cuánto cobra un consultor GEO? y ¿Cómo vas a medir si mi marca aparece, se cita y se recomienda en ChatGPT, Gemini, Perplexity y Google AI Overviews para las preguntas que realmente hacen mis clientes antes de comprar?';
  assert.deepEqual(d.searchableTerm('¿Cuánto cobra un consultor GEO?'), { term: '¿Cuánto cobra un consultor GEO?' });
  assert.equal(d.searchableTerm(two).term, 'Cuánto cobra un consultor GEO?');
  assert.equal(d.searchableTerm('consultor geo').term, 'consultor geo');
  const sent = [];
  const g = await d.optionalGoogleOrganicDiscovery({ query: '¿Cuánto cobra un consultor GEO?', ownUrl: 'https://es.example/consultor-geo/', key: 'TEST',
    locale: { country: 'ES', gl: 'es', hl: 'es' }, fetchImpl: async (u, init) => { sent.push(JSON.parse(init.body).q); return { ok: true, json: async () => ({ organic: [] }) }; } });
  assert.notEqual(g.status, 'QUERY_NOT_SAFE_FOR_PUBLIC_SEARCH'); assert.equal(sent[0], '¿Cuánto cobra un consultor GEO?');
  const r = await d.discoverGrowthCompetitorsWithFallback({ query: two, ownUrl: 'https://es.example/x', fetchFree: async () => ({ status: 'NO_RELEVANT_PUBLIC_SEARCH_LEADS', leads: [] }),
    fetchGoogle: async o => ({ status: 'OK', source: 'SERPER_GOOGLE_ORGANIC', leads: [{ url: 'https://a.example/', title: 't' }], query: o.query }) });
  assert.equal(r.search_term_used, 'Cuánto cobra un consultor GEO?');
  const ui = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/growth-automatic-report-ui.js'), 'utf8');
  assert.match(ui, /Google searched with “'\+sdx\.search_term_used/);
});

test('Free Growth keeps up: 300-character question, searched-with shown and translated', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/growth-free/routes.cjs'), 'utf8');
  assert.match(src, /<textarea id="query" name="query" maxlength="300"/);
  assert.ok(!/clean\(b\.query,120\)/.test(src), 'no 120-character cut on the server');
  assert.match(src, /Google searched with “'\+esc\(c\.google_searched_with\)/);
  const { summarizeFreeGrowth } = require('../src/growth-free/summary.cjs');
  const s = summarizeFreeGrowth({ success: true, search_discovery: { search_term_used: '¿Cuánto cobra un consultor GEO?', leads: [] } }, { url: 'https://es.example/x', query: 'a? y b?' });
  assert.equal(s.checked.google_searched_with, '¿Cuánto cobra un consultor GEO?');
  const { ROWS } = require('../src/growth-free/ui-texts.cjs');
  assert.ok(ROWS.some(r => /^Google searched with/.test(r[0]) && /^Se buscó en Google/.test(r[2])));
});

test('owner 2026-11-12: "Before the research · optional" at the top with Search Console update and the AI systems', async () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/tracker-growth-automatic-routes.cjs'), 'utf8');
  assert.match(src, /<section id="growthBeforeResearch"><h2>Before the research · optional<\/h2>/);
  assert.match(src, /questionBox,prepBox,marketBox,briefBox,/);
  assert.match(src, /'Update Search Console data':'Fetch from Search Console'/);
  assert.match(src, /<\/div><div id="growthAiEarly"><\/div><\/section>/, 'the AI systems box sits in the section before the research');
  const ui = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/growth-automatic-report-ui.js'), 'utf8');
  assert.match(ui, /\/gsc-autofetch-page'/); assert.match(ui, /\/growth\/research-cache\/clear\?page_id=/);
  const routes = {}, app = { get: (p, mw, h) => { routes['GET ' + p] = h; }, post: (p, mw, h) => { routes['POST ' + p] = h; } };
  require('../src/tracker-growth-automatic-routes.cjs').registerGrowthAutomaticResearch(app, { query: async () => ({ rows: [] }) }, (q, s, n) => n && n(), {});
  const call = growth => new Promise(resolve => routes['POST /api/tracker-client/:token/growth/research-cache/clear']({ params: { token: 'T' }, query: { page_id: '5' }, growth, growthTrackerClientId: 1 },
    { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() { return this; }, json(b) { resolve([this.statusCode, b]); } }));
  assert.equal((await call({ can_edit: true, pages: [{ id: 5, url: 'https://x.example/' }] }))[1].success, true);
  assert.equal((await call({ can_edit: false, pages: [{ id: 5, url: 'https://x.example/' }] }))[0], 403, 'owner only');
});
