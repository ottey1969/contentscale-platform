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
async function checkRank({ keyword, host, gl, hl, key, location = null, fetchImpl = global.fetch, maxPages = MAX_PAGES, now = () => new Date() }) {
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
        body: JSON.stringify({ q: keyword, gl, hl, ...(location ? { location } : {}), num: PAGE_SIZE, ...(page > 1 ? { page } : {}) }), signal: AbortSignal.timeout(12000) });
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

// Google Maps (owner 2026-11-14: "rank and Maps; more people can use it"). Optional per project: a place such as
// "Lodi, NJ". The keyword is searched in Google Maps for that place, one call per keyword per round; the business counts
// when the website on its Maps listing is the tracked site. Nothing is estimated: a business that is not among the places
// Google Maps shows is "not in the top N".
const MAX_LOCATION_LENGTH = 80;
const SAFE_LOCATION = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s'’&.,-]*$/u;
function readMapsLocation(raw) {
  const v = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!v) return { location: null };
  if (v.length > MAX_LOCATION_LENGTH || !SAFE_LOCATION.test(v) || /https?:|www\./i.test(v)) return { error: 'Enter a place such as "Lodi, NJ" (letters, numbers, commas).' };
  return { location: v };
}
// Up to MAX_MAPS_LOCATIONS places, one per line (owner 2026-11-14: "what if I have more locations?"). Stored newline-joined.
const MAX_MAPS_LOCATIONS = 3;
// Optional state, region or city for the normal results (owner 2026-11-14: the country alone is not enough for a
// local business). Same text rules as a Maps place. Empty = the whole country, as before.
function readRegion(raw) { const r = readMapsLocation(raw); return r.error ? { error: 'INVALID' } : { region: r.location }; }
const US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming' };
// The region as Google names places ("City, State, Country"): a US state abbreviation written out, the country added
// in English when it is not there yet. "Lodi, NJ" → "Lodi, New Jersey, United States".
function searchLocationOf(region, gl) {
  const v = String(region || '').replace(/\s+/g, ' ').trim(); if (!v) return null;
  let country = null; try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(String(gl || '').toUpperCase()); } catch { country = null; }
  const parts = v.split(',').map(x => x.trim()).filter(Boolean);
  const out = String(gl).toLowerCase() === 'us' ? parts.map(x => US_STATES[x.toUpperCase()] || x) : parts;
  if (country && out[out.length - 1].toLowerCase() !== country.toLowerCase()) out.push(country);
  return out.join(', ');
}
function readMapsLocations(raw) {
  const parts = String(raw == null ? '' : raw).split(/\r?\n|;/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { const r = readMapsLocation(p); if (r.error) return { error: 'INVALID' }; if (!out.some(x => x.toLowerCase() === r.location.toLowerCase())) out.push(r.location); }
  if (out.length > MAX_MAPS_LOCATIONS) return { error: 'TOO_MANY' };
  return { locations: out };
}
// A keyword that names one of the project's places ("roofer hackensack nj") is only checked in Google Maps for that
// place: "roofer hackensack nj Lodi, NJ" would be a nonsense search (owner 2026-11-14). Other keywords: every place.
function placesForKeyword(keyword, places) {
  const k = ' ' + String(keyword || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const named = places.filter(pl => { const town = String(pl).split(',')[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); return town && k.includes(' ' + town + ' '); });
  return named.length ? named : places;
}
const locationsOf = stored => String(stored || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, MAX_MAPS_LOCATIONS);
function mapsQuery(keyword, location) {
  const k = String(keyword || '').trim(), first = String(location || '').split(',')[0].trim().toLowerCase();
  return location && !(first && k.toLowerCase().includes(first)) ? k + ' ' + location : k;
}
// Coordinates of a Maps listing (Serper: latitude/longitude; other providers: gpsCoordinates). null when absent or invalid.
function coordOf(x, k) {
  const v = Number(k === 'lat' ? (x && (x.latitude ?? (x.gpsCoordinates && x.gpsCoordinates.latitude))) : (x && (x.longitude ?? (x.gpsCoordinates && x.gpsCoordinates.longitude))));
  return Number.isFinite(v) && Math.abs(v) <= (k === 'lat' ? 90 : 180) && v !== 0 ? v : null;
}
async function checkMaps({ keyword, host, location, gl, hl, key, fetchImpl = global.fetch, now = () => new Date() }) {
  if (!key) return { status: 'PROVIDER_NOT_CONFIGURED', calls: 0 };
  if (typeof fetchImpl !== 'function') return { status: 'PROVIDER_UNAVAILABLE', calls: 0 };
  const q = mapsQuery(keyword, location);
  let payload;
  try {
    const r = await fetchImpl('https://google.serper.dev/maps', { method: 'POST',
      headers: { 'X-API-KEY': String(key).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl, hl }), signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { status: 'PROVIDER_ERROR', reason: 'HTTP_' + r.status, calls: 1, query: q, location, checked_at: now().toISOString() };
    payload = await r.json();
  } catch (e) { return { status: 'PROVIDER_ERROR', reason: e && e.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED', calls: 1, query: q, location, checked_at: now().toISOString() }; }
  const places = payload && Array.isArray(payload.places) ? payload.places : null;
  if (!places) return { status: 'PROVIDER_ERROR', reason: 'NO_PLACES', calls: 1, query: q, location, checked_at: now().toISOString() };
  const top = places.slice(0, 3).map((x, i) => ({ position: Number(x && x.position) || i + 1, title: String(x && x.title || '').slice(0, 120) }));
  for (let i = 0; i < places.length; i++) {
    const x = places[i] || {}, h = hostOf(String(x.website || ''));
    if (h && (h === host || h.endsWith('.' + host))) {
      return { status: 'FOUND', position: Number(x.position) || i + 1, title: String(x.title || '').slice(0, 160), address: String(x.address || '').slice(0, 200),
        rating: Number.isFinite(Number(x.rating)) ? Number(x.rating) : null, rating_count: Number.isFinite(Number(x.ratingCount)) ? Number(x.ratingCount) : null,
        lat: coordOf(x, 'lat'), lng: coordOf(x, 'lng'),
        depth: places.length, top, calls: 1, query: q, location, checked_at: now().toISOString() };
    }
  }
  return { status: 'NOT_IN_RESULTS', depth: places.length, top, calls: 1, query: q, location, checked_at: now().toISOString() };
}

// Geo-grid (owner 2026-11-14: "is there a grid too? it must work well"). Google Maps ranks a business differently for
// someone two streets away than for someone across town. The grid searches one keyword from GRID_SIZE x GRID_SIZE points
// around the business's own Maps location (the centre comes from its listing, never guessed), one Maps call per point,
// and records the position at every point. A point where the business is not among the places shown is null.
const GRID_SIZE = 3, GRID_SPACING_KM = 1.6, GRID_ZOOM = 14, MAX_GRID_KEYWORDS = 3;
function gridPoints(center, size = GRID_SIZE, spacingKm = GRID_SPACING_KM) {
  const half = (size - 1) / 2, out = [], dLat = spacingKm / 111.32, dLng = spacingKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    out.push({ row: r, col: c, lat: +(center.lat + (half - r) * dLat).toFixed(6), lng: +(center.lng + (c - half) * dLng).toFixed(6) });
  return out;
}
async function checkMapsGrid({ keyword, host, center, gl, hl, key, fetchImpl = global.fetch, size = GRID_SIZE, spacingKm = GRID_SPACING_KM, now = () => new Date() }) {
  if (!key) return { status: 'PROVIDER_NOT_CONFIGURED', calls: 0 };
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return { status: 'NO_CENTER', calls: 0, checked_at: now().toISOString() };
  const points = gridPoints(center, size, spacingKm);
  let calls = 0, errors = 0;
  for (const pt of points) {
    calls++;
    try {
      const r = await fetchImpl('https://google.serper.dev/maps', { method: 'POST',
        headers: { 'X-API-KEY': String(key).trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: keyword, ll: '@' + pt.lat + ',' + pt.lng + ',' + GRID_ZOOM + 'z', gl, hl }), signal: AbortSignal.timeout(12000) });
      const payload = r.ok ? await r.json() : null, places = payload && Array.isArray(payload.places) ? payload.places : null;
      if (!places) { pt.error = r.ok ? 'NO_PLACES' : 'HTTP_' + r.status; errors++; continue; }
      pt.depth = places.length; pt.position = null;
      for (let i = 0; i < places.length; i++) {
        const h = hostOf(String(places[i] && places[i].website || ''));
        if (h && (h === host || h.endsWith('.' + host))) { pt.position = Number(places[i].position) || i + 1; break; }
      }
    } catch (e) { pt.error = e && e.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED'; errors++; }
  }
  // Too many failed points: the grid is not shown as a result (a half grid would look like "not found" in those areas).
  if (errors > Math.floor(points.length / 3)) return { status: 'PROVIDER_ERROR', reason: 'GRID_POINTS_FAILED', failed: errors, calls, checked_at: now().toISOString() };
  const measured = points.filter(p => !p.error), found = measured.filter(p => p.position != null);
  return { status: 'OK', size, spacing_km: spacingKm, center, points, calls, measured: measured.length, found: found.length,
    top3: found.filter(p => p.position <= 3).length, best: found.length ? Math.min(...found.map(p => p.position)) : null,
    average: found.length ? +(found.reduce((a, p) => a + p.position, 0) / found.length).toFixed(1) : null, checked_at: now().toISOString() };
}

// What changed between two checks of the same keyword, for the e-mail. Small daily moves are not news.
function changeOf(prev, curr) {
  const p = prev && prev.status === 'FOUND' ? prev.position : null, c = curr && curr.status === 'FOUND' ? curr.position : null;
  if (!curr || curr.status === 'PROVIDER_ERROR') return null;
  if (!prev) return { kind: 'FIRST', position: c };
  // Measured somewhere else (the region was changed): a new starting point, never "up" or "down" against another place.
  if ((prev.location || null) !== (curr.location || null)) return { kind: 'NEW_REGION', position: c };
  if (p == null && c != null) return { kind: c <= 10 ? 'ENTERED_PAGE_ONE' : 'ENTERED_RESULTS', from: null, to: c };
  if (p != null && c == null) return { kind: 'LEFT_RESULTS', from: p, to: null };
  if (p == null && c == null) return null;
  if (p > 10 && c <= 10) return { kind: 'ENTERED_PAGE_ONE', from: p, to: c };
  if (p <= 10 && c > 10) return { kind: 'LEFT_PAGE_ONE', from: p, to: c };
  if (Math.abs(p - c) >= 5) return { kind: c < p ? 'UP' : 'DOWN', from: p, to: c };
  if (prev.url && curr.url && hostOf(prev.url) === hostOf(curr.url) && prev.url !== curr.url) return { kind: 'OTHER_PAGE', from: p, to: c, url: curr.url, previous_url: prev.url };
  return null;
}

// The free Growth check, filled in for this keyword, market and (if it ranks) the page that ranks. Used on the
// dashboard and in the weekly e-mail. The keyword goes as the topic, not as the question: the Growth check then picks the
// best real question customers ask in Google about it (owner 2026-11-11). `rt` is the signed handoff (handoff.cjs).
function growthLink(growthUrl, { host, gl, hl }, keyword, last, rt = null) {
  const region = PREWRITE_REGIONS.find(x => x.split(' — ')[0].trim() === gl);
  const q = new URLSearchParams({ url: last && last.status === 'FOUND' && last.url ? last.url : 'https://' + host + '/', topic: keyword,
    ...(region ? { market: region } : {}), ...(languageName(hl) ? { language: languageName(hl) } : {}), ...(rt ? { rt } : {}) });
  return growthUrl + (growthUrl.includes('?') ? '&' : '?') + q.toString();
}

module.exports = { placesForKeyword, readRegion, searchLocationOf, US_STATES, readMapsLocations, locationsOf, MAX_MAPS_LOCATIONS, gridPoints, checkMapsGrid, GRID_SIZE, GRID_SPACING_KM, MAX_GRID_KEYWORDS, coordOf, readMapsLocation, mapsQuery, checkMaps, growthLink, readSite, readKeyword, readKeywords, readMarket, checkRank, changeOf, COUNTRIES, DEFAULT_LANGUAGE, GOOGLE_NOT_MAIN, MAX_PAGES, hostOf };
