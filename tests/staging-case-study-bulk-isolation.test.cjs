'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=src.indexOf("app.post('/api/tracker-client/:token/scan-selected', async (req, res) => {",a);
const c=src.indexOf('\nfunction _trackerBriefFrameOnly(',b);
assert(a>=0&&b>a&&c>b&&b-a<15000&&c-b<10000,'Bulk route boundaries changed');
const all=src.slice(a,b),selected=src.slice(b,c);
const guards=(s)=>(s.match(/AND NOT EXISTS \(SELECT 1 FROM tracker_case_studies cs WHERE cs\.tracker_page_id=(?:p|tracker_pages)\.id AND cs\.tracker_client_id=(?:p|tracker_pages)\.tracker_client_id AND cs\.status=/g)||[]).length;
test('all three scan-all modes filter out active Case Studies irrespective of manual_done',()=>{
 assert.equal(guards(all),3,'priority, unscanned, normal modes must all guard active Case Studies');
 assert.match(all,/COALESCE\(p\.manual_done,FALSE\)=FALSE\s+AND NOT EXISTS/);
});
test('scan-selected never bypasses the guarded single-page manual Case Study workflow',()=>{
 assert.equal(guards(selected),1);
 assert.doesNotMatch(selected,/COALESCE\(tracker_pages\.manual_done,FALSE\) AND EXISTS/);
});
test('Case Study membership uses canonical persisted client and page relationship',()=>{
 assert.equal(guards(all+selected),4);
 assert.doesNotMatch(all+selected,/COALESCE\((?:p\.)?case_study_active,FALSE\)/);
 assert.doesNotMatch(all+selected,/COALESCE\((?:p|tracker_pages)\.manual_done,FALSE\) AND EXISTS \(SELECT 1 FROM tracker_case_studies/);
 assert.match(all,/const blocked=pages\.rows\.filter\(p=>!_trackerNormalScanGate\(p\)\.allowed\)/);
});
test('individual manual Case Study route remains present separately',()=>{
 assert.match(src,/app\.post\('\/api\/tracker-client\/:token\/check\/:pageId'/);
 assert.match(src,/_caseFirstManualScan/);
});
