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
  const clientOld="SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)";
  const clientNew="SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status NOT IN ('deleted','paused','disabled'))";
  // Keep same parameterized $2 exclusion; use explicit states through SQL instead of raw interpolation.
  let next=old.replace(
    "const cr = await pool.query('"+clientOld+"', [req.params.token, 'deleted']);",
    "const cr = await pool.query(\""+clientNew+"\", [req.params.token]);"
  );
  assert(next!==old,'Client auth guard changed');
  if(route.includes(':pageId')){
    const before="await pool.query('UPDATE tracker_pages SET manual_done=$1, manual_done_at=' + (on ? 'NOW()' : 'NULL') + ' WHERE id=$2', [on, req.params.pageId]);";
    const after=[
      "await pool.query(",
      "  'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE id=$2 AND tracker_client_id=$3 AND manual_done IS DISTINCT FROM $1',",
      "  [on, req.params.pageId, cr.rows[0].id]",
      ");"
    ].join('\n    ');
    assert(next.includes(before),'single-page query has changed');
    next=next.replace(before,after);
  }else{
    const before="'UPDATE tracker_pages SET manual_done=$1, manual_done_at=' + (on ? 'NOW()' : 'NULL') + ' WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL)'";
    const after="'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL) AND manual_done IS DISTINCT FROM $1'";
    assert(next.includes(before),'bulk query has changed');
    next=next.replace(before,after);
  }
  assert.notEqual(next,old,'No-op patch');
  s=s.slice(0,at)+next+s.slice(close+4);
  touched++;
}
assert.equal(touched,2);
const output=process.argv[3]||'/tmp/contentscale-staging-tracker-patched.js';
fs.writeFileSync(output,s);
console.log(JSON.stringify({result:'patched_staging_candidate_only',source:input,output,handlers:touched,source_bytes:Buffer.byteLength(s)}));
