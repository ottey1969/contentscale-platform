'use strict';
// The Network Acquisition funnel belongs to the canonical Network company.
// No CEO, QuickScan or prospect_quick_scans dependency.
const crypto=require('node:crypto');
const path=require('node:path');
const {readWebsitePage,hostForWebsite}=require('./network-business-email-fetch.cjs');
const clean=(v,n=250)=>String(v??'').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,n);
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const tokenOk=token=>/^[a-f0-9]{48}$/.test(String(token||''));
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[ch]));
// Reserve at most 20% of the current sender warm-up allowance for Network.
// Keep an independent hard ceiling, and never bypass the shared daily sender cap.
function networkCapForWarmup(day,active){
 if(!active)return 0;
 const senderCap=warmupDailyCap(day);
 const calculated=Math.min(20,Math.max(2,Math.floor((senderCap??100)*0.2)));
 const override=process.env.NETWORK_ACQUISITION_DAILY_CAP;
 if(override!==undefined && override!==''){
  const parsed=Number(override);
  if(Number.isInteger(parsed)&&parsed>=0)return Math.min(calculated,parsed);
 }
 return calculated;
}
const baseUrl=()=>String(process.env.PUBLIC_APP_URL||'https://app.contentscale.site').replace(/\/+$/,'');
// Read the existing Lead Crawler warm-up progress. Never start/reset/advance it here.
// Network has its own smaller invitation cap, but uses the same sender and therefore
// must not exceed the remaining overall warm-up allowance.
function warmupDailyCap(day){
 if(day<=7)return 20;
 if(day<=14)return 30;
 if(day<=21)return 40;
 if(day<=28)return 50;
 if(day<=35)return 75;
 if(day<=42)return 100;
 return null;
}
async function networkWarmupSnapshot(pool){
 const [cfg,legacy,network]=await Promise.all([
  pool.query("SELECT progress_day,is_active,progress_updated_at FROM warmup_config WHERE user_id=$1 LIMIT 1",['lead_crawler_outreach']),
  pool.query("SELECT COUNT(*) FILTER(WHERE (outreach_sent_at AT TIME ZONE 'Asia/Manila')::date=(NOW() AT TIME ZONE 'Asia/Manila')::date)::int AS sent_today,COUNT(*)::int AS total_sent FROM prospect_quick_scans WHERE outreach_sent_at IS NOT NULL"),
  pool.query("SELECT count(*) FILTER(WHERE (metadata->'acquisition'->'invitation'->>'sent_at')::timestamptz AT TIME ZONE 'Asia/Manila'>=(now() AT TIME ZONE 'Asia/Manila')::date)::int AS sent_today,count(*) FILTER(WHERE metadata->'acquisition'->'invitation'->>'sent_at' IS NOT NULL)::int AS total_sent,count(*) FILTER(WHERE metadata->'acquisition'->'invitation'->>'status'='interested')::int AS interested FROM network_directory_businesses WHERE source='maps_acquisition'")
 ]);
 const row=cfg.rows[0];
 if(!row)throw Error('Original email warm-up configuration unavailable');
 const day=Math.max(1,Math.min(1000,Number(row.progress_day)||1));
 const active=row.is_active===true, completed=day>42;
 const dailyCap=active?warmupDailyCap(day):null;
 const pqsToday=Number(legacy.rows[0]?.sent_today||0);
 const networkToday=Number(network.rows[0]?.sent_today||0);
 const used=pqsToday+networkToday;
 const available=active&&(completed||used<dailyCap);
 const networkCap=networkCapForWarmup(day,active);
 const canSend=available&&networkToday<networkCap;
 return {
  warmup:{active,complete:completed,progress_day:day,total_days:42,cycle:Math.min(6,Math.ceil(day/7)),
   day_in_cycle:((day-1)%7)+1, daily_cap:dailyCap,sent_today:used,
   remaining_today:dailyCap==null?null:Math.max(0,dailyCap-used),
   next_cap:completed?null:warmupDailyCap(Math.min(43,(Math.floor((day-1)/7)+1)*7+1)),
   progress_basis:'completed_daily_targets',timezone:'Asia/Manila',
   last_progress_update:row.progress_updated_at||null,
   legacy_sent_today:pqsToday,network_sent_today:networkToday,
   total_sent:pqsToday>=0?Number(legacy.rows[0]?.total_sent||0)+Number(network.rows[0]?.total_sent||0):0},
  sent_today:networkToday,total_sent:Number(network.rows[0]?.total_sent||0),
  interested:Number(network.rows[0]?.interested||0),daily_cap:networkCap,
  remaining_today:Math.max(0,networkCap-networkToday),can_send_now:canSend,
  sender:'ContentScale Network', limit_reason:!active?'Original email warm-up is paused':!available?'Original sender warm-up daily limit reached':networkToday>=networkCap?'Network daily invitation limit reached':null
 };
}
function sameBusinessEmail(email,domain){
 const address=String(email||'').toLowerCase().trim();
 if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address))return false;
 const eDomain=address.split('@')[1], business=String(domain||'').toLowerCase().replace(/^www\./,'');
 return (eDomain===business || business.endsWith('.'+eDomain)) && !/^(no-?reply|donotreply|bounce|mailer-daemon)@/.test(address);
}
function publicCompanyContact(email,domain,source,discovery,manualConfirmed=false){
 const address=String(email||'').trim().toLowerCase();
 if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address) ||
  /^(?:no-?reply|bounce|donotreply|mailer-daemon)@/.test(address) ||
  /@example\.(?:com|org)$/.test(address) ||
  !sameBusinessUrl(source,domain))return false;
 const freemail=/@(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|aol\.com|icloud\.com)$/.test(address);
 if(freemail&&!manualConfirmed)return false;
 const observed=discovery?.email?.toLowerCase()===address&&discovery?.source_url===source&&discovery?.verification==='publicly_observed';
 return observed||(manualConfirmed===true&&sameBusinessUrl(source,domain));
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
 const safeName=escape(name);
 const url='/network/join/'+token;
 const action=state==='interested'
  ? '<div class="confirmation" role="status"><strong>Thank you — your interest has been recorded.</strong><p>We will review the next step with you. No membership, publication, or payment is created by expressing interest.</p></div>'
  : state==='prepared'
   ? '<div class="confirmation" role="status"><strong>Preview only — invitation not sent.</strong><p>The recipient will be able to express interest after you send the invitation. This preview cannot record interest.</p></div>'
   : '<form method="POST" action="'+url+'/interested" class="interest"><button type="submit">Yes, I am interested <span aria-hidden="true">→</span></button><p class="fine">No commitment. No account or payment needed to express interest. We contact you about the next step.</p></form>';
 return [
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="robots" content="noindex,nofollow"><title>Get Backlinks. Get Cited. Get Discovered. | ContentScale Network</title>',
  '<style>',
  ':root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
  '*{box-sizing:border-box}body{margin:0;background:#091526;color:#f0f6fb;font-size:16px;line-height:1.6}',
  'a{color:#92d5ff}a:hover{text-decoration:none}.wrap{max-width:960px;margin:0 auto;padding:32px 22px 56px}',
  '.brand{font-weight:800;font-size:18px;letter-spacing:.2px}.brand span{color:#62e4a1}',
  '.intro{margin-top:54px}.eyebrow{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8de5b1;font-weight:750;margin:0 0 13px}',
  'h1{font-size:clamp(35px,6vw,62px);font-weight:850;letter-spacing:-1.7px;line-height:1.08;max-width:920px;margin:0 0 20px}',
  '.lead{max-width:760px;font-size:clamp(17px,2vw,21px);color:#c7d7e8;margin:0 0 22px}.question{font-size:clamp(21px,3vw,29px);margin:10px 0 18px;line-height:1.3}',
  '.recipient{font-size:15px;color:#b6c9d9;margin-bottom:28px}.recipient strong{color:#fff}',
  '.interest{margin:25px 0}.interest button{background:#168a4d;color:#fff;border:1px solid #32b978;padding:15px 26px;font:750 17px system-ui;border-radius:9px;cursor:pointer;box-shadow:0 6px 24px #041a123b}',
  '.interest button:hover,.interest button:focus-visible{background:#1da75c}.interest button:disabled{background:#41615b;border-color:#537c6b;cursor:not-allowed;opacity:.75;box-shadow:none}.fine{font-size:13px;color:#aabfd1;margin-top:10px;max-width:680px}',
  '.benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:38px 0}',
  '.benefit{padding:23px 21px;background:#10253b;border:1px solid #294967;border-radius:13px}',
  '.benefit h2{font-size:20px;line-height:1.25;margin:0 0 10px}.benefit p{color:#bed0de;font-size:15px;margin:0}',
  '.detail{border-top:1px solid #28435b;padding-top:24px}.detail h2{font-size:22px;margin:0 0 12px}',
  '.steps{padding-left:23px;color:#c7d7e8}.steps li{padding-left:5px;margin:7px 0}',
  '.confirmation{padding:17px 20px;background:#0d3529;border:1px solid #24895c;border-radius:10px;margin:24px 0}',
  '.confirmation strong{color:#95eeb8}.confirmation p{margin:6px 0 0;color:#d2e6dd}',
  '.notice{font-size:13px;color:#b0c2d0;margin:24px 0 0;max-width:760px}',
  'footer{margin-top:36px;border-top:1px solid #28435b;padding-top:18px;color:#b2c6d5;font-size:13px}',
  '@media(max-width:690px){.intro{margin-top:32px}.benefits{grid-template-columns:1fr;margin:25px 0}.wrap{padding:22px 17px 40px}.benefit{padding:17px}h1{letter-spacing:-.7px}}',
  '</style></head><body><main class="wrap">',
  '<div class="brand">ContentScale <span>Network</span></div>',
  '<section class="intro" aria-label="Network invitation"><p class="eyebrow">Private invitation for '+safeName+'</p>',
  '<h1>Get Backlinks. Get Cited. Get Discovered.</h1>',
  '<p class="lead">Your business deserves to be found. Explore relevant publisher collaborations, editorial links, and verified business mentions that may help people discover you through search and AI-assisted research.</p>',
  '<p class="recipient">A potential content opportunity for <strong>'+safeName+'</strong>.</p>',
  '<h2 class="question">Are you interested in a content opportunity?</h2>',
  action,
  '</section><section class="benefits" aria-label="Potential benefits">',
  '<article class="benefit"><h2>Get Backlinks.</h2><p>Explore opportunities for relevant, contextual links through original content on independently operated publisher websites.</p></article>',
  '<article class="benefit"><h2>Get Cited.</h2><p>Make your verified business facts and expertise easier for publications and readers to reference accurately.</p></article>',
  '<article class="benefit"><h2>Get Discovered.</h2><p>Expand the ways potential customers can encounter your business in search results and AI-assisted discovery.</p></article>',
  '</section><section class="detail"><h2>What happens after you click Interested?</h2>',
  '<ol class="steps"><li>We record your interest and review your website, niche, and potential Network fit.</li>',
  '<li>After expressing interest, you can claim and verify your business identity before any public business profile is activated.</li>',
  '<li>We discuss relevant publishing or business opportunities with you.</li>',
  '<li>You review any proposed collaboration before a placement or publication can happen.</li></ol>',
  '<p class="notice">These are opportunities, not guarantees. Links, published mentions, rankings, traffic, or citations by AI systems are not promised. Expressing interest does not publish content, create a public profile, or enroll you in a paid service.</p></section>',
  '<footer>Questions? <a href="mailto:info@contentscale.site">info@contentscale.site</a> · <a href="'+url+'/unsubscribe">Stop Network invitations</a></footer>',
  '</main></body></html>'
 ].join('');
}
function reply(res,status,obj){return res.status(status).json(obj);}
function registerNetworkAcquisitionInvitations({app,pool,auth,inspect=websiteEvidence,sendEmail=globalThis.fetch}){
 if(!app?.post||!app?.get||!pool?.query||typeof auth!=='function')throw Error('Network acquisition invitation dependencies missing');
 // Explicit canonical admin page route: public/network-acquisition.html is an asset,
 // not a URL alias. Register through the existing Network module.
 app.get('/network/acquisition',(req,res)=>{
  // Browser navigation has no admin API header; the page's API calls enforce auth.
  return res.set('Cache-Control','no-store').sendFile(path.resolve(__dirname,'../public/network-acquisition.html'));
 });
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
 const prepareInvitation=async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id),email=clean(req.body?.email,254).toLowerCase(),source=clean(req.body?.source_url,1000);
  if(!Number.isSafeInteger(id)||id<1)return reply(res,400,{error:'Valid Network company ID required'});
  try{
   const c=await company(id);if(!c||c.public_visibility!=='hidden')return reply(res,409,{error:'Private Network company required'});
   const acq=c.metadata?.acquisition||{},audit=acq.website_review;
   if(!['site_observed','manual_reviewed'].includes(audit?.status))return reply(res,409,{error:'Check the business website first'});
   const discovered=acq.email_discovery;
   if(!publicCompanyContact(email,c.domain,source,discovered,req.body?.manually_verified===true))
    return reply(res,409,{error:'Business email needs an exact public source on this company website. An email hosted on another business domain is allowed when publicly listed on this website.'});
   const existing=inviteState(c);
   if(existing?.status && !['draft'].includes(existing.status))return reply(res,409,{error:'Network invitation already exists ('+existing.status+'). Review this record instead.'});
   // Exclude globally suppressed addresses even at preparation.
   const blocked=await pool.query("SELECT EXISTS(SELECT 1 FROM contact_intelligence_suppressions WHERE lower(email)=lower($1)) AS blocked",[email]);
   if(blocked.rows[0]?.blocked)return reply(res,409,{error:'This address has opted out of contact'});
   const token=crypto.randomBytes(24).toString('hex');
   const invited={status:'prepared',token_hash:hash(token),email,source_url:source,contact_evidence:/@(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|aol\.com|icloud\.com)$/.test(email)?'admin_source_confirmed':discovered?.email?.toLowerCase()===email&&discovered?.source_url===source?'website_observed':'admin_source_confirmed',prepared_at:new Date().toISOString(),sent_at:null};
   const saved=await pool.query(
    "UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,invitation}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition' AND public_visibility='hidden' AND (metadata->'acquisition'->'invitation'->>'status' IS NULL OR metadata->'acquisition'->'invitation'->>'status'='draft') RETURNING id",
    [id,JSON.stringify(invited)]);
   if(!saved.rows.length)return reply(res,409,{error:'Invitation was already prepared by another session'});
   return res.json({status:'prepared',company_id:id,recipient:email,preview_url:'/network/join/'+token,token,approval_required:true,email_sent:false});
  }catch(e){console.error('[network-acquisition-prepare]',e.code||e.message);return reply(res,503,{error:'Could not prepare the Network invitation'});}
 };
 app.post('/api/network/admin/acquisition/prepare-invitation',prepareInvitation);
 const rotatePreview=async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id);if(!Number.isSafeInteger(id)||id<1)return reply(res,400,{error:'Valid company required'});
  try{
   const token=crypto.randomBytes(24).toString('hex');
   const r=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(metadata,'{acquisition,invitation,token_hash}',to_jsonb($2::text)) WHERE id=$1 AND source='maps_acquisition' AND metadata->'acquisition'->'invitation'->>'status'='prepared' RETURNING id,metadata->'acquisition'->'invitation'->>'email' AS email",[id,hash(token)]);
   if(!r.rows.length)return reply(res,409,{error:'Only an unsent Network invitation preview can be refreshed'});
   return res.json({status:'prepared',token,preview_url:'/network/join/'+token,recipient:r.rows[0].email,email_sent:false});
  }catch(e){return reply(res,503,{error:'Could not refresh preview'});}
 };
 app.post('/api/network/admin/acquisition/rotate-preview',rotatePreview);
 app.get('/api/network/admin/acquisition/outreach-status',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  try{
   return res.json(await networkWarmupSnapshot(pool));
  }catch(e){return reply(res,503,{error:'Network sending limits unavailable; sending disabled'});}
 });
 const sendInvitation=async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id),token=clean(req.body?.token,50);
  if(!Number.isSafeInteger(id)||id<1||!tokenOk(token)||req.body?.approved!==true)return reply(res,400,{error:'Explicit approved Network invitation required'});
  try{
   const c=await company(id),invite=inviteState(c);
   if(!c||invite?.status!=='prepared'||invite.token_hash!==hash(token)||c.public_visibility!=='hidden')return reply(res,409,{error:'Unsent, private Network invitation required'});
   if(!publicCompanyContact(invite.email,c.domain,invite.source_url,c.metadata?.acquisition?.email_discovery,invite.contact_evidence==='admin_source_confirmed'))return reply(res,409,{error:'Verified public business contact and matching company source required'});
   if(!['site_observed','manual_reviewed'].includes(c.metadata?.acquisition?.website_review?.status))return reply(res,409,{error:'Website must be reviewed before invitation'});
   const blocked=await pool.query("SELECT EXISTS(SELECT 1 FROM contact_intelligence_suppressions WHERE lower(email)=lower($1)) AS blocked",[invite.email]);
   if(blocked.rows[0]?.blocked || invite.status==='unsubscribed')return reply(res,409,{error:'This address opted out'});
   const limits=await networkWarmupSnapshot(pool);
   if(!limits.can_send_now)return reply(res,429,{error:limits.limit_reason||'Daily sender limit reached',network_daily_cap:limits.daily_cap,warmup_daily_cap:limits.warmup.daily_cap});
   if(!process.env.BREVO_API_KEY||!process.env.FROM_EMAIL)return reply(res,503,{error:'Network email sender is not configured'});
   const claimed=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(metadata,'{acquisition,invitation,status}','\"sending\"'::jsonb) WHERE id=$1 AND source='maps_acquisition' AND metadata->'acquisition'->'invitation'->>'status'='prepared' AND metadata->'acquisition'->'invitation'->>'token_hash'=$2 RETURNING id",[id,hash(token)]);
   if(!claimed.rows.length)return reply(res,409,{error:'Invitation already being sent'});
   const url=baseUrl()+'/network/join/'+token;
   const unsubscribe=url+'/unsubscribe';
   let accepted=false,messageId='';
   try{
    const response=await sendEmail('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'api-key':process.env.BREVO_API_KEY,'content-type':'application/json','accept':'application/json'},
     body:JSON.stringify({sender:{email:process.env.FROM_EMAIL,name:'ContentScale Network'},to:[{email:invite.email}],
      subject:'Get Backlinks. Get Cited. Get Discovered. | ContentScale Network',
      textContent:'Get Backlinks. Get Cited. Get Discovered.\n\nHello,\n\nWe would like to invite '+clean(c.business_name,100)+' to explore ContentScale Network. Discover opportunities for relevant publisher collaborations, contextual editorial backlinks, accurate business mentions and visibility in traditional and AI-assisted search.\n\nInterested? Review your private invitation and click Yes, I am interested:\n'+url+'\n\nThere is no obligation to join or publish. Links, search rankings and AI citations are not guaranteed. Every proposed collaboration requires review and approval.\n\nIf you do not want further invitations, unsubscribe here: '+unsubscribe+'\n\nContentScale Network'})});
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
 };
 app.post('/api/network/admin/acquisition/send-invitation',sendInvitation);

 // Automatic invitation worker uses the SAME prepare/rotate/send handlers.
 // One worker across replicas via a session-level advisory lock; no duplicate retry
 // on ambiguous provider results. Existing company state is authoritative.
 let autoBusy=false;
 function internalResponse(){
  return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},
   json(data){this.body=data;return this;}};
 }
 // Auth is deliberately bypassed only for these trusted in-process calls.
 // The same validators and persistence handlers are used through an internal
 // authorization wrapper (never exposed to HTTP clients).
 const autoAdminRequest={get:()=>process.env.LC_ADMIN_CODE||''};
 async function autoCall(handler,body){
  const response=internalResponse();
  await handler({...autoAdminRequest,body},response);
  return response;
 }
 async function autoDispatch(){
  if(autoBusy||process.env.NETWORK_AUTO_INVITES==='off')return {skipped:'disabled_or_busy'};
  if(typeof pool.connect!=='function')return {skipped:'pool_connection_unavailable'};
  autoBusy=true;
  let client,locked=false;
  const outcome={prepared:0,sent:0,skipped:0,blocked:null};
  try{
   client=await pool.connect();
   const lock=await client.query("SELECT pg_try_advisory_lock(161997,24010) AS locked");
   locked=lock.rows[0]?.locked===true;
   if(!locked)return {skipped:'another_worker_active'};
   // First reconcile limits, then select only verified companies with observed
   // business contact evidence. Never auto-approve a freemail address.
   const current=await networkWarmupSnapshot(pool);
   if(!current.can_send_now)return {...outcome,blocked:current.limit_reason};
   const rows=await pool.query(`SELECT id,business_name,domain,canonical_url,metadata,public_visibility
    FROM network_directory_businesses
    WHERE source='maps_acquisition' AND public_visibility='hidden'
    AND metadata->'acquisition'->'website_review'->>'status' IN ('site_observed','manual_reviewed')
    AND metadata->'acquisition'->'email_discovery'->>'verification'='publicly_observed'
    AND COALESCE(metadata->'acquisition'->'invitation'->>'status','') IN ('','draft','prepared')
    ORDER BY id ASC LIMIT 100`);
   for(const c of rows.rows){
    const limits=await networkWarmupSnapshot(pool);
    if(!limits.can_send_now){outcome.blocked=limits.limit_reason;break;}
    const discovery=c.metadata?.acquisition?.email_discovery||{};
    const email=String(discovery.email||'').toLowerCase();
    const source=String(discovery.source_url||'');
    if(!publicCompanyContact(email,c.domain,source,discovery,false)){outcome.skipped++;continue;}
    const invitation=inviteState(c);
    if(invitation?.status==='prepared' && (invitation.email!==email || invitation.source_url!==source)){
     outcome.skipped++;continue; // changed contact details demand a fresh manual review
    }
    let result;
    if(invitation?.status==='prepared'){
     // Original tokens are deliberately not stored. Rotate atomically before send.
     result=await autoCall(rotatePreview,{company_id:c.id});
    }else{
     result=await autoCall(prepareInvitation,{company_id:c.id,email,source_url:source});
     if(result.statusCode===200)outcome.prepared++;
    }
    if(result.statusCode!==200||!tokenOk(result.body?.token)){outcome.skipped++;continue;}
    const sent=await autoCall(sendInvitation,{company_id:c.id,token:result.body.token,approved:true});
    if(sent.statusCode===200&&sent.body?.status==='invited')outcome.sent++;
    else if(sent.statusCode===429){outcome.blocked=sent.body?.error;break;}
    else outcome.skipped++;
   }
   console.info('[network-auto-invitations] run',JSON.stringify(outcome));
   return outcome;
  }catch(e){
   console.error('[network-auto-invitations]',e.code||e.message);
   return {...outcome,error:'Auto worker failed safely'};
  }finally{
   if(client){
    if(locked){try{await client.query("SELECT pg_advisory_unlock(161997,24010)");}catch(e){console.error('[network-auto-unlock]',e.message);}}
    client.release();
   }
   autoBusy=false;
  }
 }
 // Run after startup and periodically. Timer does not keep shutdown alive.
 if(process.env.NODE_ENV!=='test'&&process.env.NETWORK_AUTO_INVITES!=='off'){
  const timer=setInterval(()=>{autoDispatch().catch(e=>console.error('[network-auto-tick]',e.message));},15*60*1000);
  timer.unref?.();
  const startup=setTimeout(()=>{autoDispatch().catch(e=>console.error('[network-auto-start]',e.message));},45*1000);
  startup.unref?.();
 }
 app.get('/api/network/admin/acquisition/auto-status',async(req,res)=>{
  if(!auth(req))return reply(res,403,{error:'Admin login required'});
  return res.json({enabled:process.env.NETWORK_AUTO_INVITES!=='off',running:autoBusy,interval_minutes:15,mode:'verified-only',manual_approval_required:false});
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
   const r=await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(jsonb_set(metadata,'{acquisition,invitation,status}','\"interested\"'::jsonb),'{acquisition,invitation,interested_at}',to_jsonb(now())),updated_at=now() WHERE metadata->'acquisition'->'invitation'->>'token_hash'=$1 AND source='maps_acquisition' AND public_visibility='hidden' AND metadata->'acquisition'->'invitation'->>'status'='invited' RETURNING id",[hash(token)]);
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
module.exports={registerNetworkAcquisitionInvitations,websiteEvidence,sameBusinessEmail,sameBusinessUrl,publicCompanyContact,inviteMarkup,warmupDailyCap,networkCapForWarmup,networkWarmupSnapshot};
