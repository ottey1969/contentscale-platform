'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
test('No GSC does not erase international SEO focus or block observed destination comparisons',()=>{
 const report={url:'https://contentscale.site/international-seo/',search:{focus_query:'international seo'},search_discovery:{target_query:'international seo'},growth_decision:{primary_next_action:{query:null,metrics:null}}};
 const destination={target_url:report.url,status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY',comparisons:[{
  competitor_url:'https://moz.com/learn/seo/international-seo',competitor_heading:'What is international SEO?',
  nearest_existing_section:{heading:'What Is International SEO & Why It Matters for NL, UK, BE & LU'},
  match_status:'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'
 }]};
 const d=decideGrowthEditorialAction({report,destination});
 assert.equal(d.focus_query,'international seo');assert.equal(d.decision,'REVIEW_EXISTING');
 assert.equal(d.exact_page_query_metrics_verified,false);assert.equal(d.gsc_optional,true);
 assert.equal(d.copy_ready,false);assert.equal(d.verified_gap,false);
});
test('Without GSC and without readable competitor passages, preserve topic but do not invent gap',()=>{
 const report={url:'https://contentscale.site/ai-content-detectors/',search:{focus_query:'ai content detectors'},growth_decision:{primary_next_action:{query:null,metrics:null}}};
 const d=decideGrowthEditorialAction({report,destination:{target_url:report.url,status:'NO_COMPARABLE_COMPLETE_SECTIONS',comparisons:[]}});
 assert.equal(d.focus_query,'ai content detectors');assert.equal(d.decision,'DATA_BLOCKED');
 assert.equal(d.publish_allowed,false);
});
