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

// Same-intent candidates among the site's verified URLs (sitemap or homepage links).
// region: the Brief's market code ("nl"); a URL on that market's subdomain or path is preferred when several match.
function findSameIntentPages(keyword, urls, { region } = {}) {
  const kw = Array.from(new Set(words(keyword)));
  if (!kw.length) return [];
  const market = fold(region || '').slice(0, 2);
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const pw = pathWords(url);
    if (!pw.length) continue;
    const joined = pw.join(' ');
    const matched = kw.filter(w => pw.includes(w) || joined.indexOf(stem(w)) >= 0);
    const score = matched.length / kw.length;
    if (score < 0.5) continue;
    let host = ''; try { host = new URL(url).hostname.toLowerCase(); } catch (e) {}
    const marketMatch = !!market && (host.split('.')[0] === market || pw[0] === market);
    out.push({ url, score: Math.round(score * 100) / 100, full: matched.length === kw.length, matched, extra_words: Math.max(0, pw.length - matched.length - (marketMatch && pw[0] === market ? 1 : 0)), market_match: marketMatch });
  }
  return out.sort((a, b) => (b.full - a.full) || (b.score - a.score) || (b.market_match - a.market_match) || (a.extra_words - b.extra_words) || a.url.length - b.url.length).slice(0, 5);
}

// After generation: a CREATE_NEW_PAGE decision is replaced when a full same-intent page exists. The previous decision and
// the evidence are kept on the Brief, so the change is visible and can be reviewed.
function applyExistingPageDecision(brief, candidates) {
  if (!brief || typeof brief !== 'object') return brief;
  const list = Array.isArray(candidates) ? candidates : [];
  brief.same_intent_candidates = list.map(x => ({ url: x.url, score: x.score, full_match: x.full, market_match: x.market_match }));
  const best = list.find(x => x.full);
  if (!best) return brief;
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

module.exports = { findSameIntentPages, applyExistingPageDecision, briefFindingsForGrowth, sameUrl, normUrl };
