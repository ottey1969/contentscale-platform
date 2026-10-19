'use strict';
const assert=require('node:assert/strict');
const {loadGrowthOptionalGsc}=require('./growth-optional-gsc-draft-evidence.cjs');
const source='https://site.example/',target='https://site.example/content-at-scale/';
const verified=(id,url,query,impressions,clicks,position)=>({
 page_id:id,tracker_client_id:4,source_page_url:url,evidence_scope:'page_verified',
 query,impressions,clicks,position,imported_at:'2026-10-11T11:34:03Z'
});
let calls=0;
const pool={async query(sql,args){
 calls++;
 if(sql.includes('FROM tracker_pages'))return {rows:args[0]===4&&args[1]===20?[{id:20,url:source}]:[]};
 if(sql.includes('FROM tracker_gsc_queries')){
  if(args[1]===21)return {rows:[]};
  if(args[1]===20)return {rows:[
   verified(20,source,'content scaling',3943,2,12.7),
   verified(20,source,'content at scale',4667,1159,1.42),
   verified(20,source,'content scale',866,198,1.48),
   verified(20,source,'content scaling',800,1,20),
   verified(20,source,'invalid clicks',20,900,1),
   verified(20,target,'foreign url',400,40,3),
   {...verified(20,source,'wrong scope',300,30,3),evidence_scope:'site_wide'},
   {...verified(20,source,'wrong client',400,40,3),tracker_client_id:99}
  ]};
 }
 throw Error('Unexpected SQL');
}};
(async()=>{
 const x=await loadGrowthOptionalGsc(pool,{clientId:4,targetPage:{id:21,url:target},sourcePageId:20,focusQuery:'content scaling'});
 assert.equal(x.status,'SOURCE_QUERY_VERIFIED_DESTINATION_NOT_VERIFIED');
 assert.equal(x.source_url,source);
 assert.equal(x.target_url,target);
 assert.equal(x.source_query_metrics.impressions,3943);
 assert.equal(x.source_query_metrics.clicks,2);
 assert.equal(x.destination_query_metrics,null,'Homepage measurements must not be transferred');
 assert.equal(x.protected_source_queries[0].clicks,1159);
 assert.equal(x.protected_destination_queries.length,0);
 assert.equal(x.measurement_window,'UNKNOWN');
 const wrong=await loadGrowthOptionalGsc(pool,{clientId:4,targetPage:{id:21,url:target},sourcePageId:999,focusQuery:'content scaling'});
 assert.equal(wrong.source_query_metrics,null,'Source must exist for same client');
 const none=await loadGrowthOptionalGsc({query:async()=>{throw Error('gsc unavailable')}},{
  clientId:4,targetPage:{id:21,url:target},sourcePageId:null,focusQuery:'content scaling'});
 assert.equal(none.status,'GSC_OPTIONAL_LOOKUP_UNAVAILABLE');
 assert.equal(none.gsc_required,false);
 const same=await loadGrowthOptionalGsc(pool,{clientId:4,targetPage:{id:20,url:source},sourcePageId:20,focusQuery:'content scaling'});
 assert.equal(same.status,'EXACT_DESTINATION_QUERY_VERIFIED');
 assert.equal(same.destination_query_metrics.impressions,3943);
 assert.equal(same.source_query_metrics,null,'No double-attribution');
 console.log('PASS optional GSC: same-client exact URL/query, protected wins, source not destination, missing data allowed');
})().catch(e=>{console.error(e);process.exitCode=1});
