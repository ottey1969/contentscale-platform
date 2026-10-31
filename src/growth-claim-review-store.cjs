'use strict';
// The owner's decision per unverified statement of a Growth proposal: KEEP (the owner confirms it is correct for their
// business) or REMOVE (it leaves the copied text). Stored per Tracker client, target page and statement; additive table.
// Growth never confirms a statement by itself.
const crypto=require('node:crypto');
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_claim_reviews(
   tracker_client_id BIGINT NOT NULL,
   target_page_id BIGINT NOT NULL,
   statement_hash TEXT NOT NULL,
   statement TEXT NOT NULL,
   decision TEXT NOT NULL CHECK (decision IN ('KEEP','REMOVE')),
   decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,target_page_id,statement_hash))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
const normStatement=t=>String(t||'').replace(/\s+/g,' ').trim();
const hashOf=t=>crypto.createHash('sha256').update(normStatement(t).toLowerCase()).digest('hex').slice(0,32);
async function saveClaimReview(pool,{clientId,targetPageId,statement,decision}){
 await ensureTable(pool);
 if(decision==='UNDECIDED'){await pool.query('DELETE FROM tracker_growth_claim_reviews WHERE tracker_client_id=$1 AND target_page_id=$2 AND statement_hash=$3',[clientId,Number(targetPageId),hashOf(statement)]);return null}
 await pool.query(`INSERT INTO tracker_growth_claim_reviews(tracker_client_id,target_page_id,statement_hash,statement,decision,decided_at) VALUES($1,$2,$3,$4,$5,NOW())
  ON CONFLICT (tracker_client_id,target_page_id,statement_hash) DO UPDATE SET decision=EXCLUDED.decision,statement=EXCLUDED.statement,decided_at=NOW()`,
  [clientId,Number(targetPageId),hashOf(statement),normStatement(statement).slice(0,600),decision]);
 return {statement:normStatement(statement),decision};
}
async function loadClaimReviews(pool,{clientId,targetPageId}){
 try{return (await pool.query('SELECT statement_hash,statement,decision,decided_at FROM tracker_growth_claim_reviews WHERE tracker_client_id=$1 AND target_page_id=$2',[clientId,Number(targetPageId)])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
module.exports={saveClaimReview,loadClaimReviews,hashOf,normStatement};
