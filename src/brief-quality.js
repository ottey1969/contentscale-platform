/**
 * brief-quality.js
 * Quality + validation layer for the ContentScale AI Citations Tracker.
 *
 * WHY: the LLM should not invent signals, numbers, or placeholders. It should only
 * narrate facts that this module computes deterministically in code. This file fixes
 * the concrete defects seen in real briefs:
 *   - contradictory GSC "signals" (position > 10 / > 20 while real position is 5.7)
 *   - raw placeholders shipped to clients ([X] years, [Y] projects)
 *   - self-referential / broken internal-link suggestions ("root emergency")
 *   - missed cannibalization (multiple pages on the same query)
 *   - recommending content that already exists, and duplicate recommendations
 *
 * PIPELINE (wire into index.js):
 *   1) const facts   = buildFactSheet({ gsc, page, site, brand });
 *   2) // send facts.contextBlock + facts.guardrails to Gemini as the ONLY allowed numbers
 *   3) const brief   = JSON.parse(geminiRawBrief);
 *   4) const clean   = postProcessBrief(brief, { gsc, page, site, brand });
 *      // clean.brief is client-safe; clean.report lists what was changed/removed
 *
 * INPUT CONTRACTS (rename fields to match your code):
 *   gsc   = { clicks:Number, impressions:Number, position:Number, lastModifiedISO?:String }
 *   page  = { url:String, html:String, title?:String, keyword:String }
 *   site  = { sitemap:[{ url, title?, lastmod? }], gscQueryPages?:[{ query, url, impressions }] }
 *   brand = { yearsInBusiness?, projectsCompleted?, licenses?:[], serviceArea?, name?, phone? }
 */

'use strict';

/* ------------------------------------------------------------------ *
 * 1. EXPECTED CTR BY POSITION  (approximate; tune to your niche/GSC)  *
 * ------------------------------------------------------------------ */
// Conservative desktop+mobile blended curve. The exact numbers matter less
// than the GAP between actual and expected — that gap is the real signal.
const CTR_CURVE = {
  1: 0.27, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.022, 10: 0.02,
};
function expectedCtr(position) {
  if (!position || position < 1) return 0;
  const p = Math.round(position);
  if (p <= 10) return CTR_CURVE[p];
  if (p <= 20) return 0.012;
  return 0.005;
}

/* ------------------------------------------------------------------ *
 * 2. DETERMINISTIC GSC SIGNALS  (replaces the templated ones)        *
 * ------------------------------------------------------------------ */
function computeGscSignals({ clicks = 0, impressions = 0, position = 0, lastModifiedISO }) {
  const signals = [];
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const exp = expectedCtr(position);
  const pct = (n) => `${(n * 100).toFixed(2)}%`;

  // --- CTR gap: the #1 lever when you already rank but barely get clicks ---
  if (impressions >= 300 && exp > 0 && ctr < exp * 0.5) {
    signals.push({
      id: 'ctr_gap',
      priority: 'HIGH',
      title: 'Title/meta is suppressing clicks',
      // every number here is real, not a template:
      evidence:
        `Position ${position.toFixed(1)} with ${impressions} impressions but ${pct(ctr)} CTR. ` +
        `Expected CTR at this position is ~${pct(exp)}. You are capturing roughly ` +
        `${exp > 0 ? Math.round((ctr / exp) * 100) : 0}% of the clicks this ranking should earn.`,
      lever: 'Rewrite the SERP title + meta description around a unique hook; rerun after recrawl.',
    });
  }

  // --- Position bands: only emit the one that matches reality ---
  if (position > 0 && position <= 3) {
    signals.push({ id: 'pos_top3', priority: 'LOW',
      title: 'Already top 3', evidence: `Position ${position.toFixed(1)}.`,
      lever: 'Protect with freshness + internal links; focus on AI-citation signals.' });
  } else if (position > 3 && position <= 10) {
    signals.push({ id: 'pos_page1', priority: 'MEDIUM',
      title: 'Page 1, not top 3',
      evidence: `Position ${position.toFixed(1)} — on page 1 but below the high-CTR top 3.`,
      lever: 'Earn referring domains + tighten topical depth to push toward top 3.' });
  } else if (position > 10) {
    signals.push({ id: 'pos_page2', priority: 'HIGH',
      title: 'Ranking gap (page 2+)',
      evidence: `Position ${position.toFixed(1)} — below page 1.`,
      lever: 'Authority + content depth gap vs. page-1 competitors.' });
  }

  // --- Freshness: computed from real lastmod, not "implied" ---
  if (lastModifiedISO) {
    const days = Math.floor((Date.now() - new Date(lastModifiedISO).getTime()) / 86400000);
    if (days >= 90) {
      signals.push({ id: 'stale', priority: 'MEDIUM',
        title: 'Freshness signal aging',
        evidence: `Last modified ${days} days ago.`,
        lever: 'Refresh content + update dateModified / og:updated_time to today.' });
    }
  }

  return signals;
}

/* ------------------------------------------------------------------ *
 * 3. CANNIBALIZATION  (the site-wide check the single-URL view lacks) *
 * ------------------------------------------------------------------ */
const STOP = new Set(['the', 'a', 'in', 'of', 'for', 'and', 'to', 'nj', 'near', 'me', 'best', '24', '7', '247']);
function coreTokens(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter((t) => t && t.length > 2 && !STOP.has(t));
}
function slugTokens(url = '') {
  try { return coreTokens(new URL(url).pathname.replace(/\//g, ' ')); }
  catch { return coreTokens(url); }
}

function detectCannibalization({ keyword, page, site }) {
  const current = (page && page.url) || '';
  // Best evidence: GSC query -> pages. If you have it, use it (exact, not heuristic).
  if (site && Array.isArray(site.gscQueryPages)) {
    const q = keyword.toLowerCase().trim();
    const pages = site.gscQueryPages
      .filter((r) => (r.query || '').toLowerCase().trim() === q && r.impressions > 0)
      .map((r) => r.url);
    const unique = [...new Set(pages)];
    if (unique.length > 1) {
      return { cannibalized: true, source: 'gsc', keyword, pages: unique,
        note: `${unique.length} pages take impressions for "${keyword}". Pick one target; 301 or re-target the rest.` };
    }
    return { cannibalized: false, source: 'gsc', keyword, pages: unique };
  }
  // Fallback heuristic: sitemap slugs/titles sharing the keyword's core tokens.
  const kw = new Set(coreTokens(keyword));
  if (kw.size === 0 || !site || !Array.isArray(site.sitemap)) {
    return { cannibalized: false, source: 'none', keyword, pages: [] };
  }
  const matches = site.sitemap.filter((p) => {
    const toks = new Set([...slugTokens(p.url), ...coreTokens(p.title || '')]);
    let overlap = 0; kw.forEach((t) => { if (toks.has(t)) overlap++; });
    return overlap >= Math.max(2, kw.size - 1); // share (almost) all core tokens
  }).map((p) => p.url);
  const unique = [...new Set(matches)];
  return {
    cannibalized: unique.length > 1,
    source: 'sitemap',
    keyword,
    pages: unique,
    current,
    note: unique.length > 1
      ? `${unique.length} pages look targeted at "${keyword}". Confirm in GSC (query → pages), then keep one and 301/re-target the others.`
      : '',
  };
}

/* ------------------------------------------------------------------ *
 * 4. PLACEHOLDER GUARD  (never ship [X] / [Y] / [mention ...])        *
 * ------------------------------------------------------------------ */
const BRAND_MAP = {
  yearsInBusiness: ['years', 'x years', 'years in business'],
  projectsCompleted: ['projects', 'y projects', 'roofing projects'],
  serviceArea: ['service area', 'area'],
};
function fillOrStripPlaceholders(text = '', brand = {}) {
  const removedSentences = [];
  const filled = [];
  // Try to fill simple [token] placeholders from brand data.
  let out = text.replace(/\[([^\]]+)\]/g, (m, inner) => {
    const key = inner.toLowerCase();
    for (const [field, aliases] of Object.entries(BRAND_MAP)) {
      if (brand[field] != null && aliases.some((a) => key.includes(a))) {
        filled.push({ placeholder: m, value: brand[field] });
        return String(brand[field]);
      }
    }
    return '\u0000PH\u0000'; // mark unfillable placeholders
  });
  // Remove any sentence still containing an unfillable placeholder — better to
  // say less than to ship a blank or invite fabrication.
  if (out.includes('\u0000PH\u0000')) {
    out = out.split(/(?<=[.!?])\s+/).filter((sent) => {
      if (sent.includes('\u0000PH\u0000')) { removedSentences.push(sent.replace(/\u0000PH\u0000/g, '[…]')); return false; }
      return true;
    }).join(' ');
  }
  return { text: out.replace(/\u0000PH\u0000/g, '').replace(/\s{2,}/g, ' ').trim(), filled, removedSentences };
}

/* ------------------------------------------------------------------ *
 * 5. INTERNAL-LINK VALIDATION  (no self-links, real URLs only)        *
 * ------------------------------------------------------------------ */
function normalizePath(u) { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return (u || '').replace(/\/+$/, '') || '/'; } }
function hostOf(u) { try { return new URL(u).host; } catch { return ''; } }
function validateInternalLinks(htmlOrText = '', { site, page }) {
  const sitemap = (site && site.sitemap) ? site.sitemap : [];
  const siteHost = hostOf(page && page.url) || (sitemap[0] ? hostOf(sitemap[0].url) : '');
  const sitemapPaths = new Set(sitemap.map((p) => normalizePath(p.url)));
  const currentPath = normalizePath(page && page.url);
  const issues = [];
  const out = htmlOrText.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (full, href, anchor) => {
    const linkHost = hostOf(href);              // '' for relative links => treat as internal
    const internal = !linkHost || linkHost === siteHost;
    if (!internal) return full;                 // external links are left alone
    const path = normalizePath(href);
    if (path === currentPath) { issues.push({ type: 'self_link', href }); return anchor; }       // unwrap self-link
    if (sitemapPaths.size && !sitemapPaths.has(path)) { issues.push({ type: 'unknown_url', href }); return anchor; } // unwrap dead internal link
    return full;
  });
  return { text: out, issues };
}

/* ------------------------------------------------------------------ *
 * 6. EXISTING-CONTENT CHECK + DEDUPE                                  *
 * ------------------------------------------------------------------ */
function countQuestionHeadings(html = '') {
  return (html.match(/<h[23][^>]*>[^<]*\?[^<]*<\/h[23]>/gi) || []).length;
}
function suppressRedundant(recs = [], { page }) {
  const html = (page && page.html) || '';
  const hasManyQ = countQuestionHeadings(html) >= 3;
  return recs.filter((r) => {
    const txt = `${r.title || ''} ${r.action || ''}`.toLowerCase();
    if (hasManyQ && /question[-\s]?based h2|add (a )?question/.test(txt)) {
      r._suppressed = 'page already has question-style headings'; return false;
    }
    return true;
  });
}
function dedupe(recs = []) {
  const seen = new Set(); const out = [];
  for (const r of recs) {
    const key = `${r.engine || ''}|${(r.action || r.title || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key); out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 9. KEYWORD VALIDITY  (reject navigational / stopword-only queries)  *
 * ------------------------------------------------------------------ */
const NON_TARGET = new Set([
  'about', 'about us', 'home', 'homepage', 'contact', 'contact us', 'login', 'log in',
  'sign in', 'privacy', 'privacy policy', 'terms', 'terms and conditions', 'sitemap',
  'faq', 'faqs', 'blog', 'services', 'menu', 'search', 'disclaimer', 'index',
]);
function isValidKeyword(keyword = '') {
  const k = String(keyword).toLowerCase().trim();
  if (!k) return { valid: false, reason: 'empty keyword' };
  if (NON_TARGET.has(k)) return { valid: false, reason: `"${keyword}" is a navigational/structural label, not a search target` };
  if (k.length <= 2) return { valid: false, reason: 'keyword too short to be meaningful' };
  if (coreTokens(k).length === 0) return { valid: false, reason: `"${keyword}" is only stopwords — no real search intent` };
  return { valid: true, reason: '' };
}

/* ------------------------------------------------------------------ *
 * 10. DATA SUFFICIENCY  (don't draw conclusions from noise)          *
 * ------------------------------------------------------------------ */
function assessDataSufficiency({ impressions = 0 } = {}, minImpressions = 300) {
  if (impressions < minImpressions) {
    return { sufficient: false,
      note: `Only ${impressions} impressions — too little data for CTR/ranking conclusions ` +
            `(need ~${minImpressions}+). Mark findings low-confidence; do NOT assert a title/meta "mismatch".` };
  }
  return { sufficient: true, note: '' };
}

/* ------------------------------------------------------------------ *
 * 11. FABRICATED RELATIONSHIP / CLAIM GUARD  (beyond placeholders)    *
 * ------------------------------------------------------------------ */
// Lineage/association claims that must be backed by verified facts (brand.allowedClaims) or removed.
const RISKY_CLAIM = /\b(successor to|succeeded|replaced (?:them|by)|\bthe\b[^.]{0,30}\bsuccessor\b|acquired by|acquired|merged with|merger with|official partner|in partnership with|powered by|owned by|subsidiary of|affiliated with|endorsed by|certified by|authorized (?:dealer|reseller))\b/i;
function scanForRiskyClaims(text = '', brand = {}) {
  const allowed = (brand.allowedClaims || []).map((s) => String(s).toLowerCase());
  const flagged = [];
  const kept = String(text).split(/(?<=[.!?])\s+/).filter((sent) => {
    const m = sent.match(RISKY_CLAIM);
    if (m && !allowed.some((a) => sent.toLowerCase().includes(a))) {
      flagged.push({ phrase: m[0].trim(), sentence: sent.trim() });
      return false; // remove the unverified lineage/association claim
    }
    return true;
  });
  return { text: kept.join(' ').replace(/\s{2,}/g, ' ').trim(), flagged };
}

/* ------------------------------------------------------------------ *
 * 12. NO-OP RECS + ONE-PER-TARGET  (no empty / duplicate-target recs) *
 * ------------------------------------------------------------------ */
function dropNoOps(recs = [], { page = {} } = {}) {
  const norm = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const currents = [norm(page.title), norm(page.h1), norm(page.metaDescription)].filter(Boolean);
  return recs.filter((r) => {
    const action = String(r.action || '').trim();
    if (!action) { r._dropped = 'empty action'; return false; }
    const proposed = norm(action.includes(':') ? action.slice(action.indexOf(':') + 1) : action);
    if (proposed && currents.includes(proposed)) { r._dropped = 'proposed value equals current (no-op)'; return false; }
    return true;
  });
}
// Collapse multiple recs that change the SAME on-page target (e.g. two conflicting
// meta-description rewrites) to one — keep highest priority, then first seen.
const TARGET_PATTERNS = [
  { target: 'meta_description', re: /meta description/i },
  { target: 'seo_title', re: /seo title|title tag|<title>/i },
  { target: 'h1', re: /\bh1\b/i },
];
const PRIO = { HIGH: 3, MEDIUM: 2, LOW: 1 };
function collapseByTarget(recs = []) {
  const bestByTarget = {}; const passthrough = []; const collapsed = [];
  for (const r of recs) {
    const blob = `${r.title || ''} ${r.action || ''}`;
    const hit = TARGET_PATTERNS.find((t) => t.re.test(blob));
    if (!hit) { passthrough.push(r); continue; }
    const cur = bestByTarget[hit.target];
    if (!cur) { bestByTarget[hit.target] = r; continue; }
    const keep = (PRIO[r.priority] || 0) > (PRIO[cur.priority] || 0) ? r : cur;
    collapsed.push({ target: hit.target, dropped: (keep === r ? cur : r).title || '' });
    bestByTarget[hit.target] = keep;
  }
  return { recs: [...passthrough, ...Object.values(bestByTarget)], collapsed };
}

/* ------------------------------------------------------------------ *
 * 7. FACT SHEET FOR GEMINI  (the only numbers it may use)            *
 * ------------------------------------------------------------------ */
function buildFactSheet({ gsc, page, site, brand }) {
  const signals = computeGscSignals(gsc || {});
  const cannib = detectCannibalization({ keyword: page.keyword, page, site });
  const kw = isValidKeyword(page.keyword);
  const data = assessDataSufficiency(gsc || {});
  const ctr = gsc && gsc.impressions ? (gsc.clicks / gsc.impressions) : 0;

  const contextBlock = [
    `URL: ${page.url}`,
    `Target keyword: ${page.keyword}`,
    `Keyword validity: ${kw.valid ? 'valid' : 'INVALID — ' + kw.reason}`,
    `Data sufficiency: ${data.sufficient ? 'sufficient' : data.note}`,
    `GSC: clicks=${gsc.clicks}, impressions=${gsc.impressions}, position=${gsc.position}, ctr=${(ctr * 100).toFixed(2)}%`,
    `Computed signals: ${JSON.stringify(signals)}`,
    cannib.cannibalized ? `Cannibalization: ${cannib.note} Pages: ${cannib.pages.join(', ')}` : `Cannibalization: none detected`,
    brand && Object.keys(brand).length ? `Verified brand facts: ${JSON.stringify(brand)}` : `Verified brand facts: NONE PROVIDED`,
  ].join('\n');

  const guardrails =
    'RULES: Use ONLY the numbers and facts in the context block. Do NOT invent statistics, ' +
    'positions, CTRs, dates, or credentials. NEVER output bracketed placeholders like [X] or [mention ...]; ' +
    'if a fact is not in "Verified brand facts", omit that claim entirely. ' +
    'NEVER state a relationship, lineage, or association with another company/brand ' +
    '(e.g. "successor to", "replaced", "acquired", "partner of", "powered by") unless it appears verbatim ' +
    'in "Verified brand facts.allowedClaims" — "alternative to X" is allowed, "successor to X" is NOT. ' +
    'If "Keyword validity" is INVALID, do NOT optimize for it — instead recommend choosing a real target keyword. ' +
    'If "Data sufficiency" is insufficient, do NOT assert a title/meta "mismatch"; label findings low-confidence. ' +
    'Only recommend adding content not already described as present. Return valid JSON only.';

  return { signals, cannibalization: cannib, keywordValidity: kw, dataSufficiency: data, contextBlock, guardrails };
}

/* ------------------------------------------------------------------ *
 * 8. POST-PROCESS THE LLM BRIEF  (client-safe output + change report) *
 * ------------------------------------------------------------------ */
function postProcessBrief(brief, ctx, opts = {}) {
  const report = {
    placeholdersRemoved: [], placeholdersFilled: [], linkIssues: [], suppressed: [],
    riskyClaimsRemoved: [], droppedNoOps: [], collapsed: [], cannibalization: null,
    keywordValidity: null, dataSufficiency: null,
  };
  const brand = ctx.brand || {};

  // brief.recommendations expected shape: [{ engine, priority, title, action, impact }]
  let recs = Array.isArray(brief.recommendations) ? brief.recommendations.slice() : [];

  // a) per-field cleaning: fill/strip placeholders, then strip fabricated relationship claims, then validate links
  recs = recs.map((r) => {
    for (const f of ['title', 'action', 'impact']) {
      if (typeof r[f] !== 'string') continue;
      const ph = fillOrStripPlaceholders(r[f], brand);
      r[f] = ph.text;
      report.placeholdersRemoved.push(...ph.removedSentences);
      report.placeholdersFilled.push(...ph.filled);
      const rc = scanForRiskyClaims(r[f], brand);
      r[f] = rc.text;
      report.riskyClaimsRemoved.push(...rc.flagged);
    }
    if (typeof r.action === 'string') {
      const lv = validateInternalLinks(r.action, ctx);
      r.action = lv.text; report.linkIssues.push(...lv.issues);
    }
    return r;
  });

  // b) suppress recs the page already satisfies; drop no-ops; dedupe; collapse same-target conflicts
  const preSuppress = recs;
  recs = suppressRedundant(recs, ctx);
  report.suppressed = preSuppress.filter((r) => r._suppressed).map((r) => ({ title: r.title, reason: r._suppressed }));
  const preNoop = recs;
  recs = dropNoOps(recs, ctx);
  report.droppedNoOps = preNoop.filter((r) => r._dropped).map((r) => ({ title: r.title, reason: r._dropped }));
  recs = dedupe(recs);
  const col = collapseByTarget(recs);
  recs = col.recs; report.collapsed = col.collapsed;

  // c) keyword validity — if the target is a non-keyword, replace the plan with the real fix
  const kw = isValidKeyword(ctx.page.keyword);
  report.keywordValidity = kw;
  if (!kw.valid && opts.injectGlobal !== false) {
    recs.unshift({
      engine: 'Google', priority: 'HIGH', title: 'Target a real keyword',
      action: `${kw.reason}. Re-run the scan against an intent-bearing query (e.g. a brand, service, or topic term) instead of optimizing this page for "${ctx.page.keyword}".`,
      impact: 'Optimizing for a navigational/stopword query yields no qualified traffic; a real target keyword does.',
    });
  }

  // d) data sufficiency note
  const data = assessDataSufficiency(ctx.gsc || {});
  report.dataSufficiency = data;

  // e) inject the cannibalization finding the single-URL view would miss
  const cannib = detectCannibalization({ keyword: ctx.page.keyword, page: ctx.page, site: ctx.site });
  report.cannibalization = cannib;
  if (cannib.cannibalized && opts.injectGlobal !== false) {
    recs.unshift({
      engine: 'Google', priority: 'HIGH', title: 'Resolve keyword cannibalization',
      action: cannib.note + ' Pages: ' + cannib.pages.join(', '),
      impact: 'Consolidating one target per query typically lifts ranking + CTR more than any title tweak.',
    });
  }

  return { brief: { ...brief, recommendations: recs }, report };
}

module.exports = {
  expectedCtr,
  computeGscSignals,
  detectCannibalization,
  isValidKeyword,
  assessDataSufficiency,
  scanForRiskyClaims,
  fillOrStripPlaceholders,
  validateInternalLinks,
  suppressRedundant,
  dropNoOps,
  collapseByTarget,
  dedupe,
  buildFactSheet,
  postProcessBrief,
};
