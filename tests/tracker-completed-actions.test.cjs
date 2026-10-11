'use strict';
const assert=require('node:assert/strict');
const {cleanTrackerBriefs}=require('../src/brief-quality-hook');
const past={system:'Google AIO',priority:'high',title:'Improve emergency dispatch CTA',action:'Add verified emergency dispatch details above the fold',expected_impact:'User clarity'};
const extra={system:'Google AIO',priority:'medium',title:'Add missing roof insurance FAQ',action:'Add a sourced insurance coverage FAQ on emergency roofing',expected_impact:'User clarity'};
const page={url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',keyword:'24 hour emergency roof repair nj',gsc_impressions:6302,gsc_clicks:2,gsc_position:41.6,
 brief_content:{manual_resolutions:[{decision:'AUTO_VERIFIED_LIVE',title:past.title,action:past,cycle_id:'case-1'}]}};
const r=cleanTrackerBriefs({page,recommendations:[past,extra],gscBrief:[]});
assert.equal(r.report.completed_actions_suppressed,1);
assert.ok(!r.recommendations.some(x=>x.title===past.title),'Closed implementation action must not reappear');
assert.ok(r.recommendations.some(x=>x.title===extra.title),'New evidence-backed action may remain');
const raw=cleanTrackerBriefs({page:{...page,brief_content:{}},recommendations:[past],gscBrief:[]});
assert.ok(raw.recommendations.some(x=>x.title===past.title),'Do not suppress work without a persistent resolution');
console.log('PASS completed Tracker Brief actions stay closed; independent new tasks can remain');
