'use strict';
// The target markets the owner set for a tracked page (ordered: the first is the main market). Growth uses them for
// competitor research instead of deriving a market from the page's headings. Additive table; nothing else changes.
const {validCountries,validLanguage}=require('./growth-search-locale.cjs');
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_page_markets(
   tracker_client_id BIGINT NOT NULL,
   page_id BIGINT NOT NULL,
   countries JSONB NOT NULL,
   language TEXT,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,page_id))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
async function getPageMarkets(pool,{clientId,pageId}){
 try{const row=(await pool.query('SELECT countries,language,updated_at FROM tracker_growth_page_markets WHERE tracker_client_id=$1 AND page_id=$2',[clientId,Number(pageId)])).rows[0];
  return row?{countries:validCountries(row.countries),language:validLanguage(row.language),updated_at:row.updated_at}:null}
 catch(e){if(e.code==='42P01')return null;throw e}
}
// An empty list removes the setting (Growth derives the market from the page again).
async function setPageMarkets(pool,{clientId,pageId,countries,language}){
 await ensureTable(pool);
 const list=validCountries(countries);
 if(!list.length){await pool.query('DELETE FROM tracker_growth_page_markets WHERE tracker_client_id=$1 AND page_id=$2',[clientId,Number(pageId)]);return null}
 const lang=validLanguage(language);
 await pool.query(`INSERT INTO tracker_growth_page_markets(tracker_client_id,page_id,countries,language,updated_at) VALUES($1,$2,$3::jsonb,$4,NOW())
  ON CONFLICT (tracker_client_id,page_id) DO UPDATE SET countries=EXCLUDED.countries,language=EXCLUDED.language,updated_at=NOW()`,[clientId,Number(pageId),JSON.stringify(list),lang]);
 return {countries:list,language:lang};
}
module.exports={getPageMarkets,setPageMarkets,ensureTable};
