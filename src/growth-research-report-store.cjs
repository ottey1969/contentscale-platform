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
module.exports={save,load};
