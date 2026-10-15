'use strict';
// Aggregate, time-scoped Growth reporting: visibility, click-to-call actions,
// actual telephone conversations, and won jobs are NEVER interchangeable.
const ISO=/^\d{4}-\d\d-\d\d$/;
const known=new Map([
 ['gsc_impressions','searchconsole'],['gsc_organic_clicks','searchconsole'],
 ['gbp_search_maps_impressions','google_business_profile'],
 ['gbp_call_button_clicks','google_business_profile'],
 ['gbp_website_clicks','google_business_profile'],
 ['gbp_direction_requests','google_business_profile'],
 ['confirmed_inbound_calls','phone_system'],
 ['answered_calls','phone_system'],['qualified_calls','phone_system'],
 ['quoted_jobs','crm'],['won_jobs','crm'],
]);
function evaluateGrowthFunnel({start_date,end_date,observations=[]}={}){
 const issues=[],found=new Map(),data={},days=Number.isFinite(Date.parse(end_date))-Number.isFinite(Date.parse(start_date));
 if(!ISO.test(String(start_date||''))||!ISO.test(String(end_date||''))||
    !Number.isFinite(Date.parse(start_date))||!Number.isFinite(Date.parse(end_date))||start_date>end_date)
  return {status:'INVALID_PERIOD',issues:['VALID_REPORTING_WINDOW_REQUIRED'],metrics:{},sales_conversion_rate:null};
 for(const entry of Array.isArray(observations)?observations:[]){
  if(!entry||!known.has(entry.metric)){issues.push('UNKNOWN_METRIC');continue}
  if(found.has(entry.metric)){issues.push('DUPLICATE_METRIC');continue}
  if(entry.source!==known.get(entry.metric)||entry.start_date!==start_date||entry.end_date!==end_date||
    !Number.isSafeInteger(entry.value)||entry.value<0||entry.verified!==true){
   issues.push('METRIC_SOURCE_PERIOD_OR_VERIFICATION_REQUIRED');continue;
  }
  found.set(entry.metric,entry);
 }
 for(const key of known.keys()){
  const entry=found.get(key);
  data[key]={value:entry?entry.value:null,measurement_status:entry?'VERIFIED':'NOT_MEASURED',
   source:known.get(key)};
 }
 const numeric=key=>data[key].value;
 if(numeric('answered_calls')!==null&&numeric('confirmed_inbound_calls')!==null&&
   numeric('answered_calls')>numeric('confirmed_inbound_calls'))issues.push('ANSWERED_CALLS_EXCEED_CONFIRMED_CALLS');
 if(numeric('qualified_calls')!==null&&numeric('answered_calls')!==null&&
   numeric('qualified_calls')>numeric('answered_calls'))issues.push('QUALIFIED_CALLS_EXCEED_ANSWERED_CALLS');
 // Only allow a conversion rate for one common verified, deduplicated cohort.
 const phone=found.get('confirmed_inbound_calls'),won=found.get('won_jobs');
 const cohort=phone&&won&&phone.cohort_id&&typeof phone.cohort_id==='string'&&
  phone.cohort_id===won.cohort_id&&phone.deduplicated===true&&won.deduplicated===true;
 const compatible=cohort&&phone.value>=won.value;
 const rate=compatible&&phone.value>0?Math.round((10000*won.value/phone.value))/100:null;
 return {status:issues.length?'EVIDENCE_REVIEW_REQUIRED':'FUNNEL_REPORT_READY',
  period:{start_date,end_date},
  metrics:data,issues:[...new Set(issues)],
  sales_conversion_rate_percent:rate,
  calls_and_jobs_same_verified_cohort:!!compatible,
  google_business_profile_actions_are_not_confirmed_phone_calls:true,
  organic_page_clicks_are_not_all_customer_contacts:true,
  no_work_claim_proven:false,
  overall_sales_completed_from_gsc:false,
  recommendations:[
   'Separately verify actual connected calls versus GBP call-button clicks.',
   'Log qualified inquiries and shared-source won jobs as privacy-safe aggregates.',
   'Separate visibility and acquisition work from price, follow-up and closing effectiveness.',
   'Request authentic project photos and reviews after real completed work, without incentives or review filtering.'
  ]};
}
module.exports={evaluateGrowthFunnel};
