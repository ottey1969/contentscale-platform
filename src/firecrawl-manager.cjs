'use strict';
// Process-local request accounting, bounded cache and in-flight coalescing.
// Counts attempted HTTP requests, not provider-billed credits. No API key is retained or logged.
const {createHash}=require('node:crypto');
const positive=(value,fallback,max)=>{
 const n=Number(value);return value!=null&&String(value).trim()!==''&&Number.isSafeInteger(n)&&n>=0?Math.min(n,max):fallback;
};
const error=code=>Object.assign(Error(code),{code});
function createFirecrawlManager({now=Date.now,maxEntries=100,maxCacheBytes=16*1024*1024,accounting=null,requireAccounting=false}={}){
 const cache=new Map(),running=new Map(),accounts=new Map();
 let cachedBytes=0;
 const remove=k=>{const hit=cache.get(k);if(hit){cachedBytes-=hit.bytes;cache.delete(k)}};
 const account=(env)=>{
  const id=createHash('sha256').update(String(env.FIRECRAWL_API_KEY||'').trim()).digest('hex');
  const iso=new Date(now()).toISOString(),day=iso.slice(0,10),month=iso.slice(0,7);
  let a=accounts.get(id);
  if(!a){a={day,month,daily:0,monthly:0};accounts.set(id,a)}
  if(a.month!==month){a.month=month;a.monthly=0}
  if(a.day!==day){a.day=day;a.daily=0}
  return {id,a,dailyLimit:positive(env.FIRECRAWL_DAILY_REQUEST_LIMIT,Infinity,1000000),
   monthlyLimit:positive(env.FIRECRAWL_MONTHLY_REQUEST_LIMIT,Infinity,10000000)};
 };
 function usage(env=process.env){
  const {a,dailyLimit,monthlyLimit}=account(env);
  return {day_utc:a.day,month_utc:a.month,daily_requests:a.daily,monthly_requests:a.monthly,
   daily_limit:Number.isFinite(dailyLimit)?dailyLimit:null,monthly_limit:Number.isFinite(monthlyLimit)?monthlyLimit:null,
   scope:'PROCESS_LOCAL',provider_credits_verified:false};
 }
 async function read({env=process.env,url,load}){
  const {id,a,dailyLimit,monthlyLimit}=account(env);
  // Opt-in: keep existing fresh-read behavior unless configured.
  const ttl=positive(env.FIRECRAWL_SHARED_CACHE_TTL_SECONDS,0,300)*1000;
  const key=id+'|'+url;
  const hit=cache.get(key);
  if(hit){if(ttl>0&&now()-hit.at<ttl)return {value:hit.value,source:'CACHE'};remove(key)}
  if(running.has(key))return {value:await running.get(key),source:'IN_FLIGHT'};
  const task=Promise.resolve().then(async()=>{
   if(accounting){
    try{await accounting.reserve({id,day:a.day,month:a.month,dailyLimit,monthlyLimit})}
    catch(e){if(e?.code==='FIRECRAWL_LOCAL_REQUEST_LIMIT')throw e;throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE')}
   }else{
    if(requireAccounting)throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE');
    if(a.daily>=dailyLimit||a.monthly>=monthlyLimit)throw error('FIRECRAWL_LOCAL_REQUEST_LIMIT');
    a.daily++;a.monthly++;
   }
   return load();
  });
  running.set(key,task);
  try{
   const value=await task;
   const bytes=Buffer.byteLength(value?.html||'','utf8');
   if(ttl>0&&bytes>0&&bytes<=maxCacheBytes){
    for(const [k,v] of cache)if(now()-v.at>=300000)remove(k);
    while(cache.size>=maxEntries||cachedBytes+bytes>maxCacheBytes){const k=cache.keys().next().value;if(k===undefined)break;remove(k)}
    if(maxEntries>0){cache.set(key,{value,at:now(),bytes});cachedBytes+=bytes}
   }
   return {value,source:'REQUEST'};
  }finally{running.delete(key)}
 }
 async function durableUsage(env=process.env){
  if(!accounting){if(requireAccounting)throw error('FIRECRAWL_ACCOUNTING_UNAVAILABLE');return usage(env)}
  const {id,a,dailyLimit,monthlyLimit}=account(env);
  const counts=await accounting.usage({id,day:a.day,month:a.month});
  return {...usage(env),daily_requests:counts.daily,monthly_requests:counts.monthly,scope:'POSTGRES_SHARED'};
 }
 async function record(env,module,event){
  if(!accounting?.record)return;
  const {id,a}=account(env);
  try{await accounting.record({id,day:a.day,module,event})}catch{/* Optional telemetry must not break quota enforcement or page reading. */}
 }
 async function moduleUsage(env=process.env){
  if(!accounting?.moduleUsage)return null;
  const {id,a}=account(env);
  return accounting.moduleUsage({id,day:a.day,month:a.month});
 }
 return {read,usage,durableUsage,record,moduleUsage};
}
const {productionAccounting}=require('./firecrawl-postgres-accounting.cjs');
const durable=productionAccounting();
const firecrawlManager=createFirecrawlManager({accounting:durable,requireAccounting:process.env.NODE_ENV==='production'});
module.exports={createFirecrawlManager,firecrawlManager};
