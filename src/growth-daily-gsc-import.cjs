'use strict';
// Exact-page daily GSC import. Requires an authorized token supplied by the
// existing GSC integration. Never infers missing date rows as zero.
const {searchAnalytics}=require('./gsc-client.js');
const ONE_DAY=86400000;
const parseDay=s=>{
 if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s))return null;
 const t=Date.parse(s+'T00:00:00Z');
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null;
};
function validateProperty(property,pageUrl){
 if(typeof property!=='string'||!property||typeof pageUrl!=='string')return false;
 let page;try{page=new URL(pageUrl)}catch{return false}
 if(page.protocol!=='https:'||page.username||page.password||page.search||page.hash)return false;
 if(property.startsWith('sc-domain:'))return page.hostname===property.slice(10)||page.hostname.endsWith('.'+property.slice(10));
 try{const url=new URL(property);return url.protocol==='https:'&&pageUrl.startsWith(url.href)}catch{return false}
}
async function importVerifiedDailyGrowthGsc({db,clientId,pageId,pageUrl,gscProperty,accessToken,
 startDate,endDate,fetchImpl}={}){
 const id=Number(clientId),pid=Number(pageId),start=parseDay(startDate),end=parseDay(endDate);
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(pid)||pid<1||!validateProperty(gscProperty,pageUrl))
  throw Error('VERIFIED_GSC_PAGE_IDENTITY_REQUIRED');
 if(start===null||end===null||end<start||end-start>89*ONE_DAY||
  end>Date.now()-3*ONE_DAY)throw Error('SETTLED_DAILY_DATE_WINDOW_REQUIRED');
 if(typeof accessToken!=='string'||accessToken.length<8||typeof db?.connect!=='function')
  throw Error('GSC_AUTH_AND_TRANSACTION_REQUIRED');
 const rows=await searchAnalytics(gscProperty,{startDate,endDate,dimensions:['date'],
  dimensionFilterGroups:[{filters:[{dimension:'page',operator:'equals',expression:pageUrl}]}],
  dataState:'final',rowLimit:1000},accessToken,fetchImpl);
 const seen=new Set(),verified=[];
 for(const row of rows){
  const day=row?.keys?.[0],ms=parseDay(day);
  if(ms===null||ms<start||ms>end||seen.has(day)||
   !Number.isSafeInteger(row.clicks)||row.clicks<0||
   !Number.isSafeInteger(row.impressions)||row.impressions<row.clicks)
   throw Error('GSC_DAILY_RESPONSE_REJECTED');
  seen.add(day);verified.push({day,clicks:row.clicks,impressions:row.impressions});
 }
 // GSC can omit days with zero activity: no assumption that absent = zero.
 const connection=await db.connect();
 let wrote=0;
 try{
  await connection.query('BEGIN');
  // Check canonical identity before persisting; fail closed on ownership changes.
  const page=await connection.query('SELECT url FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2 LIMIT 1',[pid,id]);
  if(page.rows?.length!==1||page.rows[0].url!==pageUrl)throw Error('TRACKER_CANONICAL_PAGE_CHANGED');
  for(const r of verified){
   await connection.query(`INSERT INTO growth_gsc_daily_page_evidence
(tracker_client_id,tracker_page_id,page_url,gsc_property,observed_date,search_type,clicks,impressions,nonbrand_clicks,verified)
VALUES ($1,$2,$3,$4,$5,'web',$6,$7,NULL,TRUE)
ON CONFLICT (tracker_client_id,tracker_page_id,page_url,gsc_property,observed_date,search_type)
DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,
nonbrand_clicks=NULL,verified=TRUE,collected_at=NOW()`,
    [id,pid,pageUrl,gscProperty,r.day,r.clicks,r.impressions]);
   wrote++;
  }
  await connection.query('COMMIT');
 }catch(error){await connection.query('ROLLBACK').catch(()=>{});throw error}
 finally{connection.release()}
 return {status:'VERIFIED_GSC_IMPORT_COMMITTED',verified_dates:wrote,
  missing_dates_not_assumed_zero:Math.round((end-start)/ONE_DAY)+1-wrote,
  branded_split_verified:false,click_breakthrough_confirmed:false,
  page_url:pageUrl,gsc_property:gscProperty,start_date:startDate,end_date:endDate};
}
module.exports={importVerifiedDailyGrowthGsc,validateProperty};
