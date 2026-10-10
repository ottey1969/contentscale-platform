'use strict';
// Surgical, idempotent transformation of the existing STAGING canonical index.
// Refuses other builds; never imports ContentScale, providers, DB or network modules.
const fs=require('node:fs'),path=require('node:path');
const from=path.resolve(process.argv[2]||'src/index.js'),to=path.resolve(process.argv[3]||'/tmp/contentscale-case-publication-guard.cjs');
let s=fs.readFileSync(from,'utf8');
if(!s.startsWith("require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);")||Buffer.byteLength(s)<6000000)
  throw Error('STOP: staging source or boot fence unexpected');
const a=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId'"),b=s.indexOf("\n// Exact client-side scan status",a);
if(a<0||b<a||b-a>22000)throw Error('STOP: canonical route boundary changed');
let body=s.slice(a,b);
if(!body.includes('_caseFirstManualScan')||!body.includes('case_study_fresh_cycle_initialized'))
  throw Error('STOP: Case Study first scan invariant missing');
function one(oldText,newText){
 if(body.includes(newText))return;
 if(body.split(oldText).length!==2)throw Error('STOP: missing/duplicate publication guard anchor');
 body=body.replace(oldText,newText);
}
one("      const _first=await pool.query("+String.fromCharCode(96)+"SELECT cs.baseline_at,",
"      const _publishedVersionType=Number(page.revision_cycle||1)>1?'published_implementation_r'+Number(page.revision_cycle):'published_implementation';\n      const _first=await pool.query("+String.fromCharCode(96)+"SELECT cs.baseline_at,");
one("        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,",
"        (SELECT MAX(s.checked_at) FROM tracker_snapshots s WHERE s.page_id=$2) AS latest_snapshot_at,\n        (SELECT MAX(v.captured_at) FROM tracker_case_study_content_versions v\n          WHERE v.case_study_id=cs.id AND v.version_type=$3) AS current_revision_published_at,");
one("        [cr.rows[0].id,page.id]);","        [cr.rows[0].id,page.id,_publishedVersionType]);");
one("      const _published=Date.parse(page.brief_published_at||'')||0;\n      _caseFirstManualScan=!!(_base&&(!_last||_last<=_base)&&_row.fresh_cycle_initialized&&\n        !(_impl>_base)&&!(_published>_base));",
"      const _publicationTimes=[page.brief_published_at,page.brief_published_confirmed_at,_row.current_revision_published_at];\n      const _publishedAfterBaseline=_publicationTimes.some(t=>(Date.parse(t||'')||0)>_base);\n      // Same current-revision publication truth as Tracker dashboard.\n      _caseFirstManualScan=!!(_base&&(!_last||_last<=_base)&&_row.fresh_cycle_initialized&&\n        !(_impl>_base)&&!_publishedAfterBaseline);");
if(!body.includes("AS current_revision_published_at,")||!body.includes("_publishedAfterBaseline"))
 throw Error('STOP: publication guard missing after patch');
s=s.slice(0,a)+body+s.slice(b);
if(!s.includes('const _csStagingStartupQuarantine')||!s.includes("assertAppBootEnvironment(process.env)"))
 throw Error('STOP: staging isolation markers missing');
fs.writeFileSync(to,s);
console.log('[CASE-PUBLICATION-GUARD] prepared; no deployment, no app boot, no database writes');
