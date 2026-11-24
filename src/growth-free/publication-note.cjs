'use strict';
// What was changed on the page (owner 2026-11-22), next to the publication date and shown in the GSC report. A suggestion
// is made only from explicit editor confirmations, never from drafted or selected topics. The note is the
// editor's own statement; nothing in it is verified by the tool.
const MAX=500;
const cleanNote=v=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,MAX);
function noteSuggestion(row,lang='nl'){
 const lead={nl:'Door redacteur bevestigd',es:'Confirmado por el editor',en:'Confirmed by editor'}[lang]||'Confirmed by editor';
 const titles=Object.values(row?.implementation||{}).filter(x=>x&&x.done===true).map(x=>cleanNote(x.title)).filter(Boolean);
 return titles.length?cleanNote(lead+': '+titles.slice(0,6).map(t=>'“'+t+'”').join(', ')+'.'):'';
}
// Owner 2026-11-22 ("vul ze"): checks that already had a publication date before the note existed get the suggestion,
// for one host. Only empty notes; an editor's own note is never overwritten. Returns how many were filled.
async function backfillNotes(pool,{host}){
 const rows=(await pool.query(`SELECT id,url,written,summary,selected_item_ids,ui_lang,implementation FROM growth_free_checks
   WHERE published_on IS NOT NULL AND published_note IS NULL AND host=$1`,[String(host)])).rows;
 let n=0;
 for(const r of rows){const note=noteSuggestion(r,r.ui_lang||'nl');if(!note)continue;
  const u=await pool.query('UPDATE growth_free_checks SET published_note=$2 WHERE id=$1 AND published_note IS NULL',[r.id,note]);n+=u.rowCount||0}
 return n;
}
module.exports={noteSuggestion,cleanNote,backfillNotes,MAX};
