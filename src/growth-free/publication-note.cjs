'use strict';
// What was changed on the page (owner 2026-11-22), next to the publication date and shown in the GSC report. A suggestion
// is made only from what Growth itself recorded: the H2s it wrote, else the topics chosen in step 1. The note is the
// editor's own statement; nothing in it is verified by the tool.
const {viewOf}=require('./written.cjs');
const MAX=500;
const cleanNote=v=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,MAX);
const LEAD={nl:'Toegevoegd',es:'Añadido',en:'Added'};
function noteSuggestion(row,lang='nl'){
 const r=row||{},lead=LEAD[lang]||LEAD.en;
 let titles=[];
 try{const w=viewOf(r.written);if(w)titles=w.sections.map(s=>s.h2).filter(Boolean)}catch(e){}
 if(!titles.length){const items=((r.summary&&r.summary.gaps&&r.summary.gaps.items)||[]);
  const ids=new Set((Array.isArray(r.selected_item_ids)?r.selected_item_ids:[]).map(String));
  titles=items.filter(i=>ids.has(String(i.id))).map(i=>i.title).filter(Boolean)}
 if(!titles.length)return '';
 return cleanNote(lead+': '+titles.slice(0,6).map(t=>'“'+t+'”').join(', ')+'.');
}
// Owner 2026-11-22 ("vul ze"): checks that already had a publication date before the note existed get the suggestion,
// for one host. Only empty notes; an editor's own note is never overwritten. Returns how many were filled.
async function backfillNotes(pool,{host}){
 const rows=(await pool.query(`SELECT id,url,written,summary,selected_item_ids,ui_lang FROM growth_free_checks
   WHERE published_on IS NOT NULL AND published_note IS NULL AND host=$1`,[String(host)])).rows;
 let n=0;
 for(const r of rows){const note=noteSuggestion(r,r.ui_lang||'nl');if(!note)continue;
  const u=await pool.query('UPDATE growth_free_checks SET published_note=$2 WHERE id=$1 AND published_note IS NULL',[r.id,note]);n+=u.rowCount||0}
 return n;
}
module.exports={noteSuggestion,cleanNote,backfillNotes,MAX};
