'use strict';
// Growth AI check: the validation contract of the Pre-Write Brief, applied to pasted AI answers in Tracker Growth and the
// Free Growth check. Regression for a production Growth report (search term "generative engine optimization geo") whose
// pasted answers cited off-topic sources (AI-text detectors, SEO agencies) and, for ChatGPT, 60 "citation" links that
// included favicons and images copied from the chat window. All answers below are labelled TEST.
const test = require('node:test'), assert = require('node:assert/strict');
const ai = require('../src/growth-free/ai-answers.cjs');
const { summarizeGrowthAiVisibility } = require('../src/growth-ai-visibility-summary.cjs');
const Q = 'generative engine optimization geo';
const PAGE = 'https://nl.contentscale.site/generative-engine-optimization-geo/';
const answer = (text, resources) => 'ANSWER:\n' + text + '\n\nRESOURCES:\n' + resources.join('\n');
const GOOD = answer('TEST: Generative engine optimization (GEO) means writing pages that AI search systems can quote, with clear answers and sources.', ['https://example.org/geo-guide?utm_source=chatgpt.com']);

test('rejected: the Growth prompt pasted back, a conversation that knew the task, placeholders; counted: real answers and synonyms', () => {
  const echo = ai.parseAiAnswer(ai.directPrompt(Q), { pageUrl: PAGE, query: Q });
  assert.equal(echo.validation_status, 'invalid'); assert.equal(echo.error_reason, 'prompt_echo'); assert.match(echo.error_message, /This is the prompt itself/);
  const contaminated = ai.parseAiAnswer(answer('TEST: Hieronder het antwoord voor het AI Answer Inputs-veld van de ContentScale Pre-Write Brief over GEO.', []), { pageUrl: PAGE, query: Q });
  assert.equal(contaminated.error_reason, 'context_contaminated');
  assert.equal(ai.parseAiAnswer(answer('n/a', []), { query: Q }).error_reason, 'placeholder');
  const good = ai.parseAiAnswer(GOOD, { pageUrl: PAGE, query: Q });
  assert.equal(good.validation_status, 'valid'); assert.deepEqual(good.warnings, []);
  // Off-topic or synonyms: counted, with a visible topic warning (never rejected on vocabulary alone).
  const offTopic = ai.parseAiAnswer(answer('TEST: GPTZero and Originality.ai are tools that detect text written by AI models.', ['https://global100.org/guides/gptzero-vs-originality-ai/']), { pageUrl: PAGE, query: Q });
  assert.equal(offTopic.validation_status, 'valid'); assert.deepEqual(offTopic.warnings, ['topic_unconfirmed']);
});

test('sources: favicons, chat images and image files are not sources; tracking parameters are removed', () => {
  const p = ai.parseAiAnswer(answer('TEST: GEO answer about generative engine optimization.', [
    'https://www.google.com/s2/favicons?domain=https://ahrefs.com&sz=32', 'https://images.openai.com/static-rsc-4/abc?purpose=inline', 'https://cdn.example.org/logo.png',
    'https://ahrefs.com/site-audit?utm_source=chatgpt.com', 'https://ahrefs.com/site-audit']), { pageUrl: PAGE, query: Q });
  assert.deepEqual(p.sources, ['https://ahrefs.com/site-audit']);
  assert.equal(ai.noiseUrl('https://www.google.com/s2/favicons?domain=x'), true); assert.equal(ai.noiseUrl('https://ahrefs.com/blog/'), false);
  // The AI-visibility summary drops the same noise from stored citation URLs.
  const v = summarizeGrowthAiVisibility({ page: { id: 7, tracker_client_id: 2 }, rows: [{ page_id: 7, tracker_client_id: 2, engine: 'chatgpt', citation_urls: [
    'https://www.google.com/s2/favicons?domain=https://support.google.com&sz=32', 'https://images.openai.com/static-rsc-4/o9u8?purpose=inline', 'https://search.google.com/search-console/about?utm_source=chatgpt.com', 'https://search.google.com/search-console/about'] }] });
  assert.deepEqual(v.engines[0].citation_urls, ['https://search.google.com/search-console/about']);
});

test('summary: an invalid stored answer is named with its reason and counted nowhere; topic warnings are listed', () => {
  const rows = [
    { engine: 'chatgpt', raw_text: GOOD, created_at: '2026-11-06T09:45:00Z' },
    { engine: 'copilot', raw_text: answer('TEST: GPTZero and Originality.ai detect AI-written text.', ['https://global100.org/guides/gptzero-vs-originality-ai/']), created_at: '2026-11-06T09:48:00Z' },
    { engine: 'claude', raw_text: ai.directPrompt(Q), created_at: '2026-11-06T09:47:00Z' }];
  const s = ai.summarizeAiAnswers(rows, { pageUrl: PAGE, query: Q });
  assert.equal(s.checked, 2); assert.equal(s.invalid, 1);
  assert.deepEqual(s.invalid_engines.map(x => [x.id, x.reason]), [['claude', 'prompt_echo']]);
  assert.equal(s.engines.find(e => e.id === 'claude').invalid, true); assert.equal(s.engines.find(e => e.id === 'claude').checked, false);
  assert.equal(s.engines.find(e => e.id === 'copilot').topic_warning, true);
  assert.deepEqual(s.topic_warnings, ['Microsoft Copilot']);
  assert.match(s.steps[0], /^Not counted: Claude — This is the prompt itself/);
  assert.ok(s.steps.some(x => /Check the topic of Microsoft Copilot: this answer shares no word with “generative engine optimization geo”\. It still counts/.test(x)));
  assert.ok(!s.top_cited_sites.some(t => t.site === 'example.com'), 'nothing from the invalid answer is counted');
});

function growthApp(saved) {
  const routes = {};
  const app = { get: (p, mw, h) => { routes['GET ' + p] = h; }, post: (p, mw, h) => { routes['POST ' + p] = h; } };
  const pool = { query: async () => ({ rows: [] }) };
  require('../src/tracker-growth-automatic-routes.cjs').registerGrowthAutomaticResearch(app, pool, (q, s, n) => n && n(), {
    saveAiAnswer: async x => { saved.push(x); }, loadAiAnswers: async () => saved.map(x => ({ engine: x.engine, raw_text: x.rawText, created_at: new Date().toISOString() })) });
  return routes;
}
const call = (h, req) => new Promise(resolve => { const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() { return this; }, json(b) { resolve({ status: this.statusCode, json: b }); return this; } }; h(req, res); });

test('Tracker Growth: an invalid paste is refused with its reason and not stored; a valid one is stored and counted', async () => {
  const saved = [], routes = growthApp(saved), h = routes['POST /api/tracker-client/:token/growth/ai-answer'];
  const req = body => ({ params: { token: 'TEST' }, query: { page_id: '12' }, body, growth: { can_edit: true, pages: [{ id: 12, url: PAGE, keyword: Q }] }, growthTrackerClientId: 7 });
  const bad = await call(h, req({ engine: 'claude', text: ai.directPrompt(Q), query: Q, page_url: PAGE }));
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'AI_ANSWER_INVALID_PROMPT_ECHO'); assert.match(bad.json.error, /This is the prompt itself/);
  assert.equal(saved.length, 0);
  const ok = await call(h, req({ engine: 'chatgpt', text: GOOD, query: Q, page_url: PAGE }));
  assert.equal(ok.status, 200); assert.equal(saved.length, 1); assert.equal(ok.json.ai_check.summary.checked, 1);
});

test('AI visibility next steps appear automatically when AI systems with a source list do not cite the site',()=>{
 const ai=require('../src/growth-free/ai-answers.cjs');
 const page='https://acme-roofing.example/emergency-roof-repair-nj/';
 const src=u=>({sources:[u],source_sites:[new URL(u).hostname],own_site_cited:u.includes('acme-roofing'),exact_page_cited:u===page,sources_verifiable:true});
 const sum=ai.summarizeAiAnswers([{engine:'chatgpt',parsed:src('https://roofer-a.example/x')},{engine:'perplexity',parsed:src('https://roofer-b.example/y')},{engine:'copilot',parsed:src(page)}],{pageUrl:page});
 const ids=sum.visibility_actions.map(a=>a.id);
 assert.deepEqual(ids,['bing_webmaster_tools','consistent_listings','compare_cited_pages','choose_ai_topics']);
 const bing=sum.visibility_actions[0];assert.match(bing.why,/ChatGPT Search does not cite you/);assert.ok(bing.steps.some(s=>/sitemap/.test(s)));
 assert.match(sum.visibility_actions[2].why,/roofer-a\.example/);
 // Bing step only when a Bing-based system misses; nothing when every checked system cites; nothing without a source list.
 assert.ok(!ai.summarizeAiAnswers([{engine:'perplexity',parsed:src('https://roofer-b.example/y')}],{pageUrl:page}).visibility_actions.some(a=>a.id==='bing_webmaster_tools'));
 assert.deepEqual(ai.summarizeAiAnswers([{engine:'chatgpt',parsed:src(page)}],{pageUrl:page}).visibility_actions,[]);
 assert.deepEqual(ai.summarizeAiAnswers([{engine:'chatgpt',raw_text:'no list https://roofer-a.example/x'}],{pageUrl:page}).visibility_actions,[]);
 assert.deepEqual(ai.summarizeAiAnswers([],{pageUrl:page}).visibility_actions,[]);
});
