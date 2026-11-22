'use strict';
// "Updated on …" in a report (owner 2026-11-22): the publication date set in Free Growth for a page of the report, so the
// owner and the company see that the page was done. Only checks the owner made, or that were made through this report's own
// Free Growth invitation, count: a date a stranger set on a public check never shows up. Looked up when the report is
// opened, so a date set later appears without making a new report.
const crypto=require('node:crypto');
const norm=u=>{try{const x=new URL(String(u||'').trim());return (x.protocol+'//'+x.hostname.toLowerCase().replace(/^www\./,'')+decodeURI(x.pathname).replace(/\/+$/,'')).toLowerCase()}catch{return ''}};
const sameUrl=(a,b)=>!!norm(a)&&norm(a)===norm(b);
const hashToken=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
// Map of normalised page URL -> latest publication date (YYYY-MM-DD).
async function publicationsFor(pool,urls,{invite=null}={}){
 const out=new Map(),want=new Set((urls||[]).map(norm).filter(Boolean));
 if(!pool||!want.size)return out;
 let rows=[];
 try{rows=(await pool.query(`SELECT url,published_on::text AS published_on FROM growth_free_checks
   WHERE published_on IS NOT NULL AND status='DONE' AND (access_label='admin' OR invite_id IN (SELECT id FROM growth_free_invites WHERE token_hash=$1))
   ORDER BY published_on DESC LIMIT 2000`,[invite?hashToken(invite):''])).rows}
 catch(e){return out}
 for(const r of rows){const k=norm(r.url);if(want.has(k)&&!out.has(k))out.set(k,String(r.published_on).slice(0,10))}
 return out;
}
// The latest Free Growth result per page (owner 2026-11-22: from the report straight to the brief, the date and the
// before/after, instead of a new check). owner_result: the owner's own check, shown to the owner only; invite_result: a
// check made through this report's invitation, the company's own. published_on: the latest date of either.
async function growthFor(pool,urls,{invite=null}={}){
 const out=new Map(),want=new Set((urls||[]).map(norm).filter(Boolean));
 if(!pool||!want.size)return out;
 let rows=[];
 try{rows=(await pool.query(`SELECT url,public_id,access_key,access_label,invite_id,published_on::text AS published_on,published_note,finished_at FROM growth_free_checks
   WHERE status='DONE' AND (access_label='admin' OR invite_id IN (SELECT id FROM growth_free_invites WHERE token_hash=$1))
   ORDER BY finished_at DESC NULLS LAST LIMIT 2000`,[invite?hashToken(invite):''])).rows}
 catch(e){return out}
 const link=r=>'/r/'+encodeURIComponent(r.public_id)+'?k='+encodeURIComponent(r.access_key);
 for(const r of rows){const k=norm(r.url);if(!want.has(k))continue;
  const x=out.get(k)||{published_on:null,note:null,owner_result:null,invite_result:null};
  if(r.access_label==='admin'){if(!x.owner_result)x.owner_result=link(r)}else if(r.invite_id!=null){if(!x.invite_result)x.invite_result=link(r)}
  const d=r.published_on?String(r.published_on).slice(0,10):null;if(d&&(!x.published_on||d>x.published_on)){x.published_on=d;x.note=r.published_note?String(r.published_note).slice(0,500):null}
  out.set(k,x)}
 return out;
}
module.exports={publicationsFor,growthFor,sameUrl,norm};
