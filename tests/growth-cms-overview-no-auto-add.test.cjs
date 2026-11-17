'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
test('proposal is not inserted automatically into CMS copy fields',()=>{
 const section=js.slice(js.indexOf('async function loadProposal(src)'),js.indexOf('function esc(',js.indexOf('async function loadProposal(src)')));
 const review=section.indexOf("review.addEventListener('click',function()");
 const fill=section.indexOf("safe.proposal=p;");
 assert.ok(review>0&&fill>review,'proposal only accepted on explicit review click');
 assert.ok(section.indexOf("var summary=document.createElement('strong')")<review);
 assert.match(section,/Skip this draft · write verified content myself/);
 assert.match(section,/safe\.proposal=null;box\.hidden=true/);
 assert.match(section,/Review proposed text and claims/);
});
test('old concepts do not interrupt the primary path or imply missing topics',()=>{
 const section=js.slice(js.indexOf('function renderEarlier(list)'),js.indexOf('function mergedReview(main)'));
 assert.match(section,/var history=document\.createElement\('details'\)/);
 assert.match(section,/Advanced · Older saved concepts/);
 assert.match(section,/do not prove any current content gap/);
 assert.match(section,/history\.appendChild\(intro\);concepts\.forEach\(function\(p\)\{row\(p,history\)\}/);
 assert.doesNotMatch(section,/box\.appendChild\(intro\);concepts\.forEach\(function\(p\)\{row\(p,box\)\}/);
});
test('no automatic approval or false guarantee about verified competitors and roofing safety',()=>{
 assert.match(js,/NOT independently verified/);
 assert.match(js,/not a verified content gap or fact-checked article/);
 assert.match(js,/Roofing work on wet or damaged roofs must be left to qualified professionals/);
 assert.match(js,/Status: previously selected writing concept — not independently verified/);
 assert.match(html,/Proposed H2 heading · approve before publication/);
 assert.match(html,/Reviewed copy \(at least 30 characters/);
 assert.match(html,/Existing Growth research and the CMS package do not require it/);
 assert.doesNotMatch(html,/Fact-checked copy \(at least 30 characters\)/);
});
