'use strict';
// Golden owner cases: real cases from production that broke before, some of them again after a later change. Every
// change, from any agent, keeps these green (see AGENTS.md). Fast, no network, no database: these are the contracts.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
const page = require('../src/prewrite-existing-page.cjs');
const rel = require('../src/prewrite-evidence-relevance.cjs');
const nc = require('../src/prewrite-numeric-claims.cjs');
const comp = require('../src/prewrite-competitor-links.cjs');

const SITE = ['https://contentscale.site/generative-engine-optimization-consultant/', 'https://contentscale.site/what-is-geo/',
  'https://contentscale.site/seo-content-optimization/', 'https://nl.contentscale.site/seo-content-optimalisatie/', 'https://nl.contentscale.site/wat-is-geo/',
  'https://es.contentscale.site/consultor-geo/', 'https://es.contentscale.site/que-es-geo/'];
const decide = (keyword, region, urls = SITE) => page.applyExistingPageDecision({ content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' } },
  page.findSameIntentPages(keyword, urls, { region })).content_decision;

test('existing page before a new page, per market', () => {
  const cases = [
    ['precio consultor geo', 'es', 'https://es.contentscale.site/consultor-geo/'],                       // 13 Nov
    ['cuánto cuesta un consultor geo', 'es', 'https://es.contentscale.site/consultor-geo/'],
    ['tarifas generative engine optimization', 'es', 'https://es.contentscale.site/consultor-geo/'],     // 14 Nov (#432)
    ['generative engine optimization consultant cost', 'us', 'https://contentscale.site/generative-engine-optimization-consultant/'], // #428, #436
    ['how much does a geo consultant cost', 'us', 'https://contentscale.site/generative-engine-optimization-consultant/'],
    ['seo content optimalisatie', 'nl', 'https://nl.contentscale.site/seo-content-optimalisatie/'],
    ['seo content optimization', 'gb', 'https://contentscale.site/seo-content-optimization/'],
  ];
  for (const [k, r, url] of cases) { const d = decide(k, r); assert.equal(d.recommended_treatment, 'EXPAND_EXISTING_PAGE', k); assert.equal(d.closest_existing_url, url, k); }
  // A single-market client site (no locale subdomains) still expands its own page (#436).
  assert.equal(decide('roof repair houston', 'us', ['https://perfectroofingteam.com/roof-repair-houston/']).recommended_treatment, 'EXPAND_EXISTING_PAGE');
  // Another market never forces an expansion (#435); a price question never lands on a definition page (#432).
  assert.equal(decide('seo content optimization', 'es').recommended_treatment, 'CREATE_NEW_PAGE');
  assert.equal(decide('tarifas geo', 'es', ['https://es.contentscale.site/que-es-geo/']).recommended_treatment, 'CREATE_NEW_PAGE');
});

test('no invented amounts: same number in another currency is no source; unsupported amounts are removed', () => {
  assert.equal(nc.findOnPage('Hourly rates of $175 to $450 per hour.', '175', 'EUR'), null, '$175 is no source for €175 (#429)');
  assert.ok(nc.findOnPage('Hourly rates of $175 to $450 per hour.', '175', 'USD'));
  const brief = { price_facts: [{ number: '6850', amount: '$6,850' }],
    ai_answer: { direct_answer: 'The median retainer is $6,850 per month. Hourly rates range from $50 to $450.', key_takeaways: ['Hourly rates ($50-$450) vary.'] } };
  nc.removeUnverified(brief, nc.unverifiedNumbers(brief));
  assert.equal(brief.ai_answer.direct_answer, 'The median retainer is $6,850 per month.');
  assert.deepEqual(nc.unverifiedNumbers(brief), [], 'no VERIFY FIRST blocker left (#434)');
});

test('geo means Generative Engine Optimization; pricing sources count for every way of asking the price', () => {
  const fps = { title: 'GEO & AEO Pricing Statistics: 2026 Report – First Page Sage', text: 'The median GEO and AEO retainer is $6,850 per month.', excerpt: 'The median GEO and AEO retainer is $6,850 per month' };
  for (const keyword of ['generative engine optimization consultant cost', 'GEO consultant pricing', 'wat kost een geo consultant', 'cuánto cuesta un consultor geo'])
    assert.equal(rel.topicRelevance({ keyword, ...fps }).relevant, true, keyword); // #431
  assert.equal(rel.topicRelevance({ keyword: 'how much does a geo consultant cost', title: 'How Much Does a Geotechnical Report Cost? (2026)',
    text: 'A geotechnical survey costs $1,000 to $5,000 on average.', excerpt: 'A geotechnical survey costs $1,000 to $5,000 on average.' }).relevant, false);
  assert.equal(rel.senseDrift({ keyword: 'consultor geo', title: 'Geología y geografía de España', serpText: 'consultor geo' }), 'geologia');
});

test('no links to competitors; official sources stay allowed', () => {
  const sites = comp.competitorSites({ serpUrls: [{ link: 'https://www.nireweb.es/consultor-geo/' }, { url: 'https://goone.es/x' }] });
  assert.equal(comp.isCompetitorLink('https://nireweb.es/blog/precios', sites), true);
  assert.equal(comp.isCompetitorLink('https://developers.google.com/search/docs', sites), false);
});

test('internal data stays internal', () => {
  // Gemini usage is stripped server-side for non-owner Trackers and never shown on public share links (#438).
  const a = SRC.indexOf('const _INTERNAL_USAGE_DOMAINS='), b = SRC.indexOf('const _INTERNAL_USAGE_KEYS=');
  const sees = new Function('process', SRC.slice(a, b) + ';return _domainSeesInternalUsage;')({ env: {} });
  assert.equal(sees('nl.contentscale.site'), true);
  assert.equal(sees('perfectroofingteam.com'), false);
  assert.equal(sees('evilcontentscale.site'), false);
  assert.match(SRC, /app\.use\('\/api\/tracker-client\/:token',function\(req,res,next\)\{\s*if\(!\/prewrite\/i\.test\(req\.path\)\)return next\(\);/);
  assert.match(SRC, /A share link is public: internal Gemini telemetry is never shown there[^\n]*\n\s*const usage=\{\};/);
  // The generator prompts are server-only: not in the client page template.
  const t0 = SRC.indexOf('const _CLIENT_TRACKER_HTML = `'); let i = t0 + 30; for (; i < SRC.length; i++) { if (SRC[i] === '\\') { i++; continue; } if (SRC[i] === '`') break; }
  const tpl = SRC.slice(t0, i);
  for (const marker of ['STEP 0 — TREATMENT', 'MISSING-ONLY PREWRITE COMPLETION', 'GEMINI_API_KEY', 'SERPAPI_KEY']) assert.equal(tpl.includes(marker), false, marker);
  // The Research Prompt tab stays hidden for users (#437).
  assert.match(fs.readFileSync(path.join(ROOT, 'public/prewrite-research-tab.js'), 'utf8'), /tabs\.hidden = true;\s*tabs\.style\.display = 'none';/);
});

test('the Brief says what to do first; NOT PASSED names what is missing', () => {
  assert.match(SRC, /if \(_dtxt\) \{ lines\.push\('WHAT TO DO: '\+_dtxt\);/); // #433
  assert.match(SRC, /blockers=\[\{code:'not_passed',message:'NOT PASSED — missing in this Brief: '/); // #434
});

test('a Rank Tracker digest that keeps failing is not retried without limit', async () => {
  process.env.RANK_FREE_SECRET = process.env.RANK_FREE_SECRET || 'TEST-golden-secret-0123456789';
  const { sendDigests, DIGEST_TRIES } = require('../src/rank-free/runner.cjs');
  assert.ok(DIGEST_TRIES >= 1 && DIGEST_TRIES <= 5); // #436
  const p = { id: 1, dashboard_nonce: 'n'.repeat(32), email: 'TEST@example.invalid', lang: 'en', host: 'example.invalid', gl: 'us' };
  let fails = 0, closed = 0;
  const store = { digestReady: async () => [p], keywords: async () => [], markDigest: async () => { closed++; }, markDigestFailed: async () => ++fails };
  let sends = 0;
  for (let n = 0; n < DIGEST_TRIES; n++) await sendDigests({ store, send: async () => { sends++; return false; }, baseUrl: 'https://app.example', now: new Date() });
  assert.equal(sends, DIGEST_TRIES);
  assert.equal(closed, 1, 'the round is closed after DIGEST_TRIES failed sends');
});

test('no generated server builds in the repository', () => {
  const stray = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /^_.*_e2e_\d+\.js$/.test(f));
  const tracked = require('node:child_process').execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\/_.*_e2e_\d+\.js$/.test(f));
  assert.deepEqual(tracked, [], 'commit no src/_*_e2e_*.js build (' + stray.join(', ') + ')');
});
