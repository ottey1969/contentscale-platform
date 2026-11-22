'use strict';
// Search Console numbers a GSC report already holds for this page (owner 2026-11-22: a page opened in Free Growth from a
// GSC report must never ask for a "before" export again). The report's period becomes a verified export for the
// before/after comparison, and a newer period added to the report ("after") too. Only for checks the owner made, or made
// through that report's own Free Growth invitation; a real upload for the same side still wins (it comes later in the list).
const crypto=require('node:crypto');
const {norm}=require('../gsc-report/published.cjs');
const hashToken=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const num=x=>Number.isFinite(Number(x))?Number(x):0;
async function reportUploadsFor(pool,{url,admin=false,inviteId=null}={}){
 const key=norm(url);if(!pool||!key||(!admin&&!inviteId))return [];
 let path='';try{path=new URL(url).pathname.replace(/\/+$/,'')}catch{return []}
 try{
  let inviteHash=null;
  if(!admin){const r=(await pool.query('SELECT token_hash FROM growth_free_invites WHERE id=$1',[inviteId])).rows[0];if(!r)return [];inviteHash=r.token_hash}
  const rows=(await pool.query(`SELECT id,title,growth_invite,report FROM gsc_reports WHERE revoked_at IS NULL AND expires_at>NOW() AND position($1 in report::text)>0
    ORDER BY created_at DESC LIMIT 20`,[path||'/'])).rows;
  const out=[];
  for(const r of rows){
   if(!admin&&!(r.growth_invite&&hashToken(r.growth_invite)===inviteHash))continue;
   const rep=r.report||{},add=(period,p)=>{if(!period||!period.start||!period.end||!p)return;
    out.push({status:'VERIFIED_FOR_PAGE',source:'GSC_REPORT',report_title:String(r.title||'').slice(0,160),file_name:'GSC report',
     period_start:String(period.start).slice(0,10),period_end:String(period.end).slice(0,10),
     totals:{clicks:num(p.clicks),impressions:num(p.impressions),position:p.position==null?null:Number(p.position)},queries:Array.isArray(p.queries)?p.queries.slice(0,200):[]})};
   add(rep.kpis&&rep.kpis.period,(rep.pages||[]).find(p=>norm(p.url)===key));
   if(rep.after)add(rep.after.period,(rep.after.pages||[]).find(p=>norm(p.url)===key));
  }
  // Oldest first, so the newest report wins per side; real uploads are added after these.
  return out.reverse();
 }catch(e){return []}
}
module.exports={reportUploadsFor};
