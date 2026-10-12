'use strict';
function validPublish({url,query,notes,published_at}){
 const stamp=Date.parse(published_at||'');
 if(!url||!/^https:\/\//i.test(url)||!String(query||'').trim())return 'A verified HTTPS page and query are required';
 if(!String(notes||'').trim()||String(notes).length>3000)return 'Describe what was actually changed (max 3000 characters)';
 if(!Number.isFinite(stamp)||stamp>Date.now()+300000||stamp<Date.now()-366*86400000)return 'Provide the actual publication time from the past year';
 return null;
}
function registerGrowthExecution(app,pool){
 // Keep this optional integration isolated: any Growth preflight error must
 // never prevent existing Tracker publication records from operating.
 try {
  const {registerGrowthWordPressPreflightRoute}=require('./growth-wordpress-preflight-route.cjs');
  const {createGrowthAdminMiddleware}=require('./growth-wordpress-admin-auth.cjs');
  const verifyGrowthAdmin=createGrowthAdminMiddleware(pool);
  registerGrowthWordPressPreflightRoute({app,pool,verifyEngineAccess:verifyGrowthAdmin});
  const {registerGrowthWordPressApprovalRoute}=require('./growth-wordpress-identity-approval-route.cjs');
  registerGrowthWordPressApprovalRoute({app,pool,verifyGrowthAdmin});
  const {registerGrowthWordPressConnectionRoute}=require('./growth-wordpress-connection-route.cjs');
  registerGrowthWordPressConnectionRoute({app,pool,verifyGrowthAdmin});
  const {registerGrowthGscPageVerification}=require('./growth-gsc-page-verification.cjs');
  registerGrowthGscPageVerification({app,pool,verifyGrowthAdmin});
 } catch(error) {
  console.error('[growth-wordpress-preflight] optional registration failed:',error.message);
 }

 app.post('/api/tracker-client/:token/growth/publication',async(req,res)=>{
  try{
   const c=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!c)return res.status(404).json({success:false,error:'Tracker not found'});
   const pageId=Number(req.body&&req.body.page_id),query=String(req.body&&req.body.query||'').trim();
   const notes=String(req.body&&req.body.notes||'').trim(),publishedAt=String(req.body&&req.body.published_at||'');
   if(!Number.isSafeInteger(pageId)||pageId<=0)return res.status(400).json({success:false,error:'Invalid page'});
   const pg=(await pool.query("SELECT id,url FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2",[pageId,c.id])).rows[0];
   if(!pg)return res.status(404).json({success:false,error:'Page not found'});
   let host,root;try{host=new URL(pg.url).hostname;root=new URL('https://'+String(c.domain).replace(/^https?:\/\//,'')).hostname}catch{return res.status(400).json({success:false,error:'Invalid domain'})}
   if(host!==root)return res.status(403).json({success:false,error:'Page belongs to another domain'});
   const err=validPublish({url:pg.url,query,notes,published_at:publishedAt});if(err)return res.status(400).json({success:false,error:err});
   const locked=(await pool.query("SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[c.id,pageId])).rows.length>0;
   if(locked)return res.status(409).json({success:false,case_study_locked:true,error:'Active Case Study: publication tracking is locked. Keep the baseline unchanged.'});
   const verified=(await pool.query("SELECT 1 FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND LOWER(query)=LOWER($3) AND evidence_scope='page_verified' LIMIT 1",[c.id,pageId,query])).rows.length>0;
   if(!verified)return res.status(409).json({success:false,error:'No verified exact-page GSC query evidence for this opportunity'});
   // Publication log is isolated from briefs, snapshots and Case Study tables.
   await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_publications (
    id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,tracker_page_id BIGINT NOT NULL,
    query TEXT NOT NULL,notes TEXT NOT NULL,published_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
   const result=await pool.query("INSERT INTO tracker_growth_publications (tracker_client_id,tracker_page_id,query,notes,published_at) VALUES ($1,$2,$3,$4,$5) RETURNING id,published_at,recorded_at",[c.id,pageId,query,notes,publishedAt]);
   res.json({success:true,publication:result.rows[0],state:'PUBLISHED_AWAITING_GSC_COMPARISON',measured_improvement:false});
  }catch(e){console.error('[growth-publication]',e.message);res.status(503).json({success:false,error:'Publication record unavailable; no claims were made'})}
 });
}
module.exports={registerGrowthExecution,validPublish};
