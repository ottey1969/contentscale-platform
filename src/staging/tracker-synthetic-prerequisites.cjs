'use strict';
// Observes only structural PostgreSQL catalog metadata in the isolated staging DB.
// No customer rows, application imports, migrations, DML, or provider calls.
const { TRACKER_TABLES } = require('./tracker-readonly.cjs');
const TABLE_METADATA_SQL = String.raw`
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       (SELECT COUNT(*)::int FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS non_internal_triggers,
       (SELECT COUNT(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       (SELECT COUNT(*)::int FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = '') AS mandatory_columns_without_default,
       (SELECT COUNT(*)::int FROM pg_constraint f
        WHERE f.conrelid = c.oid AND f.contype = 'f') AS outgoing_foreign_keys
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
ORDER BY c.relname
`;
async function inspectSyntheticTestPrerequisites(pool) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    const response = await client.query(TABLE_METADATA_SQL, [TRACKER_TABLES]);
    const rows = response.rows || [];
    if (rows.length !== TRACKER_TABLES.length ||
        rows.some(row => !TRACKER_TABLES.includes(row.table_name)) ||
        new Set(rows.map(row => row.table_name)).size !== TRACKER_TABLES.length) {
      throw new Error('STAGING BLOCKED: incomplete canonical Tracker catalog');
    }
    let customTriggers = 0, rlsTables = 0, requiredFields = 0, foreignKeys = 0;
    for (const row of rows) {
      for (const column of ['non_internal_triggers','mandatory_columns_without_default','outgoing_foreign_keys']) {
        if (!Number.isSafeInteger(Number(row[column])) || Number(row[column]) < 0) {
          throw new Error('STAGING BLOCKED: invalid catalog metadata');
        }
      }
      customTriggers += Number(row.non_internal_triggers);
      requiredFields += Number(row.mandatory_columns_without_default);
      foreignKeys += Number(row.outgoing_foreign_keys);
      if (row.rls_enabled === true || row.force_rls === true || Number(row.policies) > 0) rlsTables += 1;
    }
    await client.query('ROLLBACK');
    inTransaction = false;
    return Object.freeze({
      status: 'synthetic_test_schema_review_only',
      canonical_tracker_tables: TRACKER_TABLES.length,
      non_internal_triggers: customTriggers,
      tables_with_row_level_security_or_policies: rlsTables,
      mandatory_columns_without_default: requiredFields,
      outgoing_foreign_keys: foreignKeys,
      automatic_synthetic_write_approved: false,
      rollback_write_test_performed: false,
      writes_performed: false,
      app_started: false,
      requires_manual_review: true
    });
  } catch (err) {
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch (_) {} }
    throw new Error('STAGING BLOCKED: synthetic prerequisites could not be inspected', { cause: err });
  } finally { client.release(); }
}
module.exports = { TABLE_METADATA_SQL, inspectSyntheticTestPrerequisites };
