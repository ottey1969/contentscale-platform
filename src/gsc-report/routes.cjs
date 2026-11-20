'use strict';
// app.contentscale.site/gsc (owner 2026-11-20): the owner uploads the Search Console export of any site, adds pages by
// hand, and sends the company a report through a secret link. The company opens it without a login. The report page is
// static HTML (no scripts), not indexed, and every value is escaped. Free Growth is linked per page: always for the owner;
// for a recipient only when the owner attached an invitation to the report.
const crypto=require('node:crypto');
const {readUploads,analyze}=require('./analysis.cjs');
const reportStore=require('./store.cjs');
const growthStore=require('../growth-free/store.cjs');
const {T,LANGS}=require('./texts.cjs');

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=encodeURIComponent;

function registerGscReport(app,pool,{config=require('../growth-free/routes.cjs').freeGrowthConfig(),storage=null,basePath='/gsc',apiPath='/api/gsc',growthPath='/free-growth'}={}){
 // The Free Growth invitation for a recipient lives in the Free Growth tables; they are made on first use.
 const st=storage||{...reportStore,createInvite:async(p,o)=>{await growthStore.ensureTables(p);return growthStore.createInvite(p,o)}};
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
   const report=analyze({uploads,manualPages:manual,site:String(b.site||'')});
   if(!report.pages.length&&!report.queries.total&&!report.countries.length)
    return res.status(400).json({success:false,error:'Upload a Search Console export or add at least one page.',files:report.files});
   await ensure();
   let invite=null;
   const g=b.recipient_growth||{};
   if(g.enabled===true){const checks=Math.min(20,Math.max(1,parseInt(g.checks,10)||3));
    invite=(await st.createInvite(pool,{label:('GSC report: '+String(b.title||report.site)).slice(0,120),emailLock:null,maxChecks:checks,days})).token}
   const row=await st.createReport(pool,{title:String(b.title||report.site||'Search Console report').slice(0,160),site:report.site,lang,report,days,growthInvite:invite});
   res.json({success:true,id:row.id,url:basePath+'/r/'+row.token,expires_at:row.expires_at,files:report.files,pages:report.pages.length});
  }catch(e){console.error('[gsc-report] create failed',e.message);res.status(500).json({success:false,error:'The report could not be made. Nothing was saved.'})}
 });
 app.get(apiPath+'/reports',async(req,res)=>{
  if(!isOwner(req))return res.status(404).json({success:false,error:'Not found'});
  try{await ensure();const rows=await st.listReports(pool,{limit:200});
   res.set('Cache-Control','no-store').json({success:true,reports:rows.map(r=>({id:r.id,title:r.title,site:r.site,lang:r.lang,url:basePath+'/r/'+r.token,created_at:r.created_at,expires_at:r.expires_at,
    revoked:!!r.revoked_at,expired:new Date(r.expires_at)<=new Date(),views:r.views,last_viewed_at:r.last_viewed_at,growth:!!r.growth}))})}
  catch(e){console.error('[gsc-report] list failed',e.message);res.status(500).json({success:false,error:'The reports could not be loaded.'})}
 });
 app.post(apiPath+'/reports/:id/revoke',async(req,res)=>{
  if(!ownerWrite(req))return res.status(404).json({success:false,error:'Not found'});
  try{await ensure();const r=await st.revokeReport(pool,Number(req.params.id));res.json({success:!!r,...(r?{}:{error:'Already revoked or not found'})})}
  catch(e){res.status(500).json({success:false,error:'The link could not be revoked.'})}
 });
 app.get(basePath+'/r/:token',async(req,res)=>{
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').set('Referrer-Policy','no-referrer')
   .set('Content-Security-Policy',"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; script-src 'none'");
  try{
   await ensure();const owner=isOwner(req);
   const row=await st.openReport(pool,String(req.params.token),{count:!owner});
   if(!row)return res.status(404).type('html').send(gonePage());
   res.type('html').send(reportPage(row,{owner,config,growthPath}));
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
.scroll{overflow-x:auto}.url{word-break:break-all}.badge{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
.QUICK_WIN{background:#dcfce7;color:#14532d}.SNIPPET{background:#dbeafe;color:#1e3a8a}.ZERO_CLICKS{background:#fee2e2;color:#7f1d1d}.REVIEW{background:#fef3c7;color:#78350f}
.DEEPER{background:#ede9fe;color:#4c1d95}.NO_DATA{background:#f1f5f9;color:#334155}.KEEP{background:#f8fafc;color:#475569;border:1px solid #e2e8f0}
.btn{display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:6px 12px;font-size:13px;white-space:nowrap}
.btn.big{padding:12px 20px;font-size:15px}.muted{color:#64748b;font-size:13px}details{margin-top:8px}summary{cursor:pointer;color:#4338ca;font-weight:600}
.flag{color:#b91c1c;font-weight:600}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
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

const pathOf=u=>{try{const x=new URL(u);return (x.pathname+x.search)||'/'}catch{return u}};
const nf=(lang,n,o={})=>n==null?'—':new Intl.NumberFormat(lang==='nl'?'nl-NL':lang==='es'?'es-ES':'en-GB',o).format(n);
const pct=(lang,n)=>n==null?'—':nf(lang,n,{style:'percent',maximumFractionDigits:2});
const pos=(lang,n)=>n==null?'—':nf(lang,n,{maximumFractionDigits:1});
const day=(lang,d)=>{try{return new Intl.DateTimeFormat(lang==='nl'?'nl-NL':lang==='es'?'es-ES':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d))}catch{return ''}};
function change(lang,n){if(n==null)return '';const c=n>0?'up':n<0?'down':'';return ` <span class="${c}">${n>0?'+':''}${pct(lang,n)}</span>`}

function metricRows(lang,t,list,{name='name',flag=true}={}){
 if(!list||!list.length)return `<p class="muted">${esc(t.none)}</p>`;
 return `<div class="scroll"><table class="tbl"><thead><tr><th>${esc(t.name)}</th><th class="num">${esc(t.clicks)}</th><th class="num">${esc(t.impressions)}</th><th class="num">CTR</th><th class="num">${esc(t.position)}</th></tr></thead><tbody>`+
  list.map(x=>`<tr><td>${esc(x[name])}${flag&&x.flag?` <span class="flag">· ${esc(t.flag_no_clicks)}</span>`:''}</td><td class="num">${nf(lang,x.clicks)}</td><td class="num">${nf(lang,x.impressions)}</td><td class="num">${pct(lang,x.ctr!=null?x.ctr:(x.impressions?x.clicks/x.impressions:null))}</td><td class="num">${pos(lang,x.position)}</td></tr>`).join('')+
  '</tbody></table></div>';
}
function growthLink(p,{lang,owner,invite,growthPath}){
 if(!owner&&!invite)return '';
 const q=p.queries&&p.queries[0]&&p.queries[0].query;
 const href=growthPath+'?'+(owner?'':'invite='+enc(invite)+'&')+'url='+enc(p.url)+(q?'&query='+enc(q):'')+'&lang='+enc(lang);
 return `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(T[lang].research)}</a>`;
}

function reportPage(row,{owner,config,growthPath}){
 const lang=LANGS.includes(row.lang)?row.lang:'en',t=T[lang],r=row.report||{},k=r.kpis||{},invite=row.growth_invite||null;
 const work=(r.pages||[]).filter(p=>p.action!=='KEEP'),keep=(r.pages||[]).filter(p=>p.action==='KEEP');
 const first=work[0];
 const contact=config.contactUrl||'https://contentscale.site/contact/';
 const head=`<div class="top"><div class="wrap"><div class="brand"><small>${esc(config.brand||'ContentScale')} · ${esc(t.kicker)}</small>
  ${config.authorName?`<div class="who">${config.authorImage?`<img src="${esc(config.authorImage)}" alt="${esc(config.authorName)}" width="52" height="52">`:''}<div><b>${esc(config.authorName)}</b><br><span class="meta">${esc(t.prepared_by)}</span></div></div>`:''}</div>
  <h1>${esc(row.title)}</h1><div class="meta">${esc(r.site||'')}${k.period?' · '+esc(day(lang,k.period.start))+' – '+esc(day(lang,k.period.end))+' ('+k.period.days+' '+esc(t.days)+')':''} · ${esc(t.made_on)} ${esc(day(lang,row.created_at))}${r.scope==='UPLOADED_PAGES'?' · '+esc(t.scope_pages):''}</div></div></div>`;
 const summary=`<div class="card"><h2>${esc(t.summary)}</h2><p>${esc(t.summary_line.replace('{n}',nf(lang,(r.pages||[]).length)).replace('{w}',nf(lang,work.length)))}${first?' '+esc(t.start_with)+' <b class="url">'+esc(first.url)+'</b> — '+esc(t.actions[first.action]):''}</p></div>`;
 const kpis=`<div class="kpis">
  <div class="kpi"><span>${esc(t.clicks)}</span><b>${nf(lang,k.clicks)}</b>${r.trend?`<span>${esc(t.last7)}${change(lang,r.trend.clicks_change)}</span>`:''}</div>
  <div class="kpi"><span>${esc(t.impressions)}</span><b>${nf(lang,k.impressions)}</b>${r.trend?`<span>${esc(t.last7)}${change(lang,r.trend.impressions_change)}</span>`:''}</div>
  <div class="kpi"><span>CTR</span><b>${pct(lang,k.ctr)}</b></div>
  <div class="kpi"><span>${esc(t.avg_position)}</span><b>${pos(lang,k.position)}</b></div>
  <div class="kpi"><span>${esc(t.pages_no_clicks)}</span><b>${nf(lang,k.zero_click_pages)}</b></div>
  <div class="kpi"><span>${esc(t.top5_share)}</span><b>${pct(lang,k.top5_click_share)}</b></div></div>
  <p class="muted">${esc(k.source==='DAILY_ROWS'?t.totals_daily:t.totals_pages)}${r.trend?' '+esc(t.trend_note.replace('{a}',nf(lang,r.trend.last7.clicks)).replace('{b}',nf(lang,r.trend.previous7.clicks))):''}</p>`;
 const pageRow=p=>`<tr><td class="num">${p.rank}</td><td class="pcell"><a class="url" href="${esc(p.url)}" title="${esc(p.url)}" target="_blank" rel="noopener nofollow">${esc(pathOf(p.url))}</a><br><span class="badge ${esc(p.action)}">${esc(t.actions[p.action])}</span>
   <div class="muted">${esc(t.todo[p.action])}${p.note?' · '+esc(p.note):''}${p.source==='MANUAL'?' · '+esc(t.manual):''}</div>
   ${p.queries&&p.queries.length?`<details><summary>${esc(t.page_queries)} (${p.queries.length})</summary>${metricRows(lang,t,p.queries,{name:'query',flag:false})}</details>`:''}
   ${p.countries&&p.countries.length?`<details><summary>${esc(t.countries)}</summary>${metricRows(lang,t,p.countries)}</details>`:''}
   ${p.devices&&p.devices.length?`<details><summary>${esc(t.devices)}</summary>${metricRows(lang,t,p.devices)}</details>`:''}
   ${p.trend?`<div class="muted">${esc(t.last7)}: ${nf(lang,p.trend.last7.clicks)} ${esc(t.clicks_l)}${change(lang,p.trend.clicks_change)}</div>`:''}</td>
   <td class="num" data-l="${esc(t.clicks)}">${nf(lang,p.clicks)}</td><td class="num" data-l="${esc(t.impressions)}">${nf(lang,p.impressions)}</td><td class="num" data-l="CTR">${pct(lang,p.ctr)}</td><td class="num" data-l="${esc(t.position)}">${pos(lang,p.position)}</td>
   <td class="num" data-l="${esc(t.median_ctr)}">${p.median_ctr!=null?pct(lang,p.median_ctr):'<span class="muted">'+esc(p.basis==='NO_DATA'?'—':t.too_few)+'</span>'}</td><td class="num" data-l="${esc(t.click_gap)}">${p.click_gap?'+'+nf(lang,p.click_gap):'—'}</td>
   <td class="gcell">${growthLink(p,{lang,owner,invite,growthPath})}</td></tr>`;
 const table=list=>`<div class="scroll"><table class="tbl ptbl"><thead><tr><th>#</th><th>${esc(t.page)}</th><th class="num">${esc(t.clicks)}</th><th class="num">${esc(t.impressions)}</th><th class="num">CTR</th><th class="num">${esc(t.position)}</th><th class="num">${esc(t.median_ctr)}</th><th class="num">${esc(t.click_gap)}</th><th></th></tr></thead><tbody>${list.map(pageRow).join('')}</tbody></table></div>`;
 const order=`<div class="card"><h2>${esc(t.order_title)}</h2><p class="muted">${esc(t.order_intro)}</p>${work.length?table(work):`<p>${esc(t.nothing_to_do)}</p>`}
  ${keep.length?`<details><summary>${esc(t.keep_title)} (${keep.length})</summary>${table(keep)}</details>`:''}</div>`;
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
  <h3>${esc(t.method_title)}</h3><p class="muted">${esc(t.method)}</p><h3>${esc(t.notes_title)}</h3><ul class="muted">${(r.notes||[]).map(n=>'<li>'+esc(t.note_map[n]||n)+'</li>').join('')}</ul></div>`;
 const cta=`<div class="card cta"><h2>${esc(t.cta_title)}</h2><p>${esc(t.cta_text)}</p><p><a class="btn big" href="${esc(contact)}" target="_blank" rel="noopener">${esc(t.cta_button)}</a></p></div>`;
 const foot=`<p class="foot">${esc(t.valid_until)} ${esc(day(lang,row.expires_at))} · ${esc(config.brand||'ContentScale')}${owner?' · '+esc(t.owner_view)+' · '+nf(lang,row.views)+' '+esc(t.views):''}</p>`;
 return shell(lang,row.title,head+`<div class="wrap">${summary}${kpis}${order}${bands}${queries}${geo}${files}${cta}${foot}</div>`);
}

function ownerPage(config,api,base){
 return shell('en','Search Console reports',`<div class="top"><div class="wrap"><small style="opacity:.8;letter-spacing:.08em;text-transform:uppercase;font-weight:700">ContentScale · Owner</small><h1>Search Console reports</h1>
<div class="meta">Upload the Search Console export of any site, add pages by hand, and send the company a private link. Signed in as owner.</div></div></div>
<div class="wrap"><div class="card"><h2>New report</h2>
<form id="nf"><div class="grid2"><label>Title<br><input id="title" required maxlength="160" placeholder="Acme Roofing — Search Console, November 2026" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label>
<label>Site (optional)<br><input id="site" maxlength="200" placeholder="acme-roofing.com" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label>
<label>Report language<br><select id="lang" style="padding:9px;border-radius:8px"><option value="en">English</option><option value="nl">Nederlands</option><option value="es">Español</option></select></label>
<label>Link valid for (days)<br><input id="days" type="number" min="1" max="365" value="90" style="padding:9px;border:1px solid #cbd5e1;border-radius:8px"></label></div>
<h3>Search Console files</h3><p class="muted">Search Console → Performance → Export → Download CSV (ZIP). Add as many as you like: one export of the whole site, exports filtered on one page (their search terms are linked to that page), or a CSV with a page and a search-term column. Each file at most 5 MB.</p>
<input id="gscFiles" type="file" multiple accept=".zip,.csv,.tsv,.txt">
<h3>Pages added by hand</h3><p class="muted">One per line: URL ; clicks ; impressions ; position ; note. Only the URL is required. A page that is also in the export keeps the numbers of the export.</p>
<textarea id="manual" rows="5" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px" placeholder="https://acme-roofing.com/new-service/ ;;;; New service, not in Search Console yet"></textarea>
<h3>Free Growth for the recipient</h3><label><input type="checkbox" id="growthOn"> Let the company research pages in Free Growth from the report</label>
<label style="margin-left:12px">checks <input id="growthChecks" type="number" min="1" max="20" value="3" style="width:70px;padding:6px;border:1px solid #cbd5e1;border-radius:8px"></label>
<p class="muted">An invitation is made with this number of checks; it ends with the report. Without it, the company sees your contact button; you always see a Free Growth link per page.</p>
<p><button class="btn big" type="submit" id="go">Make the report</button> <span id="st" class="muted" role="status"></span></p></form>
<div id="made"></div></div>
<div class="card"><h2>Your reports</h2><div id="list" class="muted">Loading…</div></div></div>
<script>
var API=${JSON.stringify(api)},BASE=${JSON.stringify(base)};
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function read(f){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok({name:f.name,content_base64:String(r.result).split(',')[1]||''})};r.onerror=no;r.readAsDataURL(f)})}
function manual(){return document.getElementById('manual').value.split('\\n').map(function(l){var p=l.split(';').map(function(x){return x.trim()});
 return p[0]?{url:p[0],clicks:p[1]||null,impressions:p[2]||null,position:p[3]||null,note:p.slice(4).join(';')||null}:null}).filter(Boolean)}
async function load(){var el=document.getElementById('list');try{var r=await fetch(API+'/reports',{credentials:'same-origin',cache:'no-store'});var d=await r.json();if(!d.success)throw Error(d.error);
 if(!d.reports.length){el.textContent='No reports yet.';return}
 el.innerHTML='<div class="scroll"><table class="tbl"><thead><tr><th>Title</th><th>Site</th><th>Made</th><th>Valid until</th><th class="num">Views</th><th>Status</th><th></th></tr></thead><tbody>'+d.reports.map(function(x){
  var live=!x.revoked&&!x.expired,full=location.origin+x.url;
  return '<tr><td>'+h(x.title)+(x.growth?' <span class="badge QUICK_WIN">Free Growth</span>':'')+'</td><td>'+h(x.site)+'</td><td>'+h(String(x.created_at).slice(0,10))+'</td><td>'+h(String(x.expires_at).slice(0,10))+'</td><td class="num">'+h(x.views)+'</td><td>'+(x.revoked?'Withdrawn':x.expired?'Expired':'Active')+'</td><td>'+
   (live?'<a class="btn" href="'+h(x.url)+'" target="_blank" rel="noopener">Open</a> <button class="btn" data-copy="'+h(full)+'">Copy link</button> <button class="btn" style="background:#b91c1c" data-revoke="'+h(x.id)+'">Withdraw</button>':'')+'</td></tr>'}).join('')+'</tbody></table></div>';
 el.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.getAttribute('data-copy'));b.textContent='Copied'}});
 el.querySelectorAll('[data-revoke]').forEach(function(b){b.onclick=async function(){if(!confirm('Withdraw this link? The company can no longer open the report.'))return;
  await fetch(API+'/reports/'+b.getAttribute('data-revoke')+'/revoke',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:'{}'});load()}})}
 catch(e){el.textContent='Could not load the reports: '+e.message}}
document.getElementById('nf').onsubmit=async function(e){e.preventDefault();var st=document.getElementById('st'),go=document.getElementById('go'),files=[].slice.call(document.getElementById('gscFiles').files);
 if(files.some(function(f){return f.size>5*1024*1024})){st.textContent='A file is larger than 5 MB.';return}
 if(files.reduce(function(a,f){return a+f.size},0)>7*1024*1024){st.textContent='Together the files are larger than 7 MB: make two reports.';return}
 go.disabled=true;st.textContent='Reading the files and calculating…';
 try{var body={title:document.getElementById('title').value,site:document.getElementById('site').value,lang:document.getElementById('lang').value,expires_days:document.getElementById('days').value,
  files:await Promise.all(files.map(read)),manual_pages:manual(),recipient_growth:{enabled:document.getElementById('growthOn').checked,checks:document.getElementById('growthChecks').value}};
  var r=await fetch(API+'/reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'gsc-report'},body:JSON.stringify(body)});
  var d=await r.json();if(!d.success)throw Error(d.error);var full=location.origin+d.url;
  st.textContent='Report made: '+d.pages+' pages.';
  document.getElementById('made').innerHTML='<div class="card cta"><b>Private link for the company</b><p class="url">'+h(full)+'</p><p><a class="btn big" href="'+h(d.url)+'" target="_blank" rel="noopener">Open the report</a> <button class="btn big" id="cp">Copy link</button></p><p class="muted">'+
   d.files.map(function(f){return h(f.name)+': '+h(f.kind)+(f.reason?' ('+h(f.reason)+')':'')}).join(' · ')+'</p></div>';
  document.getElementById('cp').onclick=function(){navigator.clipboard.writeText(full);this.textContent='Copied'};load()}
 catch(err){st.textContent=err.message}finally{go.disabled=false}};
load();
</script>`);
}
module.exports={registerGscReport,reportPage};
