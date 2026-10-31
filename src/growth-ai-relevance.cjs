'use strict';
// Saved AI observations belong to a page, not to a search term, and they age. For a Growth research they count only when
// they were collected for the same search term (the pasted text names it after QUERY:) and recently enough.
// Everything else stays visible, labelled, and is never used as evidence of AI visibility for this search.
const MAX_AGE_DAYS=14;
const norm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function termOf(raw){const m=String(raw||'').match(/QUERY:\s*\n*\s*([^\n]{2,120})/i);return m?m[1].trim():null}
function judgeAiObservation({row={},query='',now=new Date()}={}){
 const at=Date.parse(row.verified_at||row.created_at||''),days=Number.isFinite(at)?Math.floor((new Date(now).getTime()-at)/86400000):null;
 const term=termOf(row.raw_text),same=!!term&&!!query&&norm(term)===norm(query);
 const status=!term?'SEARCH_TERM_NOT_RECORDED':!same?'OTHER_SEARCH_TERM':days===null||days>MAX_AGE_DAYS?'OUTDATED':'USABLE_FOR_THIS_SEARCH';
 const text={SEARCH_TERM_NOT_RECORDED:'The search term of this observation was not recorded, so it cannot be tied to "'+query+'".',
  OTHER_SEARCH_TERM:'Collected for "'+term+'", not for "'+query+'".',
  OUTDATED:'Collected for this search term, but '+(days===null?'with an unknown date':days+' days ago')+' (more than '+MAX_AGE_DAYS+' days).',
  USABLE_FOR_THIS_SEARCH:'Collected for this search term '+days+' day(s) ago.'}[status];
 return {status,search_term:term,age_days:days,usable:status==='USABLE_FOR_THIS_SEARCH',text};
}
function annotateAiVisibility(ai,{rows=[],query='',now=new Date()}={}){
 if(!ai||typeof ai!=='object'||!Array.isArray(ai.engines))return ai;
 const engines=ai.engines.map(e=>{
  const row=rows.find(r=>r.engine===e.engine&&(e.revision_cycle==null||Number(r.revision_cycle)===Number(e.revision_cycle)))||{verified_at:e.verified_at};
  return {...e,relevance:judgeAiObservation({row:{...row,verified_at:row.verified_at||e.verified_at},query,now})};
 });
 const usable=engines.filter(e=>e.relevance.usable).length;
 return {...ai,engines,usable_for_this_search:usable,
  relevance_note:usable?usable+' of '+engines.length+' saved AI observation(s) were collected for "'+query+'" in the last '+MAX_AGE_DAYS+' days.':
   'None of the '+engines.length+' saved AI observation(s) can show AI visibility for "'+query+'" now: they were collected for another or an unrecorded search term, or more than '+MAX_AGE_DAYS+' days ago. Check AI again with the prompt for this search term.',
  relevance_rule:'Counts only when the pasted text names the same search term after QUERY: and is at most '+MAX_AGE_DAYS+' days old.'};
}
module.exports={annotateAiVisibility,judgeAiObservation,MAX_AGE_DAYS};
