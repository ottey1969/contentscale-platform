'use strict';
// Reviewable is not publishable. Real data: report 62 (contentscale.site/content-scaling/, 10 unverified statements,
// no verified Search Console rows for the target page).
const test=require('node:test'),assert=require('node:assert/strict');
const {publicationReadiness}=require('../src/growth-publication-readiness.cjs');
const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
const f=require('./fixtures/growth-report-62/decision.json');

test('report 62 (real): copy_ready (reviewable) but not ready for publication: 10 statements to check, no target-page baseline',()=>{
 const g=f.editorial_decision_gate,r=publicationReadiness({decision:g,destinationGsc:f.destination_gsc_evidence});
 assert.equal(g.copy_ready,true);
 assert.equal(r.status,'NOT_READY_FOR_PUBLICATION');assert.equal(r.ready_for_publication,false);
 assert.deepEqual(r.blockers.map(b=>[b.code,b.required]),[['UNVERIFIED_STATEMENTS',true],['NO_TARGET_PAGE_BASELINE',false]]);
 assert.equal(r.blockers[0].count,10);
 assert.match(r.blockers[1].detail,/https:\/\/contentscale\.site\/content-scaling\/ and "content scaling"/);
 assert.match(r.blockers[1].action,/Search Console is optional/,'GSC stays optional');
 assert.equal(r.blockers.filter(b=>b.code==='CASE_STUDY_LOCKED').length,0,'the locked homepage is not the target');
 const pkg=buildOwnerHandoffPackage({report:{},decision:{...g,decision:'IMPROVE_EXISTING',evidence_status:{},publication_readiness:r}}).markdown;
 assert.match(pkg,/## Publication readiness\n\n\*\*Draft for review — not ready for publication\.\*\*/);
 assert.match(pkg,/Required: 10 statement\(s\) in the proposed text are not verified by any source\./);
});

test('checked text with a baseline: ready for the owner\'s approval, never published automatically',()=>{
 const r=publicationReadiness({decision:{proposed_text:'x',claim_review:{counts:{general_statement_unverified:0}}},destinationGsc:{status:'EXACT_QUERY_VERIFIED'}});
 assert.equal(r.status,'READY_FOR_OWNER_APPROVAL');assert.equal(r.ready_for_publication,false);assert.match(r.note,/nothing is published automatically/);
 assert.equal(publicationReadiness({decision:{}}).status,'NO_PROPOSAL');
});

test('report 62 (real decision): the Search Console import per country is the target page own starting point',()=>{
 // LABELLED SYNTHETIC country rows for /content-scaling/ (the real import has rows per page, term and country).
 const rows=[{page_url:'https://contentscale.site/content-scaling/',query:'content scaling',country:'US',impressions:146,clicks:0,position:18,start_date:'2026-09-30',end_date:'2026-10-28'},
  {page_url:'https://contentscale.site/content-scaling/',query:'content scaling',country:'GB',impressions:40,clicks:1,position:12,start_date:'2026-09-30',end_date:'2026-10-28'},
  {page_url:'https://contentscale.site/',query:'content scaling',country:'US',impressions:900,clicks:0,position:9,start_date:'2026-09-30',end_date:'2026-10-28'}];
 const g=f.editorial_decision_gate,r=publicationReadiness({decision:g,destinationGsc:f.destination_gsc_evidence,countryRows:rows});
 assert(!r.blockers.some(b=>b.code==='NO_TARGET_PAGE_BASELINE'),'the page has its own dated numbers');
 assert.equal(r.baseline.impressions,186,'only /content-scaling/, never the homepage rows');
 assert.match(r.baseline.note,/content-scaling\/ for “content scaling” from the Search Console import per country \(2026-09-30 – 2026-10-28\): 186 impressions, 1 clicks/);
 assert.equal(r.status,'NOT_READY_FOR_PUBLICATION','the 10 unverified statements still block');
 const pkg=buildOwnerHandoffPackage({report:{},decision:{...g,decision:'IMPROVE_EXISTING',evidence_status:{},publication_readiness:r}}).markdown;
 assert.match(pkg,/## Starting point\n\n.*186 impressions[\s\S]*- US: 146 impressions, 0 clicks, position 18/);
});
