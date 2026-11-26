'use strict';
// Owner 2026-11-22: "als er een GSC tussentijds wordt ingevoerd, dan is het goed om het verschil te zien … moet
// overzichtelijk zijn". A newer Search Console export is added to an existing report. Only pages with a Free Growth
// publication date get a before/after line, plus one summary card. Two periods of a different length, or a page missing in
// one export, are "not comparable": no number is shown for them.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {snapshot,compare}=require('../src/gsc-report/compare.cjs');
const {reportPage,registerGscReport}=require('../src/gsc-report/routes.cjs');
const A='https://nl.contentscale.site/ai-zichtbaarheid/',B='https://nl.contentscale.site/wat-is-een-ai-overview/',C='https://nl.contentscale.site/contact/';
const before={kpis:{period:{start:'2026-10-24',end:'2026-11-20',days:28}},pages:[
 {url:A,clicks:0,impressions:544,position:30.4},{url:B,clicks:0,impressions:1227,position:64.2},{url:C,clicks:4,impressions:90,position:8}]};
const afterSnap={period:{start:'2026-11-22',end:'2026-12-19',days:28},pages:[{url:A,clicks:3,impressions:700,position:22.1},{url:C,clicks:5,impressions:80,position:7}]};
const published=new Map([['https://nl.contentscale.site/ai-zichtbaarheid/','2026-11-21'],['https://nl.contentscale.site/wat-is-een-ai-overview/','2026-11-21']]);

test('compare: equal periods, only pages with a Growth date, a missing page is not comparable',()=>{
 const s=snapshot({kpis:{period:afterSnap.period},pages:afterSnap.pages.map(p=>({...p,queries:[{query:'x'}],audit:{}}))});
 assert.deepEqual(Object.keys(s.pages[0]).sort(),['clicks','impressions','position','url'],'only the numbers are kept');
 const c=compare(before,afterSnap,published);
 assert.equal(c.comparable,true);
 assert.equal(c.pages.length,2,'contact has no Growth date');
 const a=c.pages.find(p=>p.url===A);assert.deepEqual([a.status,a.before.clicks,a.after.clicks],['OK',0,3]);
 assert.equal(c.pages.find(p=>p.url===B).status,'MISSING');
 assert.deepEqual([c.totals.before.clicks,c.totals.after.clicks,c.totals.before.impressions,c.totals.after.impressions],[0,3,544,700],'totals only over comparable pages');
 const diff=compare(before,{...afterSnap,period:{start:'2026-11-22',end:'2026-12-05',days:14}},published);
 assert.equal(diff.comparable,false);assert.equal(diff.reason,'PERIOD_LENGTH');
 assert.equal(compare(before,{...afterSnap,period:null},published).reason,'PERIOD_UNKNOWN');
 assert.equal(compare(before,afterSnap,new Map()).pages.length,0);
});

test('report: one summary card and one line per updated page; not comparable says so without numbers',()=>{
 const row={title:'x',lang:'nl',created_at:new Date('2026-11-21'),expires_at:new Date(Date.now()+864e5),views:0,
  report:{...before,pages:before.pages.map((p,i)=>({...p,rank:i+1,action:'NO_CLICKS',ctr:0,basis:'TOO_FEW'})),after:afterSnap,bands:[],queries:{},files:[],notes:[]}};
 const html=reportPage(row,{owner:false,config:{},growthPath:'/free-growth',published});
 assert.match(html,/id="beforeAfter"/);assert.match(html,/Aangepaste pagina’s: 2/);
 assert.match(html,/Voor: 24 oktober 2026 – 20 november 2026 · Na: 22 november 2026 – 19 december 2026 \(beide 28 dagen\)/);
 assert.match(html,/Een verandering is geen bewijs dat de aanpassing de oorzaak is\./);
 const cell=u=>html.slice(html.indexOf('href="'+u+'"'),html.indexOf('</td>',html.indexOf('href="'+u+'"')));
 assert.match(cell(A),/class="ba">Voor: 0 klikken · 544 vertoningen · positie 30,4 → <b>Na: 3 klikken · 700 vertoningen · positie 22,1<\/b>/);
 assert.match(cell(B),/class="ba muted">Niet te vergelijken: deze pagina staat niet in beide exports/);
 assert.doesNotMatch(cell(C),/class="ba[" ]/);
 const short=reportPage({...row,report:{...row.report,after:{...afterSnap,period:{start:'2026-11-22',end:'2026-12-05',days:14}}}},{owner:false,config:{},growthPath:'/free-growth',published});
 assert.match(short,/Niet te vergelijken: de periodes zijn niet even lang \(28 en 14 dagen\)/);assert.doesNotMatch(short,/class="ba">Voor/);
 assert.doesNotMatch(reportPage({...row,report:{...row.report,after:undefined}},{owner:false,config:{},growthPath:'/free-growth',published}),/id="beforeAfter"/);
 assert.match(reportPage({...row,lang:'en'},{owner:false,config:{},growthPath:'/free-growth',published}),/Updated pages: 2/);
 assert.match(reportPage({...row,lang:'es'},{owner:false,config:{},growthPath:'/free-growth',published}),/Páginas actualizadas: 2/);
});

test('owner adds a newer export to an existing report; nobody else can',async t=>{
 const KEY='owner-admin-key-0123456789',rows=[];
 const storage={ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:rows.length+1,token:'tok'.padEnd(30,'y')+rows.length,title:o.title,site:o.site,lang:o.lang,report:o.report,created_at:new Date(),expires_at:new Date(Date.now()+864e5),revoked_at:null,views:0,growth_invite:null};rows.push(r);return r},
  openReport:async(_p,tk)=>rows.find(r=>r.token===tk)||null,listReports:async()=>rows,
  setAfter:async(_p,id,snap)=>{const r=rows.find(x=>x.id===Number(id));if(!r)return null;r.report={...r.report,after:snap};return {id:r.id}},
  publicationsFor:async()=>published};
 const app=express();app.use(express.json({limit:'10mb'}));registerGscReport(app,null,{storage,config:{adminKey:KEY},checkUrls:async()=>new Map()});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 const w={'Content-Type':'application/json','x-admin-key':KEY};
 // A Search Console export is one ZIP with Pages.csv and Dates.csv.
 const {zip}=require('./helpers/zip.cjs');
 const csv=(rows,dates)=>[{name:'export.zip',content_base64:zip({'Pages.csv':'Top pages,Clicks,Impressions,CTR,Position\n'+rows.map(r=>r.join(',')).join('\n'),
  'Dates.csv':'Date,Clicks,Impressions,CTR,Position\n'+dates.map(d=>d+',0,10,0%,30').join('\n')}).toString('base64')}];
 const days=(start,n)=>Array.from({length:n},(_,i)=>new Date(Date.parse(start)+i*864e5).toISOString().slice(0,10));
 const made=await (await fetch(base+'/api/gsc/reports',{method:'POST',headers:w,body:JSON.stringify({title:'nl',lang:'nl',files:csv([[A,0,544,'0%',30.4],[B,0,1227,'0%',64.2]],days('2026-10-24',28)),check_urls:false})})).json();
 assert.equal(made.success,true,JSON.stringify(made));
 const add=b=>fetch(base+'/api/gsc/reports/'+made.id+'/period',{method:'POST',headers:w,body:JSON.stringify(b)});
 assert.equal((await fetch(base+'/api/gsc/reports/'+made.id+'/period',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404,'owner only');
 assert.equal((await add({files:[]})).status,400);
 const ok=await (await add({files:csv([[A,3,700,'0.43%',22.1]],days('2026-11-22',28))})).json();
 assert.equal(ok.success,true,JSON.stringify(ok));assert.equal(ok.period.days,28);
 assert.deepEqual(rows[0].report.after.pages,[{url:A,clicks:3,impressions:700,position:22.1}]);
 const page=await (await fetch(base+made.url)).text();
 assert.match(page,/Aangepaste pagina’s: 2/);assert.match(page,/Na: 3 klikken/);
 const owner=await (await fetch(base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 assert.match(owner,/data-period=/);assert.match(owner,/Add a newer period/);
 for(const m of owner.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
});

test('missing comparison measures stay unknown while a real zero remains visible',()=>{
 const baseline={...before,pages:[{url:A,clicks:null,impressions:10,position:null}]};
 const after={...afterSnap,pages:[{url:A,clicks:0,impressions:null,position:22}]};
 const result=compare(baseline,after,published);
 assert.equal(result.pages[0].before.clicks,null);
 assert.equal(result.pages[0].after.clicks,0);
 assert.equal(result.totals.before.clicks,null);
 assert.equal(result.totals.after.impressions,null);
 assert.equal(result.totals.before.position,null);
});
