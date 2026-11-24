'use strict';
// Owner 2026-11-21 "bouw" on the audit additions found in the real web.derayah.com report: (1) a page whose title or
// description is in another language than the page, (2) broken titles ("- Derayah Financial", only the site name),
// (3) long titles/descriptions are small notes, not problems that drive the order, (5) language versions (hreflang)
// that do not link back or point to a gone page, (6) structured data types per page, a duplicate Article schema and
// JSON-LD that does not parse. And: Firecrawl needs no maximum field; it reads only empty-looking pages and asks first.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {pageAudit,crawlSite}=require('../src/gsc-report/site-audit.cjs');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const O='https://web.derayah.com';
const ld=o=>`<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const doc=({lang='en',title,desc=(/[\u0600-\u06FF]/.test(title)?'وصف واضح لهذه الصفحة: ':'A clear description of this page: ')+title,h1='Heading',hreflang=[],extra='',words=300})=>
 `<html lang="${lang}"><head><title>${title}</title>${desc?`<meta name="description" content="${desc}">`:''}${hreflang.map(([l,u])=>`<link rel="alternate" hreflang="${l}" href="${O}${u}">`).join('')}${extra}</head><body><h1>${h1}</h1><p>${'word '.repeat(words)}</p></body></html>`;

test('(1) title or description in another language than the page',()=>{
 const ar='دليل المستثمر للبدء في السوق المالية السعودية';
 assert.ok(pageAudit(doc({lang:'en-us',title:ar+' | Derayah'}),O+'/en/guide/').issues.includes('LANGUAGE_MISMATCH'));
 assert.ok(pageAudit(doc({lang:'en',title:'Investor guide | Derayah',desc:ar}),O+'/en/guide/').issues.includes('LANGUAGE_MISMATCH'));
 assert.ok(pageAudit(doc({lang:'ar',title:'Investor guide to the Saudi market',desc:'An English description of the page.'}),O+'/ar/guide/').issues.includes('LANGUAGE_MISMATCH'));
 assert.ok(!pageAudit(doc({lang:'ar',title:ar+' | Derayah',desc:ar+' مع منصة دراية'}),O+'/ar/guide/').issues.includes('LANGUAGE_MISMATCH'),'an Arabic page may name the brand in Latin letters');
 assert.ok(!pageAudit(doc({lang:'en',title:'Saudi Tadawul (تداول) explained',desc:'How the Saudi stock exchange works, explained for new investors.'}),O+'/en/x/').issues.includes('LANGUAGE_MISMATCH'),'one word in another script is fine');
});

test('(2) broken titles: starting with a separator',()=>{
 assert.ok(pageAudit(doc({title:'- Derayah Financial'}),O+'/en/a/').issues.includes('TITLE_BROKEN'));
 assert.ok(pageAudit(doc({title:' | Brand'}),O+'/en/a/').issues.includes('TITLE_BROKEN'));
 assert.ok(!pageAudit(doc({title:'Saudi stocks - weekly dividends | Derayah'}),O+'/en/a/').issues.includes('TITLE_BROKEN'));
});

test('(6) structured data: types per page, a duplicate Article, JSON-LD that does not parse',()=>{
 const a=pageAudit(doc({title:'Guide to Saudi stocks for beginners',extra:ld({'@context':'https://schema.org','@graph':[{'@type':'Organization'},{'@type':'Article'}]})+ld({'@type':'Article'})}),O+'/en/a/');
 assert.deepEqual(a.schema,['Organization','Article','Article']);assert.ok(a.issues.includes('SCHEMA_DUPLICATE_ARTICLE'));
 const b=pageAudit(doc({title:'Guide to Saudi stocks for beginners',extra:'<script type="application/ld+json">{"@type": "Article",}</script>'}),O+'/en/b/');
 assert.ok(b.issues.includes('SCHEMA_INVALID'));
 const c=pageAudit(doc({title:'Guide to Saudi stocks for beginners',extra:ld({'@type':['Article','NewsArticle']})}),O+'/en/c/');
 assert.ok(!c.issues.includes('SCHEMA_DUPLICATE_ARTICLE'),'one node with two types is one Article');
});

const SITE={
 '/en/':doc({title:'Invest in Saudi and US stocks | Derayah',hreflang:[['en','/en/'],['ar','/ar/'],['x-default','/en/']]}),
 '/ar/':doc({lang:'ar',title:'استثمر في الأسهم السعودية والأمريكية | دراية',hreflang:[['ar','/ar/'],['en','/en/']]}),
 '/en/fees/':doc({title:'Trading fees and commissions | Derayah',hreflang:[['ar','/ar/fees/']]}),
 '/ar/fees/':doc({lang:'ar',title:'رسوم التداول والعمولات | دراية',hreflang:[['ar','/ar/fees/']]}),
 '/en/old/':doc({title:'Old page about something else | Derayah',hreflang:[['en','/en/old/'],['ar','/ar/gone/']]}),
 '/en/name-only/':doc({title:'Derayah'}),
 '/en/long/':doc({title:'A very long title about Saudi stock dividends, eligibility rules and payment dates | Derayah'})};
const SM=O+'/sitemap.xml';
function reader(){return async(u,o={})=>{
 if(u===SM){if(!o.allowSitemapXml)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:`<urlset>${[...Object.keys(SITE),'/ar/gone/'].map(p=>`<url><loc>${O}${p}</loc></url>`).join('')}</urlset>`,final_url:u,redirect_chain:[]}}
 const p=u.slice(O.length);if(!SITE[p])throw Object.assign(Error('HTTP_404'),{code:'HTTP_404',redirect_chain:[]});
 return {html:SITE[p],final_url:u,redirect_chain:[]}}}

test('(5) language versions, (2) a title that is only the site name, checked across the pages read',async()=>{
 const c=await crawlSite({domain:'web.derayah.com',fetchImpl:reader()});
 const is=u=>c.audits.get(O+u).issues;
 assert.ok(!is('/en/').some(x=>/^HREFLANG/.test(x)),'en ↔ ar both ways, with self-reference: fine '+is('/en/'));
 assert.ok(is('/ar/').every(x=>!/^HREFLANG/.test(x)),is('/ar/').join());
 assert.ok(is('/en/fees/').includes('HREFLANG_NO_SELF'));
 assert.ok(is('/en/fees/').includes('HREFLANG_NO_RETURN'),'/ar/fees/ does not link back to /en/fees/');
 assert.ok(is('/en/old/').includes('HREFLANG_BROKEN_TARGET'),'/ar/gone/ answers 404');
 assert.ok(is('/en/name-only/').includes('TITLE_BROKEN'),'a title that is only the site name');
});

const KEY='owner-admin-key-0123456789';
async function server(){
 const rows=[],made=[];const app=express();app.use(express.json());
 registerGscReport(app,null,{storage:{ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:1,token:'tok1'.padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0};rows.push(r);return r},openReport:async()=>rows[rows.length-1]},
  checkUrls:async()=>new Map(),siteReader:reader(),fetchImpl:async()=>({ok:false,status:500,json:async()=>({})}),firecrawlKey:'fc',makeRenderer:({max})=>{made.push(max);return async u=>({html:'',final_url:u})},config:{adminKey:KEY}});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 return {srv,base,rows,made,post:b=>fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},body:JSON.stringify(b)}).then(r=>r.json())};
}

test('(3) long titles are small notes: they do not drive the order or count as problems; the report shows all new findings',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const r=await s.post({title:'D',lang:'en',site_audit:{domain:'web.derayah.com'}});assert.equal(r.success,true);
 const rep=s.rows[0].report,by=u=>rep.pages.find(p=>p.url===O+u);
 assert.equal(by('/en/long/').action,'NO_ISSUES','only a long title: a small note, not work');
 assert.ok(by('/en/long/').audit.notes.includes('TITLE_LONG'));assert.ok(!by('/en/long/').audit.issues.includes('TITLE_LONG'));
 assert.equal(by('/en/fees/').action,'FIX_HREFLANG');
 assert.equal(by('/en/name-only/').action,'FIX_SNIPPET');
 assert.ok(rep.kpis.audit.with_notes>=1);
 const html=await (await fetch(s.base+r.url)).text();
 const details=await (await fetch(s.base+r.url+'?view=all')).text();
 for(const x of ['Language versions (hreflang)','Does not link back','Title is broken','Small notes'])assert.match(html+details,new RegExp(x.replace(/[()]/g,'\\$&')),x);
});

test('Firecrawl: no maximum to fill in; it uses the pages to read (at most 50) and asks first',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 await s.post({title:'D',lang:'en',site_audit:{domain:'web.derayah.com',max:10,firecrawl:{enabled:true}}});
 assert.deepEqual(s.made,[10]);
 await s.post({title:'D',lang:'en',site_audit:{domain:'web.derayah.com',firecrawl:{enabled:true}}});
 assert.deepEqual(s.made,[10,50]);
 const page=await (await fetch(s.base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 assert.doesNotMatch(page,/id="fcMax"/);assert.match(page,/id="fcOn"/);
 const js=page.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(js));assert.match(js,/Firecrawl/);
});
