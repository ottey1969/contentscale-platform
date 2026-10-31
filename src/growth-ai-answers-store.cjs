'use strict';
// AI answers the owner pasted in Growth for ONE tracked page and ONE search term (the same prompt and parser as the Free
// check). One answer per AI system per term; a later paste for the same system replaces it. Additive table.
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_ai_answers(
   tracker_client_id BIGINT NOT NULL,
   page_id BIGINT NOT NULL,
   query_norm TEXT NOT NULL,
   query TEXT NOT NULL,
   engine TEXT NOT NULL,
   raw_text TEXT NOT NULL,
   parsed JSONB NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,page_id,query_norm,engine))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
const norm=q=>String(q||'').toLowerCase().replace(/\s+/g,' ').trim();
async function saveGrowthAiAnswer(pool,{clientId,pageId,query,engine,rawText,parsed}){
 await ensureTable(pool);
 await pool.query(`INSERT INTO tracker_growth_ai_answers(tracker_client_id,page_id,query_norm,query,engine,raw_text,parsed,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
  ON CONFLICT (tracker_client_id,page_id,query_norm,engine) DO UPDATE SET query=EXCLUDED.query,raw_text=EXCLUDED.raw_text,parsed=EXCLUDED.parsed,created_at=NOW()`,
  [clientId,Number(pageId),norm(query),String(query).trim(),engine,rawText,JSON.stringify(parsed)]);
}
async function listGrowthAiAnswers(pool,{clientId,pageId,query}){
 try{return (await pool.query('SELECT engine,raw_text,parsed,created_at FROM tracker_growth_ai_answers WHERE tracker_client_id=$1 AND page_id=$2 AND query_norm=$3 ORDER BY engine',
  [clientId,Number(pageId),norm(query)])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
module.exports={saveGrowthAiAnswer,listGrowthAiAnswers};
