'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
const routes=fs.readFileSync('src/tracker-growth-cms-export.cjs','utf8');
test('obsolete warning can be dismissed; the corresponding yellow must-confirm checkbox is removed',()=>{
 assert.match(ui,/Dismiss obsolete warning — sentence not in draft/);
 assert.match(ui,/NOT_IN_TEXT_ANYMORE/);
 assert.match(ui,/function retireAbsentFlag\(box,sentence\)/);
 assert.match(ui,/label\.dataset\.flaggedSentence===key\)label\.remove\(\)/);
 assert.match(ui,/checkItem\(currentChecks,[\s\S]*?f\.sentence\)/);
 assert.match(ui,/checkItem\(box,item,match&&match\.sentence\)/);
 assert.match(routes,/NOT_IN_TEXT_ANYMORE/);
});
test('warns on ungrounded Florida/NJ mismatch in an older concept and prevents adding it',()=>{
 assert.match(ui,/function unrelatedGeography\(p\)/);
 assert.match(ui,/if\(nj&&!fl&&\/\\bflorida\\b\/i\.test\(content\)\)/);
 assert.match(ui,/if\(mismatchedRegion\)\{status\('downloadStatus'/);
 assert.match(ui,/b\.disabled=true;b\.textContent='Different market — new research required'/);
});
test('an added older concept is fully removable from both editor sections and review checks',()=>{
 assert.match(ui,/Remove this concept from CMS package/);
 assert.match(ui,/safe\.added=safe\.added\.filter/);
 assert.match(ui,/node\.dataset\.proposalId===String\(p\.id\)\)node\.remove/);
 assert.match(ui,/currentChecks\.textContent=''/);
 assert.match(ui,/orphanRemove\.remove\(\)/);
 assert.match(ui,/goToCmsDownload\(\)/);
});
test('a removal is stored only when server accepts; ZIP route remains available after review',()=>{
 assert.match(ui,/if\(!r\.ok\)return false/);
 assert.match(ui,/if\(serverRemoved\.indexOf\(sentence\)<0\)serverRemoved\.push/);
 assert.match(ui,/if\(!savedAbsent\)/);
 assert.match(ui,/Review requirements → Download CMS package/);
 assert.match(html,/id="download"/);
 assert.match(ui,/function goToCmsDownload\(/);
 assert.match(ui,/removedSentences\(\)\.includes\(f\.sentence\)/);
});
test('Earlier concept remains optional and never automatically publishes to WordPress',()=>{
 assert.match(ui,/Add to this package/);
 assert.match(ui,/safe\.added\.some/);
 assert.match(html,/CMS handoff ZIP/);
 assert.match(html,/After you publish the approved changes in your own CMS/);
});
