'use strict';
// The Brief states what to do first (owner 2026-11-14: "I nowhere see what to do, expand or new page"). The decision opens
// both the visual Brief and the copied text; before, it sat under "What we checked" and was missing from the copied text.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

function loadRender() {
  const a = SRC.indexOf('function renderPrewriteBrief(b) {');
  let j = SRC.indexOf('{', a), d = 0;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && !--d) break; }
  const fn = SRC.slice(a, j + 1);
  assert.ok(!fn.includes('${'));
  const client = new Function('return `' + fn.replace(/`/g, '\\`') + '`')(); // as the browser receives it
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Function('esc', 'var _pwbCurrentBriefId=null,_pwbCurrentBrief=null,_lastPrewriteBriefExternalText="",_lastPrewriteBriefText="";' + client
    + ';return function(b){var h=renderPrewriteBrief(b);return {html:h,text:_lastPrewriteBriefExternalText,owner:_lastPrewriteBriefText};};')(esc);
}

test('expand: the decision and the existing URL open the Brief and the copied text', () => {
  const r = loadRender()({ keyword: 'precio consultor geo', language: 'es',
    content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: 'https://es.contentscale.site/consultor-geo/', reason: 'TEST reason' },
    meta_package: { url_slug: '/consultor-geo/', seo_title: 'T' }, what_we_checked: { query_tested: 'q', checked_at: 'now', generation_usage: { calls: [{ label: 'full_brief' }] } } });
  assert.match(r.owner.split('\n')[0], /^WHAT TO DO: EXPAND/, 'the owner copy also starts with the decision');
  assert.ok(r.owner.indexOf('GEMINI USAGE') > r.owner.indexOf('WHAT TO DO'));
  assert.doesNotMatch(r.text, /GEMINI USAGE/, 'telemetry still stays out of the text for writing AIs');
  assert.match(r.text.split('\n')[0], /^WHAT TO DO: EXPAND THE EXISTING PAGE https:\/\/es\.contentscale\.site\/consultor-geo\/ - add the missing sections there; do not create a new URL\.$/);
  assert.equal(r.text.split('\n')[1], 'Why: TEST reason');
  assert.ok(r.html.indexOf('pwbWhatToDo') > 0 && r.html.indexOf('pwbWhatToDo') < r.html.indexOf('What We Actually Checked'), 'decision above What we checked');
});

test('new page: the slug is named; no decision means no line', () => {
  const render = loadRender();
  const r = render({ keyword: 'x', content_decision: { recommended_treatment: 'CREATE_NEW_PAGE', closest_existing_url: 'none' }, meta_package: { url_slug: 'tarifas-geo' } });
  assert.equal(r.text.split('\n')[0], 'WHAT TO DO: CREATE A NEW PAGE at /tarifas-geo.');
  assert.doesNotMatch(render({ keyword: 'x', meta_package: { url_slug: 'a' } }).text, /WHAT TO DO/);
});
