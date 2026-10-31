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
