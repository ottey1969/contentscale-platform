'use strict';
// Leaderboard self-submission with e-mail confirmation (owner 2026-11-28).
// Nobody is listed without the company's own consent: after a scan of 70+ the visitor gives a company name, an e-mail and
// consent; a confirmation link is mailed; only a confirmed request reaches Admin → Pending, where the owner approves.
// The score is read from the server's own scan log (never from the browser). The owner sees whether the e-mail is on the
// site's own domain. Only a hash of the confirmation token is stored.
const crypto=require('node:crypto');

const AUTO_APPROVE=['contentscale.site','app.contentscale.site'];
const SCAN_WINDOW="INTERVAL '6 hours'";
const MAX_PER_IP_PER_DAY=5;
const TOKEN_HOURS=48;
const PENDING_SQL=`SELECT * FROM leaderboard WHERE admin_verified = FALSE AND (contact_email IS NULL OR email_confirmed_at IS NOT NULL)
 ORDER BY email_confirmed_at DESC NULLS LAST, created_at DESC LIMIT 50`;

// Owner 2026-11-28: the e-mail is never used for promotion; said in the pop-up and in the e-mail.
const NO_PROMO={"en": "Your e-mail is only used for this confirmation and for questions about your entry — never for promotion or newsletters.", "nl": "Je e-mailadres wordt alleen gebruikt voor deze bevestiging en voor vragen over je vermelding — nooit voor promotie of nieuwsbrieven.", "es": "Tu email solo se usa para esta confirmación y para preguntas sobre tu entrada — nunca para promoción ni boletines."};
// The consent text the visitor ticks; stored with the request as proof of what was agreed.
const CONSENT={
 en:'I own or represent this website. ContentScale may show the company name, the page address and the score publicly on its leaderboard. I can ask for removal at any time.',
 nl:'Ik ben eigenaar of vertegenwoordiger van deze website. ContentScale mag de bedrijfsnaam, het paginaadres en de score openbaar tonen op het leaderboard. Ik kan op elk moment om verwijdering vragen.',
 es:'Soy propietario o representante de este sitio web. ContentScale puede mostrar públicamente el nombre de la empresa, la dirección de la página y la puntuación en su clasificación. Puedo pedir la eliminación en cualquier momento.'
};
const T={
 en:{agree:'By confirming you agree to:',subject:'Confirm your ContentScale Leaderboard entry',hi:'Hello',body:(name,url,score)=>`You asked to add <strong>${name}</strong> (${url}) with a ContentScore of <strong>${score}/100</strong> to the ContentScale Leaderboard.`,
  button:'Confirm my entry',after:'After you confirm, ContentScale reviews the entry before it appears. Did not ask for this? Ignore this e-mail; nothing is published.',
  ok:'Confirmed. Thank you!',okText:'Your entry is confirmed. After a short review by ContentScale it appears on the leaderboard.',bad:'This link is invalid or has expired.',badText:'Request a new confirmation from the scanner.',back:'Back to ContentScale'},
 nl:{agree:'Met je bevestiging ga je akkoord met:',subject:'Bevestig je vermelding op het ContentScale-leaderboard',hi:'Hallo',body:(name,url,score)=>`Je vroeg om <strong>${name}</strong> (${url}) met een ContentScore van <strong>${score}/100</strong> toe te voegen aan het ContentScale-leaderboard.`,
  button:'Bevestig mijn vermelding',after:'Na je bevestiging controleert ContentScale de vermelding voordat die zichtbaar wordt. Niet aangevraagd? Negeer deze e-mail; er wordt niets gepubliceerd.',
  ok:'Bevestigd. Dank je!',okText:'Je vermelding is bevestigd. Na een korte controle door ContentScale staat ze op het leaderboard.',bad:'Deze link is ongeldig of verlopen.',badText:'Vraag in de scanner een nieuwe bevestiging aan.',back:'Terug naar ContentScale'},
 es:{agree:'Al confirmar aceptas:',subject:'Confirma tu entrada en la clasificación de ContentScale',hi:'Hola',body:(name,url,score)=>`Pediste añadir <strong>${name}</strong> (${url}) con un ContentScore de <strong>${score}/100</strong> a la clasificación de ContentScale.`,
  button:'Confirmar mi entrada',after:'Tras tu confirmación, ContentScale revisa la entrada antes de publicarla. ¿No lo pediste? Ignora este email; no se publica nada.',
  ok:'Confirmado. ¡Gracias!',okText:'Tu entrada está confirmada. Tras una breve revisión de ContentScale aparecerá en la clasificación.',bad:'Este enlace no es válido o ha caducado.',badText:'Solicita una nueva confirmación desde el escáner.',back:'Volver a ContentScale'}
};
const langOf=v=>Object.hasOwn(T,String(v||''))?String(v):'en';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hashToken=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}};
function pageUrl(raw){
 try{const u=new URL(String(raw||'').trim());if(!/^https?:$/.test(u.protocol)||u.username||u.password||!u.hostname.includes('.'))return null;u.hash='';return u.href}catch{return null}
}
function emailDomainMatches(email,host){
 const d=String(email).split('@')[1]?.toLowerCase().replace(/^www\./,'')||'';
 return !!d&&!!host&&(d===host||host.endsWith('.'+d)||d.endsWith('.'+host));
}
async function brevoMail({to,subject,html}){
 const key=process.env.BREVO_API_KEY||'';
 if(!key)return false;
 const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','api-key':key},
  body:JSON.stringify({to:[{email:to}],sender:{email:process.env.FROM_EMAIL||'info@contentscale.site',name:'ContentScale'},subject,htmlContent:html})});
 return r.ok;
}
const readyMap=new WeakMap();
function ready(pool){
 if(!readyMap.has(pool))readyMap.set(pool,(async()=>{
  for(const col of ['contact_email TEXT','confirm_token_hash TEXT','confirm_expires_at TIMESTAMPTZ','confirm_sent_at TIMESTAMPTZ','email_confirmed_at TIMESTAMPTZ',
   'consent_at TIMESTAMPTZ','consent_text TEXT','email_domain_match BOOLEAN','score_source VARCHAR(40)','request_ip_hash TEXT','ui_lang VARCHAR(5)'])
   await pool.query('ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS '+col);
 })().catch(e=>{readyMap.delete(pool);throw e}));
 return readyMap.get(pool);
}
function page(lang,ok){
 const t=T[lang];
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(ok?t.ok:t.bad)}</title>
<style>body{margin:0;background:#0f0a2e;color:#e5e7eb;font:16px/1.5 system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:460px;margin:20px;background:#1e1b4b;border:1px solid #7c3aed;border-radius:16px;padding:28px;text-align:center}h1{font-size:1.4rem}a{display:inline-block;margin-top:14px;background:#7e22ce;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700}</style>
</head><body><main><div style="font-size:2.4rem">${ok?'🏆':'⚠️'}</div><h1>${esc(ok?t.ok:t.bad)}</h1><p>${esc(ok?t.okText:t.badText)}</p><a href="${lang==='en'?'/':'/'+lang+'/'}#leaderboard">${esc(t.back)}</a></main></body></html>`;
}
function registerLeaderboardConfirm(app,pool,{sendMail=brevoMail,secret=process.env.FREE_LIMIT_SECRET||process.env.SESSION_SECRET||'contentscale-leaderboard',autoApprove=AUTO_APPROVE}={}){
 if(pool)ready(pool).catch(e=>console.warn('[leaderboard-confirm] schema',e.message));
 const ipHash=req=>crypto.createHmac('sha256',secret).update('ip|'+String(req.ip||'')).digest('hex').slice(0,40);
 app.post('/api/leaderboard/request',async(req,res)=>{
  const b=req.body||{},lang=langOf(b.lang);
  const email=String(b.email||'').trim().slice(0,200);
  const name=String(b.company_name||'').trim().slice(0,120);
  if(b.consent!==true||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return res.status(400).json({success:false,code:'INPUT',error:'E-mail and consent are required.'});
  const kind=b.kind==='site'?'site':'page';
  const url=pageUrl(b.url);
  if(!url)return res.status(400).json({success:false,code:'INPUT',error:'A valid page address is required.'});
  const host=hostOf(url);
  try{
   await ready(pool);
   // The score is the server's own scan result from the last 6 hours, never a number sent by the browser.
   let score,entryUrl,pages=[];
   if(kind==='page'){
    const r=(await pool.query(`SELECT score FROM scan_log WHERE business_url=$1 AND source='single' AND created_at>NOW()-${SCAN_WINDOW} ORDER BY created_at DESC LIMIT 1`,[url])).rows[0];
    if(!r)return res.status(409).json({success:false,code:'SCAN_FIRST',error:'Scan this page first; the score must come from a scan in the last 6 hours.'});
    score=Number(r.score);entryUrl=url;
   }else{
    const urls=(Array.isArray(b.page_urls)?b.page_urls:[]).map(pageUrl).filter(u=>u&&hostOf(u)===host).slice(0,500);
    pages=(await pool.query(`SELECT DISTINCT ON (business_url) business_url,score FROM scan_log WHERE business_url=ANY($1) AND source IN ('bulk','sitemap')
      AND created_at>NOW()-${SCAN_WINDOW} ORDER BY business_url,created_at DESC`,[urls])).rows.filter(r=>Number.isFinite(Number(r.score))&&Number(r.score)>0);
    if(!pages.length)return res.status(409).json({success:false,code:'SCAN_FIRST',error:'Scan the sitemap first; the scores must come from a scan in the last 6 hours.'});
    score=Math.round(pages.reduce((a,r)=>a+Number(r.score),0)/pages.length);entryUrl='https://'+new URL(url).hostname.toLowerCase();
   }
   if(!(score>=70))return res.status(409).json({success:false,code:'BELOW_70',error:'A score of 70 or more is needed for the leaderboard.'});
   const ip=ipHash(req);
   const sent=Number((await pool.query(`SELECT COUNT(*)::int AS n FROM leaderboard WHERE request_ip_hash=$1 AND confirm_sent_at>NOW()-INTERVAL '1 day'`,[ip])).rows[0].n);
   if(sent>=MAX_PER_IP_PER_DAY)return res.status(429).json({success:false,code:'TOO_MANY',error:'Too many requests today. Please try again tomorrow.'});
   const existing=(await pool.query('SELECT admin_verified,is_opted_out FROM leaderboard WHERE url=$1',[entryUrl])).rows[0];
   if(existing&&existing.admin_verified===true&&existing.is_opted_out!==true)return res.json({success:true,already_listed:true});
   const token=crypto.randomBytes(24).toString('base64url');
   const match=emailDomainMatches(email,host);
   const pageScores=JSON.stringify(pages.map(r=>({url:r.business_url,score:Number(r.score)})));
   await pool.query(`INSERT INTO leaderboard (url,company_name,score,country,niche,business_type,page_count,page_scores,scan_source,admin_verified,is_verified,
     contact_email,confirm_token_hash,confirm_expires_at,confirm_sent_at,email_confirmed_at,consent_at,consent_text,email_domain_match,score_source,request_ip_hash,ui_lang)
    VALUES ($1,$2,$3,COALESCE($4,'NL'),$5,$6,$7,$8::jsonb,$9,FALSE,FALSE,$10,$11,NOW()+INTERVAL '${TOKEN_HOURS} hours',NOW(),NULL,NOW(),$15,$12,'scan_log',$13,$14)
    ON CONFLICT (url) DO UPDATE SET company_name=EXCLUDED.company_name,score=EXCLUDED.score,country=EXCLUDED.country,niche=EXCLUDED.niche,
     business_type=EXCLUDED.business_type,page_count=EXCLUDED.page_count,page_scores=EXCLUDED.page_scores,scan_source=EXCLUDED.scan_source,
     contact_email=EXCLUDED.contact_email,confirm_token_hash=EXCLUDED.confirm_token_hash,confirm_expires_at=EXCLUDED.confirm_expires_at,
     confirm_sent_at=NOW(),email_confirmed_at=NULL,consent_at=NOW(),consent_text=EXCLUDED.consent_text,email_domain_match=EXCLUDED.email_domain_match,score_source='scan_log',
     request_ip_hash=EXCLUDED.request_ip_hash,ui_lang=EXCLUDED.ui_lang
    WHERE leaderboard.admin_verified=FALSE OR leaderboard.is_opted_out=TRUE`,
    [entryUrl,name||host,score,String(b.country||'').slice(0,100)||null,String(b.niche||'').slice(0,100)||null,String(b.business_type||'').slice(0,100)||null,
     kind==='site'?pages.length:1,pageScores,kind==='site'?'sitemap':'single',email,hashToken(token),match,ip,lang,CONSENT[lang]]);
   const origin=`${req.protocol}://${req.get('host')}`;
   const link=`${origin}/leaderboard/confirm?t=${encodeURIComponent(token)}&lang=${lang}`;
   const t=T[lang];
   const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111827"><p>${t.hi},</p><p>${t.body(esc(name||host),esc(entryUrl),score)}</p>
<p style="margin:16px 0 6px;color:#374151;font-size:14px"><strong>${esc(t.agree)}</strong></p><blockquote style="margin:0;padding:10px 14px;border-left:3px solid #7e22ce;background:#f5f3ff;color:#374151;font-size:14px">${esc(CONSENT[lang])}</blockquote>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#7e22ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(t.button)}</a></p>
<p style="color:#6b7280;font-size:13px">${esc(t.after)}</p><p style="color:#6b7280;font-size:13px">${esc(NO_PROMO[lang])}</p><p style="color:#9ca3af;font-size:12px">ContentScale · contentscale.site</p></div>`;
   const ok=await sendMail({to:email,subject:t.subject,html}).catch(()=>false);
   if(!ok)return res.status(503).json({success:false,code:'MAIL_FAILED',error:'The confirmation e-mail could not be sent. Please try again later.'});
   res.json({success:true,sent:true});
  }catch(e){console.error('[leaderboard-confirm] request',e.message);res.status(503).json({success:false,error:'Temporarily unavailable'})}
 });
 app.get('/leaderboard/confirm',async(req,res)=>{
  const lang=langOf(req.query.lang);
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex').set('Referrer-Policy','no-referrer');
  try{
   await ready(pool);
   const token=String(req.query.t||'');
   const row=token?(await pool.query(`UPDATE leaderboard SET email_confirmed_at=NOW(),confirm_token_hash=NULL
     WHERE confirm_token_hash=$1 AND confirm_expires_at>NOW() AND email_confirmed_at IS NULL RETURNING id,url,email_domain_match`,[hashToken(token)])).rows[0]:null;
   // ContentScale's own domains, confirmed from their own domain, need no review (as before).
   if(row&&row.email_domain_match&&autoApprove.includes(hostOf(row.url)))await pool.query('UPDATE leaderboard SET admin_verified=TRUE,is_verified=TRUE WHERE id=$1',[row.id]);
   res.type('html').send(page(lang,!!row));
  }catch(e){res.status(503).type('html').send(page(lang,false))}
 });
}
module.exports={registerLeaderboardConfirm,ready,PENDING_SQL,emailDomainMatches,AUTO_APPROVE,CONSENT,NO_PROMO};
