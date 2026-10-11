'use strict';
const assert=require('node:assert/strict');
const {buildTrackerGrowthPlan}=require('../src/tracker-growth-plan.cjs');
const now=new Date('2026-10-11T00:00:00Z');
const page={url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',keyword:'24 hour emergency roof repair nj',gsc_impressions:6302,gsc_clicks:2,gsc_position:41.6};
const queries=[
 {query:'emergency roof repair nj',impressions:839,clicks:0,position:41.7,evidence_scope:'page_verified',imported_at:'2026-09-24'},
 {query:'emergency roof repair hudson county',impressions:492,clicks:0,position:47.4,evidence_scope:'page_verified',imported_at:'2026-09-24'},
 {query:'emergency roof repair newark north',impressions:200,clicks:0,position:42,evidence_scope:'page_verified',imported_at:'2026-09-24'}
];
const existing=[page,{url:'https://perfectroofingteam.com/hudson-county-roofing-services/',keyword:'hudson county roofing services'}];
const p=buildTrackerGrowthPlan({page,queries,sitePages:existing,now});
assert.equal(p.mode,'GROWTH_NOT_DEFECTS');
assert.equal(p.metrics.ctr,0.032);
assert.equal(p.opportunities[0].type,'OPTIMIZE_EXISTING_PAGE');
assert.ok(p.opportunities.every(x=>x.type!=='RESEARCH_SPOKE_CANDIDATE'||x.seed_query!=='emergency roof repair hudson county'),
  'Existing Hudson County page cannot be invented as a missing spoke');
assert.equal(p.opportunities.filter(x=>x.type==='RESEARCH_SPOKE_CANDIDATE').length,1);
assert.equal(p.opportunities[1].seed_query,'emergency roof repair newark north');
assert.equal(p.opportunities[1].priority,'REVIEW');
const stale=buildTrackerGrowthPlan({page,queries:queries.map(q=>({...q,imported_at:'2025-01-01'})),sitePages:existing,now});
assert.equal(stale.verified,false);
assert.equal(stale.opportunities.filter(x=>x.type==='RESEARCH_SPOKE_CANDIDATE').length,0);
const zero=buildTrackerGrowthPlan({page:{url:page.url,keyword:page.keyword,gsc_impressions:100,gsc_clicks:2,gsc_position:8},queries:[],sitePages:existing,now});
assert.equal(zero.opportunities.length,0);
console.log('PASS verified GSC ranking priority, existing spoke avoidance, no invented growth with stale evidence, valid zero');
