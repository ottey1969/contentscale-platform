/* Pre-Write Brief: a discoverable, read-only research-prompt tab.
 * The existing AI-answer fields and server are the source of truth.
 * This UI never claims to check citations or fabricate AI answers.
 */
(function () {
  'use strict';
  var MARKER = 'AI Answer Research — Write for Citation Potential';
  var SYSTEMS = [
    ['Google AI Overviews / Gemini', /google.?aio|gemini|google.?ai.?overview/i],
    ['ChatGPT Search', /chatgpt/i],
    ['Perplexity', /perplexity/i],
    ['Claude', /claude/i],
    ['Microsoft Copilot', /copilot|bing.?chat/i]
  ];
  function visibleText(el) {
    return [(el.getAttribute('aria-label') || ''), (el.getAttribute('placeholder') || ''),
      (el.getAttribute('name') || ''), (el.id || ''), (el.closest('label')?.textContent || '')].join(' ');
  }
  function researchFields() {
    var fields = Array.from(document.querySelectorAll('textarea,input[type="text"],input[type="search"],input:not([type])'));
    return SYSTEMS.map(function (system) {
      var matched = fields.find(function (el) { return system[1].test(visibleText(el)); });
      return { name: system[0], text: matched && matched.value ? matched.value.trim().slice(0,16000) : '' };
    });
  }
  function keyword() {
    var fields = Array.from(document.querySelectorAll('input,textarea'));
    var matched = fields.find(function (el) { return /seed.?keyword|target.?keyword|focus.?keyword|seed.?query/i.test(visibleText(el)); });
    return matched && matched.value ? matched.value.trim().slice(0,350) : '[target query from Pre-Write Brief]';
  }
  function buildPrompt() {
    var answers = researchFields(), completed = answers.filter(function (x) { return x.text; }).length;
    return [
      'AI ANSWER RESEARCH — WRITE FOR CITATION POTENTIAL',
      'Target query: ' + keyword(),
      'Research coverage: ' + completed + ' of 5 answers captured. Missing answers must remain NOT CHECKED.',
      '',
      'PURPOSE',
      'Study the five available AI answers to write a clearer, original, independently sourced answer with citation potential. This is pre-publication research, NOT citation or ranking tracking.',
      '',
      'OBSERVED ANSWERS (UNVERIFIED)',
      ...answers.map(function (x) { return x.name + ':\n' + (x.text || 'NOT CHECKED — do not invent an answer.'); }),
      '',
      'WRITING INSTRUCTIONS',
      '1. Compare what each observed answer explains, omits, oversimplifies or gets wrong. Do not treat an AI answer as independent verification.',
      '2. Identify unanswered user questions, useful factual qualifiers, original examples and evidence gaps.',
      '3. Treat URLs found inside AI answers as source leads only. Independently open and verify original sources before citing.',
      '4. Propose a direct answer, helpful outline, meaningful FAQ, original expert insights where evidenced, and a fact-check list.',
      '5. Do not copy AI output. Clearly distinguish verified facts, editorial hypotheses and unknowns.',
      '6. Respect search intent, existing target URLs and cannibalization checks; do not recommend duplicate pages.',
      '7. Never claim the domain is cited, promise quick citations or confuse this writing research with the Tracker citation-monitoring step.',
      '',
      'REQUIRED OUTPUT: direct answer; missing questions; evidence/source verification tasks; distinctive insights; proposed outline; original examples; limitations; fact-check-before-publishing.'
    ].join('\n');
  }
  function addStyles() {
    if (document.getElementById('cs-research-tab-style')) return;
    var css = document.createElement('style');
    css.id = 'cs-research-tab-style';
    css.textContent = '#cs-research-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#cs-research-tabs button{border:1px solid #64748b;border-radius:7px;padding:9px 14px;background:transparent;color:inherit;cursor:pointer;font-weight:650}#cs-research-tabs button[aria-selected="true"]{background:#2563eb;color:#fff;border-color:#2563eb}#cs-research-prompt-panel{border:1px solid #475569;border-radius:10px;padding:16px;margin:12px 0;background:rgba(15,23,42,.94);color:#e2e8f0}#cs-research-prompt-panel textarea{display:block;width:100%;min-height:360px;padding:12px;background:#090f1e;color:#e2e8f0;border:1px solid #64748b;border-radius:7px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.55}#cs-research-prompt-panel p{margin:8px 0;color:#cbd5e1}#cs-research-prompt-panel button{padding:8px 14px;background:#2563eb;color:white;border:0;border-radius:6px;cursor:pointer}';
    document.head.appendChild(css);
  }
  function install() {
    if (document.getElementById('cs-research-tabs')) return true;
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,strong,legend,summary,label,div,span,p');
    var heading = Array.from(nodes).find(function (el) {
      return el.children.length === 0 && el.textContent && el.textContent.trim() === MARKER;
    });
    if (!heading) return false;
    addStyles();
    var tabs = document.createElement('div');
    tabs.id = 'cs-research-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Pre-Write Brief AI research');
    var inputs = document.createElement('button'), prompt = document.createElement('button');
    inputs.type = prompt.type = 'button';
    inputs.textContent = 'AI Answer Inputs';
    prompt.textContent = 'Research Prompt';
    inputs.id = 'cs-research-inputs-tab';
    prompt.id = 'cs-research-prompt-tab';
    [inputs,prompt].forEach(function (el) { el.setAttribute('role','tab'); tabs.appendChild(el); });
    var panel = document.createElement('section');
    panel.id = 'cs-research-prompt-panel';
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',prompt.id);
    panel.hidden = true;
    var description = document.createElement('p');
    description.textContent = 'The prompt uses available inputs for writing research, not citation tracking. Existing Pre-Write Brief fields remain the saved source of truth.';
    var editor = document.createElement('textarea');
    editor.readOnly = true;
    editor.setAttribute('aria-label','Generated AI answer research prompt');
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy Research Prompt';
    copy.addEventListener('click',function () {
      editor.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(editor.value).then(function () { copy.textContent = 'Copied'; }, function () { copy.textContent = 'Select text to copy'; });
      } else { copy.textContent = 'Select text to copy'; }
    });
    panel.append(description,editor,copy);
    heading.insertAdjacentElement('afterend',tabs);
    tabs.insertAdjacentElement('afterend',panel);
    function toggle(show) {
      inputs.setAttribute('aria-selected',String(!show));
      prompt.setAttribute('aria-selected',String(show));
      panel.hidden = !show;
      if (show) editor.value = buildPrompt();
    }
    inputs.addEventListener('click',function () { toggle(false); });
    prompt.addEventListener('click',function () { toggle(true); });
    toggle(false);
    return true;
  }
  function boot() {
    if (install()) return;
    var observer = new MutationObserver(function () { if (install()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('pagehide',function () { observer.disconnect(); },{once:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
