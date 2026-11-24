'use strict';
// Owner-only dashboard data. Application request reservations are not provider credits.
function meter(count,limit){
 const used=Number(count);
 if(!Number.isSafeInteger(used)||used<0)return {used:null,limit:null,remaining:null,percent:null,status:'UNAVAILABLE'};
 if(!Number.isSafeInteger(limit)||limit<0)return {used,limit:null,remaining:null,percent:null,status:'NO_LIMIT_CONFIGURED'};
 const percent=limit===0?100:Math.floor(100*used/limit);
 return {used,limit,remaining:Math.max(0,limit-used),percent,status:percent>=100?'LIMIT_REACHED':percent>=90?'WARNING_90':percent>=80?'WARNING_80':'OK'};
}
async function dashboard({manager,env=process.env}){
 const configured=!!String(env.FIRECRAWL_API_KEY||'').trim();
 const base={key_configured:configured,key_validity:'NOT_CHECKED',provider_credits:{status:'NOT_VERIFIED',remaining:null},
  free_growth_enabled:env.FREE_GROWTH_FIRECRAWL_ENABLED==='true',tracker_enabled:env.TRACKER_GROWTH_FIRECRAWL_ENABLED==='true'};
 if(!configured)return {...base,status:'KEY_MISSING'};
 try{
  const u=await manager.durableUsage(env);
  return {...base,status:'AVAILABLE',scope:u.scope,day_utc:u.day_utc,month_utc:u.month_utc,
   daily:meter(u.daily_requests,u.daily_limit),monthly:meter(u.monthly_requests,u.monthly_limit)};
 }catch{return {...base,status:'ACCOUNTING_UNAVAILABLE'};}
}
module.exports={meter,dashboard};
