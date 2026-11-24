'use strict';
// GSC reports: the analysis (never the uploaded files) with a secret link. The link is the only way to read a report;
// it stops working when it expires or the owner revokes it.
const crypto=require('node:crypto');

const token=()=>crypto.randomBytes(24).toString('base64url');
const COLUMNS='id,token,title,site,lang,report,created_at,expires_at,revoked_at,views,last_viewed_at,growth_invite';

async function ensureTables(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS gsc_reports(
   id BIGSERIAL PRIMARY KEY,
   token TEXT NOT NULL UNIQUE,
   title TEXT NOT NULL DEFAULT '',
   site TEXT NOT NULL DEFAULT '',
   lang TEXT NOT NULL DEFAULT 'en',
   report JSONB NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   expires_at TIMESTAMPTZ NOT NULL,
   revoked_at TIMESTAMPTZ,
   views INT NOT NULL DEFAULT 0,
   last_viewed_at TIMESTAMPTZ,
   growth_invite TEXT)`);
 await pool.query('CREATE INDEX IF NOT EXISTS gsc_reports_created_idx ON gsc_reports(created_at DESC)');
}
async function createReport(pool,{title,site,lang,report,days,growthInvite=null}){
 const t=token();
 return (await pool.query(`INSERT INTO gsc_reports(token,title,site,lang,report,expires_at,growth_invite)
   VALUES ($1,$2,$3,$4,$5::jsonb,NOW()+make_interval(days=>$6),$7) RETURNING ${COLUMNS}`,
   [t,String(title||'').slice(0,160),String(site||'').slice(0,200),lang,JSON.stringify(report),days,growthInvite])).rows[0];
}
// A readable report: the right token, not revoked, not expired. Each read is counted for the owner's list.
async function openReport(pool,t,{count=true}={}){
 if(!/^[A-Za-z0-9_-]{24,64}$/.test(String(t||'')))return null;
 const sql=count?`UPDATE gsc_reports SET views=views+1,last_viewed_at=NOW() WHERE token=$1 AND revoked_at IS NULL AND expires_at>NOW() RETURNING ${COLUMNS}`
  :`SELECT ${COLUMNS} FROM gsc_reports WHERE token=$1 AND revoked_at IS NULL AND expires_at>NOW()`;
 return (await pool.query(sql,[t])).rows[0]||null;
}
async function listReports(pool,{limit=100}={}){
 return (await pool.query(`SELECT id,token,title,site,lang,created_at,expires_at,revoked_at,views,last_viewed_at,growth_invite IS NOT NULL AS growth,report->>'scope' AS scope
   FROM gsc_reports ORDER BY created_at DESC LIMIT $1`,[limit])).rows;
}
async function revokeReport(pool,id){
 return (await pool.query('UPDATE gsc_reports SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id])).rows[0]||null;
}
// Deleted for good: the link stops working. The Free Growth invitation (if any) is returned so it can be withdrawn too.
async function deleteReports(pool,ids){
 if(!ids||!ids.length)return [];
 return (await pool.query('DELETE FROM gsc_reports WHERE id=ANY($1::bigint[]) RETURNING id,growth_invite',[ids])).rows.map(r=>({id:Number(r.id),growth_invite:r.growth_invite}));
}
// A newer export (before/after): replaces an earlier one, the report itself stays as it was.
async function setAfter(pool,id,snap){
 return (await pool.query(`UPDATE gsc_reports SET report=jsonb_set(report,'{after}',$2::jsonb) WHERE id=$1 RETURNING id`,[id,JSON.stringify(snap)])).rows[0]||null;
}
// Atomic per-page update: preserve concurrent scans and original GSC evidence.
async function saveContentScore(pool,token,url,result){
 return (await pool.query(`UPDATE gsc_reports SET report=jsonb_set(report,'{contentscores}',COALESCE(report->'contentscores','{}'::jsonb)||jsonb_build_object($2::text,(CASE jsonb_typeof(report->'contentscores'->$2::text) WHEN 'array' THEN report->'contentscores'->$2::text WHEN 'object' THEN jsonb_build_array(report->'contentscores'->$2::text) ELSE '[]'::jsonb END)||jsonb_build_array($3::jsonb)),true) WHERE token=$1 AND revoked_at IS NULL AND expires_at>NOW() RETURNING id`,[token,url,JSON.stringify(result)])).rows[0]||null;
}
module.exports={ensureTables,createReport,openReport,listReports,revokeReport,deleteReports,setAfter,saveContentScore};
