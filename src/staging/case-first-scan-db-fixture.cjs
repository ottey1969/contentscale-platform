'use strict';
// Read-only SQL fixture for the isolated Neon synthetic Case Study branch.
// Run manually against a COPY / synthetic branch; never against production.
// Do not import the canonical server, dispatch scans, or write to the DB.
const ELIGIBILITY_SQL=String.raw`
SELECT cs.id AS case_id, cs.status, cs.baseline_locked,
  cs.baseline_at,
  (SELECT MAX(s.checked_at) FROM tracker_snapshots s
    WHERE s.page_id=cs.tracker_page_id) AS latest_snapshot_at,
  EXISTS(SELECT 1 FROM tracker_case_study_events ev
    WHERE ev.case_study_id=cs.id
    AND ev.event_type='case_study_fresh_cycle_initialized') AS fresh_cycle_initialized,
  p.manual_done, p.check_frequency,
  p.brief_published_at, p.implementation_verified_at
FROM tracker_case_studies cs
JOIN tracker_pages p ON p.id=cs.tracker_page_id
WHERE cs.status='active' AND cs.baseline_locked=TRUE
ORDER BY cs.id DESC
LIMIT 1
`;
function decideReadOnly(row){
 if(!row||row.status!=='active'||row.baseline_locked!==true)return 'blocked_invalid_case';
 if(row.fresh_cycle_initialized!==true)return 'blocked_uninitialized_cycle';
 const base=Date.parse(row.baseline_at||''),snap=Date.parse(row.latest_snapshot_at||'');
 if(!Number.isFinite(base))return 'blocked_missing_baseline';
 if(Number.isFinite(snap)&&snap>base)return 'blocked_already_scanned_after_baseline';
 for(const k of ['brief_published_at','implementation_verified_at']){
  const n=Date.parse(row[k]||'');
  if(Number.isFinite(n)&&n>base)return 'blocked_newer_revision';
 }
 return 'eligible_first_manual_scan';
}
module.exports={ELIGIBILITY_SQL,decideReadOnly};
