'use strict';
// Free rank tracker: a public lead tool, separate from the Tracker and the Growth check (owner 2026-11-11).
// Pages:  GET /rank-tracker (sign-up) · /rank-tracker/v/:token (confirm) · /rank-tracker/d/:token (dashboard) · /rank-tracker/stop/:token
// API:    POST /api/rank-free/signup · GET|POST /api/rank-free/d/:token(/keywords|/forget) · GET /api/rank-free/admin/stats
// Free plan: one website, one country, up to 10 keywords, checked weekly. Settings: RANK_FREE_* (see README.md).
const crypto = require('node:crypto');
const engine = require('./engine.cjs');
const { pgStore, hash, token: randomToken } = require('./store.cjs');
const { runDue, sendDigests } = require('./runner.cjs');
const { t, langOf, esc, positionText, changeText, verifyEmail, accessEmail } = require('./texts.cjs');
const links = require('./links.cjs');
const { brevo } = require('../growth-free/reminders.cjs');
const { countryName, languageName } = require('../growth-search-locale.cjs');

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;

function rankFreeConfig(env = process.env) {
  return {
    enabled: env.RANK_FREE_ENABLED !== 'false',
    maxKeywords: Math.max(1, Math.min(50, Number(env.RANK_FREE_MAX_KEYWORDS) || 10)),
    monthlyCap: Math.max(0, Number(env.RANK_FREE_MONTHLY_CALLS) || 3000),
    signupsPerIpPerDay: Math.max(1, Number(env.RANK_FREE_SIGNUPS_PER_IP) || 5),
    baseUrl: String(env.RANK_FREE_PUBLIC_URL || env.PUBLIC_APP_URL || 'https://app.contentscale.site').replace(/\/+$/, ''),
    // Serper.dev only (same key as Growth); SERPAPI_KEY belongs to another provider with another API.
    serperKey: env.SERPER_API_KEY || '',
    adminKey: env.RANK_FREE_ADMIN_KEY || env.GROWTH_FREE_ADMIN_KEY || '',
    growthUrl: env.RANK_FREE_GROWTH_URL || 'https://app.contentscale.site/free-growth',
    scheduler: env.RANK_FREE_SCHEDULER !== '0' && env.NODE_ENV !== 'test',
  };
}

const pickLang = req => langOf((req.query && req.query.lang) || String(req.headers['accept-language'] || '').slice(0, 2));
const ipHashOf = req => hash('rank-free:' + (req.ip || ''));

const css = `*{box-sizing:border-box}body{margin:0;background:#faf7ff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}h1{font-size:clamp(1.6rem,5vw,2.2rem);line-height:1.2;margin:8px 0 12px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin:16px 0}label{display:block;font-weight:700;margin:12px 0 4px}
input,select,textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}textarea{min-height:150px}
button{background:#6d28d9;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-weight:700;font-size:1rem;cursor:pointer;margin-top:14px}
button.ghost{background:#fff;color:#6d28d9;border:1px solid #6d28d9}.muted{color:#555;font-size:14px}.msg{padding:12px;border-radius:8px;margin-top:12px}
.ok{background:#ecfdf5;border:1px solid #86efac}.err{background:#fef2f2;border:1px solid #fca5a5}table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee;vertical-align:top}th{background:#f5f3ff}.pos{font-weight:800;font-size:1.1rem}
.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400}.consent input{width:auto;margin-top:5px}a{color:#6d28d9}
.eyebrow{font-size:12px;letter-spacing:.09em;color:#6d28d9;font-weight:700;text-transform:uppercase}`;
const page = (lang, title, body) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><style>${css}</style></head><body><main>${body}</main></body></html>`;

function signupPage(lang, cfg) {
  const L = t(lang);
  const opts = engine.COUNTRIES.map(c => `<option value="${c}">${esc(countryName(c.toUpperCase()))}</option>`).join('');
  const langs = [...new Set(Object.values(engine.DEFAULT_LANGUAGE))].sort().map(l => `<option value="${l}">${esc(languageName(l) || l)}</option>`).join('');
  const defaults = JSON.stringify(engine.DEFAULT_LANGUAGE), other = JSON.stringify(engine.GOOGLE_NOT_MAIN);
  return page(lang, L.title, `<p class="eyebrow">ContentScale</p><h1>${esc(L.title)}</h1><p>${esc(L.lead)}</p>
<form class="card" id="f"><label for="email">${esc(L.email)}</label><input id="email" type="email" required autocomplete="email">
<label for="site">${esc(L.site)}</label><input id="site" required placeholder="example.com">
<label for="gl">${esc(L.country)}</label><select id="gl">${opts}</select><p class="muted" id="other" hidden></p>
<label for="hl">${esc(L.language)}</label><select id="hl">${langs}</select>
<label for="kw">${esc(L.keywords)}</label><textarea id="kw" required></textarea>
<label class="consent"><input type="checkbox" id="consent"> ${esc(L.consent)}</label>
<button type="submit">${esc(L.submit)}</button><div id="m"></div></form>
<div class="card"><strong>${esc(L.how)}</strong><ol><li>${esc(L.how1)}</li><li>${esc(L.how2)}</li><li>${esc(L.how3)}</li></ol><p class="muted">${esc(L.note)}</p></div>
<script>(()=>{const D=${defaults},O=${other},$=i=>document.getElementById(i),T=${JSON.stringify({otherEngine: L.otherEngine('§')})};
const pre=(navigator.language||'').split('-')[1];if(pre&&[...$('gl').options].some(o=>o.value===pre.toLowerCase()))$('gl').value=pre.toLowerCase();else $('gl').value='${lang === 'nl' ? 'nl' : lang === 'es' ? 'es' : 'us'}';
const sync=()=>{const g=$('gl').value;if(D[g])$('hl').value=D[g];const e=O[g];$('other').hidden=!e;if(e)$('other').textContent=T.otherEngine.replace('§',e)};$('gl').onchange=sync;sync();
$('f').onsubmit=async ev=>{ev.preventDefault();const m=$('m');m.className='';m.textContent='';const b=ev.submitter;b.disabled=true;
try{const r=await fetch('/api/rank-free/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,site:$('site').value,country:$('gl').value,language:$('hl').value,keywords:$('kw').value,marketing_consent:$('consent').checked,lang:'${lang}'})});
const j=await r.json();m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)$('f').reset()}catch(e){m.className='msg err';m.textContent='Error'}b.disabled=false}})();</script>`);
}

function dashboardPage(lang, data, tok, cfg) {
  const L = t(lang);
  const rows = data.keywords.map(k => {
    const last = k.history[0] && k.history[0].result, prev = k.history[1] && k.history[1].result;
    const ch = last ? changeText(engine.changeOf(prev, last), L) : '';
    const pageUrl = last && last.status === 'FOUND' ? `<a href="${esc(last.url)}" rel="nofollow noopener" target="_blank">${esc(last.url.replace(/^https?:\/\/[^/]+/, '') || '/')}</a>` : '';
    const when = last ? new Date(last.checked_at).toISOString().slice(0, 10) : '';
    return `<tr><td>${esc(k.keyword)}</td><td class="pos">${last ? esc(positionText(last, L)) : `<span class="muted">${esc(k.last_error ? L.failed(k.last_error, new Date(k.next_check_at).toISOString().slice(11, 16) + ' UTC') : L.pending)}</span>`}</td><td>${esc(ch)}</td><td>${pageUrl}</td><td class="muted">${esc(when)}</td></tr>`;
  }).join('');
  const pending = data.keywords.some(k => !k.history[0] && !k.last_error);
  const providerNote = pending && !data.provider_ready ? `<div class="msg err">${esc(L.noProvider)}</div>` : '';
  const refresh = pending && data.provider_ready ? '<script>setTimeout(()=>location.reload(),15000)</script>' : '';
  const notOnOne = data.keywords.some(k => { const r = k.history[0] && k.history[0].result; return r && (r.status !== 'FOUND' || r.position > 10); });
  return page(lang, L.dash, `<p class="eyebrow">ContentScale · ${esc(L.title)}</p><h1>${esc(L.dash)}</h1>
<p><strong>${esc(data.host)}</strong> · ${esc(data.country)} · ${esc(data.language)}</p>${data.other_engine ? `<p class="muted">${esc(L.otherEngine(data.other_engine))}</p>` : ''}
${providerNote}<div class="card" style="overflow-x:auto"><table><thead><tr><th>${esc(L.kw)}</th><th>${esc(L.pos)}</th><th>${esc(L.change)}</th><th>${esc(L.page)}</th><th>${esc(L.checked)}</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">${esc(L.note)}</p></div>
${notOnOne ? `<div class="card"><p>${esc(L.upsell)}</p><p><a href="${esc(cfg.growthUrl)}">${esc(L.upsellLink)} →</a></p></div>` : ''}
<form class="card" id="k"><label for="kw">${esc(L.addKw)}</label><textarea id="kw">${esc(data.keywords.map(k => k.keyword).join('\n'))}</textarea><button type="submit">${esc(L.save)}</button><div id="m"></div></form>
<p class="muted"><a href="/rank-tracker/stop/${esc(tok)}">${esc(L.stop)}</a> · <a href="#" id="fg">${esc(L.forget)}</a></p>
<script>(()=>{const $=i=>document.getElementById(i);$('k').onsubmit=async ev=>{ev.preventDefault();const m=$('m');
const r=await fetch('/api/rank-free/d/${esc(tok)}/keywords',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keywords:$('kw').value})});const j=await r.json();
m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)setTimeout(()=>location.reload(),800)};
$('fg').onclick=async e=>{e.preventDefault();if(!confirm(${JSON.stringify(L.forgetConfirm)}))return;await fetch('/api/rank-free/d/${esc(tok)}/forget',{method:'POST'});location.href='/rank-tracker'}})();</script>${refresh}`);
}

function registerRankFree(app, pool, { config = rankFreeConfig(), store = pgStore(pool), fetchImpl = global.fetch, sendEmail = null, now = () => new Date() } = {}) {
  if (!config.enabled) return null;
  const send = sendEmail || brevo(fetchImpl);
  const emailReady = () => !!sendEmail || !!process.env.BREVO_API_KEY;
  const html = (res, body, code = 200) => res.status(code).set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer').set('Content-Security-Policy', "frame-ancestors 'none'").type('html').send(body);

  async function dashboardData(account) {
    const p = await store.projectOf(account.id);
    const ks = p ? await store.keywords(p.id) : [];
    const keywords = [];
    for (const k of ks) keywords.push({ keyword: k.keyword, next_check_at: k.next_check_at, last_error: k.last_error || null, last_error_at: k.last_error_at || null, history: await store.history(k.id, 12) });
    const m = p ? engine.readMarket(p.gl, p.hl) : {};
    // Country and language in the account's own language ("Spanje · Spaans" on a Dutch dashboard).
    const shown = (type, code) => { try { return new Intl.DisplayNames([langOf(account.lang)], { type }).of(code); } catch { return null; } };
    return { host: p && p.host, gl: p && p.gl, hl: p && p.hl, country: (p && shown('region', p.gl.toUpperCase())) || m.country_name,
      language: (p && shown('language', p.hl)) || m.language_name, other_engine: m.other_engine || null, keywords, provider_ready: !!config.serperKey };
  }
  const accountFor = async tok => { const nonce = links.readToken(tok); return nonce ? store.accountByDashboard(nonce) : null; };
  let kick = null; // one background round right after a confirmation, so the first positions appear within a minute
  const runRound = () => kick || (kick = (async () => {
    try { await runDue({ store, key: config.serperKey, fetchImpl, now: now(), monthlyCap: config.monthlyCap });
      await sendDigests({ store, send, baseUrl: config.baseUrl, now: now() }); } catch (e) { console.warn('[rank-free] round failed', e && e.message); }
    finally { kick = null; }
  })());

  app.get('/rank-tracker', (req, res) => html(res, signupPage(pickLang(req), config)));

  app.post('/api/rank-free/signup', async (req, res) => {
    const b = req.body || {}, lang = langOf(b.lang), L = t(lang);
    try {
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return res.status(400).json({ success: false, error: L.errEmail });
      const site = engine.readSite(b.site); if (site.error) return res.status(400).json({ success: false, error: site.error });
      const market = engine.readMarket(b.country, b.language); if (market.error) return res.status(400).json({ success: false, error: market.error });
      const kw = engine.readKeywords(b.keywords, config.maxKeywords);
      if (!kw.keywords.length) return res.status(400).json({ success: false, error: L.errKeywords });
      if (!emailReady() || !links.configured()) return res.status(503).json({ success: false, error: L.errEmailOff });
      const ip = ipHashOf(req);
      if (await store.signupsSince(ip, new Date(now().getTime() - 86400000)) >= config.signupsPerIpPerDay) return res.status(429).json({ success: false, error: L.errLimit });
      // An address that already has a confirmed tracker is never changed from this public form (anyone can type an
      // address): its owner gets the dashboard link by e-mail instead, and changes keywords there.
      const existing = await store.findAccountByEmail(email);
      if (existing && existing.verified_at && existing.dashboard_nonce) {
        const p0 = await store.projectOf(existing.id);
        const mail = accessEmail(existing.lang, { host: p0 ? p0.host : site.host, link: config.baseUrl + '/rank-tracker/d/' + links.linkToken(existing.dashboard_nonce) });
        await send({ to: [email], subject: mail.subject, html: mail.html });
        return res.json({ success: true, message: L.sent });
      }
      const verify = randomToken();
      await store.upsertSignup({ email, lang, ipHash: ip, consent: b.marketing_consent === true, verifyHash: hash(verify), host: site.host, gl: market.gl, hl: market.hl, keywords: kw.keywords });
      const mail = verifyEmail(lang, { host: site.host, link: config.baseUrl + '/rank-tracker/v/' + verify });
      const ok = await send({ to: [email], subject: mail.subject, html: mail.html });
      if (!ok) return res.status(503).json({ success: false, error: L.errEmailOff });
      return res.json({ success: true, message: L.sent, keywords: kw.keywords, skipped: kw.invalid, over_limit: kw.over_limit });
    } catch (e) { console.warn('[rank-free] signup failed', e && e.message); return res.status(500).json({ success: false, error: 'Error' }); }
  });

  app.get('/rank-tracker/v/:token', async (req, res) => {
    const lang = pickLang(req);
    const nonce = links.newNonce();
    const a = await store.verify(hash(String(req.params.token || '')), nonce, now()).catch(() => null);
    if (!a) return html(res, page(lang, t(lang).title, `<h1>${esc(t(lang).title)}</h1><p>This link is no longer valid. <a href="/rank-tracker">Start again</a>.</p>`), 404);
    runRound();
    return res.redirect(302, '/rank-tracker/d/' + links.linkToken(a.dashboard_nonce || nonce));
  });

  app.get('/rank-tracker/d/:token', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return html(res, page('en', 'Not found', '<h1>Not found</h1><p><a href="/rank-tracker">Free rank tracker</a></p>'), 404);
    return html(res, dashboardPage(langOf(a.lang), await dashboardData(a), req.params.token, config));
  });
  app.get('/api/rank-free/d/:token', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    res.set('Cache-Control', 'no-store').json({ success: true, ...(await dashboardData(a)) });
  });
  app.post('/api/rank-free/d/:token/keywords', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    const L = t(a.lang), kw = engine.readKeywords((req.body || {}).keywords, config.maxKeywords);
    if (!kw.keywords.length) return res.status(400).json({ success: false, error: L.errKeywords });
    const p = await store.projectOf(a.id);
    await store.setKeywords(p.id, kw.keywords, now());
    runRound();
    res.json({ success: true, message: '✓', keywords: kw.keywords, skipped: kw.invalid, over_limit: kw.over_limit });
  });
  app.post('/api/rank-free/d/:token/forget', async (req, res) => {
    const nonce = links.readToken(req.params.token);
    res.json({ success: !!(nonce && await store.forget(nonce).catch(() => false)) });
  });
  app.get('/rank-tracker/stop/:token', async (req, res) => {
    const nonce = links.readToken(req.params.token);
    const ok = !!(nonce && await store.optOut(nonce, now()).catch(() => false));
    html(res, page('en', 'Stopped', ok ? '<h1>Stopped</h1><p>You will not get e-mails and your keywords are no longer checked. Your positions stay visible on your dashboard.</p>' : '<h1>Not found</h1>'), ok ? 200 : 404);
  });
  app.get('/api/rank-free/admin/stats', async (req, res) => {
    const k = String(req.headers['x-admin-key'] || '');
    if (!config.adminKey || k.length !== config.adminKey.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(config.adminKey))) return res.status(401).json({ success: false });
    res.json({ success: true, monthly_cap: config.monthlyCap, ...(await store.stats(now())) });
  });

  let timer = null;
  if (config.scheduler && config.serperKey) timer = setInterval(runRound, 15 * 60 * 1000).unref();
  return { runRound, stop: () => timer && clearInterval(timer) };
}

module.exports = { registerRankFree, rankFreeConfig };
