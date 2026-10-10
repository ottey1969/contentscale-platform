'use strict';
// This is a RELEASE-BLOCKER SUMMARY, not permission to start the full application.
// A green schema check cannot approve historical customer data repair or email/AI side effects.
const { assessCanonicalReadRoutes } = require('./tracker-readonly-coverage.cjs');
const MANUAL_REVIEW_GATES=Object.freeze([
 'historical_Perfect_Roofing_Team_baseline_and_evidence_reconciliation',
 'full_application_startup_and_all_external_side_effects'
]);
function buildTrackerReleaseDecision(schema,contracts,getReadiness,historical,coverage=assessCanonicalReadRoutes()){
 const verifiedContracts=Array.isArray(contracts)&&contracts.length>=4&&contracts.every(c=>c.status==='verified');
 const blockers=[];
 if(schema?.empty!==true)blockers.push('isolated_staging_data_is_not_empty');
 if(getReadiness?.schema_ready!==true)blockers.push('tracker_get_schema_missing_requirements');
 if(!verifiedContracts)blockers.push('tracker_read_query_contracts_not_verified');
 if(!historical||historical.review_status==='not_checked')blockers.push('historical_integrity_audit_missing');
 else if(historical.review_status==='manual_historical_review_required')blockers.push('historical_data_has_review_issues');
 else if(historical.review_status==='historical_data_not_exercised')blockers.push('historical_customer_records_not_exercised_in_empty_staging');
 if(!coverage.case_study_get_routes_read_only)blockers.push('remaining_case_study_GET_schema_mutations');
 if(coverage.prewrite_get_implicit_write_review)blockers.push('prewrite_GET_implicit_brief_persistence_requires_review');
 if(!coverage.historical_PRT_auto_attach_dormant)blockers.push('historical_PRT_auto_attach_risk');
 blockers.push(...MANUAL_REVIEW_GATES);
 return Object.freeze({
  environment:'staging',
  release_ready:false,
  full_application_boot_allowed:false,
  production_deployment_authorized:false,
  manual_approval_required:true,
  schema_ready:getReadiness?.schema_ready===true,
  query_contracts_verified:verifiedContracts,
  historical_records_reviewed:historical?.case_studies>0 && historical.review_status==='legacy_relationships_checked',
  case_study_get_routes_read_only:coverage.case_study_get_routes_read_only,
  case_study_get_routes_verified:coverage.verified_case_study_get_routes,
  prewrite_get_implicit_write_review:coverage.prewrite_get_implicit_write_review,
  historical_PRT_auto_attach_dormant:coverage.historical_PRT_auto_attach_dormant,
  app_started:false,
  providers_enabled:false,
  writes_performed:false,
  status:'hold_full_app_release_continue_isolated_review',
  blockers:Object.freeze(blockers)
 });
}
module.exports={MANUAL_REVIEW_GATES,buildTrackerReleaseDecision};
