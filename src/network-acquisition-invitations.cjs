'use strict';
// The Network Acquisition funnel belongs to the canonical Network company.
// No CEO, QuickScan or prospect_quick_scans dependency.
const crypto=require('node:crypto');
const {readWebsitePage,hostForWebsite}=require('./network-business-email-fetch.cjs');
const clean=(v,n=250)=>String(v??'').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,n);
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const tokenOk=token=>/^[a-f0-9]{48}$/.test(String(token||''));
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[ch]));
const cap=()=>Math.max(0,Math.min(20,Number(process.env.NETWORK_ACQUISITION_DAILY_CAP||2)||0));
const baseUrl=()=>String(process.env.PUBLIC_APP_URL||'https://app.contentscale.site').replace(/\/+$/,'');
function sameBusinessEmail(email,domain){
 const address=String(email||'').toLowerCase().trim();
 if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address))return false;
 const eDomain=address.split('@')[1], business=String(domain||'').toLowerCase().replace(/^www\./,'');
 return (eDomain===business || business.endsWith('.'+eDomain)) && !/^(no-?reply|donotreply|bounce|mailer-daemon)@/.test(address);
}
function sameBusinessUrl(url,domain){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.toLowerCase().replace(/^www\./,'')===String(domain).toLowerCase().replace(/^www\./,'');}catch{return false;}
}
async function websiteEvidence(website,read=readWebsitePage){
 const {host,websiteHost}=hostForWebsite(website);
 try{
  const html=await read(websiteHost,'/');
  const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'',120).replace(/&amp;/gi,'&');
  const withoutCode=html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
  const robotsMeta=(html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)||[])[0]||'';
  const noindex=/noindex/i.test(robotsMeta);
  const useful=withoutCode.length>=100;
  return {status:!noindex&&useful?'site_observed':'review_required',title,
   reason:noindex?'Homepage meta robots noindex':!useful?'Homepage has insufficient visible content':'Public HTML homepage observed',
   text_length:withoutCode.length,url:'https://'+websiteHost+'/',checked_at:new Date().toISOString()};
 }catch(e){return {status:'review_required',title:'',reason:'Website unavailable or restricted; manual review required',
  url:'https://'+websiteHost+'/',checked_at:new Date().toISOString()};}
}
function inviteState(row){return row?.metadata?.acquisition?.invitation || row?.invitation || null;}
function inviteMarkup(name,token,state){
 const url='/network/join/'+token;
 const intro='<p>ContentScale Network connects relevant businesses and independent publishers around original, useful content and verified business information.</p>';
 const text='<p>We would like to invite '+escape(name)+' to explore joining the ContentScale Network. Participation is optional. You can review proposed collaboration opportunities before agreeing to any publishing or placement. No publication, listing or membership is created merely by expressing interest.</p>';
 const form=state==='interested'?'<p style="color:#16783d;font-weight:700">Your interest has been recorded. We will contact you about the next step.</p>':('<form method="POST" action="'+url+'/interested"><button type="submit" style="background:#16813f;color:white;padding:14px 25px;border:0;border-radius:8px;font:inherit;cursor:pointer">I am interested</button></form>');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network invitation | ContentScale</title></head><body style="font:17px/1.6 system-ui;max-width:720px;margin:50px auto;padding:0 22px"><p style="color:#16813f;font-weight:700">ContentScale Network · Private invitation</p><h1>Invitation for '+escape(name)+'</h1>'+intro+text+'<h2>What happens next?</h2><ol><li>Click Interested to let us know you want to learn more.</li><li>We check website quality, niche fit and your potential Network role together.</li><li>If both sides agree, we explain the relevant publishing, content or business opportunities. Any actual publication requires separate approval.</li></ol>'+form+'<p><small>Questions? <a href="mailto:info@contentscale.site">info@contentscale.site</a> · <a href="'+url+'/unsubscribe">Stop invitations</a></small></p></body></html>';
}
function reply(res,status,obj){return res.status(status).json(obj);}
function registerNetworkAcquisitionInvitations({app,pool,auth,inspect=websiteEvidence,sendEmail=globalThis.fetch}){
 if(!app?.post||!app?.get||!pool?.query||typeof auth!=='function')throw Error('Network acquisition invitation dependencies missing');
 async function company(id){
  const r=await pool.query("SELECT id,business_name,domain,canonical_url,public_visibility,metadata FROM network_directory_businesses WHERE id=$1 AND source='maps_acquisition' LIMIT 1",[id]);
  return r.rows[0]||null;
 }
 app.post('/api/network/admin/acquisition/inspect-site',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id);
  if(!Number.isSafeInteger(id)||id<1)return reply(res,400,{error:'Valid company ID required'});
  try{
   const c=await company(id);if(!c)return reply(res,404,{error:'Network company not found'});
   const audit=await inspect(c.canonical_url);
   await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,website_review}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[id,JSON.stringify(audit)]);
   return res.json({company_id:id,website_review:audit});
  }catch(e){console.error('[network-acquisition-site-check]',e.code||e.message);return reply(res,503,{error:'Website review unavailable; no website approval recorded'});}
 });
 // An admin may record the actual website review if the public site blocks the crawler.
 app.post('/api/network/admin/acquisition/confirm-site',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id),confirmed=req.body?.confirmed===true;
  if(!Number.isSafeInteger(id)||id<1||!confirmed)return reply(res,400,{error:'Explicit site review required'});
  try{
   const c=await company(id);if(!c)return reply(res,404,{error:'Network company not found'});
   const site={status:'manual_reviewed',checked_at:new Date().toISOString(),url:c.canonical_url,reason:'Admin confirmed business website after independent review'};
   await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,website_review}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[id,JSON.stringify(site)]);
   return res.json({company_id:id,website_review:site});
  }catch(e){return reply(res,503,{error:'Site review could not be saved'});}
 });
 app.post('/api/network/admin/acquisition/prepare-invitation',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id),email=clean(req.body?.email,254).toLowerCase(),source=clean(req.body?.source_url,1000);
  if(!Number.isSafeInteger(id)||id<1)return reply(res,400,{error:'Valid Network company ID required'});
  try{
   const c=await company(id);if(!c||c.public_visibility!=='hidden')return reply(res,409,{error:'Private Network company required'});
   const acq=c.metadata?.acquisition||{},audit=acq.website_review;
   if(!['site_observed','manual_reviewed'].includes(audit?.status))return reply(res,409,{error:'Check the business website first'});
   const discovered=acq.email_discovery;
   const validSource=discovered?.email?.toLowerCase()===email&&discovered?.source_url===source||
    req.body?.manually_verified===true&&sameBusinessUrl(source,c.domain);
   if(!sameBusinessEmail(email,c.domain)||!sameBusinessUrl(source,c.domain)||!validSource)
    return reply(res,409,{error:'A source-backed same-domain business email is required'});
   const existing=inviteState(c);
   if(existing?.status && !['draft'].includes(existing.status))return reply(res,409,{error:'Network invitation already exists ('+existing.status+'). Review this record instead.'});
   // Exclude globally suppressed addresses even at preparation.
   const blocked=await pool.query("SELECT EXISTS(SELECT 1 FROM contact_intelligence_suppressions WHERE lower(email)=lower($1)) AS blocked",[email]);
   if(blocked.rows[0]?.blocked)return reply(res,409,{error:'This address has opted out of contact'});
   const token=crypto.randomBytes(24).toString('hex');
   const invited={status:'prepared',token_hash:hash(token),email,source_url:source,prepared_at:new Date().toISOString(),sent_at:null};
   const saved=await pool.query(
    "UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,invitation}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition' AND public_visibility='hidden' AND (metadata->'acquisition'->'invitation'->>'status' IS NULL OR metadata->'acquisition'->'invitation'->>'status'='draft') RETURNING id",
    [id,JSON.stringify(invited)]);
   if(!saved.rows.length)return reply(res,409,{error:'Invitation was already prepared by another session'});
   return res.json({status:'prepared',company_id:id,recipient:email,preview_url:'/network/join/'+token,token,approval_required:true,email_sent:false});
  }catch(e){console.error('[network-acquisition-prepare]',e.code||e.message);return reply(res,503,{error:'Could not prepare the Network invitation'});}
 });
 app.post('/api/network/admin/acquisition/rotate-preview',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id);if(!Number.isSafeInteger(id)||id<1)return reply(res,400,{error:'Valid company required'});
  try{
   const token=crypto.randomBytes(24).toString('hex');
   const r=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(metadata,'{acquisition,invitation,token_hash}',to_jsonb($2::text)) WHERE id=$1 AND source='maps_acquisition' AND metadata->'acquisition'->'invitation'->>'status'='prepared' RETURNING id,metadata->'acquisition'->'invitation'->>'email' AS email",[id,hash(token)]);
   if(!r.rows.length)return reply(res,409,{error:'Only an unsent Network invitation preview can be refreshed'});
   return res.json({status:'prepared',token,preview_url:'/network/join/'+token,recipient:r.rows[0].email,email_sent:false});
  }catch(e){return reply(res,503,{error:'Could not refresh preview'});}
 });
 app.get('/api/network/admin/acquisition/outreach-status',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  try{
   const d=await pool.query("SELECT count(*) FILTER(WHERE (metadata->'acquisition'->'invitation'->>'sent_at')::timestamptz AT TIME ZONE 'Asia/Manila' >= (now() AT TIME ZONE 'Asia/Manila')::date)::int AS sent_today,count(*) FILTER(WHERE metadata->'acquisition'->'invitation'->>'sent_at' IS NOT NULL)::int AS total_sent,count(*) FILTER(WHERE metadata->'acquisition'->'invitation'->>'status'='interested')::int AS interested FROM network_directory_businesses WHERE source='maps_acquisition'");
   const counts=d.rows[0]||{};return res.json({sent_today:counts.sent_today||0,total_sent:counts.total_sent||0,interested:counts.interested||0,daily_cap:cap(),can_send_now:(counts.sent_today||0)<cap(),sender:'ContentScale Network'});
  }catch(e){return reply(res,503,{error:'Network sending limits unavailable; sending disabled'});}
 });
 app.post('/api/network/admin/acquisition/send-invitation',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id),token=clean(req.body?.token,50);
  if(!Number.isSafeInteger(id)||id<1||!tokenOk(token)||req.body?.approved!==true)return reply(res,400,{error:'Explicit approved Network invitation required'});
  try{
   const c=await company(id),invite=inviteState(c);
   if(!c||invite?.status!=='prepared'||invite.token_hash!==hash(token)||c.public_visibility!=='hidden')return reply(res,409,{error:'Unsent, private Network invitation required'});
   if(!sameBusinessEmail(invite.email,c.domain)||!sameBusinessUrl(invite.source_url,c.domain))return reply(res,409,{error:'Verified business contact required'});
   if(!['site_observed','manual_reviewed'].includes(c.metadata?.acquisition?.website_review?.status))return reply(res,409,{error:'Website must be reviewed before invitation'});
   const blocked=await pool.query("SELECT EXISTS(SELECT 1 FROM contact_intelligence_suppressions WHERE lower(email)=lower($1)) AS blocked",[invite.email]);
   if(blocked.rows[0]?.blocked || invite.status==='unsubscribed')return reply(res,409,{error:'This address opted out'});
   const counts=await pool.query("SELECT count(*)::int AS sent_today FROM network_directory_businesses WHERE source='maps_acquisition' AND (metadata->'acquisition'->'invitation'->>'sent_at')::timestamptz AT TIME ZONE 'Asia/Manila' >= (now() AT TIME ZONE 'Asia/Manila')::date");
   if(Number(counts.rows[0]?.sent_today||0)>=cap())return reply(res,429,{error:'Network email warm-up daily sending cap reached'});
   if(!process.env.BREVO_API_KEY||!process.env.FROM_EMAIL)return reply(res,503,{error:'Network email sender is not configured'});
   const claimed=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(metadata,'{acquisition,invitation,status}','\"sending\"'::jsonb) WHERE id=$1 AND source='maps_acquisition' AND metadata->'acquisition'->'invitation'->>'status'='prepared' AND metadata->'acquisition'->'invitation'->>'token_hash'=$2 RETURNING id",[id,hash(token)]);
   if(!claimed.rows.length)return reply(res,409,{error:'Invitation already being sent'});
   const url=baseUrl()+'/network/join/'+token;
   const unsubscribe=url+'/unsubscribe';
   let accepted=false,messageId='';
   try{
    const response=await sendEmail('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'api-key':process.env.BREVO_API_KEY,'content-type':'application/json','accept':'application/json'},
     body:JSON.stringify({sender:{email:process.env.FROM_EMAIL,name:'ContentScale Network'},to:[{email:invite.email}],
      subject:'Invitation to explore the ContentScale Network — '+clean(c.business_name,80),
      textContent:'Hello,\n\nWe would like to invite '+clean(c.business_name,100)+' to explore joining the ContentScale Network. There is no obligation and no automatic publication or membership.\n\nSee your invitation and click Interested if you would like to learn more:\n'+url+'\n\nIf you do not want further invitations, unsubscribe here: '+unsubscribe+'\n\nContentScale Network'})});
    accepted=!!response.ok;
    const body=await response.json().catch(()=>({}));messageId=clean(body.messageId,180);
   }catch(e){console.error('[network-acquisition-brevo]',e.name||'UNKNOWN');}
   const status=accepted?'invited':'send_unknown';
   // Commit the send status, provider evidence and sent timestamp atomically.
   const resultPatch={status,email_result:{provider_accepted:accepted,message_id:messageId,recorded_at:new Date().toISOString()},sent_at:accepted?new Date().toISOString():null};
   await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(metadata,'{acquisition,invitation}',COALESCE(metadata->'acquisition'->'invitation','{}'::jsonb) || $3::jsonb,true),updated_at=now() WHERE id=$1 AND source='maps_acquisition' AND metadata->'acquisition'->'invitation'->>'token_hash'=$2 AND metadata->'acquisition'->'invitation'->>'status'='sending'",[id,hash(token),JSON.stringify(resultPatch)]);
   if(!accepted)return reply(res,503,{error:'Email result not confirmed. Check delivery manually before retrying.',status:'send_unknown'});
   return res.json({success:true,status:'invited',message_id:messageId,email_sent:true});
  }catch(e){console.error('[network-acquisition-send]',e.code||e.message);return reply(res,503,{error:'Network sending state unavailable. Verify the invitation before retrying.'});}
 });
 async function invitationByToken(token){
  const r=await pool.query("SELECT id,business_name,metadata->'acquisition'->'invitation' AS invitation FROM network_directory_businesses WHERE metadata->'acquisition'->'invitation'->>'token_hash'=$1 AND source='maps_acquisition' AND public_visibility='hidden' LIMIT 1",[hash(token)]);
  return r.rows[0]||null;
 }
 app.get('/network/join/:token',async(req,res)=>{
  const token=String(req.params.token||'');if(!tokenOk(token))return res.sendStatus(404);
  try{
   const c=await invitationByToken(token);
   if(!c||!['prepared','invited','interested'].includes(c.invitation?.status))return res.sendStatus(404);
   res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow').type('html').send(inviteMarkup(c.business_name,token,c.invitation.status));
  }catch(e){res.sendStatus(503);}
 });
 app.post('/network/join/:token/interested',async(req,res)=>{
  const token=String(req.params.token||'');if(!tokenOk(token))return res.sendStatus(404);
  try{
   const r=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(jsonb_set(metadata,'{acquisition,invitation,status}','\"interested\"'::jsonb),'{acquisition,invitation,interested_at}',to_jsonb(now())),updated_at=now() WHERE metadata->'acquisition'->'invitation'->>'token_hash'=$1 AND source='maps_acquisition' AND public_visibility='hidden' AND metadata->'acquisition'->'invitation'->>'status' IN ('prepared','invited') RETURNING id",[hash(token)]);
   if(!r.rows.length){const already=await invitationByToken(token);if(already?.invitation?.status!=='interested')return res.sendStatus(409);}
   return res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow').type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Interest recorded · ContentScale Network</title><body style="font:18px/1.6 system-ui;max-width:680px;margin:50px auto;padding:0 22px"><h1>Thank you — your interest is recorded</h1><p>ContentScale Network will review the next step with you. No publication, public listing or membership has been created.</p><p>Questions? <a href="mailto:info@contentscale.site">Contact us</a>.</p></body></html>');
  }catch(e){return res.sendStatus(503);}
 });
 async function unsubscribe(req,res){
  const token=String(req.params.token||'');if(!tokenOk(token))return res.sendStatus(404);
  try{
   const result=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(jsonb_set(metadata,'{acquisition,invitation,status}','\"unsubscribed\"'::jsonb),'{acquisition,invitation,unsubscribed_at}',to_jsonb(now())),updated_at=now() WHERE metadata->'acquisition'->'invitation'->>'token_hash'=$1 AND source='maps_acquisition' AND public_visibility='hidden' AND metadata->'acquisition'->'invitation'->>'status' IN ('prepared','invited','interested','unsubscribed') RETURNING id",[hash(token)]);
   if(!result.rows.length)return res.sendStatus(404);
   res.set('Cache-Control','no-store').type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><body style="font:18px system-ui;max-width:650px;margin:50px auto"><h1>Unsubscribed</h1><p>You will not receive further ContentScale Network acquisition invitations for this company.</p></body></html>');
  }catch(e){return res.sendStatus(503);}
 }
 app.get('/network/join/:token/unsubscribe',async(req,res)=>{
  const token=String(req.params.token||'');if(!tokenOk(token))return res.sendStatus(404);
  try{
   const record=await invitationByToken(token);if(!record)return res.sendStatus(404);
   res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow').type('html')
     .send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Stop Network invitations</title><body style="font:18px system-ui;max-width:650px;margin:50px auto;padding:0 20px"><h1>Stop Network invitations</h1><p>Confirm that you no longer want to receive Network invitations.</p><form action="/network/join/'+token+'/unsubscribe" method="post"><button type="submit" style="background:#157b3a;color:#fff;border:0;padding:14px 20px;border-radius:8px">Unsubscribe</button></form></body></html>');
  }catch(e){return res.sendStatus(503);}
 });
 app.post('/network/join/:token/unsubscribe',unsubscribe);
}
module.exports={registerNetworkAcquisitionInvitations,websiteEvidence,sameBusinessEmail,sameBusinessUrl,inviteMarkup};
