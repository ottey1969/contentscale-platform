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

// Research for a new Brief request: keyword, language, region code and the five answers as the handler received them.
// An empty manual Perplexity answer may have been replaced by the automatic Perplexity answer; that is labelled.
function researchForRequest({ keyword, language, region, manualAi, perplexityEvidenceText }) {
  const m = manualAi && typeof manualAi === 'object' ? manualAi : {};
  const r = research.makePrewriteAiAnswerResearch({ query: keyword, language: language, market: region, answers: [
    { engine: 'google_aio', answer: m.google_aio }, { engine: 'chatgpt', answer: m.chatgpt },
    { engine: 'perplexity', answer: perplexityEvidenceText, source: m.perplexity ? 'manual' : 'automatic fallback' },
    { engine: 'claude', answer: m.claude }, { engine: 'copilot', answer: m.copilot }] });
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
function refreshAfterMissingOnly(brief, { query, language, region } = {}) {
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
    brief.prewrite_ai_answer_research = research.preserveResearchEvidence(next, prev, ae);
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

module.exports = { ENGINE_KEYS, researchForRequest, attachToBrief, refreshAfterMissingOnly, scriptVersion, scriptTags };
