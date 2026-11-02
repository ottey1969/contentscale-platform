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
module.exports={saveRemoval,loadRemovals,hashOf,norm,ensureTable};
