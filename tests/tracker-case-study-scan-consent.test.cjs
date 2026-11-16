'use strict';
// Regression: ending a Case Study is a hard stop, not merely a missing active lock.
// No scan (including direct API or bulk route) until the owner explicitly authorizes ONE new manual scan.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
test('end writes a durable closeout timestamp, stops monitoring and removes every pending checkpoint',()=>{
 const a=src.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/end'");
 const b=src.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/new-revision'",a);
 assert(a>0&&b>a);
 const h=src.slice(a,b);
 assert.match(h,/case_study_ended_at=NOW\(\)/);
 assert.match(h,/case_study_scan_authorized_at=NULL/);
 assert.match(h,/check_frequency='0'/);
 assert.match(h,/next_check_at=NULL/);
 assert.match(h,/monitoring_waiting_input=FALSE/);
 assert.match(h,/monitoring_request_at=NULL/);
 assert.match(h,/monitoring_gate_label=NULL/);
 assert.match(h,/RETURNING case_study_ended_at/);
});
test('scan route checks reauthorization before the scan engine and consumes it once',()=>{
 const a=src.indexOf("app.post('/api/tracker-client/:token/check/:pageId'");
 const b=src.indexOf("const normalScanGate=_trackerNormalScanGate(page);",a);
 assert(a>0&&b>a);
 const h=src.slice(a,b);
 assert.match(h,/case_study_ended_at/);
 assert.match(h,/CASE_STUDY_SCAN_REAUTHORIZATION_REQUIRED/);
 const part=src.slice(b,b+15000);
 assert.match(part,/case_study_scan_authorized_at/);
 assert.match(part,/case_study_scan_authorized_at=NULL/);
});
test('page UI shows ended date and requests permission, never reuses historical READY baseline',()=>{
 assert.match(src,/case_study_ended_at/);
 assert.match(src,/authorizeCaseStudyScan\(/);
 assert.match(src,/Case Study ended/);
 assert.match(src,/Scan permission required/);
 assert.match(src,/scan_permission_required/);
 assert.match(src,/code:'CASE_STUDY_ENDED'/);
 assert.match(src,/if\(p&&p\.case_study_ended_at&&!p\.case_study_active\)return ''/);
});
