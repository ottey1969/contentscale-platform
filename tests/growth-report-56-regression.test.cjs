'use strict';
// Owner review of production Growth report 56 (page 2324, International SEO): the claim check rejected a correct
// technical sentence because of "200" in "non-200 status codes". The sentence below is quoted from that review.
// Technical notation is not a statistic; real figures, money and years next to a figure stay checked.
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {normalizeDraft}=require('../src/growth-source-grounded-editor.cjs');
const REPORT_56='Verify that redirected pages or non-200 status codes are not receiving targeted international impressions.';
const codes=t=>assessDraftClaims({text:t}).violations.map(v=>v.code);

test('report 56: an HTTP status code is technical notation, not an unsourced statistic',()=>{
 assert.deepEqual(codes(REPORT_56),[]);
 for(const t of ['Check that each URL returns HTTP 200 and that 301 redirects point to the right language version.',
  'Fix 404 errors and 500 responses before you add new language versions.','Use UTF-8 encoding and an H2 heading per market.'])assert.deepEqual(codes(t),[],t);
 // The writer's own number check agrees, so the section is not sent back for a rewrite.
 const draft=JSON.stringify({sections:[{task_code:'task_perfor',h2:'How to measure international SEO performance',paragraphs:[REPORT_56+' Compare impressions per market every month.']}]});
 assert.equal(normalizeDraft(draft,'',"international seo",{requireTitle:false,taskTerms:['perfor']}).status,'AI_DRAFT_REVIEW_REQUIRED');
});

test('real figures stay checked: percentages, counts and a year attached to a figure',()=>{
 assert(codes('About 68% of companies never localise their pages.').includes('UNSOURCED_NUMBER'));
 assert(codes('In 2025, 40 markets adopted the rule.').includes('UNSOURCED_NUMBER'));
 assert(codes('A 200 page site needs a sitemap per market.').includes('UNSOURCED_NUMBER'),'"200 page site" is a count, not a status code');
});
