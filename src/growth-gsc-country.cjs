'use strict';
// Search Console per country: page × query × country for the last 28 finalised days, pulled server-side for the site of
// a Tracker client when the owner asks. It feeds the Opportunity Finder. Search Console stays optional: without it the
// finder says the data is missing. Additive table; the existing Tracker GSC import is not changed.
const {searchAnalytics,defaultRange}=require('./gsc-client');

let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_gsc_country(
   tracker_client_id BIGINT NOT NULL,
   page_url TEXT NOT NULL,
   query TEXT NOT NULL,
   country TEXT NOT NULL,
   clicks INTEGER NOT NULL,
   impressions INTEGER NOT NULL,
   position NUMERIC NOT NULL,
   start_date DATE NOT NULL,
   end_date DATE NOT NULL,
   imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,page_url,query,country))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
// GSC reports countries as ISO 3166-1 alpha-3 ("nld", "usa"); the finder and the research use alpha-2.
const ALPHA3={usa:'US',gbr:'GB',can:'CA',aus:'AU',irl:'IE',nzl:'NZ',nld:'NL',bel:'BE',deu:'DE',aut:'AT',che:'CH',fra:'FR',esp:'ES',ita:'IT',prt:'PT',
 pol:'PL',swe:'SE',dnk:'DK',nor:'NO',fin:'FI',tur:'TR',rus:'RU',are:'AE',sau:'SA',qat:'QA',kwt:'KW',bhr:'BH',omn:'OM',egy:'EG',mar:'MA',zaf:'ZA',
 ind:'IN',chn:'CN',hkg:'HK',twn:'TW',jpn:'JP',kor:'KR',sgp:'SG',mys:'MY',idn:'ID',phl:'PH',tha:'TH',vnm:'VN',bra:'BR',mex:'MX',arg:'AR',chl:'CL',
 col:'CO',lux:'LU',pak:'PK',nga:'NG',ken:'KE',isr:'IL',grc:'GR',cze:'CZ',hun:'HU',rou:'RO',ukr:'UA'};
const alpha2=c=>ALPHA3[String(c||'').toLowerCase()]||(/^[a-z]{2}$/i.test(String(c||''))?String(c).toUpperCase():null);

async function pullCountryRows({siteUrl,token,fetchImpl=fetch,days=28}){
 const {startDate,endDate}=defaultRange(days);
 const rows=await searchAnalytics(siteUrl,{startDate,endDate,dimensions:['page','query','country'],rowLimit:25000},token,fetchImpl);
 return {startDate,endDate,rows:rows.map(r=>({page_url:r.keys[0],query:String(r.keys[1]||'').trim().toLowerCase(),country:alpha2(r.keys[2]),
  clicks:Math.round(Number(r.clicks)||0),impressions:Math.round(Number(r.impressions)||0),position:Number(r.position)||0}))
  .filter(r=>r.page_url&&r.query&&r.country&&r.impressions>0)};
}
// Replaces the client's rows in one transaction, so the finder never mixes two imports.
async function saveCountryRows(pool,{clientId,startDate,endDate,rows}){
 await ensureTable(pool);
 const client=typeof pool.connect==='function'?await pool.connect():null,q=client||pool;
 try{
  await q.query('BEGIN');
  await q.query('DELETE FROM tracker_growth_gsc_country WHERE tracker_client_id=$1',[clientId]);
  for(let i=0;i<rows.length;i+=500){
   const part=rows.slice(i,i+500),vals=[],args=[];
   part.forEach((r,j)=>{const b=j*9;vals.push('($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+',$'+(b+7)+',$'+(b+8)+',$'+(b+9)+')');
    args.push(clientId,r.page_url,r.query,r.country,r.clicks,r.impressions,r.position,startDate,endDate)});
   await q.query('INSERT INTO tracker_growth_gsc_country(tracker_client_id,page_url,query,country,clicks,impressions,position,start_date,end_date) VALUES '+vals.join(',')+
    ' ON CONFLICT (tracker_client_id,page_url,query,country) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,position=EXCLUDED.position,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,imported_at=NOW()',args);
  }
  await q.query('COMMIT');
 }catch(e){await q.query('ROLLBACK').catch(()=>{});throw e}
 finally{if(client)client.release()}
 return {rows:rows.length,start_date:startDate,end_date:endDate};
}
async function loadCountryRows(pool,{clientId}){
 try{return (await pool.query('SELECT page_url,query,country,clicks,impressions,position::float AS position,start_date::text,end_date::text,imported_at FROM tracker_growth_gsc_country WHERE tracker_client_id=$1',[clientId])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
module.exports={pullCountryRows,saveCountryRows,loadCountryRows,alpha2,ensureTable};
