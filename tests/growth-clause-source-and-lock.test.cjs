'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const target='https://contentscale.site/content-at-scale/';
const protectedUrl='https://contentscale.site/';
const report={
 url:protectedUrl,
 growth_decision:{
  primary_next_action:{query:'content scaling'},
  protection:{case_study_locked:true},
  protected_queries:[{query:'content scaling',position:2,clicks:20}]
 },
 verified_editorial_opportunity:{
  verified:true,type:'IMPROVE_EXISTING',focus_query:'content scaling',
  target_url:target,target_section:'Scaling workflow',
  proposed_text:'Document the existing workflow in sequence, including how to review old pages, select an intent, update existing material, verify the result with reliable sources and keep every original strong paragraph.',
  evidence:[{source_url:'https://example.org/guide',excerpt:'Refresh and reuse existing editorial content.'}]
 }
};
const destination={
 status:'COMPARED',target_url:target,own_html_truncated:false,
 comparison_scope:'PARTIAL_SOURCE_NO_ABSENCE_CLAIMS',
 comparisons:[{
  match_status:'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED',
  nearest_existing_section:{heading:'Editorial process',excerpt:'Current content workflow'},
  competitor_url:'https://example.org/guide',competitor_heading:'Reuse content',
  competitor_excerpt:'Refresh and reuse existing editorial content.'
 }]
};
test('incomplete competitor material does not imply truncated destination HTML',()=>{
 const d=decideGrowthEditorialAction({report,destination});
 assert.equal(d.decision,'IMPROVE_EXISTING');
 assert.equal(d.copy_ready,true);
 assert.equal(d.publish_allowed,false);
});
test('case study lock applies to protected tracked page, not distinct destination',()=>{
 const blocked=decideGrowthEditorialAction({report,destination:{...destination,target_url:protectedUrl}});
 assert.equal(blocked.decision,'NO_CHANGE');
});
test('truncated destination HTML remains blocked',()=>{
 const d=decideGrowthEditorialAction({report,destination:{...destination,own_html_truncated:true}});
 assert.equal(d.decision,'DATA_BLOCKED');
 assert.equal(d.blocker_code,'HTML_TRUNCATED');
});
