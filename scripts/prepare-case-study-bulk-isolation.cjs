'use strict';
// Keep Case Study scans on the single-page endpoint with baseline/checkpoint guards.
// Source-text patch only; never boot the app, call providers or alter a database.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../src/index.js');
let s=fs.readFileSync(file,'utf8');
const a=s.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=s.indexOf("app.post('/api/tracker-client/:token/scan-selected', async (req, res) => {",a);
const c=s.indexOf('\nfunction _trackerBriefFrameOnly(',b);
if(a<0||b<=a||c<=b||b-a>15000||c-b>10000||Buffer.byteLength(s)<6000000)
 throw Error('STOP: unexpected canonical bulk route boundaries or source size');
let all=s.slice(a,b),selected=s.slice(b,c);
const priorityMarker='          AND COALESCE(p.manual_done,FALSE)=FALSE';
const priorityGuard="          AND NOT EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=p.id AND cs.tracker_client_id=p.tracker_client_id AND cs.status='active')";
if(!all.includes(priorityGuard)){
 if(all.split(priorityMarker).length!==2)throw Error('STOP: priority manual_done marker changed');
 all=all.replace(priorityMarker,priorityMarker+'\n'+priorityGuard);
}
const oldRx=/AND NOT \(COALESCE\((?:p|tracker_pages)\.manual_done,FALSE\) AND EXISTS \((SELECT 1 FROM tracker_case_studies cs WHERE cs\.tracker_page_id=(?:p|tracker_pages)\.id[^)]*)\)\)/g;
function patch(body,expected,name){
 let n=0;
 body=body.replace(oldRx,(_whole,subquery)=>{
   n++;
   const aliased=subquery.match(/cs\.tracker_page_id=(p|tracker_pages)\.id/);
   if(!aliased||!subquery.includes("cs.status="))throw Error('STOP: unclear active Case Study predicate in '+name);
   const alias=aliased[1];
   const quoted=subquery.includes("\\'active\\'")?"\\'active\\'":"'active'";
   return "AND NOT EXISTS (SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id="+alias+".id AND cs.tracker_client_id="+alias+".tracker_client_id AND cs.status="+quoted+")";
 });
 if(n===0){
   const matches=(body.match(/AND NOT EXISTS \(SELECT 1 FROM tracker_case_studies cs WHERE cs\.tracker_page_id=(?:p|tracker_pages)\.id/g)||[]).length;
   if(matches!==expected)throw Error('STOP: no safe '+name+' replacement; active guards='+matches);
 }else if(n!==expected)throw Error('STOP: '+name+' expected '+expected+' replacements, got '+n);
 return body;
}
all=patch(all,2,'scan-all');
selected=patch(selected,1,'scan-selected');
const combined=all+selected;
if(/COALESCE\((?:p\.)?case_study_active,FALSE\)/.test(combined)||
   /COALESCE\((?:p|tracker_pages)\.manual_done,FALSE\) AND EXISTS \(SELECT 1 FROM tracker_case_studies/.test(combined))
 throw Error('STOP: unsafe legacy bulk scan predicate remains');
if((combined.match(/AND NOT EXISTS \(SELECT 1 FROM tracker_case_studies cs/g)||[]).length!==4)
 throw Error('STOP: expected 4 canonical active Case Study guards (priority, unscanned, general, selected)');
s=s.slice(0,a)+all+selected+s.slice(c);
fs.writeFileSync(file,s);
console.log('Bulk scan modes exclude every active Case Study; single-page manual Case Study scan unchanged');
