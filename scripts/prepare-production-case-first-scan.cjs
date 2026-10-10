'use strict';
// Build ONLY from verified production v567, on a detached release candidate.
// No app import, DB access, external API call, production ref change or deployment.
const fs=require('node:fs'),path=require('node:path');
const src=path.resolve(process.argv[2]||'src/index.js');
let s=fs.readFileSync(src,'utf8');
const OLD='CS-2026-10-08-CANONICAL-v567-OUTREACH-BATCH-PACING';
const NEW='CS-2026-10-10-CANONICAL-v568-CASE-STUDY-FIRST-MANUAL-SCAN';
if(Buffer.byteLength(s)<6000000||s.includes('_csStagingStartupQuarantine')||s.startsWith("require('./staging/safety-gate.cjs')"))
 throw Error('STOP: not the safe production canonical source');
if(s.includes("const CONTENTSCALE_BUILD_ID = '"+NEW+"';")){
 if(!s.includes('_caseFirstManualScan')||!s.includes("AS current_revision_published_at,")||!s.includes('case_study_fresh_cycle_initialized'))
  throw Error('STOP: production release candidate is partially patched');
 console.log('Production candidate is already complete; idempotent verification only');
 process.exit(0);
}
if(!s.includes("const CONTENTSCALE_BUILD_ID = '"+OLD+"';"))
 throw Error('STOP: source is not the expected production v567 build');
function once(a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('STOP: unexpected anchor count for '+label+': '+n);
 s=s.replace(a,b);
}
once("_csIds,['case_day_7_completed','case_day_14_completed','cycle_day_30_report']",
 "_csIds,['case_day_7_completed','case_day_14_completed','cycle_day_30_report','case_study_fresh_cycle_initialized']",
 'Case Study event list');
once('      _p.case_study=_cs||null;',
 '      _p.case_study=_cs||null;\n      _p.case_study_fresh_cycle_initialized=!!(_cs&&_csmByCase.get(_cs.id)&&_csmByCase.get(_cs.id).case_study_fresh_cycle_initialized);',
 'frontend state enrichment');
function transform(a,b,fun,label){
 const i=s.indexOf(a),j=s.indexOf(b,i+a.length);
 if(i<0||j<=i)throw Error('STOP: cannot find '+label+' boundaries');
 let body=s.slice(i,j);
 const replace=(x,y,why)=>{if(body.split(x).length!==2)throw Error('STOP: '+label+' '+why+' no longer unique');body=body.replace(x,y)};
 body=fun(body,replace);
 s=s.slice(0,i)+body+s.slice(j);
}
transform('function _trackerNextActionState(','\nfunction _trackerImplementationCheckState(',(_body,replace)=>{
 const ui=[
 '  // First MANUAL scan of a freshly initialized Case Study, independent of scheduler.',
 '  var _caseBaselineAt=p.case_study&&p.case_study.baseline_locked&&p.case_study.baseline_at?new Date(p.case_study.baseline_at).getTime():0;',
 '  if(bool(p.case_study_active)&&bool(p.case_study_fresh_cycle_initialized)&&_caseBaselineAt>0&&',
 '      (!scanAt||scanAt<=_caseBaselineAt)&&!bool(p.monitoring_waiting_input)&&',
 '      !(publishedAt>_caseBaselineAt)&&!(verifiedAt>_caseBaselineAt)){',
 "    return {code:'SCAN',label:'CASE STUDY ACTIVE · FIRST MANUAL SCAN',detail:'The protected baseline is saved. Scan the live page once for this new revision. Automatic scans remain off.',color:'#86efac',border:'#16a34a',bg:'#052e16',button:'Scan current live page',buttonAction:'checkPage('+p.id+')'};",
 '  }',''].join('\n');
 replace('  if(personalSafetyStale){',ui+'  if(personalSafetyStale){','next-action branch');
 return _body;
},'NEXT ACTION');
transform("app.post('/api/tracker-client/:token/check/:pageId'","\n// Exact client-side scan status",(_body,replace)=>{
 const gate=[
 '    // Case Study start opens a protected new revision. Historical scans and Briefs',
 '    // do not block the first deliberate scan in this measured cycle.',
 '    let _caseFirstManualScan=false;',
 '    let _caseIsActive=false;',
 '    if(!page.monitoring_waiting_input){',
 "      const _publishedVersionType=Number(page.revision_cycle||1)>1?'published_implementation_r'+Number(page.revision_cycle):'published_implementation';",
 '      const _first=await pool.query('+String.fromCharCode(96)+'SELECT cs.baseline_at,',
 '        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,',
 '        (SELECT MAX(v.captured_at) FROM tracker_case_study_content_versions v',
 '          WHERE v.case_study_id=cs.id AND v.version_type=$3) AS current_revision_published_at,',
 '        EXISTS(SELECT 1 FROM tracker_case_study_events ev WHERE ev.case_study_id=cs.id',
 "          AND ev.event_type='case_study_fresh_cycle_initialized') AS fresh_cycle_initialized",
 '        FROM tracker_case_studies cs WHERE cs.tracker_client_id=$1 AND cs.tracker_page_id=$2',
 "        AND cs.status='active' AND cs.baseline_locked=TRUE ORDER BY cs.id DESC LIMIT 1"+String.fromCharCode(96)+",",
 '        [cr.rows[0].id,page.id,_publishedVersionType]);',
 '      const _row=_first.rows[0]||{};',
 '      _caseIsActive=!!_row.baseline_at;',
 "      const _base=Date.parse(_row.baseline_at||'')||0;",
 "      const _last=Date.parse(_row.latest_snapshot_at||'')||0;",
 "      const _impl=Date.parse(page.implementation_verified_at||'')||0;",
 '      const _publicationTimes=[page.brief_published_at,page.brief_published_confirmed_at,_row.current_revision_published_at];',
 "      const _publishedAfterBaseline=_publicationTimes.some(t=>(Date.parse(t||'')||0)>_base);",
 '      _caseFirstManualScan=!!(_base&&(!_last||_last<=_base)&&_row.fresh_cycle_initialized&&',
 '        !(_impl>_base)&&!_publishedAfterBaseline);',
 '    }',
 ''].join('\n');
 replace('    const normalScanGate=_trackerNormalScanGate(page);',
 gate+'    const normalScanGate=_trackerNormalScanGate(page);','first cycle eligibility');
 replace('if(!normalScanGate.allowed&&!page.monitoring_waiting_input){',
 'if(!normalScanGate.allowed&&!page.monitoring_waiting_input&&!_caseFirstManualScan){','server lock');
 replace('if(page.case_study_active&&page.manual_done&&!page.monitoring_waiting_input&&!_claimsFactsNewerThanBrief&&!_savedBriefSafetyStale){',
 'if(_caseIsActive&&page.manual_done&&!page.monitoring_waiting_input&&!_claimsFactsNewerThanBrief&&!_savedBriefSafetyStale&&!_caseFirstManualScan){',
 'historical Done lock');
 return _body;
},'manual POST endpoint');
once("const CONTENTSCALE_BUILD_ID = '"+OLD+"';","const CONTENTSCALE_BUILD_ID = '"+NEW+"';",'build ID');
once("  build: '"+OLD+"',","  build: '"+NEW+"',",'build identity');
if(!s.includes("_publishedAfterBaseline")||!s.includes('case_study_fresh_cycle_initialized')||s.includes('_csStagingStartupQuarantine'))
 throw Error('STOP: release invariants failed');
fs.writeFileSync(src,s);
console.log('Release candidate generated only in checked-out branch; no deployment, bytes='+Buffer.byteLength(s));
