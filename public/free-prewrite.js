(() => {
  'use strict';

  const root = '/free-pre-write';
  const api = '/api/free-pre-write';
  const lang = document.documentElement.lang;
  const labels = window.prewriteLabels;
  const status = document.getElementById('status');
  const intake = document.getElementById('intake');
  const validKey = value => /^[a-f0-9]{64}$/.test(value);
  let key = location.hash.slice(1);
  let downloadUrl;
  const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
  const element = id => document.getElementById(id);
  // Every button shows it is working while its request runs (owner 2026-11-28: "generate brief en alle andere knoppen
  // animatie").
  const busy = (button, on) => { if (!button) return; button.disabled = on; if (on) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy'); };
  async function call(path, body) {
    const headers = { Authorization: 'Bearer ' + key };
    const options = { headers, cache: 'no-store' };
    if (body !== undefined) {
      options.method = 'POST';
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(api + path, options);
    if (!response.ok) {
      // The weekly limit says until when, in the page language (owner 2026-11-28).
      const failure = Error('Request failed');
      // The weekly limit and an invalid field say what is wrong, in the page language (owner 2026-11-28).
      try { const body = await response.json(); if (body && typeof body.error === 'string' && body.error) failure.message = body.error, failure.limit = true; } catch {}
      throw failure;
    }
    return response.json();
  }

  // Pasted text is remembered in this browser until the brief has started (owner 2026-11-28: "de tekst die ik plak moet
  // onthouden worden"), so a refresh or an error never loses the AI answers.
  function remember(form, storageKey) {
    if (!form) return { clear() {} };
    const fields = () => Array.from(form.querySelectorAll('input[name], textarea[name], select[name]')).filter(el => el.type !== 'checkbox' && el.type !== 'hidden');
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const el of fields()) if (typeof saved[el.name] === 'string' && saved[el.name] && !el.value) el.value = saved[el.name];
    } catch {}
    const save = () => { try { const data = {}; for (const el of fields()) if (el.value) data[el.name] = el.value; localStorage.setItem(storageKey, JSON.stringify(data)); } catch {} };
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    return { clear() { try { localStorage.removeItem(storageKey); } catch {} } };
  }
  // The research prompt of the Tracker Pre-Write, filled in for the question (or the topic when the question is empty),
  // so the owner only copies and pastes it into each AI system (owner 2026-11-28).
  function wirePrompt(form, topic) {
    if (!form) return;
    const box = form.querySelector('.ai-prompt'), question = form.querySelector('[name=ai-question]');
    const copy = form.querySelector('.ai-prompt-copy'), note = form.querySelector('.ai-prompt-status');
    const lib = window.PrewriteAiAnswerResearch;
    if (!box || !question || !lib || !lib.buildCustomerResearchPrompt) return;
    const texts = window.prewritePromptTexts || [];
    const update = () => { box.value = lib.buildCustomerResearchPrompt(question.value.trim() || topic()); };
    question.addEventListener('input', update);
    const keyword = form.querySelector('[name=keyword]');
    if (keyword) keyword.addEventListener('input', update);
    update();
    form.__updatePrompt = update;
    copy.addEventListener('click', async () => {
      update();
      copy.classList.remove('done'); void copy.offsetWidth; copy.classList.add('done');
      try { await navigator.clipboard.writeText(box.value); note.textContent = texts[2] || 'Copied.'; }
      catch { box.focus(); box.select(); note.textContent = texts[3] || ''; }
    });
  }
  // The five AI systems (owner 2026-11-28), sent with a new brief and with a correction afterwards.
  const evidence = form => ({
    ai_question: form.get('ai-question') || '', google_source: form.get('google-source') || '',
    google_aio: form.get('ai-google_aio') || '', chatgpt: form.get('ai-chatgpt') || '', perplexity: form.get('ai-perplexity') || '',
    claude: form.get('ai-claude') || '', copilot: form.get('ai-copilot') || ''
  });
  if (intake) {
    const draft = remember(intake, 'cs-free-prewrite:intake:' + lang);
    // Before anyone fills in the form: how many free briefs are left today and whether this computer may start one.
    (async () => {
      const box = element('availability');
      if (!box) return;
      try {
        const response = await fetch(api + '/availability?lang=' + lang, { cache: 'no-store' });
        const info = await response.json();
        if (!info || !info.message) return;
        let text = info.message;
        if (info.reason === 'DAILY_TOTAL' && info.daily_resets_at) {
          const at = new Date(info.daily_resets_at);
          if (!Number.isNaN(at.getTime())) text += ' (' + at.toLocaleString(document.documentElement.lang, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + ')';
        }
        box.textContent = text;
        box.className = info.can_start ? 'note' : 'note blocked';
        if (!info.can_start) intake.querySelector('button[type=submit]').disabled = true;
      } catch {}
    })();
    wirePrompt(intake, () => (intake.querySelector('[name=keyword]').value || '').trim());
    intake.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = intake.querySelector('button[type=submit]');
      busy(submit, true);
      status.textContent = labels[6];
      if (!validKey(key)) {
        key = newKey();
      }
      const form = new FormData(intake);
      const resultPath = root + '/r?lang=' + lang + '#' + key;
      try {
        await call('', { website: form.get('website'), keyword: form.get('keyword'), email: form.get('email'), region: form.get('country'), language: lang, pricingSource: form.get('pricing-source'), manualAiEvidence: evidence(form) });
        draft.clear();
        location.assign(resultPath);
      } catch (error) {
        status.textContent = error.limit ? error.message : labels[7];
        if (error.limit) key = '';
        busy(submit, false);
      }
    });
    element('reopen').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const url = new URL(new FormData(event.target).get('link'));
        if (url.origin !== location.origin || url.pathname !== root + '/r' || !validKey(url.hash.slice(1))) throw Error();
        location.assign(url.href);
      } catch {
        status.textContent = labels[7];
      }
    });
    return;
  }

  function addText(parent, tag, text) {
    const child = document.createElement(tag);
    child.textContent = text;
    parent.append(child);
    return child;
  }
  function renderHistory(history) {
    const entries = element('entries');
    entries.replaceChildren();
    for (const entry of history) {
      const details = document.createElement('details');
      addText(details, 'summary', entry.recorded_at + ' · ' + entry.report.status);
      addText(details, 'pre', entry.owner_report);
      for (const proof of [...(entry.live_verification_history || []), ...[entry.live_verification].filter(Boolean)]) {
        addText(details, 'p', proof.observed_at + ' · ' + proof.source + ' · ' + proof.url);
      }
      entries.append(details);
    }
  }
  // The waiting page: the real research step from the server, with a moving bar so the visitor sees it works.
  function showProgress(progress) {
    const box = element('progress');
    if (!box) return;
    const steps = window.prewriteSteps || [];
    const step = Math.min(5, Math.max(1, Number(progress && progress.step) || 1));
    box.hidden = false;
    element('progress-step').textContent = (steps[5] || '§').replace('§', step) + ' · ' + (steps[step - 1] || '');
    Array.from(element('progress-list').children).forEach((item, index) => {
      item.className = index + 1 < step ? 'done' : index + 1 === step ? 'now' : '';
    });
    element('progress-bar').style.width = Math.round(((step - 1) + 0.5) / 5 * 100) + '%';
    const seconds = Number(progress && progress.elapsed_seconds);
    if (Number.isFinite(seconds)) element('progress-time').textContent = (steps[6] || '') + ' ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  async function render() {
    const result = await call('/result');
    if (result.status === 'generating') {
      status.textContent = labels[6];
      showProgress(result.progress);
      setTimeout(() => render().catch(reportError), 2500);
      return;
    }
    if (element('progress')) element('progress').hidden = true;
    if (!result.target) {
      if (Object.keys(result.brief || {}).length) {
        element('research').textContent = JSON.stringify(result.brief, null, 2);
        element('history').hidden = false;
      }
      throw Error('Brief unavailable');
    }
    element('decision').hidden = false;
    const card = element('decision');
    card.replaceChildren();
    addText(card, 'h2', result.target.mode + ' · ' + result.target.url);
    const reason = result.brief.content_decision?.reason;
    if (reason) addText(card, 'p', reason);
    // Why links are or are not in the brief (owner 2026-11-28): never a silent empty list.
    for (const side of ['internal', 'external']) {
      const research = result.brief.link_research?.[side];
      if (research?.reason && research.state !== 'ok') addText(card, 'p', research.reason);
    }
        const pricing = result.brief.missing_information;
    if (pricing?.state === 'needs_input') addText(card, 'p', window.prewritePricingHelp);
    const adjust = element('intent-adjust');
    adjust.hidden = result.status === 'published';
    if (!adjust.__updatePrompt) { adjust.__draft = remember(adjust, 'cs-free-prewrite:adjust:' + key); wirePrompt(adjust, () => result.keyword || ''); }
    adjust.elements.intent.value = result.brief.search_intent?.user_override || '';
    const repair = element('repair-pricing');
    repair.hidden = pricing?.state !== 'needs_input' || result.status !== 'open';
    repair.onclick = async () => {
      const source = adjust.elements['pricing-source'];
      if (!source.value || !source.reportValidity()) { source.focus(); return; }
      busy(repair, true);
      const revisionKey = newKey();
      try {
        await call('/repair-pricing', { pricingSource: source.value, revisionKey });
        history.replaceState(null, '', root + '/r?lang=' + lang + '#' + revisionKey);
        location.reload();
      } catch {
        reportError();
        busy(repair, false);
      }
    };
    adjust.onsubmit = async event => {
      event.preventDefault();
      const previousKey = key;
      key = newKey();
      busy(adjust.querySelector('button[type=submit]'), true);
      try {
        await call('', { website: result.website, keyword: result.keyword, region: result.region, language: result.language,
          intentOverride: adjust.elements.intent.value, pricingSource: adjust.elements['pricing-source'].value, manualAiEvidence: evidence(new FormData(adjust)),
          // A correction of this brief, not a new one: it does not use the weekly free brief.
          revisionOf: previousKey });
        if (adjust.__draft) adjust.__draft.clear();
        history.replaceState(null, '', root + '/r?lang=' + lang + '#' + key);
        location.reload();
      } catch (error) {
        key = previousKey;
        if (error.limit) status.textContent = error.message; else reportError();
        busy(adjust.querySelector('button[type=submit]'), false);
      }
    };
    const research = JSON.stringify(result.brief, null, 2);
    element('research').textContent = research;
    element('history').hidden = false;
    if (result.growth_url) {
      const link = addText(card, 'a', labels[8]);
      link.href = result.growth_url + '#prewrite=' + key;
      return;
    }
    const display = await call('/implementation-report');
    renderHistory(display.history);
    element('implementation').hidden = false;
    element('handoff').hidden = false;
    const editorText = result.instructions + '\n\n' + JSON.stringify(display.editor_brief, null, 2);
    element('editor').value = editorText;
    const copyBrief = element('copy-brief');
    if (copyBrief && !copyBrief.__wired) {
      copyBrief.__wired = true;
      copyBrief.addEventListener('click', async () => {
        const note = element('copy-brief-status');
        try { await navigator.clipboard.writeText(element('editor').value); note.textContent = (window.prewriteWorkflow || {}).copied || 'Copied.'; }
        catch { element('editor').focus(); element('editor').select(); }
        copyBrief.classList.remove('done'); void copyBrief.offsetWidth; copyBrief.classList.add('done');
      });
    }
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([editorText], { type: 'text/plain;charset=utf-8' }));
    element('download').href = downloadUrl;
    element('verify').disabled = result.status !== 'published';
    element('publish').disabled = result.status !== 'approved' || pricing?.state === 'needs_input';
    element('save').disabled = result.status !== 'approved';
    element('approve').disabled = result.status === 'published';
  }
  const reportError = () => { status.textContent = labels[7]; };
  function action(id, path, payload, success, failure) {
    const button = element(id);
    button.addEventListener('click', async () => {
      busy(button, true);
      try {
        await call(path, payload());
        button.removeAttribute('aria-busy');
        status.textContent = labels[success];
        await render();
      } catch {
        status.textContent = labels[failure];
        busy(button, false);
      }
    });
  }
  const report = () => ({ report: element('report').value });
  action('approve', '/approve', () => ({ text: element('copy').value }), 17, 7);
  action('save', '/implementation-report', report, 17, 7);
  action('publish', '/publish', report, 17, 7);
  action('verify', '/verify-live', () => ({}), 17, 18);
  if (validKey(key)) render().catch(reportError);
  else reportError();
})();
