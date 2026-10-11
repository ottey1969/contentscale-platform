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
      keyword: page.keyword || snapshot.keyword || '',
      topQuery: page.gsc_keyword || '',
      html: snapshot.html || snapshot.page_html || page.html || '',
      title: snapshot.metaTitle || page.title || '',
      h1: snapshot.h1Text || page.h1 || '',
      metaDescription: snapshot.metaDescription || page.metaDescription || '',
    },
    site: { sitemap: sitemap || [], gscQueryPages: gscQueryPages || undefined },
    brand: page.brand_context || snapshot.brand || {},
  };
}

// Persistent Brief tombstones: verified/rejected/overridden actions should not
// reappear solely because an LLM repeats them in a subsequent delta.
function actionKey(a) {
  return [a&&a.title,a&&a.action].map(v=>String(v||'').toLowerCase()
    .replace(/<[^>]*>/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()).join('|');
}
function resolvedKeys(page) {
  let brief=page&&page.brief_content||{};
  if(typeof brief==='string'){try{brief=JSON.parse(brief)}catch(_e){return new Set()}}
  const entries=Array.isArray(brief.manual_resolutions)?brief.manual_resolutions:[];
  return new Set(entries.filter(x=>x&&['AUTO_VERIFIED_SETTING','AUTO_VERIFIED_LIVE','MANUAL_OVERRIDE_COMPLETE','REJECTED_NOT_APPLICABLE'].includes(x.decision))
    .map(x=>actionKey(x.action||x)).filter(Boolean));
}

function cleanTrackerBriefs({ snapshot, page, recommendations = [], gscBrief = [], sitemap, gscQueryPages }) {
  const ctx = buildCtx({ snapshot, page, sitemap, gscQueryPages });
  const rec = postProcessBrief({ recommendations: (recommendations || []).map(toQ) }, ctx, { injectGlobal: true });
  const gsc = postProcessBrief({ recommendations: (gscBrief || []).map(toQ) }, ctx, { injectGlobal: false });
  const closed=resolvedKeys(page);
  const filteredRec=rec.brief.recommendations.filter(x=>!closed.has(actionKey(x)));
  const filteredGsc=gsc.brief.recommendations.filter(x=>!closed.has(actionKey(x)));
  return {
    recommendations: filteredRec.map(fromQ),
    gscBrief: filteredGsc.map(fromQ),
    report: { citation: rec.report, gsc: gsc.report,
      completed_actions_suppressed:rec.brief.recommendations.length-filteredRec.length+gsc.brief.recommendations.length-filteredGsc.length },
  };
}

module.exports = { cleanTrackerBriefs };
