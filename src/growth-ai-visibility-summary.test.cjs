'use strict';
const assert=require('node:assert/strict');
const {summarizeGrowthAiVisibility}=require('./growth-ai-visibility-summary.cjs');
const page={id:7,tracker_client_id:2};
const rows=[
 {page_id:7,tracker_client_id:2,engine:'chatgpt',revision_cycle:1,brand_recommended:true,citation_urls:['https://example.org/']},
 {page_id:7,tracker_client_id:2,engine:'chatgpt',revision_cycle:2,brand_recommended:false,domain_cited:true,citation_urls:['http://invalid.test','https://credible.org/']},
 {page_id:7,tracker_client_id:99,engine:'copilot',revision_cycle:3,brand_recommended:true},
 {page_id:8,tracker_client_id:2,engine:'claude'}
];
const s=summarizeGrowthAiVisibility({page,rows});
assert.equal(s.status,'OBSERVATIONS_AVAILABLE');
assert.equal(s.engines.length,1);
assert.equal(s.engines[0].revision_cycle,2);
assert.equal(s.engines[0].recommended,false);
assert.equal(s.engines[0].domain_cited,true);
assert.deepEqual(s.engines[0].citation_urls,['https://credible.org/']);
assert.equal(s.competitor_gaps_verified,false);
assert.equal(s.automatic_draft_allowed,false);
assert.equal(summarizeGrowthAiVisibility({page,rows:[]}).status,'NO_AI_OBSERVATIONS');
console.log('PASS: scoped latest-cycle AI visibility summary; 9 assertions');
