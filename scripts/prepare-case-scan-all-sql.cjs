'use strict';
// Repair two invalid virtual case_study_active column references in scan-all SQL.
// Only modifies the canonical scan-all route; NEVER runs the application.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../src/index.js');
let s=fs.readFileSync(file,'utf8');
const start=s.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const end=s.indexOf("app.post('/api/tracker-client/:token/scan-selected'",start);
if(start<0||end<=start||end-start>15000)throw Error('STOP: scan-all route boundaries changed');
let route=s.slice(start,end);
const a='AND NOT (COALESCE(p.case_study_active,FALSE) AND COALESCE(p.manual_done,FALSE))';
const b='AND NOT (COALESCE(case_study_active,FALSE) AND COALESCE(manual_done,FALSE))';
const aa="AND NOT (COALESCE(p.manual_done,FALSE) AND EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=p.id AND cs.status='active'))";
const bb="AND NOT (COALESCE(tracker_pages.manual_done,FALSE) AND EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=tracker_pages.id AND cs.status='active'))";
if(route.includes(aa)&&route.includes(bb)&&!route.includes(a)&&!route.includes(b)){
 console.log('Canonical scan-all SQL already repaired; no changes');
 process.exit(0);
}
for(const [from,to] of [[a,aa],[b,bb]]){
 if(route.split(from).length!==2)throw Error('STOP: unexpected scan-all SQL anchor '+from);
 route=route.replace(from,to);
}
s=s.slice(0,start)+route+s.slice(end);
if(Buffer.byteLength(s)<6000000)throw Error('STOP: unexpected source truncation');
fs.writeFileSync(file,s);
console.log('Canonical scan-all SQL repaired; source bytes='+Buffer.byteLength(s));
