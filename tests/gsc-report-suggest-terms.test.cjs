'use strict';
// Owner 2026-11-20: "automatic Search terms (one per line, at most 10) possible?" → "bouw". Suggested terms come from a
// real source only: the Search Console export (what people searched), else the site's own H1 and title (the site's own
// words, never the brand alone). The owner sees and edits them before any paid search. Google's own related searches and
// "People also ask" from the searches already made are added to the report as ideas, at no extra cost.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {suggestTerms}=require('../src/gsc-report/suggest-terms.cjs');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const O='https://broker.example';
const page=(title,h1)=>`<html><head><title>${title}</title><meta name="description" content="d"></head><body>${h1.map(h=>`<h1>${h}</h1>`).join('')}<p>${'woord '.repeat(300)}</p></body></html>`;
const SITE={
 [O+'/sitemap.xml']:{xml:`<?xml version="1.0"?><urlset>${['/','/saudi-stocks/','/us-stocks/','/fees/','/login/','/about/'].map(u=>`<url><loc>${O}${u}</loc></url>`).join('')}</urlset>`},
 [O+'/']:{page:page('Broker | Trade Saudi stocks online',['Broker'])},
 [O+'/saudi-stocks/']:{page:page('Saudi stocks — Broker',['Invest in Saudi stocks'])},
 [O+'/us-stocks/']:{page:page('US stocks | Broker',['Buy US stocks from Saudi Arabia'])},
 [O+'/fees/']:{page:page('Fees | Broker',['Broker fees'])},
 [O+'/login/']:{page:page('Broker',['Broker'])},
 [O+'/about/']:{page:page('About Broker',['Invest in Saudi stocks'])}};
function reader(site){const calls=[];const f=async(url,o={})=>{calls.push(url);const x=site[url];
 if(!x)throw Object.assign(Error('HTTP_404'),{code:'HTTP_404',redirect_chain:[]});
 if(x.xml){if(!o.allowSitemapXml)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:x.xml,final_url:url,redirect_chain:[]}}
 return {html:x.page,final_url:url,redirect_chain:[]}};f.calls=calls;return f}
const b64=s=>Buffer.from(s).toString('base64');
const QUERIES='Top queries,Clicks,Impressions,CTR,Position\nbroker login,500,3000,16%,1.2\nsaudi stock trading app,10,2000,0.5%,7.4\nbest broker saudi arabia,3,900,0.3%,12\nhow to buy us stocks from saudi,0,400,0%,18\nbuy aramco shares,40,600,6.7%,2.1\n';

test('from a Search Console export: what people searched, near the top first, never brand searches',async()=>{
 const r=await suggestTerms({files:[{name:'Queries.csv',content_base64:b64(QUERIES)}],domain:'broker.example'});
 assert.equal(r.source,'SEARCH_CONSOLE');
 assert.deepEqual(r.terms.map(t=>t.term),['saudi stock trading app','best broker saudi arabia','buy aramco shares','how to buy us stocks from saudi']);
 assert.ok(r.terms.every(t=>t.source==='SEARCH_CONSOLE'&&t.impressions>0));
 assert.ok(!r.terms.some(t=>/broker login/.test(t.term)),'brand searches are left out');
});

test('without Search Console: the site’s own H1 and title, brand removed, each with the page it came from',async()=>{
 const read=reader(SITE);
 const r=await suggestTerms({domain:'broker.example',fetchImpl:read});
 assert.equal(r.source,'SITE');
 const terms=r.terms.map(t=>t.term);
 assert.ok(terms.includes('trade saudi stocks online'),'title of the home page without the brand: '+terms);
 assert.ok(terms.includes('invest in saudi stocks'));
 assert.ok(terms.includes('buy us stocks from saudi arabia'));
 assert.ok(!terms.some(t=>/^broker$/.test(t)),'the brand alone is not a search term');
 assert.equal(terms.filter(t=>t==='invest in saudi stocks').length,1,'no duplicates');
 assert.ok(terms.includes('broker fees')||terms.includes('fees'),'a term may contain the brand when it says more than the brand');
 const t=r.terms.find(x=>x.term==='invest in saudi stocks');assert.equal(t.source,'PAGE_H1');assert.equal(t.page,O+'/saudi-stocks/');
 assert.ok(r.terms.length<=10);
 assert.ok(read.calls.length<=20,'a light read: '+read.calls.length);
});

test('route: owner only; the form gets terms to review before anything is searched',async t=>{
 const KEY='owner-admin-key-0123456789';
 const app=express();app.use(express.json({limit:'10mb'}));let serper=0;
 registerGscReport(app,null,{storage:{ensureTables:async()=>{}},siteReader:reader(SITE),fetchImpl:async()=>{serper++;throw Error('no')},serperKey:'k',config:{adminKey:KEY}});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 const post=(b,h={})=>fetch(base+'/api/gsc/suggest-terms',{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)});
 assert.equal((await post({domain:'broker.example'})).status,404);
 const r=await (await post({domain:'broker.example'},{'x-admin-key':KEY})).json();
 assert.equal(r.success,true);assert.ok(r.terms.length>0);assert.equal(serper,0,'suggesting costs no search');
 const bad=await post({},{'x-admin-key':KEY});assert.equal(bad.status,400);
 const page=await (await fetch(base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 assert.match(page,/id="suggestTerms"/);
 // The page script sits in a server template: an escape that breaks it breaks the whole owner page.
 for(const js of page.match(/<script>([\s\S]*?)<\/script>/g).map(x=>x.slice(8,-9)))assert.doesNotThrow(()=>new Function(js),'owner page script parses');
});

test('the report adds Google’s related searches and questions as ideas, without extra searches',async t=>{
 const KEY='owner-admin-key-0123456789',rows=[];let calls=0;
 const google=async(url,o={})=>{
  if(url.startsWith('https://google.serper.dev/search')){calls++;const q=JSON.parse(o.body).q;
   return {ok:true,status:200,json:async()=>({organic:Array.from({length:10},(_,i)=>({position:i+1,link:i===1?O+'/saudi-stocks/':'https://rival.example/'+i,title:'t'})),
    relatedSearches:[{query:q+' fees'},{query:'saudi stock market hours'}],peopleAlsoAsk:[{question:'How do I buy Saudi stocks?'}]})}}
  return {ok:false,status:500,json:async()=>({})}};
 const app=express();app.use(express.json());
 registerGscReport(app,null,{storage:{ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:1,token:'tok1'.padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0};rows.push(r);return r},openReport:async()=>rows[0]},
  checkUrls:async()=>new Map(),siteReader:reader(SITE),fetchImpl:google,serperKey:'k',config:{adminKey:KEY}});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 const made=await (await fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},
  body:JSON.stringify({title:'B',lang:'nl',site_audit:{domain:'broker.example'},positions:{enabled:true,country:'sa',language:'en',keywords:['invest in saudi stocks','broker fees']}})})).json();
 assert.equal(made.success,true);
 assert.equal(calls,2,'one search per term (found on page 1), nothing extra for the ideas');
 const ideas=rows[0].report.positions.ideas;
 assert.ok(ideas.some(i=>i.term==='saudi stock market hours'));
 assert.ok(ideas.some(i=>/how do i buy saudi stocks/i.test(i.term)));
 assert.equal(ideas.filter(i=>i.term==='saudi stock market hours').length,1,'no duplicates across terms');
 const html=await (await fetch(base+made.url)).text();
 assert.match(html,/Ideeën van Google/);
 assert.match(html,/saudi stock market hours/);
 assert.doesNotMatch(html,/rival\.example/);
});
