'use strict';
// AI ANSWER RESEARCH — VALIDATION CONTRACT. Regression for the Tracker result "AI answers researched: 1/5" where the
// Google AI Overviews / Gemini field held the Research Prompt itself (query "seo content optimalisatie", Dutch, nl).
// Only an actual answer to the target query counts; everything else is INVALID, never evidence, never counted.
// All answers below are labelled test inputs; none is presented as a real AI answer.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const R = require('../src/prewrite-ai-answer-research.cjs');
const M = require('../src/prewrite-brief-research.cjs');
const G = (answer, google_source) => ({ engine: 'google_aio', answer, google_source });
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
  assert.match(p, /AI answers researched: 0\/5 valid · captured 1 · invalid 1 · not checked 4 · origin verified 0 \(via API\), manual pastes unverified\nNot checked: ChatGPT Search, Perplexity, Claude, Microsoft Copilot\. Invalid, not counted: Google AI Overviews \/ Gemini\./);
  assert.equal(r.answers_captured, 1); assert.equal(r.answers_valid, 0); assert.equal(r.answers_invalid, 1); assert.equal(r.systems_not_checked, 4);
  assert.match(p, /SYSTEM: Google AI Overviews \/ Gemini — INVALID \(prompt echo\): the submitted text is not usable as an answer to the target query and is not evidence\. Treat this system as NOT CHECKED\. Do not invent results\./);
  assert.doesNotMatch(p, /Observed answer \(unverified\)/, 'no observed answer is passed to the generator');
  assert.equal(p.split('Target query:').length - 1, 1, 'the prompt is not nested in itself');
});

test('also rejected: an AI reply to the Research Prompt, placeholders, the query alone, too short', () => {
  const replyToPrompt = 'direct_answer: TEST ... missing_questions: ... factual_gaps: ... source_verification_tasks: controleer bronnen. fact_check_before_publishing: alle cijfers over seo content.';
  const cases = [[replyToPrompt, 'prompt_echo'], ['Paste the actual Google AI Overview or Gemini answer for research and source verification.', 'placeholder'],
    ['n/a', 'placeholder'], ['SEO content optimalisatie', 'query_only'], ['SEO tips', 'too_short']];
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
  assert.match(R.buildPrewriteResearchPrompt(stored), /AI answers researched: 1\/5 valid · captured 2 · invalid 1 · not checked 3 .*\n.*Invalid, not counted: Google AI Overviews \/ Gemini/);
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
  assert.match(src, /x\[0\]==='google_aio'\?L\.validateGoogle\(v,gs,kw,true\)/);
  assert.match(src, /' \/ 5 valid AI answers · '\+st\.captured\+' captured · '\+st\.invalid\.length\+' invalid · '\+st\.not_checked\+' not checked'/);
  assert.match(src, /✕ Not an AI answer to "'\+kw\+'": /);
  assert.match(src, /' Not accepted: '\+Object\.keys\(_aiMerge\.rejected\)/);
});

test('synonyms are never rejected: an answer that uses other words than the query counts, with a visible topic check', () => {
  // Each answer is a correct answer to its query in other words (TEST inputs).
  const synonymCases = [
    ['auto kopen', 'TEST: Een wagen aanschaffen doe je pas na een proefrit en een onafhankelijke keuring van de onderhoudshistorie.'],
    ['seo content optimalisatie', 'TEST: Webteksten verbeteren voor zoekmachines begint bij de vraag van de lezer en eindigt bij meten.'],
    ['cheap flights', 'TEST: Low-cost airfare is easiest to find by comparing several booking sites and flying midweek.'],
    ['fiets repareren', 'TEST: Een rijwiel herstellen begint met het controleren van de banden, de ketting en de remmen.'],
    ['ucuz uçak bileti', 'TEST: Uygun fiyatlı hava yolu biletleri için birkaç rezervasyon sitesini karşılaştırın.']
  ];
  for (const [query, answer] of synonymCases) {
    const v = R.validateAnswer(answer, query);
    assert.equal(v.valid, true, query); assert.equal(v.status, 'valid', query);
    assert.deepEqual(v.warnings, ['topic_unconfirmed'], query); assert.match(v.message, /synonyms are fine/);
    const r = R.makePrewriteAiAnswerResearch({ query, answers: [{ engine: 'chatgpt', answer }] });
    assert.equal(r.answers_valid, 1, query + ': counted');
    assert.match(R.buildPrewriteResearchPrompt(r), /Topic check: shares no word with the target query; confirm it answers the query before using it\./);
  }
  // An answer that shares a word or stem gets no warning.
  assert.deepEqual(R.validateAnswer(VALID_NL, Q).warnings, []);
  // An unrelated text is not rejected by vocabulary alone either (no deterministic check knows every synonym): it counts
  // with the same visible check, and its origin stays "manual paste, not verified".
  const off = R.validateAnswer('TEST De Eiffeltoren staat in Parijs en is ongeveer 330 meter hoog.', Q);
  assert.equal(off.valid, true); assert.deepEqual(off.warnings, ['topic_unconfirmed']);
});

test('Google source is explicit: AI Overview, Gemini, No AI Overview shown; missing or conflicting choice is INVALID', () => {
  const base = { query: Q, language: 'Dutch', market: 'nl', require_google_source: true };
  const google = answers => R.makePrewriteAiAnswerResearch({ ...base, answers }).observations.find(o => o.engine === 'google');
  const ov = google([G(VALID_NL, 'ai_overview')]);
  assert.equal(ov.checked, true); assert.equal(ov.google_source, 'ai_overview'); assert.equal(ov.researched_system, 'Google AI Overview');
  const ge = google([G(VALID_NL, 'gemini')]);
  assert.equal(ge.checked, true); assert.equal(ge.researched_system, 'Gemini');
  // No AI Overview shown: recorded as checked absence; not valid, not invalid, not "not checked", not a failed Gemini answer.
  const r = R.makePrewriteAiAnswerResearch({ ...base, answers: [G('', 'no_ai_overview'), { engine: 'chatgpt', answer: VALID_NL }] });
  const none = r.observations.find(o => o.engine === 'google');
  assert.equal(none.checked, false); assert.equal(none.validation_status, 'no_ai_overview'); assert.equal(none.error_reason, null);
  assert.equal(r.answers_valid, 1); assert.equal(r.answers_invalid, 0); assert.equal(r.systems_not_checked, 3); assert.equal(r.google_no_ai_overview, true);
  const p = R.buildPrewriteResearchPrompt(r);
  assert.match(p, /· Google: no AI Overview shown ·/);
  assert.match(p, /SYSTEM: Google AI Overviews \/ Gemini — NO AI OVERVIEW SHOWN for this query \(checked by the owner\)\. This is not an AI answer and not a failed Gemini answer; Gemini was not researched\./);
  assert.doesNotMatch(p, /Google AI Overviews \/ Gemini — INVALID|Google AI Overviews \/ Gemini — NOT CHECKED/);
  // Text without a source, or text with "No AI Overview shown": INVALID with the reason; never counted.
  assert.equal(google([G(VALID_NL, '')]).error_reason, 'source_not_chosen');
  assert.equal(google([G(VALID_NL, 'no_ai_overview')]).error_reason, 'source_conflict');
  // Research saved before the choice existed keeps counting, marked "source not recorded" (existing Briefs unchanged).
  const saved = R.makePrewriteAiAnswerResearch({ query: Q, answers: [G(VALID_NL)] });
  const g = saved.observations.find(o => o.engine === 'google');
  assert.equal(g.checked, true); assert.equal(g.google_source, 'unrecorded');
  assert.match(R.buildPrewriteResearchPrompt(saved), /Google AI Overviews \/ Gemini — researched: Google AI Overview or Gemini \(source not recorded\) \[manual paste · origin not verified\]/);
});

test('provenance: a pasted answer is never origin-verified, however valid; only the API answer has a known origin', () => {
  const r = R.makePrewriteAiAnswerResearch({ query: Q, require_google_source: true, answers: [G(VALID_NL, 'gemini'), { engine: 'chatgpt', answer: VALID_NL },
    { engine: 'perplexity', answer: 'TEST automatic: SEO content optimalisatie begint bij zoekintentie.', source: 'automatic fallback' }] });
  const by = e => r.observations.find(o => o.engine === e);
  for (const e of ['google', 'chatgpt']) { assert.equal(by(e).provenance, 'manual_paste_unverified'); assert.equal(by(e).origin_verified, false); }
  assert.equal(by('perplexity').provenance, 'automatic_api'); assert.equal(by('perplexity').origin_verified, true);
  assert.equal(r.answers_origin_verified, 1); assert.deepEqual(r.verified_sources, [], 'content sources stay unverified');
  const p = R.buildPrewriteResearchPrompt(r);
  assert.match(p, /SYSTEM: ChatGPT Search \[manual paste · origin not verified\]/);
  assert.match(p, /Manually pasted answers are observations by the owner whose origin is not verified/);
  // Old saved research gets provenance derived from its source label, never upgraded.
  const old = JSON.parse(JSON.stringify(r)); old.contract = 'prewrite_ai_answer_research_v2'; old.observations.forEach(o => { delete o.provenance; delete o.origin_verified; });
  assert.equal(R.revalidate(old).observations.find(o => o.engine === 'chatgpt').provenance, 'manual_paste_unverified');
});

test('server: Google source through screening, research, evidence and the 5/5 gate; No AI Overview never counts', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const fn = name => { const i = src.indexOf('function ' + name + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } };
  const ctx = { _prewriteBriefResearch: M, _PWB_AI_ENGINES_V506: ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot'], _pwbCanonicalizeAiAnalysisV506() {} };
  vm.runInNewContext([fn('_pwbBriefQueryV506'), fn('_pwbAiEvidenceStateV506'), fn('_pwbMergeManualAiEvidenceV506'), 'this.state=_pwbAiEvidenceStateV506;this.merge=_pwbMergeManualAiEvidenceV506;'].join('\n'), ctx);
  const four = { chatgpt: VALID_NL, perplexity: VALID_NL, claude: VALID_NL, copilot: VALID_NL };
  // Network 5/5 with "No AI Overview shown": four counted, Google missing with a clear label, not a Gemini failure.
  const b = { keyword: Q, research_contract: { ai_systems_required: 5 }, ai_system_evidence: {} };
  const m = ctx.merge(b, { ...four, google_source: 'no_ai_overview' }, Q);
  assert.equal(Object.keys(m.rejected).length, 0); assert.equal(m.checked_count, 4);
  assert.equal(b.ai_system_evidence.google_aio.google_source, 'no_ai_overview'); assert.equal(b.ai_system_evidence.google_aio.checked, false);
  const st = ctx.state(b); assert.equal(st.complete, false); assert.equal(st.google_no_ai_overview, true);
  assert.match(src, /k==='google_aio'&&_aiState\.google_no_ai_overview\?'Google \(no AI Overview shown — add the Gemini answer\)'/);
  // The Gemini answer then completes 5/5 and is stored with its source and provenance.
  ctx.merge(b, { google_aio: VALID_NL, google_source: 'gemini' }, Q);
  assert.equal(ctx.state(b).complete, true);
  assert.equal(b.ai_system_evidence.google_aio.google_source, 'gemini'); assert.equal(b.ai_system_evidence.google_aio.provenance, 'manual_paste_unverified');
  // "No AI Overview shown" afterwards never removes that answer.
  ctx.merge(b, { google_source: 'no_ai_overview' }, Q); assert.equal(b.ai_system_evidence.google_aio.checked, true);
  // A Google answer without a source is refused with the reason.
  const b2 = { keyword: Q, ai_system_evidence: {} };
  assert.equal(ctx.merge(b2, { google_aio: VALID_NL }, Q).rejected.google_aio.reason, 'source_not_chosen');
  // A new request: evidence entry and research agree.
  const manualAi = { google_aio: '', chatgpt: VALID_NL };
  const rejected = M.screenManualAnswers(manualAi, Q, 'no_ai_overview');
  assert.deepEqual(rejected, {});
  assert.deepEqual(M.googleEvidence('', 'no_ai_overview'), { checked: false, source: 'no_ai_overview', manual: true, text: '', google_source: 'no_ai_overview' });
  assert.equal(M.googleEvidence(VALID_NL, 'ai_overview').google_source, 'ai_overview');
  const r = M.researchForRequest({ keyword: Q, language: 'Dutch', region: 'nl', manualAi, perplexityEvidenceText: '', rejected, googleSource: 'no_ai_overview' }).research;
  assert.equal(r.google_no_ai_overview, true); assert.equal(r.answers_valid, 1);
  // The browser sends the choice with the answers; draft and reopen keep it.
  assert.match(src, /manualAiEvidence:\{ai_question:String\(\(document\.getElementById\('cs-ai-question'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)\.slice\(0,200\),ai_question_source:[^,]+,google_source:String\(\(document\.getElementById\('pwbGoogleSource'\)\|\|\{\}\)\.value\|\|''\),google_aio:aioText,/);
  assert.match(src, /google_source:g\('pwbGoogleSource'\),/); assert.match(src, /set\('pwbGoogleSource',d\.google_source\|\|''\);/);
  assert.match(src, /_gsEl\.value=\(_gs==='ai_overview'\|\|_gs==='gemini'\|\|_gs==='no_ai_overview'\)\?_gs:'';/);
});

test('Complete missing only: a new Google answer replaces the old one (the google / google_aio key mismatch is fixed)', () => {
  const prev = R.makePrewriteAiAnswerResearch({ query: Q, answers: [G('TEST: oud antwoord over SEO content optimalisatie uit Gemini.', 'gemini')] });
  const newer = 'TEST: nieuw AI Overview antwoord over SEO content optimalisatie en zoekintentie.';
  const brief = { prewrite_ai_answer_research: prev, ai_system_evidence: { google_aio: { checked: true, source: 'manual', text: newer, google_source: 'ai_overview' } } };
  M.refreshAfterMissingOnly(brief, { query: Q });
  const g = brief.prewrite_ai_answer_research.observations.find(o => o.engine === 'google');
  assert.equal(g.answer_excerpt, newer); assert.equal(g.researched_system, 'Google AI Overview');
  // With no new Google text, the earlier observation is kept with its full metadata.
  const keep = { prewrite_ai_answer_research: prev, ai_system_evidence: {} };
  M.refreshAfterMissingOnly(keep, { query: Q });
  assert.equal(keep.prewrite_ai_answer_research.observations.find(o => o.engine === 'google').researched_system, 'Gemini');
});
