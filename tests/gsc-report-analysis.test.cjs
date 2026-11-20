'use strict';
// Owner 2026-11-20: app.contentscale.site/gsc — upload the Search Console export of any site, add pages by hand, and get
// the order in which to work on the pages, with KPIs; everything visible, also what is not linked to a page; linked to
// Free Growth. Facts only: every number comes from the uploaded export or the owner's own entry. The benchmark is this
// site's own median CTR per position band, never an outside CTR curve, and a gap in clicks is a calculation, not a forecast.
const test=require('node:test'),assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {readUploads,analyze}=require('../src/gsc-report/analysis.cjs');

// A minimal ZIP writer (stored entries) for test exports, in the format Search Console downloads.
function zip(files){
 const parts=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=Buffer.from(text,'utf8'),nameB=Buffer.from(name),crc=zlib.crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameB.length,26);
  parts.push(local,nameB,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameB.length,28);c.writeUInt32LE(offset,42);
  central.push(c,nameB);offset+=30+nameB.length+data.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,cd,end]);
}
const b64=b=>Buffer.from(b).toString('base64');
const SITE='https://acme-roofing.example';
const SITEWIDE=zip({
 'Pages.csv':'Top pages,Clicks,Impressions,CTR,Position\n'+[
  [SITE+'/',300,3000,'10%',2.1],[SITE+'/roof-repair/',20,4000,'0.5%',6.2],[SITE+'/gutters/',40,800,'5%',5.5],[SITE+'/flat-roof/',5,1500,'0.33%',14.8],
  [SITE+'/skylights/',0,900,'0%',8.4],[SITE+'/blog/storm/',12,600,'2%',13.1],[SITE+'/emergency/',30,1000,'3%',2.8],[SITE+'/contact/',15,100,'15%',3.0],
  [SITE+'/old-page/',0,40,'0%',48],[SITE+'/insulation/',25,700,'3.57%',7.0]].map(r=>r.join(',')).join('\n'),
 'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nacme roofing,250,900,27.78%,1.2\nroof repair near me,10,2500,0.4%,7.1\nhow much does a roof repair cost,2,800,0.25%,9.4\nflat roof repair,1,700,0.14%,12.3\nemergency roofer,20,400,5%,3.1\nwhat is a skylight leak,0,300,0%,6.0',
 'Countries.csv':'Country,Clicks,Impressions,CTR,Position\nUnited States,400,9000,4.44%,5.2\nCanada,0,500,0%,7.8\nUnited Kingdom,2,200,1%,9.1',
 'Devices.csv':'Device,Clicks,Impressions,CTR,Position\nMobile,300,6000,5%,5.0\nDesktop,100,3800,2.63%,6.1\nTablet,2,140,1.43%,7.0',
 'Chart.csv':'Date,Clicks,Impressions,CTR,Position\n'+Array.from({length:14},(_,i)=>{const d=new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10);return [d,i<7?20:40,i<7?600:800,'x',5].join(',')}).join('\n'),
 'Filters.csv':'Filter,Value\nSearch type,Web\nDate,Last 28 days'});
const PER_PAGE=zip({'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nroof repair near me,10,2500,0.4%,7.1\nroof repair cost,3,900,0.33%,8.0',
 'Filters.csv':'Filter,Value\nPage,'+SITE+'/roof-repair/\nDate,Last 28 days'});
const PAIRS='Landing Page,Query,Clicks,Impressions,CTR,Average Position\n'+SITE+'/gutters/,gutter cleaning,30,500,6%,4.9\n'+SITE+'/flat-roof/,flat roof repair,1,700,0.14%,12.3';

function build(extra={}){
 const up=readUploads([{name:'acme.zip',content_base64:b64(SITEWIDE)},{name:'roof-repair.zip',content_base64:b64(PER_PAGE)},{name:'pairs.csv',content_base64:b64(PAIRS)}]);
 return analyze({uploads:up,manualPages:[{url:SITE+'/new-service/',note:'Not in Search Console yet'},{url:SITE+'/skylights/',impressions:999}],site:'',...extra});
}

test('reads a site-wide export, a page-filtered export and a page+query CSV, and says what each file is',()=>{
 const up=readUploads([{name:'acme.zip',content_base64:b64(SITEWIDE)},{name:'roof-repair.zip',content_base64:b64(PER_PAGE)},{name:'pairs.csv',content_base64:b64(PAIRS)},{name:'x.txt',content_base64:b64('hello')}]);
 assert.equal(up.sitewide.pages.length,10);assert.equal(up.sitewide.queries.length,6);assert.equal(up.sitewide.countries.length,3);assert.equal(up.sitewide.devices.length,3);assert.equal(up.sitewide.dates.length,14);
 assert.equal(up.perPage.length,1);assert.equal(up.perPage[0].page,SITE+'/roof-repair/');assert.equal(up.perPage[0].queries.length,2);
 assert.equal(up.pairs.length,2);
 assert.deepEqual(up.files.map(f=>f.kind),['SITEWIDE','PAGE_FILTERED','PAGE_QUERY_PAIRS','NOT_READ']);
});

test('the order: pages on positions 4–20 below this site\'s own median CTR first, by the clicks they miss against that median',()=>{
 const r=build();
 assert.equal(r.site,'acme-roofing.example');
 const order=r.pages.filter(p=>p.action!=='KEEP').map(p=>p.url.replace(SITE,''));
 assert.equal(order[0],'/roof-repair/','most impressions far below the median on page one');
 assert.ok(order.indexOf('/flat-roof/')>-1&&order.indexOf('/skylights/')>-1);
 const rr=r.pages.find(p=>p.url===SITE+'/roof-repair/');
 assert.equal(rr.band,'4-10');assert.equal(rr.action,'QUICK_WIN');
 assert.ok(rr.click_gap>0&&Number.isInteger(rr.click_gap));
 assert.equal(rr.basis,'SITE_MEDIAN_CTR','the benchmark is this site itself');
 assert.deepEqual(rr.queries.map(q=>q.query),['roof repair near me','roof repair cost'],'queries from the page-filtered export');
 assert.equal(r.pages.find(p=>p.url===SITE+'/gutters/').queries[0].query,'gutter cleaning','queries from the page+query CSV');
 assert.equal(r.pages.find(p=>p.url===SITE+'/skylights/').action,'ZERO_CLICKS','impressions without a single click');
 assert.equal(r.pages.find(p=>p.url===SITE+'/old-page/').action,'DEEPER');
 assert.equal(r.pages.find(p=>p.url===SITE+'/').action,'KEEP');
 assert.match(r.method,/own median CTR/);assert.match(r.method,/not a forecast/);
});

test('pages entered by hand are in the report: without data they say so, with data they are compared',()=>{
 const r=build();
 const nw=r.pages.find(p=>p.url===SITE+'/new-service/');
 assert.equal(nw.source,'MANUAL');assert.equal(nw.action,'NO_DATA');assert.equal(nw.note,'Not in Search Console yet');
 const sk=r.pages.filter(p=>p.url===SITE+'/skylights/');
 assert.equal(sk.length,1,'a manual entry for a page in the export does not duplicate it');
 assert.equal(sk[0].impressions,900,'the export wins over a hand-typed number');
});

test('KPIs, and everything that is not linked to a page: search terms, countries, devices, trend',()=>{
 const r=build();
 assert.equal(r.kpis.clicks,420);assert.equal(r.kpis.impressions,9800);assert.equal(r.kpis.source,'DAILY_ROWS');
 assert.deepEqual(r.trend,{last7:{clicks:280,impressions:5600},previous7:{clicks:140,impressions:4200},clicks_change:1,impressions_change:0.3333});
 assert.equal(r.kpis.zero_click_pages,2);
 assert.ok(r.kpis.top5_click_share>0.8);
 assert.deepEqual(r.bands.map(b=>b.band),['1-3','4-10','11-20','21-40','40+']);
 assert.equal(r.queries.brand.length,1);assert.equal(r.queries.brand[0].query,'acme roofing');
 assert.deepEqual(r.queries.questions.map(q=>q.query),['how much does a roof repair cost','what is a skylight leak']);
 assert.ok(r.queries.near_top.some(q=>q.query==='roof repair near me'),'positions 4–15');
 assert.ok(r.queries.zero_click.some(q=>q.query==='what is a skylight leak'));
 assert.equal(r.queries.not_linked,true,'the site-wide search terms are not linked to a page and the report says so');
 assert.deepEqual(r.countries.find(c=>c.name==='Canada').flag,'IMPRESSIONS_NO_CLICKS');
 assert.equal(r.devices.length,3);
 assert.ok(r.notes.some(n=>/anonymi[sz]ed/i.test(n)),'Search Console leaves out anonymised queries');
});

test('nothing is invented: no outside benchmark, no gap when a band has too few pages to compare',()=>{
 const one=readUploads([{name:'one.csv',content_base64:b64('Top pages,Clicks,Impressions,CTR,Position\n'+SITE+'/a/,1,500,0.2%,6')}]);
 const r=analyze({uploads:one,manualPages:[],site:''});
 const a=r.pages[0];
 assert.equal(a.click_gap,null);assert.equal(a.basis,'TOO_FEW_PAGES_TO_COMPARE');
 assert.equal(JSON.stringify(r).match(/benchmark|industry average|expected ctr/i),null);
});

// Owner's real export of 2026-11-20 was filtered on one page and held Pages, Chart, Countries and Devices too.
test('a page-filtered export brings its own page numbers, countries, devices and trend; alone it is the report scope',()=>{
 const one=zip({'Pages.csv':'Top pages,Clicks,Impressions,CTR,Position\n'+SITE+'/geo/,55,501,10.98%,4.53',
  'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nconsultor geo,54,470,11.49%,2.64\nconsultoría geo,0,7,0%,18.43',
  'Countries.csv':'Country,Clicks,Impressions,CTR,Position\nSpain,50,301,16.61%,3.98\nColombia,0,67,0%,2.52',
  'Devices.csv':'Device,Clicks,Impressions,CTR,Position\nMobile,29,140,20.71%,4.29\nDesktop,25,345,7.25%,4.31',
  'Chart.csv':'Date,Clicks,Impressions,CTR,Position\n'+Array.from({length:14},(_,i)=>[new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),i<7?1:6,30,'x',4].join(',')).join('\n'),
  'Filters.csv':'Filter,Value\nSearch type,Web (text-based)\nDate,Last 28 days\nPage,'+SITE+'/geo/'});
 const r=analyze({uploads:readUploads([{name:'geo.zip',content_base64:b64(one)}])});
 assert.equal(r.scope,'UPLOADED_PAGES');
 const p=r.pages[0];
 assert.equal(p.clicks,55,'the page row of the export, not the sum of its search terms');assert.equal(p.impressions,501);
 assert.equal(p.queries.length,2);
 assert.equal(p.countries.find(c=>c.name==='Colombia').flag,'IMPRESSIONS_NO_CLICKS');
 assert.equal(p.devices.length,2);assert.ok(p.trend&&p.trend.last7.clicks===42);
 assert.equal(r.countries.length,2,'the only upload: its countries are the report countries');
 assert.ok(r.trend&&r.trend.clicks_change===5);
 assert.equal(r.kpis.source,'DAILY_ROWS');
 // With a site-wide export the site scope stays the site's.
 assert.equal(build().scope,'SITE');
});
test('without a site-wide export the search-term analysis uses the search terms of the uploaded pages',()=>{
 const one=zip({'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nhow much is a roof repair,0,120,0%,8\nacme roofing,9,30,30%,1.1',
  'Filters.csv':'Filter,Value\nPage,'+SITE+'/roof-repair/'});
 const r=analyze({uploads:readUploads([{name:'p.zip',content_base64:b64(one)}])});
 assert.equal(r.queries.from_pages,true);assert.equal(r.queries.not_linked,false);
 assert.deepEqual(r.queries.questions.map(q=>q.query),['how much is a roof repair']);
 assert.equal(r.queries.brand.length,1);
});
