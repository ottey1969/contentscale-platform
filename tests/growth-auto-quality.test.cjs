'use strict';
// Owner 2026-11-09: the AI fixes weak openings and team/editorial-process advice by itself, the internal link is chosen
// automatically, and a section without a placement goes into the first 30% of the page.
const test = require('node:test'), assert = require('node:assert/strict');
const { generateGrowthEditorDraft, styleIssues } = require('../src/growth-source-grounded-editor.cjs');
const { prepareGrowthCmsHandoff } = require('../src/growth-cms-handoff.cjs');
const { suggestLink, pageSource } = require('../src/growth-free/cms-package.cjs');
const crypto = require('node:crypto');

const SOURCE = '<h1>Content at scale</h1><p>' + 'I help website owners improve how their pages are found in Google and in AI search answers. '.repeat(3) + '</p>';
const task = { mode: 'SECTION_IMPROVEMENT', tasks: [{ code: 'task_sel0', label: 'Embeddings and vector search', core_words: ['embeddings', 'vector'] }], existing_headings: [] };
const weak = { sections: [{ task_code: 'task_sel0', h2: 'How Search Engines Process Queries Using Embeddings and Vector Search', paragraphs: [
  'Content teams frequently observe how search engines process queries using embeddings and vector search to match meaning.',
  'Have your editorial team review existing page files and log all structural updates in a central audit file.'] }] };
const good = { sections: [{ task_code: 'task_sel0', h2: 'How Search Engines Process Queries Using Embeddings and Vector Search', paragraphs: [
  'Embeddings turn a search query into a list of numbers that captures its meaning, and vector search finds passages with a similar meaning.',
  'Check each section of your page: does it answer one question in plain words that a reader would use?'] }] };

test('a weak opening and team-process advice are rewritten by the AI automatically, once', async () => {
  const prompts = [];
  const answers = [JSON.stringify(weak), JSON.stringify(good)];
  const fetchImpl = async (url, opts) => { prompts.push(JSON.parse(opts.body).contents[0].parts[0].text); const t = answers.shift() || JSON.stringify(good);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: t }] } }] }) }; };
  const out = await generateGrowthEditorDraft({ sourceHtml: SOURCE, pageUrl: 'https://contentscale.site/', focusQuery: 'embeddings vector search', readerTask: task, fallbackFlagged: true },
    { apiKey: 'k', model: 'gemini-test-model', fetchImpl });
  assert.match(prompts[0], /Open every section with the answer itself/);
  assert.match(prompts[0], /never address an editorial, research, content or marketing team/);
  assert.equal(prompts.length, 2, 'one automatic style rewrite');
  assert.match(prompts[1], /STYLE REWRITE/);
  assert.match(prompts[1], /Content teams frequently observe/);
  assert.equal(out.style_rewrite, true);
  assert.match(out.draft.sections[0].paragraphs[0], /^Embeddings turn a search query/);
  assert.equal(styleIssues(out.draft, 'x').length, 0);
});

test('team advice is allowed on a page that itself addresses teams', () => {
  assert.equal(styleIssues({ sections: [{ h2: 'x', paragraphs: ['Ask your editorial team to review the draft.'] }] }, 'Our agency trains marketing teams.').length, 0);
  assert.equal(styleIssues({ sections: [{ h2: 'x', paragraphs: ['Ask your editorial team to review the draft.'] }] }, 'I help website owners.').length, 1);
});

test('the internal link is chosen automatically: a page of this site that fits the sections, an offer page counts more', () => {
  const html = '<html><body><nav><a href="/services/ai-search-optimisation">AI search optimisation service</a><a href="/privacy">Privacy policy</a><a href="/blog/pasta">Cooking pasta</a></nav><h1>Content at scale</h1><p>' +
    'I help website owners with search. '.repeat(3) + '</p></body></html>';
  const l = suggestLink(html, 'https://contentscale.site/', { sectionsText: 'Embeddings and vector search decide which passages answer an AI search question.', focus: 'rank in AI search' });
  assert.equal(l.url, 'https://contentscale.site/services/ai-search-optimisation');
  assert.equal(l.label, 'AI search optimisation service');
  assert.equal(pageSource(html, { url: 'https://contentscale.site/', sectionsText: 'AI search' }).suggested_link.url, l.url);
  assert.equal(suggestLink('<p><a href="/privacy">Privacy policy</a></p>', 'https://contentscale.site/', { sectionsText: 'privacy' }), null, 'legal pages are never suggested');
});

test('a section without a placement goes after the best matching H2 in the first 30% of the page', () => {
  const h2s = ['Why content at scale matters', 'How AI search finds pages', 'Pricing', 'Case study', 'Team', 'FAQ', 'Contact', 'Blog', 'Tools', 'About'];
  const originalHtml = '<html><head><title>How AI search finds pages: embeddings and content at scale</title></head><body><h1>Content at scale for AI search</h1>' + h2s.map(h => '<h2>' + h + '</h2><p>' + h + ' explained for website owners who want more visitors from search.</p>').join('') + '</body></html>';
  const out = prepareGrowthCmsHandoff({ canonicalUrl: 'https://contentscale.site/', originalHtml, sourceExpectedSha256: crypto.createHash('sha256').update(originalHtml).digest('hex'),
    caseStudyLocked: false, editorApproved: true, cms: 'generic', pageTitle: 'Content at scale', metaDescription: 'Content at scale for website owners who want more visitors from Google and AI search.',
    evidenceScope: 'observed', changes: [{ approved: true, evidence_ref: 'free_growth_concept:a', placement: null,
      html: '<section><h2>How Search Engines Process Queries Using Embeddings</h2><p>Embeddings turn an AI search query into numbers so the search finds pages with the same meaning.</p></section>' }] });
  const p = out.manifest.change_placements[0];
  assert.deepEqual(p, { mode: 'ADD_AFTER_SECTION', section_heading: 'How AI search finds pages', auto: true });
  assert.match(out.files.find(f => f.name === '01-implementation.md').content, /directly after “How AI search finds pages” \(chosen automatically: in the first 30% of the page/);
});

test('an answer that is no valid JSON is asked once more; JSON with text or a trailing comma around it is read as is', async () => {
  const prompts = [], answers = ['Sure! Here is the draft: {"sections": [', JSON.stringify(good)];
  const fetchImpl = async (url, opts) => { prompts.push(JSON.parse(opts.body).contents[0].parts[0].text); const t = answers.shift();
    return { ok: true, json: async () => ({ candidates: [{ finishReason: prompts.length === 1 ? 'MAX_TOKENS' : 'STOP', content: { parts: [{ text: t }] } }] }) }; };
  const out = await generateGrowthEditorDraft({ sourceHtml: SOURCE, pageUrl: 'https://contentscale.site/', focusQuery: 'embeddings vector search', readerTask: task, fallbackFlagged: true },
    { apiKey: 'k', model: 'gemini-test-model', fetchImpl });
  assert.equal(prompts.length, 2); assert.match(prompts[1], /FORMAT RETRY: .*cut off/);
  assert.equal(out.status, 'AI_DRAFT_REVIEW_REQUIRED'); assert.match(out.draft.sections[0].paragraphs[0], /^Embeddings turn/);
  const { parseAiJson } = require('../src/growth-source-grounded-editor.cjs');
  assert.deepEqual(parseAiJson('Here it is:\n```json\n{"sections":[{"h2":"a",}],}\n```'), { sections: [{ h2: 'a' }] });
  // Still unusable after the retry: the reason says so, with Google's finish reason for the log.
  const bad = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"sections":[' }] } }] }) });
  const out2 = await generateGrowthEditorDraft({ sourceHtml: SOURCE, pageUrl: 'https://contentscale.site/', focusQuery: 'x', readerTask: task, fallbackFlagged: true }, { apiKey: 'k', model: 'gemini-test-model', fetchImpl: bad });
  assert.equal(out2.status, 'INVALID_AI_JSON'); assert.equal(out2.provider_error.finish_reason, 'MAX_TOKENS');
});

test('a section about another subject than the page is not placed in the first 30%; it gets the advice to become its own page', () => {
  const h2s = ['How do you scale content without losing quality?', 'What can you do with a content scaling strategy?', 'Pricing', 'Case study', 'AI-era strategy for AI search', 'Team', 'FAQ', 'Contact', 'Blog', 'About'];
  const originalHtml = '<html><head><title>Content At Scale Done Right | AI Search Specialist</title></head><body><h1>Beyond Content at Scale: Track Your AI Citations &amp; Rankings</h1>' +
    h2s.map(h => '<h2>' + h + '</h2><p>' + h + ' explained for website owners.</p>').join('') + '</body></html>';
  const base = { canonicalUrl: 'https://contentscale.site/', originalHtml, sourceExpectedSha256: require('node:crypto').createHash('sha256').update(originalHtml).digest('hex'),
    editorApproved: true, cms: 'generic', pageTitle: 'Content at scale', metaDescription: 'Content at scale for website owners who want more visitors from Google and AI search.', evidenceScope: 'observed', focusQuery: 'rank in AI search results' };
  const section = h => ({ approved: true, evidence_ref: 'x', placement: null, html: '<section><h2>' + h + '</h2><p>Embeddings turn a query into numbers so a search can match pages by meaning in AI search.</p></section>' });
  const on = prepareGrowthCmsHandoff({ ...base, changes: [section('What is the Difference Between Ranking and Being Cited in AI Search?')] });
  assert.equal(on.manifest.change_placements[0].off_topic, undefined);
  assert.ok(['How do you scale content without losing quality?', 'What can you do with a content scaling strategy?', 'Pricing'].includes(on.manifest.change_placements[0].section_heading), 'on topic: first 30%');
  const off = prepareGrowthCmsHandoff({ ...base, changes: [section('How Search Engines Process Queries Using Embeddings and Vector Search')] });
  assert.equal(off.manifest.change_placements[0].off_topic, true);
  assert.equal(off.manifest.change_placements[0].section_heading, 'AI-era strategy for AI search', 'off topic: best match anywhere on the page');
  assert.ok(off.warnings.includes('SECTION_OFF_PAGE_TOPIC'));
  assert.match(off.files.find(f => f.name === '01-implementation.md').content, /different subject than the page's main topic[^)]*give it its own page/);
});
