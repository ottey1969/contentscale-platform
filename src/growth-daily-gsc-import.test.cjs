'use strict';
const assert=require('node:assert/strict');
const {importVerifiedDailyGrowthGsc,validateProperty}=require('./growth-daily-gsc-import.cjs');
const url='https://contentscale.site/aeo-vs-geo-vs-seo/',property='sc-domain:contentscale.site';
const calls=[];const connection={query:async(sql,args)=>{calls.push({sql,args});
 if(sql.includes('SELECT url FROM tracker_pages'))return{rows:[{url}]};
 return{rows:[]}},release(){}};
const db={connect:async()=>connection};
const fetchImpl=async(request,init)=>{const body=JSON.parse(init.body);
 assert.equal(body.dimensions[0],'date');
 assert.equal(body.dimensionFilterGroups[0].filters[0].expression,url);
 return {ok:true,json:async()=>({rows:[{keys:['2026-09-02'],clicks:8,impressions:200},
 {keys:['2026-09-03'],clicks:4,impressions:100}]})};};
(async()=>{
 assert(validateProperty(property,url));
 assert(!validateProperty('sc-domain:competitor.com',url));
 // URL-prefix scopes must not match lookalike domains, sibling paths, ports or credentials.
 assert(validateProperty('https://contentscale.site/',url));
 assert(validateProperty('https://contentscale.site/aeo-vs-geo-vs-seo/',url));
 assert(!validateProperty('https://contentscale.site/aeo-vs-geo-vs-seo/','https://contentscale.site/aeo-vs-geo-vs-seo-extra/'));
 assert(!validateProperty('https://contentscale.site/roof/','https://contentscale.site/roofing/'));
 assert(validateProperty('https://contentscale.site/roof/','https://contentscale.site/roof/repair/'));
 assert(!validateProperty('https://contentscale.site/roof/','https://contentscale.site.evil.example/roof/'));
 assert(!validateProperty('https://contentscale.site:443/roof/','https://contentscale.site/roof/'));
 assert(!validateProperty('https://user:pass@contentscale.site/roof/','https://contentscale.site/roof/'));
 assert(!validateProperty('https://contentscale.site/roof/?query=1','https://contentscale.site/roof/'));

 const out=await importVerifiedDailyGrowthGsc({db,clientId:10,pageId:20,pageUrl:url,gscProperty:property,
  accessToken:'sample-token-test',startDate:'2026-09-01',endDate:'2026-09-04',fetchImpl});
 assert.equal(out.verified_dates,2);
 assert.equal(out.missing_dates_not_assumed_zero,2);
 assert.equal(calls.filter(x=>x.sql.includes('INSERT INTO growth_gsc_daily')).length,2);
 assert(calls.some(x=>x.sql==='COMMIT'));
 await assert.rejects(()=>importVerifiedDailyGrowthGsc({db,clientId:10,pageId:20,pageUrl:url,
  gscProperty:'sc-domain:other.site',accessToken:'sample-token-test',
  startDate:'2026-09-01',endDate:'2026-09-04',fetchImpl}),/IDENTITY/);
 const badFetch=async()=>({ok:true,json:async()=>({rows:[{keys:['2026-09-02'],clicks:9,impressions:1}]})});
 await assert.rejects(()=>importVerifiedDailyGrowthGsc({db,clientId:10,pageId:20,pageUrl:url,
  gscProperty:property,accessToken:'sample-token-test',startDate:'2026-09-01',
  endDate:'2026-09-04',fetchImpl:badFetch}),/REJECTED/);
 console.log('PASS: authorized exact-page GSC import, transactional writes and missing dates');
})().catch(e=>{console.error(e);process.exitCode=1});
