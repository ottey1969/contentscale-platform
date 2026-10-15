'use strict';
const assert=require('node:assert/strict');
const {evaluateGrowthFunnel}=require('./growth-funnel-evaluation.cjs');
const start_date='2026-09-01',end_date='2026-09-30';
const signal=(metric,value,source,extra={})=>({metric,value,source,start_date,end_date,verified:true,...extra});
const gbp=signal('gbp_call_button_clicks',4,'google_business_profile');
let x=evaluateGrowthFunnel({start_date,end_date,observations:[gbp,
 signal('gsc_organic_clicks',0,'searchconsole'),signal('gbp_website_clicks',5,'google_business_profile')]});
assert.equal(x.status,'FUNNEL_REPORT_READY');
assert.equal(x.metrics.gbp_call_button_clicks.value,4);
assert.equal(x.metrics.confirmed_inbound_calls.value,null);
assert.equal(x.metrics.won_jobs.value,null);
assert.equal(x.sales_conversion_rate_percent,null);
assert.equal(x.no_work_claim_proven,false);
assert.equal(x.google_business_profile_actions_are_not_confirmed_phone_calls,true);
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('confirmed_inbound_calls',20,'phone_system',{cohort_id:'cohort-20',deduplicated:true}),
 signal('won_jobs',1,'crm',{cohort_id:'cohort-20',deduplicated:true})
]});
assert.equal(x.sales_conversion_rate_percent,5);
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('confirmed_inbound_calls',4,'phone_system',{cohort_id:'cohort-4',deduplicated:true}),
 signal('won_jobs',4,'crm',{cohort_id:'cohort-4',deduplicated:true})
]});
assert.equal(x.sales_conversion_rate_percent,100);
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('confirmed_inbound_calls',20,'phone_system',{cohort_id:'cohort-1',deduplicated:true}),
 signal('won_jobs',1,'crm',{cohort_id:'different',deduplicated:true})
]});
assert.equal(x.sales_conversion_rate_percent,null,'different cohorts cannot imply closing effectiveness');
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('gbp_call_button_clicks',4,'google_business_profile'),
 signal('confirmed_inbound_calls',0,'phone_system')
]});
assert.equal(x.metrics.confirmed_inbound_calls.value,0);
assert.equal(x.metrics.gbp_call_button_clicks.value,4,'confirmed zero calls does not erase platform actions');
assert.equal(x.sales_conversion_rate_percent,null);
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('confirmed_inbound_calls',20,'owner_statement'),
 signal('won_jobs',1,'crm')
]});
assert(x.issues.includes('METRIC_SOURCE_PERIOD_OR_VERIFICATION_REQUIRED'),'unsupported source is not verification');
assert.equal(x.sales_conversion_rate_percent,null);
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('answered_calls',5,'phone_system'),signal('confirmed_inbound_calls',4,'phone_system')
]});
assert(x.issues.includes('ANSWERED_CALLS_EXCEED_CONFIRMED_CALLS'));
x=evaluateGrowthFunnel({start_date,end_date,observations:[
 signal('gbp_call_button_clicks',4,'google_business_profile',{verified:false})
]});
assert(x.issues.includes('METRIC_SOURCE_PERIOD_OR_VERIFICATION_REQUIRED'));
assert.equal(x.metrics.gbp_call_button_clicks.value,null);
console.log('PASS: GBP call clicks differ from calls; 20:1 and 4:4 matched cohorts only; missing data never becomes zero');
