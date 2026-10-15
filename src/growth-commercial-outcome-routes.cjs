'use strict';
const crypto=require('node:crypto');
const {classifyCommercialEvidence}=require('./growth-commercial-outcomes.cjs');
const STAGES=new Set(['inquiry_received','estimate_sent','invoice_issued','job_accepted','work_completed','payment_received']);
const CHANNELS=new Set(['organic_search','google_business_profile','paid_ads','referral','repeat_customer','direct','unknown']);
function registerGrowthCommercialOutcomeRoutes({app,pool,verifyEngineAccess}={}){
 if(!app||typeof pool?.query!=='function'||typeof verifyEngineAccess!=='function')
  throw Error('GROWTH_COMMERCIAL_ROUTE_DEPENDENCIES_REQUIRED');
 const onlyAdmin=(req,res,next)=>req.engineUser?.isAdmin===true?next():res.status(403).json({success:false,code:'GROWTH_ADMIN_ONLY'});
 const id=req=>Number(req.params.clientId);
 const valid=x=>Number.isSafeInteger(x)&&x>0;
 const path='/api/growth/admin/clients/:clientId/commercial-evidence';
 app.get(path,verifyEngineAccess,onlyAdmin,async(req,res)=>{
  const clientId=id(req);if(!valid(clientId))return res.status(400).json({success:false,code:'TRACKER_CLIENT_ID_REQUIRED'});
  try{
   const c=await pool.query('SELECT id FROM tracker_clients WHERE id=$1 LIMIT 1',[clientId]);
   if(c.rows.length!==1)return res.status(404).json({success:false,code:'TRACKER_CLIENT_NOT_FOUND'});
   const r=await pool.query('SELECT internal_evidence_id,reported_stage,claimed_channel,observed_at,recorded_at FROM growth_commercial_outcome_events WHERE tracker_client_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 200',[clientId]);
   const events=r.rows.map(x=>({internal_evidence_id:String(x.internal_evidence_id),stage:x.reported_stage,
     source:'owner_statement',channel:x.claimed_channel,channel_verified:false,observed_at:x.observed_at}));
   const evidence=classifyCommercialEvidence(events);
   return res.set('Cache-Control','private, no-store').json({success:true,client_id:clientId,
    report_scope:'private_owner_report_unverified',...evidence});
  }catch(error){return res.status(503).json({success:false,code:error?.code==='42P01'?'COMMERCIAL_EVIDENCE_MIGRATION_REQUIRED':'COMMERCIAL_EVIDENCE_UNAVAILABLE'});}
 });
 app.post(path,verifyEngineAccess,onlyAdmin,async(req,res)=>{
  const clientId=id(req);if(!valid(clientId))return res.status(400).json({success:false,code:'TRACKER_CLIENT_ID_REQUIRED'});
  const body=req.body||{},keys=Object.keys(body);
  if(keys.some(k=>!['reported_stage','claimed_channel','observed_at'].includes(k)))
   return res.status(400).json({success:false,code:'PRIVATE_CUSTOMER_OR_INVOICE_FIELDS_PROHIBITED'});
  const stage=String(body.reported_stage||''),channel=String(body.claimed_channel||'unknown');
  const date=String(body.observed_at||'');
  const ms=Date.parse(date+'T00:00:00Z');
  if(!STAGES.has(stage)||!CHANNELS.has(channel)||!/^\d{4}-\d\d-\d\d$/.test(date)||
   !Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date||ms>Date.now()+86400000)
   return res.status(400).json({success:false,code:'REPORTED_STAGE_CHANNEL_OR_DATE_INVALID'});
  try{
   const c=await pool.query('SELECT id FROM tracker_clients WHERE id=$1 LIMIT 1',[clientId]);
   if(c.rows.length!==1)return res.status(404).json({success:false,code:'TRACKER_CLIENT_NOT_FOUND'});
   const key=crypto.randomUUID();
   await pool.query("INSERT INTO growth_commercial_outcome_events (tracker_client_id,internal_evidence_id,reported_stage,claimed_channel,observed_at,source,source_verified) VALUES ($1,$2,$3,$4,$5,'owner_statement',FALSE)",[clientId,key,stage,channel,date]);
   return res.status(201).set('Cache-Control','private, no-store').json({success:true,
    status:'UNVERIFIED_OWNER_REPORTED_STAGE',internal_evidence_id:key,
    source:'owner_statement',stage,channel_claimed:channel,channel_verified:false,
    job_completion_verified:false,payment_verified:false,seo_attribution_verified:false,
    next_action:stage==='invoice_issued'?'CONFIRM_JOB_ACCEPTED_COMPLETED_PAYMENT_AND_SOURCE':'CONFIRM_RECORD_WITH_INDEPENDENT_EVIDENCE'});
  }catch(error){return res.status(503).json({success:false,code:error?.code==='42P01'?'COMMERCIAL_EVIDENCE_MIGRATION_REQUIRED':'COMMERCIAL_EVIDENCE_WRITE_UNAVAILABLE'});}
 });
}
module.exports={registerGrowthCommercialOutcomeRoutes};
