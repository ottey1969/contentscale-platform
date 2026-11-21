'use strict';
// GSC report (owner 2026-11-20): the Search Console export of any site, plus pages added by hand, turned into the order in
// which to work on the pages and the KPIs around it. Everything shown comes from the uploaded files or the owner's own
// entry. The comparison is this site's own median CTR per position band (pages that earn clicks); no outside CTR curve.
// A "click gap" is arithmetic on the site's own numbers, never a forecast. What cannot be linked to a page (site-wide
// search terms, countries, devices, the daily trend) is shown as such.
const {unzip,parseCsv}=require('../growth-free/gsc-export.cjs');

const MAX_FILE_BYTES=5*1024*1024,MAX_FILES=25,MAX_ROWS=1000;
const MIN_COMPARE_IMPRESSIONS=10,MIN_COMPARE_PAGES=3,ZERO_CLICK_IMPRESSIONS=50;

const int=v=>{const n=Number(String(v==null?'':v).replace(/[^\d]/g,''));return Number.isFinite(n)?n:0};
function dec(v){
 let t=String(v==null?'':v).replace(/[%\s]/g,'');if(!t)return null;
 if(t.includes(',')&&t.includes('.'))t=t.lastIndexOf(',')>t.lastIndexOf('.')?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');
 else t=t.replace(',','.');
 const n=Number(t);return Number.isFinite(n)?n:null;
}
const isNumberRow=r=>r.length>=3&&/\d/.test(r[1]||'')&&/\d/.test(r[2]||'');
const row=(name,r,idx={c:1,i:2,p:4})=>({name:String(name||'').trim().slice(0,500),clicks:int(r[idx.c]),impressions:int(r[idx.i]),position:idx.p==null?null:dec(r[idx.p])});
function normUrl(u){try{const x=new URL(String(u||'').trim());return (x.protocol+'//'+x.hostname.replace(/^www\./,'')+(x.pathname.replace(/\/+$/,'')||'')).toLowerCase()}catch{return ''}}
const hostOf=u=>{try{return new URL(String(u).trim()).hostname.replace(/^www\./,'').toLowerCase()}catch{return ''}};

// Which CSV is which, by file name in the languages Search Console exports.
const KIND=[['queries',/quer|zoekopdracht|suchanfrage|consulta|requête|requete|sorgu/i],['pages',/^pages?\.csv$|pagina|seiten|páginas|pagine/i],
 ['countries',/countr|land|länder|pa[ií]s|pays|paesi/i],['devices',/device|apparat|ger[aä]t|dispositi|appareil/i],
 ['dates',/date|datum|fecha|tarih|chart|grafiek|diagram|grafik|gr[aá]fico|graphique/i],['filters',/filter|filtr/i],['appearance',/appearance|weergave|darstellung|aspecto|apparence/i]];
function classify(files){const by={};for(const n of Object.keys(files)){const k=KIND.find(([,re])=>re.test(n));if(k&&!by[k[0]])by[k[0]]=files[n]}return by}
const rowsOf=text=>parseCsv(text).filter(isNumberRow).slice(0,MAX_ROWS);
// An exact page filter in Filters.csv ("Page" / "Pagina" / "Página" with one URL, not "contains").
function pageFilter(text){
 for(const r of parseCsv(text||'')){
  const line=r.join(' ');if(!/(page|pagina|página|seite)/i.test(r[0]||''))continue;
  if(/contain|bevat|enthält|contiene|contient|not|niet|nicht|regex|custom|aangepast/i.test(line))continue;
  const m=line.match(/https?:\/\/[^\s"',;]+/);if(m)return m[0];
 }
 return null;
}
// A CSV with a page column and a search-term column (Looker Studio, the Search Console API, a spreadsheet).
function pairColumns(header){
 const h=header.map(x=>String(x||'').toLowerCase());
 const find=re=>h.findIndex(x=>re.test(x));
 const page=find(/landing|^page|^url|pagina|página|^address/),query=find(/query|zoek|consulta|keyword|suchanfrage|requête/);
 const c=find(/click|klik|clic/),i=find(/impression|vertoning|impresion|impressionen/),p=find(/position|positie|posici|pos\b/);
 return page>=0&&query>=0&&c>=0&&i>=0?{page,query,c,i,p:p>=0?p:null}:null;
}

function readUploads(list){
 const out={sitewide:{pages:[],queries:[],countries:[],devices:[],dates:[],appearance:[],filters:null},perPage:[],pairs:[],files:[]};
 let haveSitewide=false;
 for(const f of (Array.isArray(list)?list:[]).slice(0,MAX_FILES)){
  const name=String(f&&f.name||'file').slice(0,120);
  let buf;try{buf=Buffer.from(String(f&&f.content_base64||''),'base64')}catch{buf=Buffer.alloc(0)}
  const note=(kind,reason)=>out.files.push({name,kind,...(reason?{reason}:{})});
  if(!buf.length){note('NOT_READ','empty file');continue}
  if(buf.length>MAX_FILE_BYTES){note('NOT_READ','larger than 5 MB');continue}
  const isZip=/\.zip$/i.test(name)||buf.readUInt32LE(0)===0x04034b50;
  if(isZip){
   let files;try{files=unzip(buf)}catch{note('NOT_READ','not a Search Console ZIP');continue}
   const p=classify(files),page=pageFilter(p.filters);
   if(page){
    const pr=rowsOf(p.pages).map(r=>row(r[0],r)).find(x=>normUrl(x.name)===normUrl(page));
    out.perPage.push({page,queries:rowsOf(p.queries).map(r=>row(r[0],r)).map(x=>({query:x.name,clicks:x.clicks,impressions:x.impressions,position:x.position})),
     ...(pr?{metrics:{clicks:pr.clicks,impressions:pr.impressions,position:pr.position}}:{}),
     countries:rowsOf(p.countries).map(r=>row(r[0],r)),devices:rowsOf(p.devices).map(r=>row(r[0],r)),
     dates:rowsOf(p.dates).map(r=>row(r[0],r)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name))});
    note('PAGE_FILTERED');continue}
   if(!p.pages&&!p.queries){note('NOT_READ','no pages or search terms in this ZIP');continue}
   if(haveSitewide){note('NOT_READ','a second site-wide export: only the first one is used');continue}
   haveSitewide=true;const s=out.sitewide;
   s.pages=rowsOf(p.pages).map(r=>row(r[0],r)).filter(x=>/^https?:\/\//i.test(x.name)).map(x=>({url:x.name,clicks:x.clicks,impressions:x.impressions,position:x.position}));
   s.queries=rowsOf(p.queries).map(r=>row(r[0],r)).map(x=>({query:x.name,clicks:x.clicks,impressions:x.impressions,position:x.position}));
   s.countries=rowsOf(p.countries).map(r=>row(r[0],r));s.devices=rowsOf(p.devices).map(r=>row(r[0],r));
   s.appearance=rowsOf(p.appearance).map(r=>row(r[0],r));
   s.dates=rowsOf(p.dates).map(r=>row(r[0],r)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
   s.filters=parseCsv(p.filters||'').filter(r=>!/^(filter|filtro|filtre)$/i.test(String(r[0]||'').trim())).slice(0,20).map(r=>r.join(': '));
   note('SITEWIDE');continue;
  }
  if(!/\.(csv|tsv|txt)$/i.test(name)&&!/[,;\t]/.test(buf.slice(0,200).toString('utf8'))){note('NOT_READ','not a CSV or ZIP');continue}
  const all=parseCsv(buf.toString('utf8'));const head=all[0]||[];
  const pc=pairColumns(head);
  if(pc){for(const r of all.slice(1,MAX_ROWS+1)){if(!/^https?:\/\//i.test(r[pc.page]||''))continue;
    out.pairs.push({page:r[pc.page].trim(),query:String(r[pc.query]||'').trim().slice(0,300),...row('',r,pc)});}
   out.pairs.forEach(x=>delete x.name);note('PAGE_QUERY_PAIRS');continue}
  const first=String(head[0]||'').toLowerCase();
  if(!haveSitewide&&/page|pagina|página|seite/.test(first)){haveSitewide=true;out.sitewide.pages=rowsOf(buf.toString('utf8')).map(r=>row(r[0],r)).filter(x=>/^https?:\/\//i.test(x.name)).map(x=>({url:x.name,clicks:x.clicks,impressions:x.impressions,position:x.position}));note('SITEWIDE');continue}
  if(!out.sitewide.queries.length&&/quer|zoek|consulta|suchanfrage|requête/.test(first)){out.sitewide.queries=rowsOf(buf.toString('utf8')).map(r=>row(r[0],r)).map(x=>({query:x.name,clicks:x.clicks,impressions:x.impressions,position:x.position}));note('SITEWIDE');continue}
  note('NOT_READ','columns not recognised');
 }
 return out;
}

const BANDS=[['1-3',0,3],['4-10',3,10],['11-20',10,20],['21-40',20,40],['40+',40,Infinity]];
const bandOf=p=>p==null?null:(BANDS.find(([,a,b])=>p>a&&p<=b)||BANDS[0])[0];
const ctrOf=x=>x.impressions?x.clicks/x.impressions:null;
const r4=n=>n==null?null:Math.round(n*10000)/10000;
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
const wpos=list=>{const w=list.filter(x=>x.position!=null&&x.impressions);const t=w.reduce((a,x)=>a+x.impressions,0);return t?Math.round(w.reduce((a,x)=>a+x.position*x.impressions,0)/t*10)/10:null};
const QUESTION=/^\s*(how|what|why|when|where|which|who|can|does|do|is|are|should|hoe|wat|waarom|wanneer|waar|welke|wie|kan|c[oó]mo|qu[eé]|por qu[eé]|cu[aá]ndo|d[oó]nde|cu[aá]l|cu[aá]nto|qui[eé]n)\b|\?\s*$/i;
const flagged=x=>({...x,ctr:r4(ctrOf(x)),...(x.clicks===0&&x.impressions>=ZERO_CLICK_IMPRESSIONS?{flag:'IMPRESSIONS_NO_CLICKS'}:{})});
function trendOf(dates){
 if(!dates||dates.length<14)return null;
 const l=dates.slice(-7),pv=dates.slice(-14,-7),sum=(a,k)=>a.reduce((n,x)=>n+x[k],0),ch=(a,b)=>b?r4(a/b-1):null;
 const t={last7:{clicks:sum(l,'clicks'),impressions:sum(l,'impressions')},previous7:{clicks:sum(pv,'clicks'),impressions:sum(pv,'impressions')}};
 t.clicks_change=ch(t.last7.clicks,t.previous7.clicks);t.impressions_change=ch(t.last7.impressions,t.previous7.impressions);return t;
}
// Rows with the same name (a country in two page exports) added up.
function sumByName(lists){const m=new Map();for(const l of lists)for(const x of l||[]){const k=x.name;const o=m.get(k)||{name:k,clicks:0,impressions:0,_w:0,_wi:0};
 o.clicks+=x.clicks;o.impressions+=x.impressions;if(x.position!=null&&x.impressions){o._w+=x.position*x.impressions;o._wi+=x.impressions}m.set(k,o)}
 return [...m.values()].map(({_w,_wi,...o})=>({...o,position:_wi?Math.round(_w/_wi*10)/10:null}))}
const ORDER={QUICK_WIN:1,SNIPPET:2,ZERO_CLICKS:3,GONE:4,BLOCKED:5,REVIEW:6,DEEPER:7,FIX_SNIPPET:8,FIX_STRUCTURE:9,FIX_HREFLANG:10,THIN:11,REDIRECT:12,NO_DATA:13,NO_ISSUES:14,KEEP:15};
const sortPages=list=>{list.sort((a,b)=>ORDER[a.action]-ORDER[b.action]||(b.click_gap||0)-(a.click_gap||0)||(b.impressions||0)-(a.impressions||0)||(b.clicks||0)-(a.clicks||0)||((b.audit&&b.audit.issues.length)||0)-((a.audit&&a.audit.issues.length)||0));list.forEach((p,i)=>p.rank=i+1)};

function analyze({uploads,manualPages=[],site=''}={}){
 const up=uploads||{sitewide:{pages:[],queries:[],countries:[],devices:[],dates:[]},perPage:[],pairs:[],files:[]};
 const pages=new Map();
 const add=(url,data)=>{const k=normUrl(url);if(!k)return null;if(!pages.has(k))pages.set(k,{url:String(url).trim(),queries:[],...data});return pages.get(k)};
 for(const p of up.sitewide.pages)add(p.url,{clicks:p.clicks,impressions:p.impressions,position:p.position,source:'EXPORT'});
 const attach=(url,qs,source,extra={})=>{
  let p=pages.get(normUrl(url));
  if(!p){const m=extra.metrics||{clicks:qs.reduce((a,x)=>a+x.clicks,0),impressions:qs.reduce((a,x)=>a+x.impressions,0),position:wpos(qs)};p=add(url,{...m,source})}
  if(!p)return;
  if(extra.countries&&extra.countries.length)p.countries=extra.countries.map(flagged).sort((a,b)=>b.impressions-a.impressions);
  if(extra.devices&&extra.devices.length)p.devices=extra.devices.map(flagged).sort((a,b)=>b.impressions-a.impressions);
  if(extra.dates&&extra.dates.length>=14)p.trend=trendOf(extra.dates);
  const seen=new Set(p.queries.map(q=>q.query.toLowerCase()));
  for(const q of qs)if(q.query&&!seen.has(q.query.toLowerCase())){seen.add(q.query.toLowerCase());p.queries.push({query:q.query,clicks:q.clicks,impressions:q.impressions,position:q.position})}
 };
 for(const pp of up.perPage)attach(pp.page,pp.queries,'PAGE_EXPORT',pp);
 const byPage=new Map();for(const x of up.pairs){const k=x.page;if(!byPage.has(k))byPage.set(k,[]);byPage.get(k).push(x)}
 for(const [pg,qs] of byPage)attach(pg,qs,'PAGE_QUERY_EXPORT');
 for(const m of (Array.isArray(manualPages)?manualPages:[]).slice(0,400)){
  const url=String(m&&m.url||'').trim();if(!/^https?:\/\//i.test(url))continue;
  const have=pages.get(normUrl(url));
  if(have){if(m.note)have.note=String(m.note).slice(0,300);have.manual=true;continue}
  const num=v=>v===''||v==null?null:Number(v);
  const clicks=num(m.clicks),impressions=num(m.impressions),position=num(m.position);
  add(url,{clicks:Number.isFinite(clicks)?clicks:null,impressions:Number.isFinite(impressions)?impressions:null,position:Number.isFinite(position)?position:null,source:m.source==='CRAWL'?'CRAWL':'MANUAL',
   ...(m.note?{note:String(m.note).slice(0,300)}:{})});
 }
 const list=[...pages.values()];
 for(const p of list){p.queries.sort((a,b)=>b.impressions-a.impressions);p.queries=p.queries.slice(0,50);p.band=bandOf(p.position);p.ctr=p.impressions?r4(p.clicks/p.impressions):null}
 // This site's own median CTR per band: pages with enough impressions that earn clicks; at least three of them.
 const bandMedian={};
 for(const [b] of BANDS){const sample=list.filter(p=>p.band===b&&p.impressions>=MIN_COMPARE_IMPRESSIONS&&p.clicks>0).map(ctrOf);bandMedian[b]=sample.length>=MIN_COMPARE_PAGES?median(sample):null}
 for(const p of list){
  const med=p.band?bandMedian[p.band]:null,ctr=p.impressions?p.clicks/p.impressions:null;
  p.median_ctr=r4(med);p.basis=!p.impressions?'NO_DATA':med==null?'TOO_FEW_PAGES_TO_COMPARE':'SITE_MEDIAN_CTR';
  p.click_gap=med==null||ctr==null?null:Math.max(0,Math.round(p.impressions*med-p.clicks));
  if(!p.impressions)p.action='NO_DATA';
  else if(p.clicks===0&&p.impressions>=ZERO_CLICK_IMPRESSIONS)p.action='ZERO_CLICKS';
  else if(p.band==='4-10'||p.band==='11-20')p.action=med==null?'REVIEW':ctr<med?'QUICK_WIN':'KEEP';
  else if(p.band==='1-3')p.action=med!=null&&ctr<med?'SNIPPET':'KEEP';
  else p.action=p.band?'DEEPER':'REVIEW';
 }
 sortPages(list);

 const sw=up.sitewide,hasSite=!!(sw.pages.length||sw.queries.length||sw.dates.length);
 // Without a site-wide export the report covers the uploaded pages: their countries, devices and days added up.
 const s=hasSite?sw:{...sw,countries:sumByName(up.perPage.map(p=>p.countries)),devices:sumByName(up.perPage.map(p=>p.devices)),
  dates:sumByName(up.perPage.map(p=>p.dates)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name))};
 const scope=hasSite?'SITE':'UPLOADED_PAGES',hostCount={};
 for(const p of list){const h=hostOf(p.url);if(h)hostCount[h]=(hostCount[h]||0)+1}
 const siteHost=hostOf(/^https?:/i.test(site)?site:site?'https://'+site:'')||Object.entries(hostCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
 // Totals: the daily rows when present (they include anonymised traffic); otherwise the sum of the pages.
 const withData=list.filter(p=>p.impressions);
 const kp=s.dates.length?{clicks:s.dates.reduce((a,x)=>a+x.clicks,0),impressions:s.dates.reduce((a,x)=>a+x.impressions,0),position:wpos(s.dates),source:'DAILY_ROWS'}
  :{clicks:withData.reduce((a,x)=>a+x.clicks,0),impressions:withData.reduce((a,x)=>a+x.impressions,0),position:wpos(withData),source:'PAGES_SUM'};
 const pageClicks=withData.reduce((a,x)=>a+x.clicks,0);
 const top5=[...withData].sort((a,b)=>b.clicks-a.clicks).slice(0,5).reduce((a,x)=>a+x.clicks,0);
 const kpis={...kp,ctr:kp.impressions?r4(kp.clicks/kp.impressions):null,pages:list.length,pages_with_data:withData.length,
  zero_click_pages:withData.filter(p=>p.clicks===0).length,top5_click_share:pageClicks?r4(top5/pageClicks):null,
  period:s.dates.length?{start:s.dates[0].name,end:s.dates[s.dates.length-1].name,days:s.dates.length}:null};
 const trend=trendOf(s.dates);
 const bands=BANDS.map(([b])=>{const ps=withData.filter(p=>p.band===b);return {band:b,pages:ps.length,clicks:ps.reduce((a,x)=>a+x.clicks,0),impressions:ps.reduce((a,x)=>a+x.impressions,0),median_ctr:r4(bandMedian[b]),
  compared_pages:ps.filter(p=>p.impressions>=MIN_COMPARE_IMPRESSIONS&&p.clicks>0).length}});
 // Site-wide search terms: not linked to a page in this export.
 const label=(siteHost.split('.')[0]||'').toLowerCase(),brandWhole=label.replace(/[^a-z0-9]/g,''),brandPart=label.split('-')[0];
 const isBrand=q=>{const c=q.toLowerCase().replace(/[^a-z0-9]/g,'');return !!brandWhole&&(c.includes(brandWhole)||(brandPart.length>=4&&new RegExp('\\b'+brandPart+'\\b','i').test(q)))};
 const pageQ=hasSite?[]:sumByName(list.map(p=>p.queries.map(q=>({...q,name:q.query})))).map(({name,...x})=>({query:name,...x}));
 const Q=(hasSite?s.queries:pageQ).map(q=>({...q,ctr:r4(ctrOf(q))}));
 const queries={not_linked:hasSite&&Q.length>0,from_pages:!hasSite&&Q.length>0,total:Q.length,
  brand:Q.filter(q=>isBrand(q.query)),
  non_brand_clicks:Q.filter(q=>!isBrand(q.query)).reduce((a,x)=>a+x.clicks,0),brand_clicks:Q.filter(q=>isBrand(q.query)).reduce((a,x)=>a+x.clicks,0),
  questions:Q.filter(q=>QUESTION.test(q.query)).sort((a,b)=>b.impressions-a.impressions).slice(0,25),
  near_top:Q.filter(q=>!isBrand(q.query)&&q.position!=null&&q.position>3&&q.position<=15).sort((a,b)=>b.impressions-a.impressions).slice(0,25),
  zero_click:Q.filter(q=>q.clicks===0&&q.impressions>=ZERO_CLICK_IMPRESSIONS).sort((a,b)=>b.impressions-a.impressions).slice(0,25),
  top:[...Q].sort((a,b)=>b.impressions-a.impressions).slice(0,50)};
 const countries=s.countries.map(flagged).sort((a,b)=>b.impressions-a.impressions);
 const devices=s.devices.map(flagged).sort((a,b)=>b.impressions-a.impressions);
 const appearance=(s.appearance||[]).map(flagged);
 const notes=['Search Console leaves anonymised queries out of the search-term list, so the search terms add up to less than the totals.',
  'A Search Console export holds at most 1,000 rows per list.',
  ...(up.perPage.length||up.pairs.length?[]:['The site-wide export does not say which search term belongs to which page. Upload a page-filtered export, or a CSV with a page and a search-term column, to see the search terms per page.']),
  ...(s.dates.length?[]:['No daily rows in the upload: totals are the sum of the pages and there is no trend.'])];
 const method='The order puts first the pages on positions 4–20 whose CTR is below this site\'s own median CTR for that position band (the middle value of the pages in that band that earn clicks, at least three of them). The click gap is impressions × that median − clicks: a calculation on this site\'s own numbers, not a forecast. Then pages in the top 3 below the median (title and description), pages with impressions but no clicks, pages that need a closer look, pages beyond position 20, and pages without data. Pages at or above the median are kept as they are.';
 return {scope,site:siteHost,kpis,trend,bands,pages:list,queries,countries,devices,appearance,files:up.files,filters:s.filters||[],notes,method};
}
// Live status (from url-status.cjs) on the report: a URL that redirects is not a page to edit (its target is), a URL that
// answers 404/410 is gone while Google still shows it. A URL that could not be checked keeps its action and says why.
function applyUrlStatus(report,statuses){
 if(!statuses||!report||!Array.isArray(report.pages))return report;
 const byKey=new Map(report.pages.map(p=>[normUrl(p.url),p])),S=new Map([...statuses].map(([u,v])=>[normUrl(u),v]));
 let checked=0,notChecked=0,redirects=0,gone=0;
 for(const p of report.pages){
  const live=statuses.get(p.url)||S.get(normUrl(p.url));if(!live)continue;
  p.live={...live};
  if(live.error){notChecked++;continue}
  checked++;
  if(live.hops){redirects++;p.action='REDIRECT';p.click_gap=null}
  else if(live.status===404||live.status===410){gone++;p.action='GONE';p.click_gap=null}
 }
 sortPages(report.pages);
 for(const p of report.pages)if(p.live&&p.live.final_url){const t=byKey.get(normUrl(p.live.final_url));if(t&&t!==p)p.live.target_rank=t.rank}
 Object.assign(report.kpis,{urls_checked:checked,urls_not_checked:notChecked,redirects,gone});
 return report;
}
// What the public pages show (site-audit.cjs). A page Google is told not to index, or whose canonical points elsewhere,
// is fixed first whatever its numbers. A page without Search Console numbers gets its action from what its page shows.
// Without any Search Console data the report says so (scope CRAWL) and shows no clicks or impressions at all.
const SNIPPET_ISSUES=/^(TITLE|DESCRIPTION)_|^LANGUAGE_MISMATCH$/,STRUCTURE_ISSUES=/^(H1|SCHEMA)_/,HREFLANG_ISSUES=/^HREFLANG_/;
function applyAudit(report,crawl){
 if(!crawl||!report)return report;
 const counts={};let withIssues=0,withNotes=0,blocked=0;
 const A=new Map([...crawl.audits].map(([u,a])=>[normUrl(u),a])),M=new Map([...crawl.lastmod].map(([u,d])=>[normUrl(u),d]));
 for(const p of report.pages){
  const a=A.get(normUrl(p.url)),lm=M.get(normUrl(p.url));
  if(lm)p.lastmod=lm;
  if(!a)continue;
  p.audit=a;
  for(const c of a.issues)counts[c]=(counts[c]||0)+1;
  if(a.issues.length)withIssues++;
  if(a.notes&&a.notes.length)withNotes++;
  if(p.action==='REDIRECT'||p.action==='GONE')continue;
  if(a.issues.includes('NOINDEX')||a.issues.includes('CANONICAL_ELSEWHERE')){p.action='BLOCKED';blocked++;continue}
  if(p.action!=='NO_DATA')continue;
  p.action=a.issues.some(c=>SNIPPET_ISSUES.test(c))?'FIX_SNIPPET':a.issues.some(c=>STRUCTURE_ISSUES.test(c))?'FIX_STRUCTURE':a.issues.some(c=>HREFLANG_ISSUES.test(c))?'FIX_HREFLANG':a.issues.includes('THIN')?'THIN':'NO_ISSUES';
 }
 const gsc=(report.files||[]).some(f=>f.kind&&f.kind!=='NOT_READ')||report.pages.some(p=>p.source==='MANUAL'&&p.impressions!=null);
 if(!gsc){report.scope='CRAWL';report.notes=[];Object.assign(report.kpis,{clicks:null,impressions:null,ctr:null,position:null,zero_click_pages:null,top5_click_share:null,source:'NONE'});report.trend=null}
 sortPages(report.pages);
 report.kpis.audit={pages_read:crawl.audits.size,with_issues:withIssues,with_notes:withNotes,blocked,by_issue:counts};
 report.crawl={origin:crawl.origin,path:crawl.path||'/',max:crawl.max||150,...(crawl.render?{render:crawl.render}:{}),outside_path:crawl.outside_path||0,robots:crawl.robots,sitemap:crawl.sitemap,pages_listed:crawl.pages.length,pages_read:crawl.audits.size,
  not_crawled:crawl.not_crawled.slice(0,50),not_crawled_count:crawl.not_crawled.length,not_crawled_limit:crawl.not_crawled_limit,crawled_at:crawl.crawled_at};
 return report;
}
// Positions the owner asked for: on the page that ranks, and in their own table.
function applyPositions(report,positions){
 if(!report)return report;report.positions=positions||null;if(!positions)return report;
 const byKey=new Map(report.pages.map(p=>[normUrl(p.url),p]));
 for(const r of positions.rows||[]){if(!r.url)continue;const p=byKey.get(normUrl(r.url));r.in_list=!!p;if(p){(p.positions=p.positions||[]).push({keyword:r.keyword,position:r.position});r.rank=p.rank}}
 return report;
}
module.exports={readUploads,analyze,applyUrlStatus,applyAudit,applyPositions,normUrl,bandOf};
