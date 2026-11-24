'use strict';
// app.contentscale.site/gsc (owner 2026-11-20): the owner uploads the Search Console export of any site, adds pages by
// hand, and sends the company a report through a secret link. The company opens it without a login. The report page is
// static HTML (no scripts), not indexed, and every value is escaped. Free Growth is linked per page: always for the owner;
// for a recipient only when the owner attached an invitation to the report.
const crypto=require('node:crypto');
const {readUploads,analyze,applyUrlStatus,applyAudit,applyPositions}=require('./analysis.cjs');
const audit=require('./site-audit.cjs');
const {suggestTerms}=require('./suggest-terms.cjs');
const {readMarket}=require('../rank-free/engine.cjs');
const {fetchPublicGrowthHtml}=require('../growth-public-html-reader.cjs');
const {createFreeGrowthFirecrawlReader}=require('../growth-free-firecrawl-reader.cjs');
const {checkUrlStatuses}=require('./url-status.cjs');
const reportStore=require('./store.cjs');
const growthStore=require('../growth-free/store.cjs');
const {T,LANGS}=require('./texts.cjs');

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=encodeURIComponent;

function registerGscReport(app,pool,{config=require('../growth-free/routes.cjs').freeGrowthConfig(),storage=null,basePath='/gsc',apiPath='/api/gsc',growthPath='/free-growth',checkUrls=urls=>checkUrlStatuses(urls),siteReader=fetchPublicGrowthHtml,fetchImpl=(...a)=>global.fetch(...a),
 serperKey=process.env.SERPER_API_KEY||'',pagespeedKey=process.env.PAGESPEED_API_KEY||'',firecrawlKey=process.env.FIRECRAWL_API_KEY||'',
 makeRenderer=null}={}){
 // Firecrawl (paid per page, runs JavaScript): only when the owner ticks it, through the same guarded reader Free Growth uses.
 const renderer=makeRenderer||(({max})=>createFreeGrowthFirecrawlReader({env:{FREE_GROWTH_FIRECRAWL_ENABLED:'true',FIRECRAWL_API_KEY:firecrawlKey},original:siteReader,maxPages:max,hardCap:50}).reader);
 // The Free Growth invitation for a recipient lives in the Free Growth tables; they are made on first use.
 const st=storage||{...reportStore,createInvite:async(p,o)=>{await growthStore.ensureTables(p);return growthStore.createInvite(p,o)},
  revokeInviteToken:async(p,t)=>{const i=await growthStore.getInvite(p,t);return i?growthStore.revokeInvite(p,i.id):null}};
 // The owner is the Free Growth owner: the same key, the same signed session cookie (one login for both).
 const SESSION='gf_admin';
 const sign=exp=>crypto.createHmac('sha256',config.adminKey).update('growth-free-admin|'+exp).digest('base64url');
 const same=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
 const cookie=req=>{for(const part of String(req.headers&&req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===SESSION)return part.slice(i+1).trim()}return ''};
 const sessionValid=req=>{if(!config.adminKey)return false;const [exp,mac]=cookie(req).split('.');return Number(exp)>Date.now()&&same(sign(exp),mac)};
 const isOwner=req=>!!config.adminKey&&(same(config.adminKey,req.get&&req.get('x-admin-key'))||sessionValid(req));
 // Writes with the cookie need a header another website cannot send (CSRF).
 const ownerWrite=req=>!!config.adminKey&&(same(config.adminKey,req.get&&req.get('x-admin-key'))||(sessionValid(req)&&req.get&&req.get('x-requested-with')==='gsc-report'));
 let ready=null;const ensure=()=>ready||(ready=Promise.resolve(st.ensureTables(pool)).catch(e=>{ready=null;throw e}));

 app.get(basePath,(req,res)=>{
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').set('Content-Security-Policy',"frame-ancestors 'none'");
  res.type('html').send(isOwner(req)?ownerPage(config,apiPath,basePath):loginPage());
 });
 app.post(apiPath+'/reports',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  try{
   const b=req.body||{};
   const lang=LANGS.includes(b.lang)?b.lang:'en';
   const days=Math.min(365,Math.max(1,parseInt(b.expires_days,10)||90));
   const files=(Array.isArray(b.files)?b.files:[]).filter(f=>f&&f.content_base64);
   const manual=Array.isArray(b.manual_pages)?b.manual_pages:[];
   const uploads=readUploads(files);
   // Without Search Console: a domain, read in public (robots.txt, sitemap, pages), Google's field data for speed, and
   // positions in Google for the owner's own search terms when asked (paid per search, so only then).
   const domain=String(b.site_audit&&b.site_audit.domain||'').trim();
   let site=null,crawlP=null,speedP=null,positionsP=null;
   if(domain){try{site=audit.siteOrigin(domain)}catch{return res.status(400).json({success:false,error:'Enter a public https domain, such as example.com.'})}}
   const pos=b.positions||{};
   if(pos.enabled===true){
    const market=readMarket(pos.country,pos.language);if(market.error)return res.status(400).json({success:false,error:market.error});
    const host=site?site.host:(String(b.site||'').replace(/^https?:\/\//i,'').split('/')[0]||'').toLowerCase();
    if(!host)return res.status(400).json({success:false,error:'Positions need a domain.'});
    const keywords=(Array.isArray(pos.keywords)?pos.keywords:String(pos.keywords||'').split('\n')).map(x=>String(x).trim()).filter(Boolean);
    if(!keywords.length)return res.status(400).json({success:false,error:'Add at least one search term for the positions.'});
    positionsP=audit.checkPositions({keywords,host,gl:market.gl,hl:market.hl,key:serperKey,fetchImpl}).then(r=>({...r,market:{gl:market.gl,hl:market.hl,country_name:market.country_name,language_name:market.language_name}}));
   }
   const fc=(b.site_audit&&b.site_audit.firecrawl)||{},fcWanted=!!site&&fc.enabled===true,fcMax=Math.min(50,Math.max(1,parseInt(b.site_audit&&b.site_audit.max,10)||150));
   const fcRender=fcWanted&&firecrawlKey?renderer({max:fcMax}):null;
   // The owner chooses how many pages are read (testing: a few; at most 150).
   const auditMax=Math.min(150,Math.max(1,parseInt(b.site_audit&&b.site_audit.max,10)||150));
   if(site){crawlP=audit.crawlSite({domain,fetchImpl:siteReader,max:auditMax,...(fcRender?{renderImpl:fcRender,renderMax:fcMax}:{})});speedP=audit.fieldData({origin:site.origin,key:pagespeedKey,fetchImpl})}
   const crawl=crawlP?await crawlP:null;
   const report=analyze({uploads,manualPages:[...manual,...(crawl?crawl.pages.map(url=>({url,source:'CRAWL'})):[])],site:String(b.site||'')||(site?site.host:'')});
   if(!report.pages.length&&!report.queries.total&&!report.countries.length)
    return res.status(400).json({success:false,error:crawl?'No page of this site could be read (no sitemap, and the home page did not answer).':'Upload a Search Console export or add at least one page, or enter a domain to read in public.',files:report.files});
   // Live status per URL (301/404), unless the owner turned it off. A crawled page already has its status. A failed check never blocks the report.
   let statuses=crawl?new Map(crawl.statuses):new Map();
   const rest=report.pages.map(p=>p.url).filter(u=>!statuses.has(u)&&!(crawl&&crawl.statuses.has(u)));
   if(b.check_urls!==false&&rest.length){try{for(const [u,v] of await checkUrls(rest))statuses.set(u,v)}catch(e){console.error('[gsc-report] url check failed',e.message)}}
   if(statuses.size)applyUrlStatus(report,statuses);
   if(crawl){applyAudit(report,crawl);if(fcWanted&&!fcRender)report.crawl.render={status:'NOT_CONFIGURED'}}
   applyPositions(report,positionsP?await positionsP:null);
   if(speedP)report.speed=await speedP;
   await ensure();
   let invite=null;
   const g=b.recipient_growth||{};
   if(g.enabled===true){const checks=Math.min(20,Math.max(1,parseInt(g.checks,10)||3));
    invite=(await st.createInvite(pool,{label:('GSC report: '+String(b.title||report.site)).slice(0,120),emailLock:null,maxChecks:checks,days})).token}
   const row=await st.createReport(pool,{title:String(b.title||report.site||'Search Console report').slice(0,160),site:report.site,lang,report,days,growthInvite:invite});
   res.json({success:true,id:row.id,url:basePath+'/r/'+row.token,expires_at:row.expires_at,files:report.files,pages:report.pages.length});
  }catch(e){console.error('[gsc-report] create failed',e.message);res.status(500).json({success:false,error:'The report could not be made. Nothing was saved.'})}
 });
 // Search terms for the position check, from a real source; the owner reviews them before anything is searched.
 app.post(apiPath+'/suggest-terms',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  const b=req.body||{},files=(Array.isArray(b.files)?b.files:[]).filter(f=>f&&f.content_base64),domain=String(b.domain||'').trim();
  if(!files.length&&!domain)return res.status(400).json({success:false,error:'Enter a domain or add a Search Console export first.'});
  let language=String(b.language||'').trim().toLowerCase();if(!language&&b.country){const m=readMarket(b.country);if(!m.error)language=m.hl}
  try{const r=await suggestTerms({files,domain,language,fetchImpl:siteReader});res.json({success:true,...r})}
  catch(e){if(e&&(e.code==='INVALID_URL'||e.code==='PUBLIC_HTTPS_URL_REQUIRED'))return res.status(400).json({success:false,error:'Enter a public https domain, such as example.com.'});
   console.error('[gsc-report] suggest failed',e.message);res.status(500).json({success:false,error:'No search terms could be suggested.'})}
 });
 app.get(apiPath+'/reports',async(req,res)=>{
  if(!isOwner(req))return res.status(404).json({success:false,error:'Not found'});
  try{await ensure();const rows=await st.listReports(pool,{limit:200});
   res.set('Cache-Control','no-store').json({success:true,reports:rows.map(r=>({id:r.id,title:r.title,site:r.site,lang:r.lang,url:basePath+'/r/'+r.token,search_console:(r.scope||(r.report&&r.report.scope))!=='CRAWL',created_at:r.created_at,expires_at:r.expires_at,
    revoked:!!r.revoked_at,expired:new Date(r.expires_at)<=new Date(),views:r.views,last_viewed_at:r.last_viewed_at,growth:!!r.growth}))})}
  catch(e){console.error('[gsc-report] list failed',e.message);res.status(500).json({success:false,error:'The reports could not be loaded.'})}
 });
 // Delete one or many reports for good. An attached Free Growth invitation is withdrawn with it.
 app.post(apiPath+'/reports/delete',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  const raw=(req.body||{}).ids;
  if(!Array.isArray(raw)||!raw.length||raw.length>200||!raw.every(i=>Number.isSafeInteger(Number(i))&&Number(i)>0))return res.status(400).json({success:false,error:'Choose 1 to 200 reports.'});
  try{await ensure();const gone=await st.deleteReports(pool,[...new Set(raw.map(Number))]);
   for(const g of gone)if(g.growth_invite){try{await st.revokeInviteToken(pool,g.growth_invite)}catch(e){console.error('[gsc-report] invite revoke failed',e.message)}}
   res.json({success:true,deleted:gone.length})}
  catch(e){console.error('[gsc-report] delete failed',e.message);res.status(500).json({success:false,error:'The reports could not be deleted.'})}
 });
 // A newer Search Console export for an existing report: only its period and the numbers per page are kept (compare.cjs).
 app.post(apiPath+'/reports/:id/period',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  try{
   const files=(Array.isArray(req.body&&req.body.files)?req.body.files:[]).filter(f=>f&&f.content_base64);
   if(!files.length)return res.status(400).json({success:false,error:'Upload the newer Search Console export (Pages and Dates).'});
   const snap=require('./compare.cjs').snapshot(analyze({uploads:readUploads(files)}));
   if(!snap.pages.length)return res.status(400).json({success:false,error:'No pages were found in this export.'});
   await ensure();const r=await st.setAfter(pool,Number(req.params.id),snap);
   if(!r)return res.status(404).json({success:false,error:'Report not found'});
   res.json({success:true,period:snap.period,pages:snap.pages.length});
  }catch(e){console.error('[gsc-report] period failed',e.message);res.status(500).json({success:false,error:'The newer export could not be added. Nothing was changed.'})}
 });
 app.post(apiPath+'/reports/:id/revoke',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  try{await ensure();const r=await st.revokeReport(pool,Number(req.params.id));res.json({success:!!r,...(r?{}:{error:'Already revoked or not found'})})}
  catch(e){res.status(500).json({success:false,error:'The link could not be revoked.'})}
 });
 app.get(basePath+'/contentscore.js',(req,res)=>{
  res.type('application/javascript').send(require('./contentscore-ui.cjs').script);
 });
 app.post(apiPath+'/r/:token/contentscore',async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  try{
   await ensure();
   const row=await st.openReport(pool,String(req.params.token),{count:false});
   const url=String(req.body?.url||'');
   const page=row?.report?.pages?.find(p=>p.url===url);
   if(!page||['REDIRECT','GONE','BLOCKED'].includes(page.action)||(page.audit?.issues||[]).length)return res.status(404).json({success:false,error:'Page not eligible'});
   const result=require('./contentscore.cjs').scanResult(req.body?.result,url);
   const saved=await st.saveContentScore(pool,row.token,url,result);
   if(!saved)return res.status(404).json({success:false,error:'Report unavailable'});
   res.json({success:true,result});
  }catch(e){console.error('[gsc-report] save ContentScore failed',e.message);res.status(400).json({success:false,error:'ContentScore could not be saved'})}
 });
 app.get(basePath+'/r/:token',async(req,res)=>{
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').set('Referrer-Policy','no-referrer')
   .set('Content-Security-Policy',"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; "+((isOwner(req)||['all','problems','blocked','redirects','gone'].includes(req.query?.view))?"script-src 'self'; connect-src 'self'":"script-src 'none'"));
  try{
   await ensure();const owner=isOwner(req);
   const row=await st.openReport(pool,String(req.params.token),{count:!owner});
   if(!row)return res.status(404).type('html').send(gonePage());
   const urls=((row.report&&row.report.pages)||[]).map(p=>p.url);
   const growth=await (st.growthFor||require('./published.cjs').growthFor)(pool,urls,{invite:row.growth_invite,owner}).catch(()=>new Map());
   const published=st.publicationsFor?await st.publicationsFor(pool,urls,{invite:row.growth_invite}).catch(()=>new Map())
    :new Map([...growth].filter(([,x])=>x.published_on).map(([k,x])=>[k,x.published_on]));
   const scores=await require('../growth-free/contentscore.cjs').forReport(pool,row,owner);
   res.type('html').send(reportPage(row,{owner,config,growthPath,published,growth,scores,issueView:req.query?.view,apiPath}));
  }catch(e){console.error('[gsc-report] view failed',e.message);res.status(503).type('text').send('Temporarily unavailable')}
 });
 return {sessionValid};
}

// ── Pages ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const CSS=`*{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#0f172a;font:15px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:#4338ca}.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
.top{background:linear-gradient(135deg,#1e1b4b,#312e81);color:#fff}.top .wrap{padding:28px 16px}
.brand{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.brand small{opacity:.8;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
h1{font-size:clamp(24px,4vw,34px);line-height:1.2;margin:10px 0 6px}h2{font-size:20px;margin:0 0 12px}h3{font-size:16px;margin:16px 0 8px}
.meta{opacity:.85;font-size:14px}.who{display:flex;align-items:center;gap:12px}.who img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #a5b4fc}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin:16px 0;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
.kpi b{display:block;font-size:24px;line-height:1.2}.kpi span{color:#475569;font-size:13px}.up{color:#15803d}.down{color:#b91c1c}
.tbl{width:100%;border-collapse:collapse;font-size:14px}.tbl th{text-align:left;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;padding:8px 6px;white-space:nowrap}
.tbl td{border-bottom:1px solid #eef2f7;padding:8px 6px;vertical-align:top}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tbl th.num,.tbl td.num{text-align:center}
.scroll{overflow-x:auto}.url{word-break:break-all}.badge{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
.QUICK_WIN{background:#dcfce7;color:#14532d}.SNIPPET{background:#dbeafe;color:#1e3a8a}.ZERO_CLICKS{background:#fee2e2;color:#7f1d1d}.REVIEW{background:#fef3c7;color:#78350f}
.DEEPER{background:#ede9fe;color:#4c1d95}.FIX_HREFLANG{background:#ccfbf1;color:#134e4a}.REDIRECT{background:#ffedd5;color:#7c2d12}.BLOCKED{background:#fecaca;color:#7f1d1d}.FIX_SNIPPET{background:#dbeafe;color:#1e3a8a}.FIX_STRUCTURE{background:#e0e7ff;color:#3730a3}.THIN{background:#fef3c7;color:#78350f}.NO_ISSUES{background:#f8fafc;color:#475569;border:1px solid #e2e8f0}
.issues{font-size:13px;margin-top:4px}.ba{font-size:13px;margin-top:4px}.done-note{font-size:13px;margin-top:4px;color:#065f46}.issues .flag{font-weight:600}.chip.idea{background:#f1f5f9;color:#334155;font-weight:600}.chip{display:inline-block;background:#ecfdf5;color:#065f46;border-radius:6px;padding:1px 7px;font-size:12px;font-weight:700;margin:4px 4px 0 0}
.facts{font-size:13px;margin:6px 0 0;display:grid;grid-template-columns:max-content 1fr;gap:2px 10px}.facts dt{color:#64748b}.facts dd{margin:0;word-break:break-word}.GONE{background:#fecaca;color:#7f1d1d}.NO_DATA{background:#f1f5f9;color:#334155}.KEEP{background:#f8fafc;color:#475569;border:1px solid #e2e8f0}
.btn{display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:6px 12px;font-size:13px;white-space:nowrap}
.btn.big{padding:12px 20px;font-size:15px}.muted{color:#64748b;font-size:13px}details{margin-top:8px}summary{cursor:pointer;color:#4338ca;font-weight:600}
.flag{color:#b91c1c;font-weight:600}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes slide{0%{left:-40%}100%{left:100%}}@keyframes flash{0%{box-shadow:0 0 0 4px #4338ca}100%{box-shadow:0 0 0 0 transparent}}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px;margin-right:8px}
#progress{margin:10px 0 0;max-width:560px}#progress .bar{position:relative;height:8px;background:#e0e7ff;border-radius:999px;overflow:hidden}#progress .bar span{position:absolute;top:0;bottom:0;width:40%;background:#4338ca;border-radius:999px;animation:slide 1.4s ease-in-out infinite}
#progress p{margin:6px 0 0;font-size:14px;color:#334155}.flash{animation:flash 1.6s ease-out 2}
.sec{border:2px solid #e2e8f0;border-radius:12px;padding:12px 16px 16px;margin:18px 0}.sec legend{font-weight:800;padding:0 8px;font-size:16px}.sec.with{border-color:#93c5fd;background:#f8fbff}.sec.without{border-color:#fdba74;background:#fffaf5}.sec.pos{border-color:#cbd5e1}div.sec h3{margin-top:0}.live{font-size:13px;margin-top:4px;color:#7c2d12}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.cta{background:linear-gradient(135deg,#eef2ff,#f5f3ff);border-color:#c7d2fe}.foot{color:#64748b;font-size:13px;text-align:center;margin-top:28px}
@media(max-width:700px){.ptbl thead{display:none}.ptbl,.ptbl tbody,.ptbl tr,.ptbl td{display:block;width:100%}
.ptbl tr{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:0 0 12px;background:#fff}.ptbl td{border:0;padding:3px 0}
.ptbl td.num{display:flex;justify-content:space-between;text-align:right}.ptbl td.num::before{content:attr(data-l);color:#64748b;font-weight:600;text-align:left;padding-right:12px}
.ptbl td.num:first-child{display:inline-block;width:auto;font-weight:800;color:#4338ca}.ptbl td.num:first-child::before{content:'#'}.ptbl .gcell{padding-top:8px}.ptbl .gcell:empty{display:none}}
@media print{body{background:#fff}.top{background:#1e1b4b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.btn{display:none}.card{break-inside:avoid}}`;

function shell(lang,title,body){
 return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
function gonePage(){return shell('en','Report not available','<div class="wrap"><div class="card"><h1>This report is not available</h1><p>The link has expired or was withdrawn. Ask the sender for a new link.</p></div></div>')}
function loginPage(){
 return shell('en','Search Console report — sign in',`<div class="wrap"><div class="card" style="max-width:520px;margin:60px auto"><h1>Search Console report</h1>
<p class="muted">For the owner of ContentScale. Sign in with the owner key (the same as Free Growth).</p>
<form id="lf"><label>Owner key<br><input id="ownerKey" type="password" autocomplete="current-password" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px"></label>
<p><button class="btn big" type="submit">Sign in</button> <span id="ls" class="muted"></span></p></form></div></div>
<script>document.getElementById('lf').onsubmit=async function(e){e.preventDefault();var s=document.getElementById('ls');s.textContent='Checking…';
try{var r=await fetch('/api/free-growth/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:document.getElementById('ownerKey').value})});
var d=await r.json();if(!d.success)throw Error(d.error||'Sign-in failed');location.reload()}catch(err){s.textContent=err.message}}</script>`);
}

// Shown readable (Arabic and other scripts are percent-encoded in a URL); the link itself keeps the real URL.
const pathOf=u=>{try{const x=new URL(u),p=(x.pathname+x.search)||'/';try{return decodeURI(p)}catch{return p}}catch{return u}};
const nf=(lang,n,o={})=>n==null?'—':new Intl.NumberFormat(lang==='nl'?'nl-NL':lang==='es'?'es-ES':'en-GB',o).format(n);
const pct=(lang,n)=>n==null?'—':nf(lang,n,{style:'percent',maximumFractionDigits:2});
const pos=(lang,n)=>n==null?'—':nf(lang,n,{maximumFractionDigits:1});
const dname=(lang,type,code)=>{try{return new Intl.DisplayNames([lang],{type}).of(type==='region'?String(code).toUpperCase():code)||code}catch{return code}};
const day=(lang,d)=>{try{return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':lang==='es'?'es-ES':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d))}catch{return ''}};
function change(lang,n){if(n==null)return '';const c=n>0?'up':n<0?'down':'';return ` <span class="${c}">${n>0?'+':''}${pct(lang,n)}</span>`}

function metricRows(lang,t,list,{name='name',flag=true}={}){
 if(!list||!list.length)return `<p class="muted">${esc(t.none)}</p>`;
 return `<div class="scroll"><table class="tbl"><thead><tr><th>${esc(t.name)}</th><th class="num">${esc(t.clicks)}</th><th class="num">${esc(t.impressions)}</th><th class="num">CTR</th><th class="num">${esc(t.position)}</th></tr></thead><tbody>`+
  list.map(x=>`<tr><td>${esc(x[name])}${flag&&x.flag?` <span class="flag">· ${esc(t.flag_no_clicks)}</span>`:''}</td><td class="num">${nf(lang,x.clicks)}</td><td class="num">${nf(lang,x.impressions)}</td><td class="num">${pct(lang,x.ctr!=null?x.ctr:(x.impressions?x.clicks/x.impressions:null))}</td><td class="num">${pos(lang,x.position)}</td></tr>`).join('')+
  '</tbody></table></div>';
}
function growthLink(p,{lang,owner,invite,growthPath,result=null,auditToken=null}){
 if(!owner&&!invite)return '';
 const q=p.queries&&p.queries[0]&&p.queries[0].query;
 const href=growthPath+'?'+(owner?'':'invite='+enc(invite)+'&')+'url='+enc(p.url)+(q?'&query='+enc(q):'')+'&lang='+enc(lang)+(auditToken?'&gsc_audit='+enc(auditToken):'');
 if(result)return `<a class="btn" href="${esc(growthPath+result+'&lang='+lang)}" target="_blank" rel="noopener">${esc(T[lang].open_result)}</a><br><a class="muted" href="${esc(href+'&fresh=1')}" target="_blank" rel="noopener">${esc(T[lang].research)}</a>`;
 return `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(T[lang].research)}</a>`;
}

function reportPage(row,{owner,config,growthPath,published=new Map(),growth=new Map(),scores={},problemsOnly=false,issueView=null,apiPath='/api/gsc'}){
 if(!published.size&&growth.size)published=new Map([...growth].filter(([,x])=>x.published_on).map(([k,x])=>[k,x.published_on]));
 const lang=LANGS.includes(row.lang)?row.lang:'en',t=T[lang],r=row.report||{},k=r.kpis||{},invite=row.growth_invite||null;
 const C=r.crawl;
 const crawlOnly=r.scope==='CRAWL',A=t.audit,done=a=>a==='KEEP'||a==='NO_ISSUES';
 const categories={problems:p=>Array.isArray(p.audit?.issues)&&p.audit.issues.length>0,blocked:p=>p.action==='BLOCKED',redirects:p=>p.action==='REDIRECT',gone:p=>p.action==='GONE'};
 const eligible=(r.pages||[]).filter(p=>!Object.values(categories).some(fn=>fn(p)));
 const work=eligible.filter(p=>!done(p.action)),keep=eligible.filter(p=>done(p.action));
 const first=work[0];
 const contact=config.contactUrl||'https://contentscale.site/contact/';
 const head=`<div class="top"><div class="wrap"><div class="brand"><small>${esc(config.brand||'ContentScale')} · ${esc(crawlOnly?A.kicker:t.kicker)}</small>
  ${config.authorName?`<div class="who">${config.authorImage?`<img src="${esc(config.authorImage)}" alt="${esc(config.authorName)}" width="52" height="52">`:''}<div><b>${esc(config.authorName)}</b><br><span class="meta">${esc(t.prepared_by)}</span></div></div>`:''}</div>
  <h1>${esc(row.title)}</h1><div class="meta">${esc(r.site||'')}${k.period?' · '+esc(day(lang,k.period.start))+' – '+esc(day(lang,k.period.end))+' ('+k.period.days+' '+esc(t.days)+')':''} · ${esc(t.made_on)} ${esc(day(lang,row.created_at))}${r.scope==='UPLOADED_PAGES'?' · '+esc(t.scope_pages):crawlOnly?' · '+esc(A.scope_crawl):''}</div></div></div>`;
 const summary=`<div class="card"><h2>${esc(t.summary)}</h2><p>${esc(t.summary_line.replace('{n}',nf(lang,(r.pages||[]).length)).replace('{w}',nf(lang,work.length)))}${first?' '+esc(t.start_with)+' <b class="url">'+esc(first.url)+'</b> — '+esc(t.actions[first.action]):''}</p></div>`;
 const ka=k.audit||{};
 const issueKpi=(name,count,view)=>`<div class="kpi"><span>${esc(name)}</span><b>${Number(count)>0?`<a href="?view=${view}" style="color:#2563eb;text-decoration:underline">${nf(lang,count)}</a>`:`<span style="color:#64748b">${nf(lang,count)}</span>`}</b></div>`;
 const kpisCrawl=`<div class="kpis">
  <div class="kpi"><span>${esc(A.kpi_read)}</span><b>${nf(lang,ka.pages_read)}</b></div>
  ${issueKpi(A.kpi_issues,ka.with_issues,"problems")}
  ${issueKpi(A.kpi_blocked,ka.blocked,"blocked")}
  ${k.urls_checked!=null?`${issueKpi(t.live.kpi_redirects,k.redirects,"redirects")}${issueKpi(t.live.kpi_gone,k.gone,"gone")}`:''}</div>
  ${k.urls_checked!=null?`<p class="muted">${esc(t.live.checked_note.replace('{c}',nf(lang,k.urls_checked)).replace('{n}',nf(lang,k.urls_not_checked)))}</p>`:''}`;
 const kpis=crawlOnly?kpisCrawl:`<div class="kpis">
  <div class="kpi"><span>${esc(t.clicks)}</span><b>${nf(lang,k.clicks)}</b>${r.trend?`<span>${esc(t.last7)}${change(lang,r.trend.clicks_change)}</span>`:''}</div>
  <div class="kpi"><span>${esc(t.impressions)}</span><b>${nf(lang,k.impressions)}</b>${r.trend?`<span>${esc(t.last7)}${change(lang,r.trend.impressions_change)}</span>`:''}</div>
  <div class="kpi"><span>CTR</span><b>${pct(lang,k.ctr)}</b></div>
  <div class="kpi"><span>${esc(t.avg_position)}</span><b>${pos(lang,k.position)}</b></div>
  <div class="kpi"><span>${esc(t.pages_no_clicks)}</span><b>${nf(lang,k.zero_click_pages)}</b></div>
  <div class="kpi"><span>${esc(t.top5_share)}</span><b>${pct(lang,k.top5_click_share)}</b></div>
  ${k.audit?`${issueKpi(A.kpi_issues,ka.with_issues,"problems")}${issueKpi(A.kpi_blocked,ka.blocked,"blocked")}`:''}
  ${k.urls_checked!=null?`${issueKpi(t.live.kpi_redirects,k.redirects,"redirects")}${issueKpi(t.live.kpi_gone,k.gone,"gone")}`:''}</div>
  <p class="muted">${esc(k.source==='DAILY_ROWS'?t.totals_daily:t.totals_pages)}${k.urls_checked!=null?' '+esc(t.live.checked_note.replace('{c}',nf(lang,k.urls_checked)).replace('{n}',nf(lang,k.urls_not_checked))):''}${r.trend?' '+esc(t.trend_note.replace('{a}',nf(lang,r.trend.last7.clicks)).replace('{b}',nf(lang,r.trend.previous7.clicks))):''}</p>`;
 const L=t.live,lv=p=>p.live||{};
 const label=p=>p.action==='REDIRECT'?(lv(p).permanent?L.r301:L.r302).replace('{s}',lv(p).status):p.action==='GONE'?L.gone.replace('{s}',lv(p).status):crawlOnly&&p.action==='NO_DATA'?A.not_read:t.actions[p.action];
 const liveLine=p=>{const x=lv(p);
  if(x.error)return ` <span class="muted">· ${esc(L.not_checked)}: ${esc(L.reasons[x.error]||x.error.replace(/^HTTP_/,'HTTP '))}</span>`;
  if(!x.hops)return '';
  return `<div class="live">${esc(L.to)} <a class="url" href="${esc(x.final_url)}" title="${esc(x.final_url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(x.final_url))}</a>`+
   (x.target_rank?` (${esc(L.in_list.replace('{n}',x.target_rank))})`:'')+(x.hops>1?` · ${esc(L.chain.replace('{n}',x.hops))}`:'')+
   (x.final_status&&x.final_status!==200?` · <span class="flag">${esc(L.target_broken.replace('{s}',x.final_status))}</span>`:x.final_error?` · <span class="flag">${esc(L.target_broken.replace('{s}',L.reasons[x.final_error]||x.final_error))}</span>`:'')+'</div>'};
 const BLOCKING=new Set(['NOINDEX','CANONICAL_ELSEWHERE']);
 const jsLine=p=>p.audit&&p.audit.rendered==='BOT_CHECK'?`<div class="issues muted">${esc(A.js_bot)}</div>`:p.audit&&p.audit.rendered==='FIRECRAWL'?`<div class="issues"><span class="chip">${esc(A.js_read)}</span>${p.audit.raw_issues&&p.audit.raw_issues.length?` <span class="muted">${esc(A.js_raw.replace('{x}',p.audit.raw_issues.map(c=>A.issues[c]||c).join(' · ')))}</span>`:''}</div>`:'';
 const noteLine=p=>p.audit&&p.audit.notes&&p.audit.notes.length?`<div class="issues muted">${esc(A.notes_label)}: ${p.audit.notes.map(c=>esc(A.issues[c]||c)).join(' · ')}</div>`:'';
 const issueLine=p=>p.audit&&p.audit.issues.length?`<div class="issues">${p.audit.issues.map(c=>BLOCKING.has(c)?`<span class="flag">${esc(A.issues[c]||c)}</span>`:esc(A.issues[c]||c)).join(' · ')}</div>`:'';
 const posChips=p=>(p.positions||[]).map(x=>`<span class="chip" title="${esc(x.keyword)}">${esc(A.pos_found.replace('{n}',x.position))} · ${esc(x.keyword)}</span>`).join('');
 const facts=p=>{const a=p.audit;if(!a)return '';const row=(k,v)=>`<dt>${esc(k)}</dt><dd>${v}</dd>`,no=`<span class="muted">${esc(A.none)}</span>`;
  return `<details><summary>${esc(A.seen)}</summary><dl class="facts">${row(A.f_title,a.title?esc(a.title)+` <span class="muted">(${a.title.length})</span>`:no)}${row(A.f_description,a.description?esc(a.description)+` <span class="muted">(${a.description.length})</span>`:no)}
   ${row(A.f_h1,a.h1.length?a.h1.map(esc).join(' · '):no)}${row(A.words,nf(lang,a.words))}${row(A.f_canonical,a.canonical?esc(a.canonical):no)}${row(A.f_lang,a.lang?esc(a.lang):no)}
   ${row(A.f_hreflang,a.hreflang.length?a.hreflang.map(h=>esc(h.lang)).join(', '):no)}${row(A.f_schema,a.schema&&a.schema.length?a.schema.map(esc).join(', '):no)}${a.articles&&a.articles.length?row(A.f_articles,a.articles.map(n=>`“${n.headline?esc(n.headline):esc(A.no_headline)}”${n.id?` <code>${esc(n.id)}</code>`:''}${n.source==='RANK_MATH'?` (${esc(A.src_rank_math)})`:n.source==='YOAST'?` (${esc(A.src_yoast)})`:''}`).join('<br>')):''}${a.schema_description?row(A.f_schema_desc,esc(a.schema_description)):''}${p.lastmod?row(A.lastmod,esc(day(lang,p.lastmod))):''}</dl></details>`};
 // The date this page was updated through Free Growth (see published.cjs).
// Before and after for updated pages, when a newer export was added (see compare.cjs).
 const B=t.ba,cmp=r.after?require('./compare.cjs').compare(r,r.after,published):null,cmpBy=new Map(cmp?cmp.pages.map(x=>[require('./published.cjs').norm(x.url),x]):[]);
 const fill=(s,o)=>s.replace(/\{(\w+)\}/g,(m,k)=>o[k]!=null?o[k]:m);
 const posMove=(b,a)=>b==null||a==null?'—':Math.abs(b-a)<0.05?B.same:fill(b>a?B.higher:B.lower,{n:pos(lang,Math.abs(b-a))});
 const signed=n=>(n>0?'+':'')+nf(lang,n);
 const baCard=!cmp||!cmp.pages.length?'':`<div class="card" id="beforeAfter"><h2>${esc(B.title)}</h2><p><b>${esc(B.count.replace('{n}',nf(lang,cmp.pages.length)))}</b></p>`+
  (cmp.comparable?`<div class="scroll"><table class="tbl"><thead><tr><th></th><th class="num">${esc(B.before)}</th><th class="num">${esc(B.after)}</th><th class="num">${esc(B.change)}</th></tr></thead><tbody>
   <tr><td>${esc(B.clicks)}</td><td class="num">${nf(lang,cmp.totals.before.clicks)}</td><td class="num">${nf(lang,cmp.totals.after.clicks)}</td><td class="num">${signed(cmp.totals.after.clicks-cmp.totals.before.clicks)}</td></tr>
   <tr><td>${esc(B.impressions)}</td><td class="num">${nf(lang,cmp.totals.before.impressions)}</td><td class="num">${nf(lang,cmp.totals.after.impressions)}</td><td class="num">${signed(cmp.totals.after.impressions-cmp.totals.before.impressions)}</td></tr>
   <tr><td>${esc(B.position)}</td><td class="num">${pos(lang,cmp.totals.before.position)}</td><td class="num">${pos(lang,cmp.totals.after.position)}</td><td class="num">${esc(posMove(cmp.totals.before.position,cmp.totals.after.position))}</td></tr></tbody></table></div>
   <p class="muted">${esc(fill(B.periods,{a:day(lang,cmp.before_period.start),b:day(lang,cmp.before_period.end),c:day(lang,cmp.after_period.start),d:day(lang,cmp.after_period.end),n:cmp.after_period.days}))}. ${esc(B.caveat)}</p>`
   :`<p class="muted">${esc(cmp.reason==='PERIOD_LENGTH'?fill(B.length,{a:cmp.before_period.days,b:cmp.after_period.days}):B.unknown)}</p>`)+'</div>';
 const baLine=p=>{if(!cmp||!cmp.comparable)return '';const x=cmpBy.get(require('./published.cjs').norm(p.url));if(!x)return '';
  if(x.status!=='OK')return `<div class="ba muted">${esc(B.missing)}</div>`;
  return `<div class="ba">${esc(fill(B.line,{cb:nf(lang,x.before.clicks),ib:nf(lang,x.before.impressions),pb:pos(lang,x.before.position)}))} → <b>${esc(fill(B.line_after,{ca:nf(lang,x.after.clicks),ia:nf(lang,x.after.impressions),pa:pos(lang,x.after.position)}))}</b></div>`};
 // The page's existing Free Growth result: the owner's own for the owner, the invitation's for the company.
 const resultOf=p=>{const x=growth.get(require('./published.cjs').norm(p.url));if(!x)return null;return owner?(x.owner_result||x.invite_result):x.invite_result};
 const doneOn=p=>{const d=published.get(require('./published.cjs').norm(p.url));const g=growth.get(require('./published.cjs').norm(p.url));return d?` <span class="chip done">${esc(t.updated_on.replace('{d}',day(lang,d+'T12:00:00Z')))}</span>${g&&g.note?`<div class="done-note">${esc(g.note)}</div>`:''}`:''};
 const cs=require('./contentscore-ui.cjs');
 const scoreCell=p=>{const own=r.contentscores?.[p.url];return cs.cell(p,scores[p.url]||(Array.isArray(own)?own[own.length-1]:own),{owner,lang,esc,endpoint:apiPath+'/r/'+enc(row.token||'')+'/contentscore'});};
 const pageRow=p=>`<tr><td class="num">${p.rank}</td><td class="pcell"><a class="url" href="${esc(p.url)}" title="${esc(p.url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(p.url))}</a><br><span class="badge ${esc(p.action)}">${esc(label(p))}</span>${doneOn(p)}${baLine(p)}${liveLine(p)}${jsLine(p)}${issueLine(p)}${noteLine(p)}${posChips(p)}
   <div class="muted">${esc(crawlOnly&&p.action==='NO_DATA'?A.todo_unread:t.todo[p.action])}${p.note?' · '+esc(p.note):''}${p.source==='MANUAL'?' · '+esc(t.manual):''}</div>
   ${p.queries&&p.queries.length?`<details><summary>${esc(t.page_queries)} (${p.queries.length})</summary>${metricRows(lang,t,p.queries,{name:'query',flag:false})}</details>`:''}
   ${p.countries&&p.countries.length?`<details><summary>${esc(t.countries)}</summary>${metricRows(lang,t,p.countries)}</details>`:''}
   ${p.devices&&p.devices.length?`<details><summary>${esc(t.devices)}</summary>${metricRows(lang,t,p.devices)}</details>`:''}
   ${facts(p)}
   ${p.trend?`<div class="muted">${esc(t.last7)}: ${nf(lang,p.trend.last7.clicks)} ${esc(t.clicks_l)}${change(lang,p.trend.clicks_change)}</div>`:''}</td>
   <td class="num" data-l="${esc(t.clicks)}">${nf(lang,p.clicks)}</td><td class="num" data-l="${esc(t.impressions)}">${nf(lang,p.impressions)}</td><td class="num" data-l="CTR">${pct(lang,p.ctr)}</td><td class="num" data-l="${esc(t.position)}">${pos(lang,p.position)}</td>
   <td class="num" data-l="${esc(t.median_ctr)}">${p.median_ctr!=null?pct(lang,p.median_ctr):'<span class="muted">'+esc(p.basis==='NO_DATA'?'—':t.too_few)+'</span>'}</td><td class="num" data-l="${esc(t.click_gap)}">${p.click_gap?'+'+nf(lang,p.click_gap):'—'}</td>
   <td class="gcell">${scoreCell(p)}<br>${growthLink(p,{lang,owner,invite,growthPath,result:resultOf(p),auditToken:row.token})}</td></tr>`;
 const crawlRow=p=>pageRow(p).replace(/<td class="num" data-l[\s\S]*?<td class="gcell">/,`<td class="num" data-l="${esc(A.words)}">${p.audit?nf(lang,p.audit.words):'—'}</td><td class="num" data-l="${esc(A.lastmod)}">${p.lastmod?esc(day(lang,p.lastmod)):'—'}</td><td class="gcell">`);
 const crawlTable=list=>`<div class="scroll"><table class="tbl ptbl"><thead><tr><th>#</th><th>${esc(t.page)}</th><th class="num">${esc(A.words)}</th><th class="num">${esc(A.lastmod)}</th><th></th></tr></thead><tbody>${list.map(crawlRow).join('')}</tbody></table></div>`;
 const table=list=>crawlOnly?crawlTable(list):`<div class="scroll"><table class="tbl ptbl"><thead><tr><th>#</th><th>${esc(t.page)}</th><th class="num">${esc(t.clicks)}</th><th class="num">${esc(t.impressions)}</th><th class="num">CTR</th><th class="num">${esc(t.position)}</th><th class="num">${esc(t.median_ctr)}</th><th class="num">${esc(t.click_gap)}</th><th></th></tr></thead><tbody>${list.map(pageRow).join('')}</tbody></table></div>`;
 const problemPages=(r.pages||[]).filter(p=>Array.isArray(p.audit?.issues)&&p.audit.issues.length>0).sort((a,b)=>b.audit.issues.length-a.audit.issues.length);
 const problemTitle={nl:'Pagina’s met problemen',es:'Páginas con problemas',en:'Pages with problems'}[lang];

 const categoryNames={problems:A.kpi_issues,blocked:A.kpi_blocked,redirects:L.kpi_redirects,gone:L.kpi_gone};
 const allPages=(r.pages||[]).filter(p=>Object.values(categories).some(fn=>fn(p)));
 const counts=Object.fromEntries(Object.keys(categories).map(key=>[key,allPages.filter(categories[key]).length]));
 const selected=problemsOnly?'problems':issueView;
 if(selected==='all'||Object.hasOwn(categories,selected)){
  const words={nl:{title:'Websiteproblemen',all:'Alle unieke pagina’s',page:'Pagina',issues:'Problemen',action:'Actie',structure:'Structuur',back:'Terug naar volledig rapport'},en:{title:'Website issues overview',all:'All unique pages',page:'Page',issues:'Problems',action:'Action',structure:'Structure',back:'Back to full report'},es:{title:'Problemas del sitio web',all:'Todas las páginas únicas',page:'Página',issues:'Problemas',action:'Acción',structure:'Estructura',back:'Volver al informe completo'}}[lang];
  const chosen=allPages.filter(p=>selected==='all'||categories[selected](p)).sort((a,b)=>(b.audit?.issues?.length||0)-(a.audit?.issues?.length||0));
  const filters=['all',...Object.keys(categories)].map(key=>`<a class="btn" href="?view=${key}"${key===selected?' aria-current="page" style="background:#312e81;color:white;outline:2px solid #818cf8"':''}>${esc(key==='all'?words.all:categoryNames[key])} (${key==='all'?allPages.length:counts[key]})</a>`).join(' ');
  const ui=cs.labels[lang];
  const rows=chosen.map(p=>`<tr data-issue-page="${esc(p.url)}"><td><a href="${esc(p.url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(p.url))}</a>${doneOn(p)}</td><td>${Object.keys(categories).filter(key=>categories[key](p)).map(key=>`<span class="chip">${esc(categoryNames[key])}</span>`).join(' ')}${liveLine(p)}${jsLine(p)}${noteLine(p)}${posChips(p)}</td><td>${cs.structure(p,A,lang,esc)}${p.audit?facts(p):''}</td><td>${p.action==='REDIRECT'||p.action==='GONE'?esc(label(p)):growthLink(p,{lang,owner,invite,growthPath,result:resultOf(p),auditToken:row.token})}</td></tr>`).join('');
  return shell(lang,words.title,head+`<div class="wrap"><p><a class="btn" href="?">${esc(words.back)}</a></p><section class="card" id="pagesWithProblems"><h2>${esc(words.title)} (${chosen.length})</h2><p>${filters}</p><div class="scroll"><table class="tbl" id="issueTable"><thead><tr><th>${esc(words.page)}</th><th>${esc(words.issues)}</th><th>${esc(words.structure)}</th><th>${esc(words.action)}</th></tr></thead><tbody>${rows}</tbody></table></div></section></div><script src="/gsc/contentscore.js" defer></script>`);
 }
 const overFive=problemPages.filter(p=>p.audit.issues.length>5);
 const overFiveTitle={nl:'Pagina’s met meer dan 5 problemen',es:'Páginas con más de 5 problemas',en:'Pages with more than 5 problems'}[lang];
 const overFiveSection=overFive.length?`<section class="card" id="pagesOverFiveIssues"><h2>${esc(overFiveTitle)} (${overFive.length})</h2><ul>${overFive.map(p=>`<li><a href="${esc(p.url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(p.url))}</a> · ${p.audit.issues.length} — ${p.audit.issues.map(c=>esc(A.issues[c]||c)).join(' · ')} ${growthLink(p,{lang,owner,invite,growthPath,result:resultOf(p),auditToken:row.token})}</li>`).join('')}</ul></section>`:'';
 const order=`<div class="card"><h2>${esc(t.order_title)}</h2><p class="muted">${esc(crawlOnly?A.order_intro:t.order_intro)}</p>${work.length?table(work):`<p>${esc(t.nothing_to_do)}</p>`}
  ${keep.length?`<details><summary>${esc(crawlOnly?A.keep_title:t.keep_title)} (${keep.length})</summary>${table(keep)}</details>`:''}</div>`;
 const bands=`<div class="card"><h2>${esc(t.bands_title)}</h2><div class="scroll"><table class="tbl"><thead><tr><th>${esc(t.position)}</th><th class="num">${esc(t.pages)}</th><th class="num">${esc(t.clicks)}</th><th class="num">${esc(t.impressions)}</th><th class="num">${esc(t.median_ctr)}</th><th class="num">${esc(t.compared)}</th></tr></thead><tbody>`+
  (r.bands||[]).map(b=>`<tr><td>${esc(b.band)}</td><td class="num">${nf(lang,b.pages)}</td><td class="num">${nf(lang,b.clicks)}</td><td class="num">${nf(lang,b.impressions)}</td><td class="num">${b.median_ctr!=null?pct(lang,b.median_ctr):'<span class="muted">'+esc(t.too_few)+'</span>'}</td><td class="num">${nf(lang,b.compared_pages)}</td></tr>`).join('')+'</tbody></table></div></div>';
 const Q=r.queries||{};
 const queries=`<div class="card"><h2>${esc(t.queries_title)}</h2><p class="muted">${esc(Q.not_linked?t.queries_not_linked:Q.from_pages?t.queries_from_pages:t.none)}</p>
  ${Q.total?`<p>${esc(t.brand_split.replace('{b}',nf(lang,Q.brand_clicks)).replace('{n}',nf(lang,Q.non_brand_clicks)))}</p>
  <div class="grid2"><div><h3>${esc(t.near_top)}</h3>${metricRows(lang,t,Q.near_top,{name:'query',flag:false})}</div><div><h3>${esc(t.questions)}</h3>${metricRows(lang,t,Q.questions,{name:'query',flag:false})}</div></div>
  <h3>${esc(t.zero_click_q)}</h3>${metricRows(lang,t,Q.zero_click,{name:'query',flag:false})}
  <details><summary>${esc(t.all_queries)} (${nf(lang,(Q.top||[]).length)})</summary>${metricRows(lang,t,Q.top,{name:'query',flag:false})}</details>
  ${Q.brand&&Q.brand.length?`<details><summary>${esc(t.brand_terms)} (${Q.brand.length})</summary>${metricRows(lang,t,Q.brand,{name:'query',flag:false})}</details>`:''}`:''}</div>`;
 const geo=`<div class="grid2"><div class="card"><h2>${esc(t.countries)}</h2>${metricRows(lang,t,r.countries)}</div><div class="card"><h2>${esc(t.devices)}</h2>${metricRows(lang,t,r.devices)}
  ${r.appearance&&r.appearance.length?`<h3>${esc(t.appearance)}</h3>${metricRows(lang,t,r.appearance)}`:''}</div></div>`;
 const files=`<div class="card"><h2>${esc(t.uploaded_title)}</h2><ul>${(r.files||[]).map(f=>`<li>${esc(f.name)} — ${esc(t.kinds[f.kind]||f.kind)}${f.reason?' ('+esc(f.reason)+')':''}</li>`).join('')||'<li>'+esc(t.manual_only)+'</li>'}</ul>
  ${r.filters&&r.filters.length?`<p class="muted">${esc(t.filters)}: ${r.filters.map(esc).join(' · ')}</p>`:''}
  <h3>${esc(t.method_title)}</h3><p class="muted">${esc(t.method)}${C?esc(A.method_extra):''}${k.urls_checked!=null?esc(t.live.method):''}</p><h3>${esc(t.notes_title)}</h3><ul class="muted">${(r.notes||[]).map(n=>'<li>'+esc(t.note_map[n]||n)+'</li>').join('')}</ul></div>`;
 const P=r.positions;
 const posRow=x=>`<tr><td>${esc(x.keyword)}</td><td>${x.status==='FOUND'?`<b>${esc(A.pos_found.replace('{n}',x.position))}</b>`:x.status==='NOT_IN_RESULTS'?esc(A.pos_not_found.replace('{n}',x.depth||30)):`<span class="muted">${esc(A.pos_error)}</span>`}</td>
  <td>${x.url?`<a class="url" href="${esc(x.url)}" title="${esc(x.url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(x.url))}</a>${x.rank?` <span class="muted">(${esc(A.pos_in_list.replace('{n}',x.rank))})</span>`:''}`:'—'}</td></tr>`;
 const positions=P?`<div class="card"><h2>${esc(A.pos_title)}</h2>${P.status==='PROVIDER_NOT_CONFIGURED'?`<p class="muted">${esc(A.pos_not_configured)}</p>`:
  `<p class="muted">${esc(A.pos_intro.replace('{country}',dname(lang,'region',P.market.gl)).replace('{language}',dname(lang,'language',P.market.hl)).replace('{date}',day(lang,P.checked_at)))}</p>
  <div class="scroll"><table class="tbl"><thead><tr><th>${esc(A.pos_term)}</th><th>${esc(A.pos_position)}</th><th>${esc(A.pos_page)}</th></tr></thead><tbody>${(P.rows||[]).map(posRow).join('')}</tbody></table></div>`}
  ${P.ideas&&P.ideas.length?`<h3>${esc(A.ideas_title)}</h3><p class="muted">${esc(A.ideas_intro)}</p><p>${P.ideas.map(i=>`<span class="chip idea" title="${esc(i.from)}">${esc(i.term)}</span>`).join('')}</p>`:''}
  ${owner&&P.calls!=null?`<p class="muted">${esc(t.owner_view)} · ${esc(A.pos_calls.replace('{n}',P.calls))}</p>`:''}</div>`:'';
 const SP=r.speed,metric=(key,v)=>`<div class="kpi"><span>${esc(A['m_'+key])}</span><b>${key==='CLS'?esc(nf(lang,v.score,{maximumFractionDigits:2})):esc(nf(lang,v.ms/1000,{maximumFractionDigits:1}))+' s'}</b><span>${esc(A.cat[v.category]||'')}</span></div>`;
 const speed=SP?`<div class="card"><h2>${esc(A.speed_title)}</h2>${SP.status==='FOUND'?`<div class="kpis">${Object.entries(SP.metrics).map(([k2,v])=>metric(k2,v)).join('')}${SP.overall?`<div class="kpi"><span>${esc(A.overall)}</span><b>${esc(A.cat[SP.overall]||SP.overall)}</b></div>`:''}</div>
  <p class="muted">${esc(A.speed_source)}</p>`:`<p class="muted">${esc(SP.status==='NO_FIELD_DATA'?A.speed_none:A.speed_unavailable)}</p>`}</div>`:'';
 const crawled=C?`<div class="card"><h2>${esc(A.read_title)}</h2><ul><li>${esc(C.origin)}</li><li>${esc(C.robots.found?A.robots_found.replace('{n}',nf(lang,C.robots.rules)):A.robots_none)}</li>
  <li>${esc(A.src[C.sitemap.source]||'')} ${esc(A.counts.replace('{l}',nf(lang,C.sitemap.urls_found)).replace('{r}',nf(lang,C.pages_read)))}</li>
  ${C.not_crawled_count?`<li>${esc(A.not_crawled.replace('{n}',nf(lang,C.not_crawled_count)))}<ul class="muted">${C.not_crawled.map(x=>'<li class="url">'+esc(pathOf(x.url))+'</li>').join('')}</ul></li>`:''}
  ${C.path&&C.path!=='/'?`<li>${esc(A.path_only.replace('{p}',C.path).replace('{n}',nf(lang,C.outside_path)))}</li>`:''}
  ${C.render&&C.render.tried!=null?`<li>${esc(A.fc_summary.replace('{u}',nf(lang,C.render.used)).replace('{t}',nf(lang,C.render.tried)))}${C.render.bot_check?` ${esc(A.fc_bot.replace('{n}',nf(lang,C.render.bot_check)))}`:''}${owner?` <span class="muted">(${esc(t.owner_view)} · ${esc(A.fc_used.replace('{n}',C.render.tried))})</span>`:''}</li>`:''}
  ${owner&&C.render&&C.render.status==='NOT_CONFIGURED'?`<li class="muted">${esc(t.owner_view)} · ${esc(A.fc_none)}</li>`:''}
  ${C.not_crawled_limit?`<li>${esc(A.limit.replace('{m}',nf(lang,C.max||150)).replace('{n}',nf(lang,C.not_crawled_limit)))}</li>`:''}</ul>
  ${crawlOnly?`<h3>${esc(A.unknown_title)}</h3><p class="muted">${esc(A.unknown)}</p><h3>${esc(t.method_title)}</h3><p class="muted">${esc(A.method)}${k.urls_checked!=null?esc(t.live.method):''}</p>`:''}</div>`:'';
 const cta=`<div class="card cta"><h2>${esc(t.cta_title)}</h2><p>${esc(t.cta_text)}</p><p><a class="btn big" href="${esc(contact)}" target="_blank" rel="noopener">${esc(t.cta_button)}</a></p></div>`;
 const foot=`<p class="foot">${esc(t.valid_until)} ${esc(day(lang,row.expires_at))} · ${esc(config.brand||'ContentScale')}${owner?' · '+esc(t.owner_view)+' · '+nf(lang,row.views)+' '+esc(t.views):''}</p>`;
 return shell(lang,row.title,head+`<div class="wrap">${summary}${baCard}${kpis}${overFiveSection}${order}${positions}${speed}${crawlOnly?crawled:bands+queries+geo+crawled+files}${cta}${foot}</div>${owner?'<script src="/gsc/contentscore.js" defer></script>':''}`);
}

const {COUNTRIES}=require('../rank-free/engine.cjs');
const COUNTRY_OPTIONS=(()=>{const dn=new Intl.DisplayNames(['en'],{type:'region'});return COUNTRIES.map(c=>[c,dn.of(c.toUpperCase())||c]).sort((a,b)=>a[1].localeCompare(b[1])).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')})();
function ownerPage(config,api,base){
 return shell('en','Search Console reports',`<div class="top"><div class="wrap"><small style="opacity:.8;letter-spacing:.08em;text-transform:uppercase;font-weight:700">ContentScale · Owner</small><h1>Search Console reports</h1>
<div class="meta">Upload the Search Console export of any site, add pages by hand, and send the company a private link. Signed in as owner.</div></div></div>
<div class="wrap"><div class="card"><h2>New report</h2>
<form id="nf"><div class="grid2"><label>Title<br><input id="title" required maxlength="160" placeholder="Acme Roofing — Search Console, November 2026" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label>
<label>Site (optional)<br><input id="site" maxlength="200" placeholder="acme-roofing.com" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label>
<label>Report language<br><select id="lang" style="padding:9px;border-radius:8px"><option value="en">English</option><option value="nl">Nederlands</option><option value="es">Español</option></select></label>
<label>Link valid for (days)<br><input id="days" type="number" min="1" max="365" value="90" style="padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label></div>
<fieldset id="secWithout" class="sec without"><legend>A · Without Search Console (public read)</legend>
<p class="muted">Only a domain: robots.txt (followed), the sitemap and up to 150 pages are read in public — redirects, 404, noindex, canonical, title, meta description, H1, amount of text — plus Google's speed data for real visitors. Free. No clicks or impressions: those are only in Search Console.</p>
<label>Domain<br><input id="auditDomain" maxlength="200" placeholder="derayah.com" style="width:100%;max-width:420px;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label>
<label>Pages to read (at most) <input id="auditMax" type="number" min="1" max="150" value="150" style="width:80px;padding:6px;border:1px solid #cbd5e1;border-radius:8px"></label> <span class="muted">Fewer is faster: use 5–10 while testing.</span><br>
<label><input type="checkbox" id="fcOn"> <b>Paid:</b> read pages again with Firecrawl when they look empty without JavaScript (no H1, little text, no real title)</label>
<p class="muted">Only those pages among the pages read (at most 50), one Firecrawl credit each, and you confirm first; good pages and pages that refuse readers are never sent. The report then shows what Google sees after JavaScript.</p>
<p class="muted">Fill in A, B or both. With both, the Search Console numbers stay and the public facts are added per page.</p></fieldset>
<fieldset id="secWith" class="sec with"><legend>B · With Search Console</legend>
<p class="muted">The company gave you its Search Console export: clicks, impressions, CTR and position per page. The order of the pages is calculated on these numbers.</p>
<h3>Search Console files</h3><p class="muted">Search Console → Performance → Export → Download CSV (ZIP). Add as many as you like: one export of the whole site, exports filtered on one page (their search terms are linked to that page), or a CSV with a page and a search-term column. Each file at most 5 MB.</p>
<input id="gscFiles" type="file" multiple accept=".zip,.csv,.tsv,.txt">
<h3>Pages added by hand</h3><p class="muted">One per line: URL ; clicks ; impressions ; position ; note. Only the URL is required. A page that is also in the export keeps the numbers of the export.</p>
<textarea id="manual" rows="5" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px" placeholder="https://acme-roofing.com/new-service/ ;;;; New service, not in Search Console yet"></textarea>
</fieldset>
<fieldset id="secPositions" class="sec pos"><legend>Positions in Google (optional, for A and B)</legend>
<div class="grid2"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:end"><label>Country<br><select id="posCountry" style="padding:9px;border-radius:8px"><option value="" selected>— choose a country —</option>${COUNTRY_OPTIONS}</select></label><label>Language (2 letters, optional)<br><input id="posLang" maxlength="2" placeholder="ar" style="width:70px;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label></div></div>
<p class="muted" style="margin:4px 0 10px">Choose these first: suggested search terms follow this language, and positions are looked up in this Google.</p>
<p class="muted">Suggested search terms come from your Search Console files when you add them, otherwise from the H1 and title of the site's pages. Check them before you make the report: only then is anything searched.</p>
<div class="grid2" style="margin-top:6px"><label>Search terms (one per line, at most 10) <button type="button" id="suggestTerms" class="btn" style="margin-left:6px">Suggest search terms</button><br><textarea id="posTerms" rows="4" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px" placeholder="saudi stock trading app"></textarea></label>
<div id="termSources" class="muted" style="grid-column:1/-1;font-size:13px"></div></div>
<label><input type="checkbox" id="posOn"> <b>Paid:</b> look up positions in Google for these search terms (Serper: up to 3 searches per term). Suggesting terms is free and never turns this on.</label>
</fieldset>
<h3>Live check</h3><label><input type="checkbox" id="checkUrls" checked> Check every URL live: does it redirect (301/302) and to where, or is it gone (404/410)?</label>
<p class="muted">Each URL is requested once (public https only, at most 150). A site that blocks the request is shown as not checked.</p>
<h3>Free Growth for the recipient</h3><label><input type="checkbox" id="growthOn"> Let the company research pages in Free Growth from the report</label>
<label style="margin-left:12px">checks <input id="growthChecks" type="number" min="1" max="20" value="3" style="width:70px;padding:6px;border:1px solid #cbd5e1;border-radius:8px"></label>
<p class="muted">An invitation is made with this number of checks; it ends with the report. Without it, the company sees your contact button; you always see a Free Growth link per page.</p>
<p><button class="btn big" type="submit" id="go">Make the report</button> <span id="st" class="muted" role="status"></span></p>
<div id="progress" hidden aria-live="polite"><div class="bar"><span></span></div><p id="progressText"></p></div></form>
<div id="made"></div></div>
<div class="card"><h2>Your reports</h2><p><button class="btn" style="background:#b91c1c" type="button" id="deleteSelected" disabled>Delete selected</button> <span id="delSt" class="muted" role="status"></span></p>
<div id="listWithout" class="sec without"><h3>A · Without Search Console (public read)</h3><div class="muted">Loading…</div></div>
<div id="listWith" class="sec with"><h3>B · With Search Console</h3><div class="muted">Loading…</div></div></div></div>
<script>
var API=${JSON.stringify(api)},BASE=${JSON.stringify(base)};
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function read(f){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok({name:f.name,content_base64:String(r.result).split(',')[1]||''})};r.onerror=no;r.readAsDataURL(f)})}
function manual(){return document.getElementById('manual').value.split('\\n').map(function(l){var p=l.split(';').map(function(x){return x.trim()});
 return p[0]?{url:p[0],clicks:p[1]||null,impressions:p[2]||null,position:p[3]||null,note:p.slice(4).join(';')||null}:null}).filter(Boolean)}
document.getElementById('suggestTerms').onclick=async function(){var st=document.getElementById('termSources'),btn=this;btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Looking…';st.textContent='Reading the site for search terms… (up to about 30 s)';
 try{var files=[].slice.call(document.getElementById('gscFiles').files);
  var r=await fetch(API+'/suggest-terms',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},
   body:JSON.stringify({domain:document.getElementById('auditDomain').value.trim(),country:document.getElementById('posCountry').value,language:document.getElementById('posLang').value.trim(),files:await Promise.all(files.map(read))})});var d=await r.json();if(!d.success)throw Error(d.error);
  if(!d.terms.length){st.textContent='No usable search terms found. Type them yourself.';return}
  document.getElementById('posTerms').value=d.terms.map(function(t){return t.term}).join('\\n');
  var src={SEARCH_CONSOLE:'Search Console',PAGE_H1:'H1 of',PAGE_TITLE:'title of'};
  st.innerHTML='Suggested — check and edit before you make the report:<br>'+d.terms.map(function(t){return h(t.term)+' <span style="opacity:.7">('+h(src[t.source]||t.source)+(t.page?' '+h(t.page_label||t.page):'')+(t.impressions?', '+t.impressions+' impressions':'')+')</span>'}).join('<br>');
 }catch(e){st.textContent=e.message||'No search terms could be suggested.'}finally{btn.disabled=false;btn.textContent='Suggest search terms'}};
function rowsHtml(list){if(!list.length)return '<p class="muted">No reports.</p>';
 return '<div class="scroll"><table class="tbl"><thead><tr><th><input type="checkbox" data-all aria-label="Select all"></th><th>Title</th><th>Site</th><th>Made</th><th>Valid until</th><th class="num">Views</th><th>Status</th><th></th></tr></thead><tbody>'+list.map(function(x){
  var live=!x.revoked&&!x.expired,full=location.origin+x.url;
  return '<tr><td><input type="checkbox" data-id="'+h(x.id)+'" aria-label="Select"></td><td>'+h(x.title)+(x.growth?' <span class="badge QUICK_WIN">Free Growth</span>':'')+'</td><td>'+h(x.site)+'</td><td>'+h(String(x.created_at).slice(0,10))+'</td><td>'+h(String(x.expires_at).slice(0,10))+'</td><td class="num">'+h(x.views)+'</td><td>'+(x.revoked?'Withdrawn':x.expired?'Expired':'Active')+'</td><td>'+
   (live?'<a class="btn" href="'+h(x.url)+'" target="_blank" rel="noopener">Open</a> <button class="btn" data-copy="'+h(full)+'">Copy link</button> <button class="btn" style="background:#b45309" data-revoke="'+h(x.id)+'">Withdraw</button> ':'')+
   (live&&x.search_console?'<label class="btn" style="background:#0f766e;cursor:pointer">Add a newer period<input type="file" multiple accept=".csv,.zip,.xlsx" data-period="'+h(x.id)+'" hidden></label> ':'')+
   '<button class="btn" style="background:#b91c1c" data-delete="'+h(x.id)+'">Delete</button></td></tr>'}).join('')+'</tbody></table></div>'}
async function del(ids){var st=document.getElementById('delSt');
 if(!ids.length||!confirm('Delete '+ids.length+' report'+(ids.length>1?'s':'')+' for good? The link stops working and cannot be restored.'))return;
 try{var r=await fetch(API+'/reports/delete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:JSON.stringify({ids:ids})});var d=await r.json();if(!d.success)throw Error(d.error);
  st.textContent=d.deleted+' deleted.'}catch(e){st.textContent=e.message||'Could not delete.'}load()}
function selected(){return [].slice.call(document.querySelectorAll('[data-id]:checked')).map(function(b){return Number(b.getAttribute('data-id'))})}
function sync(){var n=selected().length,b=document.getElementById('deleteSelected');b.disabled=!n;b.textContent=n?'Delete selected ('+n+')':'Delete selected'}
document.getElementById('deleteSelected').onclick=function(){del(selected())};
async function load(){var A=document.getElementById('listWith'),B=document.getElementById('listWithout');
 try{var r=await fetch(API+'/reports',{credentials:'same-origin',cache:'no-store'});var d=await r.json();if(!d.success)throw Error(d.error);
  A.innerHTML='<h3>B · With Search Console</h3>'+rowsHtml(d.reports.filter(function(x){return x.search_console}));
  B.innerHTML='<h3>A · Without Search Console (public read)</h3>'+rowsHtml(d.reports.filter(function(x){return !x.search_console}));
  [A,B].forEach(function(el){
   var all=el.querySelector('[data-all]');if(all)all.onchange=function(){el.querySelectorAll('[data-id]').forEach(function(c){c.checked=all.checked});sync()};
   el.querySelectorAll('[data-id]').forEach(function(c){c.onchange=sync});
   el.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.getAttribute('data-copy'));b.textContent='Copied'}});
   el.querySelectorAll('[data-period]').forEach(function(inp){inp.onchange=async function(){var fs=[].slice.call(inp.files||[]);if(!fs.length)return;
    try{var files=await Promise.all(fs.map(read));var r=await fetch(API+'/reports/'+inp.getAttribute('data-period')+'/period',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:JSON.stringify({files:files})});
     var d=await r.json();alert(d.success?'Added: '+d.pages+' pages'+(d.period?' ('+d.period.start+' – '+d.period.end+')':' (no dates in this export)'):d.error)}catch(e){alert('Could not add the export.')}load()}});
   el.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){del([Number(b.getAttribute('data-delete'))])}});
   el.querySelectorAll('[data-revoke]').forEach(function(b){b.onclick=async function(){if(!confirm('Withdraw this link? The company can no longer open the report.'))return;
    await fetch(API+'/reports/'+b.getAttribute('data-revoke')+'/revoke',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:'{}'});load()}})});
  sync()}
 catch(e){A.textContent='Could not load the reports: '+e.message;B.textContent=''}}
document.getElementById('nf').onsubmit=async function(e){e.preventDefault();var st=document.getElementById('st'),go=document.getElementById('go'),files=[].slice.call(document.getElementById('gscFiles').files);
 if(files.some(function(f){return f.size>5*1024*1024})){st.textContent='A file is larger than 5 MB.';return}
 if(files.reduce(function(a,f){return a+f.size},0)>7*1024*1024){st.textContent='Together the files are larger than 7 MB: make two reports.';return}
 var dom=document.getElementById('auditDomain').value.trim(),posOn=document.getElementById('posOn').checked,t0=Date.now(),pr=document.getElementById('progress'),pt=document.getElementById('progressText');
 // Visible progress: reading a site takes up to two minutes; without it the button seems to do nothing (owner 2026-11-21).
 var steps=(files.length?['Reading the Search Console files']:[]).concat(dom?['Reading robots.txt and the sitemap','Reading the pages (up to '+(document.getElementById('auditMax').value||150)+')','Fetching Google’s speed data']:[]).concat(dom&&document.getElementById('fcOn').checked?['Reading pages again with JavaScript (Firecrawl)']:[]).concat(posOn?['Looking up positions in Google']:[]).concat(['Checking redirects and 404','Calculating the order']);
 var tick=function(){var s=Math.round((Date.now()-t0)/1000),i=Math.min(steps.length-1,Math.floor(s/(dom?12:2)));pt.textContent=steps[i]+'… ('+s+' s'+(dom?', up to about 2 minutes':'')+')'};
 // Paid searches only with the owner's own tick, a chosen country and a confirmation that names the market (owner 2026-11-21).
 var paid=[],fcOn=document.getElementById('fcOn').checked&&!!dom;
 if(posOn){var cs=document.getElementById('posCountry'),pl=document.getElementById('posLang').value.trim(),nterms=Math.min(10,document.getElementById('posTerms').value.split('\\n').filter(function(x){return x.trim()}).length);
  if(!cs.value){st.textContent='Choose the country for the positions in Google.';cs.focus();return}
  paid.push('up to '+nterms*3+' paid Google searches (Serper) for '+nterms+' search terms in Google '+cs.options[cs.selectedIndex].text+(pl?' ('+pl+')':''))}
 if(fcOn)paid.push('Firecrawl for the pages that look empty without JavaScript, at most '+Math.min(50,Math.max(1,parseInt(document.getElementById('auditMax').value,10)||150))+' (one credit each)');
 if(paid.length&&!confirm('This report uses: '+paid.join(' and ')+'. Continue?'))return
 go.disabled=true;go.innerHTML='<span class="spinner"></span>Working…';st.textContent='';pr.hidden=false;tick();var timer=setInterval(tick,1000);
 try{var body={title:document.getElementById('title').value,site:document.getElementById('site').value,lang:document.getElementById('lang').value,expires_days:document.getElementById('days').value,
  files:await Promise.all(files.map(read)),manual_pages:manual(),site_audit:{domain:document.getElementById('auditDomain').value.trim(),max:document.getElementById('auditMax').value,firecrawl:{enabled:document.getElementById('fcOn').checked}},positions:{enabled:document.getElementById('posOn').checked,keywords:document.getElementById('posTerms').value,country:document.getElementById('posCountry').value,language:document.getElementById('posLang').value.trim()||undefined},check_urls:document.getElementById('checkUrls').checked,recipient_growth:{enabled:document.getElementById('growthOn').checked,checks:document.getElementById('growthChecks').value}};
  var r=await fetch(API+'/reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:JSON.stringify(body)});
  var d=await r.json();if(!d.success)throw Error(d.error);var full=location.origin+d.url;
  st.textContent='Report made: '+d.pages+' pages.';
  document.getElementById('made').innerHTML='<div class="card cta"><b>Private link for the company</b><p class="url">'+h(full)+'</p><p><a class="btn big" href="'+h(d.url)+'" target="_blank" rel="noopener">Open the report</a> <button class="btn big" id="cp">Copy link</button></p><p class="muted">'+
   d.files.map(function(f){return h(f.name)+': '+h(f.kind)+(f.reason?' ('+h(f.reason)+')':'')}).join(' · ')+'</p></div>';
  document.getElementById('cp').onclick=function(){navigator.clipboard.writeText(full);this.textContent='Copied'};load();
  var m=document.getElementById('made');m.scrollIntoView({behavior:'smooth',block:'center'});m.firstChild.classList.add('flash')}
 catch(err){st.textContent=err.message||'Something went wrong. Nothing was saved.'}finally{clearInterval(timer);pr.hidden=true;go.disabled=false;go.textContent='Make the report'}};
load();
</script>`);
}
module.exports={registerGscReport,reportPage};
