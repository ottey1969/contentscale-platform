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
  // VALIDATION CONTRACT. An answer counts as researched only when it is an actual answer to the target query. Rejected:
  // the research instructions (or an AI's reply to them) pasted back as an answer, field placeholders, the query alone,
  // fewer than three words, and text that shares no word with the query. Deterministic, the same in browser and server,
  // and independent of industry, market or language. A rejected answer is never evidence and never counted.
  var ECHO_MARKERS = [OBJECTIVE.toLowerCase(), 'this is not citation tracking', 'target query:', 'ai answers researched:',
    'do not invent results', 'observed answer (unverified)', 'candidate source urls (not verified)', 'editorial requirements:',
    'produce: direct_answer', 'source_verification_tasks', 'fact_check_before_publishing', 'distinctive_expert_insights',
    'pre-publication', 'manual input is primary', 'never simulate another ai system', 'return only compact valid json',
    'do not claim that any answer or source establishes', 'research the five answers to the target query'];
  var PLACEHOLDERS = [/^paste the (actual|real)\b/i, /^\[?target query\b/i, /^(n\/?a|none|not checked|todo|tbd|-+|\.+|\?+)$/i, /lorem ipsum/i];
  var REASONS = {
    prompt_echo: 'This is the research instruction (or a reply to it), not an answer to the search query. Ask the AI system the search query itself and paste its answer.',
    placeholder: 'This is a placeholder, not an AI answer.',
    query_only: 'This is only the search query, not the answer to it.',
    too_short: 'Too short to be an AI answer (fewer than three words).',
    not_about_query: 'This text shares no word with the search query; it does not look like an answer to it.'
  };
  function fold(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function words(s) { return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
  function validateAnswer(answer, query) {
    var a = cleanText(answer);
    if (!a) return { valid: false, status: 'not_checked', reason: null, message: null };
    var low = a.toLowerCase(), hits = ECHO_MARKERS.filter(function (m) { return low.indexOf(m) >= 0; }).length;
    var reason = null;
    if (hits >= 2 || low.indexOf(OBJECTIVE.toLowerCase()) >= 0 || low.indexOf(MISSION.toLowerCase().slice(0, 60)) >= 0) reason = 'prompt_echo';
    else if (PLACEHOLDERS.some(function (re) { return re.test(a); })) reason = 'placeholder';
    else if (query && words(a).join(' ') === words(query).join(' ')) reason = 'query_only';
    else if (words(a).length < 3) reason = 'too_short';
    else if (query) {
      var qt = words(query).filter(function (w) { return w.length >= 3; }), text = words(a).join(' ');
      // A shared word or word stem (first six letters: "optimalisatie" matches "optimaliseren").
      if (qt.length && !qt.some(function (w) { return text.indexOf(w.slice(0, 6)) >= 0; })) reason = 'not_about_query';
    }
    return reason ? { valid: false, status: 'invalid', reason: reason, message: REASONS[reason] } : { valid: true, status: 'valid', reason: null, message: null };
  }
  // query: the target keyword; language and market (region) are the Pre-Write Brief settings for that keyword.
  function makePrewriteAiAnswerResearch(input) {
    input = input || {};
    var q = cleanText(input.query, 350), language = cleanText(input.language, 60), market = cleanText(input.market || input.region, 80);
    var inputs = Array.isArray(input.answers) ? input.answers : [];
    var byEngine = {};
    inputs.forEach(function (raw) { var n = normalizeAnswer(raw); if (n && n.answer) byEngine[n.engine] = n; });
    var observations = ENGINES.map(function (e) {
      var found = byEngine[e.id], check = found ? validateAnswer(found.answer, q) : { status: 'not_checked', reason: null, message: null };
      var row = check.status === 'valid' ? found : null;
      return { engine: e.id, label: e.label, checked: !!row, answer_source: row ? row.source : found ? found.source : 'not_checked',
        target_query: q || null, language: language || null, market: market || null,
        observation_method: found ? found.source : null, observed_at: found ? found.checked_at : null,
        validation_status: check.status, error_reason: check.reason, error_message: check.message,
        rejected_preview: found && !row ? found.answer.slice(0, 160) : null,
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
      contract: 'prewrite_ai_answer_research_v3', query: q, language: language || null, market: market || null,
      mode: 'pre_publication_answer_research', objective: OBJECTIVE, purpose: MISSION,
      systems_total: ENGINES.length, systems_researched: checked.length,
      research_complete: checked.length === ENGINES.length,
      missing_systems: observations.filter(function (x) { return !x.checked; }).map(function (x) { return x.label; }),
      invalid_systems: observations.filter(function (x) { return x.validation_status === 'invalid'; }).map(function (x) { return { label: x.label, reason: x.error_reason }; }),
      observations: observations, source_candidates: uniq([].concat.apply([], checked.map(function (x) { return x.source_urls; }))),
      verified_sources: [], // Only independent provenance verification may populate this.
      writing_instructions: instructions,
      required_brief_outputs: ['direct_answer', 'missing_questions', 'factual_gaps', 'important_entities', 'source_verification_tasks',
        'distinctive_expert_insights', 'proposed_outline', 'original_examples', 'limitations', 'fact_check_before_publishing'],
      citation_tracking: { performed: false, reason: 'Citation/mention monitoring belongs to the Free AI Citations Tracker.' },
      readiness: !q ? 'TARGET_QUERY_MISSING' : checked.length ? (checked.length === ENGINES.length ? 'RESEARCH_COMPLETE_VERIFY_SOURCES' : 'RESEARCH_PARTIAL_VERIFY_SOURCES') : 'RESEARCH_NOT_CAPTURED'
    };
  }
  function recount(r) {
    var checked = r.observations.filter(function (o) { return o.checked; });
    r.systems_researched = checked.length;
    r.research_complete = checked.length === r.systems_total;
    r.missing_systems = r.observations.filter(function (o) { return !o.checked; }).map(function (o) { return o.label; });
    r.invalid_systems = r.observations.filter(function (o) { return o.validation_status === 'invalid'; }).map(function (o) { return { label: o.label, reason: o.error_reason }; });
    r.source_candidates = uniq([].concat.apply([], checked.map(function (o) { return Array.isArray(o.source_urls) ? o.source_urls : []; })));
    r.readiness = !r.query ? 'TARGET_QUERY_MISSING' : checked.length ?
      (r.research_complete ? 'RESEARCH_COMPLETE_VERIFY_SOURCES' : 'RESEARCH_PARTIAL_VERIFY_SOURCES') : 'RESEARCH_NOT_CAPTURED';
    return r;
  }
  // Research saved before the validation contract (v1/v2) may hold a prompt echo counted as an answer. Check every
  // counted observation again against its query; an invalid one is shown as INVALID and no longer counted. Returns a copy.
  function revalidate(research) {
    if (!research || !Array.isArray(research.observations)) return research;
    var r = JSON.parse(JSON.stringify(research));
    r.observations = r.observations.map(function (o) {
      // v3 observations were validated on the full answer when they were made; only older ones are checked again.
      if (!o || !o.checked || o.validation_status === 'valid') return o;
      var v = validateAnswer(o.answer_excerpt || '', r.query);
      if (v.valid) return Object.assign({ validation_status: 'valid', error_reason: null, error_message: null }, o, { validation_status: 'valid' });
      return Object.assign({}, o, { checked: false, validation_status: 'invalid', error_reason: v.reason, error_message: v.message,
        rejected_preview: String(o.answer_excerpt || '').slice(0, 160), answer_excerpt: null, answer_truncated: false, source_urls: [],
        editorial_use: 'Invalid: not an answer to the target query. Never use it as evidence; ask the AI system the query itself.' });
    });
    return recount(r);
  }
  // "Complete missing only" must not downgrade an older checked observation to a
  // 2,800-character excerpt or discard its independently captured source leads.
  // Keep the previous observation if the completion evidence has no full answer.
  function preserveResearchEvidence(current, previous, mergedEvidence) {
    if (!current || !Array.isArray(current.observations) || !previous || !Array.isArray(previous.observations)) return current;
    previous = revalidate(previous);
    var evidence = mergedEvidence && typeof mergedEvidence === 'object' ? mergedEvidence : {};
    var oldByEngine = {};
    previous.observations.forEach(function (o) { if (o && o.checked) oldByEngine[o.engine] = o; });
    current.observations = current.observations.map(function (o) {
      var old = oldByEngine[o.engine];
      if (!old) return o;
      var e = evidence[o.engine] || {};
      var full = typeof e === 'string' ? e : e.text || e.answer || '';
      // Only carry the original observation when no replacement answer exists.
      if (typeof full !== 'string' || !full.trim()) {
        return Object.assign({}, old, {engine: o.engine, label: o.label, checked: true});
      }
      return o;
    });
    return recount(current);
  }
  function buildPrewriteResearchPrompt(research) {
    if (!research || !/^prewrite_ai_answer_research_v[123]$/.test(research.contract)) throw Error('invalid_prewrite_ai_answer_research');
    research = revalidate(research);
    var missing = research.observations.filter(function (x) { return !x.checked && x.validation_status !== 'invalid'; }).map(function (x) { return x.label; });
    var invalid = research.observations.filter(function (x) { return x.validation_status === 'invalid'; });
    return [
      (research.objective || OBJECTIVE).toUpperCase() + '. This is NOT citation tracking.',
      research.purpose && research.contract !== 'prewrite_ai_answer_research_v1' ? research.purpose : null,
      'Target query: ' + (research.query || 'MISSING — enter the target keyword before writing'),
      research.contract !== 'prewrite_ai_answer_research_v1' ? 'Language: ' + (research.language || 'not set') + ' · Market: ' + (research.market || 'not set') : null,
      'AI answers researched: ' + research.systems_researched + '/' + research.systems_total + (missing.length || invalid.length ? ' (' + [missing.length ? 'not checked: ' + missing.join(', ') : '', invalid.length ? 'invalid: ' + invalid.map(function (x) { return x.label; }).join(', ') : ''].filter(Boolean).join('; ') + ')' : ''),
      research.observations.map(function (x) {
        return x.checked
          ? 'SYSTEM: ' + x.label + (x.answer_source && x.answer_source !== 'manual' ? ' [' + x.answer_source + ']' : '') + '\nObserved answer (unverified): ' + x.answer_excerpt + (x.answer_truncated ? ' […]' : '') +
            '\nCandidate source URLs (NOT verified): ' + (x.source_urls.join(', ') || 'none')
          : x.validation_status === 'invalid'
            ? 'SYSTEM: ' + x.label + ' — INVALID (' + String(x.error_reason || 'not an answer').replace(/_/g, ' ') + '): the submitted text is not an answer to the target query and is not evidence. Treat this system as NOT CHECKED. Do not invent results.'
            : 'SYSTEM: ' + x.label + ' — NOT CHECKED. Do not invent results.';
      }).join('\n\n'),
      'EDITORIAL REQUIREMENTS:\n' + research.writing_instructions.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'),
      'Produce: ' + research.required_brief_outputs.join(', '),
      'Do not claim that any answer or source establishes that the target domain is cited.'
    ].filter(function (x) { return x != null; }).join('\n\n');
  }
  return { ENGINES: ENGINES, OBJECTIVE: OBJECTIVE, MISSION: MISSION, normalizeAnswer: normalizeAnswer, validateAnswer: validateAnswer, revalidate: revalidate,
    makePrewriteAiAnswerResearch: makePrewriteAiAnswerResearch, preserveResearchEvidence: preserveResearchEvidence, buildPrewriteResearchPrompt: buildPrewriteResearchPrompt };
});
