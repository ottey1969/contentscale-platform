'use strict';
// Free tools (owner 2026-11-28): a weekly limit per person, so the same computer cannot ask again the same week
// (fraud prevention). One person = any of: the same e-mail address (normalised, so name+1@ or n.a.m.e@gmail.com do not
// count as new people), the same browser (a signed, HttpOnly first-party cookie used only for this limit), or the same
// IP address. Only hashes are stored. Results reused from the cache and failed runs do not count. The owner is exempt.
const crypto=require('node:crypto');

const TOOLS=new Set(['FREE_GROWTH','FREE_PREWRITE']);
const COOKIE='cs_free_device';
const WEEK_MS=7*24*3600*1000;
const MAX_CORRECTIONS=3;
const int=(v,d)=>{const n=Number(v);return String(v??'').trim()!==''&&Number.isSafeInteger(n)&&n>=0?n:d};
// 0 switches the weekly limit off for that tool.
function perWeek(tool,env=process.env){
 return int(tool==='FREE_PREWRITE'?env.FREE_PREWRITE_PER_WEEK:env.GROWTH_FREE_PER_WEEK,1);
}
const secretOf=env=>String(env.FREE_LIMIT_SECRET||env.GROWTH_FREE_IP_SALT||env.SESSION_SECRET||'contentscale-free-limit');
const hmac=(secret,kind,value)=>crypto.createHmac('sha256',secret).update(kind+'|'+value).digest('hex').slice(0,40);
function normalizeEmail(raw){
 const email=String(raw||'').trim().toLowerCase();
 const at=email.lastIndexOf('@');
 if(at<1)return '';
 let local=email.slice(0,at),domain=email.slice(at+1);
 local=local.replace(/\+.*$/,'');
 if(domain==='googlemail.com')domain='gmail.com';
 if(domain==='gmail.com')local=local.replace(/\./g,'');
 return local&&domain?local+'@'+domain:'';
}
const readCookie=(req,name)=>{for(const part of String(req.headers?.cookie||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim()}return ''};
// The browser id: random, signed so it cannot be forged, shared by app., nl. and es. on contentscale.site.
function deviceId(req,res,env=process.env){
 const secret=secretOf(env);
 const [id,mac]=readCookie(req,COOKIE).split('.');
 if(/^[a-f0-9]{32}$/.test(id||'')&&mac&&mac===hmac(secret,'device',id))return id;
 const fresh=crypto.randomBytes(16).toString('hex');
 const host=String(req.hostname||req.get?.('host')||'').toLowerCase().replace(/:\d+$/,'');
 const domain=/(^|\.)contentscale\.site$/.test(host)?'; Domain=.contentscale.site':'';
 const cookie=`${COOKIE}=${fresh}.${hmac(secret,'device',fresh)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400*86400}${domain}${req.secure?'; Secure':''}`;
 if(res&&typeof res.append==='function')res.append('Set-Cookie',cookie);
 else if(res&&typeof res.setHeader==='function'){const prev=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[].concat(prev||[],cookie))}
 return fresh;
}
function identity(req,res,{email}={},env=process.env){
 const secret=secretOf(env);
 const normal=normalizeEmail(email);
 const ip=String(req.ip||req.socket?.remoteAddress||'');
 return {email:normal?hmac(secret,'email',normal):null,device:hmac(secret,'device-id',deviceId(req,res,env)),ip:ip?hmac(secret,'ip',ip):null};
}
const ready=new WeakMap();
async function ensure(pool){
 if(!ready.has(pool))ready.set(pool,(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS free_tool_usage(
   id BIGSERIAL PRIMARY KEY, tool TEXT NOT NULL, email_hash TEXT, device_hash TEXT, ip_hash TEXT,
   counted BOOLEAN NOT NULL DEFAULT TRUE, ref TEXT, root_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_free_tool_usage_recent ON free_tool_usage(tool,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_free_tool_usage_ref ON free_tool_usage(tool,ref)');
 })().catch(e=>{ready.delete(pool);throw e}));
 return ready.get(pool);
}
// Reserve one free run. A correction of the person's own earlier run (rootRef) does not count, up to MAX_CORRECTIONS.
async function reserve(pool,{tool,id,limit,rootRef=null}){
 if(!TOOLS.has(tool))throw Error('Unknown free tool');
 await ensure(pool);
 const client=typeof pool.connect==='function'?await pool.connect():pool;
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('free-tool-usage|'||$1))",[tool]);
  if(rootRef){
   const root=(await client.query('SELECT id,root_id FROM free_tool_usage WHERE tool=$1 AND ref=$2 ORDER BY id LIMIT 1',[tool,rootRef])).rows[0];
   if(root){
    const rootId=root.root_id||root.id;
    const done=Number((await client.query('SELECT COUNT(*)::int AS n FROM free_tool_usage WHERE tool=$1 AND root_id=$2',[tool,rootId])).rows[0].n);
    if(done<MAX_CORRECTIONS){
     const row=(await client.query(`INSERT INTO free_tool_usage(tool,email_hash,device_hash,ip_hash,counted,root_id)
      VALUES($1,$2,$3,$4,FALSE,$5) RETURNING id`,[tool,id.email,id.device,id.ip,rootId])).rows[0];
     await client.query('COMMIT');
     return {ok:true,usage_id:row.id,correction:true};
    }
   }
  }
  if(limit>0){
   const rows=(await client.query(`SELECT created_at FROM free_tool_usage WHERE tool=$1 AND counted AND created_at>NOW()-INTERVAL '7 days'
     AND (email_hash=$2 OR device_hash=$3 OR ip_hash=$4) ORDER BY created_at`,[tool,id.email,id.device,id.ip])).rows;
   if(rows.length>=limit){
    await client.query('ROLLBACK');
    const retry=new Date(new Date(rows[rows.length-limit].created_at).getTime()+WEEK_MS);
    return {ok:false,limit,retry_at:retry.toISOString()};
   }
  }
  const row=(await client.query(`INSERT INTO free_tool_usage(tool,email_hash,device_hash,ip_hash,counted)
   VALUES($1,$2,$3,$4,$5) RETURNING id`,[tool,id.email,id.device,id.ip,limit>0])).rows[0];
  await client.query('COMMIT');
  return {ok:true,usage_id:row.id,correction:false};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
 finally{if(client!==pool)client.release()}
}
// Look without reserving: is this person (browser or connection; the e-mail is not known yet) still free this week?
async function peek(pool,{tool,id,limit}){
 if(!(limit>0))return {ok:true};
 await ensure(pool);
 const rows=(await pool.query(`SELECT created_at FROM free_tool_usage WHERE tool=$1 AND counted AND created_at>NOW()-INTERVAL '7 days'
   AND (email_hash=$2 OR device_hash=$3 OR ip_hash=$4) ORDER BY created_at`,[tool,id.email,id.device,id.ip])).rows;
 if(rows.length<limit)return {ok:true};
 return {ok:false,limit,retry_at:new Date(new Date(rows[rows.length-limit].created_at).getTime()+WEEK_MS).toISOString()};
}
async function attach(pool,usageId,ref){
 if(usageId)await pool.query('UPDATE free_tool_usage SET ref=$2 WHERE id=$1',[usageId,String(ref)]);
}
// A run that failed on our side is given back.
async function refund(pool,usageId){
 if(usageId)await pool.query('UPDATE free_tool_usage SET counted=FALSE WHERE id=$1',[usageId]);
}
const retryDay=(iso,lang)=>{try{return new Date(iso).toLocaleDateString({nl:'nl-NL',es:'es-ES'}[lang]||'en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}catch{return String(iso).slice(0,10)}};
// The visitor-facing sentence, in the page language (owner 2026-11-28: "wacht tot volgende week of laat Ottmar het voor je
// doen").
function limitMessage(tool,limit,retryAt,lang='en',{who='Ottmar',contactUrl=''}={}){
 const day=retryDay(retryAt,lang),n=Number(limit)||1,l=['nl','es'].includes(lang)?lang:'en';
 const name={FREE_GROWTH:{en:'Growth check',nl:'Growth-check',es:'análisis de Growth'},FREE_PREWRITE:{en:'Pre-Write Brief',nl:'Pre-Write Brief',es:'brief de Pre-Write'}}[tool][l];
 const plural={FREE_GROWTH:{en:'Growth checks',nl:'Growth-checks',es:'análisis de Growth'},FREE_PREWRITE:{en:'Pre-Write Briefs',nl:'Pre-Write Briefs',es:'briefs de Pre-Write'}}[tool][l];
 const link=/^https:\/\//.test(contactUrl)?': '+contactUrl:'.';
 const used={en:n===1?`You have used your free ${name} for this week.`:`You have used your ${n} free ${plural} for this week.`,
  nl:n===1?`Je hebt je gratis ${name} voor deze week gebruikt.`:`Je hebt je ${n} gratis ${plural} voor deze week gebruikt.`,
  es:n===1?`Ya usaste tu ${name} gratuito de esta semana.`:`Ya usaste tus ${n} ${plural} gratuitos de esta semana.`}[l];
 const next={en:`Wait until ${day} for a new one, or let ${who} do it for you${link}`,
  nl:`Wacht tot ${day} voor een nieuwe, of laat ${who} het voor je doen${link}`,
  es:`Espera hasta el ${day} para uno nuevo, o deja que ${who} lo haga por ti${link}`}[l];
 return used+' '+next;
}
module.exports={perWeek,normalizeEmail,deviceId,identity,reserve,peek,attach,refund,limitMessage,COOKIE,MAX_CORRECTIONS};
