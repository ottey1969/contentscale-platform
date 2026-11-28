'use strict';
// The one central Firecrawl integration: key selection, provider credit checks, shared request quota, bounded cache and
// in-flight coalescing. Every module (GSC Audit, Free/Tracker Growth, Free/Tracker/Network Pre-Write, CEO Scan, Quick Scan)
// reads through this manager via the shared reader; no module calls the provider itself.
//
// Keys (owner 2026-11-28): FIRECRAWL_API_KEY is the primary account, FIRECRAWL_API_KEY_BACKUP a second authorised account.
// With FIRECRAWL_AUTO_FAILOVER=true the backup is used only when the provider itself reports fewer than
// FIRECRAWL_MIN_CREDITS (default 50) remaining credits on the primary, or confirms exhaustion (HTTP 402). A rate limit (429)
// or any other provider error never switches keys: switching is not a way around provider limits.
// The application quota (FIRECRAWL_DAILY_REQUEST_LIMIT / FIRECRAWL_MONTHLY_REQUEST_LIMIT) covers both keys together.
// No API key is retained in results, logged or returned; accounts are identified by a label and a hash.
const {createHash}=require('node:crypto');
const CREDIT_URL='https://api.firecrawl.dev/v2/team/credit-usage';
const positive=(value,fallback,max)=>{
 const n=Number(value);return value!=null&&String(value).trim()!==''&&Number.isSafeInteger(n)&&n>=0?Math.min(n,max):fallback;
};
const error=code=>Object.assign(Error(code),{code});
const hash=k=>createHash('sha256').update(String(k||'').trim()).digest('hex');
function keyList(env){
 const primary=String(env.FIRECRAWL_API_KEY||'').trim(),backup=String(env.FIRECRAWL_API_KEY_BACKUP||'').trim();
 const out=[];
 if(primary)out.push({label:'PRIMARY',key:primary,id:hash(primary)});
 if(primary&&backup&&backup!==primary)out.push({label:'BACKUP',key:backup,id:hash(backup)});
 return out;
}
const failoverOn=env=>env.FIRECRAWL_AUTO_FAILOVER==='true';
const minCredits=env=>positive(env.FIRECRAWL_MIN_CREDITS,50,1e9);
const checkMs=env=>positive(env.FIRECRAWL_CREDIT_CHECK_SECONDS,300,86400)*1000;
function createFirecrawlManager({now=Date.now,maxEntries=100,maxCacheBytes=16*1024*1024,accounting=null,requireAccounting=false,
 fetchImpl=globalThis.fetch,creditTimeoutMs=8000}={}){
 const cache=new Map(),running=new Map(),accounts=new Map(),credits=new Map(),checking=new Map();
 const lastActive=new Map();
 let cachedBytes=0;
 const remove=k=>{const hit=cache.get(k);if(hit){cachedBytes-=hit.bytes;cache.delete(k)}};
 // The quota group is the primary account: limits are shared by all keys and never reset by a switch.
 const account=(env)=>{
  const id=hash(env.FIRECRAWL_API_KEY);
  const iso=new Date(now()).toISOString(),day=iso.slice(0,10),month=iso.slice(0,7);
  let a=accounts.get(id);
  if(!a){a={day,month,daily:0,monthly:0};accounts.set(id,a)}
  if(a.month!==month){a.month=month;a.monthly=0}
  if(a.day!==day){a.day=day;a.daily=0}
  return {id,a,dailyLimit:positive(env.FIRECRAWL_DAILY_REQUEST_LIMIT,Infinity,1000000),
   monthlyLimit:positive(env.FIRECRAWL_MONTHLY_REQUEST_LIMIT,Infinity,10000000)};
 };
 // ---- provider credits -------------------------------------------------------------------------------------------
 const state=id=>credits.get(id)||{status:'NOT_CHECKED',remaining:null,plan_credits:null,billing_period_end:null,checked_at:null,spent:0};
 const effective=s=>Number.isFinite(s.remaining)?s.remaining-s.spent:null;
 const exhausted=s=>s.status==='EXHAUSTED'||(s.status==='VERIFIED'&&effective(s)<=0);
 const low=(s,min)=>exhausted(s)||(s.status==='VERIFIED'&&effective(s)<min);
 async function verify(entry,env,{force=false}={}){
  const s=state(entry.id);
  if(!force&&s.checked_at!=null&&now()-s.checked_at<checkMs(env))return s;
  if(checking.has(entry.id))return checking.get(entry.id);
  const task=(async()=>{
   const at=now();let next;
   try{
    const r=await fetchImpl(CREDIT_URL,{method:'GET',headers:{Authorization:'Bearer '+entry.key},signal:AbortSignal.timeout(creditTimeoutMs)});
    const body=await r.json().catch(()=>null),data=body?.data||{};
    const remaining=Number(data.remainingCredits);
    if(r.ok&&body?.success!==false&&Number.isFinite(remaining))
     next={status:remaining<=0?'EXHAUSTED':'VERIFIED',remaining,plan_credits:Number.isFinite(Number(data.planCredits))?Number(data.planCredits):null,
      billing_period_end:typeof data.billingPeriodEnd==='string'?data.billingPeriodEnd.slice(0,40):null,checked_at:at,spent:0};
    else if(r.status===402)next={...s,check_error:undefined,status:'EXHAUSTED',remaining:0,checked_at:at,spent:0};
    else if(r.status===401||r.status===403)next={...s,check_error:undefined,status:'KEY_INVALID',remaining:null,checked_at:at,spent:0};
    // A rate-limited or failed check confirms nothing: keep the last verified numbers, retry after the interval.
    else next={...s,status:s.status==='VERIFIED'?'VERIFIED':'CHECK_FAILED',check_error:'HTTP_'+r.status,checked_at:at};
   }catch(e){next={...s,status:s.status==='VERIFIED'?'VERIFIED':'CHECK_FAILED',check_error:String(e?.name||'ERROR').slice(0,40),checked_at:at}}
   // Last verification = the last time the provider actually answered with a credit figure or a confirmed state.
   if(!next.check_error){delete next.check_error;next.verified_at=at}
   else next.verified_at=s.verified_at??null;
   credits.set(entry.id,next);
   return next;
  })();
  checking.set(entry.id,task);
  try{return await task}finally{checking.delete(entry.id)}
 }
 function markExhausted(entry){
  const s=state(entry.id);
  credits.set(entry.id,{...s,status:'EXHAUSTED',remaining:0,spent:0,checked_at:now(),verified_at:now(),exhausted_by:'PROVIDER_402'});
 }
 // Choose the key for one provider request. `skip` holds keys that just confirmed exhaustion for this request.
 async function select(env,skip=new Set()){
  const list=keyList(env).filter(k=>!skip.has(k.id));
  if(!list.length)throw error(skip.size?'FIRECRAWL_CREDITS_EXHAUSTED':'FIRECRAWL_KEY_MISSING');
  const [first,...rest]=list;
  if(!failoverOn(env)||!rest.length){
   // Without failover nothing is checked in advance; a key the provider just reported empty is not asked again until
   // the next verification interval, so a known-empty account does not keep receiving requests.
   const s=state(first.id);
   if(s.status==='EXHAUSTED'&&s.checked_at!=null&&now()-s.checked_at<checkMs(env))throw error('FIRECRAWL_CREDITS_EXHAUSTED');
   return first;
  }
  const min=minCredits(env);
  const fs=await verify(first,env);
  if(!low(fs,min))return first;
  let best=exhausted(fs)?null:{entry:first,left:effective(fs)};
  for(const entry of rest){
   const s=await verify(entry,env);
   if(s.status==='KEY_INVALID'||exhausted(s))continue;
   if(!low(s,min))return entry;
   // Unverified backup (check failed): only used when the primary is confirmed empty.
   const left=effective(s);
   if(left==null){if(!best)best={entry,left:-1};continue}
   if(!best||left>best.left)best={entry,left};
  }
  if(best)return best.entry;
  throw error('FIRECRAWL_CREDITS_EXHAUSTED');
 }
 const publicKey=e=>e?{label:e.label,id:e.id}:null;
 function usage(env=process.env){
  const {a,dailyLimit,monthlyLimit}=account(env);
  return {day_utc:a.day,month_utc:a.month,daily_requests:a.daily,monthly_requests:a.monthly,
   daily_limit:Number.isFinite(dailyLimit)?dailyLimit:null,monthly_limit:Number.isFinite(monthlyLimit)?monthlyLimit:null,
   scope:'PROCESS_LOCAL',provider_credits_verified:keyList(env).some(k=>state(k.id).status==='VERIFIED')};
 }
 async function reserve(env){
  const {id,a,dailyLimit,monthlyLimit}=account(env);
  if(accounting){
   try{await accounting.reserve({id,day:a.day,month:a.month,dailyLimit,monthlyLimit})}
   catch(e){if(e?.code==='FIRECRAWL_LOCAL_REQUEST_LIMIT')throw e;throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE')}
  }else{
   if(requireAccounting)throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE');
   if(a.daily>=dailyLimit||a.monthly>=monthlyLimit)throw error('FIRECRAWL_LOCAL_REQUEST_LIMIT');
   a.daily++;a.monthly++;
  }
 }
 // load(ctx) performs the provider request with ctx.apiKey; ctx also carries the account label and id for telemetry.
 async function read({env=process.env,url,load}){
  const {id}=account(env);
  // Opt-in: keep existing fresh-read behavior unless configured.
  const ttl=positive(env.FIRECRAWL_SHARED_CACHE_TTL_SECONDS,0,300)*1000;
  const cacheKey=id+'|'+url;
  const hit=cache.get(cacheKey);
  if(hit){if(ttl>0&&now()-hit.at<ttl)return {value:hit.value,source:'CACHE',key:hit.key};remove(cacheKey)}
  if(running.has(cacheKey)){const r=await running.get(cacheKey);return {value:r.value,source:'IN_FLIGHT',key:r.key}}
  const task=Promise.resolve().then(async()=>{
   const skip=new Set();
   for(;;){
    const entry=await select(env,skip);
    await reserve(env);
    try{
     const value=await load({apiKey:entry.key,label:entry.label,keyId:entry.id});
     const s=credits.get(entry.id);if(s)s.spent++;
     lastActive.set(id,entry.label);
     return {value,key:publicKey(entry)};
    }catch(e){
     // Only a confirmed exhaustion (402) moves this request to the next authorised key; never a 429 or other error.
     if(String(e?.code||'')==='FIRECRAWL_HTTP_402'){
      markExhausted(entry);
      if(failoverOn(env)&&keyList(env).some(k=>k.id!==entry.id&&!skip.has(k.id))){skip.add(entry.id);continue}
     }
     throw e;
    }
   }
  });
  running.set(cacheKey,task);
  try{
   const {value,key}=await task;
   const bytes=Buffer.byteLength(value?.html||'','utf8');
   if(ttl>0&&bytes>0&&bytes<=maxCacheBytes){
    for(const [k,v] of cache)if(now()-v.at>=300000)remove(k);
    while(cache.size>=maxEntries||cachedBytes+bytes>maxCacheBytes){const k=cache.keys().next().value;if(k===undefined)break;remove(k)}
    if(maxEntries>0){cache.set(cacheKey,{value,key,at:now(),bytes});cachedBytes+=bytes}
   }
   return {value,source:'REQUEST',key};
  }finally{running.delete(cacheKey)}
 }
 async function durableUsage(env=process.env){
  if(!accounting){if(requireAccounting)throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE');return usage(env)}
  const {id,a,dailyLimit,monthlyLimit}=account(env);
  const counts=await accounting.usage({id,day:a.day,month:a.month});
  return {...usage(env),daily_requests:counts.daily,monthly_requests:counts.monthly,scope:'POSTGRES_SHARED'};
 }
 // Module telemetry is booked on the account that made (or captured) the request; default: the primary account.
 async function record(env,module,event,keyId){
  if(!accounting?.record)return;
  const {id,a}=account(env);
  try{await accounting.record({id:keyId||id,day:a.day,module,event})}catch{/* Optional telemetry must not break quota enforcement or page reading. */}
 }
 async function moduleUsage(env=process.env,keyId){
  if(!accounting?.moduleUsage)return null;
  const {id,a}=account(env);
  return accounting.moduleUsage({id:keyId||id,day:a.day,month:a.month});
 }
 // Owner dashboard: one entry per configured account. Verifies credits with the provider (cached per interval).
 async function accountsSummary(env=process.env,{verify:doVerify=true}={}){
  const list=keyList(env);
  if(doVerify)await Promise.all(list.map(k=>verify(k,env).catch(()=>null)));
  let active=null;
  try{active=(await select(env)).label}catch{active=null}
  const {a}=account(env);
  return Promise.all(list.map(async k=>{
   const s=state(k.id);
   let modules=null;
   if(accounting?.moduleUsage){try{modules=await accounting.moduleUsage({id:k.id,day:a.day,month:a.month})}catch{modules=null}}
   return {label:k.label,active:k.label===active,
    credits:{status:s.status,remaining:Number.isFinite(s.remaining)?s.remaining:null,
     estimated_remaining:effective(s),spent_since_verification:s.spent||0,plan_credits:s.plan_credits??null,billing_period_end:s.billing_period_end??null,
     ...(s.check_error?{last_check_error:s.check_error}:{}),...(s.exhausted_by?{exhausted_by:s.exhausted_by}:{})},
    last_verified:s.verified_at!=null?new Date(s.verified_at).toISOString():null,
    last_checked:s.checked_at!=null?new Date(s.checked_at).toISOString():null,
    modules};
  }));
 }
 return {read,usage,durableUsage,record,moduleUsage,accounts:accountsSummary,verify:(env=process.env)=>Promise.all(keyList(env).map(k=>verify(k,env,{force:true})))};
}
const {productionAccounting}=require('./firecrawl-postgres-accounting.cjs');
const durable=productionAccounting();
const firecrawlManager=createFirecrawlManager({accounting:durable,requireAccounting:process.env.NODE_ENV==='production'});
module.exports={createFirecrawlManager,firecrawlManager,keyList};
