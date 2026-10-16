'use strict';
// Canonical daily GSC reader. No external calls, no writes, no implied observations.
// Data must have been verified and imported by the authorized property owner.
async function readVerifiedDailyGrowthGsc(pool,{clientId,pageId,pageUrl}={}){
 const client=Number(clientId),page=Number(pageId);
 if(!Number.isSafeInteger(client)||client<1||!Number.isSafeInteger(page)||page<1||
    !/^https:\/\//.test(String(pageUrl||''))||typeof pool?.query!=='function')
  throw Error('CANONICAL_GSC_IDENTITY_REQUIRED');
 const result=await pool.query(
  "SELECT page_url,gsc_property,observed_date AS date,search_type,clicks,impressions,nonbrand_clicks,verified FROM growth_gsc_daily_page_evidence WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND page_url=$3 AND verified=TRUE AND search_type='web' ORDER BY observed_date DESC LIMIT 400",
  [client,page,pageUrl]);
 const rows=(result.rows||[]).map(r=>({...r,date:r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10)}));
 const properties=[...new Set(rows.map(r=>r.gsc_property))];
 if(!rows.length)return {page_url:pageUrl,gsc_property:null,rows:[],status:'NO_VERIFIED_DAILY_GSC'};
 if(properties.length!==1)return {page_url:pageUrl,gsc_property:null,rows:[],status:'MULTIPLE_GSC_PROPERTIES_REVIEW_REQUIRED'};
 return {page_url:pageUrl,gsc_property:properties[0],rows,status:'VERIFIED_DAILY_GSC_ROWS'};
}
module.exports={readVerifiedDailyGrowthGsc};
