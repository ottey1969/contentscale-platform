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
  // Switching language keeps the brief (its private key in the address) and the half-filled form (owner 2026-11-29).
  document.querySelectorAll('[data-lang-switch]').forEach(link => link.addEventListener('click', () => {
    link.href = link.pathname + link.search + (/^#[a-f0-9]{64}$/.test(location.hash) ? location.hash : '');
  }));
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
  // The owner fetches the answers instead of pasting them (owner 2026-11-28: "per vraag moet ik de search in AI kunnen
  // opvragen"). The server says whether this browser is the owner and which systems have a key; visitors see nothing.
  const ownerEngines = fetch(api + '/ai-answer/engines', { cache: 'no-store' }).then(r => r.ok ? r.json() : { owner: false }).catch(() => ({ owner: false }));
  function wireFetch(form, topic, country) {
    if (!form || form.__fetchWired) return;
    form.__fetchWired = true;
    const t = window.prewriteFetchTexts || [];
    ownerEngines.then(info => {
      if (!info || !info.owner) return;
      form.querySelectorAll('.ai-fetch-row').forEach(row => { row.hidden = false; });
      form.querySelectorAll('.ai-fetch').forEach(button => {
        if (!info.engines || !info.engines[button.dataset.engine]) { button.disabled = true; button.title = t[3] || ''; const note = form.querySelector('.ai-fetch-note[data-engine="' + button.dataset.engine + '"]'); if (note) note.textContent = t[3] || ''; }
      });
    });
    async function one(button) {
      const engine = button.dataset.engine, note = form.querySelector('.ai-fetch-note[data-engine="' + engine + '"]');
      const field = form.querySelector('[name="ai-' + engine + '"]');
      const question = ((form.querySelector('[name=ai-question]') || {}).value || '').trim() || topic();
      if (!question) { note.textContent = t[5] || ''; return; }
      busy(button, true); note.textContent = t[2] || '';
      try {
        const response = await fetch(api + '/ai-answer', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine, question, language: lang, country: country() }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) throw Error([body.status || String(response.status), body.code, body.detail, body.note].filter(Boolean).join(' · '));
        field.value = body.text || '';
        if (engine === 'google_aio' && body.google_source) { const select = form.querySelector('[name=google-source]'); if (select) select.value = body.google_source; }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        note.textContent = [body.provider, body.note].filter(Boolean).join(' · ');
      } catch (error) {
        note.textContent = (t[4] || 'Could not fetch') + ' (' + error.message + '). ' + (t[7] || '');
      } finally { busy(button, false); }
    }
    form.querySelectorAll('.ai-fetch').forEach(button => button.addEventListener('click', () => one(button)));
    const all = form.querySelector('.ai-fetch-all');
    if (all) all.addEventListener('click', async () => {
      busy(all, true);
      try { await Promise.all(Array.from(form.querySelectorAll('.ai-fetch')).filter(b => !b.disabled).map(one)); } finally { busy(all, false); }
    });
  }
  // The five AI systems (owner 2026-11-28), sent with a new brief and with a correction afterwards.
  const evidence = form => ({
    ai_question: form.get('ai-question') || '', google_source: form.get('google-source') || '',
    google_aio: form.get('ai-google_aio') || '', chatgpt: form.get('ai-chatgpt') || '', perplexity: form.get('ai-perplexity') || '',
    claude: form.get('ai-claude') || '', copilot: form.get('ai-copilot') || ''
  });
  if (intake) {
    // One draft for all page languages, so switching language keeps what was filled in (older per-language drafts are read once).
    try { if (!localStorage.getItem('cs-free-prewrite:intake')) { const old = localStorage.getItem('cs-free-prewrite:intake:' + lang); if (old) localStorage.setItem('cs-free-prewrite:intake', old); } } catch {}
    const draft = remember(intake, 'cs-free-prewrite:intake');
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
    wireFetch(intake, () => (intake.querySelector('[name=keyword]').value || '').trim(), () => (intake.querySelector('[name=country]').value || '').trim());
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
        await call('', { website: form.get('website'), keyword: form.get('keyword'), slug: form.get('slug') || '', email: form.get('email'), region: form.get('country'), language: lang, pricingSource: form.get('pricing-source'), manualAiEvidence: evidence(form) });
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
  // The brief in plain words above the copy buttons: for the owner and for a human writer (owner 2026-11-29).
  function renderReadable(editor, result) {
    const box = element('brief-readable'), t = window.prewriteReadable;
    if (!box || !t) return;
    const b = Object.assign({}, editor || {}, result.brief || {});
    box.replaceChildren();
    addText(box, 'p', t.intro).className = 'note';
    const arr = value => Array.isArray(value) ? value.filter(x => x !== null && x !== undefined && x !== '') : [];
    const str = value => typeof value === 'string' ? value.trim() : '';
    const section = title => addText(box, 'h3', title);
    const pairs = (rows, parent = box) => { const dl = document.createElement('dl'); for (const [k, v] of rows) if (k && v) { addText(dl, 'dt', k); addText(dl, 'dd', v); } if (dl.children.length) parent.append(dl); };
    const list = (items, ordered, parent = box) => { const el = document.createElement(ordered ? 'ol' : 'ul'); for (const item of items) if (item) addText(el, 'li', item); if (el.children.length) parent.append(el); return el; };
    const textOf = x => typeof x === 'string' ? x : (x && (x.name || x.text || x.value || x.title || x.url || x.question || x.q)) || '';
    const create = String(b.content_decision?.recommended_treatment || '').toUpperCase() !== 'EXPAND_EXISTING_PAGE';
    section(t.decision);
    pairs([[create ? t.create : t.expand, result.target?.url || '']]);
    if (str(b.content_decision?.reason)) addText(box, 'p', b.content_decision.reason);
    const m = b.meta_package || {};
    section(t.page);
    pairs([[t.h1, m.h1 || b.recommended_title_h1 || ''], [t.title, m.seo_title || ''], [t.description, m.meta_description || ''], [t.slug, m.url_slug || ''],
      [t.intent, (window.prewriteIntentTexts?.labels?.[b.search_intent?.primary] || b.search_intent?.primary || '')]]);
    const a = b.ai_answer || {};
    const opening = str(b.opening_passage?.direct_answer) || str(a.direct_answer);
    if (opening || arr(a.key_takeaways).length) {
      section(t.opening);
      if (opening) addText(box, 'p', opening);
      if (arr(a.key_takeaways).length) { addText(box, 'h4', t.takeaways); list(arr(a.key_takeaways).map(textOf)); }
      pairs([[t.who, str(a.who_is_it_for)], [t.why, str(a.why_it_matters)]]);
    }
    const facts = arr(b.quick_facts).filter(f => f && (f.label || f.value));
    if (facts.length) { section(t.facts); pairs(facts.map(f => [f.label || '', f.value || ''])); }
    const outline = arr(b.definitive_outline).length ? arr(b.definitive_outline) : arr(b.page_blueprint);
    if (outline.length) {
      section(t.outline);
      outline.forEach((x, i) => {
        addText(box, 'h4', (i + 1) + '. ' + (x.h2 || '') + (x.target_words ? ' · ' + t.words.replace('§', x.target_words) : ''));
        if (str(x.purpose)) addText(box, 'p', x.purpose);
        if (arr(x.cover).length) addText(box, 'p', t.cover + ': ' + arr(x.cover).map(textOf).join(' · '));
        if (str(x.citation_hook)) addText(box, 'p', t.hook + ': ' + x.citation_hook);
      });
    }
    const competitors = arr(b.competitor_table).filter(c => c && (c.what_they_have || c.the_gap || c.what_to_add));
    if (competitors.length) {
      section(t.competitors);
      addText(box, 'p', t.research).className = 'note';
      const table = document.createElement('table'), head = table.insertRow();
      for (const h of ['#', '', t.has, t.gap, t.add]) addText(head, 'th', h);
      competitors.forEach((c, i) => {
        const row = table.insertRow();
        addText(row, 'td', String(c.rank || i + 1));
        const who = document.createElement('td');
        addText(who, 'strong', c.page_title || c.domain || '');
        // Plain text, never a link: competitors are research only.
        if (/^https:[/][/]/i.test(String(c.exact_url || ''))) addText(who, 'div', c.exact_url).className = 'url'; else if (c.domain) addText(who, 'div', c.domain).className = 'url';
        row.append(who);
        addText(row, 'td', c.what_they_have || ''); addText(row, 'td', c.the_gap || ''); addText(row, 'td', c.what_to_add || '');
      });
      box.append(table);
    }
    const ai = b.ai_systems_analysis && typeof b.ai_systems_analysis === 'object' ? b.ai_systems_analysis : null;
    // The Google AI Overview gap: a list of cited sources from the generator ({source, what_they_do_well, our_gap, what_to_do}),
    // or plain text in older briefs.
    const gapLine = g => typeof g === 'string' ? g.trim() : g && typeof g === 'object'
      ? [g.source ? g.source + ': ' + (g.what_they_do_well || '') : str(g.what_they_do_well), g.our_gap ? t.ourGap + ': ' + g.our_gap : '', g.what_to_do ? t.toDo + ': ' + g.what_to_do : '']
        .map(x => String(x || '').trim()).filter(Boolean).join(' ') : '';
    const aioGap = [...(Array.isArray(b.aio_citation_gap) ? b.aio_citation_gap : [b.aio_citation_gap]).map(gapLine),
      str(typeof b.ai_overview_citation_strategy === 'string' ? b.ai_overview_citation_strategy : '')].filter(Boolean);
    const hostOf = u => { try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return String(u || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase(); } };
    const own = result.website ? hostOf(result.website) : '';
    if (ai || aioGap.length) {
      section(t.ai);
      const names = { google_aio: 'Google AI Overview / Gemini', chatgpt: 'ChatGPT Search', perplexity: 'Perplexity', claude: 'Claude', copilot: 'Microsoft Copilot' };
      for (const key of Object.keys(names)) {
        const x = ai && ai[key];
        const extra = key === 'google_aio' ? aioGap : [];
        if (!x && !extra.length) continue;
        const checked = !!(x && x.checked);
        addText(box, 'h4', names[key] + (checked || extra.length ? '' : ' · ' + t.notChecked));
        if (checked) {
          if (str(x.answer_summary)) addText(box, 'p', x.answer_summary);
          const recommends = arr(x.recommended_companies).map(textOf).join(', ');
          if (recommends) addText(box, 'p', t.recommends + ': ' + recommends);
          // Cited means the own domain among the cited domains or pages; a competitor page is not your site.
          const cited = !!own && [...arr(x.domain_citations), ...arr(x.exact_page_citations)].some(d => hostOf(d) === own);
          addText(box, 'p', t.ownCited + ': ' + (cited ? t.yes : t.no));
          const sources = arr(x.citation_sources).map(s => [s.source_name, s.exact_url].filter(Boolean).join(' · ')).filter(Boolean);
          if (sources.length) { addText(box, 'p', t.sources + ':'); list(sources); }
        // What this system needs to cite the page (citation_needs from the brief).
        const needs = arr(x.citation_needs).map(textOf).filter(Boolean);
        if (needs.length) { addText(box, 'p', (t.citedBy || '').replace('§', names[key].split(' /')[0])).className = 'cited-by'; list(needs); }
        }
        const needs = [...(checked ? arr(x.citation_needs).map(textOf) : []), ...extra].filter(Boolean);
        if (needs.length) { addText(box, 'p', t.aiGap + ':').className = 'label'; list(needs); }
      }
    }
    const links = arr(b.internal_link_targets).filter(x => x && x.link_to);
    if (links.length) { section(t.links); list(links.map(x => (x.anchor_text ? x.anchor_text + ' → ' : '') + x.link_to + (str(x.why || x.reason) ? ' (' + str(x.why || x.reason) + ')' : ''))); }
    const external = arr(b.external_link_targets).filter(x => x && (x.exact_url || x.url));
    if (external.length) { section(t.external); list(external.map(x => [x.anchor_text || x.source_name || x.page_title || '', x.exact_url || x.url, x.supports_claim || x.supports || ''].filter(Boolean).join(' · '))); }
    const e = b.entity_strategy || {};
    if (arr(e.primary).length || arr(e.secondary).length || arr(e.relationships).length) {
      section(t.entities);
      pairs([[t.core, arr(e.primary).map(textOf).join(', ')], [t.secondary, arr(e.secondary).map(textOf).join(', ')], [t.supporting, arr(e.supporting).map(textOf).join(', ')]]);
      const rels = arr(e.relationships).filter(r => r && r.subject && r.object);
      if (rels.length) { addText(box, 'h4', t.relations); list(rels.map(r => r.subject + ' → ' + (r.relation || '') + ' → ' + r.object)); }
    }
    const paa = arr(b.paa_questions).filter(x => x && x.q);
    const ideas = [...new Set([...arr(b.faq_questions).map(textOf), ...arr(a.secondary_questions).map(textOf)].filter(q => q && !paa.some(p => p.q === q)))];
    if (paa.length || ideas.length) {
      section(t.questions);
      paa.forEach(x => { addText(box, 'h4', x.q); if (str(x.a)) addText(box, 'p', x.a); });
      if (ideas.length) { addText(box, 'h4', t.faqIdeas); list(ideas); }
    }
    const ev = b.evidence || {};
    const leads = arr(b.ai_source_leads).map(x => typeof x === 'string' ? x : x && x.url).filter(u => /^https:[/][/]/i.test(String(u || '')));
    if (arr(ev.trust_signals).length || str(ev.experience_to_include) || leads.length) {
      section(t.eeat);
      if (arr(ev.trust_signals).length) { addText(box, 'h4', t.trust); list(arr(ev.trust_signals).map(textOf)); }
      if (str(ev.experience_to_include)) { addText(box, 'h4', t.experience); addText(box, 'p', ev.experience_to_include); }
      if (leads.length) { addText(box, 'h4', t.leads); list([...new Set(leads)]); }
    }
    const bal = b.balance || {};
    const comparisons = arr(bal.comparisons).filter(c => c && (c.a || c.b));
    if (arr(bal.limitations).length || arr(bal.who_should_not_use_it).length || comparisons.length) {
      section(t.balance);
      if (arr(bal.limitations).length) { addText(box, 'h4', t.limits); list(arr(bal.limitations).map(textOf)); }
      if (arr(bal.who_should_not_use_it).length) { addText(box, 'h4', t.notFor); list(arr(bal.who_should_not_use_it).map(textOf)); }
      if (comparisons.length) { addText(box, 'h4', t.compare); list(comparisons.map(c => (c.a || '') + ' vs ' + (c.b || '') + (c.why_it_matters ? ': ' + c.why_it_matters : ''))); }
    }
    const uses = arr(b.use_cases).filter(u => u && (u.audience || u.scenario));
    if (uses.length) { section(t.useCases); list(uses.map(u => [u.audience, u.scenario].filter(Boolean).join(': ') + (u.benefit ? ' → ' + u.benefit : ''))); }
    const c = b.conclusion || {};
    if (str(c.recap) || str(c.outlook) || str(c.recommendation)) { section(t.conclusion); pairs([[t.recap, str(c.recap)], [t.outlook, str(c.outlook)], [t.recommendation, str(c.recommendation)]]); }
    // A named quality warning (owner 2026-11-28): fewer than 2 official sources no longer fails the brief, but is said here.
    const warnings = arr(b.ai_quality_check?.quality_warnings).includes('official_sources') && t.noOfficial ? [t.noOfficial] : [];
    const verify = [...warnings, ...arr(b.fact_safety?.verify_first).map(textOf)];
    if (verify.length) { section(t.verify); list(verify); }
    const plan = arr(b.action_plan).map(x => x && x.action).filter(Boolean);
    if (plan.length) { section(t.plan); list(plan, true); }
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
    // Made, but not passed: say so and why, in plain words, above the brief (owner 2026-11-28).
    const notPassedBox = element('not-passed'), np = window.prewriteNotPassed;
    if (notPassedBox) {
      notPassedBox.replaceChildren();
      notPassedBox.hidden = !(result.not_passed && np);
      if (result.not_passed && np) {
        addText(notPassedBox, 'strong', np.title);
        const names = [...new Set((result.not_passed.missing || []).map(code => (np.names && np.names[code]) || np.other))];
        if (names.length) { addText(notPassedBox, 'p', np.missing + ':'); const ul = document.createElement('ul'); names.forEach(n => addText(ul, 'li', n)); notPassedBox.append(ul); }
        addText(notPassedBox, 'p', np.next);
      }
    }
    // Why links are or are not in the brief (owner 2026-11-28): never a silent empty list.
    for (const side of ['internal', 'external']) {
      const research = result.brief.link_research?.[side];
      if (research?.reason && research.state !== 'ok') addText(card, 'p', research.reason);
    }
        const pricing = result.brief.missing_information;
    if (pricing?.state === 'needs_input') addText(card, 'p', window.prewritePricingHelp);
    const adjust = element('intent-adjust');
    adjust.hidden = result.status === 'published';
    if (!adjust.__updatePrompt) { adjust.__draft = remember(adjust, 'cs-free-prewrite:adjust:' + key); wirePrompt(adjust, () => result.keyword || ''); wireFetch(adjust, () => result.keyword || '', () => result.region || ''); }
    adjust.elements.intent.value = result.brief.search_intent?.user_override || '';
    // A correction starts from the AI answers of this brief (owner 2026-11-28: "weer handmatig plakken is niet slim").
    // Only empty fields are filled, so a draft the visitor already changed is kept; every answer can still be replaced.
    const saved = result.brief.ai_system_evidence || {};
    const fill = (name, value) => { const el = adjust.elements[name]; if (el && !el.value && typeof value === 'string' && value.trim()) el.value = value; };
    for (const engine of ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot']) if (saved[engine]?.checked) fill('ai-' + engine, saved[engine].text);
    fill('google-source', saved.google_aio?.google_source);
    fill('ai-question', result.brief.customer_question?.text || result.brief.prewrite_ai_answer_research?.ai_question?.text);
    // The intent the brief uses now, whether it follows Google or the owner, and the evidence for it.
    const current = element('intent-current'), it = window.prewriteIntentTexts, si = result.brief.search_intent;
    if (current && it && si && si.primary) {
      const name = value => (it.labels && it.labels[value]) || value;
      const parts = [it.now + ': ' + name(si.primary) + ' (' + (si.user_override || si.overridden ? it.owner : it.auto) + ')'];
      const also = (si.secondary_intents || []).filter(value => value && value !== si.primary);
      if (also.length) parts.push(it.also + ': ' + also.map(name).join(', '));
      if ((si.evidence || []).length) parts.push(it.why + ': ' + si.evidence.join('; '));
      current.textContent = parts.join(' · ');
    }
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
          // A correction keeps the page address of the brief it corrects.
          slug: result.target && result.target.mode === 'CREATE' ? (() => { try { return new URL(result.target.url).pathname; } catch { return ''; } })() : '',
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
    renderReadable(display.editor_brief || {}, result);
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
    element('approve').disabled = result.status === 'published' || !!result.not_passed;
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
