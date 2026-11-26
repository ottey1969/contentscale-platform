'use strict';

async function ensureMonitoringSchedule(pool) {
  await pool.query('ALTER TABLE network_placements ADD COLUMN IF NOT EXISTS monitoring_due_at TIMESTAMPTZ');
}

async function runNetworkPublicationMonitoring({ pool, check, limit = 10 }) {
  const result = { checked: 0, deferred: 0 };
  for (let i = 0; i < limit; i++) {
    const { rows: [placement] } = await pool.query(`WITH due AS (
      SELECT id FROM network_placements
      WHERE status='verified' AND verified_at IS NOT NULL AND NULLIF(published_url,'') IS NOT NULL
        AND GREATEST(monitoring_due_at,verified_at+INTERVAL '24 hours')<=NOW()
      ORDER BY GREATEST(monitoring_due_at,verified_at+INTERVAL '24 hours'),id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE network_placements p SET monitoring_due_at=NOW()+INTERVAL '15 minutes'
      FROM due WHERE p.id=due.id RETURNING p.id,p.monitoring_due_at::text AS lease`);
    if (!placement) break;
    try {
      const observed = await check(placement.id, { lease: placement.lease });
      if (observed.status === 200) result.checked++;
      else result.deferred++;
    } catch (error) {
      result.deferred++;
      console.warn('[network-monitoring] check deferred', error.code || error.name);
    }
  }
  return result;
}

module.exports = { ensureMonitoringSchedule, runNetworkPublicationMonitoring };
