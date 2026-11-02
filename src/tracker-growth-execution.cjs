'use strict';
const {proposalById}=require('./growth-proposal-store.cjs');
const reminders=require('./growth-measurement-reminders.cjs');
function validPublish({url,query,notes,published_at}){
 const stamp=Date.parse(published_at||'');
 if(!url||!/^https:\/\//i.test(url)||!String(query||'').trim())return 'A verified HTTPS page and query are required';
 if(!String(notes||'').trim()||String(notes).length>3000)return 'Describe what was actually changed (max 3000 characters)';
 if(!Number.isFinite(stamp)||stamp>Date.now()+300000||stamp<Date.now()-366*86400000)return 'Provide the actual publication time from the past year';
 return null;
}
function registerGrowthExecution(app,pool,deps={}){
 // Keep NJ lead discovery on the existing server and outside Network/CRM writes.
 try{
  require('./lead-crawler-serpapi.cjs').registerLeadCrawlerSerpApi(app,{pool});
  require('./network-maps-acquisition.cjs').registerNetworkMapsAcquisition({app,pool});
 }catch(error){
  console.error('[lead-crawler-serpapi] registration failed:',error.message);
 }
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
  const {registerNetworkOpportunityPilot}=require('./network-opportunity-pilot.cjs');
  registerNetworkOpportunityPilot({app,pool,verifyGrowthAdmin});
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
   const mail=reminders.parseEmails(req.body&&req.body.reminder_emails);
   if(mail.invalid.length)return res.status(400).json({success:false,error:'Not an e-mail address: '+mail.invalid.slice(0,3).join(', ')});
   if(mail.too_many)return res.status(400).json({success:false,error:'At most 5 e-mail addresses for the reminder'});
   const locked=(await pool.query("SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[c.id,pageId])).rows.length>0;
   if(locked)return res.status(409).json({success:false,case_study_locked:true,error:'Active Case Study: publication tracking is locked. Keep the baseline unchanged.'});
   const verified=(await pool.query("SELECT 1 FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND LOWER(query)=LOWER($3) AND evidence_scope='page_verified' LIMIT 1",[c.id,pageId,query])).rows.length>0;
   // GSC is optional: without verified exact-page evidence the publication is still recorded, marked NEEDS_ACCESS,
   // so measurement later says Search Console data is needed instead of blocking the record.
   const proposalId=req.body&&req.body.growth_proposal_id!=null?Number(req.body.growth_proposal_id):null;
   if(proposalId!==null&&(!Number.isSafeInteger(proposalId)||proposalId<1))return res.status(400).json({success:false,error:'Invalid Growth proposal'});
   if(proposalId!==null){
    const proposal=await proposalById(pool,{clientId:c.id,id:proposalId});
    if(!proposal||Number(proposal.target_page_id)!==pageId||proposal.target_url!==pg.url)
     return res.status(409).json({success:false,error:'This Growth proposal belongs to another page'});
   }
   // Publication log is isolated from briefs, snapshots and Case Study tables (additive columns only).
   await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_publications (
    id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,tracker_page_id BIGINT NOT NULL,
    query TEXT NOT NULL,notes TEXT NOT NULL,published_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE tracker_growth_publications ADD COLUMN IF NOT EXISTS gsc_evidence TEXT;
    ALTER TABLE tracker_growth_publications ADD COLUMN IF NOT EXISTS growth_proposal_id BIGINT`);
   const gscEvidence=verified?'VERIFIED':'NEEDS_ACCESS';
   const result=await pool.query("INSERT INTO tracker_growth_publications (tracker_client_id,tracker_page_id,query,notes,published_at,gsc_evidence,growth_proposal_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,published_at,recorded_at",[c.id,pageId,query,notes,publishedAt,gscEvidence,proposalId]);
   // Baseline: if the 28 days before publication are already final in Search Console (a publication recorded a few days
   // late), read them now; otherwise the hourly check reads them as soon as they are.
   const pubId=Number(result.rows[0].id);
   setImmediate(()=>require('./tracker-growth-gsc-direct.cjs').importGscWindows(pool,{clientId:c.id,publicationId:pubId,periods:['before']}).catch(()=>{}));
   const reminder=mail.emails.length?await reminders.setReminder(pool,{clientId:c.id,publicationId:Number(result.rows[0].id),emails:mail.emails,publishedAt}).catch(()=>null):null;
   const html=reminder?(await pool.query("SELECT to_jsonb(p)->>'html_content' AS html FROM tracker_pages p WHERE id=$1",[pageId]).catch(()=>({rows:[]}))).rows[0]?.html:null;
   const ctx=reminder?await reminders.publicationContext(pool,{clientId:c.id,publicationId:pubId}).catch(()=>null):null;
   const confirmation=reminder?await reminders.sendConfirmation({emails:reminder.emails,url:pg.url,publishedAt,notes,send:deps.send,model:deps.model,lang:reminders.pageLanguage(html),ctx}):null;
   res.json({success:true,publication:result.rows[0],gsc_evidence:gscEvidence,reminder:reminder?{emails:reminder.emails,due_at:reminder.due_at,confirmation}:mail.emails.length?{error:'NOT_SAVED'}:null,
    state:verified?'PUBLISHED_AWAITING_GSC_COMPARISON':'PUBLISHED_NEEDS_SEARCH_CONSOLE_FOR_MEASUREMENT',measured_improvement:false});
  }catch(e){console.error('[growth-publication]',e.message);res.status(503).json({success:false,error:'Publication record unavailable; no claims were made'})}
 });

 // Correct a recorded publication (owner 2026-11-02: "after the download I changed it, so I must be able to edit"):
 // what was published, when, and who gets the reminder. The date can move only while no measurement period was entered,
 // because entered numbers belong to the old periods.
 app.post('/api/tracker-client/:token/growth/publication/:id',async(req,res)=>{
  try{
   const c=(await pool.query("SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!c)return res.status(404).json({success:false,error:'Tracker not found'});
   const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({success:false,error:'Invalid publication'});
   const pub=(await pool.query('SELECT g.id,g.published_at,g.notes,g.query,p.url FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id WHERE g.id=$1 AND g.tracker_client_id=$2',[id,c.id])).rows[0];
   if(!pub)return res.status(404).json({success:false,error:'Publication not found'});
   const notes=req.body&&req.body.notes!=null?String(req.body.notes).trim():pub.notes;
   const publishedAt=req.body&&req.body.published_at?String(req.body.published_at):new Date(pub.published_at).toISOString();
   const err=validPublish({url:pub.url,query:pub.query,notes,published_at:publishedAt});if(err)return res.status(400).json({success:false,error:err});
   const moved=new Date(publishedAt).toISOString().slice(0,10)!==new Date(pub.published_at).toISOString().slice(0,10);
   if(moved){
    const has=async t=>{try{return (await pool.query('SELECT 1 FROM '+t+' WHERE tracker_client_id=$1 AND publication_id=$2 LIMIT 1',[c.id,id])).rows.length>0}catch(e){if(e.code==='42P01')return false;throw e}};
    if(await has('tracker_growth_gsc_windows')||await has('tracker_growth_lead_windows'))
     return res.status(409).json({success:false,error:'Numbers were already entered for the measurement periods of the old date. The date cannot move; correct the text only, or record a new publication.'});
   }
   const mail=reminders.parseEmails(req.body&&req.body.reminder_emails);
   if(mail.invalid.length)return res.status(400).json({success:false,error:'Not an e-mail address: '+mail.invalid.slice(0,3).join(', ')});
   if(mail.too_many)return res.status(400).json({success:false,error:'At most 5 e-mail addresses for the reminder'});
   const row=(await pool.query('UPDATE tracker_growth_publications SET notes=$3,published_at=$4 WHERE id=$1 AND tracker_client_id=$2 RETURNING id,published_at,notes',[id,c.id,notes,publishedAt])).rows[0];
   const reminder=req.body&&'reminder_emails' in req.body?await reminders.setReminder(pool,{clientId:c.id,publicationId:id,emails:mail.emails,publishedAt}):await reminders.loadReminder(pool,{clientId:c.id,publicationId:id});
   if(reminder&&moved&&!(req.body&&'reminder_emails' in req.body))await reminders.setReminder(pool,{clientId:c.id,publicationId:id,emails:reminder.emails,publishedAt});
   const wantsMail=!!(reminder&&req.body&&'reminder_emails' in req.body);
   const html=wantsMail?(await pool.query("SELECT to_jsonb(p)->>'html_content' AS html FROM tracker_pages p JOIN tracker_growth_publications g ON g.tracker_page_id=p.id AND g.tracker_client_id=p.tracker_client_id WHERE g.id=$1",[id]).catch(()=>({rows:[]}))).rows[0]?.html:null;
   const ctx=wantsMail?await reminders.publicationContext(pool,{clientId:c.id,publicationId:id}).catch(()=>null):null;
   const confirmation=wantsMail?await reminders.sendConfirmation({emails:reminder.emails,url:pub.url,publishedAt,notes,send:deps.send,model:deps.model,lang:reminders.pageLanguage(html),ctx}):null;
   res.json({success:true,publication:row,reminder:reminder?{emails:reminder.emails,due_at:reminders.dueAt(publishedAt),confirmation}:null,live_page_changed:false});
  }catch(e){console.error('[growth-publication-edit]',e.message);res.status(503).json({success:false,error:'Publication record unavailable'})}
 });
 reminders.startReminderLoop(pool);
}
module.exports={registerGrowthExecution,validPublish};
