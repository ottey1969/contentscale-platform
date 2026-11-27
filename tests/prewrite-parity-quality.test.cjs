'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const quality = require('../src/prewrite-quality.cjs');

const scan = 'https://publisher.example/nl/seo-scan/';
const services = 'https://publisher.example/nl/diensten/';
const homepage = 'https://publisher.example/nl/';
const topic = 'Wat kost SEO advies?';
const scanHtml = '<h1>SEO scan</h1><p>Controleer de SEO van je website.</p><form><input name="url" type="url"><button>Start de scan</button></form>';
const servicesHtml = '<h1>SEO advies en diensten</h1><h2>SEO advies op aanvraag</h2><p>Prijzen voor SEO advies op aanvraag.</p>';
const site = [quality.websitePage(scan, scanHtml), quality.websitePage(services, servicesHtml)];

test('PWB-01 — find mixed interactive and informational intent in the SEO check SERP', () => {
  const rows = [
    { url: 'https://first.example/seo-check/', title: 'Gratis SEO checker', snippet: 'Vul je URL in en start de scan' },
    { url: 'https://second.example/tool/', title: 'Website SEO checker', snippet: 'Enter your URL to check your website' },
    { url: 'https://third.example/guide/', title: 'Wat is SEO? Een gids', snippet: 'Uitleg en tips voor beginners' }
  ];
  const intent = quality.serpFormats(rows);
  assert.equal(intent.primary, 'interactive_tool');
  assert.equal(intent.secondary, 'editorial_help');
  assert.equal(quality.serpFormats([]).primary, null);
});

test('PWB-02 — find the first-party SEO scan from the live page and avoid calling a guide a tool', () => {
  assert.deepEqual(quality.firstPartyOffers('seo check', site).map(x => x.url), [scan]);
  assert.equal(quality.websitePage(homepage, '<h1>SEO checker explained</h1><p>Learn about scanners.</p>').type, 'content');
});

test('PWB-03 — keep competitor research outside the writer handoff', () => {
  const brief = { keyword: 'seo check', competitor_table: [{ domain: 'rival.example' }],
    opening_passage: { direct_answer: 'Try Rival.example https://rival.example/seo-scan/' },
    definitive_outline: [{ h2: 'How to use the scan' }], external_link_targets: [{ exact_url: 'https://rival.example/seo-scan/' }] };
  const writer = quality.writerBrief(brief);
  assert.doesNotMatch(JSON.stringify(writer), /rival\.example/i);
  assert.equal(brief.competitor_table.length, 1);
  assert.equal(writer.definitive_outline[0].h2, 'How to use the scan');
  assert.deepEqual(quality.writerBrief({ website_evidence: { origin: homepage }, first_party_offers: [{ url: scan }],
    competitor_table: [{ exact_url: scan, domain: 'publisher.example' }] }).first_party_offers, [{ url: scan }]);

});

test('PWB-04 — a discovered URL is not a verified source for the claimed statement', () => {
  const url = 'https://source.example/report/';
  const targets = [{ exact_url: url, supports_claim: 'Traffic rose 38%' }, { exact_url: url, supports_claim: 'Traffic rose 18%' }];
  assert.deepEqual(quality.verifiedSourceTargets(targets, new Map([[url, { text: 'Traffic rose 18% after the change.' }]])), [targets[1]]);
  assert.deepEqual(quality.verifiedSourceTargets(targets, new Map()), []);
});

test('PWB-05 — /diensten/ is a same-intent candidate for the Dutch price question based on visible content', () => {
  assert.equal(quality.contentMatch(topic, site, { region: 'nl' }).url, services);
  assert.equal(quality.contentMatch(topic, site, { region: 'es' }), null);
  assert.equal(quality.contentMatch('Hoe werkt SEO?', site, { region: 'nl' }), null);
});

test('PWB-06 — ask for essential pricing evidence and retain the quoted-only policy', () => {
  assert.equal(quality.missingInformation(topic, []).state, 'needs_input');
  const quote = quality.missingInformation(topic, [site[1]]);
  assert.equal(quote.state, 'complete');
  assert.equal(quote.pricing, 'on_request');
  const surfaces = { opening_passage: { direct_answer: 'A meaningful answer on request.' }, ai_answer: { direct_answer: 'Different advice.' } };
  quality.alignOpening(surfaces);
  assert.equal(surfaces.ai_answer.direct_answer, surfaces.opening_passage.direct_answer);
});

test('PWB-07 — indistinguishable unscheduled CREATEs need review; a separate market stays independent', () => {
  const plan = { keyword: 'SEO check', region: 'nl', brief_json: { content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' } } };
  assert.equal(quality.overlappingPlan('seo check', 'nl', [plan]), true);
  assert.equal(quality.overlappingPlan('seo check', 'es', [plan]), false);
  assert.equal(quality.overlappingPlan('seo audit prijzen', 'nl', [plan]), false);
});

test('PWB-08 — reject stale, visibly truncated or off-topic metadata instead of inventing replacement copy', () => {
  assert.ok(quality.metadataIssues({ seo_title: 'SEO check 2020…', meta_description: 'Short' }, 'seo check', 2026).length >= 2);
  assert.deepEqual(quality.metadataIssues({ seo_title: 'Gratis SEO check', meta_description: 'Gebruik de SEO check om technische en inhoudelijke problemen op je website te onderzoeken.' }, 'seo check', 2026), []);
  assert.match(quality.metadataIssues({ seo_title: 'Roof repair', meta_description: 'A guide to repairing roofs and identifying the source of a leak.' }, 'seo check', 2026).join(), /topic/);
});

test('PWB-09 — preserve existing theme Article and only permit HowTo on relevant step-by-step content', () => {
  const page = quality.websitePage(services, '<script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script><article itemscope itemtype="https://schema.org/Service"><h1>SEO advies</h1></article>');
  assert.deepEqual(quality.schemaAdvice(['BlogPosting', 'Article', 'HowTo', 'Service'], page, { primary: 'interactive_tool' }).add, []);
  assert.deepEqual(quality.schemaAdvice(['HowTo'], page, { primary: 'editorial_help' }, true).add, ['HowTo']);
});

test('PWB-10 — only observed relevant internal pages become link targets', () => {
  const targets = [{ link_to: scan, anchor_text: 'SEO scan' }, { link_to: homepage, anchor_text: 'Home' },
    { link_to: services, anchor_text: 'SEO services', placement: 'Related services' }];
  assert.deepEqual(quality.relevantInternalLinks(targets, site, 'seo check', services), [targets[0]]);
});

test('PWB-11 — manual Gemini is not AIO, and snippet presence does not contradict observed absence', () => {
  assert.equal(quality.googleObservation({ source: 'gemini', checked: true }, true).overview, 'unknown');
  assert.equal(quality.googleObservation({ source: 'no_ai_overview', checked: false }, true).overview, 'observed_absent');
  assert.equal(quality.googleObservation(null, true).overview, 'unknown');
});

test('PWB-12 — record provider model and request, reasoning and tool tokens separately even with budget zero', () => {
  const usage = quality.geminiUsage('gemini-2.5-flash-lite', { modelVersion: 'gemini-2.5-flash-lite-001',
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 30, thoughtsTokenCount: 7, toolUsePromptTokenCount: 12, totalTokenCount: 251 } });
  assert.equal(usage.requested_thinking_budget, 0);
  assert.equal(usage.reasoning_observed_with_zero_budget, true);
  assert.equal(usage.billable_output_tokens, 37);
  assert.equal(usage.tool_input_tokens, 12);
  assert.equal(usage.provider_model_version, 'gemini-2.5-flash-lite-001');
  assert.equal(usage.billing_verified, false);
  assert.equal(quality.zeroThinkingModel('gemini-2.5-pro'), 'gemini-2.5-flash-lite');
});

test('a manual change is available at high confidence and keeps the automatic decision and original query', async () => {
  assert.deepEqual(quality.selectIntent('transactional', 'informational'), {
    primary: 'informational', auto_detected: 'transactional', overridden: true, user_override: 'informational'
  });
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  const start = source.indexOf("'<span style=\"font-weight:700;letter-spacing:.03em;\">SEARCH INTENT");
  const control = source.slice(start, source.indexOf('async function _pwbRegenWithIntent', start));
  assert.match(control, /Change search intent/);
  assert.doesNotMatch(control, /if \(si\.needs_confirmation\)/);
});

test('PWB-06 and PWB-08 — incomplete new briefs cannot confirm publication; historical reports remain readable', () => {
  const { publicationReport } = require('../src/prewrite-implementation.cjs');
  const entry = { schema: 'contentscale.implementation.v1', url: 'https://publisher.example/seo-check/', status: 'published',
    published_at: '2025-01-01T10:00:00Z', summary: 'Published SEO advice.', change_types: ['content'] };
  const brief = { content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' }, meta_package: { url_slug: 'seo-check' } };
  assert.equal(publicationReport(entry, brief, homepage, 'nl').report.status, 'published');
  assert.throws(() => publicationReport(entry, { ...brief, missing_information: { state: 'needs_input' } }, homepage, 'nl'), /pricing/);
  assert.throws(() => publicationReport(entry, { ...brief, metadata_review: { issues: ['stale_year'] } }, homepage, 'nl'), /metadata/);
});

test('PWB-12 — Network compact repair does not bypass the bounded fallback model', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  const start = source.indexOf('const _pwbBriefPrimary=_pwbQuality');
  const compact = source.slice(start, source.indexOf('const _decisionPrompt', start));
  assert.match(compact, /repairBody,'gemini-2\.5-flash-lite',fallback,1,false/);
  assert.doesNotMatch(compact, /gemini-3|GEMINI_MODEL_BRIEF_FALLBACK\|\|fallback/);
});
