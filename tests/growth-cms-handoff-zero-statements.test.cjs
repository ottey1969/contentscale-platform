'use strict';
// CMS package page: with no statement to confirm (for example an AI-assisted draft that passed the server checks), the
// tick "I checked all 0 statements" must not appear: it could not be ticked and looked like a blocker. The cause was a
// CSS rule (.check{display:flex}) that overrode the hidden attribute. Checked in a real browser; skips without Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const HTML = fs.readFileSync(path.join(__dirname, '../public/growth-cms-neutral-handoff.html'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, '../public/growth-cms-neutral-handoff.js'), 'utf8');
const REPORT_UI = fs.readFileSync(path.join(__dirname, '../public/growth-automatic-report-ui.js'), 'utf8');

test('the page wiring: a hidden tick stays hidden, and a note says why there is nothing to confirm', () => {
  assert.match(HTML, /\.check\[hidden\]\{display:none\}/);
  assert.match(HTML, /<p id="noStatementsNote" class="small" hidden>No individual verification notes were generated/);
  assert.match(JS, /var none=\$\('noStatementsNote'\);if\(none\)none\.hidden=!!facts\.length\|\|!safe\.source;/);
  // The download still needs the review tick; facts only block when there are open ones.
  assert.doesNotMatch(JS, /if\(safe\.aiDraftReadyForQuery!==\$\('query'\)\.value\.trim\(\)\)throw Error/);
  assert.match(JS, /if\(!safe\.savedQuestionConfirmed\)throw Error/);
  assert.match(HTML, /Normal Growth handoff/);
  assert.match(REPORT_UI, /if\(selectedQuestion\)target\.searchParams\.set\('query',selectedQuestion\)/);
});

test('optional link controls are hidden when no verified URL is available and the intended question survives', () => {
 assert.match(HTML, /id="growthVerifiedLinkFields" hidden/);
 assert.match(HTML, /\.form-grid\[hidden\]\{display:none\}/);
 assert.match(JS, /\$\('growthVerifiedLinkFields'\)\.hidden=!hasLink/);
 assert.doesNotMatch(JS, /a-related-page/);
 assert.match(JS, /auto-research\/saved\?page_id=/);
 assert.match(JS, /exactQuery\?'&query='/);
 assert.doesNotMatch(JS, /void loadSeoProposal/);
 assert.match(JS, /requestedQuestion\?'&query='/);
});

test('single Growth proposal workflow has no Advanced alternative and still requires editor approval',()=>{
 assert.doesNotMatch(HTML,/advancedAlternative|generateEditorialDraft|aiDraftStatus|Advanced ·/);
 assert.doesNotMatch(JS,/generateEditorialDraft|aiDraftStatus|aiDraftReadyForQuery|editor-draft/);
 assert.match(HTML,/Review saved Growth content for the original page/);
 assert.match(HTML,/#download:disabled\{background:#d8dee8/);
 assert.match(HTML,/#download:not\(:disabled\)\{background:#1d4ed8/);
 assert.match(HTML,/id="cmsUnlockHint"/);
 assert.match(JS,/if\(safe\.source===src&&\$\('query'\)\.value\.trim\(\)===exactQuestion\)review\.click\(\)/);
 assert.match(JS,/safe\.savedQuestionConfirmed&&safe\.source&&\$\('title'\)\.value\.trim\(\)/);
 assert.match(JS,/\$\('approved'\)\.checked&&manualReady&&factsChecked/);
 assert.match(JS,/function populateSeoStartingPoint\(\)/);
 assert.match(JS,/if\(!safe\.savedQuestionConfirmed\)return/);
 assert.match(JS,/if\(!\$\('title'\)\.value\.trim\(\)\)\$\('title'\)\.value=meta\.title/);
});

test('in a browser, the hidden "I checked all" tick is not displayed', { skip: !chromium && 'Playwright not installed' }, async () => {
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    // The page markup and styles only (no script, no server): what the browser shows for the hidden attribute.
    await p.setContent(HTML.replace(/<script[\s\S]*?<\/script>/gi, ''));
    assert.equal(await p.$eval('#confirmAllWrap', e => getComputedStyle(e).display), 'none');
    assert.equal(await p.$eval('#noStatementsNote', e => getComputedStyle(e).display), 'none');
    await p.$eval('#confirmAllWrap', e => { e.hidden = false; });
    assert.equal(await p.$eval('#confirmAllWrap', e => getComputedStyle(e).display), 'flex', 'shown when there are statements');
  } finally { await b.close(); }
});

test('a missing CMS query must never be replaced with the Tracker seed or an older saved question', () => {
 assert.match(HTML, /id="savedQuestionChooser"/);
 assert.match(HTML, /id="trackedSeedNote"/);
 assert.match(JS, /function recoverSavedQuestions\(\)/);
 assert.match(JS, /auto-research\/queries\?page_id=/);
 assert.match(JS, /Choose the exact saved customer question first/);
 assert.doesNotMatch(JS, /\$\('query'\)\.value=data\.working_keyword/);
 assert.match(JS, /Even one historical report must be chosen deliberately/);
 assert.match(JS, /history\.replaceState\(null/);
 assert.match(JS, /\$\('researchReviewLink'\)\.href=/);
 assert.match(REPORT_UI, /r\.gap_list\?\.focus_query/);
 assert.match(REPORT_UI, /if\(runMarket\)target\.searchParams\.set\('market',runMarket\)/);
});

test('CMS cannot silently load a different question or carry its old SEO metadata',()=>{
 assert.match(JS,/savedQuestionConfirmed:false/);
 assert.match(JS,/if\(!safe\.savedQuestionConfirmed\|\|!\$\('query'\)\.value\.trim\(\)\)/);
 assert.match(JS,/await recoverSavedQuestions\(\)/);
 assert.doesNotMatch(JS,/\$\('query'\)\.value=data\.working_keyword/);
 assert.doesNotMatch(JS,/if\(!\$\('title'\)\.value&&x\.title\)\$\('title'\)\.value=x\.title/);
 assert.doesNotMatch(JS,/if\(!\$\('meta'\)\.value&&x\.meta\)\$\('meta'\)\.value=x\.meta/);
 assert.match(JS,/\$\('title'\)\.value='';\$\('meta'\)\.value=''/);
 assert.match(JS,/\$\('existingMetadata'\)\.hidden=false/);
 assert.match(JS,/safe\.savedQuestionConfirmed&&safe\.source&&\$\('title'\)\.value\.trim\(\)/);
 assert.match(JS,/\$\('title'\)\.value\.trim\(\)&&\$\('meta'\)\.value\.trim\(\)/);
 assert.match(JS,/Research question changed while loading/);
 assert.match(JS,/Open Growth research for this exact question/);
 assert.match(HTML,/Existing page metadata — reference only/);
 assert.match(HTML,/Meta description draft for this customer question/);
});
