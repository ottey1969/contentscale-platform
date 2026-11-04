'use strict';
// Canonical Architecture Migration, Pre-Write Brief. The AI answer research used to be inserted into src/index.js at build
// time by scripts/patch-prewrite-ai-answer-research.cjs. It now lives in src/prewrite-brief-research.cjs and is called
// directly. These tests compare the module with the frozen legacy code (tests/fixtures/prewrite-legacy-inline-d589467.cjs)
// on the same inputs, and check that the build no longer rewrites any Pre-Write code. All answers are labelled TEST.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const R = require('../src/prewrite-ai-answer-research.cjs');
const M = require('../src/prewrite-brief-research.cjs');
const LEGACY = require('./fixtures/prewrite-legacy-inline-d589467.cjs');
const { prepare } = require('../scripts/prepare-canonical-production.cjs');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v)); // vm objects come from another realm
const clip = v => String(v || '').trim().slice(0, 12000); // the handler's _clipAi

// The legacy code for a new Brief request, run with the handler's variables.
function legacyRequest(ctx) {
  const scope = { require: m => m === './prewrite-ai-answer-research.cjs' ? R : require(m), ...ctx };
  return vm.runInNewContext('(function(){' + LEGACY.requestResearch + 'return {research:_pwbAiResearch,prompt:_pwbAiWritingPrompt};})()', scope);
}
function legacyMissingOnly(brief, ctx) {
  vm.runInNewContext(LEGACY.missingOnlyRefresh, { require: m => m === './prewrite-ai-answer-research.cjs' ? R : require(m), brief, ...ctx });
  return brief;
}
const LONG = 'TEST long ' + 'L'.repeat(20000) + ' javascript:alert(1) <img src=x onerror=alert(2)> https://ok.example/p';
const REQUESTS = {
  'five manual answers': { keyword: 'TEST content scaling', language: 'English', region: 'nl', manual: { google_aio: 'TEST google https://example.org/guide', chatgpt: 'TEST chatgpt answer', perplexity: 'TEST perplexity answer', claude: 'TEST claude answer', copilot: 'TEST copilot answer' } },
  'three answers, automatic Perplexity': { keyword: 'TEST content at scale', language: 'Dutch', region: 'be', manual: { google_aio: 'TEST google answer', chatgpt: 'TEST chatgpt answer' }, auto: 'TEST automatic perplexity https://example.org/p' },
  'no answers': { keyword: 'TEST seo', language: 'German', region: 'de', manual: {} },
  'missing keyword': { keyword: '', language: 'English', region: 'us', manual: { chatgpt: 'TEST chatgpt answer' } },
  'long answer and unsafe URLs': { keyword: 'TEST long', language: 'English', region: 'gb', manual: { claude: LONG, copilot: 'TEST <script>alert(3)</script>' } },
  'Turkish market': { keyword: 'TEST içerik ölçekleme', language: 'Turkish', region: 'tr', manual: { google_aio: 'TEST türkçe yanıt' } }
};
function handlerVars(q) {
  const manualAi = { google_aio: clip(q.manual.google_aio), chatgpt: clip(q.manual.chatgpt), perplexity: clip(q.manual.perplexity), claude: clip(q.manual.claude), copilot: clip(q.manual.copilot) };
  return { keyword: q.keyword, language: q.language, region: q.region, _manualAi: manualAi, _perplexityEvidenceText: manualAi.perplexity || clip(q.auto) };
}

test('new Brief request: the module gives the same research and prompt as the legacy inserted code', () => {
  for (const [name, q] of Object.entries(REQUESTS)) {
    const v = handlerVars(q);
    const legacy = legacyRequest(v);
    // Intended difference since the validation contract: a new Google answer names its source. The owner chose
    // "Google AI Overview" here; the legacy glue had no source, so its Google entry reads "source not recorded".
    const now = M.researchForRequest({ keyword: v.keyword, language: v.language, region: v.region, manualAi: v._manualAi, perplexityEvidenceText: v._perplexityEvidenceText, googleSource: 'ai_overview' });
    const unify = x => { const c = plain(x); const g = c.observations.find(o => o.engine === 'google'); if (g && g.checked) { g.google_source = 'unrecorded'; g.researched_system = 'Google AI Overview or Gemini (source not recorded)'; } return c; };
    assert.deepEqual(unify(now.research), plain(legacy.research), name + ': research object');
    assert.equal(now.prompt.replace(' — researched: Google AI Overview [', ' — researched: Google AI Overview or Gemini (source not recorded) ['), legacy.prompt, name + ': prompt text');
  }
  // Without a source, a new Google answer is INVALID (source not chosen) and not counted; the legacy code counted it.
  const v = handlerVars(REQUESTS['five manual answers']);
  const noSource = M.researchForRequest({ keyword: v.keyword, language: v.language, region: v.region, manualAi: v._manualAi, perplexityEvidenceText: v._perplexityEvidenceText }).research;
  assert.equal(noSource.observations.find(o => o.engine === 'google').error_reason, 'source_not_chosen');
  assert.equal(noSource.answers_valid, legacyRequest(v).research.answers_valid - 1);
});

test('saved with the Brief: same as the legacy code, also for a missing Brief', () => {
  const r = M.researchForRequest({ keyword: 'TEST x', language: 'English', region: 'nl', manualAi: {}, perplexityEvidenceText: '' }).research;
  for (const start of [{ title: 'TEST' }, null]) {
    const legacy = vm.runInNewContext('(function(){' + LEGACY.attachToBrief + 'return brief;})()', { brief: start && { ...start }, _pwbAiResearch: r });
    assert.deepEqual(plain(M.attachToBrief(start && { ...start }, r)), plain(legacy));
  }
});

test('Complete missing only: the module refreshes the saved research exactly like the legacy code', () => {
  const prev = R.makePrewriteAiAnswerResearch({ query: 'TEST content scaling', language: 'Dutch', market: 'nl', answers: [
    { engine: 'google_aio', answer: 'TEST google answer' }, { engine: 'perplexity', answer: 'TEST automatic perplexity ' + 'P'.repeat(4000), source: 'automatic fallback', sources: ['https://example.org/prior'] }] });
  const cases = {
    'two saved + three merged': { brief: { prewrite_ai_answer_research: prev, ai_system_evidence: { google_aio: { text: 'TEST google answer', checked: true }, chatgpt: { text: 'TEST chatgpt answer', checked: true }, claude: { text: 'TEST claude answer', checked: true }, copilot: { text: 'TEST copilot answer', checked: true } } }, ctx: { srcKeyword: 'TEST content scaling', requestedKeyword: '', srcReq: {}, opts: {} } },
    'merge replaces a saved answer': { brief: { prewrite_ai_answer_research: prev, ai_system_evidence: { perplexity: { text: 'TEST new manual perplexity', checked: true, source: 'manual' } } }, ctx: { srcKeyword: 'TEST content scaling', requestedKeyword: '', srcReq: {}, opts: {} } },
    'no earlier research (Brief saved before the research existed)': { brief: { ai_system_evidence: { chatgpt: { answer: 'TEST chatgpt answer', checked: true } } }, ctx: { srcKeyword: '', requestedKeyword: 'TEST keyword', srcReq: { language: 'English', region: 'us' }, opts: {} } },
    'evidence without a source label keeps the earlier label (the stored automatic Perplexity answer)': { brief: { prewrite_ai_answer_research: prev, ai_system_evidence: { perplexity: { text: 'TEST automatic perplexity as stored in the evidence', checked: true } } }, ctx: { srcKeyword: 'TEST content scaling', requestedKeyword: '', srcReq: {}, opts: {} } },
    'earlier language and market win over the request': { brief: { prewrite_ai_answer_research: prev, ai_system_evidence: { chatgpt: { text: 'TEST chatgpt answer', checked: true } } }, ctx: { srcKeyword: 'TEST content scaling', requestedKeyword: '', srcReq: { language: 'English', region: 'us' }, opts: {} } },
    'merged answer over 12,000 characters is clipped like the handler': { brief: { ai_system_evidence: { claude: { text: 'TEST ' + 'C'.repeat(13000) + ' https://late.example/after-the-clip', checked: true } } }, ctx: { srcKeyword: 'TEST q', requestedKeyword: '', srcReq: {}, opts: {} } },
    'language and market from the request options': { brief: { ai_system_evidence: {} }, ctx: { srcKeyword: 'TEST q', requestedKeyword: '', srcReq: {}, opts: { language: 'Turkish', region: 'tr' } } }
  };
  for (const [name, c] of Object.entries(cases)) {
    const a = legacyMissingOnly(structuredClone(c.brief), c.ctx);
    const b = M.refreshAfterMissingOnly(structuredClone(c.brief), { query: c.ctx.srcKeyword || c.ctx.requestedKeyword, language: c.ctx.srcReq.language || c.ctx.opts.language || '', region: c.ctx.srcReq.region || c.ctx.opts.region || '' });
    assert.deepEqual(plain(b), plain(a), name);
  }
  // Reference: the full earlier Perplexity observation and its source lead survive, all five are researched.
  const out = M.refreshAfterMissingOnly(structuredClone(cases['two saved + three merged'].brief), { query: 'TEST content scaling' }).prewrite_ai_answer_research;
  assert.equal(out.systems_researched, 5); assert.equal(out.language, 'Dutch'); assert.equal(out.market, 'nl');
  const p = out.observations.find(x => x.engine === 'perplexity');
  assert.equal(p.answer_source, 'automatic fallback'); assert.deepEqual(p.source_urls, ['https://example.org/prior']);
});

test('Complete missing only: a failure never blocks the completion (legacy swallowed it silently; the module also logs it)', () => {
  const brief = { ai_system_evidence: { get chatgpt() { throw Error('TEST broken evidence'); } } };
  const warn = console.warn; let logged = '';
  console.warn = (...a) => { logged = a.join(' '); };
  try { assert.equal(M.refreshAfterMissingOnly(brief, { query: 'TEST' }), brief); } finally { console.warn = warn; }
  assert.match(logged, /research refresh after missing-only completion failed: TEST broken evidence/);
  assert.equal(brief.prewrite_ai_answer_research, undefined);
  assert.doesNotThrow(() => legacyMissingOnly({ ai_system_evidence: { get chatgpt() { throw Error('x'); } } }, { srcKeyword: 'TEST', requestedKeyword: '', srcReq: {}, opts: {} }));
});

test('script tags: content-versioned, same format as the legacy build tags, version follows the public files', () => {
  const v = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../public/prewrite-ai-answer-research.js'))).update(fs.readFileSync(path.join(__dirname, '../public/prewrite-research-tab.js'))).digest('hex').slice(0, 12);
  assert.equal(M.scriptVersion(), v);
  assert.equal(M.scriptTags(), '<script defer src="/prewrite-ai-answer-research.js?v=' + v + '"></script>\n<script defer src="/prewrite-research-tab.js?v=' + v + '"></script>\n');
});

test('a missing public script never stops the server from starting: logged, tab left out', () => {
  const fsMod = require('node:fs'), read = fsMod.readFileSync, err = console.error; let logged = '';
  delete require.cache[require.resolve('../src/prewrite-brief-research.cjs')];
  const fresh = require('../src/prewrite-brief-research.cjs');
  fsMod.readFileSync = function (f, ...a) { if (String(f).endsWith('prewrite-research-tab.js')) throw Object.assign(Error('ENOENT TEST'), { code: 'ENOENT' }); return read.call(this, f, ...a); };
  console.error = (...a) => { logged = a.join(' '); };
  try { assert.equal(fresh.scriptTags(), ''); } finally { fsMod.readFileSync = read; console.error = err; delete require.cache[require.resolve('../src/prewrite-brief-research.cjs')]; }
  assert.match(logged, /Research Prompt tab scripts not found/);
});

test('src/index.js calls the module directly and holds the final Pre-Write text; no Pre-Write code is inserted at build time', () => {
  const once = (s, needle, what) => assert.equal(s.split(needle).length - 1, 1, what + ' appears exactly once');
  once(SRC, "const _prewriteBriefResearch = require('./prewrite-brief-research.cjs');", 'module require');
  once(SRC, 'const {research:_pwbAiResearch,prompt:_pwbAiWritingPrompt}=_prewriteBriefResearch.researchForRequest({keyword,language,region,manualAi:_manualAi,perplexityEvidenceText:_perplexityEvidenceText,rejected:_manualAiRejected,googleSource:_manualAiGoogleSource});', 'request research');
  once(SRC, 'const _manualAiRejected=_prewriteBriefResearch.screenManualAnswers(_manualAi,keyword,_manualAiGoogleSource);', 'answers screened before anything uses them');
  once(SRC, '_prewriteBriefResearch.attachToBrief(brief,_pwbAiResearch);', 'saved with the Brief');
  once(SRC, "_prewriteBriefResearch.refreshAfterMissingOnly(brief,{query:srcKeyword||requestedKeyword,language:srcReq.language||opts.language||'',region:srcReq.region||opts.region||'',rejected:_aiMerge.rejected});", 'missing-only refresh');
  once(SRC, '${_prewriteBriefResearch.scriptTags()}</head>', 'script tags');
  assert.doesNotMatch(SRC, /require\('\.\/prewrite-ai-answer-research\.cjs'\)/, 'no inline copy of the research code');
  // Order: the module is required before the Tracker page template is evaluated; the tags are in the page that holds the modal.
  const tpl = SRC.indexOf('const _CLIENT_TRACKER_HTML = `');
  assert.ok(SRC.indexOf('const _prewriteBriefResearch = require') < tpl);
  const page = SRC.slice(tpl);
  assert.ok(page.indexOf('${_prewriteBriefResearch.scriptTags()}') < page.indexOf('id="prewriteBriefModal"'));
  // The missing-only refresh runs right after the merge, before readiness is measured again.
  const merge = SRC.indexOf('const _aiMerge=_pwbMergeManualAiEvidenceV506(');
  assert.ok(merge > 0 && SRC.indexOf('_prewriteBriefResearch.refreshAfterMissingOnly(', merge) - merge < 200);
  // Every text the build used to write is now in the source, once, and the old text is gone.
  // (One entry is code, not text: saving the research with the Brief. That is now the attachToBrief call checked above.
  // The counter text "st.count+' / 5 AI answers researched'" is superseded by the counter of the validation contract.)
  for (const [oldText, newText] of LEGACY.textChanges.filter(([, n]) => !n.includes('brief.prewrite_ai_answer_research=_pwbAiResearch') && n !== "st.count+' / 5 AI answers researched'")) {
    assert.ok(SRC.includes(newText), 'final text present: ' + newText.slice(0, 70));
    if (!newText.includes(oldText)) assert.ok(!SRC.includes(oldText), 'old text gone: ' + oldText.slice(0, 70));
  }
  // The build does not touch the Pre-Write research: every line with it is identical in source and build.
  const built = prepare(SRC);
  assert.equal(prepare(built), built, 'idempotent build');
  const key = /_prewriteBriefResearch|_pwbAiWritingPrompt|_pwbAiResearch|prewrite_ai_answer_research|prewrite-research-tab|AI Answer Research/;
  assert.deepEqual(built.split('\n').filter(l => key.test(l)), SRC.split('\n').filter(l => key.test(l)));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../scripts/prepare-canonical-production.cjs'), 'utf8'), /patch-prewrite-ai-answer-research/);
  assert.equal(fs.existsSync(path.join(__dirname, '../scripts/patch-prewrite-ai-answer-research.cjs')), false, 'the build patch is removed');
});

test('the 6 MB server compiles and the Tracker page template renders the versioned tags', () => {
  const os = require('node:os'), cp = require('node:child_process');
  const built = prepare(SRC);
  const temp = path.join(os.tmpdir(), 'prewrite-migration-' + process.pid + '.js');
  fs.writeFileSync(temp, built);
  try { const check = cp.spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' }); assert.equal(check.status, 0, String(check.stderr || '').slice(0, 2200)); } finally { fs.unlinkSync(temp); }
  // Evaluate the head of the real template with the module, as the server does when it starts.
  const tpl = built.indexOf('const _CLIENT_TRACKER_HTML = `'), head = built.slice(tpl + 'const _CLIENT_TRACKER_HTML = '.length, built.indexOf('</head>', tpl) + '</head>'.length) + '`';
  const html = vm.runInNewContext(head, { _prewriteBriefResearch: M });
  const tags = html.match(/<script defer src="\/prewrite-(?:ai-answer-research|research-tab)\.js\?v=[0-9a-f]{12}"><\/script>/g) || [];
  assert.deepEqual(tags.map(t => t.match(/prewrite-[a-z-]+\.js/)[0]), ['prewrite-ai-answer-research.js', 'prewrite-research-tab.js']);
  assert.ok(tags.every(t => t.includes('?v=' + M.scriptVersion())));
});
