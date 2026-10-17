'use strict';
const assert=require('node:assert/strict');
const {readerJourney}=require('./growth-reader-journey.cjs');
const base={
 url:'https://example.com/',
 case_study_locked:true,
 growth_decision:{
  protection:{preserve_existing_top_rankings:true,case_study_locked:true},
  primary_next_action:{query:'content scaling'}},
 site_architecture:{candidates:[{url:'https://example.com/content-at-scale/',evidence:'TRACKER_SITE_INVENTORY'}]}
};
const result=readerJourney({report:base,plan:{focus_query:'content scaling'}});
assert.equal(result.stages.length,7);
assert.equal(result.growth_route.code,'PROTECT_PAGE_EXPAND_SITE');
assert.equal(result.safeguards.automatic_publication_allowed,false);
assert.equal(result.safeguards.case_study_locked,true);
assert.equal(result.growth_route.existing_pages_to_check.length,1);
assert.match(result.outcome_contract,/practical result/);
assert.match(result.growth_route.spoke_policy,/distinct live search intent/);
const withoutGsc=readerJourney({report:{url:'https://example.com/page/',growth_decision:{protection:{}}}});
assert.equal(withoutGsc.growth_route.needs_evidence,true);
assert.equal(withoutGsc.growth_route.alternative,'RESEARCH_JUSTIFIED_SPOKE');
console.log('growth reader journey contract: OK');
