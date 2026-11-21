'use strict';
// Owner 2026-11-21: "add the firecrawl versie in deze app". Pages whose content is loaded by JavaScript look empty to the
// plain reader (title "- Derayah Financial", no H1, little text). When the owner ticks the paid option, only those pages are
// read again with Firecrawl (which runs JavaScript), up to a maximum. Refused pages (401/403/406/429) are never sent to it.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {crawlSite}=require('../src/gsc-report/site-audit.cjs');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');
const {createFreeGrowthFirecrawlReader}=require('../src/growth-free-firecrawl-reader.cjs');

const O='https://web.derayah.com';
const full=(t,h)=>`<html lang="en"><head><title>${t}</title><meta name="description" content="A real description."></head><body><h1>${h}</h1><p>${'word '.repeat(400)}</p></body></html>`;
const shell=`<html lang="en"><head><title>- Derayah Financial</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
const PAGES={'/en/':full('Invest in Saudi and US stocks | Derayah','Invest with Derayah'),
 '/en/sa-stocks-nov-wk3-2026/':shell,'/en/us-stocks-nov-wk3-2026/':shell,'/en/js-only-broken/':shell,'/en/refused/':'REFUSED'};
const SITE={[O+'/sitemap.xml']:`<urlset>${Object.keys(PAGES).map(p=>`<url><loc>${O}${p}</loc></url>`).join('')}</urlset>`};
function reader(){return async(u,o={})=>{
 if(SITE[u]){if(!o.allowSitemapXml)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:SITE[u],final_url:u,redirect_chain:[]}}
 const p=PAGES[u.slice(O.length)];if(!p)throw Object.assign(Error('HTTP_404'),{code:'HTTP_404',redirect_chain:[]});
 if(p==='REFUSED')throw Object.assign(Error('HTTP_403'),{code:'HTTP_403',redirect_chain:[]});
 return {html:p,final_url:u,redirect_chain:[]}}}
// What Firecrawl returns after running the page's JavaScript.
const RENDERED={'/en/sa-stocks-nov-wk3-2026/':full('Saudi stocks: dividend eligibility & payments | Derayah','Saudi stocks dividend eligibility, week 3 November 2026'),
 '/en/us-stocks-nov-wk3-2026/':full('US stocks: dividend eligibility & payments | Derayah','US stocks dividend eligibility, week 3 November 2026')};
function renderer(){const calls=[];const f=async u=>{calls.push(u);const p=u.slice(O.length);
 if(RENDERED[p])return {html:RENDERED[p],final_url:u,status:200,source:'FIRECRAWL_HOSTED_API'};
 return {html:PAGES[p],final_url:u,status:200}};f.calls=calls;return f}

test('only pages that look empty without JavaScript are read again, up to the maximum; the rendered page is audited',async()=>{
 const render=renderer();
 const c=await crawlSite({domain:O+'/en/',fetchImpl:reader(),renderImpl:render,renderMax:10});
 assert.deepEqual(render.calls.sort(),[O+'/en/js-only-broken/',O+'/en/sa-stocks-nov-wk3-2026/',O+'/en/us-stocks-nov-wk3-2026/'],'not the good page, not the refused one');
 const a=c.audits.get(O+'/en/sa-stocks-nov-wk3-2026/');
 assert.equal(a.rendered,'FIRECRAWL');
 assert.ok(!a.issues.includes('H1_MISSING')&&!a.issues.includes('THIN'),a.issues.join());
 assert.ok(a.raw_issues.includes('H1_MISSING')&&a.raw_issues.includes('THIN'),'what the plain reader saw stays visible');
 assert.ok(!a.issues.includes('TITLE_DUPLICATE'),'duplicates are counted again on the rendered titles');
 const b=c.audits.get(O+'/en/js-only-broken/');
 assert.equal(b.rendered,'NOT_USED','Firecrawl gave nothing better: the plain read stays');assert.ok(b.issues.includes('H1_MISSING'));
 assert.deepEqual(c.render,{tried:3,used:2,max:10});
 const one=renderer();await crawlSite({domain:O+'/en/',fetchImpl:reader(),renderImpl:one,renderMax:1});
 assert.equal(one.calls.length,1,'the maximum is kept');
});

test('the Free Growth Firecrawl reader allows a larger cap only when asked, and still never bypasses a refusal',async()=>{
 const env={FREE_GROWTH_FIRECRAWL_ENABLED:'true',FIRECRAWL_API_KEY:'fc-test'};
 assert.equal(createFreeGrowthFirecrawlReader({env,maxPages:40}).stats.limit,10,'Free Growth stays at 10');
 assert.equal(createFreeGrowthFirecrawlReader({env,maxPages:40,hardCap:50}).stats.limit,40);
 let fc=0;const r=createFreeGrowthFirecrawlReader({env,hardCap:50,maxPages:40,lookup:async()=>[{address:'93.184.216.34'}],
  original:async()=>{throw Object.assign(Error('HTTP_403'),{code:'HTTP_403'})},fetchImpl:async()=>{fc++;return {ok:true,json:async()=>({})}}});
 await assert.rejects(r.reader(O+'/en/refused/'),/HTTP_403/);assert.equal(fc,0);
});

const KEY='owner-admin-key-0123456789';
async function server({firecrawlKey='fc-test'}={}){
 const rows=[],made=[];const app=express();app.use(express.json());
 registerGscReport(app,null,{storage:{ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:1,token:'tok1'.padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0};rows.push(r);return r},openReport:async()=>rows[rows.length-1]},
  checkUrls:async()=>new Map(),siteReader:reader(),fetchImpl:async()=>({ok:false,status:500,json:async()=>({})}),firecrawlKey,
  makeRenderer:({max})=>{const r=renderer();made.push({max,r});return r},config:{adminKey:KEY}});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const post=b=>fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},body:JSON.stringify(b)}).then(r=>r.json());
 return {srv,base,rows,made,post};
}

test('the report says which pages were read with JavaScript; only the owner sees the Firecrawl pages used',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const off=await s.post({title:'D',lang:'en',site_audit:{domain:O+'/en/'}});assert.equal(off.success,true);assert.equal(s.made.length,0,'not ticked: Firecrawl is not used');
 const on=await s.post({title:'D',lang:'en',site_audit:{domain:O+'/en/',firecrawl:{enabled:true,max:80}}});assert.equal(on.success,true);
 assert.equal(s.made[0].max,50,'at most 50 pages per report');
 const rep=s.rows[s.rows.length-1].report;assert.deepEqual(rep.crawl.render,{tried:3,used:2,max:50});
 const html=await (await fetch(s.base+on.url)).text();
 assert.match(html,/Read with JavaScript \(Firecrawl\)/);
 assert.match(html,/Without JavaScript:/);
 assert.doesNotMatch(html,/Firecrawl pages used/,'usage is internal');
 assert.match(await (await fetch(s.base+on.url,{headers:{'x-admin-key':KEY}})).text(),/Firecrawl pages used: 3/);
});

test('without a Firecrawl key nothing is sent, and the owner is told',async t=>{
 const s=await server({firecrawlKey:''});t.after(()=>s.srv.close());
 const on=await s.post({title:'D',lang:'en',site_audit:{domain:O+'/en/',firecrawl:{enabled:true,max:10}}});assert.equal(on.success,true);
 assert.equal(s.made.length,0);
 assert.equal(s.rows[0].report.crawl.render.status,'NOT_CONFIGURED');
 const page=await (await fetch(s.base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 const at=id=>page.indexOf('id="'+id+'"');
 assert.ok(at('fcOn')>at('secWithout')&&at('fcOn')<at('secWith'),'the Firecrawl option is in section A');
 assert.match(page,/Firecrawl/);
 for(const js of page.match(/<script>([\s\S]*?)<\/script>/g).map(x=>x.slice(8,-9)))assert.doesNotThrow(()=>new Function(js));
});

// Owner 2026-11-21: "ook een optie om pagina's te kiezen, ik wil er niet 500 hebben want ik ben aan het testen".
test('the owner chooses how many pages are read (1 to 150)',async t=>{
 const s=await server({firecrawlKey:''});t.after(()=>s.srv.close());
 const two=await s.post({title:'D',lang:'en',site_audit:{domain:O+'/en/',max:2}});assert.equal(two.success,true);
 assert.equal(s.rows[0].report.crawl.pages_listed,2);assert.equal(two.pages,2);
 const big=await s.post({title:'D',lang:'en',site_audit:{domain:O+'/en/',max:9999}});assert.equal(big.success,true);
 assert.equal(s.rows[1].report.crawl.pages_listed,5,'never more than the site has, and never more than 150');
 const page=await (await fetch(s.base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 assert.match(page,/<input id="auditMax" type="number" min="1" max="150"/);
 const at=id=>page.indexOf('id="'+id+'"');assert.ok(at('auditMax')>at('secWithout')&&at('auditMax')<at('secWith'));
});
