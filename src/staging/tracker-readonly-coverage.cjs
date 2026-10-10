'use strict';
// Read SOURCE TEXT ONLY. This code never imports ContentScale or enables providers.
const fs=require('node:fs'),path=require('node:path');
const MARKERS=Object.freeze([
 "app.get('/api/tracker-client/:token/pages/:pageId/case-study'",
 "app.get('/case-study-report/:reportToken'",
 "app.get('/api/admin/tracker-clients/:id/monitoring'",
 "app.get('/api/admin/tracker-readiness'"
]);
function assessCanonicalReadRoutes(source=fs.readFileSync(path.resolve(__dirname,'../index.js'),'utf8')){
 const covered=[];
 for(const marker of MARKERS){
  const at=source.indexOf(marker),next=source.indexOf('\napp.',at+marker.length);
  const body=at>=0?source.slice(at,next>at?next:at+6000):'';
  covered.push(Boolean(body.includes('_trackerCaseStudyReadonlySchema(')&&
   !/await _ensureCaseStudySchema\(\)|await _ensureMonitoringGateSchema\(\)|await _trackerEnsureAiEvidenceSchema\(\)/.test(body)));
 }
 const preMarker="app.get('/api/tracker-client/:token/prewrite-briefs/:id'";
 const preAt=source.indexOf(preMarker),preNext=source.indexOf('\napp.',preAt+preMarker.length);
 const preBody=preAt>=0?source.slice(preAt,preNext>preAt?preNext:preAt+11000):'';
 const prewriteGetFound=preAt>=0&&preNext>preAt&&source.indexOf(preMarker,preAt+preMarker.length)===-1;
 const prewriteGetWrites=prewriteGetFound&&/\b(?:UPDATE\s+(?:ONLY\s+)?(?:public\.)?prewrite_briefs\b|INSERT\s+INTO\s+(?:public\.)?prewrite_briefs\b|DELETE\s+FROM\s+(?:public\.)?prewrite_briefs\b|ALTER\s+TABLE\s+(?:public\.)?prewrite_briefs\b|TRUNCATE\s+(?:TABLE\s+)?(?:public\.)?prewrite_briefs\b)/i.test(preBody);
 const historicalAutoAttachDormant=source.includes('async function _ensurePerfectRoofingCaseStudy(')&&
   !source.includes('await _ensurePerfectRoofingCaseStudy(');
 return Object.freeze({
  case_study_get_routes_read_only:covered.length===4&&covered.every(Boolean),
  verified_case_study_get_routes:covered.filter(Boolean).length,
  expected_case_study_get_routes:MARKERS.length,
  prewrite_get_implicit_write_review:!prewriteGetFound||prewriteGetWrites,
  historical_PRT_auto_attach_dormant:historicalAutoAttachDormant,
  full_app_started:false,
  source_inspection_only:true
 });
}
module.exports={assessCanonicalReadRoutes,MARKERS};
