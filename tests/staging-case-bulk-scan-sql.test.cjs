'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=src.indexOf("app.post('/api/tracker-client/:token/scan-selected', async (req, res) => {",a);
const c=src.indexOf('\nfunction _trackerBriefFrameOnly(',b);
assert(a>0&&b>a&&c>b&&c-b<10000,'Bulk scan route markers changed');
const all=src.slice(a,b),selected=src.slice(b,c);
test('scan-all does not query computed virtual case_study_active column',()=>{
 assert.doesNotMatch(all,/COALESCE\((?:p\.)?case_study_active\s*,/);
 assert.match(all,/tracker_case_studies cs WHERE cs\.tracker_page_id=p\.id/);
 assert.match(all,/tracker_case_studies cs WHERE cs\.tracker_page_id=tracker_pages\.id/);
});
test('scan-selected uses persisted Case Study ownership and active status',()=>{
 assert.doesNotMatch(selected,/COALESCE\((?:p\.)?case_study_active\s*,/);
 assert.match(selected,/cs\.tracker_page_id=tracker_pages\.id/);
 assert.match(selected,/cs\.tracker_client_id=tracker_pages\.tracker_client_id/);
 assert.match(selected,/cs\.status=/);
});
test('bulk routes still exclude completed active Case Studies, without enabling scheduler',()=>{
 assert.match(all,/COALESCE\(p\.manual_done,FALSE\) AND EXISTS/);
 assert.match(selected,/COALESCE\(tracker_pages\.manual_done,FALSE\) AND EXISTS/);
 assert(!all.includes("ENABLE_TRACKER_SCHEDULER='1'"));
});
