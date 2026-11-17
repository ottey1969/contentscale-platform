'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
const routes=fs.readFileSync('src/tracker-growth-cms-export.cjs','utf8');
test('current selected proposal retains persisted remove and obsolete-warning controls',()=>{
 assert.match(ui,/Dismiss obsolete warning — sentence not in draft/);
 assert.match(ui,/NOT_IN_TEXT_ANYMORE/);
 assert.match(ui,/function retireAbsentFlag\(box,sentence\)/);
 assert.match(ui,/label\.dataset\.flaggedSentence===key\)label\.remove\(\)/);
 assert.match(ui,/checkItem\(box,item,match&&match\.sentence\)/);
 assert.match(routes,/NOT_IN_TEXT_ANYMORE/);
});
test('previous proposal picker and its optional add buttons no longer exist',()=>{
 assert.doesNotMatch(ui,/function renderEarlier\(|function unrelatedGeography\(|safe\.added|Remove this concept from CMS package|Add to this package/);
 assert.doesNotMatch(html,/id="growthEarlier"/);
 assert.match(routes,/LEGACY_PROPOSAL_ADDITIONS_NOT_SUPPORTED/);
});
test('server acknowledged warning dismissal and reviewed package ZIP still work',()=>{
 assert.match(ui,/if\(!r\.ok\)return false/);
 assert.match(ui,/if\(serverRemoved\.indexOf\(sentence\)<0\)serverRemoved\.push/);
 assert.match(ui,/if\(!savedAbsent\)/);
 assert.match(html,/id="download"/);
 assert.match(ui,/removedSentences\(\)\.includes\(f\.sentence\)/);
});
test('only approved current draft can be exported for human publication',()=>{
 assert.match(ui,/Review proposed text and claims/);
 assert.match(ui,/safe\.proposal=p/);
 assert.match(html,/CMS handoff ZIP/);
 assert.match(html,/After you publish the approved changes in your own CMS/);
});
