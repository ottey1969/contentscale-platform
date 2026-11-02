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
// The e-mails are written for a website owner without SEO knowledge (owner 2026-11-02: "give a non-expert owner the
// status: briefly what we did, then what is still to come; transparent, not an e-mail they don't understand").
// Plain words: "times shown in Google" instead of impressions; every number says where it comes from.
const longDate=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const shortDate=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'});
const escH=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const page=url=>String(url||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
const span=(w,p)=>shortDate(w[p].start+'T00:00:00Z')+' – '+shortDate(w[p].end+'T00:00:00Z');
const block=(title,body)=>'<h3 style="margin:18px 0 6px;font-size:16px">'+title+'</h3>'+body;
const GSC_PLAIN={NO_GSC_ACCESS:'We could not read the Google numbers automatically, because Growth has no access to Google Search Console for this website yet. Ask your web contact to give access, or look the numbers up together.',
 NO_ROW:'Google reports no numbers for this page and this search term in one of the two periods. That can mean the page was hardly shown for it. We do not fill in a zero ourselves; your web contact can check it in Google Search Console.',
 GSC_ERROR:'Google could not be reached just now. We will show the numbers on the measurement page as soon as they can be read.',
 REJECTED:'The numbers Google gave did not match the two periods exactly, so we did not use them.',
 CASE_STUDY_LOCKED:'This page is a protected case study, so no measurement is stored for it.'};
function whatWeDid(url,publishedAt,notes){
 return block('Where we are','<p>On '+longDate(publishedAt)+' new content was published on your page <strong>'+escH(page(url))+'</strong>.'+
  (notes?' What changed: '+escH(String(notes).slice(0,400))+(String(notes).length>400?'…':''):'')+'</p>');
}
function noPromise(){return block('What we do not promise','<p>More visitors or more customers are not guaranteed. Google and your market also change by themselves. We show you honestly what happened before and after, nothing more.</p>')}
function message({url,query,publishedAt,link,gsc=null,leads=null,notes=''}){
 const w=windowsOf(publishedAt);
 const got=gsc&&gsc.status==='IMPORTED'?Object.fromEntries((gsc.periods||[]).map(p=>[p.period,p])):{};
 const need=['before','after'].filter(p=>!(leads&&leads[p]!=null));
 const subject='4 weeks after the update of '+page(url)+': '+(need.length?'the results and one question':'the results');
 let numbers;
 if(got.before&&got.after){
  const d=got.after.clicks-got.before.clicks;
  numbers='<p>People searching for “'+escH(query)+'” in Google:</p><table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0"></td><td style="padding:4px 12px"><strong>4 weeks before</strong><br><small>'+span(w,'before')+'</small></td><td style="padding:4px 12px"><strong>4 weeks after</strong><br><small>'+span(w,'after')+'</small></td></tr>'+
   '<tr><td style="padding:4px 12px 4px 0">Times your page was shown</td><td style="padding:4px 12px">'+got.before.impressions+'</td><td style="padding:4px 12px">'+got.after.impressions+'</td></tr>'+
   '<tr><td style="padding:4px 12px 4px 0">Times someone clicked to your page</td><td style="padding:4px 12px">'+got.before.clicks+'</td><td style="padding:4px 12px">'+got.after.clicks+'</td></tr></table>'+
   '<p>That is '+(d>0?d+' click'+(d===1?'':'s')+' more':d<0?(-d)+' click'+(d===-1?'':'s')+' fewer':'the same number of clicks')+' than before. These numbers come from Google Search Console. A difference is not proof that the update caused it.</p>';
 }else numbers='<p>'+escH(GSC_PLAIN[gsc&&gsc.status]||'The Google numbers are not available yet; they appear on the measurement page as soon as they can be read.')+'</p>';
 const question=need.length?block('One question for you','<p>Only you know how many people contacted you about this page (by your contact form, e-mail or phone). How many were there '+
   need.map(p=>p==='before'?'in the 4 weeks before ('+span(w,'before')+')':'in the 4 weeks after ('+span(w,'after')+')').join(' and ')+'? Your answer takes about a minute.</p>'+
   (link?'<p><a href="'+escH(link)+'" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Enter your enquiries for this change</a></p>':'<p>You can enter it on the Growth measurement page; your website contact has the link.</p>')):'';
 const next=block('What happens next','<p>'+(need.length?'After your answer, the measurement of this change is complete and Growth will suggest the next improvement.':'The measurement of this change is complete. Growth will suggest the next improvement.')+'</p>');
 const html='<div style="font:15px/1.55 system-ui,sans-serif;color:#172337;max-width:620px"><p>Hello,</p><p>Here is the status of your page, in plain words. 28 days have passed since the update; this is the result we promised to show you.</p>'+whatWeDid(url,publishedAt,notes)+block('What we measured',numbers)+question+next+noPromise()+'<p>ContentScale Growth</p></div>';
 return {subject,html};
}
// Sends every due, unsent reminder once (at most 3 attempts). send({to:[emails],subject,html}) → true when accepted.
async function sendDueReminders(pool,{send,now=new Date(),baseUrl=process.env.PUBLIC_APP_URL||'https://app.contentscale.site',importGsc=null}={}){
 const imp=importGsc||((o)=>require('./tracker-growth-gsc-direct.cjs').importGscWindows(pool,o));
 let rows;
 try{rows=(await pool.query(`SELECT r.id,r.tracker_client_id,r.publication_id,r.emails,g.published_at,g.query,g.notes,p.url,c.token,to_jsonb(c)->>'email' AS client_email,to_jsonb(c)->>'cc_emails' AS cc_emails
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
   const base={url:r.url,query:r.query,publishedAt:r.published_at,gsc,leads,notes:r.notes};
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
// Confirmation right after the reminder is set or changed (owner 2026-11-02: "it does not work" — nothing arrived, so
// nothing showed that it was set). It states the date and the addresses; it contains no owner link.
async function sendConfirmation({emails,url,publishedAt,notes='',send=brevoSend,
 gscAvailable=!!(process.env.GSC_SERVICE_ACCOUNT_JSON||process.env.GSC_GROWTH_SERVICE_ACCOUNT_KEY_FILE||process.env.GSC_GROWTH_REFRESH_TOKEN)}){
 if(!emails.length)return {sent:false,reason:'NO_ADDRESSES'};
 if(send===brevoSend&&!process.env.BREVO_API_KEY)return {sent:false,reason:'EMAIL_NOT_CONFIGURED'};
 const due=dueAt(publishedAt),w=windowsOf(publishedAt);
 const html='<div style="font:15px/1.55 system-ui,sans-serif;color:#172337;max-width:620px"><p>Hello,</p><p>A short update on your website, in plain words.</p>'+
  whatWeDid(url,publishedAt,notes)+
  block('What happens now','<p>For the next 4 weeks we give Google time to show the updated page. <strong>You do not need to do anything.</strong></p>')+
  block('What we will check on '+longDate(due),'<ul style="padding-left:20px"><li>How often your page was shown in Google, and how often people clicked to it: the 4 weeks before the update ('+span(w,'before')+') compared with the 4 weeks after ('+span(w,'after')+'). '+(gscAvailable?'Growth reads these numbers from Google itself.':'Growth has no access to Google Search Console for your website yet, so these numbers have to be looked up by your web contact (or give Growth access, then it reads them itself).')+'</li>'+
   '<li>How many people contacted you about this page in those same weeks. Only you know this, so on '+longDate(due)+' we will e-mail you and ask. It takes about a minute.</li></ul>')+
  noPromise()+'<p>You receive this e-mail because these addresses were entered for the reminder: '+emails.map(escH).join(', ')+'.</p><p>ContentScale Growth</p></div>';
 const ok=await send({to:emails,subject:'Your page update is live — we will show you the results on '+longDate(due),html}).catch(()=>false);
 return ok?{sent:true}:{sent:false,reason:'NOT_ACCEPTED'};
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
module.exports={parseEmails,dueAt,windowsOf,setReminder,loadReminder,sendDueReminders,sendConfirmation,message,startReminderLoop,ensureTable};
