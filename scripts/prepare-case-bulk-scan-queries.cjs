'use strict';
// Surgical correction of virtual case_study_active in scan-all and scan-selected.
// Never import the application. All changes are idempotent; fail closed on route drift.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../src/index.js');
let source=fs.readFileSync(file,'utf8');
const a=source.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=source.indexOf("app.post('/api/tracker-client/:token/scan-selected', async (req, res) => {",a);
const c=source.indexOf('\nfunction _trackerBriefFrameOnly(',b);
if(a<0||b<a||c<b||b-a>15000||c-b>10000)throw Error('STOP: bulk-scan route boundaries changed');
const replacements=[
 {from:'AND NOT (COALESCE(p.case_study_active,FALSE) AND COALESCE(p.manual_done,FALSE))',to:"AND NOT (COALESCE(p.manual_done,FALSE) AND EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=p.id AND cs.tracker_client_id=p.tracker_client_id AND cs.status='active'))",target:'all'},
 {from:'AND NOT (COALESCE(case_study_active,FALSE) AND COALESCE(manual_done,FALSE))',to:"AND NOT (COALESCE(tracker_pages.manual_done,FALSE) AND EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=tracker_pages.id AND cs.tracker_client_id=tracker_pages.tracker_client_id AND cs.status=\\'active\\'))",target:'all'},
 {from:'AND NOT (COALESCE(case_study_active,FALSE) AND COALESCE(manual_done,FALSE))',to:"AND NOT (COALESCE(tracker_pages.manual_done,FALSE) AND EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=tracker_pages.id AND cs.tracker_client_id=tracker_pages.tracker_client_id AND cs.status=\\'active\\'))",target:'selected'}
];
let all=source.slice(a,b),sel=source.slice(b,c);
for(const x of replacements){
 let chunk=x.target==='all'?all:sel;
 const count=chunk.split(x.from).length-1;
 if(count===1)chunk=chunk.replace(x.from,x.to);
 else if(count===0&&chunk.includes(x.to)){}
 else {const near=(chunk.match(/.{0,65}(?:case_study_active|tracker_case_studies|manual_done).{0,95}/g)||[]).slice(0,8);throw Error('STOP: unexpected bulk query anchor: '+x.target+' count='+count+' near='+JSON.stringify(near));}
 if(x.target==='all')all=chunk;else sel=chunk;
}
if(/COALESCE\((?:p\.)?case_study_active\s*,/.test(all+sel))throw Error('STOP: virtual SQL field survives');
source=source.slice(0,a)+all+sel+source.slice(c);
if(Buffer.byteLength(source)<6000000)throw Error('STOP: incomplete source');
fs.writeFileSync(file,source);
console.log('Canonical scan-all and scan-selected queries repaired; no app boot');
