'use strict';
const assert=require('node:assert/strict');
const {compareGrowthGscWindows}=require('./growth-gsc-window-comparison.cjs');
const pageUrl='https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/';
const run=(start_date,end_date,impressions,clicks,extra={})=>({
 page_url:pageUrl,gsc_property:'sc-domain:perfectroofingteam.com',
 start_date,end_date,impressions,clicks,query_count:10,position:40,imported_at:'2026-10-14T00:00:00Z',...extra
});
const previous=run('2026-08-18','2026-09-14',17822,1,{position:49.7});
const current=run('2026-09-15','2026-10-12',7435,2,{position:41.6});
let a=compareGrowthGscWindows({pageUrl,runs:[current,previous]});
assert.equal(a.status,'READY_FOR_RESULT_REVIEW');
assert.equal(a.current.days,28);
assert.equal(a.changes.impressions,-10387);
assert.equal(a.changes.clicks,1);
assert.equal(a.changes.clicks_change_percent,100);
assert(Math.abs(a.changes.avg_position_improvement-8.1)<0.00001);
assert.equal(a.attribution_established,false);
assert.equal(a.call_and_job_conversions_measured,false);
a=compareGrowthGscWindows({pageUrl,runs:[current,run('2026-09-01','2026-09-28',10000,1)]});
assert.equal(a.status,'COMPARABLE_NONOVERLAPPING_WINDOW_REQUIRED','rolling overlapping windows cannot claim improvement');
a=compareGrowthGscWindows({pageUrl,runs:[current,run('2026-08-18','2026-09-14',10000,1,{gsc_property:'https://perfectroofingteam.com/'})]});
assert.equal(a.status,'COMPARABLE_NONOVERLAPPING_WINDOW_REQUIRED','different GSC property cannot be compared');
a=compareGrowthGscWindows({pageUrl,runs:[current,run('2026-08-17','2026-09-13',10000,1)]});
assert.equal(a.status,'COMPARABLE_NONOVERLAPPING_WINDOW_REQUIRED','one day coverage gap is not continuous');
a=compareGrowthGscWindows({pageUrl,runs:[current,run('2026-08-18','2026-09-14',10000,1,{page_url:'http://www.perfectroofingteam.com/'})]});
assert.equal(a.status,'COMPARABLE_NONOVERLAPPING_WINDOW_REQUIRED','legacy http/www property URL must not contaminate exact page');
a=compareGrowthGscWindows({pageUrl,runs:[run('2026-09-15','2026-10-12',100,0),run('2026-08-18','2026-09-14',100,0)]});
assert.equal(a.status,'READY_FOR_RESULT_REVIEW');
assert.equal(a.changes.clicks_change_percent,null,'zero click baseline cannot yield fake percentage uplift');
a=compareGrowthGscWindows({pageUrl,runs:[]});
assert.equal(a.status,'NO_VERIFIED_GSC_HISTORY');
a=compareGrowthGscWindows({pageUrl,runs:[run('2026-10-02','2026-09-01',20,0)]});
assert.equal(a.status,'NO_VERIFIED_GSC_HISTORY','invalid date ordering rejected');
a=compareGrowthGscWindows({pageUrl,runs:[current,previous,run('2026-09-15','2026-10-12',500,0,{imported_at:'2026-10-11T00:00:00Z'})]});
assert.equal(a.current.impressions,7435,'freshest import for same dates wins');
console.log('PASS: exact-page non-overlapping GSC outcome windows, provenance, zero-click rates and no causal/revenue claims');
