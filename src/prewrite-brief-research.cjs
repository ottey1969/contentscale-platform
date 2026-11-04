'use strict';
// Pre-Write Brief: server side of the AI answer research. src/index.js calls these functions directly; nothing is
// inserted into the server code at build time. The research and the prompt are built by
// public/prewrite-ai-answer-research.js, the same file the Research Prompt tab runs in the browser, so the prompt the
// owner sees is the prompt the generator uses.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const research = require('./prewrite-ai-answer-research.cjs');

const ENGINE_KEYS = ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot'];
const CLIP = 12000; // the request handler's _clipAi limit for each answer
const PUBLIC_SCRIPTS = ['prewrite-ai-answer-research.js', 'prewrite-research-tab.js'];

// Validation contract (public/prewrite-ai-answer-research.js validateAnswer): only an actual answer to the keyword is
// evidence. Invalid answers are blanked in the handler's answer map, so nothing downstream (the generation prompt,
// ai_system_evidence, the 5/5 gate) can count or use them, and they are returned so the research can report them.
function screenManualAnswers(manualAi, query) {
  const rejected = {};
  if (!manualAi || typeof manualAi !== 'object') return rejected;
  for (const k of ENGINE_KEYS) {
    const v = String(manualAi[k] || '').trim();
    if (!v) continue;
    const check = research.validateAnswer(v, query);
    if (!check.valid) { rejected[k] = { answer: v, reason: check.reason, message: check.message }; manualAi[k] = ''; }
  }
  if (Object.keys(rejected).length) console.warn('[prewrite] AI answers rejected for "' + String(query || '').slice(0, 80) + '":', Object.entries(rejected).map(([k, x]) => k + '=' + x.reason).join(', '));
  return rejected;
}
function validateAnswer(answer, query) { return research.validateAnswer(answer, query); }
function isValidAnswer(answer, query) { return research.validateAnswer(answer, query).valid; }

// Research for a new Brief request: keyword, language, region code and the five answers as the handler received them
// (after screening). An empty manual Perplexity answer may have been replaced by the automatic Perplexity answer; that
// is labelled. A rejected answer is passed on as submitted, so the research records it as INVALID with the reason.
function researchForRequest({ keyword, language, region, manualAi, perplexityEvidenceText, rejected }) {
  const m = manualAi && typeof manualAi === 'object' ? manualAi : {}, bad = rejected && typeof rejected === 'object' ? rejected : {};
  const pick = k => m[k] || (bad[k] && bad[k].answer) || '';
  const px = perplexityEvidenceText || (bad.perplexity && bad.perplexity.answer) || '';
  const r = research.makePrewriteAiAnswerResearch({ query: keyword, language: language, market: region, answers: [
    { engine: 'google_aio', answer: pick('google_aio') }, { engine: 'chatgpt', answer: pick('chatgpt') },
    { engine: 'perplexity', answer: px, source: m.perplexity || (!perplexityEvidenceText && bad.perplexity) ? 'manual' : 'automatic fallback' },
    { engine: 'claude', answer: pick('claude') }, { engine: 'copilot', answer: pick('copilot') }] });
  return { research: r, prompt: research.buildPrewriteResearchPrompt(r) };
}

// The research is saved with the Brief (brief_json), so a reopened Brief shows the prompt that was used.
function attachToBrief(brief, r) {
  if (brief && typeof brief === 'object') brief.prewrite_ai_answer_research = r;
  return brief;
}

// "Complete missing only" merges new answers into brief.ai_system_evidence. Rebuild the saved research from that merged
// evidence so the Brief and the tab do not show a stale prompt. Language and market of the earlier research win; an
// earlier answer that the merge did not replace is kept with its full text, source label and source leads.
function refreshAfterMissingOnly(brief, { query, language, region, rejected } = {}) {
  if (!brief || typeof brief !== 'object') return brief;
  try {
    const ae = brief.ai_system_evidence || {}, prev = brief.prewrite_ai_answer_research || {};
    const text = k => String(ae[k] && (ae[k].text || ae[k].answer) || '').trim();
    const prevObs = Array.isArray(prev.observations) ? prev.observations : [];
    const next = research.makePrewriteAiAnswerResearch({ query: query, language: prev.language || language || '', market: prev.market || region || '',
      answers: ENGINE_KEYS.map(k => {
        const old = prevObs.find(x => x && x.engine === k && x.checked) || null, a = text(k);
        return a ? { engine: k, answer: a.slice(0, CLIP), source: ae[k] && ae[k].source || (old && old.answer_source) || undefined }
          : { engine: k, answer: old && old.answer_excerpt || '', source: old && old.answer_source || undefined };
      }) });
    const out = research.preserveResearchEvidence(next, prev, ae);
    // An answer rejected in this completion is recorded as INVALID where nothing valid replaced it.
    const bad = rejected && typeof rejected === 'object' ? rejected : {};
    const label = { google_aio: 'google' };
    out.observations = out.observations.map(o => {
      const k = Object.keys(bad).find(x => (label[x] || x) === o.engine);
      if (!k || o.checked) return o;
      return Object.assign({}, o, { validation_status: 'invalid', error_reason: bad[k].reason, error_message: bad[k].message, rejected_preview: bad[k].answer.slice(0, 160), answer_source: 'manual', observation_method: 'manual',
        editorial_use: 'Invalid: not an answer to the target query. Never use it as evidence; ask the AI system the query itself.' });
    });
    out.invalid_systems = out.observations.filter(o => o.validation_status === 'invalid').map(o => ({ label: o.label, reason: o.error_reason }));
    brief.prewrite_ai_answer_research = out;
  } catch (e) {
    // The saved research is a view on the evidence; a failure here must not block the completion itself.
    console.warn('[prewrite] research refresh after missing-only completion failed:', e && e.message);
  }
  return brief;
}

// Script tags for the Tracker page head. public/ is served with a one-year cache, so each URL carries a content
// version: a changed prompt builder or tab reaches returning browsers. Computed once, when the server starts.
let _tags = null;
function scriptVersion() {
  const h = crypto.createHash('sha256');
  for (const f of PUBLIC_SCRIPTS) h.update(fs.readFileSync(path.join(__dirname, '..', 'public', f)));
  return h.digest('hex').slice(0, 12);
}
// The Tracker page is built when src/index.js loads. A missing script file must not stop the whole platform from
// starting: it is logged loudly and only the Research Prompt tab is left out (the five answer fields keep working).
function scriptTags() {
  if (_tags == null) {
    try {
      const v = scriptVersion();
      _tags = PUBLIC_SCRIPTS.map(f => '<script defer src="/' + f + '?v=' + v + '"></script>\n').join('');
    } catch (e) {
      console.error('[prewrite] Research Prompt tab scripts not found in public/; the tab is not loaded:', e && e.message);
      _tags = '';
    }
  }
  return _tags;
}

module.exports = { ENGINE_KEYS, validateAnswer, screenManualAnswers, isValidAnswer, researchForRequest, attachToBrief, refreshAfterMissingOnly, scriptVersion, scriptTags };
