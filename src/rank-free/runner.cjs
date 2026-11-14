'use strict';
// The automatic part of the free rank tracker: due keywords are checked, results saved, and one e-mail per project goes
// out when all its keywords have a fresh result. A monthly provider budget caps the cost for all free users together;
// when it is used up, checks are postponed one day (never dropped, never estimated).
const { checkRank, checkMaps, checkMapsGrid, GRID_SIZE, locationsOf, changeOf, growthLink } = require('./engine.cjs');
const { digestEmail, followText, plainFollow, t } = require('./texts.cjs');
const { bestOpportunity, followUp } = require('./gsc.cjs');
const { linkToken, handoffToken } = require('./links.cjs');
const { countryName } = require('../growth-search-locale.cjs');

const DAY = 86400000;
const WEEK = 7 * DAY;

async function runDue({ store, key, fetchImpl = global.fetch, now = new Date(), monthlyCap = 3000, batch = 40, maxPages, check = checkRank, maps = checkMaps, grid = checkMapsGrid } = {}) {
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
    // Google Maps for the project's place, when one is set: one more call, only if it still fits in this month's budget.
    // A Maps failure never blocks the organic result; it is saved as what it is (PROVIDER_ERROR), never as "not found".
    const places = locationsOf(k.maps_location);
    if (places.length) {
      const all = [];
      for (const location of places) {
        if ((await store.usage(now)) + 1 > monthlyCap) { all.push({ status: 'BUDGET_REACHED', location }); out.budget_reached = true; continue; }
        const m = await maps({ keyword: k.keyword, host: k.host, location, gl: k.gl, hl: k.hl, key, fetchImpl, now: () => now });
        if (m.calls) { await store.addUsage(now, m.calls); out.calls += m.calls; }
        all.push(m);
      }
      r.maps = all[0]; r.maps_places = all;
    }
    // Geo-grid for the keywords the owner chose: centred on the business's own Maps listing from this round. Without that
    // (not found in Maps, or no coordinates) there is no centre, and nothing is guessed.
    const gridKeywords = Array.isArray(k.maps_grid) ? k.maps_grid : (typeof k.maps_grid === 'string' ? JSON.parse(k.maps_grid || '[]') : []);
    if (k.maps_location && gridKeywords.includes(k.keyword)) {
      // Centre: the first place where the business's own listing was found with coordinates this round.
      const m = (r.maps_places || [r.maps]).find(x => x && x.status === 'FOUND' && x.lat != null && x.lng != null), center = m ? { lat: m.lat, lng: m.lng } : null;
      if (!center) r.grid = { status: 'NO_CENTER' };
      else if ((await store.usage(now)) + GRID_SIZE * GRID_SIZE > monthlyCap) { r.grid = { status: 'BUDGET_REACHED' }; out.budget_reached = true; }
      else {
        const g = await grid({ keyword: k.keyword, host: k.host, center, gl: k.gl, hl: k.hl, key, fetchImpl, now: () => now });
        if (g.calls) { await store.addUsage(now, g.calls); out.calls += g.calls; }
        r.grid = g;
      }
    }
    await store.saveResult(k.keyword_id, r, new Date(now.getTime() + WEEK));
    out.checked++;
  }
  return out;
}

// One e-mail per project after a full round: every keyword with its position and what changed since the round before.
async function sendDigests({ store, send, baseUrl, growthUrl = 'https://app.contentscale.site/free-growth', growthLinks = false, callUrl = null, now = new Date() } = {}) {
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
    // Without Growth links: the invitation to discuss SEO and GEO live in a call, on the contact page in the account's language.
    const call = (callUrl && (callUrl[p.lang] || callUrl.en)) || 'https://contentscale.site/contact/';
    const best = b ? { keyword: b.keyword, position: b.result.position, follow: growthLinks ? followText(fu, L) : plainFollow(followText(fu, L)), cta: growthLinks ? (fu ? L.cAgain : L.bCta) : L.callCta,
      link: growthLinks ? growthLink(growthUrl, p, b.keyword, b.result, handoffToken(p.dashboard_nonce, b.keyword)) : call, show_cta: !fu || fu.status === 'NO_GROWTH' } : null;
    // Google's own related searches from this round that are not tracked yet (at most five).
    const tracked = new Set(rows.map(r => r.keyword)), suggestions = [];
    for (const r of rows) for (const x of (r.curr && Array.isArray(r.curr.suggestions) ? r.curr.suggestions : [])) if (!tracked.has(x) && !suggestions.includes(x) && suggestions.length < 5) suggestions.push(x);
    const mail = digestEmail(p.lang, { host: p.host, countryLabel: countryName(String(p.gl).toUpperCase()), rows, suggestions, best,
      dashboard: baseUrl + '/rank-tracker/d/' + token, stop: baseUrl + '/rank-tracker/stop/' + token });
    const ok = await send({ to: [p.email], subject: mail.subject, html: mail.html }).catch(() => false);
    // Do not acknowledge an unsent digest as delivered: it is tried again after at least an hour, without rerunning paid
    // Google checks. Bounded (owner 2026-11-14): the scheduler runs every 15 minutes, so an address that keeps failing would
    // otherwise get hundreds of attempts a week. After DIGEST_TRIES failures this round is closed; the next weekly round
    // sends a new e-mail.
    if (ok) { await store.markDigest(p.id, now); out.sent++; continue; }
    out.failed++;
    const tries = typeof store.markDigestFailed === 'function' ? await store.markDigestFailed(p.id, now) : DIGEST_TRIES;
    if (tries >= DIGEST_TRIES) { await store.markDigest(p.id, now); console.warn('[rank-free] digest not delivered after', tries, 'attempts; round closed', p.id); }
    else console.warn('[rank-free] digest delivery failed; retry in at least an hour', p.id, 'attempt', tries);
  }
  return out;
}

const DIGEST_TRIES = 3;
module.exports = { runDue, sendDigests, WEEK, DAY, DIGEST_TRIES };
