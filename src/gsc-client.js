/**
 * gsc-client.js
 * Google Search Console (Search Analytics) client for the AI Citations Tracker.
 *
 * It feeds two things the quality layer needs from REAL data:
 *   - getPageMetrics()  -> { clicks, impressions, position, ctr }  => the `gsc` object
 *   - getQueryPages()   -> [{ query, url, clicks, impressions, position }] => `site.gscQueryPages`
 *     (this is what makes cannibalization + keyword validity EXACT instead of heuristic)
 *
 * AUTH: this module is auth-agnostic — you pass an OAuth access token. Two ways to get one:
 *   A) Service account (for properties YOU own; grant the SA email access in GSC):
 *        npm i google-auth-library
 *        const { GoogleAuth } = require('google-auth-library');
 *        const auth = new GoogleAuth({ keyFile: 'sa.json',
 *          scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
 *        const token = (await (await auth.getClient()).getAccessToken()).token;
 *   B) OAuth2 refresh token (for client-connected properties in your SaaS):
 *        use google-auth-library OAuth2Client.setCredentials({refresh_token}); getAccessToken().
 *   Helpers for both are at the bottom (optional; require google-auth-library).
 *
 * siteUrl format:
 *   - Domain property:     'sc-domain:contentscale.site'
 *   - URL-prefix property: 'https://contentscale.site/'
 *
 * Requires Node 18+ (global fetch). On older Node: `npm i node-fetch` and inject it.
 */
'use strict';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

/* ---------- date helpers (GSC data lags ~2-3 days) ---------- */
function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function defaultRange(days = 28) { return { startDate: isoDaysAgo(days + 3), endDate: isoDaysAgo(3) }; }

/* ------------------------------------------------------------------ *
 * Core: one Search Analytics query (handles pagination via startRow)  *
 * ------------------------------------------------------------------ */
async function searchAnalytics(siteUrl, body, token, fetchImpl = fetch) {
  const url = `${API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows = [];
  let startRow = 0;
  const rowLimit = Math.min(body.rowLimit || 25000, 25000);
  // paginate until a short page comes back (GSC returns <rowLimit on the last page)
  // cap at 5 pages (125k rows) to stay sane.
  for (let i = 0; i < 5; i++) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'web', ...body, rowLimit, startRow }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GSC ${res.status} for ${siteUrl}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const batch = data.rows || [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
    startRow += rowLimit;
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * getPageMetrics: aggregate clicks/impressions/position for one URL   *
 * ------------------------------------------------------------------ */
async function getPageMetrics(siteUrl, pageUrl, opts = {}, token, fetchImpl = fetch) {
  const { startDate, endDate } = { ...defaultRange(opts.days), ...opts };
  const pageFilter = {
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }],
  };
  // aggregate row (no dimensions) = canonical totals + avg position for the page
  const agg = await searchAnalytics(siteUrl, { startDate, endDate, dimensions: [], ...pageFilter }, token, fetchImpl);
  const r = agg[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const out = { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0, topQueries: [] };

  if (opts.withQueries !== false) {
    const q = await searchAnalytics(siteUrl,
      { startDate, endDate, dimensions: ['query'], rowLimit: opts.queryLimit || 25, ...pageFilter }, token, fetchImpl);
    out.topQueries = q.map((row) => ({
      query: row.keys[0], clicks: row.clicks, impressions: row.impressions, position: row.position,
    }));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * getQueryPages: the query->page matrix (powers cannibalization)      *
 * Returns [{ query, url, clicks, impressions, position }]             *
 * ------------------------------------------------------------------ */
async function getQueryPages(siteUrl, opts = {}, token, fetchImpl = fetch) {
  const { startDate, endDate } = { ...defaultRange(opts.days), ...opts };
  const minImpressions = opts.minImpressions != null ? opts.minImpressions : 1;
  const rows = await searchAnalytics(siteUrl,
    { startDate, endDate, dimensions: ['query', 'page'], rowLimit: opts.rowLimit || 25000 }, token, fetchImpl);
  return rows
    .filter((r) => (r.impressions || 0) >= minImpressions)
    .map((r) => ({ query: r.keys[0], url: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }));
}

/* ------------------------------------------------------------------ *
 * cannibalizationFromRows: pure transform (unit-testable, no network) *
 * Groups query->page rows; flags any query served by >1 page.         *
 * ------------------------------------------------------------------ */
function cannibalizationFromRows(rows = [], opts = {}) {
  const minImpressions = opts.minImpressions != null ? opts.minImpressions : 10;
  const byQuery = new Map();
  for (const r of rows) {
    if ((r.impressions || 0) < 1) continue;
    if (!byQuery.has(r.query)) byQuery.set(r.query, []);
    byQuery.get(r.query).push(r);
  }
  const conflicts = [];
  for (const [query, list] of byQuery) {
    const totalImpr = list.reduce((s, x) => s + (x.impressions || 0), 0);
    if (list.length > 1 && totalImpr >= minImpressions) {
      conflicts.push({
        query,
        totalImpressions: totalImpr,
        pages: list
          .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
          .map((x) => ({ url: x.url, impressions: x.impressions, position: x.position })),
      });
    }
  }
  // biggest conflicts first
  return conflicts.sort((a, b) => b.totalImpressions - a.totalImpressions);
}

/* ------------------------------------------------------------------ *
 * Convenience: assemble the exact inputs brief-quality.js wants       *
 * ------------------------------------------------------------------ */
async function buildScanInputs({ siteUrl, pageUrl, keyword, token, days = 28, fetchImpl = fetch }) {
  const [metrics, queryPages] = await Promise.all([
    getPageMetrics(siteUrl, pageUrl, { days }, token, fetchImpl),
    getQueryPages(siteUrl, { days, minImpressions: 1 }, token, fetchImpl),
  ]);
  return {
    gsc: { clicks: metrics.clicks, impressions: metrics.impressions, position: metrics.position },
    gscQueryPages: queryPages,                 // -> site.gscQueryPages (exact cannibalization)
    topQueries: metrics.topQueries,            // handy: suggest a real keyword when target is junk
    suggestedKeyword: (metrics.topQueries[0] || {}).query || null,
  };
}

/* ------------------------------------------------------------------ *
 * OPTIONAL token helpers (require: npm i google-auth-library)         *
 * ------------------------------------------------------------------ */
async function tokenFromServiceAccount(keyFile) {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ keyFile, scopes: [GSC_SCOPE] });
  const client = await auth.getClient();
  return (await client.getAccessToken()).token;
}
async function tokenFromOAuthRefresh({ clientId, clientSecret, refreshToken }) {
  const { OAuth2Client } = require('google-auth-library');
  const c = new OAuth2Client(clientId, clientSecret);
  c.setCredentials({ refresh_token: refreshToken });
  return (await c.getAccessToken()).token;
}

module.exports = {
  searchAnalytics,
  getPageMetrics,
  getQueryPages,
  cannibalizationFromRows,
  buildScanInputs,
  tokenFromServiceAccount,
  tokenFromOAuthRefresh,
  defaultRange,
  GSC_SCOPE,
};
