'use strict';
const assert=require('node:assert/strict');
const {loadVerifiedDailyGrowthGsc:load}=require('./growth-gsc-daily-loader.cjs');
const url='https://example.test/seo/';
(async()=>{
 let queries=0;
 const pool={query:async(sql,args)=>{queries++;assert(sql.includes('verified=TRUE'));assert.deepEqual(args,[1,2,url]);return{rows:[{page_url:url,gsc_property:'sc-domain:example.test',date:'2026-08-20',search_type:'web',clicks:6,impressions:80,nonbrand_clicks:4,verified:true,evidence_source:'reviewed_gsc_export'}]}}};
 let r=await load(pool,{clientId:1,pageId:2,pageUrl:url});
 assert.equal(r.status,'VERIFIED_DAILY_GSC_LOADED');assert.equal(r.rows[0].nonbrand_clicks,4);
 assert.equal(queries,1);
 r=await load({query:async()=>{throw Object.assign(Error('missing'),{code:'42P01'})}},{clientId:1,pageId:2,pageUrl:url});
 assert.equal(r.status,'DAILY_GSC_SCHEMA_NOT_INSTALLED');
 r=await load({query:async()=>({rows:[{gsc_property:'a'},{gsc_property:'b'}]})},{clientId:1,pageId:2,pageUrl:url});
 assert.equal(r.status,'MULTIPLE_GSC_PROPERTIES_REQUIRE_REVIEW');
 await assert.rejects(()=>load(pool,{clientId:0,pageId:2,pageUrl:url}),/EXACT_PAGE_IDENTITY_REQUIRED/);
 console.log('PASS: tenant-scoped verified daily GSC read; missing schema and conflicting properties fail closed');
})().catch(e=>{console.error(e);process.exitCode=1});
