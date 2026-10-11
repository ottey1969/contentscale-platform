'use strict';
// Source-only, fail-closed, idempotent. No ContentScale imports, database or provider access.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let s=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(s)<6000000)throw Error('STOP: incomplete canonical source');
const a=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const b=s.indexOf('\n// GET /track/:token — client tracker page',a);
if(a<0||b<a||b-a>25000)throw Error('STOP: scan and status route markers drifted');
let body=s.slice(a,b);
function once(oldText,newText,label){
 if(body.includes(newText))return;
 if(body.split(oldText).length!==2)throw Error('STOP: '+label+' changed');
 body=body.replace(oldText,newText);
}
once("_trackerCheckStatus.set(pageId, { running: true, steps: [], startedAt: new Date().toISOString(), finishedAt: null, url: page.url });",
 "_trackerCheckStatus.set(pageId, { running: true, steps: [], startedAt: new Date().toISOString(), finishedAt: null, failed: false, error_code: null, error: null, url: page.url });",
 'status initialization');
const catchOld="      } catch(e) {\n        console.warn('[client-check]', e.message);\n        if(page._completed_monitoring_gate)";
const catchNew="      } catch(e) {\n        console.warn('[client-check]', e.message);\n        const _failedStatus=_trackerCheckStatus.get(pageId);\n        const _schemaFailure=String(e&&e.message||'').startsWith('TRACKER SCAN BLOCKED: database schema is incomplete:');\n        const _safeError=_schemaFailure?'The Tracker schema is not ready for this scan. No new result was verified.':'The scan did not complete. Check the page status before retrying.';\n        if(_failedStatus){_failedStatus.failed=true;_failedStatus.error_code=_schemaFailure?'SCHEMA_NOT_READY':'SCAN_FAILED';_failedStatus.error=_safeError;}\n        _sseBroadcast({type:'check_error',pageId,domain,url:page.url,error:_safeError,ts:new Date().toISOString()});\n        if(page._completed_monitoring_gate)";
// The stricter live-HTML first-scan guard extends this exact failure handler.
// It is already fully installed and must not be rewritten on the second pass.
const liveVariant=body.includes("const _liveFailure=String(e&&e.message||'').startsWith('CASE_FIRST_LIVE_NOT_VERIFIED:');")
  &&body.includes("error_code=_schemaFailure?'SCHEMA_NOT_READY':_liveFailure?'LIVE_HTML_NOT_VERIFIED':'SCAN_FAILED';")
  &&body.includes("Current live HTML could not be verified.");
if(!liveVariant)once(catchOld,catchNew,'failure recording');
once("        // Broadcast completion\n        try {\n          const snap2 = await pool.query(",
 "        // Never announce success based on a stale historical snapshot after a failed scan.\n        if (!st || !st.failed) try {\n          const snap2 = await pool.query(",
 'stale snapshot success guard');
const statusOld="if (!state) return res.json({ success:true, running:false, steps:[], startedAt:null, finishedAt:null });\n    return res.json({ success:true, running:!!state.running, steps:state.steps||[], startedAt:state.startedAt||null, finishedAt:state.finishedAt||null });";
const statusNew="if (!state) return res.json({ success:true, running:false, failed:false, error_code:null, error:null, steps:[], startedAt:null, finishedAt:null });\n    return res.json({ success:true, running:!!state.running, failed:!!state.failed, error_code:state.error_code||null, error:state.error||null, steps:state.steps||[], startedAt:state.startedAt||null, finishedAt:state.finishedAt||null });";
once(statusOld,statusNew,'status endpoint');
s=s.slice(0,a)+body+s.slice(b);
const uiA=s.indexOf('function checkPage('),uiB=s.indexOf('\nasync function deletePage(',uiA);
if(uiA<0||uiB<uiA||uiB-uiA>300000)throw Error('STOP: client checkPage/poll bounds changed');
let ui=s.slice(uiA,uiB);
function replaceUi(oldText,newText,label){
 if(ui.includes(newText))return;
 if(ui.split(oldText).length!==2)throw Error('STOP: '+label+' UI anchor changed');
 ui=ui.replace(oldText,newText);
}
replaceUi("pollAndShowBrief(pageId, 30, 2000, function(){ delete _checkAnimations[pageId]; _finishSingleProven(true); if (_fullResolve) _fullResolve(); }, _scanStartedAt);",
 "pollAndShowBrief(pageId, 30, 2000, function(ok){ delete _checkAnimations[pageId]; _finishSingleProven(ok!==false); if (_fullResolve) _fullResolve(); }, _scanStartedAt);",
 'poll completion success state');
s=s.slice(0,uiA)+ui+s.slice(uiB);
const pollA=s.indexOf('function pollAndShowBrief('),pollB=s.indexOf('\n  function _isFinalBriefForScan(',pollA);
if(pollA<0||pollB<pollA||pollB-pollA>5000)throw Error('STOP: scan poll markers drifted');
ui=s.slice(pollA,pollB);
replaceUi("          if (onDone) onDone();\n        }).catch(function() { hideScanOverlay(); toast('Connection issue', '#f87171'); if (onDone) onDone(); });",
 "          if (onDone) onDone(!!(d2.success && d2.page && _isFinalBriefForScan(d2.page, scanStartedAt)));\n        }).catch(function() { hideScanOverlay(); toast('Connection issue', '#f87171'); if (onDone) onDone(false); });",
 'timeout reports result status');
replaceUi("        if (!finished || (scanStartedAt && finishedMs < scanStartedAt - 2000)) return;\n        api('/pages/' + pageId).then(function(d2) {",
 "        if (!finished || (scanStartedAt && finishedMs < scanStartedAt - 2000)) return;\n        if (st.failed) {\n          clearInterval(timer);\n          hideScanOverlay();\n          toast(st.error || 'Scan failed. Please review the current page status.', '#f87171');\n          if (onDone) onDone(false);\n          return;\n        }\n        api('/pages/' + pageId).then(function(d2) {",
 'failed poll message');
replaceUi("          openBriefFromPoll(d2.page);\n          if (onDone) onDone();",
 "          openBriefFromPoll(d2.page);\n          if (onDone) onDone(true);",
 'successful final brief');
s=s.slice(0,pollA)+ui+s.slice(pollB);
if(!s.includes('error_code=_schemaFailure')||!s.includes('if (st.failed) {')||!s.includes("if (!st || !st.failed) try {"))throw Error('STOP: incomplete failure handling');
fs.writeFileSync(file,s);
console.log('Canonical Case Study scan failure exposed safely; stale success suppressed; polling reports failed status');
