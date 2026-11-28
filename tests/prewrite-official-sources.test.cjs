'use strict';
// Owner 2026-11-28 ("beide bouwen"): a brief for "seo checker gratis" failed only because fewer than 2 official sources
// were found (readiness 94). For tool and commercial topics such sources hardly exist. Now:
// 1. "official_sources" is a quality WARNING with a named reason, no longer a blocker;
// 2. the evidence research also searches the official documentation of the topic (Google Search Central for SEO and AI
//    search, official documentation and government sources otherwise), and those pages are not cut off the candidate list.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
const fn = name => { const i = SRC.indexOf('function ' + name + '('); assert.ok(i > 0, name); let d = 0; const j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } throw Error(name); };
const constLine = name => { const i = SRC.indexOf('const ' + name + '='); assert.ok(i > 0, name); return SRC.slice(i, SRC.indexOf('\n', i)); };

function readiness() {
  const ctx = { require: m => require(m.startsWith('./') ? path.join(__dirname, '..', 'src', m) : m), console };
  vm.runInNewContext([constLine('_PWB_AI_ENGINES_V506'), constLine('_PWB_AI_LABELS_V506'), 'const _prewriteBriefResearch={isValidAnswer:()=>true};',
    fn('_pwbBriefQueryV506'), fn('_pwbAiEvidenceStateV506'), fn('_pwbIsReaderPageUrlV506'), fn('_pwbInternalDestinationStateV506'), fn('_pwbReadiness'), fn('_pwbPublicationQa'),
    'this.readiness=_pwbReadiness;this.qa=_pwbPublicationQa;'].join('\n'), ctx);
  return ctx;
}
const h2s = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'];
const BRIEF = official => ({
  keyword: 'seo checker gratis',
  meta_package: { seo_title: 'SEO checker gratis', meta_description: 'x'.repeat(152) },
  opening_passage: { direct_answer: 'Usa un SEO checker gratuito.' },
  definitive_outline: h2s.map(h => ({ h2: h, purpose: 'Propósito ' + h })), recommended_structure: { must_have_h2s: h2s },
  ai_answer: { direct_answer: 'Respuesta.', key_takeaways: ['a', 'b', 'c'] },
  quick_facts: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }, { label: 'c', value: '3' }],
  entity_strategy: { primary: ['SEO checker'], secondary: ['SEO técnico'], relationships: [{ subject: 'a', relation: 'r', object: 'b' }, { subject: 'c', relation: 'r', object: 'd' }] },
  evidence: { trust_signals: ['t1', 't2'], experience_to_include: 'Prueba la herramienta.', official_sources: official },
  evidence_research: { completed: true, statistics: { searched: true }, expert_quotes: { searched: true }, quality_ladder: { completed: true } },
  link_research: { internal: { searched: true, status: 'verified_targets' }, external: { searched: true, status: 'ok' } },
  balance: { limitations: ['Límites.'] }, use_cases: [{ audience: 'a', scenario: 's', benefit: 'b' }, { audience: 'c', scenario: 's', benefit: 'b' }],
  conclusion: { recap: 'r', recommendation: 'r' }, action_plan: [{ action: '1' }, { action: '2' }, { action: '3' }]
});

test('fewer than 2 official sources is a named warning, not a reason the brief fails', () => {
  const { readiness: r, qa } = readiness();
  const one = r(BRIEF(['Analizar SEO https://www.rankinter.com/es/herramientas-seo/analizar-seo-web/']));
  assert.equal(one.ready_for_generation, true, JSON.stringify(one.missing));
  assert.deepEqual(Array.from(one.missing), []);
  assert.deepEqual(Array.from(one.quality_warnings), ['official_sources']);
  assert.equal(one.readiness_score, 100);
  const w = qa(BRIEF(['https://a.example/x'])).warnings.find(x => x.code === 'official_sources_missing');
  assert.ok(w, 'publication QA names the reason');
  assert.match(w.message, /fewer than 2 official sources/i);
  const two = r(BRIEF(['https://developers.google.com/search/docs/fundamentals/seo-starter-guide', 'https://support.google.com/webmasters/answer/9128668']));
  assert.deepEqual(Array.from(two.quality_warnings), []);
  assert.equal(qa(BRIEF(['https://developers.google.com/a', 'https://support.google.com/b'])).warnings.some(x => x.code === 'official_sources_missing'), false);
});

test('official documentation searches for the topic, in the language of the brief', () => {
  const { officialQueries } = require('../src/prewrite-official-queries.cjs');
  const es = officialQueries('¿Qué seo checker gratis analiza el SEO de mi web?', 'Spanish');
  assert.ok(es.some(q => q.includes('site:developers.google.com/search')), 'SEO topic: Google Search Central');
  assert.ok(es.some(q => /documentación oficial/.test(q)), 'official documentation in Spanish');
  assert.ok(!es.some(q => /¿|\?/.test(q)), 'topic words, not the question');
  const nl = officialQueries('wat kost een dakreparatie', 'Dutch');
  assert.ok(!nl.some(q => q.includes('developers.google.com')), 'not every topic is about search');
  assert.ok(nl.some(q => /officiële documentatie|site:rijksoverheid\.nl/.test(q)));
  const en = officialQueries('how to show up in chatgpt answers', 'English');
  assert.ok(en.some(q => /help\.openai\.com|platform\.openai\.com|openai\.com/.test(q)), 'AI search topic: the vendor documentation');
  assert.ok(en.length >= 2 && en.length <= 3, 'a few searches, not many');
});

test('index.js runs the official searches and keeps their pages at the front of the candidate list', () => {
  assert.ok(SRC.includes("require('./prewrite-official-queries.cjs').officialQueries(keyword,language)"));
  assert.match(SRC, /source_type:'official_search'/);
  assert.match(SRC, /_pwbExternalCandidates=\[\.\.\._pwbExternalCandidates\.filter\(x=>x\.source_type==='official_search'\),\.\.\._pwbExternalCandidates\.filter\(x=>x\.source_type!=='official_search'\)\]/);
});

let chromium = null; try { ({ chromium } = require('playwright')); } catch {}
test('Free Pre-Write: the readable brief names the warning under "check this first"', { skip: !chromium && 'Playwright not installed', timeout: 60000 }, async () => {
  const express = require('express'); const { registerFreePrewrite } = require('../src/free-prewrite.cjs');
  const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, '..', 'public')));
  registerFreePrewrite(app, { query: () => { throw Error('no database'); } });
  const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port, browser = await chromium.launch();
  try {
    for (const [lang, want] of [['es', /fuente oficial/i], ['nl', /officiële bron/i], ['en', /official source/i]]) {
      const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const brief = { ...BRIEF(['https://a.example/x']), content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' }, ai_quality_check: { ready_for_generation: true, missing: [], quality_warnings: ['official_sources'] } };
      await page.route('**/api/free-pre-write/result', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, status: 'open', language: lang, region: lang,
        website: 'https://es.example.com/', keyword: brief.keyword, target: { mode: 'CREATE', url: 'https://es.example.com/seo-checker/' }, instructions: 'CREATE', brief }) }));
      await page.route('**/api/free-pre-write/implementation-report', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, history: [], editor_brief: {} }) }));
      await page.goto(base + '/free-pre-write/r?lang=' + lang + '#' + 'd'.repeat(64));
      const box = page.locator('#brief-readable'); await box.waitFor({ state: 'visible' });
      const text = await box.innerText();
      assert.match(text, want, lang);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
});
