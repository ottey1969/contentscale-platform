'use strict';
// Staging-only, read-only observation of the existing canonical Tracker schema.
// No application imports, writes, customer records, schedulers, or provider calls.
const TRACKER_TABLES = Object.freeze([
  'tracker_clients',
  'tracker_pages',
  'tracker_snapshots',
  'tracker_case_studies',
  'tracker_workflow_events',
  'tracker_workflow_client_events',
  'tracker_workflow_sitemap_events'
]);
async function readOnlyTrackerCheck(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let tablesVerified = 0;
    for (const name of TRACKER_TABLES) {
      // Identifiers are hardcoded, not constructed from untrusted input.
      const columns = await client.query("SELECT COUNT(*)::int AS total FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [name]);
      const columnCount = Number(columns.rows[0]?.total);
      if (!Number.isSafeInteger(columnCount) || columnCount < 1) {
        throw new Error('STAGING BLOCKED: Tracker schema missing ' + name);
      }
      const counts = await client.query('SELECT COUNT(*)::int AS total FROM public."' + name + '"');
      const rows = Number(counts.rows[0]?.total);
      if (!Number.isSafeInteger(rows) || rows !== 0) {
        throw new Error('STAGING BLOCKED: expected empty Tracker table ' + name);
      }
      tablesVerified += 1;
    }
    await client.query('COMMIT');
    return {
      status: 'tracker_schema_verified_readonly',
      checked_at: new Date().toISOString(),
      canonical_tracker_tables: tablesVerified,
      records_total: 0,
      app_started: false,
      workflow_execution_enabled: false,
      side_effects_disabled: true
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}
module.exports = { TRACKER_TABLES, readOnlyTrackerCheck };
