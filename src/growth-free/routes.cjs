'use strict';
// Free public Growth check, separate from the Tracker: own pages, own API, own
// tables, own settings (GROWTH_FREE_* environment variables). It can be mounted
// in the main app or run on its own domain with server.cjs.
const store=require('./store.cjs');
const {runFreeGrowthResearch,validatePublicUrl}=require('./engine.cjs');
const {summarizeFreeGrowth}=require('./summary.cjs');

const int=(v,d)=>{const n=Number.parseInt(v,10);return Number.isFinite(n)&&n>=0?n:d};
// Access keys decide where the free check may be used. GROWTH_FREE_ACCESS_KEYS is
// either "key1,key2" or JSON: [{"key":"...","label":"partner-site","origins":["https://site.com"],
// "daily":20,"per_email":3,"brand":"...","contact_url":"https://...","service_text":"..."}].
// Keys are public identifiers (they appear in the link); limits and allowed sites are the protection.
function parseAccessKeys(raw,defaults){
 const text=String(raw||'').trim();
 if(!text)return [];
 let list;
 if(text.startsWith('[')){
  try{list=JSON.parse(text)}catch{console.warn('[free-growth] GROWTH_FREE_ACCESS_KEYS is not valid JSON; no keys active');return []}
 }else list=text.split(',').map(key=>({key:key.trim()}));
 if(!Array.isArray(list))return [];
 return list.filter(x=>x&&/^[A-Za-z0-9_-]{8,80}$/.test(String(x.key||''))).map(x=>{
  const origins=(Array.isArray(x.origins)?x.origins:x.origins?String(x.origins).split(/[\s,]+/):[]).map(o=>{
   try{const u=new URL(o);return u.protocol==='https:'||u.hostname==='localhost'?u.origin:null}catch{return null}
  }).filter(Boolean);
  return {key:String(x.key),label:clean(x.label,60)||String(x.key).slice(0,6),origins,
   daily:int(x.daily,defaults.daily),perEmail:int(x.per_email,defaults.perEmail),
   brand:x.brand?clean(x.brand,80):defaults.brand,
   contactUrl:/^https:\/\//.test(x.contact_url||'')?x.contact_url:defaults.contactUrl,
   serviceText:x.service_text?clean(x.service_text,600):defaults.serviceText};
 });
}
function freeGrowthConfig(env=process.env){
 const base=freeGrowthDefaults(env);
 return {...base,accessKeys:parseAccessKeys(env.GROWTH_FREE_ACCESS_KEYS,base)};
}
function freeGrowthDefaults(env){
 return {
  enabled:env.GROWTH_FREE_ENABLED!=='false',
  brand:env.GROWTH_FREE_BRAND||'ContentScale',
  perEmail:int(env.GROWTH_FREE_PER_EMAIL_PER_DAY,3),
  perIp:int(env.GROWTH_FREE_PER_IP_PER_DAY,3),
  daily:int(env.GROWTH_FREE_DAILY_LIMIT,50),
  concurrency:Math.max(1,int(env.GROWTH_FREE_CONCURRENCY,2)),
  adminKey:env.GROWTH_FREE_ADMIN_KEY||'',
  ipSalt:env.GROWTH_FREE_IP_SALT||env.SESSION_SECRET||'growth-free-check',
  contactUrl:/^https:\/\//.test(env.GROWTH_FREE_CONTACT_URL||'')?env.GROWTH_FREE_CONTACT_URL:'',
  privacyUrl:/^https?:\/\//.test(env.GROWTH_FREE_PRIVACY_URL||'')?env.GROWTH_FREE_PRIVACY_URL:'',
  hireWebhook:/^https:\/\//.test(env.GROWTH_FREE_HIRE_WEBHOOK_URL||'')?env.GROWTH_FREE_HIRE_WEBHOOK_URL:'',
  serviceText:env.GROWTH_FREE_SERVICE_TEXT||'I write the missing sections in your voice, check every fact with you, publish nothing without your approval and measure the result in Search Console after 28 days.'
 };
}

// Values embedded in <script>: JSON with '<' escaped, so no value can close the script tag.
const js=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const safeToken=x=>/^[A-Za-z0-9_-]{1,60}$/.test(String(x||''))?String(x):'';
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAIL=/^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const clean=(x,n)=>String(x==null?'':x).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);

function page(title,body,cfg){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="${title.startsWith('Free')?'index,follow':'noindex'}"><style>
:root{--bg:#f6f8fc;--card:#fff;--ink:#172337;--muted:#5b6b82;--line:#d9e0eb;--accent:#168347;--accent-ink:#fff;--warn:#fff7ed;--warn-line:#fed7aa}
@media (prefers-color-scheme:dark){:root{--bg:#0f1622;--card:#172131;--ink:#e6edf7;--muted:#9fb0c7;--line:#2a374b;--accent:#2fa866;--accent-ink:#06130b;--warn:#2a2116;--warn-line:#6b4a1f}}
*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);margin:0}
main{max-width:860px;margin:0 auto;padding:24px 16px 60px}h1{font-size:30px;line-height:1.2;margin:.4em 0}h2{font-size:21px;margin:1.6em 0 .5em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}.lead{font-size:18px;color:var(--muted)}
label{display:block;margin:12px 0 4px;font-weight:600}input,textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
button,.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:9px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
button:disabled{opacity:.6;cursor:wait}.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
small,.muted{color:var(--muted)}a{color:var(--accent);overflow-wrap:anywhere}.note{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:12px 14px}
.kicker{text-transform:uppercase;font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.03em;margin:0}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--muted)}ol li,ul li{margin:6px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.grid div{border:1px solid var(--line);border-radius:10px;padding:10px}
.grid strong{display:block;font-size:18px}.error{color:#c2410c}
</style></head><body><main>${body}<p class="muted" style="margin-top:40px">${esc(cfg.brand)} · Free Growth check${cfg.privacyUrl?` · <a href="${esc(cfg.privacyUrl)}">Privacy</a>`:''}</p></main></body></html>`;
}

function formPage(cfg,api,base,accessKey){
 return page('Free Growth check — what is your page missing?',`
<p class="kicker">Free · no account needed</p>
<h1>What does your page miss compared to the pages Google ranks?</h1>
<p class="lead">Enter one page of your website. The check reads your page and the pages that rank for your search, and tells you in plain language whether to change something — or not. You also get the full research data (JSON) to work with yourself.</p>
<form id="f" class="card" novalidate>
 <label for="url">Page address</label><input id="url" name="url" type="url" required placeholder="https://www.yoursite.com/service-page/" maxlength="500">
 <label for="query">Search term (optional)</label><input id="query" name="query" maxlength="120" placeholder="e.g. roof repair lodi nj">
 <small>The words your customers type into Google. Leave empty to let the check derive it from your page.</small>
 <label for="email">Your email</label><input id="email" name="email" type="email" required maxlength="200" placeholder="you@company.com">
 <label class="check"><input type="checkbox" name="consent" required> <span>I agree that my email and the checked page are stored to run this check and show the result. Max ${cfg.perEmail} free checks per day.</span></label>
 <label class="check"><input type="checkbox" name="marketing"> <span>You may email me about this result (optional).</span></label>
 <p><button type="submit">Run the free check</button> <small id="s" role="status"></small></p>
</form>
<div class="card"><h2 style="margin-top:0">What you get</h2><ul>
<li>One clear decision: <strong>leave it</strong>, <strong>add a missing answer</strong>, <strong>make a separate page</strong>, or <strong>not enough evidence</strong>.</li>
<li>Where to add it on your page, with the ranking pages that support it.</li>
<li>The full research as JSON, to process yourself or with your own tools.</li></ul>
<p class="muted">No ranking promises. Nothing is changed on your website. Takes about one minute.</p></div>
<script>
document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,s=document.getElementById('s'),b=f.querySelector('button');
if(!f.consent.checked){s.textContent='Please accept the storage notice.';return}
b.disabled=true;s.textContent='Starting…';
try{var r=await fetch(${js(api)}+'/checks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:${js(accessKey)},url:f.url.value,query:f.query.value,email:f.email.value,consent:true,marketing_consent:f.marketing.checked})});
var d=await r.json();if(!d.success)throw Error(d.error||'Could not start the check');location.href=d.result_url}
catch(err){s.textContent=err.message;s.className='error';b.disabled=false}});
</script>`,cfg);
}

function resultPage(cfg,api,base,id,key){
 // Brand, contact link and service text come from the access key of the check (API: offer).
 const q=`?k=${encodeURIComponent(key)}`;
 return page('Your Growth check result',`
<p><a id="back" href="${esc(base)}">← New check</a></p>
<div id="out" class="card"><p class="kicker">Working</p><h1>Checking your page…</h1><p class="muted">Reading your page and the pages that rank for your search. This usually takes under a minute. You can keep this page open; the link also works later.</p></div>
<script>
var API=${js(api+'/checks/'+id)},Q=${js(q)},CONTACT=${js(cfg.contactUrl)},SERVICE=${js(cfg.serviceText)},BRAND=${js(cfg.brand)};
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function render(d){var s=d.summary,o=document.getElementById('out');if(d.new_check_url)document.getElementById('back').href=d.new_check_url;if(d.offer){BRAND=d.offer.brand||BRAND;SERVICE=d.offer.service_text||SERVICE;CONTACT=d.offer.contact_url||''}
 if(d.status==='FAILED'){o.innerHTML='<p class="kicker">Not finished</p><h1>The check could not finish</h1><p>'+esc(d.error_text)+'</p><p><a class="btn" href="'+esc(d.new_check_url||${js(base)})+'">Try again</a></p>';return}
 var h='<p class="kicker">Result'+(d.cached?' · from a check of this page in the last 24 hours':'')+'</p><h1>'+esc(s.headline)+'</h1><p class="lead">'+esc(s.explanation)+'</p>';
 h+='<p class="muted">Page: <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.url)+'</a></p>';
 h+='<h2>What to do</h2><ol>'+s.steps.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ol>';
 if(s.tasks.length){h+='<h2>Why — what the ranking pages explain</h2>'+s.tasks.map(function(t){return '<div class="card"><strong>'+esc(t.title)+'</strong> <small>'+esc(t.status)+'</small>'+t.evidence.map(function(e){return '<blockquote>'+(e.heading?'<strong>'+esc(e.heading)+'</strong><br>':'')+esc(e.excerpt)+'<br><small><a href="'+esc(e.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(e.site)+'</a></small></blockquote>'}).join('')+'</div>'}).join('')}
 var c=s.checked;h+='<h2>What was checked</h2><div class="grid"><div><small>Search term</small><strong>'+esc(c.search_term||'—')+'</strong><small>'+(c.search_term_source==='YOU_ENTERED_IT'?'entered by you':'derived from your page')+'</small></div><div><small>Google shows mostly</small><strong>'+esc(c.what_google_shows||'unclear')+'</strong></div><div><small>Ranking results considered</small><strong>'+esc(c.ranking_results_considered)+'</strong></div><div><small>Ranking pages read in full</small><strong>'+esc(c.ranking_pages_read)+'</strong></div></div>';
 h+='<h2>Limits of this free check</h2><ul>'+s.limitations.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><p class="note">'+esc(s.promises)+'</p>';
 h+='<h2>Do it yourself</h2><p>Download the complete research data and process it yourself or with your own tools.</p><p><a class="btn ghost" href="'+esc(API+'/report.json'+Q)+'" download>Download JSON</a></p>';
 h+='<div class="card" id="hire"><p class="kicker">Paid · done for you</p><h2 style="margin-top:4px">Want this done for you?</h2><p>'+esc(SERVICE)+'</p>'+(CONTACT?'<p><a class="btn" href="'+esc(CONTACT)+'" target="_blank" rel="noopener noreferrer">Book a call</a></p><p class="muted">Or leave your details:</p>':'')+
 '<form id="hf"><label>Name<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" required maxlength="200"></label><label>Company / website (optional)<input name="company" maxlength="200"></label><label>Phone (optional)<input name="phone" maxlength="40"></label><label>What would you like help with? (optional)<textarea name="message" rows="3" maxlength="2000"></textarea></label><label class="check"><input type="checkbox" name="consent" required> <span>Contact me about this request.</span></label><p><button type="submit">Ask '+esc(BRAND)+' to do it</button> <small role="status" id="hs"></small></p></form></div>';
 o.innerHTML=h;
 document.getElementById('hf').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('hs'),b=f.querySelector('button');if(!f.consent.checked){st.textContent='Please tick the contact box.';return}b.disabled=true;
  try{var r=await fetch(API+'/hire'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,email:f.email.value,company:f.company.value,phone:f.phone.value,message:f.message.value,consent:true})});var x=await r.json();if(!x.success)throw Error(x.error||'Not sent');f.outerHTML='<p><strong>Thank you — your request was received.</strong> You will get a reply by email.</p>'}catch(err){st.textContent=err.message;st.className='error';b.disabled=false}});
}
async function poll(n){try{var r=await fetch(API+Q,{cache:'no-store'});var d=await r.json();if(!d.success)throw Error(d.error||'Not found');
 if(d.status==='DONE'||d.status==='FAILED')return render(d);}catch(e){document.getElementById('out').innerHTML='<h1>Result not available</h1><p>'+esc(e.message)+'</p>';return}
 setTimeout(function(){poll(n+1)},n<20?3000:8000)}
poll(0);
</script>`,cfg);
}

function notActivated(cfg){
 return page('Free Growth check',`<h1>This free check is not activated here</h1><p class="lead">The link is missing a valid access key. Ask the website that sent you here for the correct link.</p>`,cfg);
}
function findKey(config,value){
 const v=String(value||'');
 return (config.accessKeys||[]).find(k=>store.sameKey(k.key,v))||null;
}
const offerOf=k=>({brand:k.brand,contact_url:k.contactUrl||null,service_text:k.serviceText});

const FAIL_TEXT={
 INTERRUPTED:'The check was interrupted. Please run it again.',
 AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE:'The research service is temporarily unavailable. Please try again later.',
 PAGE_IDENTITY_CHANGED:'The page changed while it was being checked. Please try again.'
};

function registerFreeGrowth(app,pool,{config=freeGrowthConfig(),engine=runFreeGrowthResearch,engineDeps={},basePath='/free-growth',apiPath='/api/free-growth',fetchImpl=global.fetch,storage=store}={}){
 if(!config.enabled)return null;
 const queue=[];let running=0;
 const jobs=new Set();
 function pump(){
  while(running<config.concurrency&&queue.length){
   const job=queue.shift();running++;
   const p=(async()=>{
    try{
     await storage.setStatus(pool,job.id,{status:'RUNNING'});
     const out=await engine({url:job.url,query:job.query},engineDeps);
     if(out.statusCode!==200||!out.report||out.report.success===false){
      await storage.setStatus(pool,job.id,{status:'FAILED',error_code:String(out.report&&out.report.code||'RESEARCH_FAILED').slice(0,80)});
     }else{
      const summary=summarizeFreeGrowth(out.report,{url:job.url,query:job.query});
      await storage.setStatus(pool,job.id,{status:'DONE',decision:summary.decision,summary,report:out.report});
     }
    }catch(e){
     console.warn('[free-growth] check failed',String(e&&e.code||e&&e.message||'unknown').slice(0,80));
     await storage.setStatus(pool,job.id,{status:'FAILED',error_code:'RESEARCH_FAILED'}).catch(()=>{});
    }finally{running--;pump()}
   })();
   jobs.add(p);p.finally(()=>jobs.delete(p));
  }
 }
 const resultUrl=row=>`${basePath}/r/${encodeURIComponent(row.public_id)}?k=${encodeURIComponent(row.access_key)}`;

 app.get(basePath,(req,res)=>{
  const entry=findKey(config,req.query&&req.query.key);
  if(!entry)return res.status(403).set('Cache-Control','no-store').set('Content-Security-Policy',"frame-ancestors 'none'").type('html').send(notActivated(config));
  // Where it may be embedded is decided by the key: only its listed sites (or anywhere if none are listed).
  res.set('Content-Security-Policy','frame-ancestors '+(entry.origins.length?"'self' "+entry.origins.join(' '):'*'));
  res.set('Cache-Control','private, no-store').type('html').send(formPage({...config,...entry},apiPath,basePath,entry.key));
 });
 app.get(basePath+'/r/:id',(req,res)=>res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').type('html')
  .set('Content-Security-Policy','frame-ancestors '+(()=>{const o=[...new Set((config.accessKeys||[]).flatMap(k=>k.origins))];return (config.accessKeys||[]).some(k=>!k.origins.length)?'*':"'self' "+o.join(' ')})())
  .send(resultPage(config,apiPath,basePath,safeToken(req.params.id),safeToken(req.query.k))));

 app.post(apiPath+'/checks',async(req,res)=>{
  try{
   const b=req.body||{};
   const entry=findKey(config,b.key);
   if(!entry)return res.status(403).json({success:false,error:'This free check is not activated here'});
   const origin=req.get&&req.get('origin');
   if(origin&&entry.origins.length&&origin!==`${req.protocol}://${req.get('host')}`&&!entry.origins.includes(origin))
    return res.status(403).json({success:false,error:'This free check is not activated on this website'});
   const email=clean(b.email,200).toLowerCase();
   if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
   if(b.consent!==true)return res.status(400).json({success:false,error:'Please accept the storage notice'});
   const v=validatePublicUrl(b.url);if(v.error)return res.status(400).json({success:false,error:v.error});
   const query=clean(b.query,120);
   await storage.ensureTables(pool);
   const ipHash=store.hashIp(req.ip,config.ipSalt);
   const cached=await storage.recentResult(pool,{url:v.url,query});
   if(!cached){
    const u=await storage.usage(pool,{email,ipHash,accessLabel:entry.label});
    if(u.by_email>=entry.perEmail||u.by_ip>=config.perIp)
     return res.status(429).json({success:false,error:`The free limit is ${entry.perEmail} checks per day. Try again tomorrow, or ask for the paid service.`});
    if(u.by_key>=entry.daily||u.total>=config.daily)return res.status(429).json({success:false,error:'Today\'s free checks are used up. Please try again tomorrow.'});
   }
   const row=await storage.createCheck(pool,{email,ipHash,url:v.url,host:v.host,query,marketingConsent:b.marketing_consent===true,cached,accessLabel:entry.label});
   if(!cached){queue.push({id:row.id,url:v.url,query});pump()}
   res.status(202).json({success:true,id:row.public_id,key:row.access_key,status:row.status,result_url:resultUrl(row)});
  }catch(e){console.error('[free-growth] start failed',e.message);res.status(503).json({success:false,error:'The free check is temporarily unavailable'})}
 });

 async function load(req,res){
  try{
   await storage.ensureTables(pool);
   const row=await storage.getCheck(pool,req.params.id,req.query.k);
   if(!row){res.status(404).json({success:false,error:'Result not found'});return null}
   return row;
  }catch(e){console.error('[free-growth] load failed',e.message);res.status(503).json({success:false,error:'Temporarily unavailable'});return null}
 }
 app.get(apiPath+'/checks/:id',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  res.set('Cache-Control','no-store').json({success:true,status:row.status,url:row.url,query:row.query,decision:row.decision,
   summary:row.summary||null,cached:!!row.cached_from,error_code:row.error_code||null,
   offer:offerOf((config.accessKeys||[]).find(k=>k.label===row.access_label)||config),
   new_check_url:(()=>{const k=(config.accessKeys||[]).find(x=>x.label===row.access_label);return k?`${basePath}?key=${encodeURIComponent(k.key)}`:null})(),
   error_text:row.status==='FAILED'?(FAIL_TEXT[row.error_code]||'The check could not finish. Please try again later.'):null});
 });
 app.get(apiPath+'/checks/:id/report.json',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  res.set('Cache-Control','no-store').set('Content-Disposition',`attachment; filename="growth-check-${row.public_id}.json"`)
   .json({generated_by:config.brand+' free Growth check',url:row.url,search_term:row.query||null,checked_at:row.finished_at,
    disclaimer:'Research data only. No ranking or traffic increase is promised. Google Search Console data was not used.',
    summary:row.summary,report:row.report});
 });
 app.post(apiPath+'/checks/:id/hire',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  try{
   const b=req.body||{};
   const name=clean(b.name,120),email=clean(b.email,200).toLowerCase();
   if(!name)return res.status(400).json({success:false,error:'Enter your name'});
   if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
   if(b.consent!==true)return res.status(400).json({success:false,error:'Please tick the contact box'});
   const saved=await storage.createHireRequest(pool,{checkId:row.id,name,email,company:clean(b.company,200),phone:clean(b.phone,40),message:clean(b.message,2000)});
   if(config.hireWebhook&&typeof fetchImpl==='function'){
    fetchImpl(config.hireWebhook,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
     body:JSON.stringify({text:`New Growth hire request from ${name} <${email}> for ${row.url} (${row.decision||row.status}) via ${row.access_label||'unknown key'}`,access_label:row.access_label||null,
      name,email,company:clean(b.company,200),url:row.url,search_term:row.query||null,decision:row.decision})})
     .catch(e=>console.warn('[free-growth] hire webhook failed',String(e&&e.code||'unknown')));
   }
   res.json({success:true,id:saved.id});
  }catch(e){console.error('[free-growth] hire failed',e.message);res.status(503).json({success:false,error:'Could not send your request. Please try again.'})}
 });

 // Admin: disabled unless GROWTH_FREE_ADMIN_KEY is set.
 const admin=(req,res)=>{
  const key=req.get?.('x-admin-key')||req.headers?.['x-admin-key']||req.query?.key;
  if(!config.adminKey||!store.sameKey(config.adminKey,key)){res.status(404).json({success:false,error:'Not found'});return false}
  return true;
 };
 app.get(basePath+'/admin',(req,res)=>res.set('Cache-Control','no-store').type('html').send(page('Growth leads — admin',`
<h1>Free Growth check — leads</h1>
<form id="k" class="card"><label>Admin key<input id="key" type="password" autocomplete="off"></label><p><button>Show leads</button> <a id="csv" class="btn ghost" href="#">Download CSV</a></p></form>
<div id="out"></div>
<script>
var API=${js(apiPath)};function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function key(){return document.getElementById('key').value}
document.getElementById('csv').addEventListener('click',async function(e){e.preventDefault();var r=await fetch(API+'/admin/leads.csv',{headers:{'x-admin-key':key()}});if(!r.ok){alert('Wrong key');return}var b=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='growth-free-leads.csv';a.click()});
document.getElementById('k').addEventListener('submit',async function(e){e.preventDefault();var o=document.getElementById('out');var r=await fetch(API+'/admin/leads',{headers:{'x-admin-key':key()}});var d=await r.json();if(!d.success){o.textContent='Wrong key or unavailable';return}
o.innerHTML='<h2>Hire requests ('+d.hires.length+')</h2>'+d.hires.map(function(h){return '<div class="card"><strong>'+esc(h.name)+'</strong> &lt;'+esc(h.email)+'&gt; '+esc(h.company||'')+' '+esc(h.phone||'')+'<br><small>'+esc(h.created_at)+' · '+esc(h.url)+' · '+esc(h.decision||'')+'</small><p>'+esc(h.message||'')+'</p></div>'}).join('')+
'<h2>Free checks ('+d.checks.length+')</h2>'+d.checks.map(function(c){return '<div class="card"><strong>'+esc(c.email)+'</strong>'+(c.marketing_consent?' · may be emailed':'')+'<br><small>'+esc(c.access_label||'')+' · '+esc(c.created_at)+' · '+esc(c.status)+' · '+esc(c.decision||c.error_code||'')+(c.cached?' · cached':'')+'</small><br><a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer">'+esc(c.url)+'</a> '+esc(c.query||'')+'</div>'}).join('')});
</script>`,config)));
 app.get(apiPath+'/admin/leads',async(req,res)=>{
  if(!admin(req,res))return;
  try{await storage.ensureTables(pool);res.set('Cache-Control','no-store').json({success:true,...await storage.listLeads(pool)})}
  catch(e){res.status(503).json({success:false,error:e.message})}
 });
 app.get(apiPath+'/admin/leads.csv',async(req,res)=>{
  if(!admin(req,res))return;
  try{
   await storage.ensureTables(pool);const {checks,hires}=await storage.listLeads(pool,{limit:5000});
   const cell=x=>{const s=String(x==null?'':x instanceof Date?x.toISOString():x);return /^[=+\-@]/.test(s)?`"'${s.replace(/"/g,'""')}"`:`"${s.replace(/"/g,'""')}"`};
   const lines=[['type','created_at','email','name','company','phone','url','search_term','decision','status','message','marketing_consent'].join(','),
    ...hires.map(h=>['hire',h.created_at,h.email,h.name,h.company,h.phone,h.url,h.query,h.decision,h.status,h.message,''].map(cell).join(',')),
    ...checks.map(c=>['check',c.created_at,c.email,'','','',c.url,c.query,c.decision,c.status,'',c.marketing_consent].map(cell).join(','))];
   res.set('Cache-Control','no-store').set('Content-Disposition','attachment; filename="growth-free-leads.csv"').type('text/csv').send(lines.join('\n'));
  }catch(e){res.status(503).json({success:false,error:e.message})}
 });
 if(typeof app.post==='function')app.post(apiPath+'/admin/forget',async(req,res)=>{
  if(!admin(req,res))return;
  const email=clean(req.body&&req.body.email,200).toLowerCase();
  if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
  try{await storage.ensureTables(pool);res.json({success:true,deleted:await storage.forgetEmail(pool,email)})}
  catch(e){res.status(503).json({success:false,error:e.message})}
 });
 return {config,idle:()=>Promise.all([...jobs]),queueLength:()=>queue.length};
}

module.exports={registerFreeGrowth,freeGrowthConfig,parseAccessKeys};
