'use strict';
// Surgical source transform only: a first Case Study scan MUST be based on verified fresh live HTML.
// Cached historical HTML remains available for other Tracker scans and is never deleted.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let src=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(src)<6000000)throw Error('STOP: incomplete canonical ContentScale source');
const routeA=src.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const routeB=src.indexOf('\n// Exact client-side scan status',routeA);
const scanA=src.indexOf('async function runTrackerCheck(');
const scanB=src.indexOf('\n// ── Custom news management',scanA);
if(routeA<0||routeB<routeA||routeB-routeA>23000||scanA<0||scanB<scanA||scanB-scanA>350000)
 throw Error('STOP: canonical route or scanner bounds changed');
let route=src.slice(routeA,routeB),scanner=src.slice(scanA,scanB);
const flag='    page._caseStudyFirstManualScan = _caseFirstManualScan;';
if(!route.includes(flag)){
 const marker='    page._manual_requested = true;';
 if(route.split(marker).length!==2)throw Error('STOP: first manual scan route request anchor drift');
 route=route.replace(marker,flag+'\n'+marker);
}
const guard=[
'  // A first Case Study scan must prove the CURRENT live HTML. Historical cache is not proof.',
"  if(page._caseStudyFirstManualScan && (!fetchReliable || htmlSource !== 'live_fresh')) {",
"    throw new Error('CASE_FIRST_LIVE_NOT_VERIFIED: Live HTML was unavailable or unreliable. Historical HTML and baseline remain protected; retry this manual scan when the live page responds.');",
'  }',
''
].join('\n');
if(!scanner.includes('CASE_FIRST_LIVE_NOT_VERIFIED:')){
 const marker='  // Hash altijd berekenen over de HTML die we gaan analyseren';
 if(scanner.split(marker).length!==2)throw Error('STOP: fresh HTML integrity anchor drift');
 scanner=scanner.replace(marker,guard+marker);
}
if(!route.includes(flag)||!scanner.includes('CASE_FIRST_LIVE_NOT_VERIFIED:'))throw Error('STOP: fresh Case Study verification incomplete');
const catchOld="        const _schemaFailure=String(e&&e.message||'').startsWith('TRACKER SCAN BLOCKED: database schema is incomplete:');";
const catchNew=catchOld+"\n        const _liveFailure=String(e&&e.message||'').startsWith('CASE_FIRST_LIVE_NOT_VERIFIED:');";
if(!route.includes('_liveFailure=')){
 if(route.split(catchOld).length!==2)throw Error('STOP: manual scan failure anchor drift');
 route=route.replace(catchOld,catchNew);
}
const msgOld="        const _safeError=_schemaFailure?'The Tracker schema is not ready for this scan. No new result was verified.':'The scan did not complete. Check the page status before retrying.';";
const msgNew="        const _safeError=_schemaFailure?'The Tracker schema is not ready for this scan. No new result was verified.':_liveFailure?'Current live HTML could not be verified. The Case Study baseline and history are unchanged. Retry the manual scan later.':'The scan did not complete. Check the page status before retrying.';";
if(!route.includes(msgNew)){
 if(route.split(msgOld).length!==2)throw Error('STOP: scanner error feedback anchor drift');
 route=route.replace(msgOld,msgNew);
}
const codeOld="error_code=_schemaFailure?'SCHEMA_NOT_READY':'SCAN_FAILED';";
const codeNew="error_code=_schemaFailure?'SCHEMA_NOT_READY':_liveFailure?'LIVE_HTML_NOT_VERIFIED':'SCAN_FAILED';";
if(!route.includes(codeNew)){
 if(route.split(codeOld).length!==2)throw Error('STOP: scanner error code anchor drift');
 route=route.replace(codeOld,codeNew);
}
src=src.slice(0,routeA)+route+src.slice(routeB);
const scanNextA=src.indexOf('async function runTrackerCheck(');
const scanNextB=src.indexOf('\n// ── Custom news management',scanNextA);
src=src.slice(0,scanNextA)+scanner+src.slice(scanNextB);
fs.writeFileSync(file,src);
console.log('Case Study first scan requires verified fresh live HTML; cache, baseline and history stay protected.');
