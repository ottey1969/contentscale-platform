'use strict';
// Surgical, fail-closed patch generator for staging only. No app boot, DB or external calls.
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js';
let s=fs.readFileSync(input,'utf8');
const routes=[
  "/api/tracker-client/:token/pages/:pageId/manual-done",
  "/api/tracker-client/:token/pages/manual-done-all"
];
let touched=0;
for(const route of routes){
  const marker="app.patch('"+route+"', async (req, res) => {";
  const at=s.indexOf(marker);
  assert(at>=0&&s.indexOf(marker,at+marker.length)===-1,'Unique route required: '+route);
  const close=s.indexOf('\n});',at);
  assert(close>at&&close-at<2500,'Route boundary changed');
  const old=s.slice(at,close+4);
  if(old.includes('WITH changed AS (') && old.includes('INSERT INTO tracker_workflow_events')){
    assert(old.includes('manual_done IS DISTINCT FROM $1'),'Lost idempotency guard');
    continue;
  }
  const clientOld="SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)";
  const clientNew="SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status NOT IN ('deleted','paused','disabled'))";
  // Keep same parameterized $2 exclusion; use explicit states through SQL instead of raw interpolation.
  const clientBefore = "const cr = await pool.query('"+clientOld+"', [req.params.token, 'deleted']);";
  const clientAfter = "const cr = await pool.query(\""+clientNew+"\", [req.params.token]);";
  let next=old;
  if(next.includes(clientBefore)) next=next.replace(clientBefore,clientAfter);
  else assert(next.includes(clientAfter),'Unexpected canonical client guard');
  if(route.includes(':pageId')){
    const before="await pool.query('UPDATE tracker_pages SET manual_done=$1, manual_done_at=' + (on ? 'NOW()' : 'NULL') + ' WHERE id=$2', [on, req.params.pageId]);";
    const after=[
      "await pool.query(",
      "  'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE id=$2 AND tracker_client_id=$3 AND manual_done IS DISTINCT FROM $1',",
      "  [on, req.params.pageId, cr.rows[0].id]",
      ");"
    ].join('\n    ');
    if(next.includes(before)) next=next.replace(before,after);
    else assert(next.includes(after),'Unexpected single-page update statement');
  }else{
    const before="'UPDATE tracker_pages SET manual_done=$1, manual_done_at=' + (on ? 'NOW()' : 'NULL') + ' WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL)'";
    const after="'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL) AND manual_done IS DISTINCT FROM $1'";
    if(next.includes(before)) next=next.replace(before,after);
    else assert(next.includes(after),'Unexpected bulk update statement');
  }
  if(next!==old) touched++;
  s=s.slice(0,at)+next+s.slice(close+4);
}
assert(touched===0||touched===2,'Refuse partially patched canonical source');
const output=process.argv[3]||'/tmp/contentscale-staging-tracker-patched.js';
fs.writeFileSync(output,s);
console.log(JSON.stringify({result: touched===0 ? 'already_patched' : 'patched_staging_candidate_only',source:input,output,handlers:touched,source_bytes:Buffer.byteLength(s)}));
