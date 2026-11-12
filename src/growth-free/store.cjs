'use strict';
// Own tables for the free Growth check; nothing here reads or writes Tracker data.
const crypto=require('node:crypto');

let ensured=null;
function ensureTables(pool){
 if(!ensured)ensured=(async()=>{
  // Adding a column takes the strongest table lock, even with IF NOT EXISTS, and it waits behind every open use of the
  // table (for example the previous app version during a deploy); every request then waits behind it. So: only missing
  // columns are added, and an ALTER waits at most 5 seconds for its lock (it is tried again on the next request).
  const tableExists=(await pool.query("SELECT to_regclass('growth_free_checks') AS t")).rows[0]?.t;
  const have=new Set(tableExists?(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='growth_free_checks'")).rows.map(r=>r.column_name):[]);
  const addColumn=async(name,type)=>{if(have.has(name))return;await pool.query("SET LOCAL lock_timeout='5s'; ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS "+name+' '+type);have.add(name)};
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
  await addColumn('access_label','TEXT');
  await addColumn('invite_id','BIGINT');
  // Optional writing for the visitor's selection: the last result and how many times it was used for this check.
  await addColumn('written','JSONB');
  // Persist the visitor's editorial choices across refreshes and device changes.
  await addColumn('selected_item_ids',"JSONB NOT NULL DEFAULT '[]'::jsonb");
  await addColumn('write_count','INTEGER NOT NULL DEFAULT 0');
  await addColumn('writing_since','TIMESTAMPTZ');
  await addColumn('writing_token','TEXT');
  // Target market and language chosen by the visitor (as in the Tracker); null = derived from the page.
  await addColumn('market','JSONB');
  // The language the visitor used the check in (en/nl/es): result page, messages and e-mails follow it.
  await addColumn('ui_lang','TEXT');
  // Measurement after publication (visitor's choice): the date the change went live and one e-mail about 4 weeks later.
  await addColumn('published_on','DATE');
  await addColumn('reminder_due_at','TIMESTAMPTZ');
  await addColumn('reminder_sent_at','TIMESTAMPTZ');
  await addColumn('reminder_attempts','INTEGER NOT NULL DEFAULT 0');
  await addColumn('reminder_token','TEXT');
  await addColumn('reminder_opt_out_at','TIMESTAMPTZ');
  // The domain the visitor used (one of this app's domains), so the e-mail links open on the same domain.
  await addColumn('reminder_base','TEXT');
  // Up to five addresses entered for the check (the first is `email`, which the daily limits count).
  await addColumn('emails','JSONB');
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
  // Optional Search Console exports uploaded by the visitor, per check (never in the Tracker). Removed with the check.
  await pool.query(`CREATE TABLE IF NOT EXISTS growth_free_gsc_uploads(
    id BIGSERIAL PRIMARY KEY,
    check_id BIGINT NOT NULL REFERENCES growth_free_checks(id) ON DELETE CASCADE,
    file_name TEXT,
    status TEXT NOT NULL,
    basis TEXT,
    period_start DATE,
    period_end DATE,
    totals JSONB,
    queries JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS growth_free_gsc_uploads_check_idx ON growth_free_gsc_uploads(check_id,created_at)');
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

// Only a result made by the same research code (engineVersion) is reused; older results are researched again.
async function recentResult(pool,{url,query,market=null,engineVersion=null}){
 if(!engineVersion)return null;
 return (await pool.query(`SELECT id,decision,summary,report FROM growth_free_checks
   WHERE url=$1 AND query=$2 AND COALESCE(market,'null'::jsonb)=$3::jsonb AND report->>'engine_version'=$4 AND status='DONE' AND created_at>NOW()-INTERVAL '24 hours' ORDER BY id DESC LIMIT 1`,[url,query,JSON.stringify(market||null),engineVersion])).rows[0]||null;
}

async function createCheck(pool,{email,emails=null,ipHash,url,host,query,marketingConsent,cached,accessLabel=null,inviteId=null,market=null,uiLang=null}){
 const row=(await pool.query(`INSERT INTO growth_free_checks
   (public_id,access_key,email,ip_hash,url,host,query,status,decision,summary,report,cached_from,marketing_consent,finished_at,access_label,invite_id,market,emails)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)
   RETURNING id,public_id,access_key,status`,
  [token(9),token(18),email,ipHash,url,host,query,cached?'DONE':'QUEUED',cached?cached.decision:null,
   cached?JSON.stringify(cached.summary):null,cached?JSON.stringify(cached.report):null,cached?cached.id:null,!!marketingConsent,cached?new Date():null,accessLabel,inviteId,JSON.stringify(market||null),JSON.stringify(emails&&emails.length>1?emails:null)])).rows[0];
 if(row&&uiLang)await pool.query('UPDATE growth_free_checks SET ui_lang=$2 WHERE id=$1',[row.id,uiLang]);
 if(row&&uiLang)row.ui_lang=uiLang;
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
   ,invite_id,written,selected_item_ids,write_count,market,email,emails,published_on::text AS published_on,reminder_due_at,reminder_sent_at,reminder_opt_out_at,ui_lang FROM growth_free_checks WHERE public_id=$1 LIMIT 1`,[String(publicId||'').slice(0,40)])).rows[0];
 if(!row||!sameKey(row.access_key,key))return null;
 // A check interrupted by a restart never stays "running" forever.
 if(['QUEUED','RUNNING'].includes(row.status)&&Date.now()-new Date(row.created_at).getTime()>15*60000){
  await setStatus(pool,row.id,{status:'FAILED',error_code:'INTERRUPTED'});row.status='FAILED';row.error_code='INTERRUPTED';
 }
 return row;
}

// Selection IDs are checked against the saved research by the route, not trusted from the browser.
async function saveSelection(pool,{checkId,itemIds}){
 const row=(await pool.query("UPDATE growth_free_checks SET selected_item_ids=$2::jsonb WHERE id=$1 AND status='DONE' RETURNING selected_item_ids",[checkId,JSON.stringify(itemIds)])).rows[0];
 return row?row.selected_item_ids:null;
}

// Counts one writing run and keeps its result; refuses when the limit is reached (atomic).
// One writing run per check at a time, fenced by a token: claiming returns a new token (a run that never finished gives
// way after ten minutes, and its token stops counting). Storing and releasing only work with the token of the ACTIVE
// run, so a late run can neither store its result nor clear the lock of the run that took over.
async function claimWriting(pool,{checkId}){
 const token=require('node:crypto').randomUUID();
 const row=(await pool.query(`UPDATE growth_free_checks SET writing_since=NOW(),writing_token=$2 WHERE id=$1 AND (writing_since IS NULL OR writing_since<NOW()-INTERVAL '10 minutes') RETURNING id`,[checkId,token])).rows[0];
 return row?token:null;
}
async function releaseWriting(pool,{checkId,token}){
 await pool.query('UPDATE growth_free_checks SET writing_since=NULL,writing_token=NULL WHERE id=$1 AND writing_token=$2',[checkId,String(token||'')]);
}
// Returns {write_count}, or {superseded:true} when this run no longer holds the lock, or null when the limit is reached.
// AI writing runs of visitors' checks in the last 24 hours (the owner's checks do not count): for the daily cap.
async function writesToday(pool){
 return Number((await pool.query("SELECT COALESCE(SUM(write_count),0)::int AS n FROM growth_free_checks WHERE created_at>NOW()-INTERVAL '24 hours' AND COALESCE(access_label,'')<>'admin'")).rows[0]?.n||0);
}
async function recordWriting(pool,{checkId,written,limit,token=null}){
 const row=(await pool.query(`UPDATE growth_free_checks SET written=$2::jsonb,write_count=write_count+1,writing_since=NULL,writing_token=NULL
   WHERE id=$1 AND write_count<$3 AND ($4::text IS NULL OR writing_token=$4) RETURNING write_count`,[checkId,JSON.stringify(written),limit,token])).rows[0];
 if(row)return row;
 if(token){const now=(await pool.query('SELECT writing_token FROM growth_free_checks WHERE id=$1',[checkId])).rows[0];if(!now||now.writing_token!==token)return {superseded:true}}
 return null;
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
 const c=await pool.query("DELETE FROM growth_free_checks WHERE email=$1 OR COALESCE(emails,'[]'::jsonb) ? $1",[email]);
 return {checks:c.rowCount||0,hire_requests:h.rowCount||0};
}

// The publication date and the reminder. A changed date moves the reminder and sends it again; no reminder = cleared.
async function setPublication(pool,{checkId,publishedOn,dueAt,base=null}){
 return (await pool.query(`UPDATE growth_free_checks SET
    reminder_sent_at=CASE WHEN published_on IS NOT DISTINCT FROM $2::date AND reminder_due_at IS NOT DISTINCT FROM $3::timestamptz THEN reminder_sent_at ELSE NULL END,
    reminder_attempts=CASE WHEN published_on IS NOT DISTINCT FROM $2::date AND reminder_due_at IS NOT DISTINCT FROM $3::timestamptz THEN reminder_attempts ELSE 0 END,
    published_on=$2::date,reminder_due_at=$3::timestamptz,reminder_token=COALESCE(reminder_token,$4),reminder_opt_out_at=CASE WHEN $3::timestamptz IS NULL THEN reminder_opt_out_at ELSE NULL END,reminder_base=COALESCE($5,reminder_base)
   WHERE id=$1 RETURNING emails,published_on::text AS published_on,reminder_due_at,reminder_sent_at,reminder_token,reminder_base,email`,[checkId,publishedOn||null,dueAt||null,token(18),base])).rows[0]||null;
}
async function dueReminders(pool,{now=new Date(),limit=50}={}){
 return (await pool.query(`SELECT id,public_id,access_key,email,emails,access_label,invite_id,url,query,summary,market,report->'search_discovery'->'search_locale'->>'hl' AS hl,published_on::text AS published_on,reminder_token,reminder_base FROM growth_free_checks
   WHERE reminder_due_at<=$1 AND reminder_sent_at IS NULL AND reminder_opt_out_at IS NULL AND reminder_attempts<3 AND status='DONE' ORDER BY reminder_due_at LIMIT $2`,[now,limit])).rows;
}
async function markReminder(pool,{id,sent}){
 await pool.query('UPDATE growth_free_checks SET reminder_attempts=reminder_attempts+1,reminder_sent_at=CASE WHEN $2 THEN NOW() ELSE reminder_sent_at END WHERE id=$1',[id,!!sent]);
}
// Unsubscribe from the e-mail link: only the reminder stops; the check and its result stay.
async function optOutReminder(pool,t){
 const v=String(t||'');if(!/^[A-Za-z0-9_-]{16,64}$/.test(v))return 0;
 return (await pool.query('UPDATE growth_free_checks SET reminder_opt_out_at=COALESCE(reminder_opt_out_at,NOW()) WHERE reminder_token=$1',[v])).rowCount||0;
}
async function saveGscUpload(pool,{checkId,fileName,upload}){
 return (await pool.query(`INSERT INTO growth_free_gsc_uploads(check_id,file_name,status,basis,period_start,period_end,totals,queries)
   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id,created_at`,[checkId,String(fileName||'').slice(0,200),upload.status,upload.basis||null,
   upload.period&&upload.period.start||null,upload.period&&upload.period.end||null,JSON.stringify(upload.totals||null),JSON.stringify(upload.queries||[])])).rows[0];
}
async function listGscUploads(pool,checkId){
 return (await pool.query("SELECT id,file_name,status,basis,period_start::text AS period_start,period_end::text AS period_end,totals,queries,created_at FROM growth_free_gsc_uploads WHERE check_id=$1 ORDER BY created_at,id",[checkId])).rows;
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

module.exports={writesToday,saveSelection,setPublication,dueReminders,markReminder,optOutReminder,saveGscUpload,listGscUploads,claimWriting,releaseWriting,recordWriting,saveAiAnswer,listAiAnswers,createInvite,getInvite,consumeInvite,refundInvite,listInvites,revokeInvite,inviteStatus,ensureTables,usage,recentResult,createCheck,setStatus,getCheck,createHireRequest,listLeads,forgetEmail,hashIp,sameKey};
