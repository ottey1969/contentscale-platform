/* Pre-Write Brief — AI Answer Research: ONE authoritative implementation.
 * The server (src/prewrite-ai-answer-research.cjs → this file) builds the research prompt that the Pre-Write Brief
 * generator consumes; the Research Prompt tab in the browser loads this same file and calls the same functions with
 * the same inputs, so the prompt shown is the prompt used. Research answers, not rank/mention/citation monitoring.
 * An answer is an untrusted observation: it may inform an editorial hypothesis, but neither an AI-generated assertion
 * nor a URL automatically becomes a fact. Missing answers stay NOT CHECKED; nothing is invented.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrewriteAiAnswerResearch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ENGINES = Object.freeze([
    { id: 'google', label: 'Google AI Overviews / Gemini' },
    { id: 'chatgpt', label: 'ChatGPT Search' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'claude', label: 'Claude' },
    { id: 'copilot', label: 'Microsoft Copilot' }
  ]);
  var ALIASES = { aio: 'google', gemini: 'google', google_aio: 'google', google_ai: 'google', chatgpt_search: 'chatgpt', microsoft_copilot: 'copilot' };
  var MAX_ANSWER = 16000, EXCERPT = 2800;
  var OBJECTIVE = 'AI Answer Research — Write for Citation Potential';
  var MISSION = 'Research the five answers to the target query. Identify factual gaps, useful explanations, unanswered questions, original source leads and opportunities for a clearer, better-supported answer. Use this research to produce original, accurate and useful content with stronger potential for AI citation.';
  function cleanText(v, n) { return typeof v === 'string' ? v.trim().slice(0, n == null ? MAX_ANSWER : n) : ''; }
  function cleanUrl(value) {
    if (typeof value !== 'string') return null;
    try { var u = new URL(value.trim()); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : null; } catch (e) { return null; }
  }
  function uniq(list) { var out = []; list.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); return out; }
  function normalizeAnswer(row) {
    var raw = cleanText(row && (row.engine || row.system || row.id), 60).toLowerCase().replace(/[\s-]+/g, '_');
    var engine = ALIASES[raw] || raw;
    if (!ENGINES.some(function (x) { return x.id === engine; })) return null;
    var answer = cleanText(row && (row.answer || row.text || row.response));
    var declared = Array.isArray(row && (row.sources || row.citations)) ? (row.sources || row.citations) : [];
    var observed = answer.match(/https?:\/\/[^\s<>\]\[()"'`]+/gi) || [];
    var citations = uniq(declared.map(function (x) { return typeof x === 'string' ? x : x && x.url; }).concat(observed).map(cleanUrl).filter(Boolean)).slice(0, 30);
    var source = cleanText(row && row.source, 40) || 'manual';
    return { engine: engine, answer: answer, citations: citations, source: source, checked_at: cleanText(row && (row.checked_at || row.checkedAt), 50) || null };
  }
  // query: the target keyword; language and market (region) are the Pre-Write Brief settings for that keyword.
  function makePrewriteAiAnswerResearch(input) {
    input = input || {};
    var q = cleanText(input.query, 350), language = cleanText(input.language, 60), market = cleanText(input.market || input.region, 80);
    var inputs = Array.isArray(input.answers) ? input.answers : [];
    var byEngine = {};
    inputs.forEach(function (raw) { var n = normalizeAnswer(raw); if (n && n.answer) byEngine[n.engine] = n; });
    var observations = ENGINES.map(function (e) {
      var row = byEngine[e.id];
      return { engine: e.id, label: e.label, checked: !!row, answer_source: row ? row.source : 'not_checked',
        answer_excerpt: row ? row.answer.slice(0, EXCERPT) : null, answer_truncated: !!(row && row.answer.length > EXCERPT),
        source_urls: row ? row.citations : [], source_verification: 'not_verified',
        editorial_use: row ? 'Review how this answer frames the query, identify missing qualifications, verify every material claim against independent original sources, and write a distinct useful explanation.' : 'Not checked: never infer an answer, citation, or gap.' };
    });
    var checked = observations.filter(function (x) { return x.checked; });
    var instructions = [
      'This research is PRE-PUBLICATION editorial input, not a check whether this website is cited.',
      'Compare the actual answers to the same target query; identify differing explanations, factual gaps, unanswered questions and unsupported assertions.',
      'Recognise the important entities (organisations, standards, products, places, people) the answers rely on, and which of them the brief must explain.',
      'Use source URLs as leads only. Fetch and verify original material before citing, quoting or presenting a statement as fact.',
      'Create a direct accurate answer, supporting context, genuine expert insight if supplied, and reader-focused examples; do not copy AI answers.',
      'Separate verifiable evidence from hypotheses and unknowns. Missing systems are explicitly incomplete: do not fill them in.',
      'Write in ' + (language || 'the language of the brief') + ' for readers in ' + (market || 'the brief\'s target market') + '; use facts, units and examples that hold there.',
      'Never promise fast AI citation, ranking, traffic or revenue. Publishing does not guarantee that any AI system cites the page.',
      'Keep the brief aligned with the page intent and avoid creating duplicate pages or cannibalizing existing URLs.'
    ];
    return {
      contract: 'prewrite_ai_answer_research_v2', query: q, language: language || null, market: market || null,
      mode: 'pre_publication_answer_research', objective: OBJECTIVE, purpose: MISSION,
      systems_total: ENGINES.length, systems_researched: checked.length,
      research_complete: checked.length === ENGINES.length,
      missing_systems: observations.filter(function (x) { return !x.checked; }).map(function (x) { return x.label; }),
      observations: observations, source_candidates: uniq([].concat.apply([], checked.map(function (x) { return x.source_urls; }))),
      verified_sources: [], // Only independent provenance verification may populate this.
      writing_instructions: instructions,
      required_brief_outputs: ['direct_answer', 'missing_questions', 'factual_gaps', 'important_entities', 'source_verification_tasks',
        'distinctive_expert_insights', 'proposed_outline', 'original_examples', 'limitations', 'fact_check_before_publishing'],
      citation_tracking: { performed: false, reason: 'Citation/mention monitoring belongs to the Free AI Citations Tracker.' },
      readiness: !q ? 'TARGET_QUERY_MISSING' : checked.length ? (checked.length === ENGINES.length ? 'RESEARCH_COMPLETE_VERIFY_SOURCES' : 'RESEARCH_PARTIAL_VERIFY_SOURCES') : 'RESEARCH_NOT_CAPTURED'
    };
  }
  function buildPrewriteResearchPrompt(research) {
    if (!research || !/^prewrite_ai_answer_research_v[12]$/.test(research.contract)) throw Error('invalid_prewrite_ai_answer_research');
    var missing = research.observations.filter(function (x) { return !x.checked; }).map(function (x) { return x.label; });
    return [
      (research.objective || OBJECTIVE).toUpperCase() + '. This is NOT citation tracking.',
      research.purpose && research.contract !== 'prewrite_ai_answer_research_v1' ? research.purpose : null,
      'Target query: ' + (research.query || 'MISSING — enter the target keyword before writing'),
      research.contract !== 'prewrite_ai_answer_research_v1' ? 'Language: ' + (research.language || 'not set') + ' · Market: ' + (research.market || 'not set') : null,
      'AI answers researched: ' + research.systems_researched + '/' + research.systems_total + (missing.length ? ' (not checked: ' + missing.join(', ') + ')' : ''),
      research.observations.map(function (x) {
        return x.checked
          ? 'SYSTEM: ' + x.label + (x.answer_source && x.answer_source !== 'manual' ? ' [' + x.answer_source + ']' : '') + '\nObserved answer (unverified): ' + x.answer_excerpt + (x.answer_truncated ? ' […]' : '') +
            '\nCandidate source URLs (NOT verified): ' + (x.source_urls.join(', ') || 'none')
          : 'SYSTEM: ' + x.label + ' — NOT CHECKED. Do not invent results.';
      }).join('\n\n'),
      'EDITORIAL REQUIREMENTS:\n' + research.writing_instructions.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'),
      'Produce: ' + research.required_brief_outputs.join(', '),
      'Do not claim that any answer or source establishes that the target domain is cited.'
    ].filter(function (x) { return x != null; }).join('\n\n');
  }
  return { ENGINES: ENGINES, OBJECTIVE: OBJECTIVE, MISSION: MISSION, normalizeAnswer: normalizeAnswer,
    makePrewriteAiAnswerResearch: makePrewriteAiAnswerResearch, buildPrewriteResearchPrompt: buildPrewriteResearchPrompt };
});
