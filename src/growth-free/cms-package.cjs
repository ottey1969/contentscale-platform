'use strict';
// Free Growth: the same CMS package (ZIP) as the Tracker, from the concepts written for this check. It reuses the Tracker's
// package builder (src/growth-cms-handoff.cjs) unchanged: the same section, link, claim and safety checks, the same files.
// What differs: the original page is read publicly (there is no Tracker HTML), there is no Case Study, and the evidence is
// "observed" (ranking pages) or "verified" when the visitor's Search Console export, filtered on exactly this page,
// contains the search term. Nothing is published; the ZIP is for a human editor.
const crypto = require('node:crypto');
const { prepareGrowthCmsHandoff, packageGrowthZip } = require('../growth-cms-handoff.cjs');

const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const CMS = ['generic', 'wordpress', 'wix', 'webflow', 'squarespace', 'custom'];

// Step 1: the original page as it is live now (title, meta description, headings), and its fingerprint. The package is
// refused later when the page changed in between.
function pageSource(html, { url } = {}) {
  const h = String(html || '');
  const meta = (/<meta\b[^>]*name=["']description["'][^>]*>/i.exec(h) || [''])[0];
  return { url, source_sha256: sha(h), title: text((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1]).slice(0, 200),
    meta_description: text((/content=["']([^"']*)["']/i.exec(meta) || [])[1]).slice(0, 300),
    language: ((/<html\b[^>]*\blang=["']([a-z]{2})/i.exec(h) || [])[1] || '').toLowerCase() || null,
    headings: [...h.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ level: Number(m[1]), text: text(m[2]).slice(0, 200) })).filter(x => x.text).slice(0, 40) };
}

const sectionHtml = (h2, body) => '<section><h2>' + esc(h2) + '</h2>' + String(body).split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => '<p>' + esc(t).replace(/\n/g, ' ') + '</p>').join('\n') + '</section>';

// The internal link goes into the section that talks most about where it leads (same rule as the Tracker page).
function placeLink(sections, link, pageUrl) {
  if (!link || !link.url) return { sections, issue: null };
  let u; try { u = new URL(String(link.url).trim()); } catch (e) { return { sections, issue: 'LINK_TARGET_INVALID' }; }
  let own; try { own = new URL(pageUrl); } catch (e) { own = null; }
  const strip = h => h.replace(/^www\./, '');
  if (u.protocol !== 'https:' || !own || strip(u.hostname) !== strip(own.hostname)) return { sections, issue: 'LINK_NOT_ON_THIS_SITE' };
  const label = String(link.label || '').trim().slice(0, 120);
  if (label.length < 2) return { sections, issue: 'LINK_LABEL_REQUIRED' };
  const STOP = new Set('to of in on an and the for with your is it at by or be as we us our de het een en van voor met op in'.split(' '));
  const words = t => new Set((String(t).toLowerCase().match(/[\p{L}]{2,}/gu) || []).filter(w => !STOP.has(w)).map(w => w.slice(0, 5)));
  const texts = sections.map(s => words(text(s.html)));
  const want = [...words(label + ' ' + u.pathname.replace(/[-_/]+/g, ' '))].filter(w => !texts.every(t => t.has(w)));
  let best = 0, score = 0;
  texts.forEach((t, i) => { const n = want.filter(w => t.has(w)).length; if (n > score) { score = n; best = i; } });
  const out = sections.map(s => ({ ...s }));
  out[best].html = out[best].html.replace(/<\/section>$/, '<p><a href="' + esc(u.href) + '">' + esc(label) + '</a></p></section>');
  return { sections: out, issue: null };
}

// The same review notes as the Tracker: the flagged sentences (proved resolved by the builder) and what each section rests on.
function reviewNotesOf(given, stored) {
  const flagged = [], basis = [];
  for (const s of given) {
    const orig = stored.get(s.item_id); if (!orig) continue;
    for (const f of orig.flags || []) if (f) flagged.push({ sentence: f.sentence || null, h2: orig.h2 || s.h2, reason: f.reason || '' });
    const b = orig.basis;
    if (b) basis.push({ h2: s.h2, answers: b.answers || '', sources: (b.competitor_evidence || []).map(e => [e.site, e.heading].filter(Boolean).join(': ')), warning: b.warning || '' });
  }
  return flagged.length || basis.length ? { flagged: flagged.filter(f => f.sentence), basis } : null;
}

const PLAIN = {
  EDITOR_APPROVAL_REQUIRED: 'Tick that you reviewed the page, the sections and the link.',
  APPROVED_SECTION_COUNT_REQUIRED: 'Keep at least one section (at most twelve).',
  TOO_MANY_SECTIONS: 'This CMS package accepts at most 12 sections. Select 12 with verified text, or create a separate package for the remaining topics.',
  SUBSTANTIVE_SECTION_TEXT_REQUIRED: 'Every section needs a heading and at least 30 characters of text.',
  EMPTY_HEADING: 'Every section needs a heading.',
  META_TITLE_REQUIRED: 'Enter the SEO title (at most 100 characters).',
  META_DESCRIPTION_REQUIRED: 'Enter the meta description (at most 220 characters).',
  META_PERSONAL_OR_FOUNDER_VOICE: 'Write the title and description about the service, not in the first person ("I", "my").',
  SOURCE_REVISION_CHANGED: 'Your page changed since step 1. Read the original page again, then download.',
  ORIGINAL_PAGE_SNAPSHOT_REQUIRED: 'The original page could not be read. Read it again in step 1.',
  FLAGGED_CONTENT_NOT_RESOLVED: 'A flagged sentence is still in the text: rewrite or remove it.',
  FLAGGED_TEXT_STILL_PRESENT: 'A flagged sentence is still in the text: rewrite or remove it.',
  LINK_TARGET_INVALID: 'The link address is not valid.',
  LINK_NOT_ON_THIS_SITE: 'The internal link must be a https page of this website.',
  LINK_LABEL_REQUIRED: 'Enter the words of the link (what the reader clicks).',
  UNSAFE_OR_NONINDEXABLE_HTML: 'The text contains code that cannot be published; use plain text.',
  CMS_SELECTION_INVALID: 'Choose the website system (CMS).',
  VAGUE_SOURCE_NOTE: 'A source note is too vague; name the source or remove the note.'
};

// input: { cms, seo_title, meta_description, sections:[{item_id, h2, text}], link:{url,label}, editor_approved }
// written: the result-page view of the written concepts (src/growth-free/written.cjs viewOf).
function buildFreePackage({ url, originalHtml, sourceSha256, written, input = {}, focusQuery = '', gscVerifiedTerm = false, language = 'en' }) {
  const stored = new Map(((written && written.sections) || []).map(s => [String(s.item_id), s]));
  const issues = [], flagged = [];
  const supplied = Array.isArray(input.sections) ? input.sections : [];
  if (supplied.length > 12) issues.push('TOO_MANY_SECTIONS');
  const given = supplied.slice(0, 12).map(s => ({ item_id: String(s && s.item_id || ''), h2: String(s && s.h2 || '').trim().slice(0, 200), text: String(s && s.text || '').trim().slice(0, 20000) }));
  if (!given.length) issues.push('APPROVED_SECTION_COUNT_REQUIRED');
  // A flagged sentence of the written concept may not stay in the text (rewrite or remove it).
  for (const s of given) {
    const orig = stored.get(s.item_id);
    for (const f of (orig && orig.flags) || []) if (f && f.sentence && s.text.includes(f.sentence)) flagged.push({ section: s.h2, sentence: f.sentence, reason: f.reason || '' });
  }
  if (flagged.length) issues.push('FLAGGED_TEXT_STILL_PRESENT');
  let sections = given.map(s => {
    const orig = stored.get(s.item_id), p = orig && orig.placement;
    return { approved: true, evidence_ref: orig ? 'free_growth_concept:' + s.item_id : 'free_growth_editor:' + (focusQuery || 'original_page'), html: sectionHtml(s.h2, s.text),
      placement: p && p.mode && p.section_heading ? { mode: p.mode, section_heading: p.section_heading } : null };
  });
  const placed = placeLink(sections, input.link, url); sections = placed.sections; if (placed.issue) issues.push(placed.issue);
  const cms = CMS.includes(input.cms) ? input.cms : 'generic';
  const result = prepareGrowthCmsHandoff({ canonicalUrl: url, originalHtml, sourceExpectedSha256: sourceSha256, caseStudyLocked: false,
    editorApproved: input.editor_approved === true, cms, pageTitle: String(input.seo_title || '').trim(), metaDescription: String(input.meta_description || '').trim(),
    changes: sections, focusQuery, evidenceScope: gscVerifiedTerm ? 'verified' : 'observed', language: language || 'en', reviewNotes: reviewNotesOf(given, stored) });
  const all = [...new Set([...issues, ...(result.issues || [])])];
  if (all.length || result.status !== 'HANDOFF_READY_FOR_EDITOR')
    return { ready: false, issues: all, flagged, blocked_details: result.blocked_details || null, messages: [...new Set(all.map(c => PLAIN[c] || ('Not ready: ' + c.toLowerCase().replace(/_/g, ' ') + '.')))] };
  return { ready: true, files: result.files, manifest: result.manifest, warnings: result.warnings || [], zip: () => packageGrowthZip(result.files) };
}

module.exports = { pageSource, buildFreePackage, placeLink, PLAIN, CMS };
