'use strict';
// Correct the canonical Tracker GET response; no DB mutation, no parallel dashboard state.
// Surgical and idempotent. Fails closed if the production source no longer matches.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let s=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(s)<6000000)throw Error('STOP: incomplete canonical ContentScale application');
const routeStart=s.indexOf("app.get('/api/tracker-client/:token', async");
const routeEnd=s.indexOf('// GET /api/tracker-client/:token/briefs/:pageId',routeStart);
if(routeStart<0||routeEnd<routeStart||routeEnd-routeStart>60000)throw Error('STOP: canonical Tracker GET route boundaries changed');
let route=s.slice(routeStart,routeEnd);
const from="SELECT id,tracker_page_id,canonical_url,status,baseline_at,baseline_data,started_at";
const to="SELECT id,tracker_page_id,canonical_url,status,baseline_at,baseline_locked,baseline_data,started_at";
if(!route.includes(to)){
 if(route.split(from).length!==2)throw Error('STOP: Case Study database SELECT anchor changed');
 route=route.replace(from,to);
}
const mapping="      _p.case_study=_cs||null;";
const mapped="      _p.case_study=_cs||null;\n      _p.case_study_baseline_locked=!!(_cs&&_cs.baseline_locked);";
if(!route.includes(mapped)){
 if(route.split(mapping).length!==2)throw Error('STOP: canonical Case Study page mapping changed');
 route=route.replace(mapping,mapped);
}
if(!route.includes(to)||!route.includes(mapped))throw Error('STOP: incomplete baseline hydration');
s=s.slice(0,routeStart)+route+s.slice(routeEnd);
// Existing NEXT ACTION remains the single authority: suppress redundant banner
// for the protected first manual scan or its explicit preparation only.
const hStart=s.indexOf('function _trackerImplementationCheckHtml(');
const hEnd=s.indexOf('\nfunction _trackerNextActionHtml(',hStart);
if(hStart<0||hEnd<hStart||hEnd-hStart>2300)throw Error('STOP: implementation panel renderer moved');
let h=s.slice(hStart,hEnd);
const before="if(nextState&&['REVIEW_BRIEF','CASE_PUBLISH_VERIFY','VERIFY_LIVE_PENDING'].includes(String(nextState.code||'')))return '';";
const after="if(nextState&&(['REVIEW_BRIEF','CASE_PUBLISH_VERIFY','VERIFY_LIVE_PENDING','PREPARE_CASE'].includes(String(nextState.code||''))||(nextState.code==='SCAN'&&p.case_study_active)))return '';";
if(!h.includes(after)){
 if(h.split(before).length!==2)throw Error('STOP: duplicate dashboard panel rule changed');
 h=h.replace(before,after);
}
s=s.slice(0,hStart)+h+s.slice(hEnd);
if(!s.includes('case_study_baseline_locked=!!(_cs&&_cs.baseline_locked)')||!s.includes('baseline_at,baseline_locked,baseline_data'))throw Error('STOP: hydration guard incomplete');
fs.writeFileSync(file,s);
console.log('Case Study baseline_locked now reaches canonical dashboard; single first-manual-scan action, zero schema writes');
