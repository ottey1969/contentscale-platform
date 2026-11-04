'use strict';
// TEST ONLY — loaded with --require after tests/staging-boot-no-egress.cjs in the Pre-Write staging e2e. Outside network
// stays denied. Calls to the Gemini API and to Serper are answered locally with fixed TEST replies (example.org results),
// and every Gemini request body is written to PREWRITE_E2E_CAPTURE, so the test can read the prompt the Brief generator
// really sent. No real AI answer or search result is claimed.
const fs = require('node:fs');
const denied = globalThis.fetch;
const capture = process.env.PREWRITE_E2E_CAPTURE || '';
// A complete TEST Brief, so the generation passes the quality gate and is saved like a real one. Every value says TEST.
const H2 = ['TEST What it means', 'TEST How it works', 'TEST Costs', 'TEST Risks', 'TEST Next steps'];
const TEST_BRIEF = { test_stub: 'TEST reply from the e2e Gemini stub; not a real model answer',
  meta_package: { seo_title: 'TEST title', meta_description: 'TEST description' }, opening_passage: { direct_answer: 'TEST direct answer' },
  definitive_outline: H2.map(h => ({ h2: h, purpose: 'TEST purpose', cover: ['TEST'] })), recommended_structure: { must_have_h2s: H2 },
  ai_answer: { direct_answer: 'TEST', key_takeaways: ['TEST a', 'TEST b', 'TEST c'] }, quick_facts: [1, 2, 3].map(i => ({ label: 'TEST ' + i, value: 'TEST value' })),
  entity_strategy: { primary: ['TEST e1', 'TEST e2'], relationships: [{ subject: 'TEST s', relation: 'TEST r', object: 'TEST o' }, { subject: 'TEST s2', relation: 'TEST r2', object: 'TEST o2' }] },
  evidence: { trust_signals: ['TEST t1', 'TEST t2'], experience_to_include: 'TEST x', official_sources: ['https://example.org/a', 'https://example.org/b'] },
  balance: { limitations: ['TEST limitation'] }, use_cases: [1, 2].map(i => ({ audience: 'TEST audience ' + i, scenario: 'TEST scenario', benefit: 'TEST benefit' })),
  conclusion: { recap: 'TEST recap', recommendation: 'TEST recommendation' }, action_plan: [1, 2, 3].map(i => ({ step: i, action: 'TEST action ' + i })) };
globalThis.fetch = async function (url, init) {
  const u = String(url && url.url || url || '');
  if (/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent/.test(u)) {
    if (capture) fs.appendFileSync(capture, JSON.stringify({ url: u.replace(/key=[^&]+/, 'key=TEST'), body: init && init.body ? String(init.body) : '' }) + '\n');
    const text = JSON.stringify(TEST_BRIEF);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (/^https:\/\/google\.serper\.dev\/search/.test(u)) {
    const organic = [1, 2, 3, 4, 5].map(i => ({ position: i, link: 'https://example.org/test-result-' + i, title: 'TEST result ' + i, snippet: 'TEST snippet ' + i + ' from the e2e Serper stub.' }));
    return new Response(JSON.stringify({ organic, peopleAlsoAsk: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return denied(url, init);
};
