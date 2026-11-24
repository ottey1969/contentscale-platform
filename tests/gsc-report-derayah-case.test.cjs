'use strict';
// Owner 2026-11-21, real case https://web.derayah.com/en/ (screenshots): the whole site was read although the owner gave
// /en/; "derayah" and "دراية" (the brand) and a lone "steps" were suggested as search terms; Arabic and English terms were
// mixed whatever the language; Arabic URLs were shown as %d9%83… instead of readable text.
const test=require('node:test'),assert=require('node:assert/strict');
const {crawlSite,siteOrigin}=require('../src/gsc-report/site-audit.cjs');
const {suggestTerms}=require('../src/gsc-report/suggest-terms.cjs');
const {reportPage}=require('../src/gsc-report/routes.cjs');

const O='https://web.derayah.com';
const enc=p=>encodeURI(p);
const page=(title,h1,lang='en')=>`<html lang="${lang}"><head><title>${title}</title><meta name="description" content="d"></head><body><h1>${h1}</h1><p>${'word '.repeat(300)}</p></body></html>`;
const PAGES={
 '/en/':page('Derayah | Invest in Saudi and US stocks','Derayah'),
 '/en/how-us-stock-markets-influence-investor-decisions-in-saudi-arabia/':page('How US stock markets influence investor decisions in Saudi Arabia | Derayah','How US stock markets influence investor decisions in Saudi Arabia'),
 '/en/how-to-diversify-your-investments/':page('Diversify your investments: types and steps | Derayah','Steps'),
 '/en/fees/':page('Trading fees and commissions | Derayah','Trading fees and commissions'),
 '/en/sa-stocks-dividend-eligibility-payments-oct-wk5-2026/':page('Saudi Stocks: Dividend Eligibility & Payments | Oct WK5 2026','Oct WK5 2026'),
 '/en/sa-stocks-dividend-eligibility-payments-nov-wk1-2026/':page('Nov WK1 2026 | Derayah','Nov WK1 2026'),
 [enc('/ar/كيف-تنوع-استثماراتك/')]:page('كيف تنوع استثماراتك | دراية','كيف تنوع استثماراتك: ابنِ محفظة مرنة','ar'),
 [enc('/ar/الأسواق-الأمريكية/')]:page('الأسواق الأمريكية وتأثيرها على السوق السعودي | دراية','دراية','ar'),
 '/ar/':page('دراية | استثمر في الأسهم','دراية','ar')};
const SITE={[O+'/sitemap.xml']:`<urlset>${Object.keys(PAGES).map(p=>`<url><loc>${O}${p}</loc></url>`).join('')}</urlset>`};
function reader(){const calls=[];const f=async(u,o={})=>{calls.push(u);
 if(SITE[u]){if(!o.allowSitemapXml)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:SITE[u],final_url:u,redirect_chain:[]}}
 const p=u.slice(O.length);if(PAGES[p])return {html:PAGES[p],final_url:u,redirect_chain:[]};
 throw Object.assign(Error('HTTP_404'),{code:'HTTP_404',redirect_chain:[]})};f.calls=calls;return f}

test('a path in the domain field limits the read to that part of the site',async()=>{
 assert.deepEqual(siteOrigin('https://web.derayah.com/en/'),{origin:O,host:'web.derayah.com',path:'/en/'});
 assert.equal(siteOrigin('derayah.com').path,'/');
 const read=reader();
 const c=await crawlSite({domain:'https://web.derayah.com/en/',fetchImpl:read});
 assert.ok(c.pages.length===6&&c.pages.every(u=>u.startsWith(O+'/en/')),c.pages.join(' '));
 assert.ok(!read.calls.some(u=>u.includes('/ar/')),'pages outside /en/ are not requested');
 assert.equal(c.outside_path,3);assert.equal(c.path,'/en/');
});

test('suggested terms: never the brand (also behind a subdomain or in another script), at least two words, in the chosen language',async()=>{
 const en=await suggestTerms({domain:'https://web.derayah.com/en/',language:'en',fetchImpl:reader()});
 const t=en.terms.map(x=>x.term);
 assert.ok(t.length>=2,t.join(' | '));
 for(const bad of ['derayah','دراية','steps'])assert.ok(!t.includes(bad),'not suggested: '+bad+' in '+t.join(' | '));
 assert.ok(t.every(x=>!/[؀-ۿ]/.test(x)),'English only: '+t.join(' | '));
 assert.ok(t.includes('invest in saudi and us stocks'));
 // Week labels of a weekly page series are dates, not searches (screenshot 2026-11-21: "oct wk5 2026", "nov wk1 2026").
 assert.ok(!t.some(x=>/\bwk\d|\b20\d\d\b/.test(x)),'no date labels: '+t.join(' | '));assert.ok(t.includes('trading fees and commissions'));
 const ar=await suggestTerms({domain:'web.derayah.com',language:'ar',fetchImpl:reader()});
 const ta=ar.terms.map(x=>x.term);
 assert.ok(ta.length>=2&&ta.every(x=>/[؀-ۿ]/.test(x)),'Arabic only: '+ta.join(' | '));
 assert.ok(!ta.includes('دراية'),'the Arabic brand is not a search term');
 assert.ok(ta.some(x=>x.startsWith('الأسواق الأمريكية')));
 // The page is given readable, not percent-encoded.
 assert.ok(ar.terms.every(x=>!x.page||!/%[0-9a-f]{2}/i.test(x.page_label)),'readable page: '+ar.terms.map(x=>x.page_label).join(' '));
});

test('the report shows Arabic URLs readable, not percent-encoded',()=>{
 const url=O+enc('/ar/كيف-تنوع-استثماراتك/');
 const html=reportPage({title:'Derayah',lang:'en',created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,
  report:{scope:'CRAWL',site:'web.derayah.com',kpis:{audit:{pages_read:1,with_issues:1,blocked:0}},pages:[{url,rank:1,action:'FIX_SNIPPET',queries:[],audit:{title:'t',description:'',h1:['x'],words:300,canonical:null,lang:'ar',hreflang:[],issues:['DESCRIPTION_MISSING']}}],queries:{},bands:[],files:[],notes:[]}},
  {owner:false,config:{brand:'ContentScale'},growthPath:'/free-growth',issueView:'all'});
 assert.match(html,/\/ar\/كيف-تنوع-استثماراتك\//);
 assert.match(html,new RegExp('href="'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'),'the link itself stays the real URL');
});

// Owner 2026-11-21 (report RbqeHQ…): "ik heb saudi geselecteerd waarom neemt het nederland google, heb ik moeten betalen voor
// deze search, want die was niet aangevinkt". The suggest button switched the paid position check on by itself, and the
// country list started on the Netherlands. A paid search now needs the owner's own tick, a chosen country and a confirmation.
test('paid positions: never switched on by the page, no default country, a confirmation that names the market',async t=>{
 const express=require('express');const {registerGscReport}=require('../src/gsc-report/routes.cjs');
 const KEY='owner-admin-key-0123456789';let serper=0;
 const app=express();app.use(express.json());
 registerGscReport(app,null,{storage:{ensureTables:async()=>{}},siteReader:reader(),fetchImpl:async()=>{serper++;throw Error('no')},serperKey:'k',config:{adminKey:KEY}});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 const page=await (await fetch(base+'/gsc',{headers:{'x-admin-key':KEY}})).text();
 const js=page.match(/<script>([\s\S]*?)<\/script>/)[1];
 assert.doesNotMatch(js,/getElementById\('posOn'\)\.checked\s*=\s*true/,'the page never ticks the paid check itself');
 assert.match(page,/<select id="posCountry"[^>]*><option value="" selected>/,'no country is chosen for the owner');
 assert.doesNotMatch(page,/<option value="nl" selected>/);
 assert.match(js,/confirm\(/);assert.match(js,/paid Google searches/);
 const r=await fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},
  body:JSON.stringify({title:'x',lang:'en',site_audit:{domain:'web.derayah.com/en/'},positions:{enabled:true,country:'',keywords:['invest in saudi stocks']}})});
 assert.equal(r.status,400);assert.match((await r.json()).error,/country/i);assert.equal(serper,0,'nothing searched without a country');
});
