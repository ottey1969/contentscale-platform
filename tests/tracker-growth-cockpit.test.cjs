'use strict';
const assert=require('node:assert/strict');
const {computeGrowth,bucket,registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const now=new Date('2026-10-11T12:00:00Z');
assert.equal(bucket('content at scale','contentscale.site'),'brand_or_ambiguous');
for(const q of ['contentatscale.ai','contentatscale ai detector','content scaling','scale content','sites at scale'])assert.equal(bucket(q,'contentscale.site'),'brand_or_ambiguous',q);
assert.equal(bucket('AI citations tracker','contentscale.site'),'non_brand');
const pages=[
 {id:1,url:'https://contentscale.site/',keyword:'content at scale',gsc_impressions:20847,gsc_clicks:2490,gsc_position:9.4,brief_content:{outstanding_actions:0},case_study_active:true},
 {id:2,url:'https://contentscale.site/google-penalty-recovery/',keyword:'google penalty recovery',gsc_impressions:8773,gsc_clicks:2,gsc_position:23.5,brief_content:{outstanding_actions:0}},
 {id:3,url:'https://contentscale.site/content-freshness-tactics/',keyword:'content freshness tactics',gsc_impressions:1779,gsc_clicks:0,gsc_position:11.7},
 {id:4,url:'https://app.contentscale.site/private/',keyword:'private',gsc_impressions:1000000,gsc_clicks:5,gsc_position:1}
];
const queries=[
 {page_id:1,query:'content at scale',impressions:4667,clicks:1159,evidence_scope:'page_verified',imported_at:'2026-10-11T10:00:00Z'},
 {page_id:2,query:'google penalty recovery services',position:23.5,impressions:400,clicks:0,evidence_scope:'page_verified',imported_at:'2026-10-10T10:00:00Z'},
 {page_id:2,query:'google penalty recovery services',impressions:999,clicks:99,evidence_scope:'legacy_unverified',imported_at:'2026-10-11T11:00:00Z'},
 {page_id:3,query:'content freshness seo',position:11.7,impressions:200,clicks:0,evidence_scope:'page_verified',imported_at:'2026-10-10T10:00:00Z'},
 {page_id:2,query:'google penalty recovery services',position:23.5,impressions:401,clicks:1,evidence_scope:'page_verified',imported_at:'2026-10-11T11:00:00Z'},
 {page_id:4,query:'private',impressions:99999,clicks:5,evidence_scope:'page_verified',imported_at:'2026-10-11T11:00:00Z'}
];
const growth=computeGrowth(pages,queries,'contentscale.site',now);
assert.equal(growth.pages.length,3);
assert.equal(growth.query_opportunities.length,2);
assert.equal(growth.query_opportunities[0].query,'google penalty recovery services');
assert.equal(growth.query_opportunities[0].checklist.length,4);
assert.equal(growth.query_opportunities[0].type,'RANKING_AND_CONTENT');
assert.ok(growth.query_opportunities.every(x=>!x.query.includes('content at scale')));
assert.ok(growth.query_opportunities.every(x=>!x.url.includes('app.contentscale.site')));

assert.equal(growth.non_brand.impressions,601);
assert.equal(growth.non_brand.clicks,1);
assert.equal(growth.brand_or_ambiguous.clicks,1159);
assert.equal(growth.pages[0].id,2);
assert.equal(growth.pages[0].opportunity,'RANKING_GAP');
assert.equal(growth.pages.find(x=>x.id===1).case_study_active,true);
let routes={};
registerGrowthCockpit({get(path,...handlers){routes[path]=handlers}},{
 query:async sql=>{
  if(sql.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site'}]};
  if(sql.includes('FROM tracker_pages p'))return {rows:pages};
  if(sql.includes('FROM tracker_gsc_queries q'))return {rows:queries};
  throw Error('Unexpected query');
 }
});
(async()=>{
 const handlers=routes['/api/tracker-client/:token/growth'];
 assert.equal(handlers.length,2);
 const req={params:{token:'synthetic'}};const res={json(x){this.value=x;return x},status(n){this.code=n;return this}};
 await handlers[0](req,res,()=>handlers[1](req,res));
 assert.equal(res.value.success,true);assert.equal(res.value.pages.length,3);
 const pageHandlers=routes['/track/:token/growth'];
 const htmlRes={set(){return this},type(){return this},send(x){this.html=x;return x}};
 const htmlReq={params:{token:'synthetic'}};
 await pageHandlers[0](htmlReq,htmlRes,()=>pageHandlers[1](htmlReq,htmlRes));
 assert.match(htmlRes.html,/Growth Cockpit/);
 assert.match(htmlRes.html,/Top click opportunities/);
 assert.match(htmlRes.html,/Action plan · 4 steps/);
 assert.match(htmlRes.html,/google penalty recovery services/);
 assert.match(htmlRes.html,/Case Study locked/);
 assert.doesNotMatch(htmlRes.html,/private/);
 console.log('PASS Growth Cockpit actual handlers, domain isolation, branded intent, dedupe and case history');
})().catch(e=>{console.error(e);process.exitCode=1});
