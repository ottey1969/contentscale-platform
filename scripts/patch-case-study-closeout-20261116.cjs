'use strict';
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
let s=fs.readFileSync(file,'utf8'),count=0;
function once(before,after){
 const i=s.indexOf(before);
 if(i<0||s.indexOf(before,i+1)>=0)throw Error('Expected one exact occurrence: '+before.slice(0,95));
 s=s.slice(0,i)+after+s.slice(i+before.length);count++;
}
once("  _caseStudySchemaReady=true;\n}\n// Clears a day-7/day-14 Case Study evidence checkpoint;",
`  // Closeout survives reload, scheduled jobs and previously open browser tabs.
  await pool.query('ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS case_study_ended_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS case_study_scan_authorized_at TIMESTAMPTZ');
  _caseStudySchemaReady=true;
}
// Clears a day-7/day-14 Case Study evidence checkpoint;`);
once("      ,['monitoring_waiting_input','BOOLEAN NOT NULL DEFAULT FALSE']",`      ,['case_study_ended_at','TIMESTAMPTZ']
      ,['case_study_scan_authorized_at','TIMESTAMPTZ']
      ,['monitoring_waiting_input','BOOLEAN NOT NULL DEFAULT FALSE']`);
once("p.is_done, p.manual_done, p.manual_done_at, p.fetch_reliable, p.check_frequency, p.email_reminders",
"p.is_done, p.manual_done, p.manual_done_at, p.fetch_reliable, p.check_frequency, p.case_study_ended_at,p.case_study_scan_authorized_at,p.email_reminders");
once("    await conn.query(_CASE_STUDY_GATE_CLEAR_SQL,[[page.id]]);\n    for(const id of ids)",
`    await conn.query(_CASE_STUDY_GATE_CLEAR_SQL,[[page.id]]);
    // End every scheduled/checkpoint wait, without altering the immutable baseline, Brief, snapshots or HTML.
    closed=(await conn.query(\`UPDATE tracker_pages SET
      case_study_ended_at=NOW(),case_study_scan_authorized_at=NULL,
      check_frequency='0',next_check_at=NULL,email_reminders=FALSE,next_ai_reminder_at=NULL,
      monitoring_waiting_input=FALSE,monitoring_gate_label=NULL,
      monitoring_request_at=NULL,monitoring_reminder_sent_at=NULL
      WHERE id=$1 AND tracker_client_id=$2 RETURNING case_study_ended_at\`,
      [page.id,cr.rows[0].id])).rows[0];
    for(const id of ids)`);
once("  const conn=await pool.connect();\n  try{\n    await conn.query('BEGIN');\n    await conn.query(\"UPDATE tracker_case_studies SET status='completed'",
`  const conn=await pool.connect();
  let closed;
  try{
    await conn.query('BEGIN');
    await conn.query("UPDATE tracker_case_studies SET status='completed'`);
once("reason,ended_by:'tracker_owner',baseline_preserved:true,history_preserved:true,new_case_study_needs_new_baseline:true",
"reason,ended_at:closed.case_study_ended_at,ended_by:'tracker_owner',monitoring_stopped:true,scan_consent_required:true,baseline_preserved:true,history_preserved:true,new_case_study_needs_new_baseline:true");
once("  res.json({success:true,ended:ids.length,message:'Case Study ended. The baseline, evidence and report are kept. Growth can now prepare a CMS package for this page; nothing is published automatically. You can start a new Case Study for this page later; it gets a new baseline.'});",
`  res.json({success:true,ended:ids.length,ended_at:closed.case_study_ended_at,scan_permission_required:true,
    message:'Case Study ended on '+new Date(closed.case_study_ended_at).toISOString()+'. Monitoring and scan schedules are stopped. Baseline, evidence and report are saved. Any new manual scan requires separate owner permission.'});`);
once("app.post('/api/tracker-client/:token/pages/:pageId/case-study/new-revision'",
`// Explicit approval for ONE new manual scan after the case is closed. It never schedules scanning.
app.post('/api/tracker-client/:token/pages/:pageId/case-study/authorize-scan',async(req,res)=>{try{
  if(req.body?.confirm!=='AUTHORIZE_ONE_SCAN')return res.status(400).json({success:false,error:'Explicit approval required'});
  const cr=await pool.query("SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted')",[req.params.token]);
  if(!cr.rows.length)return res.status(404).json({success:false,error:'Tracker not found'});
  await _ensureCaseStudySchema();
  const page=(await pool.query('SELECT id,url,case_study_ended_at FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2',
    [cr.rows[0].id,req.params.pageId])).rows[0];
  if(!page)return res.status(404).json({success:false,error:'Page not found'});
  if(!page.case_study_ended_at)return res.status(409).json({success:false,error:'No ended Case Study for this page'});
  const active=(await pool.query("SELECT id,tracker_page_id,canonical_url FROM tracker_case_studies WHERE tracker_client_id=$1 AND status='active'",
    [cr.rows[0].id])).rows.some(x=>Number(x.tracker_page_id)===Number(page.id)||_caseStudyNormUrl(x.canonical_url)===_caseStudyNormUrl(page.url));
  if(active)return res.status(409).json({success:false,error:'An active Case Study protects this page'});
  const authorized=(await pool.query(\`UPDATE tracker_pages SET case_study_scan_authorized_at=NOW()
    WHERE tracker_client_id=$1 AND id=$2 AND case_study_ended_at IS NOT NULL
    RETURNING case_study_scan_authorized_at\`,[cr.rows[0].id,page.id])).rows[0];
  return res.json({success:true,one_manual_scan_authorized:true,authorized_at:authorized.case_study_scan_authorized_at,
    message:'One manual scan authorized. Monitoring stays off. No scan has started.'});
}catch(e){console.error('[case-study-scan-consent]',e.message);return res.status(500).json({success:false,error:'Scan authorization could not be saved'});}});
app.post('/api/tracker-client/:token/pages/:pageId/case-study/new-revision'`);
once("  if(!page)return {allowed:false,reason:'Page not found'};\n  if(b(page.monitoring_waiting_input))",
`  if(!page)return {allowed:false,reason:'Page not found'};
  // Bulk scanning must never use a one-time manual consent.
  if(page.case_study_ended_at)return {allowed:false,reason:'Case Study ended; a new scan needs separate, owner-authorized manual consent'};
  if(b(page.monitoring_waiting_input))`);
once("    page.claims_facts_updated_at=cr.rows[0].claims_facts_updated_at||null;\n    let _caseFirstManualScan=false;",
`    page.claims_facts_updated_at=cr.rows[0].claims_facts_updated_at||null;
    const _endedCase=!!page.case_study_ended_at;
    if(_endedCase&&!page.case_study_scan_authorized_at){
      return res.status(409).json({success:false,code:'CASE_STUDY_SCAN_REAUTHORIZATION_REQUIRED',
        scan_permission_required:true,error:'Case Study ended on '+new Date(page.case_study_ended_at).toISOString()+'. Authorize one new manual scan first.'});
    }
    let _caseFirstManualScan=false;`);
once("    if(!normalScanGate.allowed&&!page.monitoring_waiting_input&&!_caseFirstManualScan){",
"    if(!normalScanGate.allowed&&!page.monitoring_waiting_input&&!_caseFirstManualScan&&!_endedCase){");
once("    if (existing && existing.running) return res.json({ success: true, message: 'Already running', page_id: pageId, already_running: true });\n\n    // Initialize status",
`    if (existing && existing.running) return res.json({ success: true, message: 'Already running', page_id: pageId, already_running: true });
    if(_endedCase){
      const consumed=await pool.query(\`UPDATE tracker_pages SET case_study_scan_authorized_at=NULL
        WHERE id=$1 AND tracker_client_id=$2 AND case_study_scan_authorized_at=$3
        RETURNING id\`,[page.id,cr.rows[0].id,page.case_study_scan_authorized_at]);
      if(!consumed.rows.length)return res.status(409).json({success:false,code:'CASE_STUDY_SCAN_REAUTHORIZATION_REQUIRED',
        scan_permission_required:true,error:'The authorization has already been used; explicitly authorize another scan.'});
    }
    // Initialize status`);
once("  await pool.query(`UPDATE tracker_pages SET check_frequency=$1,email_reminders=$2,ai_reminder_days=$3,",
"  await pool.query(`UPDATE tracker_pages SET case_study_ended_at=NULL,case_study_scan_authorized_at=NULL,check_frequency=$1,email_reminders=$2,ai_reminder_days=$3,");
once("    var _csr=p.case_study_readiness||{},_csReady=!!_csr.ready,_csMissing=Array.isArray(_csr.missing)?_csr.missing:[];",
`    var _csr=p.case_study_readiness||{},_csReady=!!_csr.ready,_csMissing=Array.isArray(_csr.missing)?_csr.missing:[];
    var _caseEnded=!isCaseStudy&&!!p.case_study_ended_at;
    var _caseEndedAt=_caseEnded?new Date(p.case_study_ended_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'';
    var _newCaseBaselineReady=_caseEnded&&_csReady&&!!p.last_checked_at&&new Date(p.last_checked_at)>new Date(p.case_study_ended_at);
    p.scan_permission_required=_caseEnded&&!p.case_study_scan_authorized_at;`);
once("    var _caseReadyHtml=!isCaseStudy?'<div",
`    var _caseReadyHtml=_caseEnded?'<div style="margin:8px 0;padding:10px;border:1px solid #64748b;border-radius:7px;background:#111827;color:#e2e8f0;font-size:11px;"><b>Case Study ended</b> · '+_caseEndedAt+'<div>Measurement, scheduling and evidence checkpoints stopped. Historical baseline and reports are preserved.</div><div style="color:#93c5fd;">'+(p.scan_permission_required?'Scan permission required before any new manual scan.':'One manual scan authorized; monitoring remains off.')+'</div></div>':!isCaseStudy?'<div`);
once("    var _hideManualScan = _correctionLoop;",
"    var _hideManualScan = _correctionLoop || _caseEnded;");
once("      + (_hideManualScan ? '' : (_disableManualScan",
`      + (_caseEnded ? (p.scan_permission_required
        ? '<button type="button" onclick="event.stopPropagation();authorizeCaseStudyScan('+p.id+')" style="background:#172554;border:1px solid #3b82f6;border-radius:7px;color:#bfdbfe;cursor:pointer;font-size:11px;padding:5px 10px;font-weight:800;">Authorize one scan</button>'
        : '<button type="button" onclick="event.stopPropagation();checkPage('+p.id+')" style="background:#052e16;border:1px solid #22c55e;border-radius:7px;color:#86efac;cursor:pointer;font-size:11px;padding:5px 10px;font-weight:800;">Scan once (authorized)</button>') : '')
      + (_hideManualScan ? '' : (_disableManualScan`);
once("      + (!p.case_study_active ? (_csReady?'<button onclick=",
`      + (!p.case_study_active && (!_caseEnded||_newCaseBaselineReady) ? (_csReady?'<button onclick=`);
once("function endCaseStudy(pageId){",
`function authorizeCaseStudyScan(pageId){
  var p=(_pages||[]).find(function(x){return Number(x.id)===Number(pageId);})||{};
  if(!p.case_study_ended_at)return;
  var day=new Date(p.case_study_ended_at).toLocaleString('en-GB');
  if(!confirm('The Case Study ended on '+day+'.\\n\\nAllow exactly ONE manual scan of '+(p.url||'this page')+'?\\n\\nMonitoring remains off. This does not restart the Case Study or change the historical baseline.'))return;
  api('/pages/'+pageId+'/case-study/authorize-scan','POST',{confirm:'AUTHORIZE_ONE_SCAN'}).then(function(d){
    if(!d||!d.success)throw new Error((d&&d.error)||'Permission not saved');
    if(typeof loadPages==='function')loadPages();
  }).catch(function(e){alert(e.message||'Could not authorize the scan');});
}
function endCaseStudy(pageId){`);
fs.writeFileSync(file,s);
console.log('Applied '+count+' controlled changes to canonical Tracker source');

// Feature-branch-only validation and controlled application.

// Regression range widened to include one-time atomic token consumption.
