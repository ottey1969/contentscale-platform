'use strict';
// Free Growth: the CMS package (same builder as the Tracker) from written concepts. All pages and text are TEST input.
const test = require('node:test'), assert = require('node:assert/strict');
const { pageSource, buildFreePackage, placeLink } = require('../src/growth-free/cms-package.cjs');
const URL_ = 'https://acme-roofing.example/roof-repair-lodi-nj/';
const html = '<html lang="en"><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title><meta name="description" content="TEST roof repair in Lodi."></head><body><h1>Roof Repair in Lodi, NJ</h1>' +
  '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns.</p></body></html>';
const src = pageSource(html, { url: URL_ });
const written = { sections: [{ item_id: 'g1', h2: 'How to read a repair estimate', paragraphs: ['Ask for a written estimate.'],
  placement: { mode: 'ADD_AFTER_SECTION', section_heading: 'Our roof repair services' },
  flags: [{ sentence: 'We are the best roofer in New Jersey.', reason: 'Unverified claim' }],
  basis: { answers: 'What is in an estimate?', competitor_evidence: [{ site: 'roofer-a.example', heading: 'How a repair estimate is built' }] } }] };
const text = 'Ask the roofer for a written estimate that lists materials, labour and access separately before you approve any work on the roof.';
const input = (o = {}) => ({ cms: 'wordpress', seo_title: 'Roof Repair in Lodi, NJ | Acme Roofing', meta_description: 'Roof repair in Lodi, NJ: leaks, tiles and flashing, with a written estimate before work starts.',
  sections: [{ item_id: 'g1', h2: 'How to read a repair estimate', text }], editor_approved: true, ...o });
const build = o => buildFreePackage({ url: URL_, originalHtml: html, sourceSha256: src.source_sha256, written, input: input(o), focusQuery: 'roof repair lodi nj' });

test('the original page is read: title, description, language, headings and fingerprint', () => {
  assert.equal(src.title, 'Roof Repair in Lodi, NJ | Acme Roofing'); assert.equal(src.meta_description, 'TEST roof repair in Lodi.');
  assert.equal(src.language, 'en'); assert.deepEqual(src.headings.map(h => h.level), [1, 2]); assert.match(src.source_sha256, /^[0-9a-f]{64}$/);
});

test('an approved concept becomes the same package as the Tracker, with placement and the evidence record', () => {
  const r = build();
  assert.equal(r.ready, true, JSON.stringify(r.messages));
  const names = r.files.map(f => f.name);
  for (const n of ['manifest.json', '01-implementation.md', '02-approved-copy.md', '03-content-fragments.html', '04-seo-metadata.json', '05-measurement-plan.md', '06-fact-check-before-publishing.md']) assert.ok(names.includes(n), n);
  const impl = r.files.find(f => f.name === '01-implementation.md').content;
  assert.match(impl, /Our roof repair services/); assert.match(impl, /No autopublishing/);
  assert.match(r.files.find(f => f.name === '05-measurement-plan.md').content, /Evidence: observed/);
  assert.match(r.files.find(f => f.name === '06-fact-check-before-publishing.md').content, /best roofer in New Jersey[^]*How to read a repair estimate/);
  assert.equal(r.zip().readUInt32LE(0), 0x04034b50);
});

test('refused in plain language: a flagged sentence still in the text, no approval, a changed page, a foreign link', () => {
  const flagged = build({ sections: [{ item_id: 'g1', h2: 'How to read a repair estimate', text: text + ' We are the best roofer in New Jersey.' }] });
  assert.equal(flagged.ready, false); assert.ok(flagged.issues.includes('FLAGGED_TEXT_STILL_PRESENT')); assert.equal(flagged.flagged[0].sentence, 'We are the best roofer in New Jersey.');
  assert.match(flagged.messages.join(' '), /rewrite or remove it/);
  assert.ok(build({ editor_approved: false }).issues.includes('EDITOR_APPROVAL_REQUIRED'));
  const changed = buildFreePackage({ url: URL_, originalHtml: html + '<!-- TEST change -->', sourceSha256: src.source_sha256, written, input: input() });
  assert.ok(changed.issues.includes('SOURCE_REVISION_CHANGED')); assert.match(changed.messages.join(' '), /Your page changed since step 1/);
  assert.ok(build({ link: { url: 'https://other.example/x/', label: 'Other' } }).issues.includes('LINK_NOT_ON_THIS_SITE'));
  assert.ok(build({ meta_description: 'My roof repair in Lodi, written by me, for every homeowner in New Jersey.' }).issues.includes('META_PERSONAL_OR_FOUNDER_VOICE'));
  assert.ok(build({ sections: [] }).issues.includes('APPROVED_SECTION_COUNT_REQUIRED'));
});

test('the internal link goes into the section about where it leads; a verified Search Console term marks the evidence verified', () => {
  const sections = [{ html: '<section><h2>Estimate</h2><p>About a written estimate for repairs.</p></section>' }, { html: '<section><h2>Gutters</h2><p>Gutter cleaning keeps water away from the roof edge.</p></section>' }];
  const r = placeLink(sections, { url: 'https://www.acme-roofing.example/gutter-cleaning/', label: 'gutter cleaning' }, URL_);
  assert.equal(r.issue, null); assert.match(r.sections[1].html, /href="https:\/\/www\.acme-roofing\.example\/gutter-cleaning\/"/); assert.doesNotMatch(r.sections[0].html, /href/);
  const v = buildFreePackage({ url: URL_, originalHtml: html, sourceSha256: src.source_sha256, written, input: input(), focusQuery: 'roof repair lodi nj', gscVerifiedTerm: true });
  assert.equal(v.ready, true); assert.match(v.files.find(f => f.name === '05-measurement-plan.md').content, /Evidence: verified/);
});

test('a page without a meta description gets one from its own first paragraph (never invented)', () => {
  const none = pageSource('<html><head><title>TEST</title></head><body><nav><p>Menu link text that is long enough to be a paragraph here.</p></nav><p>Short.</p><p>Our crew repairs leaking roofs in Lodi. We explain every repair before we start. A third sentence that makes it far too long for a meta description anyway, with many more words added at the end.</p></body></html>', { url: URL_ });
  assert.equal(none.meta_description_source, 'FIRST_PARAGRAPH');
  assert.equal(none.meta_description, 'Our crew repairs leaking roofs in Lodi. We explain every repair before we start.');
  assert.equal(src.meta_description_source, 'PAGE');
  assert.equal(pageSource('<html><body><p>Hi</p></body></html>').meta_description_source, 'NONE');
});

test('a first-person title or description is rewritten by AI as the service, checked; otherwise nothing is suggested', async () => {
  const { suggestServiceMeta, voiceOf } = require('../src/growth-free/cms-package.cjs');
  assert.deepEqual(voiceOf({ title: 'My SEO framework | ContentScale', meta: 'TEST description of the service.' }), { title: 'My', meta: null });
  assert.equal((await suggestServiceMeta({ title: 'SEO content | ContentScale', meta: 'TEST service description.' })).status, 'NOT_NEEDED');
  assert.equal((await suggestServiceMeta({ title: 'My SEO framework', meta: '' })).status, 'AI_UNAVAILABLE');
  const good = { call: async () => '{"title":"The SEO framework | ContentScale","description":"x"}' };
  const r = await suggestServiceMeta({ title: 'My SEO framework | ContentScale', meta: 'TEST service description.', model: good });
  assert.deepEqual([r.status, r.title, r.meta_description], ['SUGGESTED', 'The SEO framework | ContentScale', 'TEST service description.'], 'only the first-person field changes');
  const stillI = { call: async () => '{"title":"My framework, rewritten","description":"x"}' };
  assert.equal((await suggestServiceMeta({ title: 'My SEO framework', model: stillI })).status, 'REJECTED');
  const addsNumber = { call: async () => '{"title":"The SEO framework: 300% more traffic","description":"x"}' };
  assert.equal((await suggestServiceMeta({ title: 'My SEO framework', model: addsNumber })).status, 'REJECTED', 'no new number or claim');
  assert.equal((await suggestServiceMeta({ title: 'My SEO framework', model: { call: async () => 'not json' } })).status, 'AI_FAILED');
});

test('page title and description: every HTML entity is decoded (pagina&#039;s → pagina\'s); Dutch "Ik" is first person', () => {
  const { voiceOf } = require('../src/growth-free/cms-package.cjs');
  const r = pageSource('<html lang="nl"><head><title>SEO Content | A &amp; B</title><meta name="description" content="SEO content optimalisatie voor pagina&#039;s en pagina&#x27;s. Ik gebruik Growth."></head><body></body></html>');
  assert.equal(r.title, 'SEO Content | A & B');
  assert.equal(r.meta_description, "SEO content optimalisatie voor pagina's en pagina's. Ik gebruik Growth.");
  assert.deepEqual(voiceOf({ title: r.title, meta: r.meta_description }), { title: null, meta: 'Ik' });
});

test('"This page presents me as a person": I/my is allowed in title, description and text; the default still refuses it', () => {
  const meta = 'Ik help bedrijven met SEO en GEO. Mijn aanpak: Growth en Pre-Write Brief, met zoekgegevens als basis.';
  const personalText = text + ' I check every estimate with you before my crew starts.';
  const sections = [{ item_id: 'g1', h2: 'How to read a repair estimate', text: personalText }];
  const voiceFlag = { sections: [{ ...written.sections[0], flags: [{ sentence: 'I check every estimate with you before my crew starts.', code: 'PERSONAL_OR_FOUNDER_VOICE', reason: 'Written as a person (“I”).' }] }] };
  const refused = buildFreePackage({ url: URL_, originalHtml: html, sourceSha256: src.source_sha256, written: voiceFlag, input: input({ meta_description: meta, sections }) });
  assert.equal(refused.ready, false); assert.ok(refused.issues.includes('META_PERSONAL_OR_FOUNDER_VOICE'));
  assert.match(refused.messages.join(' '), /This page presents me as a person/);
  const personal = buildFreePackage({ url: URL_, originalHtml: html, sourceSha256: src.source_sha256, written: voiceFlag, input: input({ meta_description: meta, sections, personal_voice: true }) });
  assert.equal(personal.ready, true, JSON.stringify(personal.messages));
  assert.equal(personal.manifest.voice, 'PERSONAL_BRAND');
  assert.match(personal.files.find(f => f.name === '04-seo-metadata.json').content, /Ik help bedrijven/);
});

test('internal link choices: pages of this site the page already links to, with its own link words (no nav, no other sites, no duplicates)', () => {
  const r = pageSource('<html><body><nav><a href="/menu/">Menu item</a></nav><h1>TEST</h1><p>Read <a href="/content-scaling/">our content scaling guide</a>, <a href="https://other.example/x/">another site</a>, <a href="/content-scaling/#top">again</a> and <a href="/files/a.pdf">a PDF</a>.</p><footer><a href="/privacy/">Privacy</a></footer></body></html>', { url: 'https://contentscale.site/' });
  assert.deepEqual(r.internal_links, [{ url: 'https://contentscale.site/content-scaling/', label: 'our content scaling guide' }]);
});

test('a stored flag is checked again with the current rules: a corrected rule no longer blocks; a real claim still does', () => {
  const gen = 'In this model, text passages and search queries are represented as mathematical vectors, allowing systems to identify conceptual relationships between different phrases.';
  const claim = 'Our platform tracks every roof repair citation in ChatGPT every day.';
  const w = { sections: [{ item_id: 'g1', h2: 'How a repair estimate is built', paragraphs: [text], flags: [{ sentence: gen, code: 'UNSUPPORTED_CAPABILITY_CLAIM', reason: 'TEST old rule' }, { sentence: claim, code: 'UNSUPPORTED_CAPABILITY_CLAIM', reason: 'TEST product claim' }] }] };
  const run = extra => buildFreePackage({ url: URL_, originalHtml: html, sourceSha256: src.source_sha256, written: w, input: input({ sections: [{ item_id: 'g1', h2: 'How to read a repair estimate', text: text + ' ' + extra }] }) });
  assert.equal(run(gen).ready, true, 'the general explanation no longer blocks');
  const blocked = run(claim);
  assert.equal(blocked.ready, false); assert.deepEqual(blocked.flagged.map(f => f.sentence), [claim]);
});
