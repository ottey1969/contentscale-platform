'use strict';
// Pre-Write evidence must be about the search query, not only exist on a page (owner 2026-11-10:
// a brief for "AI-content en Google" approved statistics about job interviews and an AI survey; a
// brief for "optimizacion de contenido seo" approved voice-search figures). A verified excerpt is
// approved for writing only when its source title plus the text around the excerpt names the topic.
const STOP = new Set(('the and for with from that this into than have has are was were but not your our its how what why who when which '
  + 'een het van voor met door bij naar wat hoe waarom wie wanneer welke zijn wordt worden jouw uw ook '
  + 'los las del para con por una uno que como cual cuando donde sus tus mas '
  + 'der die das und mit fur von wie les des une pour avec dans sur est guide gids guia beste best top complete '
  // Question filler: "how much does a geo consultant cost" is about price, not about "much" or "does".
  + 'much many does did can should could would will doe hoeveel kan moet cuanto cuanta cuantos').split(/\s+/));
const AI = new Set(['ai', 'ia', 'ki']);
const ACRONYM = new Set(['geo', 'aeo', 'seo', 'llm', 'sge']);
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// The spelled-out name and the acronym are one topic (owner 2026-11-13: the First Page Sage GEO pricing report was
// rejected for "generative engine optimization consultant cost" because it writes "GEO").
const SPELLED = [[/\bgenerative engine optimi[sz]ation\b/g, 'geo'], [/\boptimizacion (?:para|de) motores generativos\b/g, 'geo'],
  [/\banswer engine optimi[sz]ation\b/g, 'aeo'], [/\bsearch engine optimi[sz]ation\b/g, 'seo']];
// Price words are one topic across languages: a pricing report answers "cost", "kosten" and "precio".
const PRICE = /^(?:cost|costs|costing|price|prices|pricing|priced|rate|rates|fee|fees|budget|kost|kosten|kostprijs|prijs|prijzen|tarief|tarieven|precio|precios|coste|costes|costo|costos|cuesta|cuestan|tarifa|tarifas|honorarios|preis|preise|kosten|prix|tarif|tarifs)$/;
const words = v => { let t = norm(v); for (const [re, to] of SPELLED) t = t.replace(re, to); return t.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean); };

// Topic terms of a search query: AI as one cross-language term, other words as a 5-letter stem so
// "content"/"contenido", "optimization"/"optimizacion" and plurals match each other.
// Who delivers the service (consultant, agency, specialist...) is not the topic: a GEO pricing report about agencies
// answers "what does a GEO consultant cost". Dropped only when at least two other topic terms remain.
const PROVIDER = /^(?:consultant|consultants|consultancy|consulting|consultor|consultores|consultoria|consultora|consulent|adviseur|adviseurs|agency|agencies|agencia|agencias|bureau|bureaus|specialist|specialists|specialista|especialista|especialistas|expert|experts|experto|expertos|freelancer|freelancers|freelance|berater|agentur)$/;
function topicTerms(keyword) {
  const all = words(keyword).filter(w => !/^\d+$/.test(w) && !STOP.has(w));
  const core = all.filter(w => !PROVIDER.test(w));
  return stems(core.length >= 2 ? core : all);
}
function stems(list) {
  const out = [];
  for (const w of list) {
    const t = AI.has(w) ? 'ai' : PRICE.test(w) ? 'price' : (w.length < 3 ? '' : w.length > 5 ? w.slice(0, 5) : w);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function topicRelevance({ keyword, title = '', text = '', excerpt = '', radius = 700 } = {}) {
  const terms = topicTerms(keyword);
  if (!terms.length) return { relevant: true, matched: [], missing: [], required: 0 };
  const body = norm(text), ex = norm(excerpt).replace(/\s+/g, ' ').trim();
  const flat = body.replace(/\s+/g, ' ');
  const at = ex ? flat.indexOf(ex) : -1;
  const near = at >= 0 ? flat.slice(Math.max(0, at - radius), at + ex.length + radius) : ex;
  const ws = new Set(words(title + ' ' + near));
  // Short acronyms match as a whole word: "geo" is not "geotechnical", "seo" is not "seoul".
  const hit = t => t === 'ai' ? [...AI].some(a => ws.has(a)) : ACRONYM.has(t) ? ws.has(t) : t === 'price' ? [...ws].some(w => PRICE.test(w)) : [...ws].some(w => w.startsWith(t));
  const matched = terms.filter(hit), missing = terms.filter(t => !hit(t));
  const required = terms.length <= 3 ? terms.length : terms.length - 1;
  return { relevant: matched.length >= required, matched, missing, required };
}

// Another meaning of the same word (owner 2026-11-12: a brief for "consultor geo" — Generative Engine Optimization — cited a
// paper on a geospatial framework). A source title word that starts with a short keyword word ("geo" → "geospatial",
// "geographic", "geology") but never occurs in what Google shows for the query is another field: the source is not used.
const OTHER_GEO = /^(?:geotechn|geotecn|geolog|geograph|geograf|geospat|geoespac|geophys|geofis|geotherm|geoterm|geodet|geodes)/;
function senseDrift({ keyword, title = '', serpText = '' } = {}) {
  const short = words(keyword).filter(w => w.length >= 3 && w.length <= 4 && !STOP.has(w) && !/^\d+$/.test(w));
  if (!short.length) return null;
  const serp = new Set(words(serpText)), kw = new Set(words(keyword));
  // "geo" as Generative Engine Optimization: earth-science fields are another meaning even when Google mixes them into
  // the results (owner 2026-11-13: "how much does a geo consultant cost" approved geotechnical-report prices).
  if (short.includes('geo') && !words(keyword).some(w => OTHER_GEO.test(w))) {
    const other = words(title).find(w => OTHER_GEO.test(w));
    if (other) return other;
  }
  for (const w of words(title)) {
    if (kw.has(w) || w.length < 7) continue;
    const base = short.find(k => w.startsWith(k));
    if (base && !serp.has(w) && ![...serp].some(x => x.length >= 7 && x.slice(0, 7) === w.slice(0, 7))) return w;
  }
  return null;
}

module.exports = { topicTerms, topicRelevance, senseDrift };
