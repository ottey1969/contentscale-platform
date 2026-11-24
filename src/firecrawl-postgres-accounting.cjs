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
 return {reserve,usage};
}
function productionAccounting(env=process.env){
 if(!env.DATABASE_URL)return null;
 const {Pool}=require('pg');
 const pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,max:2,connectionTimeoutMillis:4000,statement_timeout:5000,query_timeout:6000,idleTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.warn('[firecrawl] accounting connection unavailable'));
 return createFirecrawlPostgresAccounting(pool);
}
module.exports={createFirecrawlPostgresAccounting,productionAccounting,SCHEMA,RESERVE};
