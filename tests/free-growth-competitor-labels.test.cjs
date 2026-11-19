'use strict';
// Owner 2026-11-19 (PRT emergency roof repair): the competitor heading list said "Not on your page (heading words)" for
// almost every heading, while the topic comparison of the same research (by meaning, not words) had found those topics
// on the page. The list must follow the topic comparison and only fall back to heading words when a heading was not
// compared, saying so honestly.
const test=require('node:test'),assert=require('node:assert/strict');
const {competitorsOf}=require('../src/growth-free/routes.cjs');
const f=require('./fixtures/free-growth-prt-emergency/check.json');

test('PRT (real): headings the topic comparison found on the page are not labelled missing',()=>{
 const c=competitorsOf(f.report,f.summary.gaps);
 const all=c.pages.flatMap(p=>p.headings.map(h=>({site:p.site,...h})));
 assert.ok(all.length>20,'the read pages and their headings are listed');
 const byText=t=>all.find(h=>h.text===t);
 // Grouped as YES in the topic comparison (“Emergency roof tarping and temporary weather protection”, “Actions to take while waiting”).
 const tarp=byText('Do you offer emergency roof tarping in NJ?');
 assert.equal(tarp.status,'ON_YOUR_PAGE');assert.match(tarp.label,/3\. Emergency tarping and mitigation/);
 assert.equal(byText('What Can You Do While Waiting for a Roofer to Arrive?').status,'ON_YOUR_PAGE');
 // Grouped as NO: still missing, and said so by the topic comparison.
 const warranty=all.find(h=>/Roof Warranty Explained/.test(h.text));
 assert.equal(warranty.status,'MISSING');assert.match(warranty.label,/topic comparison/i);
 // Not compared by topic: never the definite "Not on your page".
 for(const h of all.filter(h=>h.basis==='HEADING_WORDS'))assert.doesNotMatch(h.label,/^Not on your page/,'honest label for '+h.text);
 const missing=all.filter(h=>h.status==='MISSING'&&h.basis==='TOPIC_COMPARISON').map(h=>h.text);
 assert.ok(missing.length<=4,'only what the comparison found missing: '+JSON.stringify(missing));
});
