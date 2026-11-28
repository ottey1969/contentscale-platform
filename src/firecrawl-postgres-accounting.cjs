'use strict';
// Atomic durable reservations. Count attempted requests conservatively, including failed provider calls.
// A single monthly row serializes concurrent reservations across Railway replicas.
const SCHEMA=`CREATE TABLE IF NOT EXISTS firecrawl_request_usage (
 account_hash text NOT NULL,
 month_utc date NOT NULL,
 monthly_requests bigint NOT NULL DEFAULT 0 CHECK (monthly_requests >= 0),
 days jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY (account_hash, month_utc)
)`;
const MODULE_SCHEMA=`CREATE TABLE IF NOT EXISTS firecrawl_module_usage (
 account_hash text NOT NULL, day_utc date NOT NULL, module text NOT NULL,
 requests bigint NOT NULL DEFAULT 0, used bigint NOT NULL DEFAULT 0,
 fallbacks bigint NOT NULL DEFAULT 0, cache_hits bigint NOT NULL DEFAULT 0,
 errors bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(account_hash,day_utc,module)
)`;
const MODULES=new Set(['FREE_GROWTH','GSC_AUDIT','TRACKER_GROWTH','GOOGLE_COMPETITOR','AI_GAP',
 'FREE_PREWRITE','TRACKER_PREWRITE','NETWORK_PREWRITE','CEO_SCAN','QUICK_SCAN','UNCLASSIFIED']);
const safeModule=m=>MODULES.has(m)?m:'UNCLASSIFIED';
const RESERVE=`INSERT INTO firecrawl_request_usage AS u(account_hash,month_utc,monthly_requests,days)
 SELECT $1,$2::date,1,jsonb_build_object($3::text,1)
 WHERE $4::bigint > 0 AND $5::bigint > 0
 ON CONFLICT(account_hash,month_utc) DO UPDATE SET
 monthly_requests=u.monthly_requests+1,
 days=jsonb_set(u.days,ARRAY[$3::text],to_jsonb(COALESCE((u.days->>$3::text)::bigint,0)+1),true)
 WHERE u.monthly_requests < $5::bigint
 AND COALESCE((u.days->>$3::text)::bigint,0) < $4::bigint
 RETURNING monthly_requests,(days->>$3::text)::bigint AS daily_requests`;
function createFirecrawlPostgresAccounting(pool){
 if(typeof pool?.connect!=='function')throw Error('FIRECRAWL_DATABASE_REQUIRED');
 let ready=null;
 function ensure(){
  if(!ready)ready=(async()=>{
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(193428657, 558)");
    await client.query(SCHEMA);
    await client.query(MODULE_SCHEMA);
    await client.query('ALTER TABLE firecrawl_module_usage ADD COLUMN IF NOT EXISTS errors bigint NOT NULL DEFAULT 0');
    await client.query('COMMIT');
   }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}
   finally{client.release()}
  })().catch(e=>{ready=null;throw e});
  return ready;
 }
 const bound=n=>Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;
 async function reserve({id,day,month,dailyLimit,monthlyLimit}){
  await ensure();
  const result=await pool.query(RESERVE,[id,month+'-01',day,bound(dailyLimit),bound(monthlyLimit)]);
  if(!result.rows.length)throw Object.assign(Error('FIRECRAWL_LOCAL_REQUEST_LIMIT'),{code:'FIRECRAWL_LOCAL_REQUEST_LIMIT'});
  return {daily:Number(result.rows[0].daily_requests),monthly:Number(result.rows[0].monthly_requests)};
 }
 async function usage({id,day,month}){
  await ensure();
  const result=await pool.query("SELECT monthly_requests,COALESCE((days->>$3::text)::bigint,0) AS daily_requests FROM firecrawl_request_usage WHERE account_hash=$1 AND month_utc=$2::date",[id,month+'-01',day]);
  return {daily:Number(result.rows[0]?.daily_requests||0),monthly:Number(result.rows[0]?.monthly_requests||0)};
 }
 async function record({id,day,module,event}){
  const column={request:'requests',used:'used',fallback:'fallbacks',cache:'cache_hits',error:'errors'}[event];
  if(!['requests','used','fallbacks','cache_hits','errors'].includes(column))throw Error('FIRECRAWL_INVALID_EVENT');
  await ensure();
  await pool.query(`INSERT INTO firecrawl_module_usage AS u(account_hash,day_utc,module,${column})
   VALUES($1,$2::date,$3,1) ON CONFLICT(account_hash,day_utc,module)
   DO UPDATE SET ${column}=u.${column}+1`,[id,day,safeModule(module)]);
 }
 async function moduleUsage({id,day,month}){
  await ensure();
  const result=await pool.query(`SELECT module,
   SUM(requests)::bigint AS requests,SUM(used)::bigint AS used,
   SUM(fallbacks)::bigint AS fallbacks,SUM(cache_hits)::bigint AS cache_hits,SUM(errors)::bigint AS errors,
   COALESCE(SUM(requests) FILTER(WHERE day_utc=$2::date),0)::bigint AS daily_requests
   FROM firecrawl_module_usage WHERE account_hash=$1 AND day_utc >= $3::date
   AND day_utc < ($3::date+INTERVAL '1 month') GROUP BY module ORDER BY module`,[id,day,month+'-01']);
  return result.rows.map(r=>({module:r.module,requests:Number(r.requests),used:Number(r.used),fallbacks:Number(r.fallbacks),cache_hits:Number(r.cache_hits),errors:Number(r.errors),daily_requests:Number(r.daily_requests)}));
 }
 return {reserve,usage,record,moduleUsage};
}
function productionAccounting(env=process.env){
 if(!env.DATABASE_URL)return null;
 const {Pool}=require('pg');
 const pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,max:2,connectionTimeoutMillis:4000,statement_timeout:5000,query_timeout:6000,idleTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.warn('[firecrawl] accounting connection unavailable'));
 return createFirecrawlPostgresAccounting(pool);
}
module.exports={createFirecrawlPostgresAccounting,productionAccounting,SCHEMA,RESERVE,MODULES};
