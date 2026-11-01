'use strict';
// Owner 2026-11-01: the CMS package preselected "Verified" because the page had a verified Search Console row for some
// query, then refused with VERIFIED_GSC_EVIDENCE_NOT_FOUND for the working query. Rows here are synthetic (labelled).
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeHandoffFromResearch}=require('../src/growth-research-handoff-suggestions.cjs');
const URL_='https://contentscale.site/content-scaling/';
const report=rows=>({success:true,url:URL_,page_content:{headings:{}},growth_decision:{primary_next_action:{query:'content scaling'}},search:{focus_query:'content scaling',verified_queries:rows}});
test('"verified" only for a verified row of the working query itself',()=>{
 assert.equal(proposeHandoffFromResearch(report([{query:'contentscale'}]),URL_).verified_query,false,'a row for another query is not evidence for this one');
 assert.equal(proposeHandoffFromResearch(report([{query:'Content Scaling '}]),URL_).verified_query,true);
 assert.equal(proposeHandoffFromResearch(report([]),URL_).verified_query,false);
 assert.deepEqual(proposeHandoffFromResearch(report([{query:'contentscale'},{query:'Content Scaling '}]),URL_).verified_queries,['contentscale','content scaling'],'the page compares with the query in its field');
});
test('the package page falls back to "Observed" when the server finds no verified row, and says so',()=>{
 const js=require('fs').readFileSync(require.resolve('../public/growth-cms-neutral-handoff.js'),'utf8');
 assert.match(js,/'VERIFIED_GSC_EVIDENCE_NOT_FOUND'[^\n]*\n\s*\$\('evidence'\)\.value='observed'/);
 assert.match(js,/so the package makes no Search Console claim/);
});
