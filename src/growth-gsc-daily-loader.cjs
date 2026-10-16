'use strict';
// Read-only, tenant-scoped adapter. No fallback to rolled-up historic query totals.
async function loadVerifiedDailyGrowthGsc(pool,{clientId,pageId,pageUrl}={}){
 if(!pool||typeof pool.query!=='function')throw Error('DB_REQUIRED');
 if(!Number.isSafeInteger(Number(clientId))||Number(clientId)<1||
 !Number.isSafeInteger(Number(pageId))||Number(pageId)<1||
 !/^https:\/\//.test(pageUrl||''))throw Error('EXACT_PAGE_IDENTITY_REQUIRED');
 let result;
 try{
 result=await pool.query(`SELECT page_url,gsc_property,metric_date::text AS date,search_type,
  clicks,impressions,nonbrand_clicks,verified,evidence_source
  FROM growth_gsc_daily_metrics
  WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND page_url=$3 AND verified=TRUE
  AND search_type='web' ORDER BY metric_date ASC LIMIT 1000`,[Number(clientId),Number(pageId),pageUrl]);
 }catch(e){if(e.code==='42P01')return {status:'DAILY_GSC_SCHEMA_NOT_INSTALLED',page_url:pageUrl,gsc_property:null,rows:[]};throw e}
 const rows=result.rows||[];
 const properties=[...new Set(rows.map(r=>r.gsc_property))];
 if(properties.length>1)return {status:'MULTIPLE_GSC_PROPERTIES_REQUIRE_REVIEW',page_url:pageUrl,gsc_property:null,rows:[]};
 return {status:rows.length?'VERIFIED_DAILY_GSC_LOADED':'NO_VERIFIED_DAILY_GSC',
  page_url:pageUrl,gsc_property:properties[0]||null,
  rows:rows.map(r=>({...r,page_url:pageUrl,clicks:Number(r.clicks),
   impressions:Number(r.impressions),nonbrand_clicks:r.nonbrand_clicks==null?null:Number(r.nonbrand_clicks)}))};
}
module.exports={loadVerifiedDailyGrowthGsc};
