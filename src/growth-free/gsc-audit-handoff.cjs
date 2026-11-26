'use strict';
const {openReport}=require('../gsc-report/store.cjs');
const exact=u=>{try{return new URL(u).href}catch{return ''}};
function auditUpload(row,{url,owner=false,invite=null}={}){
 if(!row||(!owner&&!(invite&&row.growth_invite===invite)))return null;
 const rep=row.report||{},key=exact(url);
 const p=key&&(rep.pages||[]).find(p=>exact(p.url)===key);
 if(!p||!['EXPORT','PAGE_EXPORT','PAGE_QUERY_EXPORT'].includes(p.source)||p.clicks==null||p.impressions==null)return null;
 const period=rep.kpis?.period||null;
 return {fileName:'GSC Audit: '+String(row.title||'').slice(0,150),relatedInvite:row.growth_invite||null,upload:{status:'VERIFIED_FOR_PAGE',basis:'GSC_AUDIT_EXACT_PAGE',period,totals:{clicks:p.clicks,impressions:p.impressions,position:p.position??null},queries:Array.isArray(p.queries)?p.queries.slice(0,150):[],uploaded_at:row.created_at,source:'GSC_REPORT',gsc_report_id:row.id||null}};
}
async function loadAuditUpload(pool,{token,url,owner=false,invite=null}){
 if(!token||(!owner&&!invite))return null;
 return auditUpload(await openReport(pool,token,{count:false}),{url,owner,invite});
}
// The checks already carry the verified report ID or the invitation used to start them.
async function relatedReports(pool,{url,checkId=null,inviteId=null}){
 if(!pool||!url||(!checkId&&!inviteId))return [];
 return (await pool.query(`SELECT r.id,r.title,r.report FROM gsc_reports r
  WHERE r.revoked_at IS NULL AND r.expires_at>NOW() AND (
    EXISTS(SELECT 1 FROM growth_free_gsc_uploads u JOIN growth_free_checks c ON c.id=u.check_id
      WHERE c.id=$1 AND c.url=$3 AND u.gsc_report_id=r.id AND u.status='VERIFIED_FOR_PAGE'
        AND u.basis='GSC_AUDIT_EXACT_PAGE')
    OR EXISTS(SELECT 1 FROM growth_free_invites i WHERE i.id=$2 AND i.revoked_at IS NULL AND i.expires_at>NOW()
      AND i.token_hash=encode(sha256(convert_to(r.growth_invite,'UTF8')),'hex')))
  ORDER BY r.created_at,r.id`,[checkId,inviteId,url])).rows;
}
// Compare only like-for-like exact-page totals, never interpret different periods as discrepancies.
function auditDifference(rows){
 const audit=[...(rows||[])].reverse().find(x=>x.basis==='GSC_AUDIT_EXACT_PAGE');
 const page=[...(rows||[])].reverse().find(x=>x.basis!=='GSC_AUDIT_EXACT_PAGE'&&x.status==='VERIFIED_FOR_PAGE');
 if(!audit||!page||!audit.period_start||!audit.period_end||!page.period_start||!page.period_end)return null;
 if(audit.period_start!==page.period_start||audit.period_end!==page.period_end)return {status:'DIFFERENT_PERIODS'};
 const differences={};
 for(const k of ['clicks','impressions','position']){
  const a=audit.totals?.[k],b=page.totals?.[k];
  if(a==null||b==null||!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))continue;
  if(k==='position'?Math.abs(Number(a)-Number(b))>0.1:Number(a)!==Number(b))differences[k]={audit:Number(a),page:Number(b)};
 }
 return {status:Object.keys(differences).length?'DIFFERENT_TOTALS':'MATCH',differences};
}
module.exports={auditUpload,loadAuditUpload,auditDifference,relatedReports};
