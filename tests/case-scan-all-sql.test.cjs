'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=s.indexOf("app.post('/api/tracker-client/:token/scan-selected'",a);
test('scan-all never references nonexistent tracker_pages.case_study_active',()=>{
 assert(a>0&&b>a&&b-a<15000);
 const route=s.slice(a,b);
 assert.doesNotMatch(route,/COALESCE\((?:p\.)?case_study_active\s*,/);
 assert.match(route,/EXISTS \(SELECT 1 FROM tracker_case_studies cs WHERE cs\.tracker_page_id=p\.id/);
 assert.match(route,/EXISTS \(SELECT 1 FROM tracker_case_studies cs WHERE cs\.tracker_page_id=tracker_pages\.id/);
});
