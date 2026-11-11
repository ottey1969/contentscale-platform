'use strict';
// Free rank tracker: one Google position check per keyword, country and language (owner 2026-11-11).
// The position is what Google's organic results show for that country and language at the moment of the check, read
// through Serper (the provider the platform already uses). It is a neutral snapshot, not the personalised result a
// signed-in person sees, and not the Search Console average. Nothing is estimated: a site that is not in the checked
// result pages is "not in the top N", never a guessed number.
const { validatePublicUrl } = require('../growth-free/engine.cjs');
const { unwrapGoogleLinks } = require('../growth-public-search-discovery.cjs');
const { PREWRITE_REGIONS, languageName, countryName } = require('../growth-search-locale.cjs');

const PAGE_SIZE = 10;
const MAX_PAGES = 3;            // top 30: deep enough to show progress, at most three paid calls per keyword
const MAX_KEYWORD_LENGTH = 80;
const SAFE_KEYWORD = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s'’&+.,:/-]*$/u;

// Countries offered: the Pre-Write list, so every ContentScale screen offers the same markets.
const COUNTRIES = PREWRITE_REGIONS.map(x => x.split(' — ')[0].trim()).filter(c => /^[a-z]{2}$/.test(c));
// The main search language per country (the visitor can change it). Not a claim about the country; only a default.
const DEFAULT_LANGUAGE = { us: 'en', gb: 'en', ca: 'en', au: 'en', ie: 'en', nz: 'en', za: 'en', in: 'en', sg: 'en', ph: 'en', my: 'en',
  nl: 'nl', be: 'nl', de: 'de', at: 'de', ch: 'de', fr: 'fr', es: 'es', mx: 'es', ar: 'es', cl: 'es', co: 'es', pe: 'es', it: 'it',
  pt: 'pt', br: 'pt', pl: 'pl', se: 'sv', dk: 'da', no: 'no', fi: 'fi', tr: 'tr', ru: 'ru', ae: 'ar', sa: 'ar', qa: 'ar', kw: 'ar',
  bh: 'ar', om: 'ar', eg: 'ar', ma: 'ar', cn: 'zh', hk: 'zh', tw: 'zh', jp: 'ja', kr: 'ko', id: 'id', th: 'th', vn: 'vi', lu: 'fr' };
// Markets where Google is not the main search engine: a Google position says little there, so the tool says so.
const GOOGLE_NOT_MAIN = { cn: 'Baidu', ru: 'Yandex', kr: 'Naver' };

const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

// The website: a public address, reduced to its host (the whole site is tracked, not one page).
function readSite(raw) {
  const v = validatePublicUrl(String(raw || '').trim());
  if (v.error) return { error: v.error };
  const host = hostOf(v.url);
  return host ? { host, url: 'https://' + host + '/' } : { error: 'Enter your website address, for example example.com.' };
}

function readKeyword(raw) {
  const k = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!k) return null;
  if (k.length > MAX_KEYWORD_LENGTH || !SAFE_KEYWORD.test(k) || /https?:|www\./i.test(k)) return { error: k };
  return { keyword: k.toLowerCase() };
}

// Up to `max` distinct keywords from a list or a text with one keyword per line or comma.
function readKeywords(input, max = 10) {
  const list = (Array.isArray(input) ? input : String(input || '').split(/[\n,;]+/)).map(readKeyword).filter(Boolean);
  const invalid = list.filter(x => x.error).map(x => x.error);
  const keywords = [...new Set(list.filter(x => x.keyword).map(x => x.keyword))];
  return { keywords: keywords.slice(0, max), invalid, over_limit: Math.max(0, keywords.length - max) };
}

function readMarket(country, language) {
  const gl = String(country || '').trim().toLowerCase();
  if (!COUNTRIES.includes(gl)) return { error: 'Choose a country from the list.' };
  const hl = String(language || DEFAULT_LANGUAGE[gl] || 'en').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(hl) || !languageName(hl) || languageName(hl) === hl) return { error: 'Choose a language from the list.' };
  return { gl, hl, country_name: countryName(gl.toUpperCase()), language_name: languageName(hl), other_engine: GOOGLE_NOT_MAIN[gl] || null };
}

// What Google itself offers next to the results on page 1: "related searches" and "People also ask". These are real
// searches, not invented keywords; they cost no extra call. Only keywords the tracker accepts are kept.
function suggestionsOf(payload, keyword, max = 8) {
  const raw = [...(Array.isArray(payload.relatedSearches) ? payload.relatedSearches.map(x => x && x.query) : []),
    ...(Array.isArray(payload.peopleAlsoAsk) ? payload.peopleAlsoAsk.map(x => x && x.question) : [])];
  const out = [];
  for (const r of raw) {
    const k = readKeyword(String(r || '').replace(/[?¿!¡]/g, ' '));
    if (k && k.keyword && k.keyword !== keyword && !out.includes(k.keyword)) out.push(k.keyword);
    if (out.length >= max) break;
  }
  return out;
}

// The site's best organic position for one keyword. `calls` is what the check cost (one per result page asked).
async function checkRank({ keyword, host, gl, hl, key, fetchImpl = global.fetch, maxPages = MAX_PAGES, now = () => new Date() }) {
  if (!key) return { status: 'PROVIDER_NOT_CONFIGURED', calls: 0 };
  if (typeof fetchImpl !== 'function') return { status: 'PROVIDER_UNAVAILABLE', calls: 0 };
  let calls = 0, answerBox = false, aiOverview = null, suggestions = [];
  const seenHosts = [], top = [];
  for (let page = 1; page <= maxPages; page++) {
    let payload;
    try {
      calls++;
      const r = await fetchImpl('https://google.serper.dev/search', { method: 'POST',
        headers: { 'X-API-KEY': String(key).trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: keyword, gl, hl, num: PAGE_SIZE, ...(page > 1 ? { page } : {}) }), signal: AbortSignal.timeout(12000) });
      if (!r.ok) return { status: 'PROVIDER_ERROR', reason: 'HTTP_' + r.status, calls, checked_at: now().toISOString() };
      payload = await r.json();
    } catch (e) { return { status: 'PROVIDER_ERROR', reason: e && e.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED', calls, checked_at: now().toISOString() }; }
    if (!payload || !Array.isArray(payload.organic)) return { status: 'PROVIDER_ERROR', reason: 'NO_ORGANIC_RESULTS', calls, checked_at: now().toISOString() };
    if (page === 1) {
      answerBox = !!payload.answerBox;
      // Serper does not always report Google's AI Overview; when it does not, the tool says "not reported", never "none".
      aiOverview = payload.aiOverview ? true : null;
      suggestions = suggestionsOf(payload, keyword);
    }
    // Google redirect links are resolved where possible, so a result is not missed because of its link form.
    await unwrapGoogleLinks(payload, { fetchImpl, max: 10 }).catch(() => null);
    for (let i = 0; i < payload.organic.length; i++) {
      const item = payload.organic[i]; if (!item || typeof item.link !== 'string') continue;
      const h = hostOf(item.link);
      const position = Number(item.position) > 0 ? (page - 1) * PAGE_SIZE + ((Number(item.position) - 1) % PAGE_SIZE) + 1 : (page - 1) * PAGE_SIZE + i + 1;
      if (page === 1 && h && seenHosts.length < 3) { seenHosts.push(h); top.push({ position, host: h, url: item.link.slice(0, 500), title: String(item.title || '').slice(0, 160) }); }
      if (h && (h === host || h.endsWith('.' + host))) {
        return { status: 'FOUND', position, url: item.link, title: String(item.title || '').slice(0, 200), pages_checked: page, calls,
          top_hosts: seenHosts, top, suggestions, answer_box: answerBox, ai_overview: aiOverview, checked_at: now().toISOString() };
      }
    }
    // Google ended its results before the checked depth: the site is not among all results Google showed.
    if (payload.organic.length < PAGE_SIZE) return { status: 'NOT_IN_RESULTS', all_results_shown: true, depth: (page - 1) * PAGE_SIZE + payload.organic.length, pages_checked: page, calls, top_hosts: seenHosts, top, suggestions, answer_box: answerBox, ai_overview: aiOverview, checked_at: now().toISOString() };
  }
  return { status: 'NOT_IN_RESULTS', depth: maxPages * PAGE_SIZE, pages_checked: maxPages, calls, top_hosts: seenHosts, top, suggestions, answer_box: answerBox, ai_overview: aiOverview, checked_at: now().toISOString() };
}

// What changed between two checks of the same keyword, for the e-mail. Small daily moves are not news.
function changeOf(prev, curr) {
  const p = prev && prev.status === 'FOUND' ? prev.position : null, c = curr && curr.status === 'FOUND' ? curr.position : null;
  if (!curr || curr.status === 'PROVIDER_ERROR') return null;
  if (!prev) return { kind: 'FIRST', position: c };
  if (p == null && c != null) return { kind: c <= 10 ? 'ENTERED_PAGE_ONE' : 'ENTERED_RESULTS', from: null, to: c };
  if (p != null && c == null) return { kind: 'LEFT_RESULTS', from: p, to: null };
  if (p == null && c == null) return null;
  if (p > 10 && c <= 10) return { kind: 'ENTERED_PAGE_ONE', from: p, to: c };
  if (p <= 10 && c > 10) return { kind: 'LEFT_PAGE_ONE', from: p, to: c };
  if (Math.abs(p - c) >= 5) return { kind: c < p ? 'UP' : 'DOWN', from: p, to: c };
  if (prev.url && curr.url && hostOf(prev.url) === hostOf(curr.url) && prev.url !== curr.url) return { kind: 'OTHER_PAGE', from: p, to: c, url: curr.url, previous_url: prev.url };
  return null;
}

module.exports = { readSite, readKeyword, readKeywords, readMarket, checkRank, changeOf, COUNTRIES, DEFAULT_LANGUAGE, GOOGLE_NOT_MAIN, MAX_PAGES, hostOf };
