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
  // Google field: the owner states which Google surface was researched. "No AI Overview shown" is a checked observation
  // of absence: it is not an AI answer and not a failed Gemini answer. Research saved before this choice existed is
  // "unrecorded" and keeps counting as it did.
  var GOOGLE_SOURCES = { ai_overview: 'Google AI Overview', gemini: 'Gemini', no_ai_overview: 'No AI Overview shown' };
  function googleSource(v) { var s = cleanText(v, 30).toLowerCase().replace(/[\s-]+/g, '_'); return GOOGLE_SOURCES[s] ? s : ''; }
  function normalizeAnswer(row) {
    var raw = cleanText(row && (row.engine || row.system || row.id), 60).toLowerCase().replace(/[\s-]+/g, '_');
    var engine = ALIASES[raw] || raw;
    if (!ENGINES.some(function (x) { return x.id === engine; })) return null;
    var answer = cleanText(row && (row.answer || row.text || row.response));
    var declared = Array.isArray(row && (row.sources || row.citations)) ? (row.sources || row.citations) : [];
    var observed = answer.match(/https?:\/\/[^\s<>\]\[()"'`]+/gi) || [];
    var citations = uniq(declared.map(function (x) { return typeof x === 'string' ? x : x && x.url; }).concat(observed).map(cleanUrl).filter(Boolean)).slice(0, 30);
    var source = cleanText(row && row.source, 40) || 'manual';
    return { engine: engine, answer: answer, citations: citations, source: source, checked_at: cleanText(row && (row.checked_at || row.checkedAt), 50) || null,
      google_source: engine === 'google' ? googleSource(row && row.google_source) : '' };
  }
  // Provenance: a pasted answer is an owner observation whose origin cannot be verified; only an answer fetched through
  // an API (the automatic Perplexity fallback) has a known origin. Content validity never upgrades provenance.
  function provenanceOf(source) { return /automatic|api/i.test(String(source || '')) ? 'automatic_api' : 'manual_paste_unverified'; }
  // VALIDATION CONTRACT. An answer counts only when it is an actual answer. Rejected (INVALID, never evidence, never
  // counted): the research instructions or an AI reply to them, field placeholders, the query alone, fewer than three
  // words. Not rejected: an answer that uses other words (synonyms) than the query. Sharing no word with the query only
  // raises a visible warning, because no deterministic check can know every synonym in every language.
  var ECHO_MARKERS = [OBJECTIVE.toLowerCase(), 'this is not citation tracking', 'target query:', 'ai answers researched:',
    'do not invent results', 'observed answer (unverified)', 'candidate source urls (not verified)', 'editorial requirements:',
    'produce: direct_answer', 'source_verification_tasks', 'fact_check_before_publishing', 'distinctive_expert_insights',
    'pre-publication', 'manual input is primary', 'never simulate another ai system', 'return only compact valid json',
    'do not claim that any answer or source establishes', 'research the five answers to the target query'];
  // Context contamination: the answer names ContentScale's own workflow, so it was written in a conversation that knew
  // the task (a chat with memory or earlier context), not as a neutral answer to the search query. Product terms only;
  // they appear in that form whatever the language of the answer.
  var CONTEXT_MARKERS = ['pre-write brief', 'prewrite brief', 'pre-write-brief', 'ai answer inputs', 'copy search question', 'answer inputs-veld', 'answer inputs field'];
  // A workflow term that is part of the search query itself (someone researching "pre-write brief") is not contamination.
  function markerReason(low, query) {
    var ql = fold(query || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    var hits = ECHO_MARKERS.filter(function (m) { return low.indexOf(m) >= 0; }).length;
    if (hits >= 2 || low.indexOf(OBJECTIVE.toLowerCase()) >= 0 || low.indexOf(MISSION.toLowerCase().slice(0, 60)) >= 0) return 'prompt_echo';
    if (CONTEXT_MARKERS.some(function (m) { return low.indexOf(m) >= 0 && (!ql || ql.indexOf(fold(m).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()) < 0); })) return 'context_contaminated';
    return null;
  }
  var PLACEHOLDERS = [/^paste the (actual|real)\b/i, /^\[?\s*(?:paste(?:\s+(?:the|your|complete))?\s+answer(?:\s+here)?|insert\s+answer(?:\s+here)?)\s*\]?$/i, /^\[?target query\b/i, /^(n\/?a|none|not checked|todo|tbd|-+|\.+|\?+)$/i, /lorem ipsum/i];
  var REASONS = {
    prompt_echo: 'This is the research instruction (or a reply to it), not an answer to the search query. Ask the AI system the search query itself and paste its answer.',
    placeholder: 'This is a placeholder, not an AI answer.',
    query_only: 'This is only the search query, not the answer to it.',
    too_short: 'Too short to be an AI answer (fewer than three words).',
    source_not_chosen: 'Choose where this Google answer comes from: Google AI Overview or Gemini.',
    context_contaminated: 'This answer refers to ContentScale\'s own workflow (Pre-Write Brief, AI Answer Inputs), so it was written in a conversation that knew the task, not as a neutral answer to the search query. Ask the query in a new, empty conversation (private window, no memory or earlier chats) and paste that answer.',
    source_conflict: '"No AI Overview shown" is selected, but there is text in the field. Choose Google AI Overview or Gemini, or clear the text.'
  };
  var TOPIC_WARNING = 'This answer shares no word with the search query. It still counts; check that it answers the query (synonyms are fine).';
  var NO_OVERVIEW_NOTE = 'Google showed no AI Overview for this query. That is recorded as checked, not as an AI answer and not as a failed Gemini answer. Paste the Gemini answer to research Google\'s AI.';
  function fold(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function words(s) { return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
  // question: the real customer question the owner asked the AI systems for this keyword (owner 2026-11-12: "the keyword
  // must be a real search question"). An answer to that question is an answer to the keyword's search.
  function validateAnswer(answer, query, question) {
    var a = cleanText(answer);
    if (!a) return { valid: false, status: 'not_checked', reason: null, message: null, warnings: [] };
    question = cleanText(question, 300);
    var both = question ? query + ' ' + question : query;
    var low = a.toLowerCase(), reason = markerReason(low, both), warnings = [];
    if (reason) { /* prompt echo or context contamination */ }
    else if (PLACEHOLDERS.some(function (re) { return re.test(a); })) reason = 'placeholder';
    else if ((query && words(a).join(' ') === words(query).join(' ')) || (question && words(a).join(' ') === words(question).join(' '))) reason = 'query_only';
    else if (words(a).length < 3) reason = 'too_short';
    else if (both) {
      var qt = words(both).filter(function (w) { return w.length >= 3; }), text = words(a).join(' ');
      // A shared word or word stem (first six letters: "optimalisatie" matches "optimaliseren").
      if (qt.length && !qt.some(function (w) { return text.indexOf(w.slice(0, 6)) >= 0; })) warnings.push('topic_unconfirmed');
    }
    return reason ? { valid: false, status: 'invalid', reason: reason, message: REASONS[reason], warnings: [] }
      : { valid: true, status: 'valid', reason: null, message: warnings.length ? TOPIC_WARNING : null, warnings: warnings };
  }
  // One Google field with its source choice. requireSource: new input must name the source (saved research may not).
  function validateGoogle(answer, source, query, requireSource, question) {
    var s = googleSource(source), a = cleanText(answer);
    if (s === 'no_ai_overview') return a ? { valid: false, status: 'invalid', reason: 'source_conflict', message: REASONS.source_conflict, warnings: [] }
      : { valid: false, status: 'no_ai_overview', reason: null, message: NO_OVERVIEW_NOTE, warnings: [] };
    var v = validateAnswer(a, query, question);
    if (v.valid && !s && requireSource) return { valid: false, status: 'invalid', reason: 'source_not_chosen', message: REASONS.source_not_chosen, warnings: [] };
    return v;
  }
  function observationFor(e, found, check, ctx) {
    var row = check.status === 'valid' ? found : null, isGoogle = e.id === 'google';
    var gs = isGoogle && found ? (found.google_source || 'unrecorded') : null;
    return { engine: e.id, label: e.label, checked: !!row, answer_source: row ? row.source : found ? found.source : 'not_checked',
      target_query: ctx.q || null, language: ctx.language || null, market: ctx.market || null,
      observation_method: found ? found.source : null, observed_at: found ? found.checked_at : null,
      provenance: found && found.answer ? provenanceOf(found.source) : null, origin_verified: !!(found && found.answer && provenanceOf(found.source) === 'automatic_api'),
      google_source: gs, researched_system: isGoogle && row ? (GOOGLE_SOURCES[gs] || 'Google AI Overview or Gemini (source not recorded)') : null,
      validation_status: check.status, error_reason: check.reason, error_message: check.message,
      warnings: row ? (check.warnings || []) : [], topic_match: row ? (check.warnings || []).indexOf('topic_unconfirmed') < 0 : null,
      rejected_preview: found && found.answer && !row ? found.answer.slice(0, 160) : null,
      answer_excerpt: row ? row.answer.slice(0, EXCERPT) : null, answer_truncated: !!(row && row.answer.length > EXCERPT),
      source_urls: row ? row.citations : [], source_verification: 'not_verified',
      editorial_use: row ? 'Review how this answer frames the query, identify missing qualifications, verify every material claim against independent original sources, and write a distinct useful explanation.'
        : check.status === 'invalid' ? 'Invalid: not an answer to the target query. Never use it as evidence; ask the AI system the query itself.'
        : check.status === 'no_ai_overview' ? 'No AI Overview was shown for this query; there is no Google AI answer to use. Never infer one.'
        : 'Not checked: never infer an answer, citation, or gap.' };
  }
  // The customer question: its text and where it came from (Google People also ask / related search, AI idea, or the owner).
  function questionOf(v) {
    var o = v && typeof v === 'object' ? v : { text: v };
    var t = cleanText(String(o.text || ''), 300).replace(/\s+/g, ' ');
    return t ? { text: t, source: cleanText(String(o.source || ''), 80) || null } : null;
  }
  // query: the target keyword; language and market (region) are the Pre-Write Brief settings for that keyword.
  // require_google_source: true for new input (the Tracker form and new requests), false for rebuilding saved research.
  function makePrewriteAiAnswerResearch(input) {
    input = input || {};
    var q = cleanText(input.query, 350), language = cleanText(input.language, 60), market = cleanText(input.market || input.region, 80);
    var inputs = Array.isArray(input.answers) ? input.answers : [];
    var byEngine = {};
    inputs.forEach(function (raw) { var n = normalizeAnswer(raw); if (n && (n.answer || n.google_source === 'no_ai_overview')) byEngine[n.engine] = n; });
    var aq = questionOf(input.ai_question);
    var ctx = { q: q, language: language, market: market };
    var observations = ENGINES.map(function (e) {
      var found = byEngine[e.id];
      var check = !found ? { status: 'not_checked', reason: null, message: null, warnings: [] }
        : e.id === 'google' ? validateGoogle(found.answer, found.google_source, q, !!input.require_google_source, aq && aq.text) : validateAnswer(found.answer, q, aq && aq.text);
      return observationFor(e, found, check, ctx);
    });
    var instructions = [
      'This research is PRE-PUBLICATION editorial input, not a check whether this website is cited.',
      aq ? 'The AI systems were asked the customer question "' + aq.text + '" (the real search question for the target query). The brief\'s direct answer must answer that question first, in plain words; the target query stays the page\'s keyword.' : null,
      'Compare the actual answers to the same target query; identify differing explanations, factual gaps, unanswered questions and unsupported assertions.',
      'Recognise the important entities (organisations, standards, products, places, people) the answers rely on, and which of them the brief must explain.',
      'Use source URLs as leads only. Fetch and verify original material before citing, quoting or presenting a statement as fact.',
      'Create a direct accurate answer, supporting context, genuine expert insight if supplied, and reader-focused examples; do not copy AI answers.',
      'Separate verifiable evidence from hypotheses and unknowns. Missing and invalid systems are explicitly incomplete: do not fill them in.',
      'Manually pasted answers are observations by the owner whose origin is not verified; only answers fetched through an API have a known origin. Never present this as a verified comparison of five AI systems.',
      'Write in ' + (language || 'the language of the brief') + ' for readers in ' + (market || 'the brief\'s target market') + '; use facts, units and examples that hold there.',
      'Never promise fast AI citation, ranking, traffic or revenue. Publishing does not guarantee that any AI system cites the page.',
      'Keep the brief aligned with the page intent and avoid creating duplicate pages or cannibalizing existing URLs.'
    ].filter(Boolean);
    return recount({
      contract: 'prewrite_ai_answer_research_v3', query: q, ai_question: aq, language: language || null, market: market || null,
      mode: 'pre_publication_answer_research', objective: OBJECTIVE, purpose: MISSION,
      systems_total: ENGINES.length, observations: observations,
      verified_sources: [], // Only independent provenance verification may populate this.
      writing_instructions: instructions,
      required_brief_outputs: ['direct_answer', 'missing_questions', 'factual_gaps', 'important_entities', 'source_verification_tasks',
        'distinctive_expert_insights', 'proposed_outline', 'original_examples', 'limitations', 'fact_check_before_publishing'],
      citation_tracking: { performed: false, reason: 'Citation/mention monitoring belongs to the Free AI Citations Tracker.' }
    });
  }
  // Counts kept apart: captured (text submitted), valid (counted), invalid (rejected, kept with its reason), not checked.
  // "No AI Overview shown" is neither valid, invalid nor not checked.
  function recount(r) {
    var obs = r.observations, checked = obs.filter(function (o) { return o.checked; });
    var invalid = obs.filter(function (o) { return o.validation_status === 'invalid'; });
    var noOverview = obs.filter(function (o) { return o.validation_status === 'no_ai_overview'; });
    r.systems_researched = checked.length;
    r.answers_captured = checked.length + invalid.length;
    r.answers_valid = checked.length;
    r.answers_invalid = invalid.length;
    r.systems_not_checked = obs.length - checked.length - invalid.length - noOverview.length;
    r.google_no_ai_overview = noOverview.length > 0;
    r.answers_origin_verified = checked.filter(function (o) { return o.origin_verified === true; }).length;
    r.research_complete = checked.length === r.systems_total;
    r.missing_systems = obs.filter(function (o) { return !o.checked; }).map(function (o) { return o.label; });
    r.invalid_systems = invalid.map(function (o) { return { label: o.label, reason: o.error_reason }; });
    r.source_candidates = uniq([].concat.apply([], checked.map(function (o) { return Array.isArray(o.source_urls) ? o.source_urls : []; })));
    r.readiness = !r.query ? 'TARGET_QUERY_MISSING' : checked.length ?
      (r.research_complete ? 'RESEARCH_COMPLETE_VERIFY_SOURCES' : 'RESEARCH_PARTIAL_VERIFY_SOURCES') : 'RESEARCH_NOT_CAPTURED';
    return r;
  }
  // Research saved earlier (v1/v2, or v3 before provenance and the Google source) is shown with the current contract:
  // an echo counted as an answer becomes INVALID; provenance and the Google source are derived, never upgraded.
  // The stored object is not changed: this returns a copy.
  function revalidate(research) {
    if (!research || !Array.isArray(research.observations)) return research;
    var r = JSON.parse(JSON.stringify(research));
    r.observations = r.observations.map(function (o) {
      if (!o) return o;
      var c = Object.assign({}, o);
      // A v3 answer was validated in full when it was made; the marker checks (echo, contamination) are re-applied to its
      // excerpt, because answers saved before a marker existed may contain one.
      var mr = c.checked && c.validation_status === 'valid' ? markerReason(String(c.answer_excerpt || '').toLowerCase(), r.query + (r.ai_question && r.ai_question.text ? ' ' + r.ai_question.text : '')) : null;
      if (mr) c = Object.assign(c, { checked: false, validation_status: 'invalid', error_reason: mr, error_message: REASONS[mr],
        rejected_preview: String(c.answer_excerpt || '').slice(0, 160), answer_excerpt: null, answer_truncated: false, source_urls: [], warnings: [], topic_match: null,
        editorial_use: 'Invalid: not an answer to the target query. Never use it as evidence; ask the AI system the query itself.' });
      if (c.checked && c.validation_status !== 'valid') {
        var v = validateAnswer(c.answer_excerpt || '', r.query, r.ai_question && r.ai_question.text);
        if (!v.valid) c = Object.assign(c, { checked: false, validation_status: 'invalid', error_reason: v.reason, error_message: v.message,
          rejected_preview: String(c.answer_excerpt || '').slice(0, 160), answer_excerpt: null, answer_truncated: false, source_urls: [],
          editorial_use: 'Invalid: not an answer to the target query. Never use it as evidence; ask the AI system the query itself.' });
        else c.validation_status = 'valid';
      }
      if (!c.validation_status) c.validation_status = 'not_checked';
      if (c.provenance === undefined) { c.provenance = c.checked || c.validation_status === 'invalid' ? provenanceOf(c.answer_source) : null; c.origin_verified = c.provenance === 'automatic_api'; }
      if (c.engine === 'google' && c.checked && !c.google_source) { c.google_source = 'unrecorded'; c.researched_system = 'Google AI Overview or Gemini (source not recorded)'; }
      return c;
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
      // ai_system_evidence names the Google entry google_aio; the observation is engine "google".
      var e = evidence[o.engine] || (o.engine === 'google' ? evidence.google_aio : null) || {};
      var full = typeof e === 'string' ? e : e.text || e.answer || '';
      // Only carry the original observation when no replacement answer exists.
      if (typeof full !== 'string' || !full.trim()) {
        return Object.assign({}, old, {engine: o.engine, label: o.label, checked: true});
      }
      return o;
    });
    return recount(current);
  }
  function systemLine(x) {
    var head = 'SYSTEM: ' + x.label;
    if (x.checked) {
      var origin = x.provenance === 'automatic_api' ? (x.answer_source && x.answer_source !== 'manual' ? x.answer_source + ' · ' : '') + 'fetched via API, origin known'
        : 'manual paste · origin not verified';
      return head + (x.researched_system ? ' — researched: ' + x.researched_system : '') + ' [' + origin + ']' +
        '\nObserved answer (unverified): ' + x.answer_excerpt + (x.answer_truncated ? ' […]' : '') +
        '\nCandidate source URLs (NOT verified): ' + (x.source_urls.join(', ') || 'none') +
        ((x.warnings || []).indexOf('topic_unconfirmed') >= 0 ? '\nTopic check: shares no word with the target query; confirm it answers the query before using it.' : '');
    }
    if (x.validation_status === 'invalid')
      return head + ' — INVALID (' + String(x.error_reason || 'not an answer').replace(/_/g, ' ') + '): the submitted text is not usable as an answer to the target query and is not evidence. Treat this system as NOT CHECKED. Do not invent results.';
    if (x.validation_status === 'no_ai_overview')
      return head + ' — NO AI OVERVIEW SHOWN for this query (checked by the owner). This is not an AI answer and not a failed Gemini answer; Gemini was not researched. Do not invent results.';
    return head + ' — NOT CHECKED. Do not invent results.';
  }
  function buildPrewriteResearchPrompt(research) {
    if (!research || !/^prewrite_ai_answer_research_v[123]$/.test(research.contract)) throw Error('invalid_prewrite_ai_answer_research');
    research = revalidate(research);
    var obs = research.observations;
    var notChecked = obs.filter(function (x) { return !x.checked && x.validation_status !== 'invalid' && x.validation_status !== 'no_ai_overview'; }).map(function (x) { return x.label; });
    var invalid = obs.filter(function (x) { return x.validation_status === 'invalid'; }).map(function (x) { return x.label; });
    var counts = 'AI answers researched: ' + research.answers_valid + '/' + research.systems_total + ' valid · captured ' + research.answers_captured +
      ' · invalid ' + research.answers_invalid + ' · not checked ' + research.systems_not_checked +
      (research.google_no_ai_overview ? ' · Google: no AI Overview shown' : '') +
      ' · origin verified ' + research.answers_origin_verified + ' (via API), manual pastes unverified';
    var detail = [notChecked.length ? 'Not checked: ' + notChecked.join(', ') + '.' : '', invalid.length ? 'Invalid, not counted: ' + invalid.join(', ') + '.' : ''].filter(Boolean).join(' ');
    return [
      (research.objective || OBJECTIVE).toUpperCase() + '. This is NOT citation tracking.',
      research.purpose && research.contract !== 'prewrite_ai_answer_research_v1' ? research.purpose : null,
      'Target query: ' + (research.query || 'MISSING — enter the target keyword before writing'),
      research.ai_question && research.ai_question.text ? 'Customer question asked to the AI systems: "' + research.ai_question.text + '"' + (research.ai_question.source ? ' (' + research.ai_question.source + ')' : '') : null,
      research.contract !== 'prewrite_ai_answer_research_v1' ? 'Language: ' + (research.language || 'not set') + ' · Market: ' + (research.market || 'not set') : null,
      counts + (detail ? '\n' + detail : ''),
      obs.map(systemLine).join('\n\n'),
      'EDITORIAL REQUIREMENTS:\n' + research.writing_instructions.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'),
      'Produce: ' + research.required_brief_outputs.join(', '),
      'Do not claim that any answer or source establishes that the target domain is cited.'
    ].filter(function (x) { return x != null; }).join('\n\n');
  }
  return { ENGINES: ENGINES, OBJECTIVE: OBJECTIVE, MISSION: MISSION, GOOGLE_SOURCES: GOOGLE_SOURCES, normalizeAnswer: normalizeAnswer, validateAnswer: validateAnswer, validateGoogle: validateGoogle, provenanceOf: provenanceOf, revalidate: revalidate,
    makePrewriteAiAnswerResearch: makePrewriteAiAnswerResearch, preserveResearchEvidence: preserveResearchEvidence, recount: recount, buildPrewriteResearchPrompt: buildPrewriteResearchPrompt };
});
