'use strict';
let ready=null;
function ensure(pool){if(!ready)ready=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_research_reports(
 tracker_client_id BIGINT NOT NULL, page_id BIGINT NOT NULL, page_url TEXT NOT NULL,
 market TEXT NOT NULL, focus_query TEXT NOT NULL, report JSONB NOT NULL,
 saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tracker_client_id,page_id,page_url,market,focus_query))`).catch(e=>{ready=null;throw e});return ready}
const identity=v=>[v.clientId,v.id,v.page.url,String(v.marketOverride||'').toUpperCase(),String(v.queryOverride||'').trim().toLowerCase()];
async function save(pool,v,report){await ensure(pool);await pool.query(`INSERT INTO tracker_growth_research_reports(tracker_client_id,page_id,page_url,market,focus_query,report,saved_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW()) ON CONFLICT(tracker_client_id,page_id,page_url,market,focus_query) DO UPDATE SET report=EXCLUDED.report,saved_at=NOW()`,[...identity(v),JSON.stringify(report)])}
async function load(pool,v){await ensure(pool);const r=await pool.query(`SELECT report,saved_at FROM tracker_growth_research_reports WHERE tracker_client_id=$1 AND page_id=$2 AND page_url=$3 AND market=$4 AND focus_query=$5`,identity(v));return r.rows[0]||null}
// Record an owner's explicit editorial review without changing the research snapshot timestamp
// or implying publication. A new research save replaces this review state automatically.
async function markBriefReviewed(pool,v,expectedGeneratedAt){
 await ensure(pool);
 const expected=String(expectedGeneratedAt||'').trim();
 if(!expected||expected.length>100)return {status:'INVALID_RESEARCH_VERSION'};
 const query=`UPDATE tracker_growth_research_reports
 SET report=jsonb_set(report,'{brief_review}',
  jsonb_build_object('status','REVIEWED','reviewed_at',NOW(),'publication_status','NOT_PUBLISHED','measurement_status','NOT_STARTED'),true)
 WHERE tracker_client_id=$1 AND page_id=$2 AND page_url=$3 AND market=$4 AND focus_query=$5
 AND report->>'generated_at'=$6
 RETURNING report->'brief_review' AS brief_review`;
 const result=await pool.query(query,[...identity(v),expected]);
 return result.rows[0]?{status:'REVIEWED',review:result.rows[0].brief_review}:{status:'RESEARCH_VERSION_CHANGED'};
}
// This is a read-only, credit-free lookup. Never substitute a tracked seed for a saved question.
async function listQuestions(pool,{clientId,pageId,pageUrl,limit=20}){
 await ensure(pool);
 const r=await pool.query(`SELECT focus_query,market,saved_at,\n COALESCE(NULLIF(report->'editorial_decision_gate'->>'focus_query',''),NULLIF(report->'search'->>'focus_query',''),focus_query) AS original_question
 FROM tracker_growth_research_reports
 WHERE tracker_client_id=$1 AND page_id=$2 AND page_url=$3
 ORDER BY saved_at DESC LIMIT $4`,[clientId,pageId,pageUrl,Math.max(1,Math.min(50,limit))]);
 return (r.rows||[]).map(x=>({question:String(x.focus_query||''),research_focus:String(x.original_question||x.focus_query||''),market:String(x.market||''),saved_at:x.saved_at})).filter(x=>x.question);
}
module.exports={save,load,listQuestions,markBriefReviewed};
