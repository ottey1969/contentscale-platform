'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildTrackerReleaseDecision,MANUAL_REVIEW_GATES}=require('../src/staging/tracker-release-decision.cjs');
const schema={empty:true};
const contracts=['client_page_identity','latest_snapshot_relationship','case_study_identity','workflow_event_tables'].map(id=>({id,status:'verified'}));
const get={schema_ready:true};
test('green staging schema is never mistaken for permission to boot the application',()=>{
 const r=buildTrackerReleaseDecision(schema,contracts,get,{review_status:'historical_data_not_exercised',case_studies:0});
 assert.equal(r.schema_ready,true);
 assert.equal(r.query_contracts_verified,true);
 assert.equal(r.release_ready,false);
 assert.equal(r.full_application_boot_allowed,false);
 assert.equal(r.production_deployment_authorized,false);
 assert(r.blockers.includes('historical_customer_records_not_exercised_in_empty_staging'));
 assert.deepEqual(r.blockers.slice(-MANUAL_REVIEW_GATES.length),[...MANUAL_REVIEW_GATES]);
});
test('historical issues remain a release blocker without revealing client data',()=>{
 const r=buildTrackerReleaseDecision(schema,contracts,get,{review_status:'manual_historical_review_required',case_studies:2});
 assert(r.blockers.includes('historical_data_has_review_issues'));
 assert.equal(r.historical_records_reviewed,false);
 assert.doesNotMatch(JSON.stringify(r),/token|domain_name|email_address/);
});
test('even healthy historical relations require distinct boot and external-effect approval',()=>{
 const r=buildTrackerReleaseDecision(schema,contracts,get,{review_status:'legacy_relationships_checked',case_studies:7});
 assert.equal(r.historical_records_reviewed,true);
 assert.equal(r.release_ready,false);
 assert.equal(r.blockers.includes('historical_customer_records_not_exercised_in_empty_staging'),false);
 assert.equal(r.case_study_get_routes_read_only,true);
 assert.equal(r.case_study_get_routes_verified,4);
 assert.equal(r.blockers.includes('remaining_case_study_GET_schema_mutations'),false);
 assert(r.blockers.includes('prewrite_GET_implicit_brief_persistence_requires_review'));
});
test('contract or schema failure is explicitly represented',()=>{
 const r=buildTrackerReleaseDecision({empty:false},[],{schema_ready:false},{review_status:'not_checked',case_studies:0});
 assert.equal(r.schema_ready,false);
 assert(r.blockers.includes('isolated_staging_data_is_not_empty'));
 assert(r.blockers.includes('tracker_get_schema_missing_requirements'));
 assert(r.blockers.includes('tracker_read_query_contracts_not_verified'));
 assert(r.blockers.includes('historical_integrity_audit_missing'));
});

test('route coverage can never hide an unpatched GET or activated legacy auto-attach',()=>{
 const coverage={case_study_get_routes_read_only:false,verified_case_study_get_routes:3,
  prewrite_get_implicit_write_review:true,historical_PRT_auto_attach_dormant:false};
 const r=buildTrackerReleaseDecision(schema,contracts,get,{review_status:'historical_data_not_exercised',case_studies:0},coverage);
 assert.equal(r.case_study_get_routes_read_only,false);
 assert(r.blockers.includes('remaining_case_study_GET_schema_mutations'));
 assert(r.blockers.includes('historical_PRT_auto_attach_risk'));
});
