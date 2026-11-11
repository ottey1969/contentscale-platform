'use strict';
// The automatic part of the free rank tracker: due keywords are checked, results saved, and one e-mail per project goes
// out when all its keywords have a fresh result. A monthly provider budget caps the cost for all free users together;
// when it is used up, checks are postponed one day (never dropped, never estimated).
const { checkRank, changeOf, growthLink } = require('./engine.cjs');
const { digestEmail, followText, t } = require('./texts.cjs');
const { bestOpportunity, followUp } = require('./gsc.cjs');
const { linkToken } = require('./links.cjs');
const { countryName } = require('../growth-search-locale.cjs');

const DAY = 86400000;
const WEEK = 7 * DAY;

async function runDue({ store, key, fetchImpl = global.fetch, now = new Date(), monthlyCap = 3000, batch = 40, maxPages, check = checkRank } = {}) {
  const out = { checked: 0, postponed: 0, errors: 0, calls: 0, budget_reached: false };
  if (!key) return { ...out, skipped: 'PROVIDER_NOT_CONFIGURED' };
  const due = await store.due(now, batch);
  for (const k of due) {
    // A check costs up to three calls: start one only when three still fit in this month's budget.
    if ((await store.usage(now)) + 3 > monthlyCap) {
      out.budget_reached = true;
      await store.postpone(k.keyword_id, new Date(now.getTime() + DAY)); out.postponed++; continue;
    }
    const r = await check({ keyword: k.keyword, host: k.host, gl: k.gl, hl: k.hl, key, fetchImpl, ...(maxPages ? { maxPages } : {}), now: () => now });
    if (r.calls) { await store.addUsage(now, r.calls); out.calls += r.calls; }
    if (r.status !== 'FOUND' && r.status !== 'NOT_IN_RESULTS') {
      // A failed provider call is retried in six hours; it never counts as "not ranking".
      out.errors++; await store.postpone(k.keyword_id, new Date(now.getTime() + DAY / 4), String(r.reason || r.status).slice(0, 60), now);
      console.warn('[rank-free] check failed', k.keyword_id, r.status, r.reason || '');
      continue;
    }
    await store.saveResult(k.keyword_id, r, new Date(now.getTime() + WEEK));
    out.checked++;
  }
  return out;
}

// One e-mail per project after a full round: every keyword with its position and what changed since the round before.
async function sendDigests({ store, send, baseUrl, growthUrl = 'https://app.contentscale.site/free-growth', now = new Date() } = {}) {
  const out = { sent: 0, failed: 0 };
  if (typeof send !== 'function') return out;
  for (const p of await store.digestReady(now)) {
    const token = linkToken(p.dashboard_nonce);
    if (!token) { out.failed++; continue; }
    const rows = [], full = [];
    for (const k of await store.keywords(p.id)) {
      const history = await store.history(k.id, 12), [curr, prev] = history;
      rows.push({ keyword: k.keyword, curr: curr && curr.result, change: changeOf(prev && prev.result, curr && curr.result) });
      full.push({ keyword: k.keyword, history, changed_at: k.changed_at || null, changed_position: k.changed_position == null ? null : Number(k.changed_position) });
    }
    // The same best opportunity as on the dashboard, with its follow-up after a change and the filled-in Growth check.
    const gsc = p.gsc ? (typeof p.gsc === 'string' ? JSON.parse(p.gsc) : p.gsc) : null;
    const b = bestOpportunity(full, gsc), L = t(p.lang), fu = b ? followUp(b.row, now) : null;
    const best = b ? { keyword: b.keyword, position: b.result.position, follow: followText(fu, L), cta: fu ? L.cAgain : L.bCta,
      link: growthLink(growthUrl, p, b.keyword, b.result), show_cta: !fu || fu.status === 'NO_GROWTH' } : null;
    // Google's own related searches from this round that are not tracked yet (at most five).
    const tracked = new Set(rows.map(r => r.keyword)), suggestions = [];
    for (const r of rows) for (const x of (r.curr && Array.isArray(r.curr.suggestions) ? r.curr.suggestions : [])) if (!tracked.has(x) && !suggestions.includes(x) && suggestions.length < 5) suggestions.push(x);
    const mail = digestEmail(p.lang, { host: p.host, countryLabel: countryName(String(p.gl).toUpperCase()), rows, suggestions, best,
      dashboard: baseUrl + '/rank-tracker/d/' + token, stop: baseUrl + '/rank-tracker/stop/' + token });
    const ok = await send({ to: [p.email], subject: mail.subject, html: mail.html }).catch(() => false);
    // Marked either way: a failed e-mail is not retried every hour; the next weekly round sends a new one.
    await store.markDigest(p.id, now);
    if (ok) out.sent++; else out.failed++;
  }
  return out;
}

module.exports = { runDue, sendDigests, WEEK, DAY };
