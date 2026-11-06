'use strict';
// CMS package page: with no statement to confirm (for example an AI-assisted draft that passed the server checks), the
// tick "I checked all 0 statements" must not appear: it could not be ticked and looked like a blocker. The cause was a
// CSS rule (.check{display:flex}) that overrode the hidden attribute. Checked in a real browser; skips without Playwright.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const HTML = fs.readFileSync(path.join(__dirname, '../public/growth-cms-neutral-handoff.html'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, '../public/growth-cms-neutral-handoff.js'), 'utf8');

test('the page wiring: a hidden tick stays hidden, and a note says why there is nothing to confirm', () => {
  assert.match(HTML, /\.check\[hidden\]\{display:none\}/);
  assert.match(HTML, /<p id="noStatementsNote" class="small" hidden>No statement needs a separate tick:/);
  assert.match(JS, /var none=\$\('noStatementsNote'\);if\(none\)none\.hidden=!!facts\.length\|\|!safe\.source;/);
  // The download still needs the review tick; facts only block when there are open ones.
  assert.match(JS, /\$\('download'\)\.disabled=!!safe\.exported\|\|!\(safe\.source&&\$\('approved'\)\.checked&&manualReady&&factsChecked\);/);
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
