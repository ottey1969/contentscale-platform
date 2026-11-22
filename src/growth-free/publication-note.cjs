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
module.exports={noteSuggestion,cleanNote,MAX};
