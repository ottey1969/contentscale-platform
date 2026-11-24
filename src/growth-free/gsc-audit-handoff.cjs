'use strict';
const {openReport}=require('../gsc-report/store.cjs');
const exact=u=>{try{return new URL(u).href}catch{return ''}};
function auditUpload(row,{url,owner=false,invite=null}={}){
 if(!row||(!owner&&!(invite&&row.growth_invite===invite)))return null;
 const rep=row.report||{},key=exact(url);
 const p=key&&(rep.pages||[]).find(p=>exact(p.url)===key);
 if(!p||!['EXPORT','PAGE_EXPORT','PAGE_QUERY_EXPORT'].includes(p.source)||p.clicks==null||p.impressions==null)return null;
 const period=rep.kpis?.period||null;
 return {fileName:'GSC Audit: '+String(row.title||'').slice(0,150),upload:{status:'VERIFIED_FOR_PAGE',basis:'GSC_AUDIT_EXACT_PAGE',period,totals:{clicks:p.clicks,impressions:p.impressions,position:p.position??null},queries:Array.isArray(p.queries)?p.queries.slice(0,150):[],uploaded_at:row.created_at,source:'GSC_REPORT'}};
}
async function loadAuditUpload(pool,{token,url,owner=false,invite=null}){
 if(!token||(!owner&&!invite))return null;
 return auditUpload(await openReport(pool,token,{count:false}),{url,owner,invite});
}
module.exports={auditUpload,loadAuditUpload};
