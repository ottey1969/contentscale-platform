'use strict';
// Production acceptance of Growth reports against the owner's five criteria. Real data: reports 62, 63, 64, 66, 67.
const test=require('node:test'),assert=require('node:assert/strict');
const {checkReport,compareRuns}=require('../src/growth-acceptance.cjs');
const {nextStepFor}=require('../src/growth-editorial-decision-gate.cjs');
const R=require('./fixtures/growth-acceptance/reports-62-67.json');
const st=(r,id)=>(r.checks.find(c=>c.id===id)||{}).status;

test('report 66 (real, before this change): "resolve the named blocker" is not a next step → not accepted',()=>{
 const r=checkReport(R['66'],{expectMarkets:['US']});
 assert.equal(r.verdict,'NOT_ACCEPTED');assert.equal(st(r,'5_NEXT_STEP'),'FAIL');
 assert.equal(st(r,'MARKET'),'FAIL','researched in NL, the owner wants the US');
 assert.equal(st(r,'SEARCH_RESULTS_LOST'),'WARN');
 assert.equal(st(r,'1_NO_CROSS_FIELD'),'NOT_SHOWN','no AI subject check in reports before #241');
});

test('the gate now names a step the owner can take, with the lost Google results (report 66, real search data)',()=>{
 const step=nextStepFor('SERP_INTENT_EVIDENCE',R['66']);
 assert.match(step,/Run it again with the target market where your customers search, or with a more specific search term/);
 assert.match(step,/12 Google result\(s\) in NL could not be opened .* \(more than the usable ones\)/);
 const fixed={...R['66'],editorial_decision_gate:{...R['66'].editorial_decision_gate,next_action:step}};
 assert.equal(st(checkReport(fixed),'5_NEXT_STEP'),'PASS');
});

test('reports 62–67 (real): proposals are concrete, nothing unproven is publishable, task-check blocks keep a next step',()=>{
 const r63=checkReport(R['63']);assert.equal(st(r63,'3_CONCRETE_PROPOSAL'),'PASS');assert.equal(st(r63,'4_NO_UNPROVEN_PUBLICATION'),'PASS');
 assert.equal(st(checkReport(R['62']),'4_NO_UNPROVEN_PUBLICATION'),'NOT_SHOWN','10 unverified statements and no readiness stated (before #234)');
 assert.equal(st(checkReport(R['64']),'5_NEXT_STEP'),'PASS');
 assert.equal(st(checkReport(R['67']),'5_NEXT_STEP'),'PASS');
 assert.equal(checkReport(R['63']).verdict,'NOT_PROVEN_BY_THIS_REPORT','criterion 1 is not shown, so nothing is called accepted');
});

test('criterion 2: the same pages read must give the same decision; different pages read is reported, not failed',()=>{
 const runs=compareRuns([R['63'],R['64']]);
 assert.equal(runs.length,1);assert.equal(runs[0].status,'DIFFERENT_EVIDENCE');assert.match(runs[0].detail,/IMPROVE_EXISTING \/ NO_CHANGE/);
 // LABELLED SYNTHETIC: report 64 with the pages of report 63 read but its own decision.
 const same={...R['64'],search_discovery:{...R['64'].search_discovery,competitor_fetch_log:R['63'].search_discovery.competitor_fetch_log}};
 assert.equal(compareRuns([R['63'],same])[0].status,'FAIL');
});

test('criteria 1 and 4 fail when broken (LABELLED SYNTHETIC changes to report 63)',()=>{
 const cross={...R['63'],serp_meaning:{status:'DIFFERENT_MEANING',basis:'AI_SUBJECT_CHECK_OF_READ_RANKING_PAGES'}};
 assert.equal(st(checkReport(cross),'1_NO_CROSS_FIELD'),'FAIL');
 const auto={...R['63'],editorial_decision_gate:{...R['63'].editorial_decision_gate,publish_allowed:true}};
 assert.equal(st(checkReport(auto),'4_NO_UNPROVEN_PUBLICATION'),'FAIL');
 const ok={...R['63'],competitor_overview:{...R['63'].competitor_overview,subject_check:{status:'SAME_SUBJECT_OR_UNCLEAR',pages:[{host:'jasper.ai',same_subject:'YES'}],different:0,of:3}}};
 assert.equal(checkReport(ok).verdict,'ACCEPTED');
});
