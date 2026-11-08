'use strict';
// Customer search questions (Tracker Growth and Free Growth). Google answers and AI answers are TEST stand-ins.
const test = require('node:test'), assert = require('node:assert/strict');
const { discoverCustomerQuestions, pageOffer } = require('../src/growth-customer-questions.cjs');
const html = '<html lang="en"><head><title>Generative Engine Optimization (GEO) | ContentScale</title></head><body><nav><h2>Menu</h2></nav>' +
  '<h1>Generative Engine Optimization (GEO)</h1><h2>How GEO works</h2><p>TEST text that must never be sent as an answer.</p><h2>GEO services</h2></body></html>';
const serper = (payload, seen = []) => async (url, init) => { seen.push({ url, body: JSON.parse(init.body), key: init.headers['X-API-KEY'] }); return { ok: true, json: async () => payload }; };

test('the page is read only for what it offers (title, H1, H2), never its body text', () => {
  const o = pageOffer(html);
  assert.equal(o.title, 'Generative Engine Optimization (GEO) | ContentScale');
  assert.deepEqual(o.h1, ['Generative Engine Optimization (GEO)']);
  assert.deepEqual(o.h2, ['How GEO works', 'GEO services'], 'navigation is left out');
  assert.equal(o.language, 'en');
});

test("Google's own questions (People also ask, related searches) and labelled AI suggestions; the keyword is only context", async () => {
  const seen = [], prompts = [];
  const out = await discoverCustomerQuestions({ url: 'https://contentscale.site/geo/', html, keyword: 'generative engine optimization geo', gl: 'uk', hl: 'en', key: 'TEST-KEY',
    fetchImpl: serper({ peopleAlsoAsk: [{ question: 'How can I get my business mentioned in AI answers?' }, { question: 'What is generative engine optimization?' }],
      relatedSearches: [{ query: 'geo vs seo' }, { query: 'contentscale geo' }, { query: 'https://example.com/x y' }] }, seen),
    model: { call: async p => { prompts.push(p); return JSON.stringify({ questions: ['What is generative engine optimization?', 'How do I appear in ChatGPT answers for my service?', 'x'] }); } } });
  assert.deepEqual(seen[0].body, { q: 'generative engine optimization geo', gl: 'uk', hl: 'en', num: 10 }, 'Google is asked with the keyword, in the market');
  assert.deepEqual(out.questions.map(q => [q.text, q.source]), [
    ['How can I get my business mentioned in AI answers?', 'GOOGLE_PEOPLE_ALSO_ASK'],
    ['What is generative engine optimization?', 'GOOGLE_PEOPLE_ALSO_ASK'],
    ['geo vs seo', 'GOOGLE_RELATED_SEARCH'],
    ['How do I appear in ChatGPT answers for my service?', 'AI_SUGGESTION']], 'own brand, URLs, one-word and duplicate items are left out');
  assert.match(out.questions[3].label, /not verified search demand/);
  assert.equal(out.tracked_keyword, 'generative engine optimization geo');
  assert.doesNotMatch(prompts[0], /must never be sent as an answer/, 'the page body is not given to the AI');
  assert.match(prompts[0], /Do not answer them/);
  assert.match(out.note, /Search Console is not needed/);
});

test('without Serper or AI it says so; without a keyword Google is asked with the page topic', async () => {
  const none = await discoverCustomerQuestions({ url: 'https://contentscale.site/geo/', html, keyword: '', key: '', model: null });
  assert.equal(none.status, 'NO_QUESTIONS'); assert.equal(none.google.status, 'GOOGLE_NOT_CONFIGURED'); assert.equal(none.ai.status, 'AI_NOT_CONFIGURED');
  assert.equal(none.searched_with, 'Generative Engine Optimization (GEO)');
  const down = await discoverCustomerQuestions({ html, keyword: 'geo', key: 'TEST', fetchImpl: async () => ({ ok: false }), model: null });
  assert.equal(down.google.status, 'GOOGLE_UNAVAILABLE');
});

// Tracker Growth: the route and the research page, with the routes registered on a stub app (TEST data).
function trackerRoutes({ questionFetch, questionModel, rows }) {
  const routes = {};
  const app = { get: (p, mw, h) => { routes['GET ' + p] = h; }, post: (p, mw, h) => { routes['POST ' + p] = h; } };
  const pool = { query: async sql => ({ rows: rows(sql) }) };
  require('../src/tracker-growth-automatic-routes.cjs').registerGrowthAutomaticResearch(app, pool, (q, s, n) => n && n(), { questionFetch, questionModel, loadPageMarkets: async () => ({ countries: ['GB'], language: 'en' }) });
  return routes;
}
const respond = (h, req) => new Promise(resolve => { const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() { return this; },
  json(b) { resolve({ status: this.statusCode, json: b }); return this; }, type() { return this; }, send(b) { resolve({ status: this.statusCode, html: b }); return this; } }; h(req, res); });
const PAGE = 'https://contentscale.site/generative-engine-optimization/';
const req = (extra = {}) => ({ params: { token: 'TEST' }, query: { page_id: '12', ...extra }, growth: { can_edit: true, pages: [{ id: 12, url: PAGE, keyword: 'generative engine optimization geo' }] }, growthTrackerClientId: 7 });
const rows = sql => /SELECT url,keyword,LEFT\(html_content/.test(sql) ? [{ url: PAGE, keyword: 'generative engine optimization geo', html }] : /SELECT keyword FROM tracker_pages/.test(sql) ? [{ keyword: 'generative engine optimization geo' }] : [];

test('Tracker Growth: customer questions for a page in its market; the research page shows the selected page, the keyword as context and GSC as optional', async () => {
  const seen = [];
  const r = trackerRoutes({ questionFetch: serper({ peopleAlsoAsk: [{ question: 'How can I get my business mentioned in AI answers?' }] }, seen), questionModel: null, rows });
  process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || 'TEST-KEY';
  const api = await respond(r['GET /api/tracker-client/:token/growth/customer-questions'], req());
  assert.equal(api.status, 200, JSON.stringify(api.json));
  assert.equal(seen[0].body.gl, 'uk', 'the page market (GB)'); assert.equal(api.json.market.name, 'United Kingdom');
  assert.equal(api.json.questions[0].text, 'How can I get my business mentioned in AI answers?');
  const readOnly = await respond(r['GET /api/tracker-client/:token/growth/customer-questions'], { ...req(), growth: { ...req().growth, can_edit: false } });
  assert.equal(readOnly.status, 403, 'owner only (it costs a search)');
  const page = await respond(r['GET /track/:token/growth/auto-research'], req({ why: 'opportunity' }));
  assert.match(page.html, /<section id="customerQuestion"[^]*Selected page<\/small><strong>https:\/\/contentscale\.site\/generative-engine-optimization\/<\/strong>/);
  assert.match(page.html, /Tracked keyword \(context, not the customer question\)<\/small><strong>generative engine optimization geo/);
  assert.match(page.html, /Optional, not connected[^]*Not needed for this research/);
  assert.match(page.html, /Opportunity Finder \(Search Console per country\)[^]*choose another page/);
  assert.match(page.html, /Find customer questions/); assert.match(page.html, /growth-customer-questions\.js/);
  assert.match(page.html, /id="cqManual"/, 'owner can enter a question without first loading suggestions');
  assert.match(page.html, /id="cqManualGo"/, 'manual question has its own research action even if Serper or AI fails');
  const chosen = await respond(r['GET /track/:token/growth/auto-research'], req({ query: 'How can I get my business mentioned in AI answers?' }));
  assert.match(chosen.html, /Customer question researched:<\/strong> “How can I get my business mentioned in AI answers\?”/);
  assert.match(chosen.html, /You chose this page/);
});
