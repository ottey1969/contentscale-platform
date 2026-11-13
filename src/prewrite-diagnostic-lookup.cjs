'use strict';
// Pre-Write: find the saved NOT PASSED diagnostic again (owner 2026-11-13: "Complete missing" was unavailable after a
// reload or deploy). The diagnostic is stored in prewrite_async_jobs; only its job id lived in the browser tab
// (sessionStorage). This returns the newest reusable diagnostic of this tracker for the same keyword and the same
// Network placement (or none), from the last 7 days, so the button works in a new tab too. Read-only.
const norm = v => String(v || '').normalize('NFKC').replace(/[​-‍﻿]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function registerPrewriteDiagnosticLookup(app, pool, { ensureTable = async () => {} } = {}) {
  app.get('/api/tracker-client/:token/prewrite-diagnostic-latest', async (req, res) => {
    try {
      const keyword = String(req.query.keyword || '').slice(0, 200), want = norm(keyword);
      if (!want) return res.json({ success: true, job_id: null });
      const pq = req.query.networkPlacement, placement = Number(Array.isArray(pq) ? pq[0] : pq || 0) || 0; // same param the api() helper adds
      await ensureTable();
      const q = await pool.query(`SELECT j.id, j.network_placement_id, j.request_json->>'keyword' AS keyword, j.completed_at
        FROM prewrite_async_jobs j JOIN tracker_clients c ON c.id=j.client_id
        WHERE c.token=$1 AND j.status='failed'
          AND (j.error_json ? 'brief' OR j.result_json ? 'brief')
          AND COALESCE(j.completed_at, j.updated_at, j.created_at) > NOW() - INTERVAL '7 days'
        ORDER BY COALESCE(j.completed_at, j.updated_at, j.created_at) DESC LIMIT 25`, [req.params.token]);
      const hit = (q.rows || []).find(r => norm(r.keyword) === want && (placement > 0 ? Number(r.network_placement_id || 0) === placement : !Number(r.network_placement_id || 0)));
      res.set('Cache-Control', 'no-store').json({ success: true, job_id: hit ? hit.id : null, completed_at: hit ? hit.completed_at : null });
    } catch (e) { res.status(200).json({ success: false, job_id: null }); }
  });
}
module.exports = { registerPrewriteDiagnosticLookup, norm };
