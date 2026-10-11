'use strict';
const {getPageMetrics,tokenFromServiceAccount,tokenFromOAuthRefresh}=require('./gsc-client');
const {windowDates,validateWindowInput}=require('./tracker-growth-measurement.cjs');
const name=x=>String(x||'').trim().toLowerCase();
async function gscToken(env=process.env){
 if(env.GSC_GROWTH_SERVICE_ACCOUNT_KEY_FILE)return tokenFromServiceAccount(env.GSC_GROWTH_SERVICE_ACCOUNT_KEY_FILE);
 if(env.GSC_GROWTH_CLIENT_ID&&env.GSC_GROWTH_CLIENT_SECRET&&env.GSC_GROWTH_REFRESH_TOKEN)return tokenFromOAuthRefresh({clientId:env.GSC_GROWTH_CLIENT_ID,clientSecret:env.GSC_GROWTH_CLIENT_SECRET,refreshToken:env.GSC_GROWTH_REFRESH_TOKEN});
 return null;
}
async function pullQueryWindow({siteUrl,pageUrl,query,startDate,endDate,token,fetchImpl=fetch}){
 if(!token||!siteUrl||!pageUrl||!query)throw Error('Missing authorized GSC property, page, query or access token');
 const r=await getPageMetrics(siteUrl,pageUrl,{startDate,endDate,withQueries:true,queryLimit:25000},token,fetchImpl);
 const match=r.topQueries.find(x=>name(x.query)===name(query));
 if(!match)throw Error('Exact page/query row not returned by GSC; cannot assume zero or manufacture results');
 if(!Number.isFinite(Number(match.clicks))||!Number.isFinite(Number(match.impressions)))throw Error('Invalid GSC metrics');
 return {clicks:Number(match.clicks),impressions:Number(match.impressions)};
}
function registerGrowthGscDirect(app,pool,{env=process.env,pull=pullQueryWindow,tokenProvider=gscToken}={}){
 app.post('/api/tracker-client/:token/growth/measurement/import-gsc',async(req,res)=>{
  try{
   const client=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!client)return res.status(404).json({success:false,error:'Tracker not found'});
   const pid=Number(req.body?.publication_id);
   if(!Number.isSafeInteger(pid)||pid<1)return res.status(400).json({success:false,error:'Invalid publication'});
   const pub=(await pool.query("SELECT g.id,g.tracker_page_id,g.query,g.published_at,p.url FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id WHERE g.id=$1 AND g.tracker_client_id=$2",[pid,client.id])).rows[0];
   if(!pub)return res.status(404).json({success:false,error:'Publication not found'});
   const domain=new URL('https://'+String(client.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
   if(new URL(pub.url).hostname!==domain)return res.status(403).json({success:false,error:'Domain mismatch'});
   const lock=await pool.query("SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[client.id,pub.tracker_page_id]);
   if(lock.rows.length)return res.status(409).json({success:false,error:'Active Case Study is locked'});
   const windows=windowDates(pub.published_at);
   const now=new Date();
   if(Date.parse(windows.after.end+'T23:59:59Z')>now.getTime()-3*86400000)return res.status(409).json({success:false,error:'Post-publication window is too recent for finalized GSC data'});
   const token=await tokenProvider(env);
   if(!token)return res.status(503).json({success:false,configured:false,error:'No authorized server-side Google Search Console credentials configured for Growth'});
   const siteUrl=String(env.GSC_GROWTH_SITE_URL||('sc-domain:'+domain));
   const results=[];
   for(const period of ['before','after']){
    const date=windows[period],data=await pull({siteUrl,pageUrl:pub.url,query:pub.query,startDate:date.start,endDate:date.end,token});
    const input={period,start_date:date.start,end_date:date.end,query:pub.query,clicks:data.clicks,impressions:data.impressions,source:'gsc_page_query_export'};
    const error=validateWindowInput(input,pub,now);
    if(error)return res.status(422).json({success:false,error:'GSC evidence rejected: '+error});
    results.push(input);
   }
   // No write if either exact-query response is missing/invalid.
   await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_gsc_windows(
     id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,publication_id BIGINT NOT NULL,
     period TEXT NOT NULL CHECK(period IN ('before','after')),start_date DATE NOT NULL,end_date DATE NOT NULL,
     clicks INTEGER NOT NULL,impressions INTEGER NOT NULL,source TEXT NOT NULL,
     recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(tracker_client_id,publication_id,period))`);
   const first=results[0],second=results[1];
   await pool.query(`INSERT INTO tracker_growth_gsc_windows(tracker_client_id,publication_id,period,start_date,end_date,clicks,impressions,source)
     VALUES ($1,$2,'before',$3,$4,$5,$6,'gsc_page_query_export'),($1,$2,'after',$7,$8,$9,$10,'gsc_page_query_export')
     ON CONFLICT(tracker_client_id,publication_id,period) DO UPDATE SET
     start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,clicks=EXCLUDED.clicks,
     impressions=EXCLUDED.impressions,source=EXCLUDED.source,recorded_at=NOW()`,
     [client.id,pid,first.start_date,first.end_date,first.clicks,first.impressions,second.start_date,second.end_date,second.clicks,second.impressions]);
   res.json({success:true,source:'GSC_API_PAGE_QUERY',periods:results,click_change:second.clicks-first.clicks,impression_change:second.impressions-first.impressions,attribution_proven:false});
  }catch(e){
   const msg=String(e.message||'');
   console.error('[growth-gsc-direct]',msg);
   res.status(503).json({success:false,error:'GSC import failed; no growth result was claimed',detail:msg.slice(0,180)});
  }
 });
}
module.exports={registerGrowthGscDirect,pullQueryWindow,gscToken};
