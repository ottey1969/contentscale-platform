'use strict';
// Free rank tracker: an optional Search Console export of the whole website, uploaded by hand (no Google sign-in).
// It adds what a Google snapshot cannot: real clicks, impressions and the average position over a period. It is checked
// against the tracked website (Pages.csv must list pages of this site) and the country filter of the export is shown as
// it is, never assumed. Nothing here is estimated: a search term without Search Console rows simply has no numbers.
const { readGscExport, unzip, parseCsv, classify } = require('../growth-free/gsc-export.cjs');

const hostOf = u => { try { return new URL(String(u || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const onSite = (h, host) => !!h && (h === host || h.endsWith('.' + host));

// The filters Search Console wrote into Filters.csv (country, page), as written, in any interface language.
function filtersOf(files) {
  const parts = classify(files); const out = { country: null, page: null };
  if (!parts.filters) return out;
  for (const r of parseCsv(parts.filters)) {
    const k = String(r[0] || '').toLowerCase(), v = r.slice(1).join(' ').trim();
    if (!v) continue;
    if (/countr|land|país|pais|pays|ülke|paese/.test(k)) out.country = v.slice(0, 80);
    else if (/page|pagina|página|seite|sayfa/.test(k)) out.page = v.slice(0, 300);
  }
  return out;
}

function readSiteExport({ fileName, content, host }) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ''), 'base64');
  const base = readGscExport({ fileName, content: buf, pageUrl: 'https://' + host + '/' });
  if (base.status === 'INVALID') return { error: base.reason, message: base.message };
  let files = {};
  try { files = /\.zip$/i.test(String(fileName || '')) || buf.readUInt32LE(0) === 0x04034b50 ? unzip(buf) : {}; } catch { files = {}; }
  const parts = classify(files);
  // The export must be of this website: when it lists pages, at least one is on this site and most are.
  if (parts.pages) {
    const hosts = parseCsv(parts.pages).map(r => hostOf(r[0])).filter(Boolean);
    const mine = hosts.filter(h => onSite(h, host)).length;
    if (hosts.length && mine * 2 < hosts.length) return { error: 'OTHER_SITE' };
  }
  const f = filtersOf(files);
  if (f.page) { const ph = hostOf((f.page.match(/https?:\/\/\S+/) || [''])[0]); if (ph && !onSite(ph, host)) return { error: 'OTHER_SITE' }; }
  return { period: base.period || null, totals: base.totals || null, country_filter: f.country, page_filter: f.page,
    queries: (base.queries || []).slice(0, 200).map(q => ({ query: q.query.toLowerCase(), clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position })),
    file: String(fileName || '').slice(0, 120) };
}

// Search terms that already have impressions and an average position just outside the top: the cheapest gains.
function opportunities(gsc, tracked = [], { max = 8, minImpressions = 10 } = {}) {
  if (!gsc || !Array.isArray(gsc.queries)) return [];
  const have = new Set(tracked);
  return gsc.queries.filter(q => !have.has(q.query) && q.position != null && q.position >= 4 && q.position <= 20 && q.impressions >= minImpressions && q.query.length <= 80)
    .sort((a, b) => b.impressions - a.impressions).slice(0, max);
}

// The one keyword to work on next: tracked, found by Google at position 4-20 in the last check. With Search Console
// data the one with the most impressions wins (most people see it); without, the one closest to the top.
function bestOpportunity(keywords, gsc) {
  const byQuery = new Map((gsc && gsc.queries || []).map(q => [q.query, q]));
  const c = keywords.map(k => ({ k, last: k.history[0] && k.history[0].result, g: byQuery.get(k.keyword) || null }))
    .filter(x => x.last && x.last.status === 'FOUND' && x.last.position >= 4 && x.last.position <= 20);
  if (!c.length) return null;
  c.sort((a, b) => ((b.g ? b.g.impressions : -1) - (a.g ? a.g.impressions : -1)) || (a.last.position - b.last.position));
  return { keyword: c[0].k.keyword, result: c[0].last, gsc: c[0].g, row: c[0].k };
}

// After the owner says "I changed this page": what the checks since then show. Google often needs 2-6 weeks, so the
// keyword stays the best opportunity while it does not grow, with this status instead of the same advice every week.
//   WAITING   – changed less than 6 weeks ago, not higher yet (or not checked since)
//   GROWING   – the last check after the change is higher than the position on the day of the change
//   NO_GROWTH – 6 weeks or more and not higher: time for a new Growth check
const FOLLOW_DAYS = 42;
function followUp(row, now = new Date()) {
  if (!row || !row.changed_at) return null;
  const at = new Date(row.changed_at), days = Math.floor((now - at) / 864e5);
  const after = (row.history || []).map(h => h.result).filter(r => r && new Date(r.checked_at) > at);
  const last = after[0] || null, from = row.changed_position == null ? null : Number(row.changed_position);
  const now_ = last && last.status === 'FOUND' ? last.position : null;
  const base = { since: at.toISOString().slice(0, 10), days, from, to: now_, checks_since: after.length };
  if (from != null && now_ != null && now_ < from) return { status: 'GROWING', ...base };
  return { status: days >= FOLLOW_DAYS ? 'NO_GROWTH' : 'WAITING', ...base };
}

module.exports = { readSiteExport, opportunities, bestOpportunity, followUp, filtersOf, FOLLOW_DAYS };
