'use strict';
// Contacts per country for the owner (owner 2026-11-12: "e-mails stored per country, especially those who want tips,
// with the website and keywords; delete and delete all, only in Free Growth and the rank tracker").
// Two sources, never the paid Tracker: the free rank tracker (account, website, country, keywords, tips consent) and the
// Free Growth checks (e-mail, page, search term, country, tips consent). Deleting removes all data of that person in
// that source (the rank tracker account with its project, keywords and results; every Free Growth check and request).
const MAX_ROWS = 5000;
const SOURCES = ['rank', 'growth'];
const countryOf = x => { const c = String(x || '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : ''; };
const missingTable = e => e && e.code === '42P01';

// Rank tracker: one row per account (its project and active keywords).
const RANK_SQL = `SELECT a.id::text AS id, a.email, a.lang, a.marketing_consent AS tips, a.verified_at, a.opted_out_at, a.created_at,
   p.host, UPPER(COALESCE(p.gl,'')) AS country, p.hl,
   COALESCE(ARRAY_AGG(k.keyword ORDER BY k.id) FILTER (WHERE k.active), '{}') AS keywords
  FROM rank_free_accounts a LEFT JOIN rank_free_projects p ON p.account_id=a.id LEFT JOIN rank_free_keywords k ON k.project_id=p.id
  GROUP BY a.id, p.id ORDER BY a.created_at DESC LIMIT ${MAX_ROWS}`;
// Free Growth: one row per e-mail address, with its latest check (page, search term, country, language).
const GROWTH_SQL = `WITH c AS (
   SELECT id, LOWER(email) AS email, url, query, marketing_consent, created_at,
    UPPER(COALESCE(market->'countries'->>0, report->'search_discovery'->'search_locale'->>'gl', '')) AS country,
    COALESCE(market->>'language', report->'search_discovery'->'search_locale'->>'hl', '') AS language
   FROM growth_free_checks WHERE COALESCE(email,'')<>'')
  SELECT email AS id, email, BOOL_OR(marketing_consent) AS tips, COUNT(*)::int AS checks, MIN(created_at) AS created_at, MAX(created_at) AS last_at,
   (ARRAY_AGG(url ORDER BY id DESC))[1] AS url, (ARRAY_AGG(query ORDER BY id DESC))[1] AS query,
   (ARRAY_AGG(country ORDER BY id DESC))[1] AS country, (ARRAY_AGG(language ORDER BY id DESC))[1] AS language
  FROM c GROUP BY email ORDER BY MAX(created_at) DESC LIMIT ${MAX_ROWS}`;

async function rows(pool, source) {
  try { return (await pool.query(source === 'rank' ? RANK_SQL : GROWTH_SQL)).rows.map(r => ({ ...r, country: countryOf(r.country) })); }
  catch (e) { if (missingTable(e)) return []; throw e; }
}
// All contacts of a source, the countries with their numbers, and the selection (country, tips only).
async function listContacts(pool, { source = 'rank', country = '', tipsOnly = false } = {}) {
  if (!SOURCES.includes(source)) throw Object.assign(Error('Unknown source'), { code: 'SOURCE' });
  const all = await rows(pool, source), want = country === 'NONE' ? '' : countryOf(country);
  const byCountry = new Map();
  for (const r of all) { const k = r.country || 'NONE', e = byCountry.get(k) || { country: k, contacts: 0, tips: 0 }; e.contacts++; if (r.tips) e.tips++; byCountry.set(k, e); }
  const selected = all.filter(r => (!country || r.country === want) && (!tipsOnly || r.tips));
  return { source, countries: [...byCountry.values()].sort((a, b) => b.contacts - a.contacts || a.country.localeCompare(b.country)), total: all.length, rows: selected };
}
// Delete one person in one source.
async function deleteContact(pool, { source, id }) {
  if (source === 'rank') {
    if (!/^\d{1,18}$/.test(String(id || ''))) return 0;
    try { return (await pool.query('DELETE FROM rank_free_accounts WHERE id=$1', [String(id)])).rowCount || 0; } catch (e) { if (missingTable(e)) return 0; throw e; }
  }
  if (source === 'growth') {
    const email = String(id || '').trim().toLowerCase(); if (!email.includes('@')) return 0;
    try {
      const h = await pool.query('DELETE FROM growth_free_hire_requests WHERE LOWER(email)=$1', [email]);
      const c = await pool.query("DELETE FROM growth_free_checks WHERE LOWER(email)=$1 OR COALESCE(emails,'[]'::jsonb) ? $1", [email]);
      return (c.rowCount || 0) + (h.rowCount || 0) > 0 ? 1 : 0;
    } catch (e) { if (missingTable(e)) return 0; throw e; }
  }
  return 0;
}
// Delete everyone in the current selection (one country, tips only, or all) of one source.
async function deleteSelection(pool, { source, country = '', tipsOnly = false }) {
  const { rows: list } = await listContacts(pool, { source, country, tipsOnly });
  let deleted = 0; for (const r of list) deleted += await deleteContact(pool, { source, id: r.id });
  return deleted;
}
// CSV of the selection (cells that a spreadsheet would run as a formula are quoted as text).
function toCsv(source, list) {
  const cell = x => { const s = String(x == null ? '' : x instanceof Date ? x.toISOString() : Array.isArray(x) ? x.join(' | ') : x); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
  const head = source === 'rank' ? ['country', 'email', 'tips', 'website', 'keywords', 'language', 'confirmed', 'stopped', 'created_at']
    : ['country', 'email', 'tips', 'last_page', 'last_search_term', 'language', 'checks', 'first_at', 'last_at'];
  const line = r => source === 'rank' ? [r.country, r.email, r.tips ? 'yes' : 'no', r.host, r.keywords, r.hl || r.lang, r.verified_at ? 'yes' : 'no', r.opted_out_at ? 'yes' : 'no', r.created_at]
    : [r.country, r.email, r.tips ? 'yes' : 'no', r.url, r.query, r.language, r.checks, r.created_at, r.last_at];
  return [head.join(','), ...list.map(r => line(r).map(cell).join(','))].join('\n');
}
module.exports = { listContacts, deleteContact, deleteSelection, toCsv, SOURCES, countryOf };
