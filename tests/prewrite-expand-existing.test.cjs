'use strict';
// Pre-Write: a page of this site with the same search intent is expanded, not competed with; "Expand this page in Growth"
// opens the Growth research of that tracked page with the Brief's findings as reference. Regression for the production
// Brief "seo content optimalisatie" (Dutch, nl), which proposed a new slug while nl.contentscale.site/seo-content-optimalisatie/
// already existed. Site URLs below are the ones that run listed; Brief contents are TEST.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const E = require('../src/prewrite-existing-page.cjs');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const SITE = ['https://nl.contentscale.site/geciteerd-worden-in-ai-zoekmachines-en-seo/', 'https://nl.contentscale.site/ai-zichtbaarheid/', 'https://nl.contentscale.site/wat-is-geo/',
  'https://contentscale.site/seo-content-optimization/', 'https://nl.contentscale.site/seo-content-optimalisatie/', 'https://contentscale.site/content-scaling/'];

test('same-intent page: every keyword word in the address; market preferred; partial matches listed, never forced', () => {
  const c = E.findSameIntentPages('seo content optimalisatie', SITE, { region: 'nl' });
  assert.equal(c[0].url, 'https://nl.contentscale.site/seo-content-optimalisatie/'); assert.equal(c[0].full, true); assert.equal(c[0].market_match, true);
  assert.ok(!c.some(x => /wat-is-geo|ai-zichtbaarheid/.test(x.url)), 'unrelated pages are not candidates');
  assert.equal(c.find(x => /seo-content-optimization/.test(x.url)).full, false, 'the English page shares words but not every word');
  // Stems and accents: "optimaliseren" matches "optimalisatie"; Turkish accents fold.
  assert.equal(E.findSameIntentPages('content optimaliseren', ['https://x.example/content-optimalisatie/'])[0].full, true);
  assert.equal(E.findSameIntentPages('içerik ölçekleme', ['https://x.example/tr/icerik-olcekleme/'], { region: 'tr' })[0].full, true);
  assert.deepEqual(E.findSameIntentPages('', SITE), []);
  assert.deepEqual(E.findSameIntentPages('seo content optimalisatie', ['https://x.example/']), []);
});

test('a CREATE_NEW_PAGE decision becomes EXPAND_EXISTING_PAGE for a full match; the previous decision stays visible', () => {
  const brief = { content_decision: { recommended_treatment: 'CREATE_NEW_PAGE', cannibalization_risk: 'insufficient_data', closest_existing_url: 'none', reason: 'TEST model reason' },
    meta_package: { url_slug: '/seo-content-optimalisatie-onderzoek-verbeter-meet' }, hub_spoke_plan: { role: 'new_spoke' } };
  E.applyExistingPageDecision(brief, E.findSameIntentPages('seo content optimalisatie', SITE, { region: 'nl' }));
  const cd = brief.content_decision;
  assert.equal(cd.recommended_treatment, 'EXPAND_EXISTING_PAGE'); assert.equal(cd.cannibalization_risk, 'high');
  assert.equal(cd.closest_existing_url, 'https://nl.contentscale.site/seo-content-optimalisatie/'); assert.equal(cd.previous_recommendation, 'CREATE_NEW_PAGE');
  assert.match(cd.reason, /already has https:\/\/nl\.contentscale\.site\/seo-content-optimalisatie\/.*would compete with it/);
  assert.equal(brief.meta_package.url_slug, '/seo-content-optimalisatie/'); assert.equal(brief.meta_package.proposed_new_slug, '/seo-content-optimalisatie-onderzoek-verbeter-meet');
  assert.equal(brief.hub_spoke_plan, undefined); assert.equal(brief.same_intent_candidates[0].full_match, true);
  // Only partial matches: the model's decision stands; the candidates are recorded for review.
  const partial = { content_decision: { recommended_treatment: 'CREATE_NEW_PAGE', closest_existing_url: 'none' } };
  E.applyExistingPageDecision(partial, E.findSameIntentPages('seo content optimization tools', SITE));
  assert.equal(partial.content_decision.recommended_treatment, 'CREATE_NEW_PAGE'); assert.ok(partial.same_intent_candidates.length >= 1);
  // EXPAND without a named page: the matching page is filled in.
  const expand = { content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: 'none' } };
  E.applyExistingPageDecision(expand, E.findSameIntentPages('seo content optimalisatie', SITE, { region: 'nl' }));
  assert.equal(expand.content_decision.closest_existing_url, 'https://nl.contentscale.site/seo-content-optimalisatie/');
});

test('Pre-Write: a full URL slug in another market never forces a new Spanish page into English Growth', () => {
  const onlyEnglish = ['https://en.example.site/consultor-geo/', 'https://example.site/seo/'];
  const b = { content_decision:{ recommended_treatment:'CREATE_NEW_PAGE', closest_existing_url:'none' } };
  const c = E.findSameIntentPages('consultor geo', onlyEnglish, {region:'es'});
  assert.equal(c[0].full,true,'the words really do match the English slug');
  assert.equal(c[0].market_match,false);
  E.applyExistingPageDecision(b,c);
  assert.equal(b.content_decision.recommended_treatment,'CREATE_NEW_PAGE');
  assert.equal(b.content_decision.cross_market_overlap_requires_review,true);
  assert.deepEqual(b.content_decision.cross_market_url_overlap,['https://en.example.site/consultor-geo/']);
  const local = { content_decision:{ recommended_treatment:'CREATE_NEW_PAGE' } };
  E.applyExistingPageDecision(local,E.findSameIntentPages('consultor geo',
    ['https://en.example.site/consultor-geo/', 'https://es.example.site/consultor-geo/'],{region:'es'}));
  assert.equal(local.content_decision.recommended_treatment,'EXPAND_EXISTING_PAGE');
  assert.equal(local.content_decision.closest_existing_url,'https://es.example.site/consultor-geo/');
});

test('findings for Growth: competitor gaps, sections and questions; never statistics, quotes or AI-answer links', () => {
  const f = E.briefFindingsForGrowth({ keyword: 'seo content optimalisatie',
    definitive_outline: [{ h2: 'TEST Wat is het', cover: ['TEST definitie'] }, { h2: 'TEST Meten', cover: [] }],
    competitor_table: [{ domain: 'doelbewust.nl', the_gap: 'TEST mist meetmethoden', what_to_add: 'TEST meetplan' }, { domain: 'x.nl', the_gap: 'insufficient_data' }],
    people_also_ask: [{ question: 'TEST Wat kost het?' }], faq_questions: [{ q: 'TEST Hoe voorkom ik kannibalisatie?' }, 'TEST Wat kost het?'],
    evidence: { statistics: [{ statistic: 'TEST 50%' }], expert_quotes: [{ quote: 'TEST' }] }, ai_source_leads: [{ url: 'https://example.com/lead' }] });
  assert.deepEqual(f.outline.map(o => o.heading), ['TEST Wat is het', 'TEST Meten']);
  assert.deepEqual(f.competitor_gaps, [{ competitor: 'doelbewust.nl', gap: 'TEST mist meetmethoden', to_add: 'TEST meetplan' }]);
  assert.deepEqual(f.questions, ['TEST Wat kost het?', 'TEST Hoe voorkom ik kannibalisatie?']);
  assert.doesNotMatch(JSON.stringify(f), /50%|example\.com\/lead|"quote"/);
  assert.deepEqual(f.not_included, ['statistics', 'expert quotes', 'links from pasted AI answers']);
});

test('src/index.js: the check runs on the site URLs, the page is always shown to the model, and the decision is applied', () => {
  assert.match(SRC, /const _prewriteExistingPage = require\('\.\/prewrite-existing-page\.cjs'\);/);
  assert.match(SRC, /const _pwbSameIntent=_prewriteExistingPage\.findSameIntentPages\(keyword,clientSitemapUrls,\{region\}\);\n    const _sitemapSample = Array\.from\(new Set\(_pwbSameIntent\.map\(x=>x\.url\)\.concat\(clientSitemapUrls\)\)\)\.slice\(0,100\);/);
  assert.match(SRC, /SAME-INTENT PAGE ALREADY ON THIS SITE \(its address contains every word of the keyword\)/);
  assert.match(SRC, /_prewriteExistingPage\.applyExistingPageDecision\(brief,_pwbSameIntent\);\n    const _finalTreatment=/);
  assert.match(SRC, /id="pwbExpandInGrowth" onclick="pwbOpenGrowthFromBrief\(\)"/);
  assert.match(SRC, /window\.location\.href='\/track\/'\+encodeURIComponent\(TOKEN\)\+'\/growth\/from-brief\?'\+\(id\?'brief_id='/);
});

// The Growth routes, with a fake app and database.
function growthApp(rows) {
  const routes = {};
  const app = { get: (p, mw, h) => { routes['GET ' + p] = h; }, post: (p, mw, h) => { routes['POST ' + p] = h; } };
  const pool = { query: async (sql, args) => {
    if (/FROM prewrite_briefs/.test(sql)) return { rows: rows.briefs.filter(b => b.client_id === args[0] && b.id === args[1]) };
    if (/FROM prewrite_async_jobs/.test(sql)) return { rows: rows.jobs.filter(j => j.client_id === args[0] && j.id === args[1]) };
    return { rows: [] };
  } };
  require('../src/tracker-growth-automatic-routes.cjs').registerGrowthAutomaticResearch(app, pool, (q, s, n) => n && n());
  return routes;
}
function call(handler, req) {
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, set(k, v) { this.headers[k] = v; return this; }, type() { return this; },
      send(b) { resolve({ status: this.statusCode, body: b }); return this; }, json(b) { resolve({ status: this.statusCode, json: b }); return this; },
      redirect(c, u) { resolve({ status: c, location: u }); return this; } };
    handler(req, res);
  });
}

test('Growth: "Expand this page in Growth" opens the tracked page with keyword, market and the Brief findings', async () => {
  const brief = { keyword: 'seo content optimalisatie', content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: 'https://nl.contentscale.site/seo-content-optimalisatie/' },
    competitor_table: [{ domain: 'doelbewust.nl', the_gap: 'TEST mist meetmethoden', what_to_add: 'TEST meetplan' }], definitive_outline: [{ h2: 'TEST Meten', cover: ['TEST GSC'] }],
    evidence: { statistics: [{ statistic: 'TEST 50% statistic' }] } };
  const routes = growthApp({ briefs: [{ id: 41, client_id: 7, keyword: 'seo content optimalisatie', language: 'Dutch', region: 'nl', brief_json: brief }],
    jobs: [{ id: '0f8fad5b-d9cb-469f-a165-70867728950e', client_id: 7, request_json: { keyword: 'seo content optimalisatie', region: 'nl' }, error_json: { brief } }] });
  const pages = [{ id: 12, url: 'https://nl.contentscale.site/seo-content-optimalisatie', keyword: 'seo content optimalisatie' }];
  const req = q => ({ params: { token: 'TEST-token' }, query: q, growth: { can_edit: true, pages }, growthTrackerClientId: 7 });
  const r = await call(routes['GET /track/:token/growth/from-brief'], req({ brief_id: '41' }));
  assert.equal(r.status, 302);
  assert.equal(r.location, '/track/TEST-token/growth/auto-research?page_id=12&query=seo+content+optimalisatie&market=nl&from=brief_id%3D41');
  // The NOT PASSED diagnostic works too.
  const rj = await call(routes['GET /track/:token/growth/from-brief'], req({ job_id: '0f8fad5b-d9cb-469f-a165-70867728950e' }));
  assert.match(rj.location, /page_id=12&.*from=job_id%3D0f8fad5b-d9cb-469f-a165-70867728950e/);
  // Another client's Brief, a page that is not tracked, and read-only access are refused plainly.
  assert.equal((await call(routes['GET /track/:token/growth/from-brief'], { ...req({ brief_id: '41' }), growthTrackerClientId: 8 })).status, 404);
  const nt = await call(routes['GET /track/:token/growth/from-brief'], { ...req({ brief_id: '41' }), growth: { can_edit: true, pages: [] } });
  assert.equal(nt.status, 409); assert.match(nt.body, /is not one of the pages this Tracker follows\. Add it as a page in the Tracker/);
  assert.equal((await call(routes['GET /track/:token/growth/from-brief'], { ...req({ brief_id: '41' }), growth: { can_edit: false, pages } })).status, 403);
  // The research page shows the Brief findings as reference; statistics are not among them.
  const page = await call(routes['GET /track/:token/growth/auto-research'], req({ page_id: '12', query: 'seo content optimalisatie', market: 'nl', from: 'brief_id=41' }));
  assert.equal(page.status, 200);
  assert.match(page.body, /<section id="briefFindings"><h2>From your Pre-Write Brief #41 — reference, not evidence<\/h2>/);
  assert.match(page.body, /<strong>doelbewust\.nl<\/strong>: TEST mist meetmethoden <small>Add: TEST meetplan<\/small>/);
  assert.match(page.body, /TEST Meten <small>TEST GSC<\/small>/);
  assert.doesNotMatch(page.body, /TEST 50% statistic/);
  // Without "from", or for a read-only viewer, no Brief panel.
  assert.doesNotMatch((await call(routes['GET /track/:token/growth/auto-research'], req({ page_id: '12' }))).body, /briefFindings/);
  assert.doesNotMatch((await call(routes['GET /track/:token/growth/auto-research'], { ...req({ page_id: '12', from: 'brief_id=41' }), growth: { can_edit: false, pages } })).body, /briefFindings/);
});

// Owner 2026-11-13: "cuánto cuesta un consultor geo" proposed a new page next to /consultor-geo/ (which has a price section).
test('core words decide when price or question words make the keyword longer than the address', () => {
  const { findSameIntentPages } = require('../src/prewrite-existing-page.cjs');
  const full = (k, u) => findSameIntentPages(k, u, {}).filter(x => x.full).map(x => x.url);
  const es = ['https://es.contentscale.site/consultor-geo/', 'https://es.contentscale.site/que-es-geo/', 'https://es.contentscale.site/chatgpt-recomiende-mi-empresa/'];
  assert.deepEqual(full('cuánto cuesta un consultor geo', es), ['https://es.contentscale.site/consultor-geo/']);
  assert.deepEqual(full('cómo hacer que chatgpt recomiende mi empresa', es), ['https://es.contentscale.site/chatgpt-recomiende-mi-empresa/']);
  assert.deepEqual(full('how much does a geo consultant cost', ['https://contentscale.site/generative-engine-optimization-consultant/']), ['https://contentscale.site/generative-engine-optimization-consultant/']);
  // Not over-matching: a different topic, one core word only, or a comparison with an extra core word stays a new page.
  assert.deepEqual(full('wat kost een geo consultant', ['https://nl.contentscale.site/wat-is-geo/', 'https://nl.contentscale.site/diensten/']), []);
  assert.deepEqual(full('wat kost geo', ['https://nl.contentscale.site/wat-is-geo/']), []);
  assert.deepEqual(full('agencia geo o consultor geo', es), []);
  const hit = findSameIntentPages('cuánto cuesta un consultor geo', es, {})[0];
  assert.equal(hit.core_match, true);
});

test('a price question about one subject goes to the service page (owner 2026-11-13: tarifas generative engine optimization)', () => {
  const { findSameIntentPages: find } = require('../src/prewrite-existing-page.cjs');
  const es = ['https://es.contentscale.site/consultor-geo/', 'https://es.contentscale.site/que-es-geo/', 'https://es.contentscale.site/visibilidad-en-ia/'];
  const en = ['https://contentscale.site/generative-engine-optimization-consultant/', 'https://contentscale.site/what-is-geo/'];
  const best = (k, u) => (find(k, u, { region: '' }).find(x => x.full) || {}).url || null;
  assert.equal(best('tarifas generative engine optimization', es), 'https://es.contentscale.site/consultor-geo/');
  assert.equal(best('geo pricing', en), 'https://contentscale.site/generative-engine-optimization-consultant/');
  assert.equal(best('generative engine optimization consultant cost', en), 'https://contentscale.site/generative-engine-optimization-consultant/');
  assert.equal(best('qué es geo', es), 'https://es.contentscale.site/que-es-geo/', 'not a price question: the address must hold every word');
  assert.equal(best('tarifas geo', ['https://es.contentscale.site/que-es-geo/']), null, 'a price question never lands on a definition page');
});

test('the default market (no locale subdomain or path) still counts: EN root pages and single-market sites (owner 2026-11-14)', () => {
  const site = ['https://contentscale.site/generative-engine-optimization-consultant/', 'https://nl.contentscale.site/seo-content-optimalisatie/',
    'https://es.contentscale.site/consultor-geo/', 'https://contentscale.site/seo-content-optimization/'];
  const decide = (k, urls, region) => E.applyExistingPageDecision({ content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' } }, E.findSameIntentPages(k, urls, { region })).content_decision;
  assert.equal(decide('generative engine optimization consultant cost', site, 'us').closest_existing_url, 'https://contentscale.site/generative-engine-optimization-consultant/');
  assert.equal(decide('seo content optimization', site, 'gb').recommended_treatment, 'EXPAND_EXISTING_PAGE');
  assert.equal(decide('roof repair houston', ['https://perfectroofingteam.com/roof-repair-houston/'], 'us').recommended_treatment, 'EXPAND_EXISTING_PAGE', 'a single-market client site');
  // The site has its own Spanish market: the English root page is another market for a Spanish Brief.
  const es = decide('seo content optimization', site, 'es');
  assert.equal(es.recommended_treatment, 'CREATE_NEW_PAGE');
  assert.deepEqual(es.cross_market_url_overlap, ['https://contentscale.site/seo-content-optimization/']);
  assert.equal(E.marketOf('https://example.com/ai/tools/'), '', '"ai" is not a market');
  assert.equal(E.marketOf('https://example.com/es/consultor/'), 'es');
});
