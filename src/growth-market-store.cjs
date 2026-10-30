'use strict';
// The target markets the owner set for a tracked page (ordered: the first is the main market). Growth uses them for
// competitor research instead of deriving a market from the page's headings. Additive table; nothing else changes.
const {validCountries,validLanguage}=require('./growth-search-locale.cjs');
let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_page_markets(
   tracker_client_id BIGINT NOT NULL,
   page_id BIGINT NOT NULL,
   countries JSONB NOT NULL,   -- may be empty when only the language is set
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
// Market(s) and language are set separately: an empty field is inherited (Pre-Write brief, then the page). Both empty
// removes the setting.
async function setPageMarkets(pool,{clientId,pageId,countries,language}){
 await ensureTable(pool);
 const list=validCountries(countries),lang=validLanguage(language);
 if(!list.length&&!lang){await pool.query('DELETE FROM tracker_growth_page_markets WHERE tracker_client_id=$1 AND page_id=$2',[clientId,Number(pageId)]);return null}
 await pool.query(`INSERT INTO tracker_growth_page_markets(tracker_client_id,page_id,countries,language,updated_at) VALUES($1,$2,$3::jsonb,$4,NOW())
  ON CONFLICT (tracker_client_id,page_id) DO UPDATE SET countries=EXCLUDED.countries,language=EXCLUDED.language,updated_at=NOW()`,[clientId,Number(pageId),JSON.stringify(list),lang]);
 return {countries:list,language:lang};
}
// The target market and language of the client's latest Pre-Write brief for the same keyword (the Tracker already asks
// for both there). Used when nothing is set for the page in Growth. Read only; the Pre-Write table is not changed.
// The newest brief is used; other briefs for the same keyword with ANOTHER market or language are listed, so the owner
// sees there was a choice (and can set the market in Growth). The brief is named by id, keyword and date.
async function getPrewriteMarket(pool,{clientId,keywords=[]}){
 const list=[...new Set(keywords.map(k=>String(k||'').trim().toLowerCase()).filter(Boolean))];
 if(!list.length)return null;
 try{const rows=(await pool.query(`SELECT id,keyword,language,region,created_at FROM prewrite_briefs WHERE client_id=$1 AND LOWER(TRIM(keyword))=ANY($2::text[]) ORDER BY created_at DESC,id DESC LIMIT 20`,[clientId,list])).rows
   .map(r=>({id:Number(r.id),keyword:r.keyword,created_at:r.created_at,countries:validCountries([r.region]),language:validLanguage(r.language)})).filter(r=>r.countries.length);
  if(!rows.length)return null;const [row,...rest]=rows;
  const seen=new Set([row.countries[0]+'|'+(row.language||'')]);
  const alternatives=rest.filter(r=>{const k=r.countries[0]+'|'+(r.language||'');if(seen.has(k))return false;seen.add(k);return true})
   .map(r=>({brief_id:r.id,country:r.countries[0],language:r.language,created_at:r.created_at}));
  return {countries:row.countries,language:row.language,source:'FROM_PREWRITE_BRIEF',
   brief:{id:row.id,keyword:row.keyword,created_at:row.created_at},brief_id:row.id,keyword:row.keyword,created_at:row.created_at,alternatives}}
 catch(e){if(e.code==='42P01'||e.code==='42703')return null;throw e}
}
// What the research uses: the Growth setting, field by field, with the Pre-Write brief filling what is not set there.
function resolveMarketSetting(growth,prewrite){
 const g=growth||{},p=prewrite||{};
 const countries=g.countries?.length?g.countries:p.countries||[];
 const language=g.language||p.language||null;
 if(!countries.length&&!language)return null;
 return {countries,language,
  source:g.countries?.length?'SET_IN_TRACKER':p.countries?.length?'FROM_PREWRITE_BRIEF':null,
  language_source:g.language?'SET_IN_TRACKER':p.language?'FROM_PREWRITE_BRIEF':null,
  brief:p.brief&&(!g.countries?.length||!g.language)?p.brief:null,alternatives:p.alternatives||[]};
}
module.exports={getPageMarkets,setPageMarkets,getPrewriteMarket,resolveMarketSetting,ensureTable};
