'use strict';
// Free rank tracker: a public lead tool, separate from the Tracker and the Growth check (owner 2026-11-11).
// Pages:  GET /rank-tracker (sign-up) · /rank-tracker/v/:token (confirm) · /rank-tracker/d/:token (dashboard) · /rank-tracker/stop/:token
// API:    POST /api/rank-free/signup · GET|POST /api/rank-free/d/:token(/keywords|/forget) · GET /api/rank-free/admin/stats
// Free plan: one website, one country, up to 10 keywords, checked weekly. Settings: RANK_FREE_* (see README.md).
const crypto = require('node:crypto');
const engine = require('./engine.cjs');
const { pgStore, hash, token: randomToken } = require('./store.cjs');
const { runDue, sendDigests } = require('./runner.cjs');
const { t, langOf, esc, positionText, changeText, verifyEmail, accessEmail, followText, plainFollow } = require('./texts.cjs');
const links = require('./links.cjs');
const gscMod = require('./gsc.cjs');
const { brevo } = require('../growth-free/reminders.cjs');
const { countryName, languageName, PREWRITE_REGIONS } = require('../growth-search-locale.cjs');

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
    // Owner 2026-11-12: "decouple Growth from the rank tracker; for now people only use the rank tracker". Growth links in
    // the dashboard and the weekly e-mail only when RANK_FREE_GROWTH_LINKS=on.
    growthLinks: String(env.RANK_FREE_GROWTH_LINKS || '').toLowerCase() === 'on',
    // Without Growth: an invitation to discuss SEO and GEO live in a call (owner 2026-11-12), on the site's own contact page.
    callUrl: { en: env.RANK_FREE_CALL_URL_EN || 'https://contentscale.site/contact/', nl: env.RANK_FREE_CALL_URL_NL || 'https://nl.contentscale.site/contact/', es: env.RANK_FREE_CALL_URL_ES || 'https://es.contentscale.site/contacto/' },
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
.consent-note{font-size:14px;color:#5b6475;margin:12px 0 2px}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400}.consent input{width:auto;margin-top:5px}a{color:#6d28d9}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.chip{background:#f5f3ff;color:#1a1a1a;border:1px solid #c4b5fd;border-radius:999px;padding:6px 12px;margin:0;font-weight:400;font-size:14px}
.chip:disabled{opacity:.5;cursor:default}.sub{display:block;color:#555;font-size:13px;margin-top:4px}.spark{vertical-align:middle}.best{border:2px solid #6d28d9}.cta{display:inline-block;background:#6d28d9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700}
input[type=file]{border:1px dashed #a78bfa;background:#faf7ff;margin-top:6px}
@media(max-width:640px){.rk thead{display:none}.rk tr{display:block;border-bottom:1px solid #eee;padding:10px 0}.rk td{display:block;border:0;padding:3px 0}
.rk td[data-l]:not(:empty)::before{content:attr(data-l) ': ';color:#555;font-size:13px;font-weight:400}.rk td.pos{font-size:1.3rem}}
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
<p class="consent-note">${esc(L.consent)}</p><label class="consent"><input type="checkbox" id="notips"> ${esc(L.noTips)}</label>
<button type="submit">${esc(L.submit)}</button><div id="m"></div></form>
<div class="card"><strong>${esc(L.how)}</strong><ol><li>${esc(L.how1)}</li><li>${esc(L.how2)}</li><li>${esc(L.how3)}</li></ol><p class="muted">${esc(L.note)}</p></div>
<script>(()=>{const D=${defaults},O=${other},$=i=>document.getElementById(i),T=${JSON.stringify({otherEngine: L.otherEngine('§')})};
const pre=(navigator.language||'').split('-')[1],page='${lang === 'nl' ? 'nl' : lang === 'es' ? 'es' : ''}';if(page)$('gl').value=page;else if(pre&&[...$('gl').options].some(o=>o.value===pre.toLowerCase()))$('gl').value=pre.toLowerCase();else $('gl').value='us';
const sync=()=>{const g=$('gl').value;if(D[g])$('hl').value=D[g];const e=O[g];$('other').hidden=!e;if(e)$('other').textContent=T.otherEngine.replace('§',e)};$('gl').onchange=sync;sync();
$('f').onsubmit=async ev=>{ev.preventDefault();const m=$('m');m.className='';m.textContent='';const b=ev.submitter;b.disabled=true;
try{const r=await fetch('/api/rank-free/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,site:$('site').value,country:$('gl').value,language:$('hl').value,keywords:$('kw').value,no_tips:$('notips').checked,lang:'${lang}'})});
const j=await r.json();m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)$('f').reset()}catch(e){m.className='msg err';m.textContent='Error'}b.disabled=false}})();</script>`);
}

// The last checks of one keyword as a small line (oldest left): higher is better; "not found" sits on the bottom line.
// Only real checks are drawn; with fewer than two there is no line yet.
function sparkline(history, L) {
  const pts = history.slice(0, 8).reverse().map(h => h.result).filter(Boolean);
  if (pts.length < 2) return '';
  const depth = 31, w = 92, hgt = 28, step = w / (pts.length - 1);
  const y = r => r.status === 'FOUND' ? 2 + (Math.min(r.position, depth) - 1) / (depth - 1) * (hgt - 4) : hgt - 2;
  const label = pts.map(r => r.status === 'FOUND' ? r.position : '–').join(' → ');
  const d = pts.map((r, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + y(r).toFixed(1)).join(' ');
  const found = history.map(h => h.result).filter(r => r && r.status === 'FOUND').map(r => r.position);
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="${esc(L.trend + ': ' + label)}"><title>${esc(label)}</title>`
    + `<path d="${d}" fill="none" stroke="#6d28d9" stroke-width="2" stroke-linejoin="round"/>${pts.map((r, i) => `<circle cx="${(i * step).toFixed(1)}" cy="${y(r).toFixed(1)}" r="2.5" fill="${r.status === 'FOUND' ? '#6d28d9' : '#cbd5e1'}"/>`).join('')}</svg>`
    + (found.length ? `<span class="sub">${esc(L.best(Math.min(...found)))}</span>` : '');
}

// The free Growth check, filled in for this keyword, market and (if it ranks) the page that ranks.
const callOf = (cfg, lang) => (cfg.callUrl && (cfg.callUrl[lang] || cfg.callUrl.en)) || 'https://contentscale.site/contact/';
const growthLink = (cfg, data, keyword, last) => engine.growthLink(cfg.growthUrl, data, keyword, last, links.handoffToken(data.nonce, keyword));

// Google's own related searches and questions from the latest checks, minus what is already tracked.
function suggestionsOf(data, max = 10) {
  const have = new Set(data.keywords.map(k => k.keyword)), out = [];
  for (const k of data.keywords) {
    const r = k.history[0] && k.history[0].result;
    for (const s of (r && Array.isArray(r.suggestions) ? r.suggestions : [])) {
      if (!have.has(s) && !out.includes(s)) out.push(s);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function dashboardPage(lang, data, tok, cfg, now = new Date()) {
  const L = t(lang);
  const num = n => Number(n).toLocaleString(lang, { maximumFractionDigits: 1 });
  const gscBy = new Map((data.gsc && data.gsc.queries || []).map(q => [q.query, q]));
  const rows = data.keywords.map(k => {
    const last = k.history[0] && k.history[0].result, prev = k.history[1] && k.history[1].result;
    const ch = last ? changeText(engine.changeOf(prev, last), L) : '';
    const pageUrl = last && last.status === 'FOUND' ? `<a href="${esc(last.url)}" rel="nofollow noopener" target="_blank">${esc(last.url.replace(/^https?:\/\/[^/]+/, '') || '/')}</a>` : '';
    const when = last ? new Date(last.checked_at).toISOString().slice(0, 10) : '';
    const top = last && Array.isArray(last.top) && last.top.length ? last.top : (last && Array.isArray(last.top_hosts) ? last.top_hosts.map(h => ({ host: h })) : []);
    const topLine = top.length ? `<span class="sub">${esc(L.top3)}: ${top.map(x => x.url ? `<a href="${esc(x.url)}" rel="nofollow noopener" target="_blank">${esc(x.host)}</a>` : esc(x.host)).join(', ')}</span>` : '';
    const improve = cfg.growthLinks && last && (last.status !== 'FOUND' || last.position > 3) ? `<span class="sub"><a href="${esc(growthLink(cfg, data, k.keyword, last))}">${esc(L.growthFor)} →</a></span>` : '';
    const g = gscBy.get(k.keyword);
    const cLine = k.changed_at && k.changed_position != null ? `<span class="sub">✎ ${esc(L.cRow(new Date(k.changed_at).toISOString().slice(0, 10), k.changed_position))}</span>` : '';
    const gLine = (g ? `<span class="sub">${esc(L.gRow(num(g.clicks), num(g.impressions), g.position != null ? num(g.position) : null))}</span>` : '') + cLine;
    return `<tr><td><strong>${esc(k.keyword)}</strong>${topLine}${gLine}</td><td class="pos" data-l="${esc(L.pos)}">${last ? esc(positionText(last, L)) : `<span class="muted">${esc(k.last_error ? L.failed(k.last_error, new Date(k.next_check_at).toISOString().slice(11, 16) + ' UTC') : L.pending)}</span>`}</td><td data-l="${esc(L.trend)}">${sparkline(k.history, L)}</td><td data-l="${esc(L.change)}">${esc(ch)}</td><td data-l="${esc(L.page)}">${pageUrl}${improve}</td><td class="muted" data-l="${esc(L.checked)}" style="white-space:nowrap">${esc(when)}</td></tr>`;
  }).join('');
  const pending = data.keywords.some(k => !k.history[0] && !k.last_error);
  const providerNote = pending && !data.provider_ready ? `<div class="msg err">${esc(L.noProvider)}</div>` : '';
  const refresh = pending && data.provider_ready ? '<script>setTimeout(()=>location.reload(),15000)</script>' : '';
  const sugg = suggestionsOf(data), full = data.keywords.length >= cfg.maxKeywords;
  const suggestCard = sugg.length ? `<div class="card" id="sg"><strong>${esc(L.sTitle)}</strong><p class="muted">${esc(full ? L.sFull(data.keywords.length) : L.sLead)}</p><div class="chips">${sugg.map(x => `<button type="button" class="chip" data-k="${esc(x)}"${full ? ' disabled' : ''}>+ ${esc(x)}</button>`).join('')}</div><div id="sm"></div></div>` : '';
  const best = gscMod.bestOpportunity(data.keywords, data.gsc);
  // After "I changed this page" the keyword stays the best opportunity while it does not grow, with what the checks
  // since then show instead of the same advice every week; after six weeks without growth the Growth check comes back.
  const fu = best ? gscMod.followUp(best.row, now) : null;
  const gl = best ? esc(growthLink(cfg, data, best.keyword, best.result)) : '';
  const markBtn = `<button type="button" class="ghost" id="cm" data-k="${best ? esc(best.keyword) : ''}">${esc(L.cMark)}</button>`;
  const bestCard = !best ? '' : `<div class="card best" id="best"><p class="eyebrow">${esc(L.bTitle)}</p><p style="font-size:1.1rem;margin:4px 0 8px"><strong>${esc(L.bText(best.keyword, best.result.position))}</strong></p>`
    + (best.gsc ? `<p class="muted">${esc(L.bGsc(num(best.gsc.impressions), num(best.gsc.clicks)))}</p>` : '')
    + (!cfg.growthLinks ? (!fu ? `<p><a class="cta" href="${esc(callOf(cfg, lang))}">${esc(L.callCta)} →</a></p><p class="muted">${esc(L.callTip)}</p>${markBtn}` : fu.status === 'NO_GROWTH' ? `<div class="msg err" id="fu">${esc(plainFollow(followText(fu, L)))}</div><p><a class="cta" href="${esc(callOf(cfg, lang))}">${esc(L.callCta)} →</a></p>${markBtn}`
        : `<div class="msg ok" id="fu">${esc(plainFollow(followText(fu, L)))}</div><p class="muted"><a href="#" id="cu" data-k="${esc(best.keyword)}">${esc(L.cUndo)}</a></p>`)
      : !fu ? `<p><a class="cta" href="${gl}">${esc(L.bCta)} →</a></p><p class="muted">${esc(L.bTip)}</p>${markBtn}`
      : fu.status === 'NO_GROWTH' ? `<div class="msg err" id="fu">${esc(followText(fu, L))}</div><p><a class="cta" href="${gl}">${esc(L.cAgain)} →</a></p>${markBtn}`
      : `<div class="msg ok" id="fu">${esc(followText(fu, L))}</div><p class="muted"><a href="${gl}">${esc(L.cAgain)} →</a> · <a href="#" id="cu" data-k="${esc(best.keyword)}">${esc(L.cUndo)}</a></p>`)
    + `<div id="cmm"></div></div>`;
  const G = data.gsc, opps = gscMod.opportunities(G, data.keywords.map(k => k.keyword));
  const gInfo = G ? `<p class="muted">${[G.period ? esc(L.gPeriod(G.period.start, G.period.end)) : '', G.totals ? esc(L.gTotals(num(G.totals.clicks), num(G.totals.impressions))) : ''].filter(Boolean).join(' · ')}</p>`
    + `<p class="muted">${esc(G.country_filter ? L.gCountry(G.country_filter) : L.gAllCountries)}${G.page_filter ? ' ' + esc(L.gPage(G.page_filter)) : ''}</p>` : `<p class="muted">${esc(L.gNone)}</p>`;
  const gOpps = opps.length ? `<p style="margin-top:14px"><strong>${esc(L.gOppTitle)}</strong></p><p class="muted">${esc(full ? L.sFull(data.keywords.length) : L.gOppLead)}</p><div class="chips">${opps.map(q => `<button type="button" class="chip" data-k="${esc(q.query)}"${full ? ' disabled' : ''}>+ ${esc(q.query)} <span class="muted">· ${esc(L.gChip(num(q.position), num(q.impressions)))}</span></button>`).join('')}</div>` : '';
  const gscCard = `<div class="card" id="gsc"><strong>${esc(L.gTitle)}</strong><p class="muted">${esc(L.gLead)}</p>${gInfo}${gOpps}
<p class="muted" style="margin-top:14px">${esc(L.gHow)}</p><input type="file" id="gf" accept=".zip,.csv,text/csv,application/zip"><button type="button" id="gu">${esc(L.gUpload)}</button>${G ? ` <button type="button" class="ghost" id="gd">${esc(L.gDelete)}</button>` : ''}<div id="gm"></div></div>`;
  // The first keyword not on page 1: the general Growth link opens the check for it (with the handoff, like every link).
  const notOnOne = data.keywords.find(k => { const r = k.history[0] && k.history[0].result; return r && (r.status !== 'FOUND' || r.position > 10); });
  return page(lang, L.dash, `<p class="eyebrow">ContentScale · ${esc(L.title)}</p><h1>${esc(L.dash)}</h1>
<p><strong>${esc(data.host)}</strong> · ${esc(data.country)} · ${esc(data.language)}</p>${data.other_engine ? `<p class="muted">${esc(L.otherEngine(data.other_engine))}</p>` : ''}
${providerNote}${bestCard}<div class="card" style="overflow-x:auto"><table class="rk"><thead><tr><th>${esc(L.kw)}</th><th>${esc(L.pos)}</th><th>${esc(L.trend)}</th><th>${esc(L.change)}</th><th>${esc(L.page)}</th><th>${esc(L.checked)}</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">${esc(L.note)}</p></div>
${!cfg.growthLinks && notOnOne && !best ? `<div class="card"><p>${esc(L.callUpsell)}</p><p><a href="${esc(callOf(cfg, lang))}">${esc(L.callCta)} →</a></p></div>` : ''}
${cfg.growthLinks && notOnOne && !best ? `<div class="card"><p>${esc(L.upsell)}</p><p><a href="${esc(growthLink(cfg, data, notOnOne.keyword, notOnOne.history[0].result))}">${esc(L.upsellLink)} →</a></p></div>` : ''}
${suggestCard}${gscCard}<form class="card" id="k"><label for="kw">${esc(L.addKw)}</label><textarea id="kw">${esc(data.keywords.map(k => k.keyword).join('\n'))}</textarea><button type="submit">${esc(L.save)}</button><div id="m"></div></form>
<p class="muted"><a href="/rank-tracker/stop/${esc(tok)}">${esc(L.stop)}</a> · <a href="#" id="fg">${esc(L.forget)}</a></p>
<script>(()=>{const $=i=>document.getElementById(i);$('k').onsubmit=async ev=>{ev.preventDefault();const m=$('m');
const r=await fetch('/api/rank-free/d/${esc(tok)}/keywords',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keywords:$('kw').value})});const j=await r.json();
m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)setTimeout(()=>location.reload(),800)};
document.querySelectorAll('#sg .chip,#gsc .chip').forEach(b=>b.onclick=async()=>{b.disabled=true;const m=$(b.closest('#gsc')?'gm':'sm');
const r=await fetch('/api/rank-free/d/${esc(tok)}/keywords/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:b.dataset.k})});const j=await r.json();
m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)setTimeout(()=>location.reload(),900);else b.disabled=false});
$('gu').onclick=async()=>{const f=$('gf').files[0],m=$('gm');if(!f)return;$('gu').disabled=true;
const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=no;r.readAsDataURL(f)});
const r=await fetch('/api/rank-free/d/${esc(tok)}/gsc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,content_base64:b64})});const j=await r.json().catch(()=>({}));
m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'Error';if(j.success)setTimeout(()=>location.reload(),700);else $('gu').disabled=false};
if($('gd'))$('gd').onclick=async()=>{await fetch('/api/rank-free/d/${esc(tok)}/gsc/delete',{method:'POST'});location.reload()};
const mark=async(k,undo)=>{const r=await fetch('/api/rank-free/d/${esc(tok)}/changed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:k,undo:!!undo})});const j=await r.json().catch(()=>({}));
const m=$('cmm');m.className='msg '+(j.success?'ok':'err');m.textContent=j.message||j.error||'';if(j.success)setTimeout(()=>location.reload(),700)};
if($('cm'))$('cm').onclick=()=>{$('cm').disabled=true;mark($('cm').dataset.k)};if($('cu'))$('cu').onclick=e=>{e.preventDefault();mark($('cu').dataset.k,true)};
$('fg').onclick=async e=>{e.preventDefault();if(!confirm(${JSON.stringify(L.forgetConfirm)}))return;await fetch('/api/rank-free/d/${esc(tok)}/forget',{method:'POST'});location.href='/rank-tracker'}})();</script>${refresh}`);
}

function registerRankFree(app, pool, { config = rankFreeConfig(), store = pgStore(pool), fetchImpl = global.fetch, sendEmail = null, now = () => new Date() } = {}) {
  if (!config.enabled) return null;
  const send = sendEmail || brevo(fetchImpl);
  const handoff = require('./handoff.cjs').rankHandoff({ store });
  const emailReady = () => !!sendEmail || !!process.env.BREVO_API_KEY;
  const html = (res, body, code = 200) => res.status(code).set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer').set('Content-Security-Policy', "frame-ancestors 'none'").type('html').send(body);

  async function dashboardData(account) {
    const p = await store.projectOf(account.id);
    const ks = p ? await store.keywords(p.id) : [];
    const keywords = [];
    for (const k of ks) keywords.push({ keyword: k.keyword, changed_at: k.changed_at || null, changed_position: k.changed_position == null ? null : Number(k.changed_position), next_check_at: k.next_check_at, last_error: k.last_error || null, last_error_at: k.last_error_at || null, history: await store.history(k.id, 12) });
    const m = p ? engine.readMarket(p.gl, p.hl) : {};
    // Country and language in the account's own language ("Spanje · Spaans" on a Dutch dashboard).
    const shown = (type, code) => { try { return new Intl.DisplayNames([langOf(account.lang)], { type }).of(code); } catch { return null; } };
    return { host: p && p.host, gl: p && p.gl, hl: p && p.hl, country: (p && shown('region', p.gl.toUpperCase())) || m.country_name,
      language: (p && shown('language', p.hl)) || m.language_name, other_engine: m.other_engine || null, keywords, provider_ready: !!config.serperKey,
      gsc: p && p.gsc ? (typeof p.gsc === 'string' ? JSON.parse(p.gsc) : p.gsc) : null, gsc_at: p ? p.gsc_at || null : null };
  }
  const accountFor = async tok => { const nonce = links.readToken(tok); return nonce ? store.accountByDashboard(nonce) : null; };
  let kick = null; // one background round right after a confirmation, so the first positions appear within a minute
  const runRound = () => kick || (kick = (async () => {
    try { await runDue({ store, key: config.serperKey, fetchImpl, now: now(), monthlyCap: config.monthlyCap });
      await sendDigests({ store, send, baseUrl: config.baseUrl, growthUrl: config.growthUrl, growthLinks: config.growthLinks, callUrl: config.callUrl, now: now() }); } catch (e) { console.warn('[rank-free] round failed', e && e.message); }
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
      await store.upsertSignup({ email, lang, ipHash: ip, consent: b.no_tips !== undefined ? b.no_tips !== true : b.marketing_consent === true, verifyHash: hash(verify), host: site.host, gl: market.gl, hl: market.hl, keywords: kw.keywords });
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
    return html(res, dashboardPage(langOf(a.lang), { ...(await dashboardData(a)), nonce: a.dashboard_nonce }, req.params.token, config, now()));
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
  // One keyword at a time (a suggestion chip). Never silently drops a keyword: at the maximum it says so.
  app.post('/api/rank-free/d/:token/keywords/add', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    const L = t(a.lang), k = engine.readKeyword((req.body || {}).keyword);
    if (!k || k.error) return res.status(400).json({ success: false, error: L.errKeywords });
    const p = await store.projectOf(a.id), list = (await store.keywords(p.id)).map(x => x.keyword);
    if (list.includes(k.keyword)) return res.json({ success: true, message: L.sAdded, keywords: list });
    if (list.length >= config.maxKeywords) return res.status(409).json({ success: false, error: L.sFull(list.length) });
    await store.setKeywords(p.id, [...list, k.keyword], now());
    runRound();
    res.json({ success: true, message: L.sAdded, keywords: [...list, k.keyword] });
  });
  // Optional Search Console export of the website (ZIP or CSV, at most 3 MB). The latest upload replaces the previous.
  app.post('/api/rank-free/d/:token/gsc', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    const L = t(a.lang), b = req.body || {}, p = await store.projectOf(a.id);
    if (!p || typeof b.content_base64 !== 'string' || !b.content_base64) return res.status(400).json({ success: false, error: L.gHow });
    const out = gscMod.readSiteExport({ fileName: String(b.name || '').slice(0, 200), content: Buffer.from(b.content_base64, 'base64'), host: p.host });
    if (out.error === 'OTHER_SITE') return res.status(400).json({ success: false, error: L.gOther(p.host) });
    if (out.error) return res.status(400).json({ success: false, error: out.message || L.gHow });
    await store.setGsc(p.id, out, now());
    res.json({ success: true, message: L.gSaved, queries: out.queries.length, period: out.period, country_filter: out.country_filter });
  });
  // "I have changed this page" for a tracked keyword (or undo). Its position today is kept to compare later checks with.
  app.post('/api/rank-free/d/:token/changed', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    const L = t(a.lang), b = req.body || {}, p = await store.projectOf(a.id), k = engine.readKeyword(b.keyword);
    if (!p || !k || k.error) return res.status(400).json({ success: false, error: L.errKeywords });
    const row = (await store.keywords(p.id)).find(x => x.keyword === k.keyword);
    if (!row) return res.status(404).json({ success: false, error: L.errKeywords });
    if (b.undo === true) { await store.markChanged(p.id, k.keyword, null, null); return res.json({ success: true, message: '✓' }); }
    const [last] = await store.history(row.id, 1), r = last && last.result;
    await store.markChanged(p.id, k.keyword, now(), r && r.status === 'FOUND' ? r.position : null);
    res.json({ success: true, message: L.cSaved });
  });
  // For the free Growth check opened from the tracker: the owner's e-mail address to fill in. Only with a valid signed
  // handoff, which only the owner gets (dashboard and weekly e-mail).
  app.get('/api/rank-free/handoff', async (req, res) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    const r = await handoff.read(String(req.query.rt || '')).catch(() => null);
    if (!r) return res.status(404).json({ success: false });
    res.json({ success: true, email: r.account.email, keyword: r.keyword, host: r.project.host });
  });
  app.post('/api/rank-free/d/:token/gsc/delete', async (req, res) => {
    const a = await accountFor(req.params.token).catch(() => null);
    if (!a) return res.status(404).json({ success: false, error: 'Not found' });
    const p = await store.projectOf(a.id); if (p) await store.setGsc(p.id, null, null);
    res.json({ success: true });
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
