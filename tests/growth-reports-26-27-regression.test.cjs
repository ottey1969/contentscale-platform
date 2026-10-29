'use strict';
// Regressions from production reports 26 and 27 (2026-10-29, after PR #199). Fixtures are verbatim subsets.
//  - Report 26: a "task" was built from a competitor's own company section ("The Facts on Four Seasons Roofing and
//    Construction", host 4seasons-construction.com): the digit in the domain hid the brand from the promotional filter.
//  - Report 27: the destination (/24-hour-emergency-roof-repair-nj/) is itself a locked Case Study, but the missing shared
//    task was reported as the primary blocker; protection must come first, the research gap as a limitation.
const test=require('node:test'),assert=require('node:assert/strict');
const r26=require('./fixtures/growth-reports-11-12/report-26-prt-wind-tasks.json');
const r27=require('./fixtures/growth-reports-11-12/report-27-prt-home-after-199.json');
const {isPromotionalSection}=require('../src/growth-derived-reader-tasks.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
test('R26: a competitor section about the competitor itself is promotional even when its domain spells a number with digits',()=>{
 const t=r26.reader_task_coverage.tasks.find(x=>x.code==='task_season');assert(t,'the production task is in the fixture');
 const own=t.competitor_support.find(x=>x.host==='4seasons-construction.com');
 const others=t.competitor_support.filter(x=>x!==own).map(x=>(x.heading+' '+x.excerpt).toLowerCase()).join(' ');
 assert.equal(isPromotionalSection({heading:own.heading,text:own.excerpt},own.host,others),true);
 const neutral=t.competitor_support.find(x=>x.host!=='4seasons-construction.com');
 assert.equal(isPromotionalSection({heading:neutral.heading,text:neutral.excerpt},neutral.host,(own.heading+' '+own.excerpt).toLowerCase()),false,'the real pre-season advice stays');
 assert.equal(isPromotionalSection({heading:'Why 3M tape matters',text:'x'},'roofer.example',''),false,'digits elsewhere change nothing');
});
test('R27: a locked destination is the primary outcome; the missing shared task is a separate research limitation',()=>{
 assert.equal(r27.editorial_decision_gate.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS','production outcome before the fix');
 const destination={...r27.destination_section_comparison,destination_identity:{...r27.destination_section_comparison.destination_identity,
  destination_locked:true,destination_protected:true,locked_url:r27.destination_section_comparison.target_url}};
 const d=decideGrowthEditorialAction({report:r27,destination,coverage:r27.reader_task_coverage,serpIntent:r27.serp_intent,destinationIntent:r27.destination_intent,attempts:r27.editorial_decision_gate.attempted_sources});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
 assert.match(d.missing_evidence[0].detail,/is itself a locked Case Study page/);
 assert.deepEqual(d.research_limitations.map(x=>x.code),['SHARED_COMPETITOR_REQUIREMENTS']);
 assert.equal(d.evidence_status.label,'CASE_STUDY_PROTECTED_NO_CHANGE_REQUIRED');
 // Unprotected, the same evidence still reports the shared-task gap as the blocker.
 const open=decideGrowthEditorialAction({report:r27,destination:{...destination,destination_identity:null},coverage:r27.reader_task_coverage,serpIntent:r27.serp_intent,destinationIntent:r27.destination_intent,attempts:[]});
 assert.equal(open.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
});
