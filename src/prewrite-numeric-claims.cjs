'use strict';
// Numbers the reader takes as fact must come from verified evidence (owner 2026-11-12, brief "consultor geo": price ranges
// such as "300 € - 3.000 € mensuales" stood in the opening passage, the AI answer and the quick facts while they came only
// from pasted AI answers, and Publication QA said 97/100 READY TO WRITE).
// A money amount or a percentage in those writer-facing fields is supported when the same number occurs in the verified
// evidence, the owner's verified business facts, or the captured competitor rows. Otherwise it is listed as VERIFY FIRST
// and the Brief is not ready to write.
const MONEY = /(?:[€$£]\s?\d[\d.,]*(?:\s?(?:k|mil|million|millones))?|\d[\d.,]*\s?(?:k\s?)?(?:€|eur\b|euros?\b|usd\b|dólares\b|\$|£))/gi;
const PERCENT = /\d[\d.,]*\s?%/g;
const RANGE = /(\d[\d.,]*)\s?(?:€|eur|euros?|%)?\s?(?:-|–|—|a|to|tot|y)\s?([€$£]?\s?\d[\d.,]*)(?:\s?(?:€|eur\b|euros?\b|%))?/gi;

// Currency of an amount (owner 2026-11-13: a Dutch-language Brief wrote "€175" and counted "$175" on an American page as
// its source). The number alone is not enough: an amount is supported only in the same currency.
function currencyOf(text) {
  const t = String(text || '');
  if (/€|\beur(?:os?)?\b/i.test(t)) return 'EUR';
  if (/£|\bgbp\b/i.test(t)) return 'GBP';
  if (/\$|\busd\b|d[oó]lares|\bdollars?\b/i.test(t)) return 'USD';
  return null;
}
// "3.000", "3,000", "3000", "1.5" → canonical number strings, so the same amount in another notation matches.
function numbersIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\d[\d.,]*/g)) {
    let s = m[0].replace(/[.,]$/, '');
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    else s = s.replace(',', '.');
    const n = Number(s); if (Number.isFinite(n)) out.add(String(n));
  }
  return out;
}
// The claims: each money amount or percentage (a range counts as its two ends) with the field it stands in.
function claimsOf(brief) {
  const b = brief || {}, aa = b.ai_answer || {}, op = b.opening_passage || {};
  const fields = [['opening_passage', op.direct_answer || (typeof op === 'string' ? op : '')],
    ['ai_answer', [aa.answer, aa.direct_answer, aa.short_answer].concat(Array.isArray(aa.key_takeaways) ? aa.key_takeaways : []).filter(Boolean).join(' ')],
    ['quick_facts', (Array.isArray(b.quick_facts) ? b.quick_facts : []).map(f => f && (f.label + ': ' + f.value)).join(' · ')],
    ['meta_description', (b.meta_package || {}).meta_description || ''],
    // The blueprint's citation hooks are lifted by AI systems too (owner 2026-11-12: "500 € … 15.000 €" stayed in a hook).
    ['citation_hook', [].concat(b.definitive_outline || [], b.page_blueprint || []).map(x => x && x.citation_hook).filter(Boolean).join(' ')]];
  const out = [];
  for (const [field, text] of fields) {
    const t = String(text || ''), seen = new Set();
    const found = [...(t.match(MONEY) || []).map(x => [x, currencyOf(x)]), ...(t.match(PERCENT) || []).map(x => [x, null])];
    for (const r of t.matchAll(RANGE)) if (/[€$£%]|eur/i.test(r[0])) { const c = /%/.test(r[0]) ? null : currencyOf(r[0]); found.push([r[1], c], [r[2], c]); }
    for (const [f, currency] of found) for (const n of numbersIn(f)) { const k = field + ':' + n; if (!seen.has(k) && Number(n) > 0) { seen.add(k); out.push({ field, number: n, text: String(f).trim(), currency }); } }
  }
  return out;
}
// Where a number may come from: verified evidence, verified business facts, the captured competitor rows.
function supportCorpus(brief) {
  const b = brief || {}, fs = b.fact_safety || {};
  return [b.evidence, b.price_facts, b.evidence_research && b.evidence_research.approved, fs.verified_business_facts_used, b.competitor_table, b.brand_facts]
    .map(x => x == null ? '' : typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
}
// Amounts in the support corpus with their currency: "number|EUR". A claim in euros is not supported by the same number in
// dollars; a number that occurs only without any currency still supports it (as before).
function moneyKeys(text) {
  const keys = new Set(), any = new Set(), t = String(text || '');
  const add = (f, c) => { for (const n of numbersIn(f)) { any.add(n); if (c) keys.add(n + '|' + c); } };
  for (const m of t.match(MONEY) || []) add(m, currencyOf(m));
  for (const r of t.matchAll(RANGE)) if (/[€$£]|eur/i.test(r[0])) { const c = currencyOf(r[0]); add(r[1], c); add(r[2], c); }
  return { keys, any };
}
function unverifiedNumbers(brief) {
  const corpus = supportCorpus(brief), ok = numbersIn(corpus), money = moneyKeys(corpus);
  const supported = c => !c.currency ? ok.has(c.number) : (money.keys.has(c.number + '|' + c.currency) || (ok.has(c.number) && !money.any.has(c.number)));
  const bad = claimsOf(brief).filter(c => !supported(c));
  // One entry per number, with every field it appears in.
  const by = new Map();
  for (const c of bad) { const e = by.get(c.number) || { number: c.number, text: c.text, fields: [], currency: c.currency || null }; if (!e.fields.includes(c.field)) e.fields.push(c.field); by.set(c.number, e); }
  return [...by.values()];
}
// A "statistic" that is a marketing self-description (years of experience, "helps you", client counts of an agency list) is
// not evidence for the topic (same brief: "más de 25 años de experiencia", "6+ Partner Agencias 500+ Clientes").
const SELF_PROMO = /(?:años de experiencia|years of experience|jaar ervaring|jahre erfahrung|ans d['’]expérience|te ayuda(?:mos)? a|helps? you|helpen je|\d+\+?\s*(?:clientes|clients|klanten|kunden)\b|partner agencias|partner agencies)/i;
const isSelfPromo = t => SELF_PROMO.test(String(t || ''));


// Verify on the source page (owner 2026-11-12: "NOT PASSED but still a brief": a blocker with no way forward). Each
// unverified amount is looked up, as written, on the pages the brief already names (AI-answer source leads, research
// candidates). Found next to a currency sign on a page about the topic: it becomes a verified price fact with its excerpt.
const variants = n => { const v = Number(n); if (!Number.isFinite(v)) return []; const i = Math.trunc(v), out = new Set([String(n)]);
  if (Number.isInteger(v) && v >= 1000) { const g = String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); out.add(g); out.add(g.replace(/\./g, ',')); out.add(g.replace(/\./g, ' ')); out.add(g.replace(/\./g, '\u00a0')); }
  if (!Number.isInteger(v)) out.add(String(n).replace('.', ','));
  return [...out]; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function findOnPage(text, number, currency) {
  const t = String(text || '').replace(/\s+/g, ' ');
  for (const form of variants(number)) {
    const re = new RegExp('(?<![\\d.,])' + esc(form) + '(?![\\d]|[.,]\\d)', 'g'); let m;
    while ((m = re.exec(t))) {
      const around = t.slice(Math.max(0, m.index - 14), m.index + form.length + 14);
      if (!/[€$£]|\beur(?:os?)?\b|\busd\b/i.test(around)) continue;
      if (currency && currencyOf(around) !== currency) continue; // $175 on the page is no source for €175
      let a = Math.max(0, m.index - 170), b = Math.min(t.length, m.index + form.length + 170);
      while (a > 0 && t[a - 1] !== ' ') a--; while (b < t.length && t[b] !== ' ') b++;
      return t.slice(a, b).trim();
    }
  }
  return null;
}
function verifyOnPages(unverified, pages, { onTopic = () => true } = {}) {
  const verified = [], left = [];
  for (const u of unverified || []) {
    let hit = null;
    for (const p of pages || []) { if (!p || !onTopic(p)) continue; const ex = findOnPage(p.text, u.number, u.currency); if (ex) { hit = { number: u.number, text: u.text, excerpt: ex, source_url: p.url, source_title: p.title || '' }; break; } }
    if (hit) verified.push(hit); else left.push(u);
  }
  return { verified, left };
}
// What still has no source is taken out of the writer-facing copy: the quick fact, the key takeaway, the sentence.
function removeUnverified(brief, left) {
  const nums = new Set((left || []).map(x => x.number)), removed = [];
  if (!nums.size || !brief) return removed;
  const hasBad = t => [...(String(t || '').match(MONEY) || []), ...(String(t || '').match(PERCENT) || []), ...[...String(t || '').matchAll(RANGE)].filter(r => /[€$£%]|eur/i.test(r[0])).flatMap(r => [r[1], r[2]])]
    .some(f => [...numbersIn(f)].some(n => nums.has(n)));
  const sentences = t => String(t || '').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“])/);
  const clean = (t, field) => { const keep = []; for (const x of sentences(t)) { if (hasBad(x)) removed.push({ field, text: x }); else keep.push(x); } return keep.join(' ').trim(); };
  const op = brief.opening_passage;
  if (op && typeof op === 'object' && op.direct_answer) op.direct_answer = clean(op.direct_answer, 'opening_passage');
  const aa = brief.ai_answer;
  if (aa && typeof aa === 'object') {
    for (const k of ['answer', 'direct_answer', 'short_answer']) if (typeof aa[k] === 'string') aa[k] = clean(aa[k], 'ai_answer');
    if (Array.isArray(aa.key_takeaways)) aa.key_takeaways = aa.key_takeaways.filter(x => { if (hasBad(x)) { removed.push({ field: 'ai_answer', text: String(x) }); return false; } return true; });
  }
  for (const list of [brief.definitive_outline, brief.page_blueprint]) if (Array.isArray(list)) for (const sec of list)
    if (sec && typeof sec.citation_hook === 'string' && hasBad(sec.citation_hook)) sec.citation_hook = clean(sec.citation_hook, 'citation_hook');
  if (Array.isArray(brief.quick_facts)) brief.quick_facts = brief.quick_facts.filter(f => { const t = f && (f.label + ': ' + f.value); if (f && hasBad(t)) { removed.push({ field: 'quick_facts', text: t }); return false; } return true; });
  return removed;
}

// Expanding an existing page: an action that says to create a new page contradicts the decision (same brief: "Crear el
// contenido de la nueva página 'consultor-geo-precios-medicion-ia'" while the slug was /consultor-geo/).
const NEW_PAGE_ACTION = /\b(?:new page|nueva p[aá]gina|nieuwe pagina|neue seite|nouvelle page|crear (?:una |la )?(?:nueva )?p[aá]gina|create (?:a |the )?(?:new )?page|maak (?:een )?nieuwe pagina)\b/i;
const EXPAND_TEXT = { es: url => 'Amplía la página existente ' + url + ' con las secciones del blueprint; no crees una URL nueva.', nl: url => 'Breid de bestaande pagina ' + url + ' uit met de secties uit de blueprint; maak geen nieuwe URL.', en: url => 'Expand the existing page ' + url + ' with the blueprint sections; do not create a new URL.' };
function alignActionPlan(brief, language) {
  const cd = brief && brief.content_decision || {}, url = String(cd.closest_existing_url || '');
  if (!/EXPAND|OPTIMIZE/i.test(String(cd.recommended_treatment || '')) || !/^https?:\/\//.test(url) || !Array.isArray(brief.action_plan)) return 0;
  const before = brief.action_plan.length;
  const kept = brief.action_plan.filter(a => !NEW_PAGE_ACTION.test(String(a && (a.action || a) || '')));
  if (kept.length === before) return 0;
  const lang = /^(es|spa|spanish|espa)/i.test(String(language || '')) ? 'es' : /^(nl|dut|neder)/i.test(String(language || '')) ? 'nl' : 'en';
  brief.action_plan = [{ action: EXPAND_TEXT[lang](url) }].concat(kept);
  return before - kept.length;
}
module.exports = { currencyOf, alignActionPlan, claimsOf, numbersIn, supportCorpus, unverifiedNumbers, isSelfPromo, findOnPage, verifyOnPages, removeUnverified };
