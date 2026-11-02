'use strict';
const {getPageMetrics,tokenFromServiceAccount,tokenFromOAuthRefresh}=require('./gsc-client');
const {windowDates,validateWindowInput}=require('./tracker-growth-measurement.cjs');
const name=x=>String(x||'').trim().toLowerCase();
async function serviceAccountJsonToken(raw,fetchImpl=fetch){
 const crypto=require('node:crypto');
 let key;
 try{key=JSON.parse(raw)}catch{throw Error('GSC service-account configuration is not valid JSON')}
 if(!key||!key.client_email||!key.private_key)throw Error('GSC service-account credentials are incomplete');
 const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const header=b64({alg:'RS256',typ:'JWT'});
 const body=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',
   aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500});
 const msg=header+'.'+body;
 const signature=crypto.sign('RSA-SHA256',Buffer.from(msg),key.private_key).toString('base64url');
 const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:msg+'.'+signature}).toString(),
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('GSC service-account token exchange failed (HTTP '+response.status+')');
 const result=await response.json();
 if(!result.access_token)throw Error('GSC token exchange returned no access token');
 return result.access_token;
}
async function gscToken(env=process.env){
 if(env.GSC_SERVICE_ACCOUNT_JSON)return serviceAccountJsonToken(env.GSC_SERVICE_ACCOUNT_JSON);
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
// Reads both 28-day Search Console windows of a publication and stores them; used by the measurement page button, the
// page itself when it opens after the periods are complete, and the reminder e-mail (owner 2026-11-02: "everything that
// can be filled in automatically must be"). Never writes a zero or a guess: a missing exact page/query row stops it.
// Each period is read as soon as it is final in Search Console (its last day + 3 days): the baseline ("before", the 28
// days before publication) a few days after publishing, the "after" period from day 32 (owner 2026-11-02).
const finalPeriods=(windows,now)=>['before','after'].filter(p=>Date.parse(windows[p].end+'T23:59:59Z')<=now.getTime()-3*86400000);
async function importGscWindows(pool,{clientId,publicationId,env=process.env,pull=pullQueryWindow,tokenProvider=gscToken,now=new Date(),periods=['before','after']}){
 const client=(await pool.query("SELECT id,domain FROM tracker_clients WHERE id=$1",[clientId])).rows[0];
 if(!client)return {status:'NOT_FOUND',error:'Tracker not found'};
 const pub=(await pool.query("SELECT g.id,g.tracker_page_id,g.query,g.published_at,p.url FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id WHERE g.id=$1 AND g.tracker_client_id=$2",[publicationId,clientId])).rows[0];
 if(!pub)return {status:'NOT_FOUND',error:'Publication not found'};
 const domain=new URL('https://'+String(client.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
 if(new URL(pub.url).hostname!==domain)return {status:'DOMAIN_MISMATCH',error:'Domain mismatch'};
 const lock=await pool.query("SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[clientId,pub.tracker_page_id]);
 if(lock.rows.length)return {status:'CASE_STUDY_LOCKED',error:'Active Case Study is locked'};
 const windows=windowDates(pub.published_at);
 const wanted=finalPeriods(windows,now).filter(p=>periods.includes(p));
 if(!wanted.length)return {status:'TOO_RECENT',error:'No requested period is final in Search Console yet (its last day + 3 days)',windows};
 const token=await tokenProvider(env);
 if(!token)return {status:'NO_GSC_ACCESS',configured:false,error:'No authorized server-side Google Search Console credentials configured for Growth',windows};
 const siteUrl=String(env.GSC_GROWTH_SITE_URL||('sc-domain:'+domain));
 const results=[];
 for(const period of wanted){
  const date=windows[period];let data;
  try{data=await pull({siteUrl,pageUrl:pub.url,query:pub.query,startDate:date.start,endDate:date.end,token})}
  catch(e){return {status:/not returned/i.test(String(e.message))?'NO_ROW':'GSC_ERROR',error:String(e.message||e).slice(0,180),period,windows}}
  const input={period,start_date:date.start,end_date:date.end,query:pub.query,clicks:data.clicks,impressions:data.impressions,source:'gsc_page_query_export'};
  const error=validateWindowInput(input,pub,now);
  if(error)return {status:'REJECTED',error:'GSC evidence rejected: '+error,windows};
  results.push(input);
 }
 // No write if either exact-query response is missing/invalid.
 await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_gsc_windows(
   id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,publication_id BIGINT NOT NULL,
   period TEXT NOT NULL CHECK(period IN ('before','after')),start_date DATE NOT NULL,end_date DATE NOT NULL,
   clicks INTEGER NOT NULL,impressions INTEGER NOT NULL,source TEXT NOT NULL,
   recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(tracker_client_id,publication_id,period))`);
 for(const x of results)await pool.query(`INSERT INTO tracker_growth_gsc_windows(tracker_client_id,publication_id,period,start_date,end_date,clicks,impressions,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7,'gsc_page_query_export')
   ON CONFLICT(tracker_client_id,publication_id,period) DO UPDATE SET
   start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,clicks=EXCLUDED.clicks,
   impressions=EXCLUDED.impressions,source=EXCLUDED.source,recorded_at=NOW()`,
   [clientId,publicationId,x.period,x.start_date,x.end_date,x.clicks,x.impressions]);
 const b=results.find(x=>x.period==='before'),a=results.find(x=>x.period==='after');
 return {status:'IMPORTED',periods:results,click_change:a&&b?a.clicks-b.clicks:null,impression_change:a&&b?a.impressions-b.impressions:null,query:pub.query,windows};
}
function registerGrowthGscDirect(app,pool,{env=process.env,pull=pullQueryWindow,tokenProvider=gscToken}={}){
 const http={NOT_FOUND:404,DOMAIN_MISMATCH:403,CASE_STUDY_LOCKED:409,TOO_RECENT:409,NO_GSC_ACCESS:503,REJECTED:422,NO_ROW:503,GSC_ERROR:503};
 app.post('/api/tracker-client/:token/growth/measurement/import-gsc',async(req,res)=>{
  try{
   const client=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!client)return res.status(404).json({success:false,error:'Tracker not found'});
   const pid=Number(req.body?.publication_id);
   if(!Number.isSafeInteger(pid)||pid<1)return res.status(400).json({success:false,error:'Invalid publication'});
   // The button re-reads both periods; the automatic call from the page reads only the periods that are still missing.
   let periods=['before','after'];
   if(req.body?.only_missing===true){try{const have=(await pool.query('SELECT period FROM tracker_growth_gsc_windows WHERE tracker_client_id=$1 AND publication_id=$2',[client.id,pid])).rows.map(x=>x.period);periods=periods.filter(p=>!have.includes(p))}catch(e){if(e.code!=='42P01')throw e}}
   if(!periods.length)return res.json({success:true,source:'ALREADY_STORED',periods:[],attribution_proven:false});
   const r=await importGscWindows(pool,{clientId:client.id,publicationId:pid,env,pull,tokenProvider,periods});
   if(r.status!=='IMPORTED'){
    if(r.status==='NO_ROW'||r.status==='GSC_ERROR')console.error('[growth-gsc-direct]',r.error);
    return res.status(http[r.status]||503).json({success:false,status:r.status,...(r.status==='NO_GSC_ACCESS'?{configured:false}:{}),
     error:r.status==='NO_ROW'||r.status==='GSC_ERROR'?'GSC import failed; no growth result was claimed':r.error,...(r.status==='NO_ROW'||r.status==='GSC_ERROR'?{detail:r.error}:{})});
   }
   res.json({success:true,source:'GSC_API_PAGE_QUERY',periods:r.periods,click_change:r.click_change,impression_change:r.impression_change,attribution_proven:false});
  }catch(e){
   const msg=String(e.message||'');
   console.error('[growth-gsc-direct]',msg);
   res.status(503).json({success:false,error:'GSC import failed; no growth result was claimed',detail:msg.slice(0,180)});
  }
 });
}
// Background: every publication of the last 120 days whose missing period is final gets it read (only with Search
// Console access; a publication whose read failed is retried on the next run, at most once a day per period).
async function importDueWindows(pool,{env=process.env,pull=pullQueryWindow,tokenProvider=gscToken,now=new Date()}={}){
 if(!(await tokenProvider(env).catch(()=>null)))return {imported:0,access:false};
 let rows;
 try{rows=(await pool.query(`SELECT g.id,g.tracker_client_id,g.published_at,
   ARRAY(SELECT w.period FROM tracker_growth_gsc_windows w WHERE w.tracker_client_id=g.tracker_client_id AND w.publication_id=g.id) AS have
   FROM tracker_growth_publications g WHERE g.published_at>$1 ORDER BY g.published_at LIMIT 200`,[new Date(now.getTime()-120*86400000)])).rows}
 catch(e){if(e.code!=='42P01')throw e;
  try{rows=(await pool.query('SELECT g.id,g.tracker_client_id,g.published_at,ARRAY[]::text[] AS have FROM tracker_growth_publications g WHERE g.published_at>$1 LIMIT 200',[new Date(now.getTime()-120*86400000)])).rows}catch(e2){if(e2.code==='42P01')return {imported:0,access:true};throw e2}}
 let imported=0;
 for(const r of rows){
  const missing=finalPeriods(windowDates(r.published_at),now).filter(p=>!(r.have||[]).includes(p));
  if(!missing.length)continue;
  const out=await importGscWindows(pool,{clientId:r.tracker_client_id,publicationId:Number(r.id),env,pull,tokenProvider,now,periods:missing}).catch(e=>({status:'GSC_ERROR',error:e.message}));
  if(out.status==='IMPORTED')imported+=out.periods.length;
 }
 return {imported,access:true};
}
module.exports={registerGrowthGscDirect,importGscWindows,importDueWindows,finalPeriods,pullQueryWindow,gscToken,serviceAccountJsonToken};
