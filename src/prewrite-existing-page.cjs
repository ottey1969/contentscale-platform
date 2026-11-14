'use strict';
// Pre-Write Brief: does this site already have a page for the keyword? Called directly from src/index.js.
// Deterministic and the same for every site, market and language: a page whose address contains every word of the
// keyword (or its stem) serves the same search intent, so a new page would compete with it (cannibalisation). Then
// the Brief recommends expanding that page instead of a new URL. Partial matches are listed for review, never forced.
// It also extracts the findings of a Brief that are useful when the existing page is expanded in Growth.

const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = s => fold(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2);
const stem = w => w.slice(0, 6);

function pathWords(url) {
  try { const u = new URL(url); return words(decodeURIComponent(u.pathname)); } catch (e) { return []; }
}
function normUrl(u) {
  try { const x = new URL(String(u || '').trim()); x.hash = ''; x.search = ''; return (x.protocol + '//' + x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return ''; }
}
function sameUrl(a, b) { const x = normUrl(a); return !!x && x === normUrl(b); }

// Modifier words: question words, articles and price words in nl/es/en. "cuánto cuesta un consultor geo" asks about the
// page /consultor-geo/ (owner 2026-11-13: the Brief proposed a new /cuanto-cuesta-consultor-geo next to the existing service
// page that already has a price section). The core words ("consultor geo") decide the match when the full keyword does not.
const MODIFIERS = new Set(('wat kost kosten kostte prijs prijzen tarief tarieven hoeveel hoe waarom welke beste goedkoop een de het van voor bij in op met per je mijn ik is zijn ' +
  'cuanto cuanta cuesta cuestan coste costes costo costos precio precios tarifa tarifas cobra cobran como que cual mejor mejores barato un una el la los las de del en para por mi es son ' +
  'how much does do cost costs price prices pricing rate rates fee fees what which best cheap a an the of for in to my is are ' +
  'hacer hago saber conseguir lograr zorg zorgen laten weet weten krijg krijgen get make check know find your').split(/\s+/));
const coreWords = kw => kw.filter(w => !MODIFIERS.has(w));
// Abbreviations written out in addresses: /generative-engine-optimization-consultant/ is the GEO consultant page.
const SPELLED = { geo: 'generative engine optimization', aeo: 'answer engine optimization', seo: 'search engine optimization' };
const inPath = (w, pw, joined) => pw.includes(w) || joined.indexOf(stem(w)) >= 0 || (SPELLED[w] && joined.indexOf(SPELLED[w]) >= 0);

// Same-intent candidates among the site's verified URLs (sitemap or homepage links).
// region: the Brief's market code ("nl"); a URL on that market's subdomain or path is preferred when several match.
// A price question about a single subject ("tarifas generative engine optimization", "wat kost geo") is a buying question:
// it belongs on the site's service page for that subject (owner 2026-11-13: the Brief proposed a new
// /tarifas-generative-engine-optimization next to /consultor-geo/, which already has a price section).
const PRICE_WORDS = new Set('kost kosten kostte prijs prijzen tarief tarieven hoeveel cuanto cuanta cuesta cuestan coste costes costo costos precio precios tarifa tarifas cobra cobran cost costs price prices pricing rate rates fee fees'.split(' '));
const PROVIDER_WORDS = new Set('consultant consultants consultancy consulting consultor consultores consultoria consulent adviseur specialist especialista expert experto agency agencia agencias bureau services service servicios servicio diensten dienst'.split(' '));
// The written-out name counts as the abbreviation in the keyword too.
const abbreviate = s => { let t = ' ' + fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' '; for (const [a, full] of Object.entries(SPELLED)) t = t.split(' ' + full + ' ').join(' ' + a + ' '); return t.trim(); };
// Market marker of a URL: a locale subdomain (es.example.com) or first path segment (/es/). An address without a marker is
// the site's default market. That default market is the requested one when no URL of the site carries the requested
// market's own marker (owner 2026-11-14: after the cross-market guard, contentscale.site/... (EN, region "us") and every
// single-market client site were never matched any more, so every keyword got a new page).
const LOCALES = new Set('en es nl de fr it pt pl sv da no fi cs sk hu ro bg el tr ru uk ja zh ko ar he us gb ie au ca nz mx co cl pe be at ch br in sg za'.split(' '));
function marketOf(url) {
  try { const u = new URL(url); const label = u.hostname.toLowerCase().replace(/^www\./, '').split('.');
    if (label.length > 2 && LOCALES.has(label[0])) return label[0];
    const seg = (u.pathname.split('/').filter(Boolean)[0] || '').toLowerCase(); if (LOCALES.has(seg)) return seg;
  } catch (e) {}
  return '';
}
function findSameIntentPages(keyword, urls, { region } = {}) {
  const kw = Array.from(new Set(words(abbreviate(keyword))));
  if (!kw.length) return [];
  const market = fold(region || '').slice(0, 2);
  const siteMarkets = new Set((Array.isArray(urls) ? urls : []).map(marketOf).filter(Boolean));
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const pw = pathWords(url);
    if (!pw.length) continue;
    const joined = pw.join(' ');
    const matched = kw.filter(w => pw.includes(w) || joined.indexOf(stem(w)) >= 0);
    let score = matched.length / kw.length, coreFull = false;
    // Core-word match: at least two core words, all of them in the address (modifiers such as price words ignored).
    const core = coreWords(kw);
    if (core.length >= 2 && core.length < kw.length && core.every(w => inPath(w, pw, joined))) { coreFull = true; score = Math.max(score, 1); }
    else if (core.length === 1 && kw.some(w => PRICE_WORDS.has(w)) && inPath(core[0], pw, joined) && pw.some(w => PROVIDER_WORDS.has(w))) { coreFull = true; score = Math.max(score, 1); }
    if (score < 0.5) continue;
    let host = ''; try { host = new URL(url).hostname.toLowerCase(); } catch (e) {}
    const marketMatch = !!market && (host.split('.')[0] === market || pw[0] === market);
    out.push({ url, score: Math.round(score * 100) / 100, full: matched.length === kw.length || coreFull, core_match: coreFull, matched, extra_words: Math.max(0, pw.length - matched.length - (marketMatch && pw[0] === market ? 1 : 0)), market_match: marketMatch, market_requested: !!market,
      default_market: !!market && !marketOf(url) && !siteMarkets.has(market) });
  }
  return out.sort((a, b) => (b.full - a.full) || (b.score - a.score) || (b.market_match - a.market_match) || (a.extra_words - b.extra_words) || a.url.length - b.url.length).slice(0, 5);
}

// After generation: a CREATE_NEW_PAGE decision is replaced when a full same-intent page exists. The previous decision and
// the evidence are kept on the Brief, so the change is visible and can be reviewed.
function applyExistingPageDecision(brief, candidates) {
  if (!brief || typeof brief !== 'object') return brief;
  const list = Array.isArray(candidates) ? candidates : [];
  brief.same_intent_candidates = list.map(x => ({ url: x.url, score: x.score, full_match: x.full, market_match: x.market_match, url_only_match: true }));
  // Keyword words in a URL are *not* verified same intent. In particular, an English page cannot
  // veto a Spanish new page merely because their slugs share the same words.
  const best = list.find(x => x.full && (!x.market_requested || x.market_match)) || list.find(x => x.full && x.default_market);
  if (!best) {
    const crossMarket = list.filter(x => x.full && x.market_requested && !x.market_match && !x.default_market);
    if (crossMarket.length) brief.content_decision = Object.assign({}, brief.content_decision || {}, {
      cross_market_url_overlap: crossMarket.map(x => x.url),
      cross_market_overlap_requires_review: true
    });
    return brief;
  }
  const cd = brief.content_decision && typeof brief.content_decision === 'object' ? brief.content_decision : {};
  const treatment = String(cd.recommended_treatment || '').toUpperCase();
  const check = { method: 'url_matches_every_keyword_word', url: best.url, matched_words: best.matched, other_candidates: list.filter(x => x !== best).map(x => x.url) };
  if (treatment === 'CREATE_NEW_PAGE' || !treatment) {
    brief.content_decision = Object.assign({}, cd, {
      recommended_treatment: 'EXPAND_EXISTING_PAGE', cannibalization_risk: 'high', closest_existing_url: best.url,
      previous_recommendation: treatment || 'none',
      reason: 'This site already has ' + best.url + ', whose address contains every word of the keyword. A new page for the same keyword would compete with it, so expand that page instead. Review the existing page before deciding otherwise.',
      existing_page_check: check });
    if (brief.meta_package && typeof brief.meta_package === 'object') {
      try { brief.meta_package.proposed_new_slug = brief.meta_package.url_slug || null; brief.meta_package.url_slug = new URL(best.url).pathname; } catch (e) {}
    }
    delete brief.hub_spoke_plan;
  } else if (!cd.closest_existing_url || cd.closest_existing_url === 'none') {
    brief.content_decision = Object.assign({}, cd, { closest_existing_url: best.url, existing_page_check: check });
  }
  return brief;
}

// Findings of a Brief that help to expand an existing page in Growth: grounded competitor gaps, the planned sections and
// the open questions. Statistics, expert quotes and links from pasted AI answers are left out on purpose: they are not
// verified evidence for this page.
const txt = (v, n) => String(v == null ? '' : typeof v === 'object' ? (v.question || v.q || v.h2 || v.text || '') : v).replace(/\s+/g, ' ').trim().slice(0, n);
function briefFindingsForGrowth(brief) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const outline = (Array.isArray(b.definitive_outline) && b.definitive_outline.length ? b.definitive_outline : Array.isArray(b.page_blueprint) ? b.page_blueprint : [])
    .map(s => s && { heading: txt(s.h2, 200), covers: (Array.isArray(s.cover) ? s.cover : []).map(c => txt(c, 160)).filter(Boolean).slice(0, 5) }).filter(s => s && s.heading).slice(0, 12);
  const gaps = (Array.isArray(b.competitor_table) ? b.competitor_table : [])
    .map(r => r && { competitor: txt(r.domain || r.company_or_publisher, 120), gap: txt(r.the_gap, 400), to_add: txt(r.what_to_add || r.add || r.to_add, 400) })
    .filter(r => r && r.gap && !/^(insufficient_data|analysis unavailable)/i.test(r.gap)).slice(0, 10);
  const seen = new Set(), questions = [];
  [].concat(Array.isArray(b.people_also_ask) ? b.people_also_ask : [], Array.isArray(b.faq_questions) ? b.faq_questions : [],
    Array.isArray(b.paa_questions) ? b.paa_questions : []).forEach(q => { const t = txt(q, 220); const k = fold(t); if (t && !seen.has(k)) { seen.add(k); questions.push(t); } });
  return { keyword: txt(b.keyword, 200), outline, competitor_gaps: gaps, questions: questions.slice(0, 12),
    not_included: ['statistics', 'expert quotes', 'links from pasted AI answers'],
    note: 'Reference from the Pre-Write Brief. Growth reads the live page and the ranking pages itself; use these points to check what the page still misses. Nothing here is verified evidence.' };
}

module.exports = { marketOf, coreWords, findSameIntentPages, applyExistingPageDecision, briefFindingsForGrowth, sameUrl, normUrl };
