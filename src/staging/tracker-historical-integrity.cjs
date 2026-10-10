'use strict';
// Staging-only legacy data review. No repairs, no application imports, no customer rows.
// An empty staging database CANNOT prove historic customer case-study migration safety.
const LEGACY_QUERIES=Object.freeze([
 Object.freeze({id:'case_studies',sql:[
  "SELECT COUNT(*)::int AS case_studies,",
  " COUNT(*) FILTER (WHERE c.id IS NULL)::int AS orphan_clients,",
  " COUNT(*) FILTER (WHERE cs.tracker_page_id IS NOT NULL AND p.id IS NULL)::int AS orphan_pages,",
  " COUNT(*) FILTER (WHERE p.id IS NOT NULL AND p.tracker_client_id IS DISTINCT FROM cs.tracker_client_id)::int AS cross_client_pages,",
  " COUNT(*) FILTER (WHERE p.implementation_verified_at IS NOT NULL AND cs.baseline_at IS NOT NULL AND p.implementation_verified_at<cs.baseline_at)::int AS verification_before_baseline",
  " FROM public.tracker_case_studies cs",
  " LEFT JOIN public.tracker_clients c ON c.id=cs.tracker_client_id",
  " LEFT JOIN public.tracker_pages p ON p.id=cs.tracker_page_id"
 ].join('\n')}),
 Object.freeze({id:'manual_state',sql:[
  "SELECT COUNT(*)::int AS pages,",
  " COUNT(*) FILTER (WHERE manual_done IS TRUE AND manual_done_at IS NULL)::int AS missing_completion_timestamps,",
  " COUNT(*) FILTER (WHERE manual_done IS DISTINCT FROM TRUE AND manual_done_at IS NOT NULL)::int AS timestamp_without_completion",
  " FROM public.tracker_pages"
 ].join('\n')})
]);
function checkedCounters(obj,columns) {
 const out={};
 for(const key of columns){
  const x=Number(obj?.[key]);
  if(!Number.isSafeInteger(x)||x<0)throw Error('STAGING BLOCKED: unreadable historical integrity counter');
  out[key]=x;
 }
 return Object.freeze(out);
}
async function inspectHistoricalIntegrity(pool){
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  begun=true;
  await client.query("SET LOCAL statement_timeout = '3000ms'");
  const r=await client.query(LEGACY_QUERIES[0].sql);
  const p=await client.query(LEGACY_QUERIES[1].sql);
  const cases=checkedCounters(r.rows[0],['case_studies','orphan_clients','orphan_pages','cross_client_pages','verification_before_baseline']);
  const pages=checkedCounters(p.rows[0],['pages','missing_completion_timestamps','timestamp_without_completion']);
  await client.query('ROLLBACK');begun=false;
  const issues=cases.orphan_clients+cases.orphan_pages+cases.cross_client_pages+cases.verification_before_baseline+
   pages.missing_completion_timestamps+pages.timestamp_without_completion;
  return Object.freeze({
   review_status:issues>0?'manual_historical_review_required':
     cases.case_studies===0?'historical_data_not_exercised':'legacy_relationships_checked',
   case_studies:cases.case_studies,pages:pages.pages,
   suspicious_relationships:cases.orphan_clients+cases.orphan_pages+cases.cross_client_pages,
   early_verifications:cases.verification_before_baseline,
   manual_timestamp_mismatches:pages.missing_completion_timestamps+pages.timestamp_without_completion,
   repairs_performed:false,writes_performed:false,app_started:false,
   historical_repair_behavior_verified:false,
   historical_migrations_approved:false,
   requires_review_before_full_app_boot:true
  });
 }catch(e){
  if(begun)try{await client.query('ROLLBACK')}catch(_){}
  throw Error('STAGING BLOCKED: historical integrity audit did not complete',{cause:e});
 }finally{client.release()}
}
module.exports={LEGACY_QUERIES,inspectHistoricalIntegrity};
