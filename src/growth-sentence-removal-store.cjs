'use strict';
// Flagged sentences the owner removed from a page's draft, remembered per Tracker client and page (owner 2026-11-02:
// "remember it when I press the button"). Stored on the server, so another browser or device knows it too. It records a
// decision about Growth's draft text only; the live page and the Tracker's saved page are never changed.
const {createHash}=require('node:crypto');
const norm=s=>String(s||'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
const hashOf=s=>createHash('sha256').update(norm(s).toLowerCase()).digest('hex');
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_sentence_removals(
   tracker_client_id BIGINT NOT NULL,
   page_id BIGINT NOT NULL,
   sentence_hash TEXT NOT NULL,
   sentence TEXT NOT NULL,
   how TEXT NOT NULL,
   removed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,page_id,sentence_hash))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
async function saveRemoval(pool,{clientId,pageId,sentence,how='REMOVED_BY_BUTTON'}){
 const s=norm(sentence).slice(0,600);if(s.length<10)return null;
 await ensureTable(pool);
 await pool.query(`INSERT INTO tracker_growth_sentence_removals(tracker_client_id,page_id,sentence_hash,sentence,how) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT (tracker_client_id,page_id,sentence_hash) DO UPDATE SET how=EXCLUDED.how,removed_at=NOW()`,[clientId,Number(pageId),hashOf(s),s,String(how).slice(0,40)]);
 return {sentence:s};
}
async function loadRemovals(pool,{clientId,pageId}){
 try{return (await pool.query('SELECT sentence,how,removed_at FROM tracker_growth_sentence_removals WHERE tracker_client_id=$1 AND page_id=$2 ORDER BY removed_at',[clientId,Number(pageId)])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
// Undo the owner's decision about a sentence (a removal or a "keep"): the sentence is flagged again.
async function deleteDecision(pool,{clientId,pageId,sentence}){
 const s=norm(sentence).slice(0,600);if(s.length<10)return null;
 await ensureTable(pool);
 await pool.query('DELETE FROM tracker_growth_sentence_removals WHERE tracker_client_id=$1 AND page_id=$2 AND sentence_hash=$3',[clientId,Number(pageId),hashOf(s)]);
 return {sentence:s};
}
// Flagged sentences the owner confirmed as true for the business (decision KEPT_BY_OWNER), as review notes for the
// package: they no longer block it and are recorded as confirmed. A safety assurance ("safe to wait") is never released.
const isSafety=f=>f&&(f.code==='UNSUPPORTED_SAFETY_ASSURANCE'||/safe to wait|safety assurance/i.test(String(f.reason||'')));
function applyKept(reviewNotes,rows){
 if(!reviewNotes||typeof reviewNotes!=='object')return reviewNotes;
 const kept=new Set((rows||[]).filter(r=>r.how==='KEPT_BY_OWNER').map(r=>norm(r.sentence).toLowerCase()));
 const flagged=Array.isArray(reviewNotes.flagged)?reviewNotes.flagged:[];
 const isKept=f=>f&&f.sentence&&!isSafety(f)&&kept.has(norm(f.sentence).toLowerCase());
 // Only the server's record counts: a confirmation sent by the browser is ignored.
 const {confirmed_by_editor,...rest}=reviewNotes;
 const confirmed=flagged.filter(isKept).map(f=>({sentence:f.sentence,h2:f.h2||'',reason:f.reason||''}));
 return {...rest,flagged:flagged.filter(f=>!isKept(f)),...(confirmed.length?{confirmed_by_editor:confirmed}:{})};
}
module.exports={saveRemoval,loadRemovals,deleteDecision,applyKept,hashOf,norm,ensureTable};
