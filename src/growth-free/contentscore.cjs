'use strict';
function compare(history){
 const h=Array.isArray(history)?history:[],baseline=h[0]||null,current=h[h.length-1]||null;
 const titles=x=>new Set((x?.recommendations||[]).map(r=>r.title).filter(Boolean));
 const a=titles(baseline),b=titles(current),comparable=h.length>1;
 return {baseline,current,delta:comparable?current.score-baseline.score:null,noLongerReported:comparable?[...a].filter(t=>!b.has(t)):[],remaining:comparable?[...a].filter(t=>b.has(t)):[],newlyReported:comparable?[...b].filter(t=>!a.has(t)):[]};
}
function mergeHistory(url,...groups){
 const seen=new Map();
 for(const group of groups)for(const item of Array.isArray(group)?group:[]){
  if(!item||item.url!==url||!Number.isFinite(Date.parse(item.scanned_at)))continue;
  const key=JSON.stringify([item.scanned_at,item.score,item.recommendations]);if(!seen.has(key))seen.set(key,item);
 }
 return [...seen.values()].sort((a,b)=>Date.parse(a.scanned_at)-Date.parse(b.scanned_at));
}
const hashToken=t=>require('node:crypto').createHash('sha256').update(String(t)).digest('hex');
async function relatedChecks(pool,urls,{invite=null,reportId=null,owner=false}={}){
 const result=await pool.query(`WITH invited AS (
   SELECT id FROM growth_free_invites WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()
 )
 SELECT c.url,c.public_id,c.access_key,c.contentscore_history,c.published_on::text,c.published_note,c.finished_at,
   EXISTS(SELECT 1 FROM invited i WHERE i.id=c.invite_id) AS matching_invite
 FROM growth_free_checks c
 WHERE c.status='DONE' AND c.url=ANY($2::text[])
   AND (c.invite_id IN (SELECT id FROM invited) OR ($4::boolean AND EXISTS(
      SELECT 1 FROM growth_free_gsc_uploads u
      WHERE u.check_id=c.id AND u.gsc_report_id=$3 AND u.status='VERIFIED_FOR_PAGE'
         AND u.basis='GSC_AUDIT_EXACT_PAGE')))
 ORDER BY c.finished_at DESC NULLS LAST,c.id DESC`,[invite?hashToken(invite):'',urls,reportId,owner]);
 return result.rows;
}

async function sharedHistory(pool,row){
 if(!pool||!row)return [];
 try{
  const invite=row.invite_id?(await pool.query('SELECT token_hash FROM growth_free_invites WHERE id=$1 AND revoked_at IS NULL AND expires_at>NOW()',[row.invite_id])).rows[0]?.token_hash:null;
  const reports=(await pool.query(`SELECT r.id,r.growth_invite,r.report->'contentscores'->$1::text AS scan,
      EXISTS(SELECT 1 FROM growth_free_gsc_uploads u WHERE u.check_id=$2 AND u.gsc_report_id=r.id
        AND u.status='VERIFIED_FOR_PAGE' AND u.basis='GSC_AUDIT_EXACT_PAGE') AS linked
    FROM gsc_reports r WHERE r.revoked_at IS NULL AND r.expires_at>NOW() AND r.report->'contentscores' ? $1::text
      AND (r.growth_invite IS NOT NULL OR EXISTS(SELECT 1 FROM growth_free_gsc_uploads u WHERE u.check_id=$2 AND u.gsc_report_id=r.id))`,[row.url,row.id])).rows;
  const groups=reports.filter(r=>r.linked||(invite&&r.growth_invite&&hashToken(r.growth_invite)===invite)).map(r=>Array.isArray(r.scan)?r.scan:[r.scan]);
  const checks=invite?(await pool.query("SELECT contentscore_history FROM growth_free_checks WHERE url=$1 AND status='DONE' AND invite_id=$2",[row.url,row.invite_id])).rows:[];
  return mergeHistory(row.url,...groups,...checks.map(r=>r.contentscore_history));
 }catch(e){return []}
}
async function forReport(pool,row,owner){
 const out={};
 if(!pool)return out;
 const urls=(row.report?.pages||[]).map(p=>p.url);
 let checks=[];
 try{checks=await relatedChecks(pool,urls,{invite:row.growth_invite,reportId:row.id,owner})}catch(e){}
 for(const url of urls){const own=row.report?.contentscores?.[url];const history=mergeHistory(url,Array.isArray(own)?own:[own],...checks.filter(r=>r.url===url).map(r=>r.contentscore_history));if(history.length)out[url]=history[history.length-1]}
 return out;
}
module.exports={compare,mergeHistory,sharedHistory,forReport,relatedChecks};
