'use strict';
// Active Case Studies are NEVER bulk targets; only their explicit per-page manual route may scan.
// Source-only transformation. Idempotent and fail-closed on unexpected route changes.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let source=fs.readFileSync(file,'utf8');
const a=source.indexOf("app.post('/api/tracker-client/:token/scan-all', async (req, res) => {");
const b=source.indexOf("app.post('/api/tracker-client/:token/scan-selected', async (req, res) => {",a);
const c=source.indexOf('\nfunction _trackerBriefFrameOnly(',b);
if(a<0||b<a||c<b||b-a>15000||c-b>10000||Buffer.byteLength(source)<6000000)
 throw Error('STOP: full canonical bulk scan route structure changed');
const activePlain="cs.status='active'",activeEsc=String.raw`cs.status=\'active\'`;
const condition=ref=>`SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=${ref}.id AND cs.tracker_client_id=${ref}.tracker_client_id AND ${ref==='p'?activePlain:activeEsc}`;
const legacyP='AND NOT (COALESCE(p.case_study_active,FALSE) AND COALESCE(p.manual_done,FALSE))';
const legacyU='AND NOT (COALESCE(case_study_active,FALSE) AND COALESCE(manual_done,FALSE))';
const oldP=`AND NOT (COALESCE(p.manual_done,FALSE) AND EXISTS (${condition('p')}))`;
const oldU=`AND NOT (COALESCE(tracker_pages.manual_done,FALSE) AND EXISTS (${condition('tracker_pages')}))`;
const nowP=`AND NOT EXISTS (${condition('p')})`;
const nowU=`AND NOT EXISTS (${condition('tracker_pages')})`;
let all=source.slice(a,b),selected=source.slice(b,c);
function patch(chunk,oldLegacy,oldCandidate,updated,label){
 const desiredCount=chunk.split(updated).length-1;
 if(desiredCount===1)return chunk;
 if(desiredCount!==0)throw Error('STOP: duplicate active Case Study exclusion '+label);
 const options=[oldLegacy,oldCandidate].filter(s=>chunk.includes(s));
 if(options.length!==1||chunk.split(options[0]).length!==2)throw Error('STOP: bulk route anchor mismatch '+label);
 return chunk.replace(options[0],updated);
}
all=patch(all,legacyP,oldP,nowP,'scan-all alias p');
all=patch(all,legacyU,oldU,nowU,'scan-all tracker_pages');
selected=patch(selected,legacyU,oldU,nowU,'scan-selected tracker_pages');
if(/COALESCE\((?:p\.)?case_study_active\s*,/.test(all+selected)||/COALESCE\((?:p|tracker_pages)\.manual_done,FALSE\) AND EXISTS/.test(all+selected))
 throw Error('STOP: active Case Study bulk exclusion still conditional on manual_done');
source=source.slice(0,a)+all+selected+source.slice(c);
fs.writeFileSync(file,source);
console.log('Bulk scans now exclude every active Case Study regardless of Done state; no app boot');
