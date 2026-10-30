'use strict';
// Every writing run of a standalone check is kept: the stored document holds all runs (each with its sections and its
// evidence dossier), so concepts from earlier runs stay available after reload. The view shows the latest concept per
// item, saying which run wrote it. A rewrite of an item adds a newer version; the older one stays in its run.
const clip=(x,n)=>String(x==null?'':x).slice(0,n);
const runsOf=prev=>!prev?[]:Array.isArray(prev.runs)?prev.runs:
 // A document from before version 2 held only the last run: it becomes run 1.
 Array.isArray(prev.sections)?[{run:1,at:null,item_ids:(prev.sections||[]).map(s=>s.item_id),writer_status:prev.writer_status||null,
  dossier:prev.dossier||null,sections:prev.sections,not_written:prev.not_written||[],unlinked_sections:prev.unlinked_sections||[]}]:[];
function mergeWritten(prev,result,{at=new Date()}={}){
 const runs=runsOf(prev);
 const run={run:runs.length+1,at:new Date(at).toISOString(),item_ids:(result.sections||[]).map(s=>s.item_id),
  writer_status:result.writer_status||result.status||null,dossier:result.dossier||null,sections:result.sections||[],
  not_written:result.not_written||[],unlinked_sections:result.unlinked_sections||[],note:clip(result.note,400)||null};
 const all=[...runs,run];
 return {version:2,runs:all,done_item_ids:[...new Set(all.flatMap(r=>(r.sections||[]).map(s=>s.item_id)).filter(Boolean))],pending:result.pending||[]};
}
// What the result page shows: the latest concept of every item ever written, plus what the last run left open.
function viewOf(doc){
 if(!doc)return null;
 const runs=runsOf(doc);if(!runs.length)return null;
 const latest=new Map();
 for(const r of runs)for(const s of r.sections||[])latest.set(s.item_id,{...s,run:r.run,written_at:r.at});
 const last=runs[runs.length-1];
 return {sections:[...latest.values()],runs:runs.map(r=>({run:r.run,at:r.at,item_ids:r.item_ids,writer_status:r.writer_status})),
  not_written:last.not_written||[],unlinked_sections:last.unlinked_sections||[],pending:doc.pending||[],
  note:last.note||'Concepts for the selected items. Every statement still needs your check; flagged sentences must be rewritten or removed. Nothing is published.'};
}
module.exports={mergeWritten,viewOf};
