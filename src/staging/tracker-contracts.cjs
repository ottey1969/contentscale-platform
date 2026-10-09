'use strict';
/**
 * ContentScale Tracker staging, phase 2: schema/query-shape verification ONLY.
 * Uses the existing canonical Tracker tables. Does not import the application,
 * start schedulers, mutate data, execute scans, or access external providers.
 */
const CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'client_page_identity',
    sql: `EXPLAIN SELECT c.id, c.domain, c.status, p.id AS page_id, p.url
          FROM public.tracker_clients c
          LEFT JOIN public.tracker_pages p ON p.tracker_client_id = c.id
          LIMIT 0`
  }),
  Object.freeze({
    id: 'latest_snapshot_relationship',
    sql: `EXPLAIN SELECT p.id, s.checked_at, s.score
          FROM public.tracker_pages p
          LEFT JOIN LATERAL (
            SELECT checked_at, score
            FROM public.tracker_snapshots
            WHERE page_id = p.id
            ORDER BY checked_at DESC, id DESC LIMIT 1
          ) s ON TRUE LIMIT 0`
  }),
  Object.freeze({
    id: 'case_study_identity',
    sql: `EXPLAIN SELECT cs.id, cs.status, c.id AS client_id, p.id AS page_id
          FROM public.tracker_case_studies cs
          JOIN public.tracker_pages p ON p.id = cs.tracker_page_id
          JOIN public.tracker_clients c ON c.id = cs.tracker_client_id
          LIMIT 0`
  }),
  Object.freeze({
    id: 'workflow_event_tables',
    sql: `EXPLAIN SELECT
            (SELECT COUNT(*) FROM public.tracker_workflow_events) AS page_events,
            (SELECT COUNT(*) FROM public.tracker_workflow_client_events) AS client_events,
            (SELECT COUNT(*) FROM public.tracker_workflow_sitemap_events) AS sitemap_events`
  })
]);

/** Only EXPLAIN (never ANALYZE). Transaction is strictly READ ONLY. */
async function verifyTrackerContracts(pool) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    for (const contract of CONTRACTS) await client.query(contract.sql);
    // Roll back even though EXPLAIN without ANALYZE never executes writes.
    await client.query('ROLLBACK');
    inTransaction = false;
    return Object.freeze(CONTRACTS.map(({ id }) => Object.freeze({ id, status: 'verified' })));
  } catch (err) {
    // Never log the SQL error or connection string to public output.
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch (_) {} }
    throw new Error('STAGING BLOCKED: canonical Tracker query contract failed', { cause: err });
  } finally {
    client.release();
  }
}
module.exports = { CONTRACTS, verifyTrackerContracts };
