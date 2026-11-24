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
async function sharedHistory(pool,row){
 if(!pool||!row||(!row.invite_id&&row.access_label!=='admin'))return [];
 try{
 const rows=(await pool.query(`SELECT report->'contentscores'->$1::text AS scan FROM gsc_reports WHERE revoked_at IS NULL AND expires_at>NOW() AND report->'contentscores' ? $1::text AND ($2::boolean OR growth_invite IS NOT NULL AND encode(digest(growth_invite,'sha256'),'hex')=(SELECT token_hash FROM growth_free_invites WHERE id=$3))`,[row.url,row.access_label==='admin',row.invite_id||null])).rows;
 return mergeHistory(row.url,rows.flatMap(r=>Array.isArray(r.scan)?r.scan:[r.scan]));
 }catch(e){return []}
}
module.exports={compare,mergeHistory,sharedHistory};
