'use strict';
// Produces the full canonical index with one surgical Case Study manual-scan fix.
// Local build tool ONLY; does not import, run, or deploy ContentScale.
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../src/index.js');
const destination=process.argv[2]||path.resolve(__dirname,'../case-first-manual-index.candidate.js');
let s=fs.readFileSync(source,'utf8');
const BOOST_OLD='async function startServer() {\n  // Auto-create boost_settings table if missing\n  if (pool) {';
const BOOST_NEW='async function startServer() {\n  // Auto-create boost_settings table only outside isolated staging.\n  if (pool && !_csStagingStartupQuarantine) {';

function hardenPublicationEvidence(full){
  // Never use an old status to overwrite a publication in the active Case Study revision.
  // This is an idempotent source transform; no application modules are imported or executed.
  const at=full.indexOf("app.post('/api/tracker-client/:token/check/:pageId'");
  const end=full.indexOf("\n// Exact client-side scan status",at);
  if(at<0||end<at)throw Error('STOP: manual Case Study route boundaries changed');
  let route=full.slice(at,end);
  function single(a,b){
    if(route.includes(b))return;
    if(route.split(a).length!==2){const context=(route.match(/.{0,35}(?:_published|_caseFirstManualScan).{0,90}/g)||[]).slice(0,5);throw Error('STOP: publication anchor '+a.slice(0,45)+' matches='+(route.split(a).length-1)+' near='+JSON.stringify(context));}
    route=route.replace(a,b);
  }
  single("      const _first=await pool.query("+String.fromCharCode(96)+"SELECT cs.baseline_at,",
    "      const _publishedVersionType=Number(page.revision_cycle||1)>1?'published_implementation_r'+Number(page.revision_cycle):'published_implementation';\n      const _first=await pool.query("+String.fromCharCode(96)+"SELECT cs.baseline_at,");
  single("        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,",
    "        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,\n        (SELECT MAX(v.captured_at) FROM tracker_case_study_content_versions v\n          WHERE v.case_study_id=cs.id AND v.version_type=$3) AS current_revision_published_at,");
  single("        [cr.rows[0].id,page.id]);","        [cr.rows[0].id,page.id,_publishedVersionType]);");
  single("      const _published=Date.parse(page.brief_published_at||'')||0;",
    "      const _publicationTimes=[page.brief_published_at,page.brief_published_confirmed_at,_row.current_revision_published_at];\n      const _publishedAfterBaseline=_publicationTimes.some(t=>(Date.parse(t||'')||0)>_base);\n      // Match canonical publication evidence and never override a published revision.");
  single("!(_impl>_base)&&!(_published>_base));","!(_impl>_base)&&!_publishedAfterBaseline);");
  if(!route.includes('AS current_revision_published_at,')||!route.includes('_publishedAfterBaseline'))throw Error('STOP: publication safety not established');
  return full.slice(0,at)+route+full.slice(end);
}

if(s.includes("const CONTENTSCALE_BUILD_ID = 'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN';")){
  if(!s.includes('let _caseIsActive=false;')||!s.includes('case_study_fresh_cycle_initialized')||!s.startsWith("require('./staging/safety-gate.cjs')")){
    throw Error('STOP: candidate is only partially patched');
  }
  if(!s.includes(BOOST_NEW)){
    if(s.split(BOOST_OLD).length!==2)throw Error('STOP: staging boot SQL guard marker changed');
    s=s.replace(BOOST_OLD,BOOST_NEW);
  }
  s=hardenPublicationEvidence(s);
  fs.writeFileSync(destination,s);
  console.log('Complete candidate including publication version guard; safe idempotent verification');
  process.exit(0);
}

let applied=0;
function once(a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('STOP: unexpected '+label+' anchor count='+n);
 s=s.replace(a,b);applied++;
}
once("_csIds,['case_day_7_completed','case_day_14_completed','cycle_day_30_report']",
 "_csIds,['case_day_7_completed','case_day_14_completed','cycle_day_30_report','case_study_fresh_cycle_initialized']",'event list');
once("      _p.case_study=_cs||null;",
 "      _p.case_study=_cs||null;\n      _p.case_study_fresh_cycle_initialized=!!(_cs&&_csmByCase.get(_cs.id)&&_csmByCase.get(_cs.id).case_study_fresh_cycle_initialized);",'UI state');
const ui=[
'  // First manual scan of newly initialized Case Study, independent of scheduler.',
'  var _caseBaselineAt=p.case_study&&p.case_study.baseline_locked&&p.case_study.baseline_at?new Date(p.case_study.baseline_at).getTime():0;',
'  if(bool(p.case_study_active)&&bool(p.case_study_fresh_cycle_initialized)&&_caseBaselineAt>0&&',
'      (!scanAt||scanAt<=_caseBaselineAt)&&!bool(p.monitoring_waiting_input)&&',
'      !(publishedAt>_caseBaselineAt)&&!(verifiedAt>_caseBaselineAt)){',
"    return {code:'SCAN',label:'CASE STUDY ACTIVE · FIRST MANUAL SCAN',detail:'Protected baseline saved. Scan the live page once for this new revision. Automatic scans remain off.',color:'#86efac',border:'#16a34a',bg:'#052e16',button:'Scan current live page',buttonAction:'checkPage('+p.id+')'};",
'  }',''].join('\n');
once('  if(personalSafetyStale){',ui+'  if(personalSafetyStale){','UI action');
const route=[
'    let _caseFirstManualScan=false;',
'    let _caseIsActive=false;',
'    if(!page.monitoring_waiting_input){',
'      const _first=await pool.query(`SELECT cs.baseline_at,',
'        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,',
'        EXISTS(SELECT 1 FROM tracker_case_study_events ev WHERE ev.case_study_id=cs.id',
"          AND ev.event_type='case_study_fresh_cycle_initialized') AS fresh_cycle_initialized",
'        FROM tracker_case_studies cs WHERE cs.tracker_client_id=$1 AND cs.tracker_page_id=$2',
"        AND cs.status='active' AND cs.baseline_locked=TRUE ORDER BY cs.id DESC LIMIT 1`,",
'        [cr.rows[0].id,page.id]);',
'      const _row=_first.rows[0]||{};',
'      _caseIsActive=!!_row.baseline_at;',
"      const _base=Date.parse(_row.baseline_at||'')||0;",
"      const _last=Date.parse(_row.latest_snapshot_at||'')||0;",
"      const _impl=Date.parse(page.implementation_verified_at||'')||0;",
"      const _published=Date.parse(page.brief_published_at||'')||0;",
'      _caseFirstManualScan=!!(_base&&(!_last||_last<=_base)&&_row.fresh_cycle_initialized&&',
'        !(_impl>_base)&&!(_published>_base));',
'    }',
'    const normalScanGate=_trackerNormalScanGate(page);',
'    if(!normalScanGate.allowed&&!page.monitoring_waiting_input&&!_caseFirstManualScan){'
].join('\n');
once("    const normalScanGate=_trackerNormalScanGate(page);\n    if(!normalScanGate.allowed&&!page.monitoring_waiting_input){",route,'server route');
once("if(page.case_study_active&&page.manual_done&&!page.monitoring_waiting_input&&!_claimsFactsNewerThanBrief&&!_savedBriefSafetyStale){",
 "if(_caseIsActive&&page.manual_done&&!page.monitoring_waiting_input&&!_claimsFactsNewerThanBrief&&!_savedBriefSafetyStale&&!_caseFirstManualScan){",'manual Done');
once("const CONTENTSCALE_BUILD_ID = 'CS-2026-10-08-CANONICAL-v567-OUTREACH-BATCH-PACING';",
 "const CONTENTSCALE_BUILD_ID = 'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN';",'build ID');
once("  build: 'CS-2026-10-08-CANONICAL-v567-OUTREACH-BATCH-PACING',",
 "  build: 'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN',",'build info');
once(BOOST_OLD,BOOST_NEW,'staging startup boost table write guard');
if(applied!==8||Buffer.byteLength(s)<6000000||!s.startsWith("require('./staging/safety-gate.cjs')"))throw Error('STOP: source invariant failed');
// Staging startup fence intentionally remains; this candidate must NOT be deployed.
s=hardenPublicationEvidence(s);
fs.writeFileSync(destination,s);
console.log('Candidate prepared; anchors='+applied+' bytes='+Buffer.byteLength(s)+' output='+destination);
