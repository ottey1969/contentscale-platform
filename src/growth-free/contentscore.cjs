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
async function sharedHistory(pool,row){
 if(!pool||!row||(!row.invite_id&&row.access_label!=='admin'))return [];
 try{
 const admin=row.access_label==='admin';
 const invite=admin?null:(await pool.query('SELECT token_hash FROM growth_free_invites WHERE id=$1 AND revoked_at IS NULL',[row.invite_id])).rows[0]?.token_hash;
 if(!admin&&!invite)return [];
 const rows=(await pool.query(`SELECT growth_invite,report->'contentscores'->$1::text AS scan FROM gsc_reports WHERE revoked_at IS NULL AND expires_at>NOW() AND report->'contentscores' ? $1::text`,[row.url])).rows;
 const groups=rows.filter(r=>admin||(r.growth_invite&&hashToken(r.growth_invite)===invite)).map(r=>Array.isArray(r.scan)?r.scan:[r.scan]);
 const checks=(await pool.query(`SELECT contentscore_history FROM growth_free_checks WHERE url=$1 AND status='DONE' AND (($2::boolean AND access_label='admin') OR (NOT $2::boolean AND invite_id=$3))`,[row.url,admin,row.invite_id||null])).rows;
 return mergeHistory(row.url,...groups,...checks.map(r=>r.contentscore_history));
 }catch(e){return []}
}
async function forReport(pool,row,owner){
 const out={};
 if(!pool)return out;
 try{
 const invite=row.growth_invite?hashToken(row.growth_invite):'';
 const urls=(row.report?.pages||[]).map(p=>p.url);
 const checks=(await pool.query(`SELECT url,contentscore_history FROM growth_free_checks WHERE url=ANY($1::text[]) AND status='DONE' AND (($2::boolean AND access_label='admin') OR invite_id IN (SELECT id FROM growth_free_invites WHERE token_hash=$3 AND revoked_at IS NULL))`,[urls,!!owner,invite])).rows;
 for(const url of urls){const own=row.report?.contentscores?.[url];const history=mergeHistory(url,Array.isArray(own)?own:[own],...checks.filter(r=>r.url===url).map(r=>r.contentscore_history));if(history.length)out[url]=history[history.length-1]}
 }catch(e){}
 return out;
}
module.exports={compare,mergeHistory,sharedHistory,forReport};
