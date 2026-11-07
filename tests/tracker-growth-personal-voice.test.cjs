'use strict';
// Tracker Growth CMS package: "This page presents me as a person" (owner 2026-11-07: "ik ben geen bedrijf"). Ticked, I/my
// is allowed in title, description and text; not ticked (default), the service rule stays. TEST page and text only.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { prepareGrowthCmsHandoff } = require('../src/growth-cms-handoff.cjs');
const crypto = require('node:crypto');
const html = '<html lang="nl"><head><title>SEO en GEO specialist</title></head><body><h1>SEO en GEO</h1><h2>Werkwijze</h2><p>TEST: ik onderzoek eerst wat zoekers en AI-systemen willen zien en schrijf daarna de tekst voor de pagina.</p></body></html>';
const base = { canonicalUrl: 'https://test-owner.example/seo-geo/', originalHtml: html, sourceExpectedSha256: crypto.createHash('sha256').update(html).digest('hex'),
  editorApproved: true, cms: 'wordpress', pageTitle: 'Mijn aanpak voor SEO en GEO | TEST', metaDescription: 'Ik help ondernemers met SEO en GEO op basis van zoekgegevens en AI-antwoorden.',
  changes: [{ approved: true, evidence_ref: 'growth_proposal:1', html: '<section><h2>Hoe ik werk</h2><p>Ik begin met de zoekgegevens van je pagina en mijn bevindingen bespreek ik met je voordat ik iets schrijf.</p></section>' }],
  focusQuery: 'seo geo specialist', evidenceScope: 'observed', language: 'nl',
  reviewNotes: { flagged: [{ sentence: 'Ik begin met de zoekgegevens van je pagina en mijn bevindingen bespreek ik met je voordat ik iets schrijf.', code: 'PERSONAL_OR_FOUNDER_VOICE', reason: 'Written as a person (“Ik”).' }] } };

test('default: the service speaks — a first-person title, description or flagged sentence is refused', () => {
  const r = prepareGrowthCmsHandoff(base);
  assert.equal(r.status, 'BLOCKED');
  assert.ok(r.issues.includes('META_PERSONAL_OR_FOUNDER_VOICE'));
  assert.ok(r.issues.includes('FLAGGED_CONTENT_NOT_RESOLVED'));
});

test('personal brand: I/my allowed everywhere, recorded in the manifest', () => {
  const r = prepareGrowthCmsHandoff({ ...base, personalVoiceAllowed: true });
  assert.equal(r.status, 'HANDOFF_READY_FOR_EDITOR', JSON.stringify(r.blocked_details || r.issues));
  assert.equal(r.manifest.voice, 'PERSONAL_BRAND');
  assert.match(r.files.find(f => f.name === '04-seo-metadata.json').content, /Ik help ondernemers/);
});

test('Tracker page and route: the checkbox, the payload and the server option are wired; the refusal names the choice', () => {
  const root = path.join(__dirname, '..');
  assert.match(fs.readFileSync(path.join(root, 'public/growth-cms-neutral-handoff.html'), 'utf8'), /<input id="personalVoice" type="checkbox">[^]*This page presents me as a person/);
  const js = fs.readFileSync(path.join(root, 'public/growth-cms-neutral-handoff.js'), 'utf8');
  assert.match(js, /personal_voice:\$\('personalVoice'\)\.checked===true/);
  assert.match(js, /tick “This page presents me as a person” and download again/);
  assert.match(fs.readFileSync(path.join(root, 'src/tracker-growth-cms-export.cjs'), 'utf8'), /personalVoiceAllowed:req\.body\?\.personal_voice===true/);
});
