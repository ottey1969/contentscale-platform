/* Pre-Write Brief — tabs "AI Answer Inputs | Research Prompt".
 * The prompt is built by window.PrewriteAiAnswerResearch (public/prewrite-ai-answer-research.js), the same file the
 * server's Pre-Write Brief generator requires, with the same inputs the "Analyse & create" button sends:
 * #pwbKeyword, #pwbLanguage, #pwbRegion (code), and the five answer fields, trimmed and clipped like the server does.
 * After a Brief is generated or reopened, the research object the server saved with it can be shown as well, so the
 * owner sees the exact prompt that was used (including an automatic Perplexity answer, if the server added one).
 * The existing fields and the server stay the source of truth; this tab saves nothing and checks no citations.
 */
(function () {
  'use strict';
  var MARKER = 'AI Answer Research — Write for Citation Potential';
  var FIELDS = [['google_aio', 'pwbAioText'], ['chatgpt', 'pwbChatgptText'], ['perplexity', 'pwbPerplexityText'], ['claude', 'pwbClaudeText'], ['copilot', 'pwbCopilotText']];
  var CLIP = 12000; // the server's _clipAi limit for each answer
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? String(el.value || '').trim() : ''; }
  // Exactly the server request: keyword, language, region code ("nl — Netherlands" → "nl"), answers.
  function currentInputs() {
    var regionRaw = val('pwbRegion');
    var region = (regionRaw.match(/^([a-z]{2})\s*[—-]/i) || [null, regionRaw])[1] || regionRaw;
    // Same as the server for a new request: the Google answer needs its source (#pwbGoogleSource).
    return { query: val('pwbKeyword'), language: val('pwbLanguage'), market: region, require_google_source: true,
      answers: FIELDS.map(function (f) { var a = { engine: f[0], answer: val(f[1]).slice(0, CLIP) }; if (f[0] === 'google_aio') a.google_source = val('pwbGoogleSource'); return a; }) };
  }
  function lib() { return window.PrewriteAiAnswerResearch || null; }
  function savedResearch(query) {
    var b = window._pwbCurrentBrief, r = b && typeof b === 'object' ? b.prewrite_ai_answer_research : null;
    if (!r || !/^prewrite_ai_answer_research_v[123]$/.test(r.contract)) return null;
    var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
    return norm(r.query) && norm(r.query) === norm(query) ? (lib() && lib().revalidate ? lib().revalidate(r) : r) : null;
  }
  function addStyles() {
    if ($('cs-research-tab-style')) return;
    var css = document.createElement('style');
    css.id = 'cs-research-tab-style';
    css.textContent = '#cs-research-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#cs-research-tabs button{border:1px solid #64748b;border-radius:7px;padding:9px 14px;background:transparent;color:inherit;cursor:pointer;font-weight:650;min-height:40px}#cs-research-tabs button[aria-selected="true"]{background:#2563eb;color:#fff;border-color:#2563eb}#cs-research-tabs button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}#cs-research-prompt-panel{border:1px solid #475569;border-radius:10px;padding:16px;margin:12px 0;background:rgba(15,23,42,.94);color:#e2e8f0;max-width:100%;box-sizing:border-box}#cs-research-prompt-panel textarea{display:block;width:100%;box-sizing:border-box;min-height:360px;padding:12px;background:#090f1e;color:#e2e8f0;border:1px solid #64748b;border-radius:7px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.55}#cs-research-prompt-panel p{margin:8px 0;color:#cbd5e1;overflow-wrap:anywhere}#cs-research-prompt-panel .cs-rp-status{font-weight:700}#cs-research-prompt-panel .cs-rp-status[data-state="complete"]{color:#86efac}#cs-research-prompt-panel .cs-rp-status[data-state="partial"]{color:#fbbf24}#cs-research-prompt-panel .cs-rp-status[data-state="none"],#cs-research-prompt-panel .cs-rp-status[data-state="error"]{color:#fca5a5}#cs-research-prompt-panel .cs-rp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}#cs-research-prompt-panel button{padding:8px 14px;background:#2563eb;color:white;border:0;border-radius:6px;cursor:pointer;min-height:38px}#cs-research-prompt-panel button:disabled{opacity:.5;cursor:not-allowed}#cs-research-ask{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 12px}#cs-research-ask button{border:1px solid #64748b;border-radius:7px;padding:8px 12px;background:transparent;color:inherit;cursor:pointer;font-weight:650;min-height:38px}#cs-research-ask button:disabled{opacity:.5;cursor:not-allowed}#cs-research-ask .cs-ask-note{flex:1 1 220px;margin:0}.cs-ai-invalid{margin-top:6px;padding:7px 9px;border:1px solid #f87171;border-radius:6px;background:rgba(127,29,29,.35);color:#fecaca;font-size:11px;line-height:1.45;overflow-wrap:anywhere}.cs-ai-invalid.cs-ai-warn{border-color:#fbbf24;background:rgba(120,53,15,.35);color:#fde68a}.cs-ai-invalid.cs-ai-info{border-color:#60a5fa;background:rgba(30,58,138,.35);color:#bfdbfe}.cs-ask-note{font-size:11px;color:#94a3b8;margin:-4px 0 10px;overflow-wrap:anywhere}#cs-research-prompt-panel select{padding:7px;border-radius:6px;background:#090f1e;color:#e2e8f0;border:1px solid #64748b;max-width:100%}';
    document.head.appendChild(css);
  }
  function findHeading() {
    var nodes = document.querySelectorAll('div,h1,h2,h3,h4,h5,strong,legend,summary,label,span,p');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length === 0 && el.textContent && el.textContent.trim() === MARKER) return el;
    }
    return null;
  }
  function install() {
    if ($('cs-research-tabs')) return true;
    var heading = findHeading(), grid = $('pwbAioText') && $('pwbAioText').closest('.pwb-ai-five-grid');
    if (!heading || !grid) return false;
    addStyles();
    var tabs = document.createElement('div');
    tabs.id = 'cs-research-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Pre-Write Brief AI answer research');
    var inputs = document.createElement('button'), prompt = document.createElement('button');
    inputs.type = prompt.type = 'button';
    inputs.textContent = 'AI Answer Inputs';
    prompt.textContent = 'Research Prompt';
    inputs.id = 'cs-research-inputs-tab';
    prompt.id = 'cs-research-prompt-tab';
    if (!grid.id) grid.id = 'cs-research-inputs-panel';
    var panel = document.createElement('section');
    panel.id = 'cs-research-prompt-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', prompt.id);
    panel.hidden = true;
    grid.setAttribute('role', 'tabpanel');
    grid.setAttribute('aria-labelledby', inputs.id);
    inputs.setAttribute('aria-controls', grid.id);
    prompt.setAttribute('aria-controls', panel.id);
    [inputs, prompt].forEach(function (el) { el.setAttribute('role', 'tab'); tabs.appendChild(el); });
    // What to type in each AI system: the search query itself, nothing else. The Research Prompt is never pasted there.
    var ask = document.createElement('button'); ask.type = 'button'; ask.className = 'cs-rp-ask'; ask.id = 'cs-research-ask-copy';
    ask.textContent = 'Copy search question';
    var askNote = document.createElement('p'); askNote.className = 'cs-ask-note'; askNote.setAttribute('role', 'status');
    askNote.textContent = 'Ask each AI system only the search query, exactly as a reader would. Paste its full answer, with its sources, in the matching field. Never paste the Research Prompt into an AI system or into these fields.';
    var askBox = document.createElement('div'); askBox.id = 'cs-research-ask'; askBox.append(ask, askNote);
    var status = document.createElement('p'); status.className = 'cs-rp-status'; status.setAttribute('role', 'status');
    var note = document.createElement('p');
    note.textContent = 'This is the prompt the Pre-Write Brief generator uses for the AI answer research: writing research for a clearer, better-sourced answer, not citation tracking. The fields under "AI Answer Inputs" stay the saved source of truth.';
    var choice = document.createElement('select'); choice.setAttribute('aria-label', 'Which research prompt to show'); choice.hidden = true;
    var editor = document.createElement('textarea'); editor.readOnly = true; editor.setAttribute('aria-label', 'AI answer research prompt');
    var actions = document.createElement('div'); actions.className = 'cs-rp-actions';
    var copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy Research Prompt';
    var copied = document.createElement('small'); copied.setAttribute('role', 'status');
    actions.append(copy, copied);
    panel.append(status, note, choice, editor, actions);
    heading.insertAdjacentElement('afterend', tabs);
    tabs.insertAdjacentElement('afterend', askBox);
    grid.insertAdjacentElement('afterend', panel);

    function syncAsk() { var q = val('pwbKeyword'); ask.disabled = !q; ask.title = q ? 'Copies: ' + q : 'Enter the target keyword first.'; }
    ask.addEventListener('click', function () {
      var q = val('pwbKeyword'); if (!q) return;
      var done = function (ok) { askNote.textContent = ok ? 'Copied: "' + q + '". Paste it into Google, ChatGPT, Perplexity, Claude and Copilot, then paste each full answer back here.' : 'Copy this search question by hand: ' + q; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(q).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
    // Each answer field says at once when its text is not an answer to the keyword (same check the server applies).
    function checkFields() {
      var L = lib(), q = val('pwbKeyword');
      FIELDS.forEach(function (f) {
        var el = $(f[1]); if (!el) return;
        var note = document.getElementById(f[1] + '-cs-invalid'), v = String(el.value || '').trim();
        var chk = !L || !L.validateAnswer ? { valid: true } : f[0] === 'google_aio' ? L.validateGoogle(v, val('pwbGoogleSource'), q, true)
          : v ? L.validateAnswer(v, q) : { valid: false, status: 'not_checked' };
        var kind = chk.status === 'invalid' ? 'invalid' : chk.status === 'no_ai_overview' ? 'info' : chk.valid && chk.message ? 'warn' : '';
        if (!kind) { if (note) note.remove(); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); el.style.borderColor = ''; return; }
        if (!note) { note = document.createElement('div'); note.id = f[1] + '-cs-invalid'; el.insertAdjacentElement('afterend', note); }
        note.className = 'cs-ai-invalid cs-ai-' + kind; note.setAttribute('role', kind === 'invalid' ? 'alert' : 'status');
        note.textContent = (kind === 'invalid' ? 'INVALID, not counted: ' : kind === 'warn' ? 'Counted — check: ' : 'Recorded: ') + chk.message;
        el.setAttribute('aria-describedby', note.id);
        if (kind === 'invalid') { el.setAttribute('aria-invalid', 'true'); el.style.borderColor = '#f87171'; } else { el.removeAttribute('aria-invalid'); el.style.borderColor = kind === 'warn' ? '#fbbf24' : ''; }
      });
    }
    function render() {
      var L = lib(), input = currentInputs();
      copied.textContent = '';
      if (!L) { status.dataset.state = 'error'; status.textContent = 'The research prompt could not be loaded. Reload the page.'; editor.value = ''; copy.disabled = true; return; }
      var saved = savedResearch(input.query);
      choice.hidden = !saved;
      if (saved && !choice.options.length) {
        choice.append(new Option('Prompt for the current inputs', 'current'), new Option('Prompt used for the generated Brief (saved)', 'saved'));
      }
      var research = saved && choice.value === 'saved' ? saved : L.makePrewriteAiAnswerResearch(input);
      if (!research.query) {
        status.dataset.state = 'error'; status.textContent = 'Enter the target keyword first: the research prompt is built for that exact query.';
        editor.value = ''; copy.disabled = true; return;
      }
      var n = research.answers_valid, obs = research.observations;
      var invalid = obs.filter(function (x) { return x.validation_status === 'invalid'; });
      var notChecked = obs.filter(function (x) { return !x.checked && x.validation_status !== 'invalid' && x.validation_status !== 'no_ai_overview'; }).map(function (x) { return x.label; });
      var warned = obs.filter(function (x) { return x.checked && (x.warnings || []).length; }).map(function (x) { return x.label; });
      status.dataset.state = n === research.systems_total ? 'complete' : n ? 'partial' : 'none';
      if (invalid.length) status.dataset.state = n ? 'partial' : 'error';
      status.textContent = (research === saved ? 'Saved with the generated Brief · ' : '') +
        n + ' of 5 valid AI answers · ' + research.answers_captured + ' captured · ' + research.answers_invalid + ' invalid · ' + research.systems_not_checked + ' not checked.' +
        (n === research.systems_total ? ' Source URLs are leads; verify them before citing.' : '') +
        (notChecked.length ? ' NOT CHECKED: ' + notChecked.join(', ') + '; nothing is filled in.' : '') +
        (invalid.length ? ' INVALID, not counted: ' + invalid.map(function (x) { return x.label + ' — ' + (x.error_message || 'not an answer to the query'); }).join(' ') : '') +
        (research.google_no_ai_overview ? ' Google: no AI Overview shown (recorded; not an AI answer, Gemini not researched).' : '') +
        (warned.length ? ' Check the topic of: ' + warned.join(', ') + '.' : '') +
        (n ? ' Pasted answers are your observations; their origin is not verified.' : '') +
        (n === 0 && !invalid.length && !research.google_no_ai_overview ? ' Paste them under "AI Answer Inputs"; without them the prompt marks all five as NOT CHECKED.' : '') +
        (research !== saved && !val('pwbPerplexityText') ? ' If Perplexity stays empty, the server may add an automatic Perplexity answer when the Brief is generated; the saved prompt then shows it.' : '');
      editor.value = L.buildPrewriteResearchPrompt(research);
      copy.disabled = false;
    }
    function select(showPrompt, focus) {
      inputs.setAttribute('aria-selected', String(!showPrompt));
      prompt.setAttribute('aria-selected', String(showPrompt));
      inputs.tabIndex = showPrompt ? -1 : 0;
      prompt.tabIndex = showPrompt ? 0 : -1;
      // The grid has an inline display:grid that overrides [hidden]; hide it through its own style.
      grid.hidden = showPrompt; grid.style.display = showPrompt ? 'none' : 'grid';
      panel.hidden = !showPrompt;
      if (showPrompt) render();
      if (focus) (showPrompt ? prompt : inputs).focus();
    }
    inputs.addEventListener('click', function () { select(false); });
    prompt.addEventListener('click', function () { select(true); });
    tabs.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault(); select(ev.key === 'ArrowRight' || ev.key === 'End' ? true : false, true);
      }
    });
    choice.addEventListener('change', render);
    // Keep the prompt current while the owner edits the keyword, market, language or answers.
    ['pwbKeyword', 'pwbLanguage', 'pwbRegion', 'pwbGoogleSource'].concat(FIELDS.map(function (f) { return f[1]; })).forEach(function (id) {
      var el = $(id), onEdit = function () { checkFields(); syncAsk(); if (!panel.hidden) render(); };
      if (el) { el.addEventListener('input', onEdit); if (el.tagName === 'SELECT') el.addEventListener('change', onEdit); }
    });
    copy.addEventListener('click', function () {
      editor.focus(); editor.select();
      var done = function (ok) { copied.textContent = ok ? 'Copied — the complete prompt is on your clipboard.' : 'Select the text and copy it with Ctrl+C / Cmd+C.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(editor.value).then(function () { done(true); }, function () { done(false); });
      else { var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); }
    });
    select(false); checkFields(); syncAsk();
    return true;
  }
  function boot() {
    if (install()) return;
    // The inputs are part of the page's own HTML; a short, bounded wait covers late rendering only.
    var observer = new MutationObserver(function () { if (install()) observer.disconnect(); });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
