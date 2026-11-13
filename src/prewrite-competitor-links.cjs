'use strict';
// Pre-Write: never send readers to a competitor (owner 2026-11-13: a Spanish Brief proposed nireweb.es, goone.es,
// gmbapi.com and davidayala.com as external links; they are agencies and blogs that rank for the same query).
// A competitor is any domain that ranks in the live Google results for this keyword, unless it is an official or
// primary source (government, standards body, encyclopedia, the vendor of the product itself). Competitors stay in
// the research (competitor table, gaps); they only never become a link target.
const host = u => { try { return new URL(String(u || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
// Registrable domain, good enough for the TLDs this product serves (co.uk, com.au, com.es, gob.es and the like).
function siteOf(u) {
  const h = host(u); if (!h) return '';
  const p = h.split('.'); if (p.length <= 2) return h;
  const two = p.slice(-2).join('.');
  return /^(co|com|gob|gov|org|net|ac|edu)\.[a-z]{2}$/.test(two) ? p.slice(-3).join('.') : two;
}
const OFFICIAL = [
  /(^|\.)gov(\.[a-z]{2})?$/, /(^|\.)gob\.[a-z]{2}$/, /(^|\.)overheid\.nl$/, /(^|\.)rijksoverheid\.nl$/, /(^|\.)europa\.eu$/, /(^|\.)boe\.es$/,
  /(^|\.)edu(\.[a-z]{2})?$/, /(^|\.)ac\.[a-z]{2}$/, /(^|\.)wikipedia\.org$/, /(^|\.)wikidata\.org$/, /(^|\.)schema\.org$/, /(^|\.)w3\.org$/, /(^|\.)iso\.org$/,
  /(^|\.)openai\.com$/, /(^|\.)google\.com$/, /(^|\.)googleblog\.com$/, /(^|\.)blog\.google$/, /(^|\.)web\.dev$/, /(^|\.)microsoft\.com$/, /(^|\.)bing\.com$/,
  /(^|\.)anthropic\.com$/, /(^|\.)perplexity\.ai$/, /(^|\.)apple\.com$/, /(^|\.)mozilla\.org$/, /(^|\.)arxiv\.org$/, /(^|\.)acm\.org$/, /(^|\.)ieee\.org$/,
];
const isOfficial = u => { const h = host(u); return !!h && OFFICIAL.some(re => re.test(h)); };

// The sites that compete for this query: every ranking result, and every domain the Brief's competitor table names.
function competitorSites({ serpUrls = [], competitorTable = [], ownUrl = '' } = {}) {
  const own = siteOf(ownUrl), out = new Set();
  for (const r of serpUrls || []) { const s = siteOf(r && (r.url || r.link || r.exact_url)); if (s && s !== own) out.add(s); }
  for (const r of competitorTable || []) { const s = siteOf(r && (r.exact_url || r.url)) || siteOf('https://' + String(r && r.domain || '').replace(/^https?:\/\//, '')); if (s && s !== own) out.add(s); }
  return out;
}
const isCompetitorLink = (url, sites) => !isOfficial(url) && sites.has(siteOf(url));

module.exports = { siteOf, isOfficial, competitorSites, isCompetitorLink };
