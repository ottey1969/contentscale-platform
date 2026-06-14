/**
 * brief-quality-hook.js
 * One-call adapter between runTrackerCheck (index.js) and brief-quality.js.
 *
 * Your recs use { title, priority, system, action, expected_impact }.
 * The quality layer uses { engine, priority, title, action, impact }.
 * This hook maps both ways, applies every guard, and hands the arrays back
 * in YOUR shape — so the only change in index.js is ONE call before you save.
 *
 * WHERE TO CALL (inside runTrackerCheck, right before you store the briefs):
 *
 *   const { cleanTrackerBriefs } = require('./brief-quality-hook');
 *   const _q = cleanTrackerBriefs({
 *     snapshot,                 // your snapshot object (has google_position, html, etc.)
 *     page,                     // the page row (gsc_clicks/impressions/position/keyword, brand_context)
 *     recommendations,          // your AIO/citation brief array  (your variable)
 *     gscBrief: gsc_brief,      // your GSC brief array            (your variable)
 *     sitemap,                  // optional: [{url,title?}] if available
 *     gscQueryPages,            // optional: [{query,url,impressions}] from your shared GSC upload
 *   });
 *   recommendations = _q.recommendations;   // cleaned, same shape as before
 *   gsc_brief       = _q.gscBrief;          // cleaned, same shape as before
 *   // _q.report     -> optional: stash in brief_content / a log column for your QA view
 *
 * Nothing else in index.js changes. If a variable name differs, just pass yours.
 */
'use strict';
const { postProcessBrief } = require('./brief-quality');

function num(v) { return v == null ? 0 : (Number(v) || 0); }

// your shape -> quality shape (keep original to preserve any extra fields)
function toQ(r) {
  return {
    engine: r.system || r.engine || 'Google',
    priority: String(r.priority || 'MEDIUM').toUpperCase(),
    title: r.title || '',
    action: r.action || '',
    impact: r.expected_impact || r.impact || '',
    _orig: r,
  };
}
// quality shape -> your shape (preserve untouched original fields; your briefs use lower-case priority)
function fromQ(r) {
  const base = (r._orig && typeof r._orig === 'object') ? { ...r._orig } : {};
  delete base._orig;
  return {
    ...base,
    title: r.title,
    priority: String(r.priority || 'MEDIUM').toLowerCase(),
    system: r.engine || base.system || 'Google AIO',
    action: r.action,
    expected_impact: r.impact,
  };
}

function buildCtx({ snapshot = {}, page = {}, sitemap, gscQueryPages }) {
  return {
    gsc: {
      clicks: num(page.gsc_clicks),
      impressions: num(page.gsc_impressions),
      position: page.gsc_position != null ? Number(page.gsc_position) : num(snapshot.google_position),
    },
    page: {
      url: page.url || snapshot.url || '',
      keyword: page.gsc_keyword || page.keyword || snapshot.keyword || '',
      html: snapshot.html || snapshot.page_html || page.html || '',
      title: snapshot.metaTitle || page.title || '',
      h1: snapshot.h1Text || page.h1 || '',
      metaDescription: snapshot.metaDescription || page.metaDescription || '',
    },
    site: { sitemap: sitemap || [], gscQueryPages: gscQueryPages || undefined },
    brand: page.brand_context || snapshot.brand || {},
  };
}

function cleanTrackerBriefs({ snapshot, page, recommendations = [], gscBrief = [], sitemap, gscQueryPages }) {
  const ctx = buildCtx({ snapshot, page, sitemap, gscQueryPages });
  const rec = postProcessBrief({ recommendations: (recommendations || []).map(toQ) }, ctx, { injectGlobal: true });
  const gsc = postProcessBrief({ recommendations: (gscBrief || []).map(toQ) }, ctx, { injectGlobal: false });
  return {
    recommendations: rec.brief.recommendations.map(fromQ),
    gscBrief: gsc.brief.recommendations.map(fromQ),
    report: { citation: rec.report, gsc: gsc.report },
  };
}

module.exports = { cleanTrackerBriefs };
