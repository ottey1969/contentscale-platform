'use strict';
// Owner 2026-11-20: "google search console informatie krijg ik niet zo snel, wat kan ik als ik dat niet heb" and, for
// https://web.derayah.com, "hoe krijg ik informatie zonder het bedrijf me het geeft" → "bouw", in the same /gsc form.
// Without Search Console the report reads only what is public: robots.txt, the sitemap and the pages themselves (status,
// redirects, noindex, canonical, title, description, H1, text length), Google's own field data for speed, and, when the
// owner asks for it, the site's position in Google for search terms the owner gives. No clicks or impressions are
// invented, ranking competitors are never shown or linked, and robots.txt is respected.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {parseRobots,robotsAllows,sitemapLocs,pageAudit,crawlSite}=require('../src/gsc-report/site-audit.cjs');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const O='https://broker.example';
const html=({title='',desc='',h1=[],words=400,canonical='',robots='',lang='en',hreflang=[]})=>`<!doctype html><html lang="${lang}"><head>${title?`<title>${title}</title>`:''}
${desc?`<meta name="description" content="${desc}">`:''}${canonical?`<link rel="canonical" href="${canonical}">`:''}${robots?`<meta name="robots" content="${robots}">`:''}
${hreflang.map(([l,u])=>`<link rel="alternate" hreflang="${l}" href="${u}">`).join('')}<script>var x="${'word '.repeat(500)}"</script></head>
<body><nav>Menu Home About</nav>${h1.map(h=>`<h1>${h}</h1>`).join('')}<p>${'woord '.repeat(words)}</p></body></html>`;
const LONG='Online trading platform for Saudi stocks, US stocks, funds and sukuk with low fees';
const SITE={
 [O+'/robots.txt']:{text:'User-agent: *\nDisallow: /private/\nAllow: /private/open/\n\nUser-agent: BadBot\nDisallow: /\n\nSitemap: '+O+'/sitemap_index.xml\n'},
 [O+'/sitemap_index.xml']:{xml:`<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${O}/pages.xml</loc></sitemap><sitemap><loc>https://other.example/s.xml</loc></sitemap></sitemapindex>`},
 [O+'/pages.xml']:{xml:`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/en/','/old-fees/','/private/report/','/private/open/faq/','/hidden/','/thin/','/dup-a/','/dup-b/','/blocked/','/gone/','https://other.example/x/']
  .map(u=>`<url><loc>${u.startsWith('http')?u:O+u}</loc><lastmod>2026-10-0${u.length%9+1}</lastmod></url>`).join('')}</urlset>`},
 // lang "en": an English title on a page marked Arabic is a language mismatch (owner 2026-11-21).
 [O+'/']:{page:html({title:'Broker — trade Saudi stocks',desc:'Open an account.',h1:['Trade with Broker'],lang:'en',hreflang:[['ar',O+'/'],['en',O+'/en/']]})},
 [O+'/en/']:{page:html({title:LONG,h1:[],hreflang:[['ar',O+'/'],['en',O+'/en/']]})},
 [O+'/old-fees/']:{redirect:O+'/en/',status:301},
 [O+'/private/open/faq/']:{page:html({title:'FAQ',desc:'Questions.',h1:['FAQ','More FAQ']})},
 [O+'/hidden/']:{page:html({title:'Hidden',desc:'x',h1:['Hidden'],robots:'noindex, follow'})},
 [O+'/thin/']:{page:html({title:'Thin',desc:'x',h1:['Thin'],words:40,canonical:O+'/'})},
 [O+'/dup-a/']:{page:html({title:'Same title',desc:'Same description',h1:['A']})},
 [O+'/dup-b/']:{page:html({title:'Same title',desc:'Same description',h1:['B']})},
 [O+'/blocked/']:{error:'HTTP_403'},
 [O+'/gone/']:{error:'HTTP_404'}};
// The public reader's result and error shapes.
function fakeReader(site){const calls=[];const f=async(url,opts={})=>{calls.push(url);const x=site[url];
 if(!x)throw Object.assign(Error('HTTP_404'),{code:'HTTP_404',redirect_chain:[]});
 if(x.error)throw Object.assign(Error(x.error),{code:x.error,redirect_chain:[]});
 if(x.text){if(!opts.allowText)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:x.text,final_url:url,status:200,redirect_chain:[]}}
 if(x.xml){if(!opts.allowSitemapXml)throw Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'});return {html:x.xml,final_url:url,status:200,redirect_chain:[]}}
 if(x.redirect){const t=site[x.redirect];return {html:t.page,final_url:x.redirect,status:200,redirect_chain:[{url,status:x.status,location:x.redirect}]}}
 return {html:x.page,final_url:url,status:200,redirect_chain:[]}};f.calls=calls;return f}

test('robots.txt: the group for every crawler, longest rule wins, sitemap lines',()=>{
 const r=parseRobots(SITE[O+'/robots.txt'].text);
 assert.deepEqual(r.sitemaps,[O+'/sitemap_index.xml']);
 assert.equal(robotsAllows(r,'/private/report/'),false);
 assert.equal(robotsAllows(r,'/private/open/faq/'),true);
 assert.equal(robotsAllows(r,'/en/'),true);
 assert.equal(robotsAllows(parseRobots(''),'/x'),true);
});

test('sitemap: a sitemap index and a URL list, with last-modified dates',()=>{
 const i=sitemapLocs(SITE[O+'/sitemap_index.xml'].xml);assert.deepEqual(i.sitemaps,[O+'/pages.xml','https://other.example/s.xml']);assert.equal(i.urls.length,0);
 const u=sitemapLocs(SITE[O+'/pages.xml'].xml);assert.equal(u.urls.length,12);assert.match(u.urls[0].lastmod,/^2026-10-0\d$/);
});

test('page audit: what Google reads on the page, and what stands in the way',()=>{
 const a=pageAudit(SITE[O+'/hidden/'].page,O+'/hidden/');
 assert.equal(a.title,'Hidden');assert.equal(a.noindex,true);assert.ok(a.issues.includes('NOINDEX'));
 const t=pageAudit(SITE[O+'/thin/'].page,O+'/thin/');
 assert.ok(t.issues.includes('CANONICAL_ELSEWHERE'));assert.ok(t.issues.includes('THIN'));assert.ok(t.words<100,'script and navigation are not counted as text');
 const e=pageAudit(SITE[O+'/en/'].page,O+'/en/');
 // A long title is a small note, not a problem (owner 2026-11-21).
 assert.ok(e.notes.includes('TITLE_LONG'));assert.ok(!e.issues.includes('TITLE_LONG'));assert.ok(e.issues.includes('DESCRIPTION_MISSING'));assert.ok(e.issues.includes('H1_MISSING'));
 assert.deepEqual(e.hreflang.map(h=>h.lang),['ar','en']);
 assert.ok(pageAudit(SITE[O+'/private/open/faq/'].page,O+'/private/open/faq/').issues.includes('H1_MULTIPLE'));
 const ok=pageAudit(SITE[O+'/'].page,O+'/');assert.deepEqual(ok.issues,[]);assert.equal(ok.lang,'en');
 assert.ok(pageAudit('<html><head><title>x</title></head><body><h1>x</h1></body></html>',O+'/z/',{xRobotsTag:'noindex'}).issues.includes('NOINDEX'),'noindex sent as a header');
});

test('crawl: robots.txt is respected, only this site, statuses and audits per page',async()=>{
 const read=fakeReader(SITE);
 const c=await crawlSite({domain:'broker.example',fetchImpl:read});
 assert.equal(c.origin,O);
 assert.equal(c.sitemap.source,'ROBOTS_TXT');
 assert.ok(!read.calls.includes(O+'/private/report/'),'disallowed by robots.txt: never requested');
 assert.deepEqual(c.not_crawled.find(x=>x.url===O+'/private/report/'),{url:O+'/private/report/',reason:'ROBOTS_TXT'});
 assert.ok(!read.calls.some(u=>u.startsWith('https://other.example')),'other hosts are not read');
 assert.equal(c.pages.length,10);
 assert.equal(c.statuses.get(O+'/old-fees/').status,301);
 assert.equal(c.statuses.get(O+'/gone/').status,404);
 assert.equal(c.statuses.get(O+'/blocked/').error,'HTTP_403','a blocked request is reported, not circumvented');
 assert.ok(c.audits.get(O+'/hidden/').issues.includes('NOINDEX'));
 assert.ok(!c.audits.has(O+'/old-fees/'),'a redirected URL is not audited as if it were its target');
 assert.ok(c.audits.get(O+'/dup-a/').issues.includes('TITLE_DUPLICATE'));
 assert.ok(c.audits.get(O+'/dup-b/').issues.includes('DESCRIPTION_DUPLICATE'));
 assert.match(c.lastmod.get(O+'/thin/'),/^2026-10-/);
});

test('crawl without a sitemap: the home page and its links on the same site',async()=>{
 const site={[O+'/']:{page:'<html><head><title>Home</title></head><body><h1>Home</h1><a href="/a/">A</a><a href="https://elsewhere.example/">x</a><a href="/b/#top">B</a></body></html>'},
  [O+'/a/']:{page:html({title:'A',desc:'a',h1:['A']})},[O+'/b/']:{page:html({title:'B',desc:'b',h1:['B']})}};
 const c=await crawlSite({domain:'https://broker.example/',fetchImpl:fakeReader(site)});
 assert.equal(c.sitemap.source,'HOME_PAGE_LINKS');
 assert.deepEqual(c.pages.sort(),[O+'/',O+'/a/',O+'/b/']);
});

// The route: domain only, same form, same secret link.
function memory(){const rows=[];return {rows,ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:rows.length+1,token:('tok'+(rows.length+1)).padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,growth_invite:null};rows.push(r);return r},
 openReport:async(_p,t)=>rows.find(x=>x.token===t)||null,listReports:async()=>rows,revokeReport:async()=>null,createInvite:async()=>({token:'x'})}}
const KEY='owner-admin-key-0123456789';
function fakeGoogle({serper=true}={}){const calls=[];const f=async(url,opts={})=>{calls.push(url);
 if(url.startsWith('https://google.serper.dev/search')){const q=JSON.parse(opts.body).q;
  const organic=Array.from({length:10},(_,i)=>({position:i+1,title:'r'+i,link:i===3&&q==='saudi stock trading app'?O+'/en/':'https://rival-broker.example/p'+i}));
  return {ok:true,status:200,json:async()=>({organic})}}
 if(url.startsWith('https://www.googleapis.com/pagespeedonline/v5/runPagespeed'))return {ok:true,status:200,json:async()=>({originLoadingExperience:{overall_category:'AVERAGE',metrics:{
  LARGEST_CONTENTFUL_PAINT_MS:{percentile:3100,category:'AVERAGE'},INTERACTION_TO_NEXT_PAINT:{percentile:180,category:'FAST'},CUMULATIVE_LAYOUT_SHIFT_SCORE:{percentile:12,category:'FAST'}}}})};
 throw Error('unexpected '+url)};f.calls=calls;return f}
async function server({serperKey='serper-test-key'}={}){
 const app=express();app.use(express.json({limit:'10mb'}));const storage=memory(),google=fakeGoogle(),reader=fakeReader(SITE);
 registerGscReport(app,null,{storage,checkUrls:async()=>new Map(),siteReader:reader,fetchImpl:google,serperKey,config:{adminKey:KEY,brand:'ContentScale'}});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const post=b=>fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},body:JSON.stringify(b)}).then(r=>r.json());
 const view=async(u,h={})=>(await fetch(base+u,{headers:h})).text();
 return {srv,storage,google,reader,post,view};
}

test('a report from a domain alone: public facts, Google field data and positions, no invented clicks, no competitors',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const made=await s.post({title:'Broker',lang:'nl',site_audit:{domain:'broker.example'},positions:{enabled:true,country:'sa',language:'en',keywords:['saudi stock trading app','broker fees']}});
 assert.equal(made.success,true,JSON.stringify(made));
 const rep=s.storage.rows[0].report;
 assert.equal(rep.scope,'CRAWL');
 assert.equal(rep.kpis.clicks,null);assert.equal(rep.kpis.impressions,null);
 const by=u=>rep.pages.find(p=>p.url===O+u);
 assert.equal(by('/hidden/').action,'BLOCKED');assert.equal(by('/thin/').action,'BLOCKED');
 assert.equal(by('/gone/').action,'GONE');assert.equal(by('/old-fees/').action,'REDIRECT');
 assert.equal(by('/en/').action,'FIX_SNIPPET');assert.equal(by('/private/open/faq/').action,'FIX_STRUCTURE');
 assert.equal(by('/').action,'NO_ISSUES');
 assert.deepEqual(by('/en/').positions,[{keyword:'saudi stock trading app',position:4}]);
 assert.equal(rep.positions.rows.find(r=>r.keyword==='broker fees').status,'NOT_IN_RESULTS');
 assert.equal(rep.speed.status,'FOUND');assert.equal(rep.speed.metrics.LCP.ms,3100);
 const html=await s.view(made.url)+await s.view(made.url+'?view=all');
 assert.match(html,/Zonder Search Console/);
 assert.match(html,/Staat op noindex/);
 assert.match(html,/Canonical wijst naar een andere pagina/);
 assert.match(html,/Positie 4/);
 assert.match(html,/Grootste element geladen/);
 assert.match(html,/robots\.txt/);
 assert.doesNotMatch(html,/rival-broker/,'ranking competitors are never shown or linked');
 assert.doesNotMatch(html,/Pagina’s per positiegroep/,'no Search Console sections without Search Console');
 assert.doesNotMatch(html,/serper|zoekopdrachten gebruikt/i,'usage is not shown to the recipient');
 assert.match(await s.view(made.url,{'x-admin-key':KEY}),/Google-zoekopdrachten gebruikt: \d+/,'the owner sees what the positions cost');
 const searches=s.google.calls.filter(u=>u.includes('serper')).length;
 assert.ok(searches>=2&&searches<=6,'at most three result pages per search term: '+searches);
});

test('positions only when the owner asks and Serper is configured; at most 10 search terms',async t=>{
 const s=await server({serperKey:''});t.after(()=>s.srv.close());
 const a=await s.post({title:'B',lang:'en',site_audit:{domain:'broker.example'}});assert.equal(a.success,true);
 assert.equal(s.google.calls.filter(u=>u.includes('serper')).length,0);
 assert.equal(s.storage.rows[0].report.positions,null);
 const b=await s.post({title:'B',lang:'en',site_audit:{domain:'broker.example'},positions:{enabled:true,country:'sa',keywords:['a b']}});assert.equal(b.success,true);
 assert.equal(s.storage.rows[1].report.positions.status,'PROVIDER_NOT_CONFIGURED');
 assert.equal(s.google.calls.filter(u=>u.includes('serper')).length,0);
 const s2=await server();t.after(()=>s2.srv.close());
 const c=await s2.post({title:'B',lang:'en',site_audit:{domain:'broker.example'},positions:{enabled:true,country:'sa',keywords:Array.from({length:14},(_,i)=>'term '+i)}});
 assert.equal(c.success,true);assert.equal(s2.storage.rows[0].report.positions.rows.length,10);
 const bad=await s2.post({title:'B',lang:'en',site_audit:{domain:'http://10.0.0.1/'}});assert.equal(bad.success,false);
});

test('a Search Console export and the domain together: the numbers stay, the public facts are added',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const csv='Top pages,Clicks,Impressions,CTR,Position\n'+[[O+'/',300,3000,'10%',2],[O+'/en/',20,4000,'0.5%',6],[O+'/hidden/',5,900,'0.56%',8],[O+'/dup-a/',30,800,'3.75%',5],[O+'/dup-b/',25,700,'3.57%',7]].map(r=>r.join(',')).join('\n');
 const made=await s.post({title:'Broker',lang:'en',files:[{name:'Pages.csv',content_base64:Buffer.from(csv).toString('base64')}],site_audit:{domain:'broker.example'}});
 assert.equal(made.success,true);
 const rep=s.storage.rows[0].report;
 assert.equal(rep.scope,'SITE');
 const by=u=>rep.pages.find(p=>p.url===O+u);
 assert.equal(by('/en/').clicks,20);assert.equal(by('/en/').action,'QUICK_WIN','the Search Console action stays');
 assert.ok(by('/en/').audit.notes.includes('TITLE_LONG'),'and the public facts are shown with it (a long title as a small note)');
 assert.equal(by('/hidden/').action,'BLOCKED','a page Google is told not to index is the first thing to fix, whatever its numbers');
 assert.equal(by('/thin/').source,'CRAWL');
});
