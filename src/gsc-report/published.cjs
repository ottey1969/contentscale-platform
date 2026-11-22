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
module.exports={publicationsFor,sameUrl,norm};
