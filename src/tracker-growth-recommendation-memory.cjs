'use strict';
// Server-side memory of the Growth Cockpit: what the system chose, what the
// owner did with it (started / skipped), what the research concluded and,
// through tracker_growth_publications, what was published and measured.
// Additive table only; never touches pages, Case Studies, GSC rows or redirects.
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

let ensured=null;
async function ensureTable(pool){
 if(!ensured)ensured=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_recommendations(
    id BIGSERIAL PRIMARY KEY,
    tracker_client_id BIGINT NOT NULL,
    tracker_page_id BIGINT NOT NULL,
    query_key TEXT NOT NULL DEFAULT '',
    query TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    system_choice BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    times_started INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    skip_reason TEXT,
    research_decision TEXT,
    research_blocker TEXT,
    research_evidence_status TEXT,
    research_target_page_id BIGINT,
    researched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tracker_client_id,tracker_page_id,query_key))`);
 })().catch(e=>{ensured=null;throw e});
 return ensured;
}

async function loadMemory(pool,clientId){
 try{
  return (await pool.query(`SELECT id,tracker_page_id,query_key,query,status,system_choice,snapshot,times_started,
    started_at,skipped_at,skip_reason,research_decision,research_blocker,research_evidence_status,
    research_target_page_id,researched_at,updated_at
    FROM tracker_growth_recommendations WHERE tracker_client_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 300`,[clientId])).rows||[];
 }catch(error){
  if(error.code!=='42P01')console.warn('[tracker-growth] recommendation memory unavailable',String(error.code||'unknown'));
  return [];
 }
}

async function recordAction(pool,{clientId,pageId,query,action,reason,snapshot,systemChoice}){
 await ensureTable(pool);
 const key=norm(query),text=String(query||'').slice(0,300);
 if(action==='start')return (await pool.query(`INSERT INTO tracker_growth_recommendations
   (tracker_client_id,tracker_page_id,query_key,query,status,system_choice,snapshot,times_started,started_at)
   VALUES ($1,$2,$3,$4,'STARTED',$5,$6::jsonb,1,NOW())
   ON CONFLICT (tracker_client_id,tracker_page_id,query_key) DO UPDATE SET
    status='STARTED',system_choice=EXCLUDED.system_choice,snapshot=EXCLUDED.snapshot,
    times_started=tracker_growth_recommendations.times_started+1,started_at=NOW(),
    skipped_at=NULL,skip_reason=NULL,research_decision=NULL,research_blocker=NULL,
    research_evidence_status=NULL,research_target_page_id=NULL,researched_at=NULL,updated_at=NOW()
   RETURNING id,status`,[clientId,pageId,key,text,!!systemChoice,JSON.stringify(snapshot||{})])).rows[0];
 if(action==='skip')return (await pool.query(`INSERT INTO tracker_growth_recommendations
   (tracker_client_id,tracker_page_id,query_key,query,status,system_choice,snapshot,skipped_at,skip_reason)
   VALUES ($1,$2,$3,$4,'SKIPPED',$5,$6::jsonb,NOW(),$7)
   ON CONFLICT (tracker_client_id,tracker_page_id,query_key) DO UPDATE SET
    status='SKIPPED',skipped_at=NOW(),skip_reason=EXCLUDED.skip_reason,updated_at=NOW()
   RETURNING id,status`,[clientId,pageId,key,text,!!systemChoice,JSON.stringify(snapshot||{}),String(reason||'').slice(0,300)])).rows[0];
 if(action==='restore')return (await pool.query(`UPDATE tracker_growth_recommendations
   SET status='OPEN',skipped_at=NULL,skip_reason=NULL,updated_at=NOW()
   WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND query_key=$3 RETURNING id,status`,[clientId,pageId,key])).rows[0]||null;
 throw Error('Unknown action');
}

// Called after the owner's complete Growth research. Attach the outcome to the
// recommendation the owner started for this page (last 14 days); otherwise
// remember it as a page-level research outcome.
async function recordResearchOutcome(pool,{clientId,pageId,targetPageId,decision,blocker,evidenceStatus,focusQuery}){
 if(!decision)return null;
 await ensureTable(pool);
 const args=[clientId,pageId,String(decision).slice(0,40),blocker?String(blocker).slice(0,80):null,
  evidenceStatus?String(evidenceStatus).slice(0,80):null,Number.isSafeInteger(Number(targetPageId))&&Number(targetPageId)>0?Number(targetPageId):null];
 const updated=(await pool.query(`UPDATE tracker_growth_recommendations SET status='RESEARCHED',
   research_decision=$3,research_blocker=$4,research_evidence_status=$5,research_target_page_id=$6,researched_at=NOW(),updated_at=NOW()
   WHERE id=(SELECT id FROM tracker_growth_recommendations WHERE tracker_client_id=$1 AND tracker_page_id=$2
     AND started_at>NOW()-INTERVAL '14 days' ORDER BY started_at DESC LIMIT 1)
   RETURNING id`,args)).rows[0];
 if(updated)return updated;
 return (await pool.query(`INSERT INTO tracker_growth_recommendations
   (tracker_client_id,tracker_page_id,query_key,query,status,research_decision,research_blocker,research_evidence_status,research_target_page_id,researched_at)
   VALUES ($1,$2,$7,$8,'RESEARCHED',$3,$4,$5,$6,NOW())
   ON CONFLICT (tracker_client_id,tracker_page_id,query_key) DO UPDATE SET status='RESEARCHED',
    research_decision=EXCLUDED.research_decision,research_blocker=EXCLUDED.research_blocker,
    research_evidence_status=EXCLUDED.research_evidence_status,research_target_page_id=EXCLUDED.research_target_page_id,
    researched_at=NOW(),updated_at=NOW()
   RETURNING id`,[...args,norm(focusQuery),String(focusQuery||'').slice(0,300)])).rows[0];
}

module.exports={ensureTable,loadMemory,recordAction,recordResearchOutcome,norm};
