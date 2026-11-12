'use strict';
// Numbers the reader takes as fact must come from verified evidence (owner 2026-11-12, brief "consultor geo": price ranges
// such as "300 € - 3.000 € mensuales" stood in the opening passage, the AI answer and the quick facts while they came only
// from pasted AI answers, and Publication QA said 97/100 READY TO WRITE).
// A money amount or a percentage in those writer-facing fields is supported when the same number occurs in the verified
// evidence, the owner's verified business facts, or the captured competitor rows. Otherwise it is listed as VERIFY FIRST
// and the Brief is not ready to write.
const MONEY = /(?:[€$£]\s?\d[\d.,]*(?:\s?(?:k|mil|million|millones))?|\d[\d.,]*\s?(?:k\s?)?(?:€|eur\b|euros?\b|usd\b|dólares\b|\$|£))/gi;
const PERCENT = /\d[\d.,]*\s?%/g;
const RANGE = /(\d[\d.,]*)\s?(?:€|eur|euros?|%)?\s?(?:-|–|—|a|to|tot|y)\s?([€$£]?\s?\d[\d.,]*)/gi;

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
    ['meta_description', (b.meta_package || {}).meta_description || '']];
  const out = [];
  for (const [field, text] of fields) {
    const t = String(text || ''), seen = new Set();
    const found = [...(t.match(MONEY) || []), ...(t.match(PERCENT) || [])];
    for (const r of t.matchAll(RANGE)) if (/[€$£%]|eur/i.test(r[0])) found.push(r[1], r[2]);
    for (const f of found) for (const n of numbersIn(f)) { const k = field + ':' + n; if (!seen.has(k) && Number(n) > 0) { seen.add(k); out.push({ field, number: n, text: f.trim() }); } }
  }
  return out;
}
// Where a number may come from: verified evidence, verified business facts, the captured competitor rows.
function supportCorpus(brief) {
  const b = brief || {}, fs = b.fact_safety || {};
  return [b.evidence, b.evidence_research && b.evidence_research.approved, fs.verified_business_facts_used, b.competitor_table, b.brand_facts]
    .map(x => x == null ? '' : typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
}
function unverifiedNumbers(brief) {
  const ok = numbersIn(supportCorpus(brief));
  const bad = claimsOf(brief).filter(c => !ok.has(c.number));
  // One entry per number, with every field it appears in.
  const by = new Map();
  for (const c of bad) { const e = by.get(c.number) || { number: c.number, text: c.text, fields: [] }; if (!e.fields.includes(c.field)) e.fields.push(c.field); by.set(c.number, e); }
  return [...by.values()];
}
// A "statistic" that is a marketing self-description (years of experience, "helps you", client counts of an agency list) is
// not evidence for the topic (same brief: "más de 25 años de experiencia", "6+ Partner Agencias 500+ Clientes").
const SELF_PROMO = /(?:años de experiencia|years of experience|jaar ervaring|jahre erfahrung|ans d['’]expérience|te ayuda(?:mos)? a|helps? you|helpen je|\d+\+?\s*(?:clientes|clients|klanten|kunden)\b|partner agencias|partner agencies)/i;
const isSelfPromo = t => SELF_PROMO.test(String(t || ''));

module.exports = { claimsOf, numbersIn, supportCorpus, unverifiedNumbers, isSelfPromo };
