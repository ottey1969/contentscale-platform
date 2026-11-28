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
      try { const body = await response.json(); if (body && body.code === 'WEEKLY_LIMIT' && typeof body.error === 'string') failure.message = body.error, failure.limit = true; } catch {}
      throw failure;
    }
    return response.json();
  }

  // The five AI systems (owner 2026-11-28), sent with a new brief and with a correction afterwards.
  const evidence = form => ({
    ai_question: form.get('ai-question') || '', google_source: form.get('google-source') || '',
    google_aio: form.get('ai-google_aio') || '', chatgpt: form.get('ai-chatgpt') || '', perplexity: form.get('ai-perplexity') || '',
    claude: form.get('ai-claude') || '', copilot: form.get('ai-copilot') || ''
  });
  if (intake) {
    intake.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = intake.querySelector('button');
      submit.disabled = true;
      status.textContent = labels[6];
      if (!validKey(key)) {
        key = newKey();
      }
      const form = new FormData(intake);
      const resultPath = root + '/r?lang=' + lang + '#' + key;
      try {
        await call('', { website: form.get('website'), keyword: form.get('keyword'), slug: form.get('slug') || '', email: form.get('email'), region: form.get('country'), language: lang, pricingSource: form.get('pricing-source'), manualAiEvidence: evidence(form) });
        location.assign(resultPath);
      } catch (error) {
        status.textContent = error.limit ? error.message : labels[7];
        if (error.limit) key = '';
        submit.disabled = false;
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
    adjust.elements.intent.value = result.brief.search_intent?.user_override || '';
    const repair = element('repair-pricing');
    repair.hidden = pricing?.state !== 'needs_input' || result.status !== 'open';
    repair.onclick = async () => {
      const source = adjust.elements['pricing-source'];
      if (!source.value || !source.reportValidity()) { source.focus(); return; }
      repair.disabled = true;
      const revisionKey = newKey();
      try {
        await call('/repair-pricing', { pricingSource: source.value, revisionKey });
        history.replaceState(null, '', root + '/r?lang=' + lang + '#' + revisionKey);
        location.reload();
      } catch {
        reportError();
        repair.disabled = false;
      }
    };
    adjust.onsubmit = async event => {
      event.preventDefault();
      const previousKey = key;
      key = newKey();
      adjust.querySelector('button[type=submit]').disabled = true;
      try {
        await call('', { website: result.website, keyword: result.keyword, region: result.region, language: result.language,
          intentOverride: adjust.elements.intent.value, pricingSource: adjust.elements['pricing-source'].value, manualAiEvidence: evidence(new FormData(adjust)),
          // A correction keeps the page address of the brief it corrects.
          slug: result.target && result.target.mode === 'CREATE' ? (() => { try { return new URL(result.target.url).pathname; } catch { return ''; } })() : '',
          // A correction of this brief, not a new one: it does not use the weekly free brief.
          revisionOf: previousKey });
        history.replaceState(null, '', root + '/r?lang=' + lang + '#' + key);
        location.reload();
      } catch (error) {
        key = previousKey;
        if (error.limit) status.textContent = error.message; else reportError();
        adjust.querySelector('button[type=submit]').disabled = false;
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
    const editorText = result.instructions + '\n\n' + JSON.stringify(display.editor_brief, null, 2);
    element('editor').value = editorText;
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
      button.disabled = true;
      try {
        await call(path, payload());
        status.textContent = labels[success];
        await render();
      } catch {
        status.textContent = labels[failure];
        button.disabled = false;
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
