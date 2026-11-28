'use strict';
// Owner-only dashboard data. Application request reservations (quota) are not provider credits; provider credits come
// from Firecrawl's credit-usage API through the central manager.
function meter(count,limit){
 const used=Number(count);
 if(!Number.isSafeInteger(used)||used<0)return {used:null,limit:null,remaining:null,percent:null,status:'UNAVAILABLE'};
 if(!Number.isSafeInteger(limit)||limit<0)return {used,limit:null,remaining:null,percent:null,status:'NO_LIMIT_CONFIGURED'};
 const percent=limit===0?100:Math.floor(100*used/limit);
 return {used,limit,remaining:Math.max(0,limit-used),percent,status:percent>=100?'LIMIT_REACHED':percent>=90?'WARNING_90':percent>=80?'WARNING_80':'OK'};
}
async function dashboard({manager,env=process.env}){
 const configured=!!String(env.FIRECRAWL_API_KEY||'').trim();
 const base={key_configured:configured,backup_key_configured:configured&&!!String(env.FIRECRAWL_API_KEY_BACKUP||'').trim(),
  key_validity:'NOT_CHECKED',provider_credits:{status:'NOT_VERIFIED',remaining:null},
  failover:{enabled:env.FIRECRAWL_AUTO_FAILOVER==='true',min_credits:(n=>Number.isSafeInteger(n)&&n>=0&&String(env.FIRECRAWL_MIN_CREDITS??'').trim()!==''?n:50)(Number(env.FIRECRAWL_MIN_CREDITS))},
  free_growth_enabled:env.FREE_GROWTH_FIRECRAWL_ENABLED==='true',tracker_enabled:env.TRACKER_GROWTH_FIRECRAWL_ENABLED==='true'};
 if(!configured)return {...base,status:'KEY_MISSING'};
 // Per account: provider-verified credits, whether it is the active key, last verification and usage per module.
 // Accounts are named PRIMARY / BACKUP only; keys and key hashes never leave the server.
 let accounts=null,extra={};
 if(typeof manager.accounts==='function'){
  try{
   accounts=(await manager.accounts(env)).map(a=>({label:a.label,active:a.active,credits:a.credits,last_verified:a.last_verified,last_checked:a.last_checked,modules:a.modules}));
   const active=accounts.find(a=>a.active)||null,primary=accounts[0];
   const shown=active||primary;
   extra={accounts,active_key:active?active.label:null,
    key_validity:primary.credits.status==='KEY_INVALID'?'INVALID':primary.credits.status==='VERIFIED'||primary.credits.status==='EXHAUSTED'?'VALID':'NOT_CHECKED',
    provider_credits:shown&&shown.credits.remaining!=null&&(shown.credits.status==='VERIFIED'||shown.credits.status==='EXHAUSTED')
     ?{status:shown.credits.status,account:shown.label,remaining:shown.credits.remaining,estimated_remaining:shown.credits.estimated_remaining,last_verified:shown.last_verified}
     :{status:'NOT_VERIFIED',remaining:null}};
  }catch{extra={accounts:null}}
 }
 try{
  const u=await manager.durableUsage(env);
  let modules=null;
  if(typeof manager.moduleUsage==='function'){try{modules=await manager.moduleUsage(env)}catch{/* Quota totals remain available. */}}
  return {...base,...extra,modules,status:'AVAILABLE',scope:u.scope,day_utc:u.day_utc,month_utc:u.month_utc,
   daily:meter(u.daily_requests,u.daily_limit),monthly:meter(u.monthly_requests,u.monthly_limit)};
 }catch{return {...base,...extra,status:'ACCOUNTING_UNAVAILABLE'};}
}
module.exports={meter,dashboard};
