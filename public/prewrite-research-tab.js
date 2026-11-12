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
    // The customer question asked to the AI systems (#cs-ai-question, chosen automatically from Google's own questions).
    var qEl = $('cs-ai-question'), aq = qEl && String(qEl.value || '').trim();
    return { query: val('pwbKeyword'), ai_question: aq && aq.toLowerCase() !== val('pwbKeyword').toLowerCase() ? { text: aq, source: qEl.dataset.source || null } : null,
      language: val('pwbLanguage'), market: region, require_google_source: true,
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
    css.textContent = '#cs-research-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#cs-research-tabs button{border:1px solid #64748b;border-radius:7px;padding:9px 14px;background:transparent;color:inherit;cursor:pointer;font-weight:650;min-height:40px}#cs-research-tabs button[aria-selected="true"]{background:#2563eb;color:#fff;border-color:#2563eb}#cs-research-tabs button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}#cs-research-prompt-panel{border:1px solid #475569;border-radius:10px;padding:16px;margin:12px 0;background:rgba(15,23,42,.94);color:#e2e8f0;max-width:100%;box-sizing:border-box}#cs-research-prompt-panel textarea{display:block;width:100%;box-sizing:border-box;min-height:360px;padding:12px;background:#090f1e;color:#e2e8f0;border:1px solid #64748b;border-radius:7px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.55}#cs-research-prompt-panel p{margin:8px 0;color:#cbd5e1;overflow-wrap:anywhere}#cs-research-prompt-panel .cs-rp-status{font-weight:700}#cs-research-prompt-panel .cs-rp-status[data-state="complete"]{color:#86efac}#cs-research-prompt-panel .cs-rp-status[data-state="partial"]{color:#fbbf24}#cs-research-prompt-panel .cs-rp-status[data-state="none"],#cs-research-prompt-panel .cs-rp-status[data-state="error"]{color:#fca5a5}#cs-research-prompt-panel .cs-rp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}#cs-research-prompt-panel button{padding:8px 14px;background:#2563eb;color:white;border:0;border-radius:6px;cursor:pointer;min-height:38px}#cs-research-prompt-panel button:disabled{opacity:.5;cursor:not-allowed}#cs-research-ask{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 12px}#cs-research-ask button{border:1px solid #64748b;border-radius:7px;padding:8px 12px;background:transparent;color:inherit;cursor:pointer;font-weight:650;min-height:38px}#cs-research-ask button:disabled{opacity:.5;cursor:not-allowed}#cs-research-ask .cs-ask-note{flex:1 1 220px;margin:0}#cs-research-ask button.cs-copied,#cs-research-prompt-panel button.cs-copied{background:#16a34a!important;border-color:#16a34a!important;color:#fff!important;animation:csCopyPop .45s ease-out}#cs-research-ask .cs-ask-note.cs-copied-note{color:#86efac;animation:csCopyFlash 1.2s ease-out}@keyframes csCopyPop{0%{transform:scale(1)}40%{transform:scale(1.08);box-shadow:0 0 0 6px rgba(22,163,74,.35)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(22,163,74,0)}}@keyframes csCopyFlash{0%{background:rgba(22,163,74,.28)}100%{background:transparent}}@media (prefers-reduced-motion:reduce){#cs-research-ask button.cs-copied,#cs-research-prompt-panel button.cs-copied,#cs-research-ask .cs-ask-note.cs-copied-note{animation:none}}.cs-ai-invalid{margin-top:6px;padding:7px 9px;border:1px solid #f87171;border-radius:6px;background:rgba(127,29,29,.35);color:#fecaca;font-size:11px;line-height:1.45;overflow-wrap:anywhere}.cs-ai-invalid.cs-ai-warn{border-color:#fbbf24;background:rgba(120,53,15,.35);color:#fde68a}.cs-ai-invalid.cs-ai-info{border-color:#60a5fa;background:rgba(30,58,138,.35);color:#bfdbfe}.cs-ask-note{font-size:11px;color:#94a3b8;margin:-4px 0 10px;overflow-wrap:anywhere}#cs-research-prompt-panel select{padding:7px;border-radius:6px;background:#090f1e;color:#e2e8f0;border:1px solid #64748b;max-width:100%}';
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
    heading.textContent = 'Collect AI answers';
    var tabs = document.createElement('div');
    tabs.id = 'cs-research-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Pre-Write Brief AI answer research');
    var inputs = document.createElement('button'), prompt = document.createElement('button');
    inputs.type = prompt.type = 'button';
    inputs.textContent = 'AI Answer Inputs';
    prompt.textContent = 'Research Prompt';
    // The research prompt is internal to Brief generation. Do not expose expert tooling to ordinary users.
    tabs.hidden = true;
    tabs.style.display = 'none';
    tabs.setAttribute('aria-hidden', 'true');
    inputs.id = 'cs-research-inputs-tab';
    prompt.id = 'cs-research-prompt-tab';
    if (!grid.id) grid.id = 'cs-research-inputs-panel';
    var panel = document.createElement('section');
    panel.id = 'cs-research-prompt-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', prompt.id);
    panel.hidden = true;
    panel.style.display = 'none';
    grid.setAttribute('role', 'tabpanel');
    grid.setAttribute('aria-labelledby', inputs.id);
    inputs.setAttribute('aria-controls', grid.id);
    prompt.setAttribute('aria-controls', panel.id);
    [inputs, prompt].forEach(function (el) { el.setAttribute('role', 'tab'); tabs.appendChild(el); });
    // What to type in each AI system: the search query itself, nothing else. The Research Prompt is never pasted there.
    var ask = document.createElement('button'); ask.type = 'button'; ask.className = 'cs-rp-ask'; ask.id = 'cs-research-ask-copy';
    ask.textContent = 'Copy search question';
    var askNote = document.createElement('p'); askNote.className = 'cs-ask-note'; askNote.setAttribute('role', 'status');
    askNote.textContent = '1. Copy the question and ask it in each AI system. 2. Paste that system\'s actual answer in its field below. 3. Use Analyse & create when your answers are ready.';
    // The question to ask (owner 2026-11-11): the best real customer question for the keyword, chosen automatically from
    // Google's own questions for the market (as in the free Growth check). Editable; one click picks another or the keyword.
    var qWrap = document.createElement('div'); qWrap.id = 'cs-ai-question-box';
    var qLabel = document.createElement('label'); qLabel.htmlFor = 'cs-ai-question'; qLabel.textContent = 'Question to ask the AI systems';
    // A real customer question can be long (owner 2026-11-12: a 190-character question was cut off): a growing text box.
    var qInput = document.createElement('textarea'); qInput.id = 'cs-ai-question'; qInput.maxLength = 300; qInput.rows = 2; qInput.className = 'cs-input';
    qInput.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;min-height:44px;font:inherit;line-height:1.45';
    var grow = function () { qInput.style.height = 'auto'; qInput.style.height = Math.min(qInput.scrollHeight + 2, 160) + 'px'; };
    qInput.addEventListener('input', grow); qInput.placeholder = 'Chosen automatically from the questions customers ask in Google';
    var qSrc = document.createElement('small'); qSrc.id = 'cs-ai-question-source'; qSrc.style.display = 'block';
    var qChips = document.createElement('div'); qChips.id = 'cs-ai-question-options';
    // Questions the AI systems themselves raise in the pasted answers (Perplexity's related questions, for example).
    var qFromAnswers = document.createElement('div'); qFromAnswers.id = 'cs-ai-question-from-answers';
    qWrap.append(qLabel, qInput, qSrc, qChips, qFromAnswers);
    var askBox = document.createElement('div'); askBox.id = 'cs-research-ask'; askBox.append(qWrap, ask, askNote);
    var qState = { kw: '', manual: false, timer: null, seq: 0 };
    function tokenOf() { return window.TOKEN || ((location.pathname.match(/\/track\/([^/?#]+)/) || [])[1]) || ''; }
    function chip(text, label, isKeyword) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cs-q-chip';
      b.style.cssText = 'margin:4px 6px 0 0;padding:4px 10px;border-radius:14px;border:1px solid #475569;background:transparent;color:inherit;cursor:pointer;font-size:12px';
      b.textContent = (isKeyword ? 'Keyword: ' : '') + text; b.title = label || '';
      b.addEventListener('click', function () { qInput.value = text; qInput.dataset.source = isKeyword ? '' : (label || ''); qState.manual = true; qSrc.textContent = isKeyword ? 'You chose the keyword itself.' : 'You chose: ' + (label || 'customer question'); syncAsk(); });
      return b;
    }
    function loadQuestion() {
      var kw = val('pwbKeyword'), tok = tokenOf();
      if (!kw) { qInput.value = ''; qSrc.textContent = ''; qChips.innerHTML = ''; qState.kw = ''; return; }
      if (qState.manual && qState.kw === kw) return;
      qState.kw = kw; qState.manual = false; var seq = ++qState.seq;
      if (!tok) { qInput.value = kw; qSrc.textContent = 'The keyword is used.'; return; }
      qSrc.textContent = 'Finding the question customers ask in Google…';
      var u = '/api/tracker-client/' + encodeURIComponent(tok) + '/prewrite-customer-question?keyword=' + encodeURIComponent(kw) + '&region=' + encodeURIComponent(val('pwbRegion')) + '&language=' + encodeURIComponent(val('pwbLanguage'));
      fetch(u).then(function (r) { return r.json(); }).then(function (d) {
        if (seq !== qState.seq || qState.manual) return;
        qChips.innerHTML = '';
        if (d && d.success && d.best_question) {
          qInput.value = d.best_question; qInput.dataset.source = d.best_label || '';
          qSrc.textContent = 'Chosen automatically: ' + (d.best_label || 'customer question') + '. Change it or pick another below.';
          (d.questions || []).filter(function (q) { return q.text !== d.best_question; }).slice(0, 5).forEach(function (q) { qChips.appendChild(chip(q.text, q.label, false)); });
        } else {
          qInput.value = kw; qInput.dataset.source = '';
          // Say why, so a missing key or an empty Google result is visible instead of a silent fallback.
          var why = d && d.google_status === 'GOOGLE_NOT_CONFIGURED' ? 'Google search is not configured on the server'
            : d && d.google_status === 'GOOGLE_UNAVAILABLE' ? 'Google search did not answer'
            : d && d.success ? 'Google shows no customer question for this keyword in this market' : '';
          qSrc.textContent = (d && d.error) || ((why ? why + '; ' : '') + 'the keyword is used. Type a customer question yourself if you have one.');
        }
        qChips.appendChild(chip(kw, 'The keyword itself', true)); syncAsk();
      }).catch(function () { if (seq === qState.seq && !qState.manual) { qInput.value = kw; qSrc.textContent = 'Questions unavailable; the keyword is used.'; syncAsk(); } });
    }
    function scheduleQuestion() { clearTimeout(qState.timer); qState.timer = setTimeout(loadQuestion, 700); }
    qInput.addEventListener('input', function () { qState.manual = true; qInput.dataset.source = 'Your own question'; qSrc.textContent = 'Your own question.'; syncAsk(); });
    ['pwbKeyword', 'pwbRegion', 'pwbLanguage'].forEach(function (id) { var el = $(id); if (el) { el.addEventListener('change', function () { qState.manual = false; scheduleQuestion(); }); if (id === 'pwbKeyword') el.addEventListener('input', scheduleQuestion); } });
    var status = document.createElement('p'); status.className = 'cs-rp-status'; status.setAttribute('role', 'status');
    var note = document.createElement('p');
    note.textContent = 'This is the prompt the Pre-Write Brief generator uses for the AI answer research: writing research for a clearer, better-sourced answer, not citation tracking. The fields under "AI Answer Inputs" stay the saved source of truth.';
    var choice = document.createElement('select'); choice.setAttribute('aria-label', 'Which research prompt to show'); choice.hidden = true;
    var editor = document.createElement('textarea'); editor.readOnly = true; editor.setAttribute('aria-label', 'AI answer research prompt');
    var actions = document.createElement('div'); actions.className = 'cs-rp-actions';
    var copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy Research Prompt';
    var copied = document.createElement('small'); copied.setAttribute('role', 'status');
    actions.append(copy, copied);
    panel.append(note, choice, editor, actions);
    askBox.appendChild(status);
    heading.insertAdjacentElement('afterend', tabs);
    tabs.insertAdjacentElement('afterend', askBox);
    grid.insertAdjacentElement('afterend', panel);

    // Visible confirmation on every click (owner 2026-11-10): the button turns green with "Copied ✓" and pops, the note
    // flashes, then the button returns to its label. Restarted on each click, also when clicked again quickly.
    function flash(btn, on, off, noteEl) {
      clearTimeout(btn._csCopyT); btn.classList.remove('cs-copied'); void btn.offsetWidth; btn.classList.add('cs-copied'); btn.textContent = on;
      if (noteEl) { noteEl.classList.remove('cs-copied-note'); void noteEl.offsetWidth; noteEl.classList.add('cs-copied-note'); }
      btn._csCopyT = setTimeout(function () { btn.classList.remove('cs-copied'); btn.textContent = off; if (noteEl) noteEl.classList.remove('cs-copied-note'); }, 1800);
    }
    function askText() { return String(qInput.value || '').trim() || val('pwbKeyword'); }
    var ENGINE_LABEL = { pwbAioText: 'Google AI / Gemini', pwbChatgptText: 'ChatGPT', pwbPerplexityText: 'Perplexity', pwbClaudeText: 'Claude', pwbCopilotText: 'Copilot' };
    function answerQuestions() {
      var seen = {}, out = [], cur = String(qInput.value || '').trim().toLowerCase();
      FIELDS.forEach(function (f) {
        var v = String(val(f[1]) || ''); if (!v) return;
        (v.match(/[^\n.!?¿¡]*[¿]?[^\n.!?¿¡]{12,280}\?/g) || []).forEach(function (raw) {
          var t = raw.replace(/^[\s\-*•\d.)#>]+/, '').replace(/\s+/g, ' ').trim(); var w = t.split(' ').length;
          if (w < 4 || w > 45 || /https?:|www\./i.test(t)) return;
          if (/^[a-záéíóúñ]/.test(t) && !/^¿/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
          var k = t.toLowerCase(); if (seen[k] || k === cur) return; seen[k] = 1; out.push({ text: t, label: (ENGINE_LABEL[f[1]] || f[0]) + ' · question in its answer' });
        });
      });
      return out.slice(0, 6);
    }
    function renderAnswerQuestions() {
      var list = answerQuestions(); qFromAnswers.innerHTML = '';
      if (!list.length) return;
      var h = document.createElement('small'); h.style.display = 'block'; h.style.marginTop = '6px'; h.textContent = 'Questions the AI systems raise in your pasted answers:'; qFromAnswers.appendChild(h);
      list.forEach(function (q) { qFromAnswers.appendChild(chip(q.text, q.label, false)); });
    }
    function syncAsk() { var q = askText(); ask.disabled = !q; ask.title = q ? 'Copies: ' + q : 'Enter the target keyword first.';
      // A new question changes the answer check and the research prompt: refresh both (once, after the current event).
      clearTimeout(qState.refresh); qState.refresh = setTimeout(function () { try { grow(); renderAnswerQuestions(); checkFields(); render(); } catch (e) {} }, 0); }
    ask.addEventListener('click', function () {
      var q = askText(); if (!q) return;
      var done = function (ok) { askNote.textContent = ok ? 'Copied: "' + q + '". Paste it into Google, ChatGPT, Perplexity, Claude and Copilot, then paste each full answer back here.' : 'Copy this search question by hand: ' + q; if (ok) flash(ask, 'Copied ✓', 'Copy search question', askNote); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(q).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
    // Each answer field says at once when its text is not an answer to the keyword (same check the server applies).
    function checkFields() {
      var L = lib(), q = val('pwbKeyword'), aq = (currentInputs().ai_question || {}).text || '';
      FIELDS.forEach(function (f) {
        var el = $(f[1]); if (!el) return;
        var note = document.getElementById(f[1] + '-cs-invalid'), v = String(el.value || '').trim();
        var chk = !L || !L.validateAnswer ? { valid: true } : f[0] === 'google_aio' ? L.validateGoogle(v, val('pwbGoogleSource'), q, true, aq)
          : v ? L.validateAnswer(v, q, aq) : { valid: false, status: 'not_checked' };
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
      if (!L) { status.dataset.state = 'error'; status.textContent = 'Answer validation is unavailable. Refresh the page before continuing.'; editor.value = ''; copy.disabled = true; return; }
      var saved = savedResearch(input.query);
      choice.hidden = !saved;
      if (saved && !choice.options.length) {
        choice.append(new Option('Prompt for the current inputs', 'current'), new Option('Prompt used for the generated Brief (saved)', 'saved'));
      }
      var research = saved && choice.value === 'saved' ? saved : L.makePrewriteAiAnswerResearch(input);
      if (!research.query) {
        status.dataset.state = 'error'; status.textContent = 'Enter the target keyword above to start.';
        editor.value = ''; copy.disabled = true; return;
      }
      var n = research.answers_valid, obs = research.observations;
      var invalid = obs.filter(function (x) { return x.validation_status === 'invalid'; });
      var notChecked = obs.filter(function (x) { return !x.checked && x.validation_status !== 'invalid' && x.validation_status !== 'no_ai_overview'; }).map(function (x) { return x.label; });
      var warned = obs.filter(function (x) { return x.checked && (x.warnings || []).length; }).map(function (x) { return x.label; });
      status.dataset.state = n === research.systems_total ? 'complete' : n ? 'partial' : 'none';
      if (invalid.length) status.dataset.state = n ? 'partial' : 'error';
      // Clear, task-based guidance for owners. Detailed observation metadata remains in saved research.
      status.textContent = n + ' of 5 AI answers ready.' +
        (invalid.length ? ' ' + invalid.length + ' answer' + (invalid.length === 1 ? ' needs' : 's need') + ' correction — see the message below the corresponding field.' : '') +
        (research.google_no_ai_overview ? ' No Google AI Overview appeared; use a Gemini answer if you need the Google result.' : '') +
        (n === research.systems_total ? ' Ready for Analyse & create.' : ' Add the remaining answers when available.');
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
      var el = $(id), onEdit = function () { checkFields(); syncAsk(); render(); };
      if (el) { el.addEventListener('input', onEdit); if (el.tagName === 'SELECT') el.addEventListener('change', onEdit); }
    });
    copy.addEventListener('click', function () {
      editor.focus(); editor.select();
      var done = function (ok) { copied.textContent = ok ? 'Copied — the complete prompt is on your clipboard.' : 'Select the text and copy it with Ctrl+C / Cmd+C.'; if (ok) flash(copy, 'Copied ✓', 'Copy Research Prompt', null); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(editor.value).then(function () { done(true); }, function () { done(false); });
      else { var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); }
    });
    select(false); checkFields(); syncAsk(); render();
    // The parent Tracker fills the Brief's keyword and existing answers programmatically
    // after the modal has been installed. Setting input.value does not dispatch an input
    // event. Refresh the visible guidance when that canonical form state changes.
    var lastFormState = '';
    function refreshFromForm() {
      var modal = $('prewriteBriefModal');
      if (modal && !modal.getClientRects().length) return;
      var state = JSON.stringify(currentInputs());
      if (state === lastFormState) return;
      lastFormState = state;
      checkFields(); syncAsk(); render();
      // Keyword or market set by the Tracker (no input event): choose the question for it as well.
      if (val('pwbKeyword') !== qState.kw && !(qState.manual && qState.kw === val('pwbKeyword'))) scheduleQuestion();
    }
    refreshFromForm();
    var formSync = setInterval(refreshFromForm, 400);
    window.addEventListener('pagehide', function () { clearInterval(formSync); }, { once: true });
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
