'use strict';
// Owner 2026-11-12: "the keyword must be a real search question, the best match; in Pre-Write and for the AI systems in
// Growth". Google answers are TEST stand-ins; nothing is sent anywhere.
const test = require('node:test'), assert = require('node:assert/strict');
const { aiQuestionForTerm, isQuestion } = require('../src/growth-customer-questions.cjs');
const ai = require('../src/growth-free/ai-answers.cjs');
const research = require('../src/prewrite-ai-answer-research.cjs');
const serper = (payload, seen = []) => async (url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => payload }; };

test('the best real Google question for the keyword: holds the keyword, asked as a question, People also ask first', async () => {
  const seen = [];
  const q = await aiQuestionForTerm({ term: 'emergency roof repair nj', gl: 'us', hl: 'en', key: 'TEST', now: 1, fetchImpl: serper({
    peopleAlsoAsk: [{ question: 'How much does a new roof cost?' }, { question: 'Who does emergency roof repair in NJ at night?' }, { question: 'Is roof repair covered by insurance?' }],
    relatedSearches: [{ query: 'emergency roof repair near me' }, { query: 'nj roofing companies' }] }, seen) });
  assert.equal(q.text, 'Who does emergency roof repair in NJ at night?');
  assert.equal(q.source, 'GOOGLE_PEOPLE_ALSO_ASK'); assert.equal(q.term, 'emergency roof repair nj');
  assert.deepEqual(seen[0], { q: 'emergency roof repair nj', gl: 'us', hl: 'en', num: 10 });
  // Cached per term and market for a day: no second Google call.
  await aiQuestionForTerm({ term: 'Emergency roof repair NJ', gl: 'us', hl: 'en', key: 'TEST', now: 2, fetchImpl: serper({}, seen) });
  assert.equal(seen.length, 1);
});

test('no question: a term that already is a question, Google off-topic, Google unavailable (not cached), no AI ideas', async () => {
  const seen = [];
  assert.equal(await aiQuestionForTerm({ term: '¿Cuánto cuesta reparar un tejado?', key: 'TEST', fetchImpl: serper({}, seen) }), null); assert.equal(seen.length, 0);
  assert.equal(await aiQuestionForTerm({ term: 'dakgoot reinigen utrecht', gl: 'nl', hl: 'nl', key: 'TEST', now: 5, fetchImpl: serper({ peopleAlsoAsk: [{ question: 'Wat kost een nieuwe auto?' }] }) }), null);
  assert.equal(await aiQuestionForTerm({ term: 'lekkage plat dak', gl: 'nl', hl: 'nl', key: '', now: 5 }), null, 'Google not configured');
  const q = await aiQuestionForTerm({ term: 'lekkage plat dak', gl: 'nl', hl: 'nl', key: 'TEST', now: 6, fetchImpl: serper({ peopleAlsoAsk: [{ question: 'Wat te doen bij lekkage plat dak?' }] }) });
  assert.equal(q && q.text, 'Wat te doen bij lekkage plat dak?', 'tried again after Google was unavailable');
  assert.ok(isQuestion('hoe repareer ik een lekkend dak') && isQuestion('roof leak?') && !isQuestion('roof leak repair'));
});

test('Growth AI check: the prompt asks the question; an answer to it counts; the question pasted back alone does not', () => {
  const p = ai.directPrompt('emergency roof repair nj', 'Who does emergency roof repair in NJ at night?');
  assert.match(p, /QUERY:\n\nWho does emergency roof repair in NJ at night\?/); assert.doesNotMatch(p, /\nemergency roof repair nj\n/);
  assert.match(ai.directPrompt('emergency roof repair nj'), /QUERY:\n\nemergency roof repair nj/, 'without a question: the term');
  const answer = 'ANSWER:\nSeveral roofers in New Jersey answer calls at night and tarp a leaking roof the same evening.\n\nRESOURCES:\nhttps://example.com/a';
  const ok = ai.parseAiAnswer(answer, { pageUrl: 'https://acme.example/', query: 'emergency roof repair nj', question: 'Who does emergency roof repair in NJ at night?' });
  assert.equal(ok.validation_status, 'valid');
  assert.equal(ai.validateGrowthAnswer('Who does emergency roof repair in NJ at night?', 'emergency roof repair nj', 'Who does emergency roof repair in NJ at night?').reason, 'query_only');
});

test('Pre-Write: the research and its prompt carry the customer question; the brief must answer it first', () => {
  const r = research.makePrewriteAiAnswerResearch({ query: 'dakreparatie amsterdam', ai_question: { text: 'Wat kost dakreparatie in Amsterdam?', source: 'Google · People also ask' },
    language: 'Dutch', market: 'nl', answers: [{ engine: 'chatgpt', answer: 'Een kleine reparatie kost meestal tussen 150 en 400 euro, afhankelijk van het dak.' },
      { engine: 'claude', answer: 'Wat kost dakreparatie in Amsterdam?' }] });
  assert.deepEqual(r.ai_question, { text: 'Wat kost dakreparatie in Amsterdam?', source: 'Google · People also ask' });
  const chatgpt = r.observations.find(o => o.engine === 'chatgpt'), claude = r.observations.find(o => o.engine === 'claude');
  assert.equal(chatgpt.validation_status, 'valid'); assert.equal(claude.error_reason, 'query_only', 'the question alone is not an answer');
  const prompt = research.buildPrewriteResearchPrompt(r);
  assert.match(prompt, /Target query: dakreparatie amsterdam/);
  assert.match(prompt, /Customer question asked to the AI systems: "Wat kost dakreparatie in Amsterdam\?" \(Google · People also ask\)/);
  assert.match(prompt, /direct answer must answer that question first/);
  // Without a question nothing changes.
  const plain = research.buildPrewriteResearchPrompt(research.makePrewriteAiAnswerResearch({ query: 'x y z', answers: [] }));
  assert.doesNotMatch(plain, /Customer question/);
});

test('Pre-Write request: the question is read from the request and screens answers', () => {
  const M = require('../src/prewrite-brief-research.cjs');
  assert.deepEqual(M.questionFromRequest({ ai_question: '  Wat kost <b>dakreparatie</b>?  ', ai_question_source: 'Google · People also ask' }), { text: 'Wat kost  b dakreparatie /b ?'.replace(/\s+/g, ' '), source: 'Google · People also ask' });
  assert.equal(M.questionFromRequest({}), null);
  const manualAi = { chatgpt: 'Wat kost dakreparatie in Amsterdam?' }, warn = console.warn; console.warn = () => {};
  let rejected; try { rejected = M.screenManualAnswers(manualAi, 'dakreparatie amsterdam', '', 'Wat kost dakreparatie in Amsterdam?'); } finally { console.warn = warn; }
  assert.equal(rejected.chatgpt.reason, 'query_only'); assert.equal(manualAi.chatgpt, '');
  const { research: r } = M.researchForRequest({ keyword: 'dakreparatie amsterdam', language: 'Dutch', region: 'nl', manualAi: {}, aiQuestion: { text: 'Wat kost dakreparatie in Amsterdam?', source: null } });
  assert.equal(r.ai_question.text, 'Wat kost dakreparatie in Amsterdam?');
});

test('owner 2026-11-12 "consultor geo": a question of someone who wants to do the job is never the customer question', async () => {
  const google = { peopleAlsoAsk: [{ question: '¿Cuánto gana un consultor GEO?' }, { question: '¿Cómo ser consultor GEO?' }, { question: '¿Qué hace un consultor GEO?' }, { question: '¿Cuánto cuesta un consultor GEO?' }],
    relatedSearches: [{ query: 'consultor geo sueldo' }, { query: 'consultor geo curso' }] };
  const q = await aiQuestionForTerm({ term: 'consultor geo', gl: 'es', hl: 'es', key: 'TEST', now: 10, fetchImpl: serper(google) });
  assert.equal(q.text, '¿Cuánto cuesta un consultor GEO?', 'a buyer question (price) wins');
  // Only job questions: no question (the keyword is asked), never "¿Cuánto gana…".
  const none = await aiQuestionForTerm({ term: 'consultor seo', gl: 'es', hl: 'es', key: 'TEST', now: 10, fetchImpl: serper({ peopleAlsoAsk: [{ question: '¿Cuánto gana un consultor SEO?' }, { question: '¿Cómo ser consultor SEO?' }] }) });
  assert.equal(none, null);
  // Pre-Write: the same helper; job questions are not offered, AI ideas only from the buyer's side.
  const { discoverCustomerQuestions } = require('../src/growth-customer-questions.cjs');
  const prompts = [];
  const out = await discoverCustomerQuestions({ keyword: 'consultor seo', gl: 'es', hl: 'es', key: 'TEST', fetchImpl: serper({ peopleAlsoAsk: [{ question: '¿Cuánto gana un consultor SEO?' }] }),
    model: { call: async p => { prompts.push(p); return JSON.stringify({ questions: ['¿Cuánto cuesta contratar un consultor SEO?', '¿Cómo ser consultor SEO freelance?'] }); } } });
  assert.equal(out.best_question, '¿Cuánto cuesta contratar un consultor SEO?');
  assert.ok(!out.questions.some(x => /Cómo ser/.test(x.text)), 'an AI idea about the job is dropped');
  assert.equal(out.questions.find(x => /gana/.test(x.text)).priority, 'NOT_A_CUSTOMER_QUESTION');
  assert.match(prompts[0], /never someone who wants to work in this field/);
});

test('the Serper.dev key is read from SERPER_API_KEY or SERPAPI_KEY (production keeps it in SERPAPI_KEY)', async () => {
  const { serperKey, fromGoogle } = require('../src/growth-customer-questions.cjs');
  const a = process.env.SERPER_API_KEY, b = process.env.SERPAPI_KEY;
  try {
    delete process.env.SERPER_API_KEY; process.env.SERPAPI_KEY = 'TEST-SERPAPI';
    assert.equal(serperKey(), 'TEST-SERPAPI');
    const seen = [];
    const g = await fromGoogle({ query: 'consultor geo', gl: 'es', hl: 'es', fetchImpl: async (u, init) => { seen.push(init.headers['X-API-KEY']); return { ok: true, json: async () => ({ peopleAlsoAsk: [{ question: '¿Cuánto cuesta un consultor GEO?' }] }) }; } });
    assert.equal(g.status, 'GOOGLE_QUESTIONS_FOUND'); assert.deepEqual(seen, ['TEST-SERPAPI']);
    delete process.env.SERPAPI_KEY;
    assert.equal((await fromGoogle({ query: 'consultor geo' })).status, 'GOOGLE_NOT_CONFIGURED');
  } finally {
    if (a === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = a;
    if (b === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = b;
  }
});

test('owner 2026-11-12: Google shows no question → autocomplete; AI fallback tolerant; long questions are not cut off', async () => {
  const { fromGoogle, fromAi } = require('../src/growth-customer-questions.cjs');
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(url); return { ok: true, json: async () => /autocomplete/.test(url)
    ? { suggestions: [{ value: 'consultor geo precio' }, { value: 'consultor geo madrid' }, { value: 'consultor geo' }] } : { organic: [] } }; };
  const g = await fromGoogle({ query: 'consultor geo', gl: 'es', hl: 'es', key: 'TEST', fetchImpl });
  assert.deepEqual(calls, ['https://google.serper.dev/search', 'https://google.serper.dev/autocomplete']);
  assert.deepEqual(g.questions.map(q => [q.text, q.source]), [['consultor geo precio', 'GOOGLE_AUTOCOMPLETE'], ['consultor geo madrid', 'GOOGLE_AUTOCOMPLETE']]);
  const offer = { title: '', h1: [], h2: [] };
  for (const raw of ['["¿Cuánto cuesta un consultor GEO?","¿Qué hace un consultor GEO por mi empresa?"]', '{"questions":[{"question":"¿Cuánto cuesta un consultor GEO?"}]}', 'Aquí: {"questions":["¿Merece la pena contratar un consultor GEO?"]}']) {
    const a = await fromAi({ offer, keyword: 'consultor geo', language: 'es', model: { call: async () => raw } });
    assert.equal(a.status, 'AI_SUGGESTIONS', raw);
  }
  const prompts = []; await fromAi({ offer, keyword: 'consultor geo', language: 'es', model: { call: async p => { prompts.push(p); return '[]'; } } });
  assert.match(prompts[0], /There is no page yet: only the keyword/);
  const long = '¿Cómo vas a medir si mi marca aparece, se cita y se recomienda en ChatGPT, Gemini, Perplexity y Google AI Overviews para las preguntas que realmente hacen mis clientes antes de comprar?';
  assert.ok(long.length > 160 && long.length <= 300);
  const M = require('../src/prewrite-brief-research.cjs');
  assert.equal(M.questionFromRequest({ ai_question: long }).text, long);
  const r = require('../src/prewrite-ai-answer-research.cjs').makePrewriteAiAnswerResearch({ query: 'consultor geo', ai_question: { text: long }, answers: [] });
  assert.equal(r.ai_question.text, long);
  const tab = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/prewrite-research-tab.js'), 'utf8');
  assert.match(tab, /qInput = document\.createElement\('textarea'\); qInput\.id = 'cs-ai-question'; qInput\.maxLength = 300;/);
  assert.match(tab, /question in its answer/);
});

test('a failed AI suggestion says why, and an empty lookup is not cached for a day', async () => {
  const { fromAi } = require('../src/growth-customer-questions.cjs');
  const a = await fromAi({ offer: { title: '', h1: [], h2: [] }, keyword: 'consultor geo', language: 'es', model: { call: async () => { throw Object.assign(Error('x'), { code: 'JUDGE_HTTP_429' }); } } });
  assert.deepEqual([a.status, a.error], ['AI_FAILED', 'JUDGE_HTTP_429']);
  const express = require('express'), request = require('supertest');
  const app = express(); let n = 0;
  require('../src/prewrite-customer-question.cjs').registerPrewriteCustomerQuestion(app, { query: async () => ({ rows: [{ id: 1 }] }) }, {
    model: null, discover: async () => { n++; return { questions: [], best_question: null, google: { status: 'GOOGLE_NO_QUESTIONS' }, ai: { status: 'AI_FAILED', error: 'JUDGE_HTTP_429' } }; } });
  const r1 = await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'consultor geo', region: 'es — Spain', language: 'Spanish' });
  assert.equal(r1.body.ai_error, 'JUDGE_HTTP_429');
  await request(app).get('/api/tracker-client/tok/prewrite-customer-question').query({ keyword: 'consultor geo', region: 'es — Spain', language: 'Spanish' });
  assert.equal(n, 2, 'tried again, not served from the cache');
});

test('owner 2026-11-12 "best in NL and Spain": Spain first; only when Google shows nothing there, México, labelled as such', async () => {
  const { discoverCustomerQuestions } = require('../src/growth-customer-questions.cjs');
  const seen = [];
  const fetchImpl = async (url, init) => { const b = JSON.parse(init.body); seen.push([url.replace('https://google.serper.dev/', ''), b.gl]);
    return { ok: true, json: async () => b.gl === 'mx' && /search$/.test(url) ? { peopleAlsoAsk: [{ question: '¿Cuánto cobra un consultor GEO?' }] } : {} }; };
  const out = await discoverCustomerQuestions({ keyword: 'consultor geo', gl: 'es', hl: 'es', key: 'TEST', fetchImpl, model: null });
  assert.deepEqual(seen, [['search', 'es'], ['autocomplete', 'es'], ['search', 'mx']], 'Spain (search + autocomplete) before México');
  assert.equal(out.best_question, '¿Cuánto cobra un consultor GEO?');
  assert.match(out.questions[0].label, /^Google México · People also ask · Spain showed none$/);
  assert.equal(out.google.fallback_market.to, 'mx');
  // Spain has a question: México is never asked.
  const seen2 = [];
  await discoverCustomerQuestions({ keyword: 'consultor geo', gl: 'es', hl: 'es', key: 'TEST', model: null,
    fetchImpl: async (url, init) => { seen2.push(JSON.parse(init.body).gl); return { ok: true, json: async () => ({ peopleAlsoAsk: [{ question: '¿Cuánto cuesta un consultor GEO?' }] }) }; } });
  assert.deepEqual(seen2, ['es']);
});
