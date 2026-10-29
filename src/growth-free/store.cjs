'use strict';
// Own tables for the free Growth check; nothing here reads or writes Tracker data.
const crypto=require('node:crypto');

let ensured=null;
function ensureTables(pool){
 if(!ensured)ensured=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS growth_free_checks(
    id BIGSERIAL PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    access_key TEXT NOT NULL,
    email TEXT NOT NULL,
    ip_hash TEXT,
    url TEXT NOT NULL,
    host TEXT NOT NULL,
    query TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    decision TEXT,
    summary JSONB,
    report JSONB,
    error_code TEXT,
    cached_from BIGINT,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ)`);
  await pool.query('ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS access_label TEXT');
  await pool.query('CREATE INDEX IF NOT EXISTS growth_free_checks_email_idx ON growth_free_checks(email,created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS growth_free_checks_url_idx ON growth_free_checks(url,query,created_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS growth_free_hire_requests(
    id BIGSERIAL PRIMARY KEY,
    check_id BIGINT REFERENCES growth_free_checks(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 })().catch(e=>{ensured=null;throw e});
 return ensured;
}

const token=n=>crypto.randomBytes(n).toString('base64url');
const hashIp=(ip,salt)=>ip?crypto.createHash('sha256').update(String(salt||'')+'|'+ip).digest('hex').slice(0,32):null;
const sameKey=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};

async function usage(pool,{email,ipHash,accessLabel=null}){
 const r=(await pool.query(`SELECT
   COUNT(*) FILTER (WHERE email=$1 AND cached_from IS NULL) AS by_email,
   COUNT(*) FILTER (WHERE ip_hash=$2 AND cached_from IS NULL) AS by_ip,
   COUNT(*) FILTER (WHERE cached_from IS NULL) AS total,
   COUNT(*) FILTER (WHERE access_label=$3 AND cached_from IS NULL) AS by_key
   FROM growth_free_checks WHERE created_at>NOW()-INTERVAL '24 hours'`,[email,ipHash,accessLabel])).rows[0]||{};
 return {by_email:Number(r.by_email)||0,by_ip:Number(r.by_ip)||0,total:Number(r.total)||0,by_key:Number(r.by_key)||0};
}

async function recentResult(pool,{url,query}){
 return (await pool.query(`SELECT id,decision,summary,report FROM growth_free_checks
   WHERE url=$1 AND query=$2 AND status='DONE' AND created_at>NOW()-INTERVAL '24 hours' ORDER BY id DESC LIMIT 1`,[url,query])).rows[0]||null;
}

async function createCheck(pool,{email,ipHash,url,host,query,marketingConsent,cached,accessLabel=null}){
 const row=(await pool.query(`INSERT INTO growth_free_checks
   (public_id,access_key,email,ip_hash,url,host,query,status,decision,summary,report,cached_from,marketing_consent,finished_at,access_label)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)
   RETURNING id,public_id,access_key,status`,
  [token(9),token(18),email,ipHash,url,host,query,cached?'DONE':'QUEUED',cached?cached.decision:null,
   cached?JSON.stringify(cached.summary):null,cached?JSON.stringify(cached.report):null,cached?cached.id:null,!!marketingConsent,cached?new Date():null,accessLabel])).rows[0];
 return row;
}

async function setStatus(pool,id,fields){
 const {status,decision=null,summary=null,report=null,error_code=null}=fields;
 await pool.query(`UPDATE growth_free_checks SET status=$2,decision=$3,summary=$4::jsonb,report=$5::jsonb,error_code=$6,
   finished_at=CASE WHEN $2 IN ('DONE','FAILED') THEN NOW() ELSE finished_at END WHERE id=$1`,
  [id,status,decision,summary?JSON.stringify(summary):null,report?JSON.stringify(report):null,error_code]);
}

async function getCheck(pool,publicId,key){
 const row=(await pool.query(`SELECT id,public_id,access_key,url,query,status,decision,summary,report,error_code,cached_from,created_at,finished_at,access_label
   FROM growth_free_checks WHERE public_id=$1 LIMIT 1`,[String(publicId||'').slice(0,40)])).rows[0];
 if(!row||!sameKey(row.access_key,key))return null;
 // A check interrupted by a restart never stays "running" forever.
 if(['QUEUED','RUNNING'].includes(row.status)&&Date.now()-new Date(row.created_at).getTime()>15*60000){
  await setStatus(pool,row.id,{status:'FAILED',error_code:'INTERRUPTED'});row.status='FAILED';row.error_code='INTERRUPTED';
 }
 return row;
}

async function createHireRequest(pool,{checkId,name,email,company,phone,message}){
 return (await pool.query(`INSERT INTO growth_free_hire_requests(check_id,name,email,company,phone,message)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,[checkId,name,email,company||null,phone||null,message||null])).rows[0];
}

async function listLeads(pool,{limit=200}={}){
 const checks=(await pool.query(`SELECT id,public_id,email,url,query,status,decision,error_code,cached_from IS NOT NULL AS cached,marketing_consent,access_label,created_at
   FROM growth_free_checks ORDER BY id DESC LIMIT $1`,[limit])).rows;
 const hires=(await pool.query(`SELECT h.id,h.check_id,h.name,h.email,h.company,h.phone,h.message,h.status,h.created_at,c.url,c.query,c.decision,c.access_label
   FROM growth_free_hire_requests h LEFT JOIN growth_free_checks c ON c.id=h.check_id ORDER BY h.id DESC LIMIT $1`,[limit])).rows;
 return {checks,hires};
}

async function forgetEmail(pool,email){
 const h=await pool.query('DELETE FROM growth_free_hire_requests WHERE email=$1',[email]);
 const c=await pool.query('DELETE FROM growth_free_checks WHERE email=$1',[email]);
 return {checks:c.rowCount||0,hire_requests:h.rowCount||0};
}

module.exports={ensureTables,usage,recentResult,createCheck,setStatus,getCheck,createHireRequest,listLeads,forgetEmail,hashIp,sameKey};
