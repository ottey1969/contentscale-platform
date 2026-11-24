'use strict';
// Shared hosted Firecrawl transport. A backup must be independently authorized
// under the provider's terms. Never rotate credentials for rate limits or blocks.
function createFirecrawlProvider({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=11000}={}){
 const primary=String(env.FIRECRAWL_API_KEY||'').trim();
 const backup=String(env.FIRECRAWL_API_KEY_BACKUP||'').trim();
 const failover=env.FIRECRAWL_AUTO_FAILOVER==='true'&&!!backup&&backup!==primary;
 const stats={primary:{requests:0,accepted:0},backup:{requests:0,accepted:0},switches:0};
 const rawThreshold=String(env.FIRECRAWL_MIN_CREDITS??'50').trim();
 const threshold=/^\d+$/.test(rawThreshold)?Math.min(1000000,Number(rawThreshold)):50;
 let primaryExhausted=false;
 let balanceCheck=null;
 let balanceCheckedAt=0;
 const balances={primary:null,backup:null};
 stats.remaining_credits=balances;
 stats.credit_check_status='NOT_CHECKED';
 stats.min_credits=threshold;
 const checkPrimary=async()=>{
  if(!failover||!threshold)return null;
  if(balanceCheck)return balanceCheck;
  if(balanceCheckedAt&&Date.now()-balanceCheckedAt<60000)return balances.primary;
  balanceCheck=(async()=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,5000));
   try{
    const response=await fetchImpl('https://api.firecrawl.dev/v2/team/credit-usage',{
     method:'GET',headers:{Authorization:'Bearer '+primary},signal:controller.signal
    });
    if(!response.ok)throw Error('CREDIT_CHECK_HTTP');
    const body=await response.json();
    const value=body?.data?.remainingCredits;
    if(body?.success===false||typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('CREDIT_CHECK_SCHEMA');
    balances.primary=value;
    stats.credit_check_status='AVAILABLE';
   }catch{
    balances.primary=null;
    stats.credit_check_status='UNAVAILABLE';
   }finally{clearTimeout(timer);balanceCheckedAt=Date.now()}
   return balances.primary;
  })();
  try{return await balanceCheck}finally{balanceCheck=null}
 };
 const send=async(key,account,payload)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  stats[account].requests++;
  try{
   const response=await fetchImpl('https://api.firecrawl.dev/v2/scrape',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:controller.signal
   });
   if(!response.ok)return {status:response.status};
   const body=await response.json();
   if(body?.success!==false)stats[account].accepted++;
   return {status:response.status||200,body,account};
  }finally{clearTimeout(timer)}
 };
 const scrape=async(payload)=>{
  if(!primary)throw Object.assign(Error('FIRECRAWL_NOT_CONFIGURED'),{code:'FIRECRAWL_NOT_CONFIGURED'});
  let result;
  if(failover&&!primaryExhausted){
   const remaining=await checkPrimary();
   if(remaining!==null&&remaining<threshold&&!primaryExhausted){
    primaryExhausted=true;
    stats.switches++;
   }
  }
  if(primaryExhausted&&failover)result=await send(backup,'backup',payload);
  else{
   result=await send(primary,'primary',payload);
   // HTTP 402 only: no retry on authentication failures, 429 or publisher refusals.
   if(result.status===402&&failover){
    if(!primaryExhausted)stats.switches++;
    primaryExhausted=true;
    result=await send(backup,'backup',payload);
   }
  }
  if(!result.body)throw Object.assign(Error('FIRECRAWL_HTTP_'+result.status),{code:'FIRECRAWL_HTTP_'+result.status});
  return result;
 };
 return {scrape,stats};
}
module.exports={createFirecrawlProvider};
