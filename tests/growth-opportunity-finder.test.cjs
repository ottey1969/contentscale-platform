'use strict';
// Growth Opportunity Finder. LABELLED SYNTHETIC: the per-country Search Console rows (no production export per country
// exists yet). The tracked pages and keywords are the real contentscale.site / perfectroofingteam.com pages from reports.
const test=require('node:test'),assert=require('node:assert/strict');
const {findOpportunities,serviceAreaOf}=require('../src/growth-opportunity-finder.cjs');
const {deriveMarket}=require('../src/growth-serp-quality.cjs');

const pages=[{id:2320,url:'https://contentscale.site/',keyword:'content at scale',case_study_active:true},
 {id:2295,url:'https://contentscale.site/content-scaling/',keyword:'content scaling'},
 {id:2582,url:'https://contentscale.site/generative-engine-optimization-consultant/',keyword:'generative engine optimization consultant'},
 {id:5,url:'https://contentscale.site/ai-content-quality-checker/',keyword:'ai content quality checker'}];
const R=(page_url,query,country,impressions,clicks,position)=>({page_url,query,country,impressions,clicks,position,start_date:'2026-09-30',end_date:'2026-10-27'});

test('one best opportunity across countries, with reason, action and measurement plan; no forecast',()=>{
 const rows=[R('https://contentscale.site/content-scaling/','content scaling','US',900,3,24),
  R('https://contentscale.site/content-scaling/','content scaling','GB',300,2,8.5),
  R('https://contentscale.site/content-scaling/','content scaling','NL',120,1,6),
  R('https://contentscale.site/generative-engine-optimization-consultant/','generative engine optimization consultant','NL',60,0,14),
  R('https://contentscale.site/','contentscale','NL',400,150,1),
  R('https://contentscale.site/','content at scale','US',2000,400,1.4),
  R('https://contentscale.site/','content scaling','IE',150,0,9),
  R('https://contentscale.site/ai-content-quality-checker/','content grader','US',80,0,56)];
 const f=findOpportunities({rows,pages,domain:'contentscale.site',siteMarkets:{countries:['US'],language:'en'}});
 assert.equal(f.status,'OPPORTUNITY_FOUND');
 assert.deepEqual([f.best.query,f.best.country,f.best.kind,f.best.page_url],['content scaling','US','BIGGER_EFFORT','https://contentscale.site/content-scaling/']);
 // US 900 × 0.35 = 315, GB 300 × 1 = 300, NL 120 × 1 = 120: an order, not a click forecast.
 assert.equal(f.best.country,'US');assert.equal(f.best.priority,315);assert.equal(f.runners_up[0].country,'GB');assert.equal(f.runners_up[0].kind,'QUICK_IMPROVEMENT');
 assert.match(f.best.why,/900 impressions and 3 clicks for/);
 assert.match(f.best.action,/Run the Growth research for https:\/\/contentscale\.site\/content-scaling\/ and “content scaling” in United States \(us\)/);
 assert.deepEqual(f.best.research,{type:'EXISTING_PAGE',page_id:2295,query:'content scaling',market:'US'});
 assert.match(f.best.measurement,/No result is promised/);assert.match(f.not_yet_known,/reads them before anything is proposed/);
 assert.equal(f.excluded.brand,1,'the brand term is not a growth opportunity');
 assert.equal(f.excluded.protected_page,1,'the protected homepage is not changed');assert.equal(f.excluded.already_top_with_clicks,1);
 const grader=[f.best,...f.runners_up].find(x=>x.query==='content grader');
 assert.equal(grader.kind,'POSSIBLE_NEW_PAGE','no tracked page names "grader": possibly a new page, not decided by word overlap');
 assert.match(grader.action,/^First research https:\/\/contentscale\.site\/ai-content-quality-checker\/ for “content grader” in United States \(us\): the research decides whether this existing page can serve the search/);
 assert.deepEqual(grader.research,{type:'EXISTING_PAGE',page_id:5,query:'content grader',market:'US'});
 assert.equal(grader.priority_basis,'RESEARCH_PRIORITY_NOT_A_FORECAST');
 assert(!JSON.stringify(f).match(/forecast(ed)? clicks|expected clicks|\+\d+ clicks/i));
});

test('without rows, or with too little evidence, it says so instead of inventing an opportunity',()=>{
 const none=findOpportunities({rows:[],pages,domain:'contentscale.site'});
 assert.equal(none.status,'INSUFFICIENT_DATA');assert.match(none.reason,/Growth does not guess/);assert.equal(none.best,null);
 const thin=findOpportunities({rows:[R('https://contentscale.site/content-scaling/','content scaling','US',12,0,30)],pages,domain:'contentscale.site'});
 assert.equal(thin.status,'INSUFFICIENT_DATA');assert.equal(thin.excluded.too_few_impressions,1);
});

test('a local business stays inside its service area',()=>{
 const roof=[{id:1,url:'https://perfectroofingteam.com/storm-damage-roof-repair-nj/',keyword:'storm damage roof repair nj'},
  {id:2,url:'https://perfectroofingteam.com/bergen-county-roofing-services/',keyword:'roof repair bergen county nj'}];
 const area=serviceAreaOf({pages:roof,deriveMarket});
 assert.deepEqual(area.countries,['US']);
 const rows=[R(roof[0].url,'storm damage roof repair','AU',500,0,9),R(roof[0].url,'storm damage roof repair','US',120,2,12)];
 const f=findOpportunities({rows,pages:roof,domain:'perfectroofingteam.com',serviceArea:area});
 assert.equal(f.best.country,'US');assert.equal(f.excluded.outside_service_area,1,'Australian searchers are no opportunity for a New Jersey roofer');
 assert.equal(serviceAreaOf({pages,deriveMarket}),null,'contentscale.site is not local');
});

test('top-3 positions with few clicks are a title/description question; with enough clicks they are left alone',()=>{
 const f=findOpportunities({rows:[R('https://contentscale.site/content-scaling/','content scaling','GB',800,4,2.4),R('https://contentscale.site/content-scaling/','scaling content','GB',300,30,2.1)],pages,domain:'contentscale.site'});
 assert.equal(f.best.kind,'SNIPPET');assert.match(f.best.why,/only 0\.5% of searchers click/);assert.equal(f.excluded.already_top_with_clicks,1);
});

test('Cockpit: the best opportunity is the first thing the owner sees, with a link that researches it in that country',async()=>{
 const {registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
 const trackedPages=[{id:2295,url:'https://contentscale.site/content-scaling/',keyword:'content scaling',gsc_impressions:0,gsc_clicks:0,gsc_position:0},
  {id:2582,url:'https://contentscale.site/generative-engine-optimization-consultant/',keyword:'generative engine optimization consultant',gsc_impressions:0,gsc_clicks:0,gsc_position:0}];
 const country=[R('https://contentscale.site/content-scaling/','content scaling','GB',300,2,8.5),R('https://contentscale.site/generative-engine-optimization-consultant/','generative engine optimization consultant','US',90,0,17)];
 let imported=null;const routes={},posts={};
 registerGrowthCockpit({get(p,...h){routes[p]=h},post(p,...h){posts[p]=h}},{query:async(sql,args)=>{
  if(sql.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site',token:'owner-tok'}]};
  if(sql.includes('FROM tracker_pages p'))return {rows:trackedPages};
  if(sql.includes('FROM tracker_growth_gsc_country_imports'))return {rows:[{rows_received:125000,rows_kept:2,capped:true,start_date:'2026-09-30',end_date:'2026-10-27'}]};
  if(sql.includes('FROM tracker_growth_gsc_country'))return {rows:imported?imported:country.map(r=>({...r,imported_at:'2026-10-31T10:00:00Z'}))};
  if(/INSERT INTO tracker_growth_gsc_country\(/.test(sql)){imported=[];for(let i=0;i<args.length;i+=9)imported.push({page_url:args[i+1],query:args[i+2],country:args[i+3],clicks:args[i+4],impressions:args[i+5],position:args[i+6],start_date:args[i+7],end_date:args[i+8]});return {rows:[]}}
  return {rows:[]};
 }},{gscCountry:{tokenProvider:async()=>'t',pull:async({siteUrl})=>{assert.equal(siteUrl,'sc-domain:contentscale.site');return {startDate:'2026-09-30',endDate:'2026-10-27',rows:country}}}});
 const call=async(stack,req)=>{const res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},type(){return this},json(b){this.body=b;return this},send(x){this.html=x;return this}};
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 const imp=await call(posts['/api/tracker-client/:token/growth/gsc-country-import'],{params:{token:'owner-tok'},body:{}});
 assert.equal(imp.body.success,true);assert.equal(imp.body.rows,2);assert.equal(imp.body.countries,2);
 const page=await call(routes['/track/:token/growth'],{params:{token:'owner-tok'},query:{}});
 const html=page.html,best=html.indexOf('Best opportunity — Opportunity Finder (research priority, not a prediction)'),next=html.indexOf('Your next action');
 assert(best>0&&best<next,'the opportunity comes before the old next action');
 assert.match(html,/“content scaling” in United Kingdom → https:\/\/contentscale\.site\/content-scaling\//);
 assert.match(html,/href="\/track\/owner-tok\/growth\/auto-research\?page_id=2295&amp;market=GB&amp;query=content%20scaling"/);
 assert.match(html,/Not yet known:/);assert.match(html,/Not all Search Console data was read:<\/strong> the import reached the maximum of 125,000 rows/);assert.match(html,/Next opportunities \(1\)/);
 // Without Search Console access on the server: a clear message, nothing changed.
 const noAccess={};registerGrowthCockpit({get(){},post(p,...h){noAccess[p]=h}},{query:async sql=>sql.includes('FROM tracker_clients')?{rows:[{id:10,domain:'contentscale.site',token:'owner-tok'}]}:{rows:[]}},{gscCountry:{tokenProvider:async()=>null}});
 const r=await call(noAccess['/api/tracker-client/:token/growth/gsc-country-import'],{params:{token:'owner-tok'},body:{}});
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'GSC_NOT_CONFIGURED');
});

test('the Search Console pull asks for page × query × country and turns GSC country codes into ISO alpha-2',async()=>{
 const {pullCountryRows}=require('../src/growth-gsc-country.cjs');let body=null;
 const r=await pullCountryRows({siteUrl:'sc-domain:contentscale.site',token:'t',fetchImpl:async(url,init)=>{body=JSON.parse(init.body);
  return {ok:true,json:async()=>({rows:[{keys:['https://contentscale.site/content-scaling/','Content Scaling','gbr'],clicks:2,impressions:300,position:8.5},
   {keys:['https://contentscale.site/','x','zzz'],clicks:0,impressions:5,position:3}]})}}});
 assert.deepEqual(body.dimensions,['page','query','country']);
 assert.deepEqual(r.rows,[{page_url:'https://contentscale.site/content-scaling/',query:'content scaling',country:'GB',clicks:2,impressions:300,position:8.5}]);
});

test('impressions are not customers: with the countries the owner chose, other countries stay visible but are never chosen',()=>{
 const rows=[R('https://contentscale.site/content-scaling/','content scaling','IN',3000,6,9),R('https://contentscale.site/content-scaling/','content scaling','PK',800,1,8),
  R('https://contentscale.site/content-scaling/','content scaling','US',300,2,12),R('https://contentscale.site/content-scaling/','content scaling','GB',150,1,15)];
 const open=findOpportunities({rows,pages,domain:'contentscale.site'});
 assert.equal(open.best.country,'IN','without a choice every country counts');assert.equal(open.customer_countries.set,false);
 assert.match(open.customer_countries.note,/Impressions are not customers/);
 const chosen=findOpportunities({rows,pages,domain:'contentscale.site',customerCountries:['US','GB']});
 assert.equal(chosen.best.country,'US');assert.equal(chosen.runners_up[0].country,'GB');assert.equal(chosen.excluded.outside_customer_countries,2);
 assert.deepEqual(chosen.customer_countries.outside.map(c=>c.country),['IN','PK'],'shown for information');
 assert.equal(chosen.by_country.find(c=>c.country==='IN').customer_country,false);
 const none=findOpportunities({rows:rows.slice(0,2),pages,domain:'contentscale.site',customerCountries:['US']});
 assert.equal(none.status,'INSUFFICIENT_DATA');assert.equal(none.customer_countries.outside.length,2);
});

test('Cockpit: the owner saves the countries where customers are; unknown entries are refused',async()=>{
 const {registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');let saved=null;const posts={};
 registerGrowthCockpit({get(){},post(p,...h){posts[p]=h}},{query:async(sql,args)=>{
  if(sql.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site',token:'owner-tok'}]};
  if(/INSERT INTO tracker_growth_customer_countries/.test(sql)){saved=JSON.parse(args[1]);return {rows:[]}}
  return {rows:[]}}});
 const call=async(body)=>{const stack=posts['/api/tracker-client/:token/growth/customer-countries'],req={params:{token:'owner-tok'},body},res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 assert.equal((await call({countries:'us — United States, Narnia'})).body.code,'UNKNOWN_COUNTRY');
 const ok=await call({countries:'us — United States, gb — United Kingdom, nl — Netherlands'});
 assert.deepEqual(ok.body.countries,['US','GB','NL']);assert.deepEqual(saved,['US','GB','NL']);
});

test('another tracked page about the term is the target before any new page (no duplicate pages)',()=>{
 // Google shows the checker page for "content scaling tips", but /content-scaling/ is the tracked page about it.
 const f=findOpportunities({rows:[R('https://contentscale.site/ai-content-quality-checker/','content scaling tips','US',200,1,14)],pages,domain:'contentscale.site'});
 assert.equal(f.best.kind,'OTHER_EXISTING_PAGE');assert.equal(f.best.page_url,'https://contentscale.site/ai-content-quality-checker/');
 assert.equal(f.best.shown_page_url,'https://contentscale.site/ai-content-quality-checker/');
 assert.match(f.best.why,/another tracked page/);
 assert.match(f.best.action,/Research the page Google shows/);
 // Shown only on the protected homepage and no tracked page about it: a Pre-Write brief (the homepage is not changed).
 const p=findOpportunities({rows:[R('https://contentscale.site/','content workflow audit','US',150,0,18)],pages,domain:'contentscale.site'});
 assert.equal(p.best.kind,'POSSIBLE_NEW_PAGE');assert.equal(p.best.research.type,'NEW_PAGE');assert.match(p.best.action,/protected; start a Pre-Write brief/);
});

test('a site that reaches the Search Console row limit is told that terms with few impressions may be missing',async()=>{
 const {pullCountryRows,MAX_ROWS}=require('../src/growth-gsc-country.cjs');let calls=0;
 // LABELLED SYNTHETIC: 5 full pages of 25,000 rows.
 const r=await pullCountryRows({siteUrl:'sc-domain:big.example',token:'t',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({rows:Array.from({length:25000},(_,i)=>({keys:['https://big.example/p'+calls+'-'+i,'term '+i,'usa'],clicks:0,impressions:1,position:30}))})}}});
 assert.equal(calls,5);assert.equal(r.received,MAX_ROWS);assert.equal(r.capped,true);
 const small=await pullCountryRows({siteUrl:'sc-domain:x.example',token:'t',fetchImpl:async()=>({ok:true,json:async()=>({rows:[{keys:['https://x.example/','a','usa'],clicks:0,impressions:30,position:9}]})})});
 assert.equal(small.capped,false);
});

test('page and query country totals are never attributed to a different URL',()=>{
 const rows=[R('https://contentscale.site/ai-content-quality-checker/','content scaling tips','US',450,0,7),R('https://contentscale.site/content-scaling/','content scaling tips','US',50,8,12)];
 const f=findOpportunities({rows,pages,domain:'contentscale.site'});
 assert.equal(f.best.kind,'OTHER_EXISTING_PAGE');
 assert.equal(f.best.page_url,'https://contentscale.site/ai-content-quality-checker/');
 assert.equal(f.best.impressions,450);assert.equal(f.best.clicks,0);
 assert.equal(f.best.query_country_total_impressions,500);assert.equal(f.best.query_country_total_clicks,8);
 assert.equal(f.best.research.page_id,5);
 assert.match(f.best.why,/these pages together have 500 impressions and 8 clicks/);
});
