'use strict';
// E-mail reminder after a published Growth change (owner 2026-11-02: "remind me after 28 days at the addresses I give";
// "everything that can be filled in automatically must be"). One reminder per publication, sent once when both 28-day
// windows are final in Search Console (publication date + 32 days, 08:00 UTC). Before sending, Growth imports the Search
// Console numbers of both periods itself when it has access; the e-mail says what was filled in and asks only for what
// Growth cannot know (the owner's own enquiry count). Without access, or without a row for the exact page and term, it
// says so; it never writes a zero, estimate or forecast. Additive table.
// The measurement link carries the owner link, so it goes only to the Tracker client's own registered addresses; other
// addresses get the same reminder without the link (an owner link gives full access).
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const DAY=86400000;
function parseEmails(v){
 const list=(Array.isArray(v)?v:String(v||'').split(/[,;\s]+/)).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
 const bad=list.filter(x=>!EMAIL.test(x));
 return {emails:[...new Set(list.filter(x=>EMAIL.test(x)))].slice(0,5),invalid:bad,too_many:new Set(list).size>5};
}
const ymd=t=>new Date(t).toISOString().slice(0,10);
function dueAt(publishedAt){const day=Date.parse(ymd(publishedAt)+'T00:00:00Z');return new Date(day+32*DAY+8*3600000)}
function windowsOf(publishedAt){const day=Date.parse(ymd(publishedAt)+'T00:00:00Z');
 return {before:{start:ymd(day-28*DAY),end:ymd(day-DAY)},after:{start:ymd(day+DAY),end:ymd(day+28*DAY)}}}

let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_reminders(
   id BIGSERIAL PRIMARY KEY,
   tracker_client_id BIGINT NOT NULL,
   publication_id BIGINT NOT NULL,
   emails JSONB NOT NULL,
   due_at TIMESTAMPTZ NOT NULL,
   sent_at TIMESTAMPTZ,
   attempts INTEGER NOT NULL DEFAULT 0,
   last_error TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   UNIQUE(tracker_client_id,publication_id))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
// Set, change or clear (no addresses) the reminder of a publication. A changed publication date moves the due date;
// a reminder already sent is not sent again unless the date moved.
async function setReminder(pool,{clientId,publicationId,emails,publishedAt}){
 await ensureTable(pool);
 if(!emails.length){await pool.query('DELETE FROM tracker_growth_reminders WHERE tracker_client_id=$1 AND publication_id=$2',[clientId,publicationId]);return null}
 const due=dueAt(publishedAt);
 return (await pool.query(`INSERT INTO tracker_growth_reminders(tracker_client_id,publication_id,emails,due_at) VALUES($1,$2,$3::jsonb,$4)
  ON CONFLICT (tracker_client_id,publication_id) DO UPDATE SET emails=EXCLUDED.emails,
   sent_at=CASE WHEN tracker_growth_reminders.due_at=EXCLUDED.due_at THEN tracker_growth_reminders.sent_at ELSE NULL END,
   attempts=CASE WHEN tracker_growth_reminders.due_at=EXCLUDED.due_at THEN tracker_growth_reminders.attempts ELSE 0 END,
   due_at=EXCLUDED.due_at RETURNING emails,due_at,sent_at`,[clientId,publicationId,JSON.stringify(emails),due])).rows[0];
}
async function loadReminder(pool,{clientId,publicationId}){
 try{return (await pool.query('SELECT emails,due_at,sent_at FROM tracker_growth_reminders WHERE tracker_client_id=$1 AND publication_id=$2',[clientId,publicationId])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}
const GSC_NOTE={NO_GSC_ACCESS:'Growth has no Search Console access for this site, so it could not read the numbers. Enter them yourself, or give Growth access.',
 NO_ROW:'Search Console returned no row for this exact page and search term in one of the periods. Growth does not assume zero; check the page and term in Search Console.',
 GSC_ERROR:'Search Console could not be read just now. Use “Import both periods from GSC” on the measurement page, or enter the numbers yourself.',
 REJECTED:'The Search Console answer did not match the measurement periods, so nothing was stored. Enter the numbers yourself.',
 CASE_STUDY_LOCKED:'The page is a locked Case Study; no measurement numbers are stored for it.'};
function message({url,query,publishedAt,link,gsc=null,leads=null}){
 const w=windowsOf(publishedAt),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const subject='Growth: 28 days after your change on '+url.replace(/^https?:\/\//,'')+' — '+(gsc&&gsc.status==='IMPORTED'?'Search Console filled in, add your enquiries':'enter the numbers');
 const per='before ('+w.before.start+' to '+w.before.end+') and after ('+w.after.start+' to '+w.after.end+')';
 const gscPart=gsc&&gsc.status==='IMPORTED'?
  '<p><strong>Filled in automatically from Search Console</strong> for “'+esc(query)+'”: '+gsc.periods.map(p=>p.period+' '+p.clicks+' clicks, '+p.impressions+' impressions').join('; ')+'. These are Search Console numbers for the two periods, not a forecast; a difference is not proof that the change caused it.</p>':
  '<p><strong>Search Console</strong>: '+esc(GSC_NOTE[gsc&&gsc.status]||('enter the clicks and impressions for “'+query+'” for '+per+', or use “Import both periods from GSC”.'))+'</p>';
 const need=['before','after'].filter(p=>!(leads&&leads[p]!=null));
 const leadPart=need.length?'<p><strong>Your enquiries</strong> (Growth cannot read these): enter the contact requests for this page '+need.map(p=>p==='before'?'before ('+w.before.start+' to '+w.before.end+')':'after ('+w.after.start+' to '+w.after.end+')').join(' and ')+', counted in your own contact form, mailbox or CRM.</p>':
  '<p><strong>Your enquiries</strong> are already entered for both periods.</p>';
 const html='<p>The change you published on '+esc(url)+' on '+ymd(publishedAt)+' now has a full 28 days behind it.</p>'+gscPart+leadPart+
  (link?'<p><a href="'+esc(link)+'">'+(need.length?'Enter your enquiries for this change':'Open the measurement of this change')+'</a></p>':'<p>Open the Growth measurement page from your Growth Cockpit.</p>');
 return {subject,html};
}
// Sends every due, unsent reminder once (at most 3 attempts). send({to:[emails],subject,html}) → true when accepted.
async function sendDueReminders(pool,{send,now=new Date(),baseUrl=process.env.PUBLIC_APP_URL||'https://app.contentscale.site',importGsc=null}={}){
 const imp=importGsc||((o)=>require('./tracker-growth-gsc-direct.cjs').importGscWindows(pool,o));
 let rows;
 try{rows=(await pool.query(`SELECT r.id,r.tracker_client_id,r.publication_id,r.emails,g.published_at,g.query,p.url,c.token,to_jsonb(c)->>'email' AS client_email,to_jsonb(c)->>'cc_emails' AS cc_emails
   FROM tracker_growth_reminders r JOIN tracker_growth_publications g ON g.id=r.publication_id AND g.tracker_client_id=r.tracker_client_id
   JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id
   JOIN tracker_clients c ON c.id=r.tracker_client_id
   WHERE r.sent_at IS NULL AND r.attempts<3 AND r.due_at<=$1 AND (c.status IS NULL OR c.status NOT IN ('deleted','paused','disabled')) ORDER BY r.due_at LIMIT 50`,[now])).rows}
 catch(e){if(e.code==='42P01')return {sent:0};throw e}
 let sent=0;
 for(const r of rows){
  const own=new Set([r.client_email,...String(r.cc_emails||'').split(',')].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
  const to=(r.emails||[]).map(String);
  const withLink=to.filter(x=>own.has(x)),without=to.filter(x=>!own.has(x));
  const link=String(baseUrl).replace(/\/$/,'')+'/track/'+encodeURIComponent(r.token)+'/growth/measurement#publication-'+Number(r.publication_id);
  try{
   // First fill in what Growth can read itself; a failure is described in the e-mail, never hidden or guessed.
   const gsc=await Promise.resolve(imp({clientId:r.tracker_client_id,publicationId:Number(r.publication_id),now})).catch(e=>({status:'GSC_ERROR',error:String(e.message||e)}));
   let leads=null;
   try{leads={};for(const x of (await pool.query('SELECT period,leads FROM tracker_growth_lead_windows WHERE tracker_client_id=$1 AND publication_id=$2',[r.tracker_client_id,r.publication_id])).rows)leads[x.period]=Number(x.leads)}catch(e){leads=null}
   const base={url:r.url,query:r.query,publishedAt:r.published_at,gsc,leads};
   let ok=true;
   if(withLink.length)ok=await send({to:withLink,...message({...base,link})})&&ok;
   if(without.length)ok=await send({to:without,...message({...base,link:null})})&&ok;
   if(!ok)throw Error('NOT_ACCEPTED');
   await pool.query('UPDATE tracker_growth_reminders SET sent_at=NOW(),attempts=attempts+1,last_error=$2 WHERE id=$1',[r.id,gsc&&gsc.status!=='IMPORTED'?'GSC '+gsc.status:null]);sent++;
  }catch(e){await pool.query('UPDATE tracker_growth_reminders SET attempts=attempts+1,last_error=$2 WHERE id=$1',[r.id,String(e.message||e).slice(0,200)])}
 }
 return {sent,checked:rows.length};
}
function brevoSend({to,subject,html}){
 const key=process.env.BREVO_API_KEY;if(!key)return Promise.resolve(false);
 return fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':key},
  body:JSON.stringify({to:to.map(email=>({email})),sender:{email:process.env.FROM_EMAIL||'info@contentscale.site',name:process.env.SENDER_NAME||'ContentScale Growth'},subject,htmlContent:html})})
  .then(r=>r.ok).catch(()=>false);
}
// Hourly check in the running app; off without an e-mail key or with GROWTH_REMINDERS=0.
let loop=null;
function startReminderLoop(pool,{intervalMs=3600000}={}){
 const gscConfigured=!!(process.env.GSC_SERVICE_ACCOUNT_JSON||process.env.GSC_GROWTH_SERVICE_ACCOUNT_KEY_FILE||process.env.GSC_GROWTH_REFRESH_TOKEN);
 if(loop||process.env.GROWTH_REMINDERS==='0'||(!process.env.BREVO_API_KEY&&!gscConfigured))return null;
 // First read every Search Console period that became final (baseline and after), then send the due reminders.
 const tick=()=>require('./tracker-growth-gsc-direct.cjs').importDueWindows(pool).then(r=>{if(r.imported)console.log('[growth-measurement] Search Console periods read',r.imported)})
  .catch(e=>console.warn('[growth-measurement]',String(e.code||e.message||e).slice(0,80)))
  .then(()=>sendDueReminders(pool,{send:brevoSend})).then(r=>{if(r&&r.sent)console.log('[growth-reminders] sent',r.sent)}).catch(e=>console.warn('[growth-reminders]',String(e.code||e.message||e).slice(0,80)));
 loop=setInterval(tick,intervalMs);if(loop.unref)loop.unref();setTimeout(tick,60000).unref?.();
 return loop;
}
module.exports={parseEmails,dueAt,windowsOf,setReminder,loadReminder,sendDueReminders,message,startReminderLoop,ensureTable};
