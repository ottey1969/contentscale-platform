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
 const values=[invite?hashToken(invite):'',urls];
 let attached='';
 if(owner&&reportId){
  values.push(reportId);
  attached=`OR EXISTS(SELECT 1 FROM growth_free_gsc_uploads u
   WHERE u.check_id=c.id AND u.gsc_report_id=$3 AND u.status='VERIFIED_FOR_PAGE' AND u.basis='GSC_AUDIT_EXACT_PAGE')`;
 }
 const result=await pool.query(`WITH invited AS (
   SELECT id FROM growth_free_invites WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()
 )
 SELECT c.id,c.url,c.public_id,c.access_key,c.contentscore_history,c.published_on::text,c.published_note,c.finished_at,
   EXISTS(SELECT 1 FROM invited i WHERE i.id=c.invite_id) AS matching_invite
 FROM growth_free_checks c
 WHERE c.status='DONE' AND c.url=ANY($2::text[])
   AND (c.invite_id IN (SELECT id FROM invited) ${attached})
 ORDER BY c.finished_at DESC NULLS LAST,c.id DESC`,values);
 return result.rows;
}

async function sharedHistory(pool,row){
 if(!pool||!row)return [];
 const reports=await require('./gsc-audit-handoff.cjs').relatedReports(pool,{url:row.url,checkId:row.id,inviteId:row.invite_id}).catch(()=>[]);
 const groups=reports.map(r=>r.report?.contentscores?.[row.url]).map(scan=>Array.isArray(scan)?scan:[scan]);
 try{
  if(row.invite_id){
   const checks=(await pool.query(`SELECT c.contentscore_history FROM growth_free_checks c JOIN growth_free_invites i ON i.id=c.invite_id
    WHERE c.url=$1 AND c.status='DONE' AND i.id=$2 AND i.revoked_at IS NULL AND i.expires_at>NOW()`,[row.url,row.invite_id])).rows;
   groups.push(...checks.map(r=>r.contentscore_history));
  }
 }catch(e){}
 return mergeHistory(row.url,...groups);
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
