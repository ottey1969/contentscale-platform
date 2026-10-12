'use strict';
const {getPageMetrics}=require('./gsc-client');
const {gscToken}=require('./tracker-growth-gsc-direct.cjs');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const isoDaysAgo=(date,n)=>new Date(date.getTime()-n*86400000).toISOString().slice(0,10);
function validateGscQueryRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>5000)return null;
 const normalized=[],names=new Set();
 for(const r of rows){
  const query=String(r?.query||'').trim();
  const clicks=Number(r?.clicks),impressions=Number(r?.impressions),position=Number(r?.position);
  const key=query.toLocaleLowerCase('en-US');
  if(!query||query.length>512||names.has(key)||!Number.isSafeInteger(clicks)||clicks<0||
   !Number.isSafeInteger(impressions)||impressions<0||clicks>impressions||
   !Number.isFinite(position)||position<=0||position>1000)return null;
  names.add(key);normalized.push({query,clicks,impressions,position});
 }
 return normalized;
}
function registerGrowthGscPageVerification({app,pool,verifyGrowthAdmin,
 env=process.env,tokenProvider=gscToken,metricsProvider=getPageMetrics,
 now=()=>new Date()}={}){
 if(typeof app?.post!=='function'||typeof pool?.query!=='function'||typeof pool?.connect!=='function'||
  typeof verifyGrowthAdmin!=='function')throw Error('GSC_GROWTH_ROUTE_DEPENDENCIES_REQUIRED');
 app.post('/api/growth/gsc/verify/:clientId/:pageId',verifyGrowthAdmin,async(req,res)=>{
  const deny=(code,issue)=>res.status(code).json({success:false,status:'BLOCKED',issues:[issue],data_imported:false});
  if(req.engineUser?.isAdmin!==true)return deny(403,'ADMIN_REVIEW_REQUIRED');
  const pageId=Number(req.params.pageId),clientId=Number(req.params.clientId);
  if(!Number.isSafeInteger(pageId)||pageId<=0||!Number.isSafeInteger(clientId)||clientId<=0)
   return deny(400,'VALID_TRACKER_PAGE_REQUIRED');
  let canonical,client;
  try {
   canonical=await loadGrowthTrackerEvidence(pool,{pageId,clientId});
   client=(await pool.query('SELECT id,domain FROM tracker_clients WHERE id=$1 LIMIT 1',[clientId])).rows?.[0];
   if(!client)return deny(404,'TRACKER_CLIENT_NOT_FOUND');
   const host=new URL('https://'+String(client.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
   if(new URL(canonical.page.url).hostname!==host)return deny(409,'TRACKER_DOMAIN_MISMATCH');
   if(canonical.page.case_study_active)return deny(409,'CASE_STUDY_LOCK');
   const records=(await pool.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 2',[canonical.page.url])).rows||[];
   if(records.length!==1||Number(records[0].id)!==pageId||Number(records[0].tracker_client_id)!==clientId)
    return deny(409,'DUPLICATE_TRACKER_URL_REVIEW_REQUIRED');
  }catch{return deny(409,'CANONICAL_GSC_PREFLIGHT_FAILED');}
  let token;
  try {token=await tokenProvider(env);}
  catch{return deny(503,'AUTHORIZED_GSC_TOKEN_UNAVAILABLE');}
  if(!token)return deny(503,'AUTHORIZED_GSC_TOKEN_UNAVAILABLE');
  const today=now(),startDate=isoDaysAgo(today,31),endDate=isoDaysAgo(today,3);
  const hostname=new URL(canonical.page.url).hostname;
  const properties=env.GSC_GROWTH_SITE_URL?[env.GSC_GROWTH_SITE_URL]:
   ['sc-domain:'+hostname,'https://'+hostname+'/'];
  let metrics=null,gscProperty=null;
  for(const property of properties){
   try {
    const result=await metricsProvider(property,canonical.page.url,
     {startDate,endDate,withQueries:true,queryLimit:5000},token);
    if(result&&Array.isArray(result.topQueries)){metrics=result;gscProperty=property;break;}
   }catch{}
  }
  if(!metrics)return deny(503,'GSC_EXACT_PAGE_API_UNAVAILABLE');
  const rows=validateGscQueryRows(metrics.topQueries);
  if(!rows)return deny(409,metrics.topQueries?.length?'GSC_QUERY_ROWS_INVALID_OR_AMBIGUOUS':'NO_GSC_EXACT_PAGE_QUERIES');
  const clicks=Number(metrics.clicks),impressions=Number(metrics.impressions),position=Number(metrics.position);
  if(![clicks,impressions,position].every(Number.isFinite)||clicks<0||impressions<0||clicks>impressions)
   return deny(409,'GSC_PAGE_METRICS_INVALID');
  const summary={property:gscProperty,page_url:canonical.page.url,start_date:startDate,end_date:endDate,
   clicks,impressions,position,query_count:rows.length,
   top_queries:rows.slice().sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,10)};
  if(req.body?.confirm_import!==true)
   return res.json({success:true,status:'VERIFIED_GSC_PREVIEW',summary,
    next_action:'CONFIRM_EXACT_PAGE_GSC_IMPORT',data_imported:false});
  let db;
  try {
   db=await pool.connect();
   await db.query('BEGIN');
   const locked=(await db.query('SELECT id,url,tracker_client_id FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2 FOR UPDATE',[pageId,clientId])).rows?.[0];
   if(!locked||locked.url!==canonical.page.url)throw Error('TRACKER_PAGE_CHANGED');
   const caseStudy=(await db.query("SELECT id FROM tracker_case_studies WHERE tracker_page_id=$1 AND tracker_client_id=$2 AND status='active' LIMIT 1",[pageId,clientId])).rows||[];
   if(caseStudy.length)throw Error('CASE_STUDY_LOCK');
   const duplicates=(await db.query('SELECT id,tracker_client_id FROM tracker_pages WHERE url=$1 LIMIT 2',[canonical.page.url])).rows||[];
   if(duplicates.length!==1||Number(duplicates[0].id)!==pageId||Number(duplicates[0].tracker_client_id)!==clientId)
    throw Error('DUPLICATE_TRACKER_URL_REVIEW_REQUIRED');
   // Replace ONLY evidence previously generated by this verified API route.
   // Keep legacy, property-wide, user-imported and other verified evidence untouched.
   await db.query("DELETE FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' AND evidence_source='gsc_api_exact_page_query'",[clientId,pageId,canonical.page.url]);
   for(let at=0;at<rows.length;at+=200){
    const batch=rows.slice(at,at+200),params=[],groups=[];
    for(const item of batch){
     const n=params.length;
     params.push(clientId,pageId,canonical.page.url,item.query,item.clicks,item.impressions,item.position);
     groups.push('('+Array.from({length:7},(_,i)=>'$'+(n+i+1)).join(',')+",'page_verified','gsc_api_exact_page_query',NOW())");
    }
    await db.query(
     'INSERT INTO tracker_gsc_queries (tracker_client_id,page_id,source_page_url,query,clicks,impressions,position,evidence_scope,evidence_source,imported_at) VALUES '+groups.join(','),
     params);
   }
   await db.query(
    'INSERT INTO growth_gsc_page_import_runs(tracker_client_id,tracker_page_id,page_url,gsc_property,start_date,end_date,clicks,impressions,position,query_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [clientId,pageId,canonical.page.url,gscProperty,startDate,endDate,clicks,impressions,position,rows.length]);
   await db.query('COMMIT');
   return res.json({success:true,status:'GSC_EXACT_PAGE_VERIFIED',summary,data_imported:true,publication_allowed:false});
  }catch(error){
   if(db)try{await db.query('ROLLBACK')}catch{}
   return deny(409,['TRACKER_PAGE_CHANGED','CASE_STUDY_LOCK','DUPLICATE_TRACKER_URL_REVIEW_REQUIRED'].includes(error.message)?error.message:'GSC_VERIFIED_IMPORT_FAILED');
  }finally {if(db)db.release();}
 });
}
module.exports={registerGrowthGscPageVerification,validateGscQueryRows};
