'use strict';
// The gap list of an owner research run and the owner's selection from it, per tracked page. Writing reads the items
// from here by id (never from the browser), so selected text always comes from the research that was shown.
// Additive table; nothing else changes.
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_gap_lists(
   id BIGSERIAL PRIMARY KEY,
   tracker_client_id BIGINT NOT NULL,
   target_page_id BIGINT NOT NULL,
   target_url TEXT NOT NULL,
   focus_query TEXT,
   items JSONB NOT NULL,
   selected JSONB,
   selected_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e=>{ensured=null;throw e});
 return ensured;
}
async function saveGapList(pool,{clientId,targetPageId,targetUrl,focusQuery,list}){
 if(!list||!Array.isArray(list.items)||!Number.isSafeInteger(Number(targetPageId)))return null;
 await ensureTable(pool);
 return (await pool.query(`INSERT INTO tracker_growth_gap_lists (tracker_client_id,target_page_id,target_url,focus_query,items)
   VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id,created_at`,[clientId,Number(targetPageId),targetUrl,focusQuery||null,JSON.stringify(list.items)])).rows[0];
}
async function getGapList(pool,{clientId,id}){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)return null;
 try{return (await pool.query('SELECT id,target_page_id,target_url,focus_query,items,selected,created_at FROM tracker_growth_gap_lists WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id)])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}
async function saveSelection(pool,{clientId,id,itemIds}){
 await pool.query('UPDATE tracker_growth_gap_lists SET selected=$3::jsonb,selected_at=NOW() WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id),JSON.stringify(itemIds)]);
}
module.exports={saveGapList,getGapList,saveSelection,ensureTable};
