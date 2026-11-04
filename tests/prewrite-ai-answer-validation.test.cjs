'use strict';
// AI ANSWER RESEARCH — VALIDATION CONTRACT. Regression for the Tracker result "AI answers researched: 1/5" where the
// Google AI Overviews / Gemini field held the Research Prompt itself (query "seo content optimalisatie", Dutch, nl).
// Only an actual answer to the target query counts; everything else is INVALID, never evidence, never counted.
// All answers below are labelled test inputs; none is presented as a real AI answer.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const R = require('../src/prewrite-ai-answer-research.cjs');
const M = require('../src/prewrite-brief-research.cjs');
const Q = 'seo content optimalisatie';
const PROMPT = R.buildPrewriteResearchPrompt(R.makePrewriteAiAnswerResearch({ query: Q, language: 'Dutch', market: 'nl', answers: [] }));
const VALID_NL = 'TEST: SEO-contentoptimalisatie is het verbeteren van bestaande of nieuwe webinhoud op zoekintentie, volledigheid en betrouwbaarheid. Zie https://developers.google.com/search/docs/fundamentals/creating-helpful-content';

test('the reported case: the Research Prompt pasted as the Gemini answer gives 0/5, INVALID prompt echo, nothing used', () => {
  const r = R.makePrewriteAiAnswerResearch({ query: Q, language: 'Dutch', market: 'nl', answers: [{ engine: 'google_aio', answer: PROMPT }] });
  assert.equal(r.contract, 'prewrite_ai_answer_research_v3');
  assert.equal(r.systems_researched, 0); assert.equal(r.readiness, 'RESEARCH_NOT_CAPTURED');
  assert.deepEqual(r.invalid_systems, [{ label: 'Google AI Overviews / Gemini', reason: 'prompt_echo' }]);
  const g = r.observations.find(o => o.engine === 'google');
  assert.equal(g.checked, false); assert.equal(g.validation_status, 'invalid'); assert.equal(g.error_reason, 'prompt_echo');
  assert.equal(g.answer_excerpt, null, 'the instructions are not stored as an observed answer');
  assert.deepEqual(g.source_urls, []); assert.deepEqual(r.source_candidates, []);
  assert.equal(g.target_query, Q); assert.equal(g.language, 'Dutch'); assert.equal(g.market, 'nl'); assert.equal(g.observation_method, 'manual');
  const p = R.buildPrewriteResearchPrompt(r);
  assert.match(p, /AI answers researched: 0\/5 \(not checked: ChatGPT Search, Perplexity, Claude, Microsoft Copilot; invalid: Google AI Overviews \/ Gemini\)/);
  assert.match(p, /SYSTEM: Google AI Overviews \/ Gemini — INVALID \(prompt echo\): the submitted text is not an answer to the target query and is not evidence\. Treat this system as NOT CHECKED\. Do not invent results\./);
  assert.doesNotMatch(p, /Observed answer \(unverified\)/, 'no observed answer is passed to the generator');
  assert.equal(p.split('Target query:').length - 1, 1, 'the prompt is not nested in itself');
});

test('also rejected: an AI reply to the Research Prompt, placeholders, the query alone, too short, unrelated text', () => {
  const replyToPrompt = 'direct_answer: TEST ... missing_questions: ... factual_gaps: ... source_verification_tasks: controleer bronnen. fact_check_before_publishing: alle cijfers over seo content.';
  const cases = [[replyToPrompt, 'prompt_echo'], ['Paste the actual Google AI Overview or Gemini answer for research and source verification.', 'placeholder'],
    ['n/a', 'placeholder'], ['SEO content optimalisatie', 'query_only'], ['SEO tips', 'too_short'],
    ['TEST De Eiffeltoren staat in Parijs en is ongeveer 330 meter hoog.', 'not_about_query']];
  for (const [answer, reason] of cases) {
    const v = R.validateAnswer(answer, Q);
    assert.equal(v.valid, false, answer.slice(0, 40)); assert.equal(v.reason, reason, answer.slice(0, 40)); assert.ok(v.message);
  }
  assert.equal(R.validateAnswer('', Q).status, 'not_checked');
});

test('real answers stay valid in any language: inflected words, accents, and short or non-Latin queries', () => {
  assert.equal(R.validateAnswer(VALID_NL, Q).valid, true);
  assert.equal(R.validateAnswer('TEST: Je optimaliseert bestaande teksten door eerst de zoekintentie te bepalen.', Q).valid, true, 'optimaliseert ~ optimalisatie');
  assert.equal(R.validateAnswer('TEST: İçerik ölçekleme, kaliteyi koruyarak daha fazla sayfa üretmektir.', 'içerik ölçekleme').valid, true);
  assert.equal(R.validateAnswer('TEST: An answer that explains the subject in three sentences.', 'AI').valid, true, 'no word of 3+ letters: no topic check');
  assert.equal(R.validateAnswer('TEST: コンテンツの拡張とは品質を保ちながらページを増やすことです。 詳しく 説明', 'コンテンツの拡張').valid, true);
  // One marker word inside a real answer is not an echo.
  assert.equal(R.validateAnswer('TEST: SEO content optimalisatie is pre-publication work: plan, write, check.', Q).valid, true);
});

test('research saved before the contract (v2) with an echo is shown as INVALID and no longer counted', () => {
  const v2 = R.makePrewriteAiAnswerResearch({ query: Q, language: 'Dutch', market: 'nl', answers: [{ engine: 'chatgpt', answer: VALID_NL }] });
  // Simulate the stored v2 object from before the contract: the echo was counted as checked.
  const stored = JSON.parse(JSON.stringify(v2)); stored.contract = 'prewrite_ai_answer_research_v2';
  stored.observations = stored.observations.map(o => { const c = { ...o }; for (const k of ['validation_status', 'error_reason', 'error_message', 'rejected_preview', 'target_query', 'observation_method', 'observed_at']) delete c[k]; return c; });
  Object.assign(stored.observations[0], { checked: true, answer_source: 'manual', answer_excerpt: PROMPT.slice(0, 2800), source_urls: [] });
  stored.systems_researched = 2;
  const again = R.revalidate(stored);
  assert.equal(again.systems_researched, 1); assert.equal(again.observations[0].validation_status, 'invalid'); assert.equal(again.observations[0].error_reason, 'prompt_echo');
  assert.equal(again.observations[1].checked, true, 'the real answer still counts');
  assert.match(R.buildPrewriteResearchPrompt(stored), /AI answers researched: 1\/5 .*invalid: Google AI Overviews \/ Gemini/);
  assert.equal(stored.systems_researched, 2, 'revalidate returns a copy; the stored object is not changed');
});

test('server: an invalid answer is removed before use, recorded as INVALID, and an automatic Perplexity answer may replace it', () => {
  const manualAi = { google_aio: PROMPT.slice(0, 12000), chatgpt: VALID_NL, perplexity: 'n/a', claude: '', copilot: '' };
  const warn = console.warn; let logged = ''; console.warn = (...a) => { logged = a.join(' '); };
  let rejected; try { rejected = M.screenManualAnswers(manualAi, Q); } finally { console.warn = warn; }
  assert.deepEqual(Object.keys(rejected), ['google_aio', 'perplexity']); assert.equal(manualAi.google_aio, ''); assert.equal(manualAi.perplexity, '');
  assert.match(logged, /google_aio=prompt_echo, perplexity=placeholder/);
  const auto = 'TEST automatic perplexity: SEO content optimalisatie begint bij zoekintentie. https://example.org/p';
  const { research: r, prompt } = M.researchForRequest({ keyword: Q, language: 'Dutch', region: 'nl', manualAi, perplexityEvidenceText: auto, rejected });
  assert.equal(r.systems_researched, 2);
  assert.equal(r.observations.find(o => o.engine === 'google').error_reason, 'prompt_echo');
  const px = r.observations.find(o => o.engine === 'perplexity');
  assert.equal(px.checked, true); assert.equal(px.answer_source, 'automatic fallback');
  assert.doesNotMatch(prompt, /Observed answer \(unverified\): AI ANSWER RESEARCH/);
  // Without an automatic answer the rejected Perplexity text is recorded as an invalid manual answer.
  const r2 = M.researchForRequest({ keyword: Q, language: 'Dutch', region: 'nl', manualAi: { perplexity: '' }, perplexityEvidenceText: '', rejected: { perplexity: rejected.perplexity } }).research;
  assert.equal(r2.observations.find(o => o.engine === 'perplexity').validation_status, 'invalid');
});

test('Complete missing only: a rejected new answer is recorded as INVALID; an earlier valid answer is kept', () => {
  const prev = R.makePrewriteAiAnswerResearch({ query: Q, language: 'Dutch', market: 'nl', answers: [{ engine: 'chatgpt', answer: VALID_NL }] });
  const brief = { prewrite_ai_answer_research: prev, ai_system_evidence: { chatgpt: { text: VALID_NL, checked: true } } };
  M.refreshAfterMissingOnly(brief, { query: Q, rejected: { google_aio: { answer: PROMPT, reason: 'prompt_echo', message: 'TEST message' } } });
  const r = brief.prewrite_ai_answer_research;
  assert.equal(r.systems_researched, 1);
  assert.deepEqual(r.invalid_systems, [{ label: 'Google AI Overviews / Gemini', reason: 'prompt_echo' }]);
  assert.match(R.buildPrewriteResearchPrompt(r), /Google AI Overviews \/ Gemini — INVALID \(prompt echo\)/);
});

test('src/index.js: the 5/5 gate and the missing-only merge count only valid answers', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const fn = name => { const i = src.indexOf('function ' + name + '('); assert.ok(i > 0, name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } };
  const ctx = { _prewriteBriefResearch: M, _PWB_AI_ENGINES_V506: ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot'], _pwbCanonicalizeAiAnalysisV506() {} };
  vm.runInNewContext([fn('_pwbBriefQueryV506'), fn('_pwbAiEvidenceStateV506'), fn('_pwbMergeManualAiEvidenceV506'), 'this.state=_pwbAiEvidenceStateV506;this.merge=_pwbMergeManualAiEvidenceV506;'].join('\n'), ctx);
  // A Brief saved before the contract, with the echo counted as Gemini evidence: no longer counted.
  const saved = { keyword: Q, research_contract: { ai_systems_required: 5 }, ai_system_evidence: { google_aio: { checked: true, text: PROMPT }, chatgpt: { checked: true, text: VALID_NL } } };
  const st = ctx.state(saved);
  assert.equal(st.checked_count, 1); assert.deepEqual(Array.from(st.checked), ['chatgpt']); assert.equal(st.complete, false);
  // Missing-only merge: the echo is refused and reported; the valid answer is merged.
  const b = { research_contract: { ai_systems_required: 5 }, ai_system_evidence: {} };
  const m = ctx.merge(b, { google_aio: PROMPT, claude: 'TEST claude: SEO content optimalisatie vraagt om duidelijke antwoorden en bronnen.' }, Q);
  assert.deepEqual(Object.keys(m.rejected), ['google_aio']); assert.equal(m.rejected.google_aio.reason, 'prompt_echo');
  assert.equal(b.ai_system_evidence.google_aio, undefined, 'the echo is not stored as evidence');
  assert.equal(b.ai_system_evidence.claude.checked, true);
  // The browser counter, the submit check and the gate message use the same contract.
  assert.match(src, /if\(chk\.valid\)present\.push\(item\);else\{missing\.push\(item\);if\(v\)\{item\.reason=chk\.reason;/);
  assert.match(src, /✕ Not an AI answer to "'\+kw\+'": /);
  assert.match(src, /' Not accepted: '\+Object\.keys\(_aiMerge\.rejected\)/);
});
