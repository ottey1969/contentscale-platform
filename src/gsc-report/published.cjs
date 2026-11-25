'use strict';
// "Updated on …" in a report (owner 2026-11-22): the publication date set in Free Growth for a page of the report, so the
// owner and the company see that the page was done. Only checks the owner made, or that were made through this report's own
// Free Growth invitation, count: a date a stranger set on a public check never shows up. Looked up when the report is
// opened, so a date set later appears without making a new report.
const crypto=require('node:crypto');
const norm=u=>{try{const x=new URL(String(u||'').trim());return (x.protocol+'//'+x.hostname.toLowerCase().replace(/^www\./,'')+decodeURI(x.pathname).replace(/\/+$/,'')).toLowerCase()}catch{return ''}};
const sameUrl=(a,b)=>!!norm(a)&&norm(a)===norm(b);
// History uses the exact URL, including case, query string and trailing slash.
const exact=u=>{try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)&&!x.username&&!x.password&&!x.hash?x.href:''}catch{return ''}};
function historyFor(rows,urls,{owner=false}={}){
 const want=new Set((urls||[]).map(exact).filter(Boolean)),out=new Map(),seen=new Map();
 for(const r of rows){
  const k=exact(r.url);if(!want.has(k)||(!owner&&r.access_label!=='admin'&&r.matching_invite!==true))continue;
  // The shared audit may show owner-approved summaries, not private editor evidence or access keys.
  const items=Array.isArray(r.publication_history)?r.publication_history:[];
  const entries=items.length?items:(r.published_on?[{published_on:r.published_on,summary:r.published_note}]:[]);
  if(!out.has(k)){out.set(k,[]);seen.set(k,new Set())}
  for(const item of entries){
   if(!item||!item.published_on)continue;
   const report=item.report;
   if(report&&exact(report.url)!==k)continue;
   const entry={published_on:String(item.published_on).slice(0,10),summary:String(item.summary||'').slice(0,500),published_at:report?.published_at||null,change_types:Array.isArray(report?.change_types)?report.change_types:[],verified:false};
   const key=JSON.stringify(entry);if(seen.get(k).has(key))continue;seen.get(k).add(key);out.get(k).push(entry);
  }
 }
 for(const items of out.values())items.sort((a,b)=>b.published_on.localeCompare(a.published_on));
 return out;
}
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
async function growthFor(pool,urls,{invite=null,owner=false}={}){
 const out=new Map(),want=new Set((urls||[]).map(norm).filter(Boolean));
 if(!pool||!want.size)return out;
 // Free Growth setup (columns + the one-time note backfill for nl.contentscale.site) also when only the report is opened.
 await require('../growth-free/store.cjs').ensureTables(pool).catch(e=>console.warn('[gsc-report] free growth setup failed',e&&e.message));
 let rows=[];
 try{rows=(await pool.query(`SELECT url,public_id,access_key,access_label,invite_id,(invite_id IN (SELECT id FROM growth_free_invites WHERE token_hash=$1 AND revoked_at IS NULL)) AS matching_invite,published_on::text AS published_on,published_note,publication_history,finished_at FROM growth_free_checks
   WHERE status='DONE' AND ($2::boolean OR access_label='admin' OR invite_id IN (SELECT id FROM growth_free_invites WHERE token_hash=$1))
   AND url=ANY($3::text[]) ORDER BY finished_at DESC NULLS LAST`,[invite?hashToken(invite):'',!!owner,Array.from(new Set((urls||[]).flatMap(u=>[u,String(u).replace(/\/+$/,'')||u,String(u).replace(/\/+$/,'')+'/']))) ])).rows}
 catch(e){return out}
 const histories=historyFor(rows,urls,{owner});
 const link=r=>'/r/'+encodeURIComponent(r.public_id)+'?k='+encodeURIComponent(r.access_key);
 for(const r of rows){const k=norm(r.url);if(!want.has(k))continue;
  if(!owner&&r.access_label!=='admin'&&r.matching_invite!==true)continue;
  const x=out.get(k)||{published_on:null,note:null,owner_result:null,invite_result:null};
  if((r.access_label==='admin'||owner)&&!x.owner_result)x.owner_result=link(r);
  if(r.invite_id!=null&&invite&&r.matching_invite===true&&!x.invite_result)x.invite_result=link(r);
  const d=r.published_on?String(r.published_on).slice(0,10):null;if(d&&(!x.published_on||d>x.published_on)){x.published_on=d;x.note=r.published_note?String(r.published_note).slice(0,500):null}
  else if(d&&d===x.published_on&&!x.note&&r.published_note){x.note=String(r.published_note).slice(0,500)}
  out.set(k,x)}
 // Separate exact URL map prevents the legacy normalized key from conflating different pages.
 Object.defineProperty(out,'historyByUrl',{value:histories});
 return out;
}
module.exports={publicationsFor,growthFor,sameUrl,norm,historyFor,exact};
