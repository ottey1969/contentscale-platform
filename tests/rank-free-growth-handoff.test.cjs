'use strict';
// Rank tracker → free Growth check, end to end (owner 2026-11-11): the real rank tracker and Free Growth routes, the real
// Free Growth store in Postgres and the form in a browser. Only the outside world is replaced (TEST pages and TEST Google).
// 1. The tracker's link opens the Growth check with the page, the keyword as topic, market, language and a signed handoff.
// 2. The form shows the topic and fills in the owner's e-mail address; the question stays empty.
// 3. The check picks the best real customer question about the topic (not the keyword itself).
// 4. Recording the publication date marks the keyword "changed" in the tracker, with its position on that day.
// Runs only with PREWRITE_E2E_DATABASE_URL (a local, disposable PostgreSQL) and Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null, chromium = null; try { pg = require('pg'); } catch (e) {} try { ({ chromium } = require('playwright')); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg ? 'pg not installed' : !chromium && 'Playwright not installed';
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-handoff';
process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || 'TEST-serper-key'; // the TEST Google below answers, never Serper

const PAGE = 'https://es.acme-geo.example/consultor-geo/';
const html = '<html lang="es"><head><title>Consultor GEO | Acme</title></head><body><h1>Consultor GEO</h1><h2>Qué hace un consultor GEO</h2><p>Un consultor GEO ayuda a que las respuestas de la IA citen tu web, revisando contenido, fuentes y estructura de cada página importante del sitio.</p><h2>Cómo trabajamos</h2><p>Analizamos qué preguntas hacen tus clientes, qué páginas posicionan y qué falta en la tuya, y te damos un plan claro antes de cambiar nada.</p></body></html>';
const comp = (h, b) => '<html><body><article><h1>' + h + '</h1><h2>' + h + '</h2><p>' + b + '</p></article></body></html>';
const OTHERS = { 'https://geo-a.example/consultor/': comp('Consultor GEO en Madrid', 'Un consultor GEO revisa cómo aparece tu marca en ChatGPT, Perplexity y AI Overviews, y explica qué fuentes usan esas respuestas para cada pregunta de tus clientes.'),
  'https://geo-b.example/servicios/geo/': comp('Servicio de consultoría GEO', 'La consultoría GEO empieza con las preguntas reales de los clientes y compara las páginas que la IA cita con la tuya, para decidir qué añadir primero.') };

test('rank tracker → free Growth check: topic, e-mail, best customer question, and the publication date back in the tracker', { skip, timeout: 180000 }, async () => {
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');
  const { memoryStore } = require('../src/rank-free/store.cjs');
  const { rankHandoff } = require('../src/rank-free/handoff.cjs');
  const links = require('../src/rank-free/links.cjs');
  const pool = new pg.Pool({ connectionString: DB });
  const store = memoryStore(), questionSearches = [];
  const email = 'test-' + crypto.randomBytes(3).toString('hex') + '@acme-geo.example';
  const { project } = await store.upsertSignup({ email, lang: 'es', ipHash: 'ip', consent: false, verifyHash: 'v', host: 'acme-geo.example', gl: 'es', hl: 'es', keywords: ['consultor geo'] });
  await store.verify('v', links.newNonce(), new Date('2026-11-01T10:00:00Z'));
  const kid = store.db.keywords[0].id;
  await store.saveResult(kid, { status: 'FOUND', position: 9, url: PAGE, checked_at: '2026-11-04T10:00:00.000Z' }, new Date('2026-11-11T10:00:00Z'));
  await store.saveResult(kid, { status: 'FOUND', position: 7, url: PAGE, checked_at: '2026-11-11T10:00:00.000Z' }, new Date('2026-11-18T10:00:00Z'));

  const app = express(); app.use(express.json({ limit: '1mb' }));
  const engineDeps = { retryDelayMs: 0, judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async url => { const h = url === PAGE ? html : OTHERS[url]; if (!h) throw Object.assign(Error('TEST page not available'), { code: 'PUBLIC_HTML_UNAVAILABLE' });
      return { html: h, final_url: url, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString(),
      leads: Object.keys(OTHERS).map((url, i) => ({ url, title: 'GEO ' + i, snippet: 'GEO', source: 'SERPER_GOOGLE_ORGANIC', serp_position: i + 1 })) }),
    // TEST Google (Serper) for the customer questions: records what was searched.
    questionFetch: async (url, opts) => { questionSearches.push(JSON.parse(opts.body).q); return { ok: true, json: async () => ({ peopleAlsoAsk: [{ question: '¿Qué hace un consultor GEO?' }], relatedSearches: [{ query: 'consultor geo precio' }] }) }; },
    questionModel: null };
  const baseCfg = freeGrowthConfig({ GROWTH_FREE_ACCESS_KEYS: 'handoff-test-key-1' });
  const growth = registerFreeGrowth(app, pool, { config: { ...baseCfg, accessKeys: baseCfg.accessKeys.map(k => ({ ...k, hosts: ['127.0.0.1'] })), perIp: 50, daily: 20, perEmail: 10 },
    engineDeps, fetchImpl: async () => ({ ok: true }), sendEmail: async () => true, rankHandoff: rankHandoff({ store }) });
  registerRankFree(app, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, growthUrl: '/free-growth' }, store, sendEmail: async () => true });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    // 1. The tracker's best-opportunity link.
    const dash = await (await fetch(base + '/rank-tracker/d/' + links.linkToken(store.db.accounts[0].dashboard_nonce))).text();
    const href = /<a class="cta" href="([^"]+)"/.exec(dash)[1].replace(/&amp;/g, '&');
    const u = new URL(href, base);
    assert.deepEqual([u.pathname, u.searchParams.get('url'), u.searchParams.get('topic'), u.searchParams.get('query'), u.searchParams.get('market'), u.searchParams.get('language')],
      ['/free-growth', PAGE, 'consultor geo', null, 'es — Spain', 'Spanish']);
    assert.ok(u.searchParams.get('rt'));
    // A forged handoff opens nothing.
    assert.equal((await fetch(base + '/api/rank-free/handoff?rt=' + encodeURIComponent(u.searchParams.get('rt').slice(0, -2) + 'AA'))).status, 404);

    // 2. The form.
    const p = await (await browser.newContext()).newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + href);
    assert.equal(await p.inputValue('#url'), PAGE);
    assert.equal(await p.inputValue('#query'), '', 'the question stays empty: the check picks it');
    assert.match(await p.textContent('#topicNote'), /Desde tu rastreador: «consultor geo»/, 'the form speaks the tracker account\'s language (es)');
    await p.waitForFunction(e => document.getElementById('email').value === e, email, { timeout: 5000 });
    // Clear and simple from the tracker: one summary, the fields under "Change details", no second tips question.
    assert.match(await p.textContent('#trackerSummary'), /Desde tu rastreador — todo está rellenado[^]*Palabra clave: consultor geo[^]*Resultado a: /);
    assert.equal(await p.getAttribute('html', 'lang'), 'es');
    assert.equal(await p.locator('#moreFields').evaluate(el => el.open), false);assert.equal(await p.locator('#tipsBox').isHidden(), true);
    await p.check('input[name=consent]');
    await p.click('#f button[type=submit]');
    await p.waitForURL(/\/free-growth\/r\//, { timeout: 30000 }).catch(async e => { throw Error('no result page; status: ' + await p.textContent('#s') + ' ' + errors.join(' ')); });
    // Tips: the choice made at the tracker sign-up (here: no tips), not a default of the Growth form.
    assert.equal((await pool.query('SELECT marketing_consent FROM growth_free_checks WHERE email=$1 ORDER BY id DESC LIMIT 1', [email])).rows[0].marketing_consent, false);
    const r = new URL(p.url()), id = r.pathname.split('/').pop(), k = r.searchParams.get('k');

    // 3. The best real customer question about the topic.
    let d;
    for (let i = 0; i < 120; i++) { d = await (await fetch(base + '/api/free-growth/checks/' + id + '?k=' + k)).json(); if (d.status === 'DONE' || d.status === 'FAILED') break; await new Promise(x => setTimeout(x, 500)); }
    assert.equal(d.status, 'DONE');
    assert.ok(questionSearches.some(q => /consultor geo/i.test(q)), 'Google was asked about the topic');
    const cq = (await pool.query('SELECT report FROM growth_free_checks WHERE public_id=$1', [id])).rows[0].report.customer_question;
    assert.equal(cq.text, '¿Qué hace un consultor GEO?'); assert.equal(cq.topic, 'consultor geo');

    // 4. Publication date → the tracker marks the keyword, with the position of the last check on or before that day (7).
    const pub = await (await fetch(base + '/api/free-growth/checks/' + id + '/publication?k=' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published_on: '2026-11-11', remind: false }) })).json();
    assert.equal(pub.success, true);
    assert.equal(store.db.keywords[0].changed_position, 7);
    assert.equal(new Date(store.db.keywords[0].changed_at).toISOString().slice(0, 10), '2026-11-11');
    const dash2 = await (await fetch(base + '/rank-tracker/d/' + links.linkToken(store.db.accounts[0].dashboard_nonce))).text();
    assert.match(dash2, /Modificaste esta página el 2026-11-11 \(posición 7 ese día\)/);
    // Removing the date in the Growth check removes it in the tracker too.
    await fetch(base + '/api/free-growth/checks/' + id + '/publication?k=' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) });
    assert.equal(store.db.keywords[0].changed_at, null);
    assert.deepEqual(errors, []);
    void project;
  } finally {
    await browser.close(); srv.close();
    if (growth && growth.stop) growth.stop();
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE 'test-%@acme-geo.example'").catch(() => {});
    await pool.end();
  }
});

test('a valid handoff is access of its own: also with personal approval required, the tracker address, its own weekly limit', { skip, timeout: 60000 }, async () => {
  const express = require('express'), request = require('supertest');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const { memoryStore } = require('../src/rank-free/store.cjs');
  const { rankHandoff, perWeekOf } = require('../src/rank-free/handoff.cjs');
  const links = require('../src/rank-free/links.cjs');
  assert.deepEqual([perWeekOf({}), perWeekOf({ RANK_FREE_GROWTH_PER_WEEK: '5' }), perWeekOf({ RANK_FREE_GROWTH_PER_WEEK: '0' }), perWeekOf({ RANK_FREE_GROWTH_PER_WEEK: 'x' })], [3, 5, 0, 3]);
  const pool = new pg.Pool({ connectionString: DB });
  const store = memoryStore();
  const email = 'test-' + crypto.randomBytes(3).toString('hex') + '@acme-geo.example';
  await store.upsertSignup({ email, lang: 'es', ipHash: 'ip', consent: false, verifyHash: 'v2', host: 'acme-geo.example', gl: 'es', hl: 'es', keywords: ['consultor geo'] });
  await store.verify('v2', links.newNonce(), new Date());
  const rt = links.handoffToken(store.db.accounts[0].dashboard_nonce, 'consultor geo');
  const app = express(); app.use(express.json({ limit: '1mb' }));
  // Approval required and no access key for this domain: only the owner, invitations and the rank tracker handoff get in.
  const growth = registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({}), approvalRequired: true, perIp: 50, daily: 20, perEmail: 10 },
    engineDeps: { fetchLive: async () => { throw Object.assign(Error('TEST: no page'), { code: 'PUBLIC_HTML_UNAVAILABLE' }); } }, fetchImpl: async () => ({ ok: true }), sendEmail: async () => true,
    rankHandoff: rankHandoff({ store, perWeek: 1 }) });
  try {
    assert.equal((await request(app).get('/free-growth')).status, 302, 'without a handoff: to the approval page, as before');
    assert.equal((await request(app).get('/free-growth?rt=' + encodeURIComponent(rt.slice(0, -2) + 'AA'))).status, 302, 'a forged handoff opens nothing');
    const form = await request(app).get('/free-growth?rt=' + encodeURIComponent(rt) + '&topic=consultor+geo');
    assert.equal(form.status, 200); assert.match(form.text, /Iniciar el análisis gratuito/, 'the form in the tracker account\'s language (es)');
    const body = x => ({ url: 'https://acme-geo.example/consultor-geo/', topic: 'consultor geo', rank_ref: rt, email, consent: true, ...x });
    assert.equal((await request(app).post('/api/free-growth/checks').send(body({ rank_ref: '' }))).status, 403, 'no handoff: approval still required');
    const other = await request(app).post('/api/free-growth/checks').send(body({ email: 'someone-else@other.example' }));
    assert.equal(other.status, 403); assert.match(other.body.error, /e-mail address of your rank tracker \(t\*\*\*@acme-geo\.example\)/);
    const crossSite = await request(app).post('/api/free-growth/checks').send(body({url:'https://unrelated.example/consultor-geo/'}));
    assert.equal(crossSite.status,403,'a signed link must not fund another website or mark that keyword changed');
    assert.match(crossSite.body.error,/belongs to acme-geo\.example/);
    const similarHost = await request(app).post('/api/free-growth/checks').send(body({url:'https://acme-geo.example.attacker.example/consultor-geo/'}));
    assert.equal(similarHost.status,403,'lookalike host suffix cannot borrow a Rank Tracker identity');
    const otherTopic = await request(app).post('/api/free-growth/checks').send(body({topic:'unrelated service'}));
    assert.equal(otherTopic.status,409,'the handoff keyword is not editable into another keyword');
    assert.equal((store.db.handoffs||[]).length,0,'all invalid attempts must leave the database without a handoff');
    const ok = await request(app).post('/api/free-growth/checks').send(body({}));
    assert.equal(ok.status, 202); assert.equal(store.db.handoffs.length, 1);
    const again = await request(app).post('/api/free-growth/checks').send(body({}));
    assert.equal(again.status, 429); assert.match(again.body.error, /used the 1 free Growth checks from your rank tracker for this week/);
  } finally {
    if (growth && growth.stop) growth.stop();
    await new Promise(x => setTimeout(x, 300));
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE 'test-%@acme-geo.example'").catch(() => {});
    await pool.end();
  }
});
