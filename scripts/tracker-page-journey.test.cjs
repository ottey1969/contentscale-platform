'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspect}=require('../src/tracker-page-journey.cjs');
const baseline='2026-10-07T10:00:00Z';
const before='2026-10-01T10:00:00Z';
const after='2026-10-09T10:00:00Z';
const p={id:20,case_study_active:true,case_study:{baseline_at:baseline},
  manual_done_at:'2026-10-08T12:00:00Z',check_frequency:'0',
  brief_content:{outstanding_actions:3,cycle_id:'cycle-before'},
  brief_evaluated_at:before,last_checked_at:before,
  implementation_status:'open'};
let j=inspect(p);
assert.equal(j.manual_checked,true);
assert.equal(j.scheduled_scans_enabled,false);
assert.equal(j.case_study_active,true);
assert.equal(j.historical_brief,true);
assert.equal(j.current_brief_review_required,false);
assert.equal(j.current_scan_needs_brief,false);
j=inspect({...p,last_checked_at:after});
assert.equal(j.current_scan_needs_brief,true,'new scan cannot resurrect older Brief');
assert.equal(j.historical_brief,true);
j=inspect({...p,last_checked_at:after,brief_evaluated_at:'2026-10-09T11:00:00Z',
 brief_content:{outstanding_actions:3,cycle_id:'cycle-new'}});
assert.equal(j.historical_brief,false);
assert.equal(j.current_brief_review_required,true,'new genuinely open actions still require review');
assert.equal(j.manual_checked,true,'My Check is an independent personal marker');
j=inspect({...p,last_checked_at:after,brief_evaluated_at:'2026-10-09T11:00:00Z',
 brief_content:{outstanding_actions:3,cycle_id:'cycle-new'},
 brief_published_confirmed_at:'2026-10-10T00:00:00Z'});
assert.equal(j.current_brief_review_required,false);
assert.equal(j.current_revision_publication_confirmed,true);
j=inspect({...p,case_study_active:false,case_study:null,
 manual_done_at:null,brief_content:{outstanding_actions:2},last_checked_at:before,
 brief_evaluated_at:'2026-10-01T11:00:00Z'});
assert.equal(j.current_brief_review_required,true,'unlocked future pages follow same contract');
j=inspect({...p,case_study_active:false,case_study:null,brief_content:null,
 manual_done_at:null,gsc_clicks:null,gsc_impressions:null});
assert.equal(j.historical_brief,false);
assert.equal(j.current_brief_review_required,false);
const index=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
assert(index.includes('CONTENTSCALE_CANONICAL_GROWTH_JOURNEY_V1'));
assert(index.includes('ContentScaleTrackerJourney.inspect(p,lastCheckedRaw)'));
assert(index.includes('data-tour="growth-page"'));
assert(index.includes("data-tour=\"growth-overview\""));
assert(index.includes('current_scan_needs_brief'));
assert(index.includes('historical_brief'));
assert(index.includes('CURRENT CYCLE · REVIEW VERIFIED BRIEF ACTIONS'));
assert(!index.includes('SCAN COMPLETE · OPEN THE BRIEF'));
console.log('PASS: one canonical Tracker state, all existing/new pages, Growth panel and guided tour');
