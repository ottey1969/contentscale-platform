'use strict';
const assert=require('node:assert/strict');
const {buildGrowthPracticalBrief}=require('./growth-practical-brief.cjs');
const report={
 url:'https://example.com/',
 page_content:{headings:{title:'Content scaling guide',h2:['How to scale content']}},
 growth_decision:{primary_next_action:{query:'content scaling'},protection:{case_study_locked:true}},
 search:{verified_queries:[{query:'content scaling',impressions:3943,clicks:2,position:12.7}]},
 competitors:{live_reviewed:[{url:'https://competitor.example/scaling',title:'Content Scaling Strategy',
  retrieved_at:'2026-10-19T00:00:00Z',h2:['Measuring Content Scaling Success and ROI'],
  observed_focus_section:{heading:'Measuring Content Scaling Success and ROI',
    excerpt:'Measure each content investment against the outcomes of its audience.'}}]}
};
const html='<html><h2>How to scale content</h2><p>Map search intent, review pages, and measure performance for content scaling carefully.</p></html>';
const result=buildGrowthPracticalBrief({report,html});
assert.equal(result.change.copy_ready,false);
assert.deepEqual(result.change.ready_to_review_text,[]);
assert.equal(result.change.type,'VERIFY_SPECIFIC_EXISTING_ANSWER_AGAINST_COMPETITOR');
assert.equal(result.change.specific_evidence_review.competitor_url,'https://competitor.example/scaling');
assert.equal(result.change.specific_evidence_review.verified_gap,false);
assert.equal(result.guard.can_publish,false);
const withoutRival=buildGrowthPracticalBrief({report:{...report,competitors:{live_reviewed:[]}},html});
assert.equal(withoutRival.change.copy_ready,false);
assert.equal(withoutRival.change.type,'VERIFY_INTENT_BEFORE_CONTENT_CHANGE');
assert.deepEqual(withoutRival.change.ready_to_review_text,[]);
console.log('PASS Growth comparison evidence gate prevents template copy and preserves case-study lock');
