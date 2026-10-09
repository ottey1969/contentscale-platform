'use strict';
// First staging deployment ONLY. Does not import src/index.js or Network or any scanner.
const http = require('node:http');
const { assertPreflightEnvironment } = require('./safety-gate.cjs');
const EXPECTED = Object.freeze({ tables: 24, columns: 496, foreign_keys: 23, indexes: 53 });
async function readOnlyDatabaseCheck(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const r = await client.query(`SELECT current_database() AS database_name,
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
      (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public') AS columns,
      (SELECT COUNT(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f') AS foreign_keys,
      (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public') AS indexes`);
    const got = r.rows[0];
    if (got.database_name !== 'neondb' || Object.keys(EXPECTED).some(k => Number(got[k]) !== EXPECTED[k])) {
      throw new Error('STAGING BLOCKED: schema mismatch (expected 24/496/23/53)');
    }
    for (const n of ['tracker_clients', 'tracker_pages', 'tracker_snapshots', 'tracker_case_studies', 'tracker_workflow_events', 'tracker_workflow_client_events', 'tracker_workflow_sitemap_events']) {
      const exists = await client.query('SELECT to_regclass($1) AS table_name', ['public.' + n]);
      if (!exists.rows[0].table_name) throw new Error('STAGING BLOCKED: missing required table ' + n);
    }
    // All 24 tables must still be devoid of real data. No customer records copied.
    const names = await client.query(`SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    for (const row of names.rows) {
      const ident = String(row.table_name);
      if (!/^[a-z0-9_]+$/.test(ident)) throw new Error('STAGING BLOCKED: unexpected table identifier');
      const data = await client.query('SELECT EXISTS(SELECT 1 FROM public."' + ident + '" LIMIT 1) AS any_data');
      if (data.rows[0].any_data) throw new Error('STAGING BLOCKED: staging table contains data: ' + ident);
    }
    await client.query('COMMIT');
    return { ...EXPECTED, empty: true, app_started: false, providers_disabled: true, status: 'schema_verified_only' };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally { client.release(); }
}
async function main(env = process.env, deps = {}) {
  assertPreflightEnvironment(env);
  // Do not connect unless static environment checks succeeded.
  const Pool = deps.Pool || require('pg').Pool;
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000 });
  let verified;
  try { verified = await readOnlyDatabaseCheck(pool); } finally { await pool.end(); }
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' || req.url !== '/__staging/health') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({error: 'staging preflight only'}));
      return;
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({success: true, environment: 'staging', ...verified}));
  });
  const p = Number(env.PORT || 3000);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Invalid port');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(p, '0.0.0.0', resolve); });
  console.log('[STAGING-PREFLIGHT] Schema validated; existing app NOT started; no email, AI, Network, scans, webhooks, or migrations.');
  return { server, checked: verified };
}
if (require.main === module) {
  main().catch(err => {
    console.error('[STAGING-PREFLIGHT] REFUSED:', err.message); // Never log connection string.
    process.exitCode = 1;
  });
}
module.exports = { main, readOnlyDatabaseCheck, EXPECTED };
