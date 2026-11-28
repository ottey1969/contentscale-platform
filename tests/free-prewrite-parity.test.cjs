'use strict';
// Owner 2026-11-28, review of a real Free Pre-Write brief ("how can i earn money with content at scale", contentscale.site)
// and the two NL "seo check" briefs. Each test reproduces one defect seen in those briefs.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const q = require('../src/prewrite-quality.cjs');

test('metadata: a title or description cut off mid-phrase is incomplete (EN, NL, ES)', () => {
  const topic = 'how can i earn money with content at scale';
  const cut = q.metadataIssues({ seo_title: 'Earn Money With Content at Scale: Strategies for',
    meta_description: 'Discover how to earn money with content at scale. Learn strategies for building automated revenue streams, leveraging digital products, and achieving.' }, topic, 2026);
  assert.ok(cut.includes('seo_title_incomplete'), 'title ending on "for" is cut off');
  assert.ok(cut.includes('meta_description_incomplete'), 'description ending on "and achieving." is cut off');
  assert.ok(q.metadataIssues({ seo_title: 'Gratis SEO Check: Analyseer Je Website Direct & Verbeter', meta_description: 'Voer direct een gratis SEO check uit op je website. Ontdek technische fouten en verbeter je vindbaarheid in Google.' }, 'seo check', 2026).includes('seo_title_incomplete'));
  assert.ok(q.metadataIssues({ seo_title: 'Agencia GEO: qué hace y cuánto cuesta una de', meta_description: 'Qué hace una agencia GEO, cuánto cuesta y cuándo merece la pena contratar una para aparecer en ChatGPT.' }, 'agencia geo', 2026).includes('seo_title_incomplete'));
  assert.deepEqual(q.metadataIssues({ seo_title: 'Gratis SEO check: score op 100 punten voor Google én AI',
    meta_description: 'Doe gratis een SEO check: in seconden een score op 100 punten voor contentkwaliteit, opbouw en techniek. Zonder account.' }, 'seo check', 2026), []);
});

test('PAA: placeholder answers that say the context has no information are removed, real answers stay', () => {
  const list = [
    { q: 'How many YouTube views do I need to make $10,000 a month?', a: 'The provided context does not contain information about specific YouTube view counts needed to earn a particular amount of money.' },
    { q: 'What app pays you the most for content?', a: 'The context does not specify which app pays the most for content.' },
    { q: 'Hoe vaak moet ik een SEO check doen?', a: 'Doe een check na elke grote wijziging aan een pagina.' },
    { q: '¿Qué es una agencia GEO?', a: 'El contexto proporcionado no contiene información sobre agencias.' }
  ];
  assert.deepEqual(q.cleanPaa(list).map(item => item.q), ['Hoe vaak moet ik een SEO check doen?']);
});

test('fact safety: a question is not a claim', () => {
  assert.equal(q.isQuestionField('paa_questions[0].q', 'How do I make $100 a day with Google AdSense?'), true);
  assert.equal(q.isQuestionField('ai_answer.secondary_questions[2]', 'What are common pitfalls?'), true);
  assert.equal(q.isQuestionField('ai_answer.primary_question', 'How can I earn money with content at scale?'), true);
  assert.equal(q.isQuestionField('paa_questions[0].a', 'You need 100,000 views to make $10,000.'), false);
  assert.equal(q.isQuestionField('quick_facts[0].value', 'Creators earn $100K a year?'), false);
});

test('first party: a sister subdomain of the same site counts as the own site (scanner on app.)', () => {
  assert.equal(q.sameSite('https://app.contentscale.site/', 'https://nl.contentscale.site/'), true);
  assert.equal(q.sameSite('https://contentscale.site/x', 'https://www.contentscale.site/'), true);
  assert.equal(q.sameSite('https://shop.example.co.uk/', 'https://example.co.uk/'), true);
  assert.equal(q.sameSite('https://example.co.uk/', 'https://other.co.uk/'), false);
  assert.equal(q.sameSite('https://contentscale.site.evil.test/', 'https://contentscale.site/'), false);
});

test('internal links: read pages with a shared topic word and the own tool become link targets', () => {
  const pages = [
    q.websitePage('https://contentscale.site/', '<title>Content scaling without losing search visibility</title><h1>Content scaling</h1><p>Scale content.</p>'),
    q.websitePage('https://contentscale.site/graaf-framework/', '<h1>GRAAF Framework for content quality</h1><p>Scoring.</p>'),
    q.websitePage('https://contentscale.site/blog/content-at-scale/', '<h1>Content at scale: a practical guide</h1><p>Guide.</p>'),
    q.websitePage('https://app.contentscale.site/', '<h1>Free SEO content scanner</h1><div><input type="url" aria-label="Website URL"><button>Scan</button></div>'),
    q.websitePage('https://contentscale.site/privacy/', '<h1>Privacy policy</h1>')
  ];
  const links = q.suggestInternalLinks([], pages, 'how can i earn money with content at scale', 'https://contentscale.site/earn-money-content-scale/');
  const urls = links.map(link => link.link_to);
  assert.ok(urls.includes('https://contentscale.site/blog/content-at-scale/'));
  assert.ok(urls.includes('https://contentscale.site/'));
  assert.ok(!urls.includes('https://contentscale.site/privacy/'), 'no unrelated page');
  assert.ok(links.length >= 2 && links.length <= 6);
  assert.ok(links.every(link => link.anchor_text && link.reason));
  const seo = q.suggestInternalLinks([], pages, 'seo check', 'https://nl.contentscale.site/seo-check/');
  assert.ok(seo.some(link => link.link_to === 'https://app.contentscale.site/'), 'the own scanner on app. is linked');
});

test('link research: an empty link list says why instead of staying silent', () => {
  const r = q.linkResearch({ sitemapUrls: 0, pagesRead: 1, internal: [], external: [], externalCandidates: 3 });
  assert.equal(r.internal.state, 'none_found');
  assert.match(r.internal.reason, /sitemap/i);
  assert.equal(r.external.state, 'none_verified');
  assert.match(r.external.reason, /verified|primary/i);
  assert.equal(q.linkResearch({ sitemapUrls: 40, pagesRead: 12, internal: [{}, {}, {}], external: [{}], externalCandidates: 1 }).internal.state, 'ok');
});

test('writer copy keeps competitor gaps, entities and AI-system gaps, without competitor names or links', () => {
  const brief = {
    keyword: 'seo check',
    competitor_table: [
      { rank: 1, domain: 'seobility.net', company_or_publisher: 'Seobility', what_they_have: 'A free SEO checker tool by Seobility.',
        the_gap: 'No explanation of why each check matters.', what_to_add: 'Explain the why behind each check, see https://www.seobility.net/en/seocheck/.' },
      { rank: 2, domain: 'maeno.nl', company_or_publisher: 'Maeno', what_they_have: 'A scan without account.', the_gap: 'AI search is not mentioned.', what_to_add: 'Explain how the checks relate to AI search.' }
    ],
    entity_strategy: { core: ['SEO check'], secondary: ['AI search'], note: 'Seobility uses the term SEO checker.' },
    ai_systems_analysis: { gaps: ['ChatGPT cites Maeno for scan steps; no page explains AI readiness.'] },
    meta_package: { url_slug: 'seo-check' }
  };
  const writer = q.writerBrief(brief);
  const text = JSON.stringify(writer).toLowerCase();
  assert.ok(Array.isArray(writer.competition_gaps) && writer.competition_gaps.length === 2);
  assert.match(writer.competition_gaps[0].gap, /why each check matters/);
  assert.match(writer.competition_gaps[1].add, /ai search/i);
  assert.ok(writer.entity_strategy && writer.entity_strategy.core.includes('SEO check'));
  assert.ok(writer.ai_systems_analysis, 'AI-system findings reach the writer');
  for (const name of ['seobility', 'maeno']) assert.ok(!text.includes(name), name + ' must not reach the writer');
});

test('firecrawl fallback: only when the direct read failed or is unreadable, never past a refusal or bot check', async () => {
  const { createFallbackReader } = require('../src/growth-free-firecrawl-reader.cjs');
  const env = { FIRECRAWL_API_KEY: 'k' };
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const long = '<main>' + 'Readable text about the topic. '.repeat(40) + '</main>';
  const pages = {
    'https://ok.example/': { status: 200, html: long },
    'https://thin.example/': { status: 200, html: '<div id="app"></div><script src="/app.js"></script>' },
    'https://down.example/': { status: 503, html: '' },
    'https://bot.example/': { status: 200, html: '<title>Just a moment...</title><p>Checking your browser before accessing</p>' }
  };
  const original = async url => {
    if (url === 'https://refused.example/') throw Object.assign(Error('HTTP_403'), { code: 'HTTP_403' });
    if (url === 'https://timeout.example/') throw Object.assign(Error('TIMEOUT'), { code: 'TIMEOUT' });
    const page = pages[url];
    return { ...page, final_url: url, truncated: false };
  };
  const calls = [];
  const fetchImpl = async (endpoint, init) => {
    calls.push(JSON.parse(init.body).url);
    return new Response(JSON.stringify({ success: true, data: { html: long, metadata: { statusCode: 200, sourceURL: JSON.parse(init.body).url } } }), { status: 200 });
  };
  const reader = createFallbackReader({ env, original, fetchImpl, lookup, maxPages: 3, manager: { read: async ({ load }) => ({ source: 'REQUEST', value: await load() }), record: async () => {} } });
  assert.equal((await reader('https://ok.example/')).html, long);
  await assert.rejects(reader('https://refused.example/'), /HTTP_403/);
  assert.equal((await reader('https://bot.example/')).status, 200, 'bot check page is returned as is');
  assert.deepEqual(calls, [], 'no paid call for readable, refused or bot-checked pages');
  assert.equal((await reader('https://thin.example/')).html, long);
  assert.equal((await reader('https://down.example/')).html, long);
  assert.equal((await reader('https://timeout.example/')).html, long);
  assert.deepEqual(calls, ['https://thin.example/', 'https://down.example/', 'https://timeout.example/']);
  assert.equal(reader.stats.used, 3);
  const off = createFallbackReader({ env: {}, original, fetchImpl, lookup });
  assert.equal((await off('https://thin.example/')).html, pages['https://thin.example/'].html, 'without a key nothing changes');
});

test('site discovery reads a sitemap index (Rank Math, Yoast) and keeps sister subdomains linked from the site', async () => {
  const { discoverSite } = require('../src/free-prewrite.cjs');
  const home = '<a href="/over/">Over</a><a href="https://app.contentscale.site/">Scanner</a><a href="https://evil.test/">x</a>';
  const files = {
    'https://contentscale.site/': { status: 200, html: home, final_url: 'https://contentscale.site/' },
    'https://contentscale.site/robots.txt': { status: 200, html: 'User-agent: *\nSitemap: https://contentscale.site/sitemap_index.xml\n' },
    'https://contentscale.site/sitemap_index.xml': { status: 200, html: '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://contentscale.site/page-sitemap.xml</loc></sitemap><sitemap><loc>https://contentscale.site/post-sitemap.xml</loc></sitemap></sitemapindex>' },
    'https://contentscale.site/page-sitemap.xml': { status: 200, html: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://contentscale.site/graaf-framework/</loc></url><url><loc>https://contentscale.site/diensten/</loc></url></urlset>' },
    'https://contentscale.site/post-sitemap.xml': { status: 200, html: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://contentscale.site/blog/content-at-scale/</loc></url></urlset>' }
  };
  const fetchHtml = async url => {
    const file = files[url];
    if (!file) return { status: 404, html: '', final_url: url };
    return { final_url: url, truncated: false, ...file };
  };
  const found = await discoverSite('https://contentscale.site/', { fetchHtml });
  for (const url of ['https://contentscale.site/over/', 'https://contentscale.site/graaf-framework/', 'https://contentscale.site/diensten/', 'https://contentscale.site/blog/content-at-scale/', 'https://app.contentscale.site/']) {
    assert.ok(found.urls.includes(url), url);
  }
  assert.ok(!found.urls.some(url => url.includes('evil.test')));
  assert.equal(found.sitemap_urls, 3);
});

test('Free Pre-Write: intent follows the SERP first and is corrected afterwards; the five AI systems can be pasted', async () => {
  const { registerFreePrewrite } = require('../src/free-prewrite.cjs');
  const app = express();
  app.use(express.json());
  let context;
  const pool = {
    connect: async () => ({ query: async sql => /SELECT COUNT/.test(sql) ? { rows: [{ daily: 0, active: 0 }] } : /INSERT/.test(sql) ? { rows: [{ id: 7 }] } : { rows: [] }, release() {} }),
    query: async () => ({ rows: [] })
  };
  registerFreePrewrite(app, pool, {
    discover: async site => ({ site, urls: [] }),
    generate: async value => { context = value; },
    // The weekly free limit has its own test (free-weekly-limit.test.cjs); here it would block reruns on one database.
    perWeek: 0
  });
  const form = (await request(app).get('/free-pre-write?lang=en').expect(200)).text;
  const intake = form.slice(form.indexOf('id="intake"'), form.indexOf('</form>', form.indexOf('id="intake"')));
  assert.ok(!/name="intent"/.test(intake), 'no intent choice before the brief');
  for (const engine of ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot']) assert.match(intake, new RegExp('name="ai-' + engine + '"'));
  assert.match(intake, /name="google-source"/);
  const result = (await request(app).get('/free-pre-write/r?lang=nl').expect(200)).text;
  const adjust = result.slice(result.indexOf('id="intent-adjust"'));
  assert.match(adjust, /name="intent"/);
  assert.match(adjust, /Commercieel/);
  assert.match(adjust, /Informatief/);
  assert.match(adjust, /Transactioneel/);
  assert.match(adjust, /Navigatie/);
  assert.match((await request(app).get('/free-pre-write/r?lang=en').expect(200)).text, /Commercial/);
  assert.match((await request(app).get('/free-pre-write/r?lang=es').expect(200)).text, /Comercial/);
  await request(app).post('/api/free-pre-write').set('Authorization', 'Bearer ' + 'a'.repeat(64)).send({
    website: 'https://contentscale.site/', keyword: 'seo check', region: 'nl', language: 'nl', email: 'parity@example.com',
    manualAiEvidence: { google_source: 'ai_overview', google_aio: 'Een SEO check is een analyse…', chatgpt: 'x'.repeat(13000), perplexity: '', claude: 'Claude answer', copilot: 'Copilot answer', ai_question: 'Wat is een SEO check?', extra: 'dropped' }
  }).expect(202);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.manualAiEvidence.google_source, 'ai_overview');
  assert.equal(context.manualAiEvidence.chatgpt.length, 12000);
  assert.equal(context.manualAiEvidence.claude, 'Claude answer');
  assert.equal(context.manualAiEvidence.ai_question, 'Wat is een SEO check?');
  assert.ok(!('extra' in context.manualAiEvidence));
  await request(app).post('/api/free-pre-write').set('Authorization', 'Bearer ' + 'b'.repeat(64)).send({
    website: 'https://contentscale.site/', keyword: 'seo check', region: 'nl', language: 'nl', manualAiEvidence: 'not an object'
  }).expect(400);
});
