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
  await pool.query('ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS invite_id BIGINT');
  // Optional writing for the visitor's selection: the last result and how many times it was used for this check.
  await pool.query('ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS written JSONB');
  await pool.query('ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS write_count INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS writing_since TIMESTAMPTZ');
  // Personal invitations: only a SHA-256 hash of the link token is stored.
  await pool.query(`CREATE TABLE IF NOT EXISTS growth_free_invites(
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    email_lock TEXT,
    max_checks INTEGER NOT NULL,
    used_checks INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
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
  // AI answers pasted by the visitor, one per AI system per check (latest wins).
  await pool.query(`CREATE TABLE IF NOT EXISTS growth_free_ai_answers(
    id BIGSERIAL PRIMARY KEY,
    check_id BIGINT NOT NULL REFERENCES growth_free_checks(id) ON DELETE CASCADE,
    engine TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    parsed JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(check_id,engine))`);
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

async function createCheck(pool,{email,ipHash,url,host,query,marketingConsent,cached,accessLabel=null,inviteId=null}){
 const row=(await pool.query(`INSERT INTO growth_free_checks
   (public_id,access_key,email,ip_hash,url,host,query,status,decision,summary,report,cached_from,marketing_consent,finished_at,access_label,invite_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16)
   RETURNING id,public_id,access_key,status`,
  [token(9),token(18),email,ipHash,url,host,query,cached?'DONE':'QUEUED',cached?cached.decision:null,
   cached?JSON.stringify(cached.summary):null,cached?JSON.stringify(cached.report):null,cached?cached.id:null,!!marketingConsent,cached?new Date():null,accessLabel,inviteId])).rows[0];
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
   ,invite_id,written,write_count FROM growth_free_checks WHERE public_id=$1 LIMIT 1`,[String(publicId||'').slice(0,40)])).rows[0];
 if(!row||!sameKey(row.access_key,key))return null;
 // A check interrupted by a restart never stays "running" forever.
 if(['QUEUED','RUNNING'].includes(row.status)&&Date.now()-new Date(row.created_at).getTime()>15*60000){
  await setStatus(pool,row.id,{status:'FAILED',error_code:'INTERRUPTED'});row.status='FAILED';row.error_code='INTERRUPTED';
 }
 return row;
}

// Counts one writing run and keeps its result; refuses when the limit is reached (atomic).
// One writing run per check at a time (a run that never finished gives way after ten minutes). The concept and the items
// it completes are stored in one UPDATE, which also ends the run; a failed run only ends it.
async function claimWriting(pool,{checkId}){
 return !!(await pool.query(`UPDATE growth_free_checks SET writing_since=NOW() WHERE id=$1 AND (writing_since IS NULL OR writing_since<NOW()-INTERVAL '10 minutes') RETURNING id`,[checkId])).rows[0];
}
async function releaseWriting(pool,{checkId}){await pool.query('UPDATE growth_free_checks SET writing_since=NULL WHERE id=$1',[checkId])}
async function recordWriting(pool,{checkId,written,limit}){
 return (await pool.query('UPDATE growth_free_checks SET written=$2::jsonb,write_count=write_count+1,writing_since=NULL WHERE id=$1 AND write_count<$3 RETURNING write_count',
  [checkId,JSON.stringify(written),limit])).rows[0]||null;
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

async function saveAiAnswer(pool,{checkId,engine,rawText,parsed}){
 await pool.query(`INSERT INTO growth_free_ai_answers(check_id,engine,raw_text,parsed) VALUES ($1,$2,$3,$4::jsonb)
   ON CONFLICT (check_id,engine) DO UPDATE SET raw_text=EXCLUDED.raw_text,parsed=EXCLUDED.parsed,created_at=NOW()`,[checkId,engine,rawText,JSON.stringify(parsed)]);
}
async function listAiAnswers(pool,checkId){
 return (await pool.query('SELECT engine,raw_text,parsed,created_at FROM growth_free_ai_answers WHERE check_id=$1 ORDER BY engine',[checkId])).rows;
}
const hashToken=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const INVITE_COLUMNS='id,label,email_lock,max_checks,used_checks,expires_at,revoked_at,last_used_at,created_at';
function inviteStatus(inv,now=Date.now()){
 if(!inv)return 'NOT_FOUND';
 if(inv.revoked_at)return 'REVOKED';
 if(new Date(inv.expires_at).getTime()<=now)return 'EXPIRED';
 if(Number(inv.used_checks)>=Number(inv.max_checks))return 'USED_UP';
 return 'ACTIVE';
}
// The link token is returned once, at creation; it cannot be recovered later.
async function createInvite(pool,{label,emailLock=null,maxChecks,days}){
 const t=token(24);
 const row=(await pool.query(`INSERT INTO growth_free_invites(token_hash,label,email_lock,max_checks,expires_at)
   VALUES ($1,$2,$3,$4,NOW()+make_interval(days=>$5)) RETURNING ${INVITE_COLUMNS}`,[hashToken(t),label,emailLock,maxChecks,days])).rows[0];
 return {...row,token:t};
}
async function getInvite(pool,t){
 if(!/^[A-Za-z0-9_-]{20,80}$/.test(String(t||'')))return null;
 return (await pool.query(`SELECT ${INVITE_COLUMNS} FROM growth_free_invites WHERE token_hash=$1 LIMIT 1`,[hashToken(t)])).rows[0]||null;
}
// Atomic: two simultaneous requests can never use more than max_checks.
async function consumeInvite(pool,id){
 return (await pool.query(`UPDATE growth_free_invites SET used_checks=used_checks+1,last_used_at=NOW()
   WHERE id=$1 AND revoked_at IS NULL AND expires_at>NOW() AND used_checks<max_checks RETURNING ${INVITE_COLUMNS}`,[id])).rows[0]||null;
}
async function refundInvite(pool,id){
 await pool.query('UPDATE growth_free_invites SET used_checks=GREATEST(used_checks-1,0) WHERE id=$1',[id]);
}
async function listInvites(pool){
 return (await pool.query(`SELECT ${INVITE_COLUMNS} FROM growth_free_invites ORDER BY id DESC LIMIT 200`)).rows;
}
async function revokeInvite(pool,id){
 return (await pool.query('UPDATE growth_free_invites SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id])).rows[0]||null;
}

module.exports={claimWriting,releaseWriting,recordWriting,saveAiAnswer,listAiAnswers,createInvite,getInvite,consumeInvite,refundInvite,listInvites,revokeInvite,inviteStatus,ensureTables,usage,recentResult,createCheck,setStatus,getCheck,createHireRequest,listLeads,forgetEmail,hashIp,sameKey};
