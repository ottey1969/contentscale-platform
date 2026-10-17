'use strict';
const assert=require('node:assert/strict');
const {inspect,pageEvidence}=require('../src/tracker-page-journey.cjs');
const old='2026-10-01T12:00:00Z';
const scan='2026-10-01T13:00:00Z';
const done='2026-10-10T12:00:00Z';
const existing={
 id:20,case_study_active:false,manual_done:true,manual_done_at:done,
 check_frequency:'off',brief_evaluated_at:old,last_checked:scan,
 gsc_impressions:null,gsc_clicks:null,
 brief_content:{outstanding_actions:3,cycle_id:'historical'},implementation_status:'not_verified'
};
let x=inspect(existing);
assert.equal(x.personal_completion_controls_workflow,true);
assert.equal(x.scheduled_scans_enabled,false);
assert.equal(x.current_brief_review_required,true,'Do not erase actual outstanding actions from the state evidence');
assert.match(x.notes,/My Check is a personal marker/);
x=inspect({...existing,last_checked:'2026-10-13T10:00:00Z'});
assert.equal(x.personal_completion_controls_workflow,false,'New actual scan makes closed historical monitoring non-current');
assert.equal(x.historical_brief,true,'A later scan does not make old Brief new');
assert.equal(x.current_scan_needs_brief,true);
x=inspect({...existing,html_pasted_at:'2026-10-12T12:00:00Z'});
assert.equal(x.personal_completion_controls_workflow,false,'New manual HTML must reopen evidence review');
const future=inspect({id:9999,check_frequency:'0',gsc_clicks:null,gsc_impressions:null,brief_content:null});
assert.equal(future.scheduled_scans_enabled,false);
assert.equal(future.current_brief_review_required,false);
assert.equal(future.current_scan_needs_brief,false);
const portfolio={query_opportunities:[{page_id:20,query:'roof services near me',impressions:230,clicks:1,position:14,priority_score:300}]};
assert.equal(pageEvidence(portfolio,20).status,'PAGE_VERIFIED_NONBRAND_OPPORTUNITIES');
assert.equal(pageEvidence(null,20).status,'NEEDS_VERIFIED_EXACT_PAGE_GSC');
console.log('PASS pure canonical Tracker lifecycle: no GSC, historical monitoring, new scan/HTML, all future pages');
