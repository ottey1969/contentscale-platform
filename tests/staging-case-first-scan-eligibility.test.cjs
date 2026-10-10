'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateFirstManualCaseScan,ENGINES}=require('../src/staging/case-first-scan-eligibility.cjs');
function valid(){return {page:{case_study_active:true,check_frequency:'0',manual_done:true,brief_content:{historical:true}},caseStudy:{status:'active',baseline_locked:true,baseline_at:'2026-10-10T10:00:00Z'},latestSnapshotAt:'2026-08-18T10:00:00Z',selectedEngines:[...ENGINES]};}
test('scheduler off and old Done/Brief do not preclude first manual cycle scan',()=>assert.equal(evaluateFirstManualCaseScan(valid()).allowed,true));
test('0/5 completed checks differs from five configured engines',()=>{const x=valid();x.page.ai_checked=0;assert.equal(evaluateFirstManualCaseScan(x).allowed,true);});
test('requires five configured engines',()=>{const x=valid();x.selectedEngines=[];assert.equal(evaluateFirstManualCaseScan(x).reason,'five_engines_not_configured');});
test('rejects repeated scan after new baseline',()=>{const x=valid();x.latestSnapshotAt='2026-10-10T11:00:00Z';assert.equal(evaluateFirstManualCaseScan(x).reason,'already_scanned_this_case_cycle');});
test('preserves evidence checkpoint',()=>{const x=valid();x.page.monitoring_waiting_input=true;assert.equal(evaluateFirstManualCaseScan(x).reason,'evidence_checkpoint_pending');});
test('requires baseline lock',()=>{const x=valid();x.caseStudy.baseline_locked=false;assert.equal(evaluateFirstManualCaseScan(x).reason,'baseline_not_locked');});
test('cannot bypass published revision',()=>{const x=valid();x.page.current_revision_published_at='2026-10-10T11:00:00Z';assert.equal(evaluateFirstManualCaseScan(x).reason,'live_revision_after_baseline');});
test('case must be active',()=>{const x=valid();x.page.case_study_active=false;assert.equal(evaluateFirstManualCaseScan(x).reason,'case_not_active');});
