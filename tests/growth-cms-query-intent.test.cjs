'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {sameIntent,tokens}=require('../src/growth-cms-query-intent.cjs');
test('chosen 24 hour emergency roof repair includes valid editorial shorter term',()=>{
 for(const q of ['24 hours emergency roof repair','24 hour emergency roof repair NJ','24/7 emergency roof repair','How urgent is roof repair?'])
  assert.equal(sameIntent('emergency roof repair',q),true,q);
});
test('a roof leak is related but not a replacement for emergency repair search',()=>{
 for(const q of ['roof leak','roof leak repair','fix roof leaks','roof replacement cost','preventative maintenance'])
  assert.equal(sameIntent('emergency roof repair',q),false,q);
});
test('CMS package preserves selected question, matching latest proposal and rejects old additions',()=>{
 const route=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 const exportCode=fs.readFileSync('src/tracker-growth-cms-export.cjs','utf8');
 const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
 assert.match(route,/growth\/cms-export\?page_id=/);
 assert.match(route,/encodeURIComponent\(String\(req\.query\.query\)/);
 assert.match(exportCode,/aligned=all\.filter\(x=>sameIntent\(x\.focus_query,wanted\)\)/);
 assert.match(exportCode,/const p=aligned\[0\]\|\|null/);
 assert.match(exportCode,/LEGACY_PROPOSAL_ADDITIONS_NOT_SUPPORTED/);
 assert.match(exportCode,/if\(!sameIntent\(p\.focus_query,req\.body\?\.focus_query\)\)/);
 assert.match(ui,/requestedQuestion/);
 assert.match(ui,/var exactQuestion=/);
 assert.doesNotMatch(ui,/renderEarlier\(/);
});
test('a long combined fact-check string is split into separate confirmations',()=>{
 const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
 assert.match(ui,/function reviewStatements\(item\)/);
 assert.match(ui,/units\.length>1\?units/);
 assert.match(ui,/bits\.forEach\(function\(bit\)/);
 assert.match(ui,/NOT independently verified/);
});
