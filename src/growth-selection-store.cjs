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
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  .then(()=>pool.query('ALTER TABLE tracker_growth_gap_lists ADD COLUMN IF NOT EXISTS source_fingerprint TEXT'))
  .then(()=>pool.query('ALTER TABLE tracker_growth_gap_lists ADD COLUMN IF NOT EXISTS written_ids JSONB'))
  .then(()=>pool.query('ALTER TABLE tracker_growth_gap_lists ADD COLUMN IF NOT EXISTS research JSONB'))
  // New pages (research from a Pre-Write brief) have no tracked page yet: the list belongs to the brief instead.
  .then(()=>pool.query('ALTER TABLE tracker_growth_gap_lists ADD COLUMN IF NOT EXISTS prewrite_brief_id BIGINT'))
  .then(()=>pool.query("ALTER TABLE tracker_growth_gap_lists ADD COLUMN IF NOT EXISTS page_kind TEXT NOT NULL DEFAULT 'EXISTING_PAGE'"))
  .then(()=>pool.query('ALTER TABLE tracker_growth_gap_lists ALTER COLUMN target_page_id DROP NOT NULL'))
  .catch(e=>{ensured=null;throw e});
 return ensured;
}
async function saveGapList(pool,{clientId,targetPageId=null,prewriteBriefId=null,targetUrl,focusQuery,list}){
 const newPage=prewriteBriefId!=null;
 if(!list||!Array.isArray(list.items)||(!newPage&&!Number.isSafeInteger(Number(targetPageId)))||(newPage&&!Number.isSafeInteger(Number(prewriteBriefId))))return null;
 await ensureTable(pool);
 return (await pool.query(`INSERT INTO tracker_growth_gap_lists (tracker_client_id,target_page_id,target_url,focus_query,items
   ,source_fingerprint,research,prewrite_brief_id,page_kind) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9) RETURNING id,created_at`,
  [clientId,newPage?null:Number(targetPageId),targetUrl,focusQuery||null,JSON.stringify(list.items),list.source_fingerprint||null,JSON.stringify(list.research||null),
   newPage?Number(prewriteBriefId):null,newPage?'NEW_PAGE':'EXISTING_PAGE'])).rows[0];
}
async function getGapList(pool,{clientId,id}){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)return null;
 try{return (await pool.query('SELECT id,target_page_id,target_url,focus_query,items,selected,written_ids,research,source_fingerprint,prewrite_brief_id,page_kind,created_at FROM tracker_growth_gap_lists WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id)])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}
// A deliberate selection by the owner (the selection endpoint): replaces the selected ids. Writing never calls this.
async function saveSelection(pool,{clientId,id,itemIds}){
 await pool.query('UPDATE tracker_growth_gap_lists SET selected=$3::jsonb,selected_at=NOW() WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id),JSON.stringify(itemIds)]);
}
// Items a writing request names that are not selected yet are ADDED; nothing is ever removed by writing.
async function addToSelection(pool,{clientId,id,itemIds}){
 await pool.query(`UPDATE tracker_growth_gap_lists SET selected=(SELECT to_jsonb(ARRAY(SELECT x FROM (SELECT x,MIN(o) o FROM (
   SELECT x,o FROM jsonb_array_elements_text(COALESCE(selected,'[]'::jsonb)) WITH ORDINALITY t(x,o)
   UNION ALL SELECT x,1000000+o FROM jsonb_array_elements_text($3::jsonb) WITH ORDINALITY u(x,o)) a GROUP BY x) b ORDER BY o))),selected_at=NOW()
  WHERE tracker_client_id=$1 AND id=$2`,[clientId,Number(id),JSON.stringify((itemIds||[]).map(String))]);
}
// Items written successfully from this list (added to, never replaced): the rest of the selection stays pending.
async function saveWritten(pool,{clientId,id,itemIds}){
 await pool.query(`UPDATE tracker_growth_gap_lists SET written_ids=(SELECT to_jsonb(ARRAY(SELECT DISTINCT x FROM jsonb_array_elements_text(COALESCE(written_ids,'[]'::jsonb)||$3::jsonb) x)))
  WHERE tracker_client_id=$1 AND id=$2`,[clientId,Number(id),JSON.stringify((itemIds||[]).map(String))]);
}
// The open part of the page's latest selection, for a new research run of the same page. Each pending item comes with
// its identity (title and competitor sections) so the new research can check it is still the same need.
async function getOpenSelection(pool,{clientId,targetPageId=null,prewriteBriefId=null,beforeId=null}){
 try{const row=(await pool.query(`SELECT id,items,selected,written_ids,created_at FROM tracker_growth_gap_lists WHERE tracker_client_id=$1 AND `+(prewriteBriefId!=null?'prewrite_brief_id':'target_page_id')+`=$2 AND selected IS NOT NULL AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 1`,[clientId,Number(prewriteBriefId!=null?prewriteBriefId:targetPageId),beforeId])).rows[0];
  if(!row)return null;const done=new Set((row.written_ids||[]).map(String));
  const byId=new Map((row.items||[]).map(x=>[String(x.id),x]));
  const pending=(row.selected||[]).map(String).filter(x=>!done.has(x)&&byId.get(x)?.writable);
  return {gap_list_id:Number(row.id),selected:(row.selected||[]).map(String),pending,
   pending_items:pending.map(id=>{const it=byId.get(id);return {id,title:it.title,sources:(it.examples||[]).map(e=>String(e.site||'')+'|'+String(e.heading||'').toLowerCase())}}),selected_at:row.created_at}}
 catch(e){if(e.code==='42P01'||e.code==='42703')return null;throw e}
}
module.exports={saveGapList,getGapList,saveSelection,addToSelection,saveWritten,getOpenSelection,ensureTable};
