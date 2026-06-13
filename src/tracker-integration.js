/**
 * tracker-integration.js  (reference wiring)
 * Shows exactly where buildFactSheet + postProcessBrief plug into your existing
 * two-call flow (Citation Brief -> `recommendations`, GSC Brief -> `gsc_brief`).
 *
 * Search for "// >>> WIRE" — those are the only lines you replace with your real
 * functions/variables. Everything else is the quality layer doing its job.
 *
 * Principle: compute facts in code -> feed Gemini ONLY those facts -> validate its
 * output. Gemini never invents numbers, dates, credentials, or placeholders again.
 */
'use strict';
const {
  buildFactSheet,
  postProcessBrief,
  computeGscSignals,
} = require('./brief-quality.js');

/**
 * Gather everything the fact sheet needs for one URL scan.
 * Replace each WIRE line with your existing fetchers.
 */
async function gatherInputs(scan) {
  // >>> WIRE: your GSC fetch (clicks, impressions, position). Keep position as a number.
  const gsc = await getGscData(scan.url, scan.keyword); // { clicks, impressions, position, lastModifiedISO? }

  // >>> WIRE: the page HTML you already fetch for scoring (first ~5000 chars is fine for checks).
  const html = await fetchPageHtml(scan.url);

  // >>> WIRE: your sitemap import (you already parse this). Pass [{url,title?,lastmod?}].
  const sitemap = await getSitemap(scan.domain);

  // >>> WIRE (recommended): GSC query -> pages, makes cannibalization EXACT not heuristic.
  const gscQueryPages = await getGscQueryPages(scan.domain).catch(() => undefined); // [{query,url,impressions}]

  // >>> WIRE: your brand_context field -> verified brand facts (prevents fabrication + fills E-E-A-T).
  const brand = mapBrandContext(scan.brand_context); // { yearsInBusiness?, projectsCompleted?, licenses?, serviceArea?, name?, phone? }

  return {
    gsc,
    page: { url: scan.url, keyword: scan.keyword, html, title: scan.title },
    site: { sitemap, gscQueryPages },
    brand,
  };
}

/**
 * One scan -> validated Citation Brief + GSC Brief, ready to store.
 */
async function runScan(scan, { geminiCall, broadcast }) {
  const ctx = await gatherInputs(scan);

  // 1) deterministic facts — the ONLY numbers Gemini may use
  const facts = buildFactSheet(ctx);

  // 2) build prompts that inject the fact block + guardrails
  const sharedHeader =
    `${facts.guardrails}\n\n--- VERIFIED CONTEXT (use only this) ---\n${facts.contextBlock}\n--- END CONTEXT ---\n`;

  const citationPrompt =
    `${sharedHeader}\nTASK: Produce per-engine AI-citation recommendations (Google AIO, Perplexity, ` +
    `Copilot, Claude) as JSON: {"recommendations":[{"engine","priority","title","action","impact"}]}. ` +
    `Only recommend content that is not already present. No placeholders.`;

  const gscPrompt =
    `${sharedHeader}\nTASK: Produce GSC ranking/CTR recommendations as JSON: ` +
    `{"recommendations":[{"engine":"Google","priority","title","action","impact"}]}. ` +
    `Base every claim on the computed signals above; do not restate signals that aren't listed.`;

  // 3) call Gemini (your existing helper). Two calls, as today.
  // >>> WIRE: replace geminiCall with your actual Gemini wrapper.
  const [rawCitation, rawGsc] = await Promise.all([
    geminiCall(citationPrompt),
    geminiCall(gscPrompt),
  ]);

  // 4) post-process BOTH briefs (strip placeholders, dedupe, validate links,
  //    suppress redundant, inject cannibalization). Client-safe out.
  const citation = postProcessBrief(safeJson(rawCitation), ctx);
  const gsc = postProcessBrief(safeJson(rawGsc), ctx);

  // 5) shape your stored record (matches your existing columns)
  const result = {
    url: scan.url,
    keyword: scan.keyword,
    signals: facts.signals,                       // computed, consistent
    cannibalization: facts.cannibalization,       // the site-wide finding
    recommendations: citation.brief.recommendations, // -> your `recommendations`
    gsc_brief: gsc.brief.recommendations,            // -> your `gsc_brief`
    quality_report: {                              // log what was cleaned (for your QA dashboard)
      citation: citation.report,
      gsc: gsc.report,
    },
  };

  // >>> WIRE: your SSE broadcast + DB write + badge gate (brief_check_count > 0).
  if (broadcast) broadcast(scan.url, { type: 'scan_complete', result });
  return result;
}

/** Defensive JSON parse — strips ```json fences and tolerates a non-array shape. */
function safeJson(raw) {
  if (raw && typeof raw === 'object') return normalize(raw);
  try { return normalize(JSON.parse(String(raw).replace(/```json|```/g, '').trim())); }
  catch { return { recommendations: [] }; }
}
function normalize(obj) {
  if (Array.isArray(obj)) return { recommendations: obj };
  if (obj && !Array.isArray(obj.recommendations)) obj.recommendations = [];
  return obj || { recommendations: [] };
}

/* -------- placeholder stubs so this file runs/lints; delete once wired -------- */
async function getGscData() { return { clicks: 0, impressions: 0, position: 0 }; }
async function fetchPageHtml() { return ''; }
async function getSitemap() { return []; }
async function getGscQueryPages() { return undefined; }
function mapBrandContext(b) { return b || {}; }

module.exports = { gatherInputs, runScan, safeJson };
