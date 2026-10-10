'use strict';
// This is a RELEASE-BLOCKER SUMMARY, not permission to start the full application.
// A green schema check cannot approve historical customer data repair or email/AI side effects.
const MANUAL_REVIEW_GATES=Object.freeze([
 'historical_Perfect_Roofing_Team_baseline_and_evidence_reconciliation',
 'remaining_case_study_GET_schema_mutations',
 'full_application_startup_and_all_external_side_effects'
]);
function buildTrackerReleaseDecision(schema,contracts,getReadiness,historical){
 const verifiedContracts=Array.isArray(contracts)&&contracts.length>=4&&contracts.every(c=>c.status==='verified');
 const blockers=[];
 if(schema?.empty!==true)blockers.push('isolated_staging_data_is_not_empty');
 if(getReadiness?.schema_ready!==true)blockers.push('tracker_get_schema_missing_requirements');
 if(!verifiedContracts)blockers.push('tracker_read_query_contracts_not_verified');
 if(!historical||historical.review_status==='not_checked')blockers.push('historical_integrity_audit_missing');
 else if(historical.review_status==='manual_historical_review_required')blockers.push('historical_data_has_review_issues');
 else if(historical.review_status==='historical_data_not_exercised')blockers.push('historical_customer_records_not_exercised_in_empty_staging');
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
  app_started:false,
  providers_enabled:false,
  writes_performed:false,
  status:'hold_full_app_release_continue_isolated_review',
  blockers:Object.freeze(blockers)
 });
}
module.exports={MANUAL_REVIEW_GATES,buildTrackerReleaseDecision};
