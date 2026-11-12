'use strict';
// Owner 2026-11-12, brief "consultor geo": price ranges from pasted AI answers stood as facts in the opening, the AI answer
// and the quick facts with QA 97/100 READY; "statistics" were a consultant bio and an agency client count; a new slug was
// proposed next to the page the brief said to expand.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/prewrite-numeric-claims.cjs');

const brief = () => ({
  opening_passage: { direct_answer: 'En España, los costes suelen oscilar entre 300 € y 3.000 € mensuales para pymes, con auditorías iniciales entre 500 € y 6.000 €.' },
  ai_answer: { answer: 'Las pymes suelen invertir entre 300 € y 3.000 € mensuales.', key_takeaways: ['El 40% de las marcas no aparece en IA.'] },
  quick_facts: [{ label: 'Tarifa freelance senior', value: '90–150 €/h' }, { label: 'Agencias', value: '3.000 € - 15.000 €+' }],
  competitor_table: [{ domain: 'upliora.es', what_they_have: 'menciona tarifas orientativas (90–150 €/h freelance senior; auditorías GEO desde 1.500 €)' }],
  evidence: { statistics: [{ evidence_text: '92% of organizations are already experimenting with GEO' }] }
});

test('money amounts and percentages without a verified source are listed with their fields; supported ones are not', () => {
  const un = M.unverifiedNumbers(brief());
  assert.deepEqual(un.map(x => x.number), ['300', '3000', '500', '6000', '40', '15000']);
  assert.deepEqual(un.find(x => x.number === '300').fields, ['opening_passage', 'ai_answer']);
  assert.ok(!un.some(x => x.number === '90' || x.number === '150'), 'seen on a captured competitor page');
  const ok = brief(); ok.opening_passage.direct_answer = 'El 92% de las organizaciones ya experimenta con GEO.'; ok.ai_answer = {}; ok.quick_facts = [];
  assert.deepEqual(M.unverifiedNumbers(ok), [], 'a number from verified evidence is fine');
  assert.deepEqual([...M.numbersIn('3.000 € · 3,000 · 3000 · 1,5%')], ['3000', '1.5']);
});

test('a bio or an agency client count is not a statistic', () => {
  assert.ok(M.isSelfPromo('Christian Gutiérrez, consultor SEO y GEO con más de 25 años de experiencia, te ayuda a posicionar tu marca'));
  assert.ok(M.isSelfPromo('6+ Partner Agencias 500+ Clientes 10+ Años haciendo SEO'));
  assert.ok(!M.isSelfPromo('78% of those investing report measurable ROI'));
});

test('src/index.js: QA blocks unverified numbers, statistics filter self-promotion, an expanded page keeps its own slug', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.match(src, /if\(_un\.length\)block\(10,'unverified_numbers','VERIFY FIRST/);
  assert.match(src, /kind==='statistic'&&require\('\.\/prewrite-numeric-claims\.cjs'\)\.isSelfPromo\(excerpt\)/);
  assert.match(src, /brief\.meta_package\.proposed_new_slug_not_used=brief\.meta_package\.url_slug;brief\.meta_package\.url_slug=_p;/);
  // The QA function itself: a brief with unverified prices is BLOCKED, not READY.
  const start = src.indexOf('function _pwbPublicationQa(b){'), end = src.indexOf('\n}\n', start) + 2;
  const qa = new Function('require', src.slice(start, end) + '\nreturn _pwbPublicationQa;')(p => require(p.replace('./', '../src/')));
  const r = qa({ ...brief(), meta_package: { seo_title: 'Consultor GEO: precios', meta_description: 'x'.repeat(155) } });
  assert.equal(r.ready_to_write, false);
  assert.ok(r.blockers.some(x => x.code === 'unverified_numbers' && /300 €/.test(x.message)));
});

test('owner 2026-11-12 "NOT PASSED but still a brief": an amount is verified on its source page, or taken out of the copy', () => {
  const b = { opening_passage: { direct_answer: 'Un consultor GEO optimiza tu marca para la IA. Los costes van de 800 € a 5.000 € al mes. Depende del alcance.' },
    ai_answer: { answer: 'Optimiza tu marca. Auditorías desde 1.000 €.', key_takeaways: ['GEO da visibilidad en IA.', 'Los costes varían: auditorías (1.000-6.000 €).'] },
    quick_facts: [{ label: 'Plataformas', value: 'ChatGPT, Gemini' }, { label: 'Rango Precio Auditoría', value: '500 € - 2.500 €' }] };
  const pages = [{ url: 'https://www.upliora.es/blog/x', title: 'Mejor experto GEO', text: 'Auditorías GEO desde 1.500 €, proyectos de implementación 6.000–18.000 €, retainers desde 800 €/mes.' },
    { url: 'https://example.com/visitas', title: 'Tráfico', text: 'Tenemos 5.000 visitas al mes.' }];
  const un = M.unverifiedNumbers(b);
  const r = M.verifyOnPages(un, pages);
  assert.deepEqual(r.verified.map(x => x.number).sort(), ['6000', '800']);
  assert.match(r.verified.find(x => x.number === '800').excerpt, /retainers desde 800 €\/mes/);
  assert.ok(!r.verified.some(x => x.number === '5000'), '5.000 without a currency sign is not a price');
  const removed = M.removeUnverified(b, r.left);
  assert.equal(b.opening_passage.direct_answer, 'Un consultor GEO optimiza tu marca para la IA. Depende del alcance.');
  assert.equal(b.ai_answer.answer, 'Optimiza tu marca.');
  assert.deepEqual(b.ai_answer.key_takeaways, ['GEO da visibilidad en IA.']);
  assert.deepEqual(b.quick_facts.map(x => x.label), ['Plataformas']);
  assert.equal(removed.length, 4);
  assert.deepEqual(M.unverifiedNumbers({ ...b, price_facts: r.verified }), [], 'nothing left to block');
  assert.equal(M.findOnPage('Desde 4.500 euros al mes', '4500'), 'Desde 4.500 euros al mes');
  assert.equal(M.findOnPage('We had 1500 visitors', '1500'), null);
});

test('src/index.js: verification runs before the final pass, from the Brief\'s own source pages, without a model call; the text shows both lists', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  const at = src.indexOf("const _nc=require('./prewrite-numeric-claims.cjs'),_un0=_nc.unverifiedNumbers(brief);");
  assert.ok(at > 0 && at < src.indexOf('_pwbFinalPublicationPass(brief);', at));
  assert.match(src, /brief\.ai_source_leads\|\|\[\]\)\.map\(x=>x&&x\.url\),\(_pwbExternalCandidates/);
  assert.match(src, /const _removed=_nc\.removeUnverified\(brief,_res\.left\);/);
  assert.match(src, /PRICE FACTS — VERIFIED ON THE SOURCE PAGE/); assert.match(src, /REMOVED — AMOUNTS NO SOURCE PAGE CONFIRMED/);
  assert.match(src, /penalize\(2,'unverified_numbers_removed'/);
});
