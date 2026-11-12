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
