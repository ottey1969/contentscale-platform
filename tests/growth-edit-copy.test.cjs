'use strict';
// The text an editor copies from a Growth proposal. Real data: report 62 (contentscale.site/content-scaling/).
const test=require('node:test'),assert=require('node:assert/strict');
const {growthEditCopyText}=require('../public/growth-edit-copy.js');
const g=require('./fixtures/growth-report-62/decision.json').editorial_decision_gate;

test('report 62 (real): the copied edit has every change with placement, new H2 and text, and real line breaks',()=>{
 const t=growthEditCopyText(g);
 assert(!t.includes('\\n'),'no literal \\n in the copied text');
 assert.match(t,/^Target page: https:\/\/contentscale\.site\/content-scaling\//);
 assert.match(t,/— Change 1 of 2 —\nAdd as a new section directly after “🔑 The 5-Step GRAAF Workflow”\nNew H2: How Creating a Style Guide Helps Maintain Consistency When Scaling Content\nProposed text:\nCreating a style guide/);
 assert.match(t,/— Change 2 of 2 —\nAdd as a new section directly after “How to Audit Your Content Before You Scale”\nNew H2: How to Outsource Content Creation/);
 assert.match(t,/Organizations can outsource specific parts of content creation/);
 assert.doesNotMatch(t,/Existing passage:/,'no empty "existing passage" for a new section');
 assert.match(t,/Compared with \(a ranking page, not a factual source\): https:\/\/www\.jasper\.ai\/blog\/content-scaling/);
 assert.match(t,/Fact-check: 10 statement\(s\) are not verified by any source/);
 assert.match(t,/Editor approval required\. No automatic publication\.$/);
});

test('a replacement keeps its existing passage; no placement says so instead of inventing one',()=>{
 const t=growthEditCopyText({target_url:'https://x.example/p/',target_section:'Pricing',placement:{mode:'EXTEND_SECTION',section_heading:'Pricing'},existing_passage:'Old text.',proposed_text:'New text.'});
 assert.match(t,/Expand the existing section “Pricing”\nExisting passage:\nOld text\.\nProposed text:\nNew text\./);
 assert.match(growthEditCopyText({proposed_text:'x'}),/Placement: where it fits best \(choose yourself\)/);
});

test('report 62 (real): a draft that is not ready for publication says so first in the copied text',()=>{
 const {publicationReadiness}=require('../src/growth-publication-readiness.cjs');
 const t=growthEditCopyText({...g,publication_readiness:publicationReadiness({decision:g,destinationGsc:require('./fixtures/growth-report-62/decision.json').destination_gsc_evidence})});
 assert.match(t,/^DRAFT FOR REVIEW — NOT READY FOR PUBLICATION\nRequired: 10 statement\(s\)/);
 assert.match(t,/\nRecommended: There are no verified Search Console rows for https:\/\/contentscale\.site\/content-scaling\//);
});
