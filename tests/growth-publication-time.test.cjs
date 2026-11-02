'use strict';
// Owner 2026-11-02: "Provide the actual publication time from the past year" — the time was later than now, but the
// message did not say so. The checks now name the problem; the form defaults to now and cannot pick a future time.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {validPublish}=require('../src/tracker-growth-execution.cjs');
const b={url:'https://contentscale.site/content-scaling/',query:'content scaling',notes:'Added four sections.'};
test('a future time, a missing time and a time over a year ago each get their own message',()=>{
 assert.match(validPublish({...b,published_at:new Date(Date.now()+12*3600e3).toISOString()}),/^The publication time is in the future \(.* UTC; now .* UTC\)\. Enter when the change actually went live \(check AM\/PM\)/);
 assert.match(validPublish({...b,published_at:''}),/Enter the date and time the change went live/);
 assert.match(validPublish({...b,published_at:new Date(Date.now()-400*86400e3).toISOString()}),/more than a year ago/);
 assert.equal(validPublish({...b,published_at:new Date(Date.now()-3600e3).toISOString()}),null);
 assert.equal(validPublish({...b,published_at:new Date(Date.now()+60e3).toISOString()}),null,'a clock a minute ahead is fine');
});
test('the CMS page defaults to now, cannot pick the future, and explains a future time in local time',()=>{
 const js=fs.readFileSync(require.resolve('../public/growth-cms-neutral-handoff.js'),'utf8'),html=fs.readFileSync(require.resolve('../public/growth-cms-neutral-handoff.html'),'utf8');
 assert.match(js,/pa\.max=localNow\(\);if\(!pa\.value\)pa\.value=localNow\(\)/);
 assert.match(js,/is later than now \(/);assert.match(html,/<form id="publicationForm" novalidate>/);
});
