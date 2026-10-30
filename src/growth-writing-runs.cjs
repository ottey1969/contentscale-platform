'use strict';
// Writing runs for an owner selection, so a run is reliable when it fails, is repeated or overlaps another:
//  - one active run per gap list: a second request while one is WRITING gets that run back, no second AI call;
//  - a run that never finished (crashed process) gives way after a lease of ten minutes;
//  - an item is completed ONLY in the same PostgreSQL transaction that stores its concept and evidence dossier as a
//    proposal: if storing fails, nothing is marked written and the items stay pending;
//  - a failed run (writer or storage) leaves every item of the batch pending, so it can be run again.
// States: WRITING -> STORED | FAILED. Additive table; nothing else changes.
const {ensureTable:ensureGapLists}=require('./growth-selection-store.cjs');
const {saveSelectionProposal,ensureTable:ensureProposals}=require('./growth-proposal-store.cjs');
const LEASE_MINUTES=10;
let ensured=null,ensuredConcepts=null;
// Concepts for NEW pages (no tracked page and no CMS export yet): stored here, delivered as a package for the editor.
function ensureConcepts(pool){
 if(!ensuredConcepts)ensuredConcepts=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_new_page_concepts(
   id BIGSERIAL PRIMARY KEY,
   tracker_client_id BIGINT NOT NULL,
   gap_list_id BIGINT NOT NULL,
   prewrite_brief_id BIGINT NOT NULL,
   keyword TEXT,
   planned_url TEXT,
   title TEXT,
   sections JSONB NOT NULL,
   review JSONB NOT NULL DEFAULT '{}'::jsonb,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e=>{ensuredConcepts=null;throw e});
 return ensuredConcepts;
}
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_writing_runs(
   id BIGSERIAL PRIMARY KEY,
   tracker_client_id BIGINT NOT NULL,
   gap_list_id BIGINT NOT NULL,
   item_ids JSONB NOT NULL,
   status TEXT NOT NULL,
   proposal_id BIGINT,
   error TEXT,
   started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   finished_at TIMESTAMPTZ)`)
  .then(()=>pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tracker_growth_writing_runs_one_active ON tracker_growth_writing_runs(gap_list_id) WHERE status='WRITING'`))
  .catch(e=>{ensured=null;throw e});
 return ensured;
}
// Claim the list for this batch. Returns {run} or {conflict: run in progress}.
async function claimRun(pool,{clientId,gapListId,itemIds}){
 await ensureTable(pool);
 await pool.query(`UPDATE tracker_growth_writing_runs SET status='FAILED',error='ABANDONED_AFTER_LEASE',finished_at=NOW()
   WHERE gap_list_id=$1 AND status='WRITING' AND started_at<NOW()-($2::int*INTERVAL '1 minute')`,[Number(gapListId),LEASE_MINUTES]);
 try{
  const run=(await pool.query(`INSERT INTO tracker_growth_writing_runs(tracker_client_id,gap_list_id,item_ids,status) VALUES($1,$2,$3::jsonb,'WRITING')
    RETURNING id,item_ids,status,started_at`,[clientId,Number(gapListId),JSON.stringify(itemIds.map(String))])).rows[0];
  return {run};
 }catch(e){
  if(e.code!=='23505')throw e;
  const active=(await pool.query(`SELECT id,item_ids,status,started_at FROM tracker_growth_writing_runs WHERE gap_list_id=$1 AND status='WRITING' LIMIT 1`,[Number(gapListId)])).rows[0]||null;
  return {conflict:active};
 }
}
// Store the concept and mark its items written, together or not at all. An existing page's concept is a proposal (the
// CMS handoff uses it); a new page's concept goes to tracker_growth_new_page_concepts (newPageConcept).
async function storeRun(pool,{clientId,runId,gapListId,itemIds,proposal=null,newPageConcept=null}){
 await Promise.all([ensureTable(pool),ensureGapLists(pool),ensureProposals(pool),...(newPageConcept?[ensureConcepts(pool)]:[])]);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const ref=newPageConcept?await saveNewPageConcept(client,{clientId,gapListId,...newPageConcept}):await saveSelectionProposal(client,{clientId,...proposal});
  if(!ref)throw Object.assign(Error('PROPOSAL_NOT_STORED'),{code:'PROPOSAL_NOT_STORED'});
  await client.query(`UPDATE tracker_growth_gap_lists SET written_ids=(SELECT to_jsonb(ARRAY(SELECT DISTINCT x FROM jsonb_array_elements_text(COALESCE(written_ids,'[]'::jsonb)||$3::jsonb) x)))
    WHERE tracker_client_id=$1 AND id=$2`,[clientId,Number(gapListId),JSON.stringify(itemIds.map(String))]);
  if(runId){const u=await client.query(`UPDATE tracker_growth_writing_runs SET status='STORED',proposal_id=$2,finished_at=NOW() WHERE id=$1 AND status='WRITING'`,[Number(runId),Number(ref.id)]);
   // The lease ran out and another run took over: do not complete twice.
   if(!u.rowCount)throw Object.assign(Error('RUN_NO_LONGER_ACTIVE'),{code:'RUN_NO_LONGER_ACTIVE'});}
  await client.query('COMMIT');
  return {proposal:ref};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
 finally{client.release()}
}
const clip=(x,n)=>String(x==null?'':x).slice(0,n);
async function saveNewPageConcept(db,{clientId,gapListId,briefId,keyword,plannedUrl,title,written}){
 const sections=(written?.sections||[]).map(s=>({h2:clip(s.h2,200),text:clip((s.paragraphs||[]).join('\n\n'),8000),item_id:s.item_id||null,task:clip(s.item_title,200)||null,
  status:s.status||null,basis:s.basis||null})).filter(s=>s.h2&&s.text);
 if(!sections.length||!Number.isSafeInteger(Number(briefId)))return null;
 const all=k=>[...new Set((written.sections||[]).flatMap(s=>s[k]||[]))].slice(0,20).map(v=>clip(v,400));
 const review={needs_fact_check:all('needs_fact_check'),needs_owner_confirmation:all('needs_owner_confirmation'),needs_safety_review:all('needs_safety_review'),
  flagged:(written.sections||[]).flatMap(s=>(s.flags||[]).map(f=>({h2:clip(s.h2,200),sentence:f.sentence?clip(f.sentence,400):null,code:clip(f.code,60),reason:clip(f.reason,300)}))).slice(0,30),
  dossier:written.dossier||null};
 return (await db.query(`INSERT INTO tracker_growth_new_page_concepts(tracker_client_id,gap_list_id,prewrite_brief_id,keyword,planned_url,title,sections,review)
   VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id,created_at`,[clientId,Number(gapListId),Number(briefId),clip(keyword,200)||null,clip(plannedUrl,500)||null,clip(title,200)||null,
   JSON.stringify(sections),JSON.stringify(review)])).rows[0];
}
async function getNewPageConcepts(pool,{clientId,gapListId=null,briefId=null}){
 try{return (await pool.query(`SELECT id,gap_list_id,prewrite_brief_id,keyword,planned_url,title,sections,review,created_at FROM tracker_growth_new_page_concepts
   WHERE tracker_client_id=$1 AND ($2::bigint IS NULL OR gap_list_id=$2) AND ($3::bigint IS NULL OR prewrite_brief_id=$3) ORDER BY id`,[clientId,gapListId,briefId])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
async function failRun(pool,{runId,error}){
 if(!runId)return;
 await pool.query(`UPDATE tracker_growth_writing_runs SET status='FAILED',error=$2,finished_at=NOW() WHERE id=$1 AND status='WRITING'`,[Number(runId),String(error||'FAILED').slice(0,80)]);
}
async function lastStoredRun(pool,{gapListId}){
 try{return (await pool.query(`SELECT id,item_ids,proposal_id,finished_at FROM tracker_growth_writing_runs WHERE gap_list_id=$1 AND status='STORED' ORDER BY id DESC LIMIT 1`,[Number(gapListId)])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}
module.exports={claimRun,storeRun,failRun,lastStoredRun,getNewPageConcepts,ensureTable,LEASE_MINUTES};
