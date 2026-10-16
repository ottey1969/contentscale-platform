'use strict';
const assert=require('node:assert/strict');
const {readVerifiedDailyGrowthGsc}=require('./growth-daily-gsc-reader.cjs');
const url='https://example.test/seo/';
let calls=0;
const pool={query:async(sql,args)=>{calls++;assert(sql.includes('tracker_client_id=$1'));assert(sql.includes('verified=TRUE'));assert.deepEqual(args,[5,8,url]);return {rows:[{page_url:url,gsc_property:'sc-domain:example.test',date:new Date('2026-09-02T00:00:00Z'),search_type:'web',clicks:4,impressions:20,nonbrand_clicks:3,verified:true}]}}};
(async()=>{
 const result=await readVerifiedDailyGrowthGsc(pool,{clientId:5,pageId:8,pageUrl:url});
 assert.equal(result.status,'VERIFIED_DAILY_GSC_ROWS');
 assert.equal(result.rows[0].date,'2026-09-02');assert.equal(calls,1);
 const empty=await readVerifiedDailyGrowthGsc({query:async()=>({rows:[]})},{clientId:5,pageId:8,pageUrl:url});
 assert.equal(empty.status,'NO_VERIFIED_DAILY_GSC');
 await assert.rejects(()=>readVerifiedDailyGrowthGsc(pool,{clientId:5,pageId:8,pageUrl:'http://example.test'}),/CANONICAL/);
 console.log('PASS: canonical verified daily GSC reader');
})().catch(e=>{console.error(e);process.exitCode=1});
